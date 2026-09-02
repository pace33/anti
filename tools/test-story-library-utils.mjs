import assert from 'node:assert/strict';
import {
  buildStoryGenerationPrompt,
  buildStoryImagePrompt,
  normalizeStoryPlan,
  normalizeImageJobStatusUrl,
  normalizeImageJobUrl,
  validateStoryCharacter
} from '../story-library-utils.mjs';

const characters = [{ name: '별이', appearance: '노란 우비와 빨간 장화를 신은 곱슬머리 아이', personality: '호기심이 많고 친구를 잘 도와준다' }];

const prompt = buildStoryGenerationPrompt({ idea: '비 오는 날 길 잃은 달팽이를 돕는 이야기', characters, spreadCount: 4 });
assert.match(prompt, /별이/);
assert.match(prompt, /외형/);
assert.match(prompt, /정확히 4개/);
assert.match(prompt, /JSON/);

const plan = normalizeStoryPlan('```json\n{"title":"달팽이의 우산","summary":"함께 돕는 마음","spreads":[{"text":"첫 장면","imagePrompt":"빗속의 별이"},{"text":"둘째 장면","imagePrompt":"달팽이를 만남"},{"text":"셋째 장면","imagePrompt":"우산을 함께 씀"},{"text":"넷째 장면","imagePrompt":"무지개를 봄"}]}\n```', 4);
assert.equal(plan.title, '달팽이의 우산');
assert.equal(plan.spreads.length, 4);
assert.equal(plan.spreads[3].text, '넷째 장면');

assert.throws(() => normalizeStoryPlan('{"title":"짧은 책","spreads":[]}', 4), /4개/);
assert.throws(() => validateStoryCharacter({ name: '', appearance: '외형', personality: '성격' }), /이름/);
assert.equal(validateStoryCharacter(characters[0]).name, '별이');

const imagePrompt = buildStoryImagePrompt({
  title: plan.title,
  spread: plan.spreads[0],
  spreadIndex: 0,
  spreadCount: 4,
  characters,
  style: '따뜻한 수채화 동화책'
});
assert.match(imagePrompt, /오른쪽 페이지/);
assert.match(imagePrompt, /노란 우비/);
assert.match(imagePrompt, /글자.*넣지/);
assert.match(imagePrompt, /같은 외형/);

assert.equal(normalizeImageJobStatusUrl('/api/image-jobs/abc', 'abc'), '/korean-ai/api/image-jobs/abc');
assert.throws(() => normalizeImageJobStatusUrl('/api/image-jobs/other', 'abc'), /허용되지 않은/);
assert.equal(normalizeImageJobUrl('/api/image-jobs/abc/images/0', 'abc'), '/korean-ai/api/image-jobs/abc/images/0');
assert.equal(normalizeImageJobUrl('/korean-ai/api/image-jobs/abc/images/0', 'abc'), '/korean-ai/api/image-jobs/abc/images/0');
assert.throws(() => normalizeImageJobUrl('/api/image-jobs/other/images/0', 'abc'), /허용되지 않은/);
assert.throws(() => normalizeImageJobUrl('https://evil.example/image.jpg'), /허용되지 않은/);

console.log('story-library-utils: all tests passed');
