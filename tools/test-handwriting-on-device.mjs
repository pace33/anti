import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { HWR_ASSETS, prepareHandwritingPixels, decodeHandwritingCtc, verifiedAsset } from '../handwriting-ocr-core.mjs';
const root = new URL('../', import.meta.url);
for (const [name, asset] of Object.entries(HWR_ASSETS)) test(`${name} vendored bytes and SHA256 match the pinned contract`, () => {
    const bytes = fs.readFileSync(new URL(asset.path, root));
    assert.equal(bytes.length, asset.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256);
});
test('greedy CTC preserves observed near misses, trailing characters and repeated syllables', () => {
    const chars = ['', '학', '교', '고', 'ㅋ', ' '];
    for (const [indices, expected] of [[[1, 1, 2, 2], '학교'], [[1, 3], '학고'], [[1, 2, 4], '학교ㅋ'], [[1, 2, 0, 1, 2], '학교학교']]) {
        const data = new Float32Array(indices.length * chars.length).fill(.001);
        indices.forEach((idx, step) => data[step * chars.length + idx] = .99);
        const result = decodeHandwritingCtc(data, [1, indices.length, chars.length], chars);
        assert.equal(result.written, expected); assert.ok(result.confidence > .98);
    }
    assert.throws(() => decodeHandwritingCtc(new Float32Array(2), [1, 1, 2], chars));
    assert.throws(() => decodeHandwritingCtc(new Float32Array([NaN, 1]), [1, 1, 2], ['', '학']));
});
test('transparent background is white; a distant added mark survives complete-line crop', () => {
    const rgba = new Uint8ClampedArray(60 * 20 * 4);
    assert.equal(prepareHandwritingPixels(rgba, 60, 20), null);
    const dot = x => { rgba[(10 * 60 + x) * 4 + 3] = 255; };
    dot(10); const one = prepareHandwritingPixels(rgba, 60, 20); dot(52);
    const two = prepareHandwritingPixels(rgba, 60, 20);
    assert.ok(two.dims[3] > one.dims[3] * 1.5);
    assert.ok(two.data.some(v => v < -.1));
    assert.throws(() => prepareHandwritingPixels(rgba, Infinity, 20));
    assert.throws(() => prepareHandwritingPixels(rgba, 60, 0));
    assert.throws(() => prepareHandwritingPixels(rgba, 60000, 60000));
});
const payload = new Uint8Array([1,2,3]);
const spec = { path: './test', bytes: 3, sha256: createHash('sha256').update(payload).digest('hex') };
const response = () => new Response(payload);
function assetOptions(cache, fetcher) { return { baseUrl: 'https://example.invalid/korean/worker.mjs', cache, fetcher, cryptoApi: webcrypto }; }
test('valid persistent cache is used without a network request', async () => {
    const result = await verifiedAsset(spec, assetOptions({ match: async () => response() }, () => { throw Error('Network must be unused'); }));
    assert.equal(result.cached, true); assert.deepEqual(new Uint8Array(result.buffer), payload);
});
test('corrupt cache is rejected, deleted and replaced with a verified download', async () => {
    const events = [];
    const cache = { match: async () => new Response(new Uint8Array([9,9,9])), delete: async () => events.push('delete'), put: async () => events.push('put') };
    const result = await verifiedAsset(spec, assetOptions(cache, async () => { events.push('fetch'); return response(); }));
    assert.equal(result.cached, false); assert.deepEqual(events, ['delete','fetch','put']);
});
test('cache quota/security denial cannot prevent inference asset loading', async () => {
    const cache = { match: async () => { throw Error('SecurityError'); }, put: async () => { throw Error('QuotaExceededError'); } };
    assert.equal((await verifiedAsset(spec, assetOptions(cache, async () => response()))).cached, false);
});
test('bad download integrity never reaches the runtime or persistent cache', async () => {
    let written = false;
    await assert.rejects(verifiedAsset(spec, assetOptions({ match: async () => null, put: async () => { written = true; } }, async () => new Response(new Uint8Array([1,2,4])))), /integrity/);
    assert.equal(written, false);
});
test('worker request cannot receive a question/answer and has no inference upload route', () => {
    const worker = fs.readFileSync(new URL('../handwriting-ocr-worker.mjs', import.meta.url), 'utf8');
    const client = fs.readFileSync(new URL('../handwriting-ocr.mjs', import.meta.url), 'utf8');
    assert.ok(client.includes("{ type: 'recognize', id, blob, forceWasm }"));
    assert.ok(!/expected|message\.answer|message\.word|korean-ai|POST|XMLHttpRequest/.test(worker));
    assert.ok(worker.includes("executionProviders: ['webgpu']"));
    assert.ok(worker.includes("executionProviders: ['wasm']"));
    assert.ok(client.includes("type: 'module'"));
    assert.ok(!client.includes('fetch('));
});
test('client worker boot is lazy, reports progress, supports cancellation and safe errors', async () => {
    const Original = globalThis.Worker;
    let created = 0, lastWorker;
    class FakeWorker { constructor() { created++; lastWorker = this; } postMessage(m) { this.message = m; } terminate() {} }
    globalThis.Worker = FakeWorker;
    try {
        const { recognizeHandwritingOnDevice } = await import('../handwriting-ocr.mjs?client-contract-test');
        assert.equal(created, 0);
        const messages = [], ctrl = new AbortController();
        const pending = recognizeHandwritingOnDevice(new Blob(['ink']), { onProgress: x => messages.push(x), signal: ctrl.signal });
        const id = lastWorker.message.id;
        lastWorker.onmessage({ data: { id, type: 'progress', text: '준비 중' } });
        assert.deepEqual(messages, ['준비 중']);
        ctrl.abort(); await assert.rejects(pending, { name: 'AbortError' });
        const next = recognizeHandwritingOnDevice(new Blob(['ink']));
        lastWorker.onmessage({ data: { id: lastWorker.message.id, type: 'error', code: 'AI-1099' } });
        await assert.rejects(next, { code: 'AI-1099' });
    } finally { globalThis.Worker = Original; }
});
