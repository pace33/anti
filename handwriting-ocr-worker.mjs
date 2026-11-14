import * as ort from './vendor/onnxruntime-web-1.31.1/ort.webgpu.bundle.min.mjs';
import { HWR_VERSION, HWR_MODEL, HWR_ASSETS, prepareHandwritingPixels, decodeHandwritingCtc, verifiedAsset } from './handwriting-ocr-core.mjs?v=20261114-browser-hwr-v1';
ort.env.wasm.numThreads = 1;
// All assets are same-origin and pinned. No OCR/image leaves the device.
ort.env.wasm.wasmPaths = new URL('./vendor/onnxruntime-web-1.31.1/', import.meta.url).href;
let session, provider, chars, modelBytes, initialization, cacheInfo;
async function initialize(forceWasm, progress) {
    if (session) return;
    if (initialization) return initialization;
    initialization = (async () => {
        const start = performance.now();
        progress('준비 중 · 처음에는 약 44MB 인식 파일을 내려받아요. 다음부터는 기기에 저장된 파일을 사용해요.');
        let cache;
        try { cache = await caches.open(`aiedue-handwriting-${HWR_VERSION}`); } catch { /* Optional cache. */ }
        const [model, dictionary, wasm] = await Promise.all(Object.values(HWR_ASSETS).map(spec => verifiedAsset(spec, { baseUrl: import.meta.url, cache })));
        modelBytes = new Uint8Array(model.buffer);
        chars = ['', ...new TextDecoder().decode(dictionary.buffer).replace(/\r/g, '').replace(/\n$/, '').split('\n'), ' '];
        ort.env.wasm.wasmBinary = wasm.buffer;
        cacheInfo = { model: model.cached, dictionary: dictionary.cached, runtime: wasm.cached };
        let gpuAvailable = false;
        if (!forceWasm && self.navigator.gpu) {
            try { gpuAvailable = Boolean(await self.navigator.gpu.requestAdapter()); } catch { /* WASM handles unsupported GPU. */ }
        }
        if (gpuAvailable) {
            try { session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['webgpu'] }); provider = 'webgpu'; }
            catch (error) { console.warn('On-device WebGPU initialization failed; trying WASM', error); }
        }
        if (!session) { session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] }); provider = 'wasm'; }
        progress('이 기기에서 글씨를 확인하고 있어요.');
        return performance.now() - start;
    })();
    try { return await initialization; } catch (e) { initialization = null; throw e; }
}
async function recognize(message) {
    const progress = text => self.postMessage({ id: message.id, type: 'progress', text });
    if (!(message.blob instanceof Blob) || message.blob.size > 10000000) throw Error('Invalid OCR image');
    const started = performance.now();
    const bitmap = await createImageBitmap(message.blob);
    let prepared;
    try {
        if (bitmap.width * bitmap.height > 12000000 || bitmap.width <= 0 || bitmap.height <= 0) throw Error('OCR image dimensions invalid');
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(bitmap, 0, 0);
        prepared = prepareHandwritingPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    } finally { bitmap.close(); }
    if (!prepared) return { written: '', confidence: 0, uncertain: true, execution: 'browser', provider: 'none', model: HWR_MODEL };
    const loadMs = await initialize(message.forceWasm === true, progress) || 0;
    const input = new ort.Tensor('float32', prepared.data, prepared.dims);
    let outputs, fallback = false;
    const inferenceStart = performance.now();
    try {
        try { outputs = await session.run({ [session.inputNames[0]]: input }); }
        catch (error) {
            if (provider !== 'webgpu') throw error;
            try { await session.release(); } catch { /* A lost GPU can fail release. */ }
            session = null;
            progress('이 기기의 다른 인식 방식으로 다시 확인하고 있어요.');
            session = await ort.InferenceSession.create(modelBytes, { executionProviders: ['wasm'] }); provider = 'wasm'; fallback = true;
            outputs = await session.run({ [session.inputNames[0]]: input });
        }
        const inferred = performance.now();
        const output = outputs[session.outputNames[0]], decoded = decodeHandwritingCtc(output.data, output.dims, chars);
        return { ...decoded, uncertain: !decoded.written || decoded.confidence < .9, execution: 'browser', provider, fallback, model: HWR_MODEL, cache: cacheInfo, loadMs, inferenceMs: inferred - inferenceStart, totalMs: performance.now() - started };
    } finally {
        input.dispose();
        if (outputs) Object.values(outputs).forEach(output => output.dispose());
    }
}
// Single FIFO protects the runtime from overlapping inference.
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
    if (data?.type !== 'recognize' || !Number.isSafeInteger(data.id)) return;
    queue = queue.then(async () => {
        try { self.postMessage({ id: data.id, type: 'result', result: await recognize(data) }); }
        catch (error) { console.error('On-device OCR worker failed', error); self.postMessage({ id: data.id, type: 'error', code: 'AI-1099' }); }
    });
};
