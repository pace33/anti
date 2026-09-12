import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as core from '../shape-zoo-core.mjs';

const source = readFileSync(new URL('../shape-zoo-game.js', import.meta.url), 'utf8');

// Run the real controller through public events with a deterministic frame clock.
function harness() {
    let now = 0, frameId = 1;
    const frames = new Map(), elements = new Map();
    const ctx = new Proxy({}, { get: (o, k) => o[k] ?? (() => {}), set: (o, k, v) => { o[k] = v; return true; } });
    class Element {
        constructor(id) {
            Object.assign(this, { id, handlers: {}, attrs: {}, dataset: {}, style: {}, textContent: '', hidden: false, disabled: false, isConnected: true, width: 600, height: 600 });
            this.classes = new Set(); this.captures = new Set();
            this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x), contains: x => this.classes.has(x) };
        }
        addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); }
        emit(type, props = {}) { for (const fn of this.handlers[type] ?? []) fn({ type, preventDefault() {}, ...props }); }
        set innerHTML(value) { for (const [, id] of value.matchAll(/id="([^"]+)"/g)) if (!elements.has(id)) elements.set(id, new Element(id)); }
        querySelector(s) { if (!elements.has(s)) elements.set(s, new Element(s)); return elements.get(s); }
        hasAttribute(k) { return k in this.attrs; }
        setAttribute(k, v) { this.attrs[k] = v; }
        getAttribute(k) { return this.attrs[k]; }
        getContext() { return ctx; }
        getBoundingClientRect() { return { left: 0, top: 0, width: 600, height: 600 }; }
        setPointerCapture(id) { this.captures.add(id); }
        hasPointerCapture(id) { return this.captures.has(id); }
        releasePointerCapture(id) { this.captures.delete(id); this.emit('lostpointercapture', { pointerId: id }); }
        focus() { document.activeElement = this; }
    }
    const section = new Element('shape-zoo-game-section'); elements.set(section.id, section);
    const document = new Element('document'); document.body = new Element('body');
    document.hidden = false; document.activeElement = document.body;
    document.getElementById = id => elements.get(id) ?? null;
    const window = new Element('window'); window.devicePixelRatio = 1; window.location = {};
    window.matchMedia = () => ({ matches: false });
    window.showAiedueTopLevelSection = id => { if (id !== section.id) window.stopShapeZooGame(); };
    window.closeAiedueKoreanModal = () => {}; window.openAiedueLab = () => {};
    vm.runInNewContext(source.replace(/^import[^\n]+\n/, ''), {
        ...core, document, window, performance: { now: () => now },
        requestAnimationFrame: fn => { const id = frameId++; frames.set(id, fn); return id; },
        cancelAnimationFrame: id => frames.delete(id), ResizeObserver: class { observe() {} disconnect() {} }
    });
    const el = id => elements.get(`zoo-${id}`);
    const click = id => { if (!el(id).disabled) el(id).emit('click'); };
    const advance = ms => { now += ms; const callbacks = [...frames.values()]; frames.clear(); for (const fn of callbacks) fn(now); };
    function trace(shape = core.ZOO_SHAPES.find(item => item.id === 'circle'), pointerId = 1) {
        const event = p => ({ pointerId, pointerType: 'pen', isPrimary: true, button: 0, clientX: p.x * 600, clientY: p.y * 600 });
        el('canvas').emit('pointerdown', event(shape.points[0]));
        for (const p of shape.points.slice(1, -1)) el('canvas').emit('pointermove', event(p));
        el('canvas').emit('pointerup', event(shape.points.at(-1)));
    }
    window.openShapeZooGame();
    return { el, click, trace, advance, window, document, frames, setTime: v => { now = v; } };
}

test('a completed trace flies to the lion, awards once, and shortens the next round', () => {
    const g = harness(); g.click('start'); g.trace(); g.click('submit');
    assert.equal(g.el('cookie').hidden, false);
    assert.equal(g.el('submit').disabled, true);
    g.el('submit').emit('click'); g.advance(721);
    assert.equal(g.el('score').textContent, 1);
    assert.equal(g.el('lion').dataset.mood, 'happy');
    g.advance(1601);
    assert.equal(g.el('round').textContent, 'ROUND 02');
    assert.equal(g.el('seconds').textContent, '17.4');
    assert.equal(g.el('score').textContent, 1);
});
test('three empty submissions cost three lives and show a restartable result', () => {
    const g = harness(); g.click('start');
    for (let i = 0; i < 3; i++) {
        g.click('submit'); g.advance(721);
        assert.equal(g.el('lion').dataset.mood, 'angry');
        assert.equal(g.el('lives').getAttribute('aria-label'), `생명 ${2 - i}개`);
        g.advance(1601);
    }
    assert.equal(g.el('overlay').hidden, false);
    assert.equal(g.el('overlay-title').textContent, '도형 과자 0개 완성!');
    g.click('start');
    assert.equal(g.el('lives').getAttribute('aria-label'), '생명 3개');
    assert.equal(g.el('seconds').textContent, '18.0');
});
test('a click after the deadline fails even before the next frame', () => {
    const g = harness(); g.click('start'); g.trace(); g.setTime(18001); g.click('submit'); g.advance(721);
    assert.equal(g.el('score').textContent, 0);
    assert.equal(g.el('lives').getAttribute('aria-label'), '생명 2개');
    assert.equal(g.el('feedback').textContent, '시간 초과! 생명이 1개 줄었어요.');
});
test('clear never replenishes time and timeout advances just one round', () => {
    const g = harness(); g.click('start'); g.advance(8000); g.trace(); g.click('clear');
    assert.equal(g.el('seconds').textContent, '10.0');
    g.advance(10001); g.advance(721); g.advance(1601);
    assert.equal(g.el('round').textContent, 'ROUND 02');
    assert.equal(g.el('lives').getAttribute('aria-label'), '생명 2개');
});
test('pause preserves the time and drawing until explicit resume', () => {
    const g = harness(); g.click('start'); g.trace(); g.advance(3000); g.click('pause'); g.advance(60000);
    assert.equal(g.el('seconds').textContent, '15.0'); assert.equal(g.frames.size, 0);
    g.click('start'); g.click('submit'); g.advance(721);
    assert.equal(g.el('score').textContent, 1);
});
test('backgrounding during delivery produces no hidden reward or automatic resume', () => {
    const g = harness(); g.click('start'); g.trace(); g.click('submit'); g.advance(300);
    g.document.hidden = true; g.document.emit('visibilitychange'); g.advance(60000);
    assert.equal(g.el('score').textContent, 0);
    g.document.hidden = false; g.document.emit('visibilitychange'); assert.equal(g.frames.size, 0);
    g.click('start'); g.advance(421); assert.equal(g.el('score').textContent, 1);
});
test('closing and reopening discard the pending reward and old frame callbacks', () => {
    const g = harness(); g.click('start'); g.trace(); g.click('submit');
    g.window.stopShapeZooGame(); g.advance(5000); assert.equal(g.frames.size, 0);
    g.window.openShapeZooGame(); g.advance(5000);
    assert.equal(g.el('score').textContent, 0); assert.equal(g.el('overlay').hidden, false);
    g.click('start'); g.click('submit'); g.advance(721);
    assert.equal(g.el('lives').getAttribute('aria-label'), '생명 2개');
});
test('extra pointers are ignored and pointer cancellation allows a fresh trace', () => {
    const g = harness(); g.click('start');
    g.el('canvas').emit('pointerdown', { pointerId: 1, pointerType: 'pen', isPrimary: true, clientX: 300, clientY: 114 });
    g.trace(core.ZOO_SHAPES.find(item => item.id === 'square'), 2); g.el('canvas').emit('pointercancel', { pointerId: 1 });
    assert.equal(g.el('canvas').captures.size, 0);
    g.click('clear'); g.trace(); g.click('submit'); g.advance(721);
    assert.equal(g.el('score').textContent, 1);
});
test('persisted navigation pauses for a usable browser-back restore', () => {
    const g = harness(); g.click('start'); g.advance(2000);
    g.window.emit('pagehide', { persisted: true }); g.advance(60000);
    assert.equal(g.el('start').textContent, '이어서 하기');
    g.click('start'); g.advance(1000); assert.equal(g.el('seconds').textContent, '15.0');
});
test('lab navigation uses an allowlisted action and registers the section and assets', () => {
    const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const standaloneHtml = readFileSync(new URL('../shape-zoo.html', import.meta.url), 'utf8');
    const zooCss = readFileSync(new URL('../shape-zoo.css', import.meta.url), 'utf8');
    assert.match(app, /SAFE_MODAL_ACTIONS = new Set\(\[[\s\S]*?'openAiedueLabShapeZoo'/);
    assert.match(app, /onclick="openAiedueLabShapeZoo\(\)"/);
    assert.match(app, /if \(!isShapeZoo\) window\.stopShapeZooGame\?\.\(\)/);
    assert.match(html, /id="shape-zoo-game-section"/);
    assert.match(html, /src="shape-zoo-game\.js/);
    assert.match(html, /href="shape-zoo\.css/);
    const mainScriptVersion = html.match(/src="shape-zoo-game\.js\?v=([^"]+)"/)?.[1];
    const standaloneScriptVersion = standaloneHtml.match(/src="shape-zoo-game\.js\?v=([^"]+)"/)?.[1];
    const mainCssVersion = html.match(/href="shape-zoo\.css\?v=([^"]+)"/)?.[1];
    const standaloneCssVersion = standaloneHtml.match(/href="shape-zoo\.css\?v=([^"]+)"/)?.[1];
    assert.ok(mainScriptVersion, '메인 페이지 도형 동물원 JS 캐시 키가 필요하다');
    assert.equal(standaloneScriptVersion, mainScriptVersion, '독립 페이지도 메인과 같은 도형 동물원 JS를 불러야 한다');
    assert.equal(mainCssVersion, mainScriptVersion, '변경된 도형 동물원 CSS와 JS는 같은 캐시 릴리스 키를 사용해야 한다');
    assert.equal(standaloneCssVersion, mainCssVersion, '독립 페이지도 메인과 같은 도형 동물원 CSS를 불러야 한다');
    assert.match(zooCss, /\.zoo-back\.aiedue-lab-logo-home\s+img\s*\{[^}]*width:[^;}]+;[^}]*height:[^;}]+;/s, '독립 페이지에서도 홈 로고 크기를 제한해야 한다');
    assert.match(zooCss, /\.zoo-header\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*30;/s, '독립 페이지 헤더가 시작 오버레이보다 위에 있어야 한다');
    assert.match(zooCss, /\.zoo-overlay\s*\{[^}]*inset:\s*88px 0 0;/s, '독립 페이지 오버레이는 로고 헤더 아래에서 시작해야 한다');
    assert.ok(source.includes("document.activeElement === ui.home"), '오버레이 포커스 순환에 홈 로고가 포함돼야 한다');
    assert.match(app, /DRAWING_SHAPE_LIBRARY as drawingShapeLibrary/);
});

test('a full game presents all curriculum shapes once per ten rounds, starting with the familiar three', () => {
    const g = harness(); g.click('start');
    const names = [];
    for (let i = 0; i < 20; i++) {
        const name = g.el('request-name').textContent; names.push(name);
        g.trace(core.ZOO_SHAPES.find(shape => shape.name === name)); g.click('submit'); g.advance(721); g.advance(1601);
    }
    assert.deepEqual(names.slice(0, 3), ['동그라미', '세모', '네모']);
    for (const batch of [names.slice(0, 10), names.slice(10)]) assert.deepEqual([...batch].sort(), core.ZOO_SHAPES.map(shape => shape.name).sort());
    assert.notEqual(names[9], names[10]);
    assert.equal(g.el('score').textContent, 20);
});
