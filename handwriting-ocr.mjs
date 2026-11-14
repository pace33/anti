// Lazy per-tab worker: importing the app does NOT download the OCR model.
let worker, nextId = 0;
const pending = new Map();
function failure(code = 'AI-1099') { const error = new Error('On-device handwriting recognition failed'); error.code = code; return error; }
function discardWorker(error) {
    worker?.terminate(); worker = null;
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.cleanup(); entry.reject(error); }
    pending.clear();
}
export function recognizeHandwritingOnDevice(blob, { onProgress, forceWasm = false, signal, timeoutMs = 180000 } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
    if (!(blob instanceof Blob)) return Promise.reject(failure());
    return new Promise((resolve, reject) => {
        if (!worker) {
            try { worker = new Worker(new URL('./handwriting-ocr-worker.mjs?v=20261114-browser-hwr-v1', import.meta.url), { type: 'module', name: 'aiedue-handwriting' }); }
            catch { reject(failure()); return; }
            worker.onmessage = ({ data }) => {
                const entry = pending.get(data?.id);
                if (!entry) return;
                if (data.type === 'progress') { entry.onProgress?.(data.text); return; }
                if (data.type !== 'error' && data.type !== 'result') return;
                pending.delete(data.id); clearTimeout(entry.timer); entry.cleanup();
                if (data.type === 'result') entry.resolve(data.result); else entry.reject(failure(data.code));
            };
            worker.onerror = () => discardWorker(failure());
        }
        const id = ++nextId;
        const abort = () => { const entry = pending.get(id); if (!entry) return; pending.delete(id); clearTimeout(entry.timer); entry.cleanup(); reject(new DOMException('Aborted', 'AbortError')); };
        const cleanup = () => signal?.removeEventListener('abort', abort);
        const timer = setTimeout(() => discardWorker(failure('AI-1002')), timeoutMs);
        pending.set(id, { resolve, reject, onProgress, timer, cleanup });
        signal?.addEventListener('abort', abort, { once: true });
        worker.postMessage({ type: 'recognize', id, blob, forceWasm });
    });
}
