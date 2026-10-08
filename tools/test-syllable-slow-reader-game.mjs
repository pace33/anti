import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import * as core from '../syllable-slow-reader-core.mjs';

const root = new URL('../', import.meta.url);
const [app, html, game, css, appCss] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('syllable-slow-reader.js', root), 'utf8'),
    readFile(new URL('syllable-slow-reader.css', root), 'utf8'),
    readFile(new URL('app.css', root), 'utf8')
]);

test('한글 카드의 받침 낱말 오른쪽 직접 만들기 탭에 연결된다', () => {
    const tabs = html.slice(html.indexOf('id="reading-category-tabs"'), html.indexOf('id="reading-cards-grid"'));
    assert.ok(tabs.indexOf('data-reading-category="batchim"') >= 0);
    assert.ok(tabs.indexOf('data-reading-category="custom"') > tabs.indexOf('data-reading-category="batchim"'));
    assert.ok(html.includes('id="reading-custom-maker"'));
    assert.ok(html.includes('id="reading-tab-custom"'));
    assert.match(html, /<label[^>]*for="ssr-text-input"[^>]*>읽을 글자<\/label>/);
    assert.ok(html.includes('aria-labelledby="reading-tab-custom ssr-title"'));
    assert.equal(html.includes('id="syllable-slow-reader-section"'), false);
    assert.equal(app.includes('openAiedueLabSyllableReader'), false);
    assert.ok(app.includes('window.openSyllableSlowReader?.()'));
    assert.ok(app.includes("activeReadingCategory === 'custom'"));
    assert.ok(app.includes('item.tabIndex = isActive ? 0 : -1'));
    assert.ok(app.includes('ArrowRight'));
    assert.ok(app.includes('ArrowLeft'));
    assert.ok(app.includes('Home'));
    assert.ok(app.includes('End'));
    assert.ok(html.includes('src="syllable-slow-reader.js'));
    assert.ok(html.includes('href="syllable-slow-reader.css'));
});

test('브라우저 비밀키 없이 공용 에이두 TTS와 취소 계약을 쓴다', () => {
    assert.ok(game.includes('window.speakTextKo?.('));
    assert.ok(game.includes('window.cancelSpeech?.()'));
    assert.ok(game.includes('runId !== state.runId'));
    assert.equal(game.includes('generativelanguage.googleapis.com'), false);
    assert.equal(game.includes('apiKey'), false);
    assert.equal(game.includes('fetch('), false);
    assert.ok(app.includes('activeTtsAudioCancel?.()'));
    assert.ok(app.includes("const cancelAudioWait = () => finish(reject, new DOMException('재생이 취소됐습니다.', 'AbortError'))"));
});

test('입력은 textContent 기반으로 렌더링하고 음절별 실제 완료를 기다린다', () => {
    assert.ok(game.includes('card.textContent = token.text'));
    assert.equal(game.includes('innerHTML'), false);
    assert.match(game, /await window\.speakTextKo\?\.\(sequence\[index\]\.text/);
    assert.ok(game.includes('await waitForGap(gap.milliseconds, runId)'));
    assert.ok(game.includes("document.addEventListener('visibilitychange'"));
    assert.ok(game.includes('shouldCancelSpeech = state.isPlaying'));
    assert.match(game, /async function speakOne[\s\S]*finally \{/);
});

test('모바일과 접근성 계약을 유지한다', () => {
    assert.match(html, /id="ssr-status"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /id="ssr-play"[^>]*aria-pressed="false"/);
    assert.ok(css.includes('@media (max-width: 760px)'));
    assert.ok(css.includes('.ssr-play { width: 100%; min-height: 82px'));
    assert.equal(html.includes('ssr-clear'), false);
    assert.equal(html.includes('ssr-sample'), false);
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
    assert.ok(game.includes("reduceMotion ? 'auto' : 'smooth'"));
    assert.ok(game.includes("section: $('reading-custom-maker')"));
    assert.ok(appCss.includes('@media (max-width:820px){.reading-category-tabs{flex-wrap:wrap;}'));
});

function readerHarness() {
    const nodes = new Map();
    const spoken = [];
    const timers = new Map();
    let now = 0;
    let timerId = 0;
    let finishSpeech;
    let cancellations = 0;
    const document = {
        activeElement: null,
        getElementById: (id) => nodes.get(id),
        querySelectorAll: () => [],
        addEventListener() {},
        createElement: () => element()
    };
    function element() {
        const listeners = new Map();
        const classes = new Set();
        const node = {
            value: '', dataset: {}, children: [], textContent: '', disabled: false, readOnly: false,
            classList: {
                add: (name) => classes.add(name),
                remove: (name) => classes.delete(name),
                contains: (name) => classes.has(name),
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }
            },
            set className(value) { classes.clear(); value.split(/\s+/).forEach((name) => classes.add(name)); },
            setAttribute(name, value) { if (name === 'data-speak-index') this.dataset.speakIndex = value; },
            removeAttribute() {},
            append(...children) { this.children.push(...children); },
            replaceChildren() { this.children = []; },
            querySelectorAll() { return this.children.filter((child) => child.classList.contains('active')); },
            querySelector(selector) { return this.children.find((child) => child.dataset.speakIndex === selector.match(/"(\d+)"/)?.[1]); },
            scrollIntoView() {},
            focus(options) { document.activeElement = this; this.focusOptions = options; },
            addEventListener(type, callback) {
                if (!listeners.has(type)) listeners.set(type, []);
                listeners.get(type).push(callback);
            },
            dispatch(type, details = {}) {
                const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...details };
                for (const callback of listeners.get(type) || []) callback(event);
                return event;
            }
        };
        return node;
    }
    for (const id of ['reading-custom-maker', 'ssr-text-input', 'ssr-board', 'ssr-play', 'ssr-gap-range', 'ssr-gap-display', 'ssr-status', 'ssr-count']) {
        nodes.set(id, element());
    }
    const input = nodes.get('ssr-text-input');
    const range = nodes.get('ssr-gap-range');
    range.value = '3';
    const window = {
        setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, due: now + delay }); return id; },
        clearTimeout: (id) => timers.delete(id),
        matchMedia: () => ({ matches: true }),
        speakTextKo(text, _voice, options) {
            spoken.push({ text, at: now, options });
            return new Promise((resolve) => { finishSpeech = resolve; });
        },
        cancelSpeech() { cancellations += 1; finishSpeech?.(false); finishSpeech = undefined; }
    };
    runInNewContext(game.replace(/^import\s*\{[\s\S]*?\}\s*from\s*[^;]+;\s*/, ''), {
        ...core, window, document, console,
        localStorage: { getItem: () => null, setItem() {} }
    }, { filename: 'syllable-slow-reader.js' });
    const settle = async () => { for (let i = 0; i < 4; i += 1) await Promise.resolve(); };
    return {
        input, range, document, spoken,
        get cancellations() { return cancellations; },
        type(value) { input.focus(); input.value = value; input.dispatch('input'); },
        keyDown(details = {}) {
            const event = input.dispatch('keydown', { key: 'Enter', ...details });
            if (event.key === 'Enter' && !event.defaultPrevented && !event.isComposing && event.keyCode !== 229) input.value += '\n';
            return event;
        },
        keyUp(details = {}) { return input.dispatch('keyup', { key: 'Enter', ...details }); },
        key(details = {}) { const event = this.keyDown(details); this.keyUp(details); return event; },
        async completeSpeech() { const finish = finishSpeech; finishSpeech = undefined; assert.ok(finish, '재생 중인 음성이 있어야 한다'); finish(true); await settle(); },
        async advance(milliseconds) {
            now += milliseconds;
            for (const [id, timer] of timers) {
                if (timer.due <= now) { timers.delete(id); timer.callback(); }
            }
            await settle();
        },
        settle
    };
}

test('Enter로 설정한 간격에 맞춰 현재 글자를 읽고 입력 상태를 유지한다', async () => {
    const reader = readerHarness();
    reader.type('가 나!');
    assert.equal(reader.key().defaultPrevented, true);
    assert.equal(reader.input.value, '가 나!');
    assert.equal(reader.document.activeElement, reader.input);
    assert.equal(reader.input.focusOptions?.preventScroll, true);
    assert.equal(reader.input.disabled, false);
    assert.equal(reader.input.readOnly, false);
    assert.deepEqual(reader.spoken.map(({ text }) => text), ['가']);
    assert.equal(reader.spoken[0].options.playbackRate, 0.72);
    await reader.completeSpeech();
    await reader.advance(699);
    assert.equal(reader.spoken.length, 1);
    await reader.advance(1);
    assert.deepEqual(reader.spoken.map(({ text, at }) => [text, at]), [['가', 0], ['나', 700]]);
    await reader.completeSpeech();
    assert.equal(reader.document.activeElement, reader.input);
    assert.equal(reader.input.value, '가 나!');
});

test('지우고 다시 입력한 Enter는 이전 음성과 대기를 취소하며 반복할 수 있다', async () => {
    const reader = readerHarness();
    reader.type('가나');
    reader.key();
    reader.type('');
    assert.equal(reader.cancellations, 1);
    reader.type('다라');
    reader.key();
    await reader.settle();
    await reader.completeSpeech();
    reader.type('');
    assert.equal(reader.cancellations, 2);
    reader.type('마바');
    reader.key();
    await reader.settle();
    await reader.advance(1000);
    assert.deepEqual(reader.spoken.map(({ text }) => text), ['가', '다', '마']);
    await reader.completeSpeech();
    await reader.advance(700);
    await reader.completeSpeech();
    assert.deepEqual(reader.spoken.map(({ text }) => text), ['가', '다', '마', '바']);
    assert.equal(reader.document.activeElement, reader.input);
    assert.equal(reader.input.value, '마바');
});

test('빈 입력과 한글 조합 중 Enter는 읽지 않고 길게 누른 Enter는 중복 재생하지 않는다', async () => {
    const reader = readerHarness();
    reader.type('');
    assert.equal(reader.key().defaultPrevented, true);
    assert.equal(reader.spoken.length, 0);
    reader.type('가');
    assert.equal(reader.key({ key: 'a' }).defaultPrevented, false);
    assert.equal(reader.key({ isComposing: true }).defaultPrevented, false);
    assert.equal(reader.key({ keyCode: 229 }).defaultPrevented, false);
    assert.equal(reader.spoken.length, 0);
    reader.keyDown();
    assert.equal(reader.keyDown({ repeat: true }).defaultPrevented, true);
    assert.equal(reader.spoken.length, 0);
    reader.keyUp();
    assert.deepEqual(reader.spoken.map(({ text }) => text), ['가']);
    assert.equal(reader.cancellations, 0);
    await reader.completeSpeech();
});

test('마지막 한글 음절이 조합 중이어도 Enter 한 번으로 확정된 전체 글자를 읽는다', async () => {
    const reader = readerHarness();
    reader.type('가ㄴ');
    assert.equal(reader.keyDown({ isComposing: true, keyCode: 229 }).defaultPrevented, false);
    assert.equal(reader.spoken.length, 0);
    reader.type('가나');
    reader.keyUp({ isComposing: false, keyCode: 13 });
    assert.deepEqual(reader.spoken.map(({ text }) => text), ['가']);
    assert.equal(reader.input.value, '가나');
    await reader.completeSpeech();
    await reader.advance(700);
    await reader.completeSpeech();
    assert.deepEqual(reader.spoken.map(({ text }) => text), ['가', '나']);
    assert.equal(reader.cancellations, 0);
    assert.equal(reader.document.activeElement, reader.input);
});
