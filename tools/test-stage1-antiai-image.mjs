import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function section(start, end) {
    const from = app.indexOf(start);
    const to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from);
    return app.slice(from, to);
}

function harness(search = '', failJob = false) {
    const requests = [];
    const source = new Blob(['source fixture, not an inference result'], { type: 'image/png' });
    const result = new Blob(['result fixture, not an inference result'], { type: 'image/jpeg' });
    const context = vm.createContext({
        window: { location: { search } }, URLSearchParams, AbortController, Date, console,
        drawingAiSketchbookActive: true, drawingAiSketchbookBusy: false, drawingAiSketchbookSaved: false,
        drawingAiSketchbookGenerated: false, drawingAiSketchbookPendingRecord: null,
        drawingAiSketchbookRevision: 0, drawingAiSketchbookController: null, drawingAiSketchbookSaving: false,
        currentUserId: 'qa-user', drawingUserTracePoints: [{ x: 1 }, { x: 2 }],
        AIEDUE_DRAWING_GENERATION_WAIT_NOTICE: 'existing notice',
        isCurrentDrawingUser: () => true, isCurrentAiSketchbookOperation: () => true,
        updateAiSketchbookControls: () => {}, aieduLoading: { start() {}, finish() {} },
        captureDrawingBlob: async () => source,
        createSettingsImageEditSession: async (blob) => {
            assert.equal(blob, source);
            requests.push({ action: 'upload', type: blob.type });
            return { id: 'fixture-session', token: 'fixture-capability' };
        },
        fetchStoryResource: async (url, options) => {
            requests.push({ action: 'turn', url, body: JSON.parse(options.body), headers: options.headers });
            return { ok: true, json: async () => ({ id: 'fixture-job', token: 'fixture-job-capability' }) };
        },
        normalizeSettingsImageJob: x => x,
        waitForStoryImageJob: async () => {
            if (failJob) throw new Error('controlled failure');
            requests.push({ action: 'poll' }); return { url: '/controlled-result' };
        },
        downloadStoryImage: async () => { requests.push({ action: 'download' }); return result; },
        drawAiSketchbookBlob: async (blob) => { assert.equal(blob, result); requests.push({ action: 'render' }); return true; },
        captureDrawingImage: () => 'fixture-canvas-data', buildDrawingRecord: record => record,
        persistGeneratedAiSketchbookRecord: async () => requests.push({ action: 'save' }),
        closeSettingsImageEditSession: async () => requests.push({ action: 'close' }),
        aiErrorMessage: () => 'AI 생성에 실패했습니다. 오류 코드: AI-1099',
        showModal: () => requests.push({ action: 'error' })
    });
    vm.runInContext(section('function getKoreanAiProcessingMode(', 'async function callKoreanAiGenerate'), context);
    vm.runInContext(section('async function createSettingsImageEditTurn(', 'async function finishSettingsImageJob'), context);
    vm.runInContext(section('window.generateAiSketchbookImage =', 'function buildDrawingRecord'), context);
    return { context, requests };
}

test('stage 1 uploads the original then sends the existing AntiAI native image contract, renders and saves', async () => {
    const { context, requests } = harness();
    await context.window.generateAiSketchbookImage();
    assert.deepEqual(requests.map(x => x.action), ['upload', 'turn', 'poll', 'download', 'render', 'save', 'close']);
    const turn = requests.find(x => x.action === 'turn');
    assert.equal(turn.url, '/korean-ai/api/image-edit-sessions/fixture-session/turns');
    assert.equal(turn.body.processingMode, 'gemini-only');
    assert.equal(turn.body.aspectRatio, '1:1');
    assert.match(turn.body.prompt, /원본의 주요 대상과 전체 구도/);
    assert.match(turn.body.prompt, /창의성/);
    assert.equal(turn.headers['X-Image-Session-Token'], 'fixture-capability');
});

test('explicit local-only diagnostic URL remains local-only', async () => {
    const { context, requests } = harness('?ai=local');
    await context.window.generateAiSketchbookImage();
    assert.equal(requests.find(x => x.action === 'turn').body.processingMode, 'local-only');
});

test('generation failure never renders or saves a fabricated image and still closes the session', async () => {
    const { context, requests } = harness('', true);
    await context.window.generateAiSketchbookImage();
    assert.deepEqual(requests.map(x => x.action), ['upload', 'turn', 'error', 'close']);
});
