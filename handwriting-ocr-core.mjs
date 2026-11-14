// Pure image/CTC helpers. Never accepts a question, expected answer or word lexicon.
export const HWR_VERSION = '20261114-browser-hwr-v1';
export const HWR_MODEL = 'Rebeccaaaaaaaa/korean-handwriting-rec@7ebe489f4a8880af35ae873258ab3ab993b3ab1f';
export const HWR_ASSETS = Object.freeze({
    model: { path: './assets/korean-hwr-v1/rec_korean_hw.onnx', bytes: 14790116, sha256: '1655d6abd17989f1922855dd77922e532e74275fe237e5f07174b623993fef81' },
    dictionary: { path: './assets/korean-hwr-v1/ppocrv5_korean_dict.txt', bytes: 47451, sha256: 'a88071c68c01707489baa79ebe0405b7beb5cca229f4fc94cc3ef992328802d7' },
    wasm: { path: './vendor/onnxruntime-web-1.31.1/ort-wasm-simd-threaded.asyncify.wasm', bytes: 28747738, sha256: 'ca319e9539cd0f1e291cf56074760121eaf39650f5dbf84b6e52c07f4b2944ec' }
});
export function prepareHandwritingPixels(rgba, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 12000000 || rgba.length !== width * height * 4) throw Error('Invalid handwriting image');
    const rgb = new Uint8Array(width * height * 3);
    let left = width, right = -1, top = height, bottom = -1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x, alpha = rgba[i * 4 + 3] / 255;
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = Math.round(rgba[i * 4 + c] * alpha + 255 * (1 - alpha));
        if (.299 * (255 - rgb[i * 3]) + .587 * (255 - rgb[i * 3 + 1]) + .114 * (255 - rgb[i * 3 + 2]) > 40) {
            left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
    }
    if (right < 0) return null;
    left = Math.max(0, left - 8); right = Math.min(width, right + 9);
    top = Math.max(0, top - 8); bottom = Math.min(height, bottom + 9);
    const w = right - left, h = bottom - top, W = Math.max(8, Math.ceil(48 * w / h)), plane = 48 * W;
    if (W > 2048) throw Error('Handwriting line too wide');
    const data = new Float32Array(3 * plane);
    // Half-pixel bilinear resize; preserve every mark in the full line.
    for (let y = 0; y < 48; y++) for (let x = 0; x < W; x++) {
        const fx = (x + .5) * w / W - .5, fy = (y + .5) * h / 48 - .5;
        const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx))), x1 = Math.max(0, Math.min(w - 1, Math.floor(fx) + 1));
        const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy))), y1 = Math.max(0, Math.min(h - 1, Math.floor(fy) + 1));
        const ax = fx - Math.floor(fx), ay = fy - Math.floor(fy);
        for (let c = 0; c < 3; c++) {
            const p = (xx, yy) => rgb[3 * ((top + yy) * width + left + xx) + 2 - c];
            const v = (1 - ay) * ((1 - ax) * p(x0, y0) + ax * p(x1, y0)) + ay * ((1 - ax) * p(x0, y1) + ax * p(x1, y1));
            data[c * plane + y * W + x] = Math.round(v) / 127.5 - 1;
        }
    }
    return { data, dims: [1, 3, 48, W] };
}
export function decodeHandwritingCtc(data, dims, chars) {
    if (dims.length !== 3 || dims[0] !== 1 || dims[2] !== chars.length || data.length !== dims[1] * dims[2]) throw Error('Invalid OCR output shape');
    let previous = 0, written = '', confidenceSum = 0, letters = 0;
    for (let j = 0; j < data.length; j += chars.length) {
        let best = -Infinity, index = 0;
        for (let k = 0; k < chars.length; k++) {
            if (!Number.isFinite(data[j + k])) throw Error('Non-finite OCR output');
            if (data[j + k] > best) { best = data[j + k]; index = k; }
        }
        if (index !== 0 && index !== previous) { written += chars[index]; confidenceSum += best; letters++; }
        previous = index;
    }
    if (written.length > 2000) throw Error('OCR output too long');
    return { written: written.normalize('NFC'), confidence: letters ? confidenceSum / letters : 0 };
}
export async function verifiedAsset(spec, { baseUrl, cache, fetcher = fetch, cryptoApi = crypto } = {}) {
    const url = new URL(spec.path, baseUrl).href;
    const valid = async response => {
        if (!response?.ok) return null;
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength !== spec.bytes) return null;
        const hash = [...new Uint8Array(await cryptoApi.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
        return hash === spec.sha256 ? buffer : null;
    };
    let hit;
    try { hit = cache && await cache.match(url); } catch { /* Storage denial is not an inference failure. */ }
    const cached = hit && await valid(hit.clone());
    if (cached) return { buffer: cached, cached: true };
    try { if (hit) await cache.delete(url); } catch { /* Best effort cache only. */ }
    const response = await fetcher(url, { credentials: 'omit', cache: 'no-cache' });
    const buffer = await valid(response.clone());
    if (!buffer) throw Error('OCR asset integrity check failed');
    try { await cache?.put(url, response); } catch { /* Private mode/quota: run without persistent cache. */ }
    return { buffer, cached: false };
}
