import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { imageJobErrorMessage, normalizeImageJobStatusUrl } from '../story-library-utils.mjs';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const from = app.indexOf('async function waitForStoryImageJob(');
const to = app.indexOf('\nasync function downloadStoryImage(', from);
assert.ok(from > 0 && to > from);
const poller = app.slice(from, to);

function runStatus(data, status = 200) {
  const context = vm.createContext({
    imageJobErrorMessage, normalizeImageJobStatusUrl, Date, TypeError,
    fetchStoryResource: async () => ({ ok: status >= 200 && status < 300, status, json: async () => data, headers: new Headers() }),
    waitForStoryDelay: async () => {}
  });
  return vm.runInContext(`${poller}\nwaitForStoryImageJob({ id: 'qa-job', token: 'test' });`, context);
}

test('extracts nested job error and supports legacy strings without object coercion', () => {
  assert.equal(imageJobErrorMessage({error:{message:'Image generation failed'}}), 'Image generation failed');
  assert.equal(imageJobErrorMessage({error:'Rate limit exceeded'}), 'Rate limit exceeded');
  assert.equal(imageJobErrorMessage({error:{}, message:'잠시 뒤 다시 시도해 주세요.'}), '잠시 뒤 다시 시도해 주세요.');
  for (const error of [null, {}, [], 42, '[object Object]', {message:{}}, {message:' '}]) {
    assert.equal(imageJobErrorMessage({error}, '안내 문구'), '안내 문구');
  }
  assert.equal(imageJobErrorMessage(null, '안내 문구'), '안내 문구');
  assert.equal(imageJobErrorMessage({error:{message:' x '.repeat(1000)}}).length, 500);
});

test('actual app poller displays nested errors for failed, expired and cancelled jobs', async () => {
  for (const status of ['failed', 'expired', 'cancelled']) {
    await assert.rejects(runStatus({status,error:{message:'Image generation failed'}}), error => {
      assert.equal(error.message, 'Image generation failed');
      assert.equal(error.retryWithNewJob, true);
      return true;
    });
  }
});

test('actual app poller preserves terminal and transient HTTP failure behavior', async () => {
  await assert.rejects(runStatus({error:{message:'Expired job'}},404), error => error.message === 'Expired job' && error.retryWithNewJob === true);
  await assert.rejects(runStatus({error:{message:'Upstream unavailable'}},503), /Upstream unavailable/);
  await assert.rejects(runStatus({status:'failed',error:{}}), /AntiAI 그림 생성에 실패했습니다/);
});

test('completed native job still returns the original download descriptor', async () => {
  const image={url:'/api/image-jobs/qa-job/images/0',width:1024,height:1024};
  assert.deepEqual(await runStatus({status:'completed',result:{images:[image]}}),image);
});

test('card text, session, create, poll and download errors share the normalizer', () => {
  const start=app.indexOf('async function createStoryImageJob(');
  const end=app.indexOf('async function renderStoryImageRecovery(',start);
  const imageFlow=app.slice(start,end);
  assert.equal(/new Error\(data\.error/.test(imageFlow),false);
  assert.ok(app.includes('new Error(imageJobErrorMessage(data, `단어 설명 요청 실패'));
  assert.ok(app.includes('new Error(imageJobErrorMessage(data, `${action}에 실패했습니다.'));
});
