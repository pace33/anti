import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAieduLoading } from '../aiedu-loading.js';
import { createGradingFeedback } from '../grading-feedback.mjs';

function element(tagName = 'DIV') {
    const children = new Map(), classes = new Set(), listeners = new Map();
    return {
        tagName, inert: false, isConnected: true, dataset: {}, textContent: '', attrs: {},
        style: { setProperty() {} },
        classList: { add: v => classes.add(v), remove: v => classes.delete(v), contains: v => classes.has(v) },
        setAttribute(k, v) { this.attrs[k] = v; },
        querySelector(selector) { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); },
        focus() { this.focused = true; }, getClientRects: () => [1],
        addEventListener(k, fn) { listeners.set(k, fn); },
        fire(k, e = {}) { listeners.get(k)?.(e); },
        remove() { this.isConnected = false; }
    };
}
function fixture() {
    const overlay = element(), main = element(), preserved = element(); preserved.inert = true;
    const old = element();
    const nodes = { 'activity-loading-overlay': overlay, 'main-container': main };
    const body = { children: [main, preserved, overlay], append(n) { this.children.push(n); } };
    const document = { body, activeElement: old, getElementById: id => nodes[id], createElement: () => element() };
    let serial = 0;
    const timeouts = new Map(), intervals = new Map();
    const clock = {
        setInterval(fn) { const id = ++serial; intervals.set(id, fn); return id; }, clearInterval: id => intervals.delete(id),
        setTimeout(fn) { const id = ++serial; timeouts.set(id, fn); return id; }, clearTimeout: id => timeouts.delete(id)
    };
    function flush() { for (const [id, fn] of timeouts) { timeouts.delete(id); fn(); } }
    return { document, overlay, main, preserved, old, clock, flush, intervals, timeouts };
}

test('loading shows percentage, keeps 100% until close, restores prior inert state', async () => {
    const f = fixture(), loading = createAieduLoading(f.document, f.clock);
    const token = loading.start('채점 중', 'dictation');
    assert.equal(f.overlay.querySelector('.aiedu-loading-value').textContent, '0%');
    assert.equal(f.overlay.querySelector('.aiedu-loading-scene').dataset.actor, 'writer');
    assert(f.main.inert);
    const done = loading.finish(token, true);
    assert.equal(f.overlay.querySelector('.aiedu-loading-value').textContent, '100%');
    assert(loading.isActive(token));
    f.flush(); await done;
    assert(!loading.isActive(token)); assert(!f.main.inert); assert(f.preserved.inert); assert(f.old.focused);
    assert.equal(f.intervals.size, 0);
});

test('a cancelled/superseded loading resolves old awaiters without hiding the new request', async () => {
    const f = fixture(), loading = createAieduLoading(f.document, f.clock);
    const a = loading.start('a'); const pending = loading.finish(a, true);
    const b = loading.start('b', 'drawing'); await pending;
    await loading.finish(a); assert(loading.isActive(b));
    assert.equal(f.overlay.querySelector('.aiedu-loading-value').textContent, '0%');
    await loading.finish(b); assert(!f.main.inert); assert.equal(f.timeouts.size, 0);
});

test('comic chooses happy/retry poses and preserves surrounding controls and focus', () => {
    const f = fixture(), feedback = createGradingFeedback(f.document);
    feedback.show(true);
    let panel = f.document.body.children.at(-1);
    assert.equal(panel.querySelector('#grading-comic-title').textContent, '정답!');
    assert.match(panel.innerHTML, /grading-happy.webp/);
    assert.equal(panel.attrs['role'], 'dialog'); assert(f.main.inert);
    panel.querySelector('button').fire('click');
    assert(!f.main.inert); assert(f.preserved.inert);
    feedback.show(false);
    panel = f.document.body.children.at(-1);
    assert.match(panel.innerHTML, /grading-retry.webp/);
    assert.equal(panel.querySelector('button').textContent, '다시 써볼게!');
    assert.match(panel.querySelector('#grading-comic-title').textContent, /다시 해보자/);
    panel.fire('keydown', { key: 'Escape', preventDefault() {} });
    assert(!panel.isConnected); assert(!f.main.inert);
});

test('final wrong attempt encourages later practice without promising an unavailable extra retry', () => {
    const f = fixture(), feedback = createGradingFeedback(f.document);
    feedback.show(false, { finalAttempt: true });
    const p = f.document.body.children.at(-1);
    assert.match(p.querySelector('#grading-comic-detail').textContent, /다시 쓰기에서/);
    assert.equal(p.querySelector('button').textContent, '계속하기');
    feedback.close();
});

test('source-edited mascot artifacts and mobile/reduced-motion rules are shipped', () => {
    for (const pose of ['happy', 'retry']) {
        const bytes = fs.readFileSync(new URL(`../assets/classroom/grading-${pose}.webp`, import.meta.url));
        assert.equal(bytes.subarray(0, 4).toString(), 'RIFF'); assert(bytes.length > 5000);
    }
    const css = fs.readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    assert(css.includes('prefers-reduced-motion: reduce')); assert(css.includes('100dvh - 40px'));
});
