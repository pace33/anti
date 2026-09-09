import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as core from '../word-card-table-core.mjs';

const source = readFileSync(new URL('../word-card-table-game.js', import.meta.url), 'utf8');

// Repository-shaped records are confined to tests. The real loader and validation
// run unchanged, including public-card filtering and image preparation.
const cards = ['나무', '바다', '사과', '우산', '하늘', '학교'].map((word, index) => {
    const id = `wc1_${String(index + 1).padStart(64, '0')}`;
    return {
        id, word, explanation: `저장소 설명 ${index + 1}`,
        status: 'published', isPublic: true, generationVersion: 1,
        illustration: { path: `SharedWordCards/${id}/generations/test_fixture/illustration.webp` }
    };
});
const imageUrl = card => `https://repository.example/${card.illustration.path}`;
const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function harness({ loadCards = () => cards, imageMode = 'success', reducedMotion = false, mobile = false } = {}) {
    let now = 0, nextFrame = 1, nextTimer = 1;
    const frames = new Map(), timers = new Map(), elements = new Map(), images = [];
    const calls = { loads: 0, urls: [], speech: [], stopSpeech: 0, scroll: [] };
    class Element {
        constructor(tagName = 'div', id = '') {
            Object.assign(this, {
                tagName: tagName.toUpperCase(), id, children: [], handlers: {}, attrs: {}, dataset: {}, style: {},
                hidden: false, disabled: false, inert: false, isConnected: true, _text: '', className: ''
            });
            this.classList = {
                contains: name => this.className.split(/\s+/).includes(name),
                add: name => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
                remove: name => { this.className = this.className.split(/\s+/).filter(item => item !== name).join(' '); },
                toggle: (name, force) => {
                    const include = force ?? !this.classList.contains(name);
                    this.classList[include ? 'add' : 'remove'](name); return include;
                }
            };
        }
        addEventListener(type, callback) { (this.handlers[type] ??= []).push(callback); }
        emit(type, props = {}) {
            for (const callback of this.handlers[type] ?? []) callback({ type, target: this, preventDefault() {}, ...props });
        }
        set textContent(value) { this._text = String(value); this.children = []; }
        get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
        set innerHTML(value) {
            this.children = [];
            for (const [, tagName, before, id, after] of value.matchAll(/<([a-z][\w-]*)\b([^>]*?)\bid="([^"]+)"([^>]*)>/g)) {
                const child = new Element(tagName, id), attrs = `${before} ${after}`;
                child.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attrs);
                child.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attrs);
                child.className = attrs.match(/class="([^"]*)"/)?.[1] ?? '';
                elements.set(id, child); this.append(child);
            }
        }
        append(...nodes) { this.children.push(...nodes); }
        replaceChildren(...nodes) { this._text = ''; this.children = [...nodes]; }
        querySelectorAll(selector) {
            const matches = node => selector.startsWith('.') ? node.classList.contains(selector.slice(1)) : node.tagName.toLowerCase() === selector;
            const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
            return descendants(this).filter(matches);
        }
        querySelector(selector) {
            const found = this.querySelectorAll(selector)[0];
            if (found) return found;
            // The controller only asks the static shell for these two containers.
            if (this.id === 'word-card-table-game-section' && ['.wct-main', '.wct-header'].includes(selector)) {
                const node = new Element(); node.className = selector.slice(1); this.append(node); return node;
            }
            return null;
        }
        setAttribute(name, value) { this.attrs[name] = String(value); }
        getAttribute(name) { return this.attrs[name] ?? null; }
        hasAttribute(name) { return name in this.attrs; }
        getBoundingClientRect() { return { left: 30, top: 100, width: 160, height: 220 }; }
        focus() { document.activeElement = this; }
        scrollIntoView(options) { calls.scroll.push({ id: this.id, ...options }); }
    }
    const section = new Element('section', 'word-card-table-game-section'); elements.set(section.id, section);
    const document = new Element('document'); document.body = new Element('body');
    document.hidden = false; document.activeElement = document.body;
    document.getElementById = id => elements.get(id) ?? null;
    document.createElement = tagName => new Element(tagName);
    const window = new Element('window'); window.location = {};
    window.matchMedia = query => ({ matches: query === '(prefers-reduced-motion: reduce)' ? reducedMotion : query === '(max-width: 620px)' ? mobile : false });
    window.aiedueWordCardTableSource = {
        loadCards() { calls.loads++; return loadCards(calls.loads); },
        async getImageUrl(card) { calls.urls.push(card.id); return imageUrl(card); },
        speak(text) { calls.speech.push(text); },
        stopSpeech() { calls.stopSpeech++; }
    };
    class TestImage {
        constructor() { this.naturalWidth = 0; images.push(this); }
        set src(value) {
            this.url = value;
            if (imageMode !== 'manual') queueMicrotask(() => this.complete(imageMode === 'success'));
        }
        complete(success = true) {
            this.naturalWidth = success ? 512 : 0;
            if (success) this.onload?.(); else this.onerror?.();
        }
    }
    vm.runInNewContext(source.replace(/^import[^\n]+\n/, ''), {
        ...core, document, window, Image: TestImage, AbortController, DOMException,
        performance: { now: () => now },
        requestAnimationFrame: callback => { const id = nextFrame++; frames.set(id, callback); return id; },
        cancelAnimationFrame: id => frames.delete(id),
        setTimeout: callback => { const id = nextTimer++; timers.set(id, callback); return id; },
        clearTimeout: id => timers.delete(id)
    });
    const el = id => elements.get(`wct-${id}`);
    const click = target => {
        const node = typeof target === 'string' ? el(target) : target;
        if (!node.disabled) { node.focus(); node.emit('click'); }
    };
    const advance = ms => {
        now += ms; const callbacks = [...frames.values()]; frames.clear();
        for (const callback of callbacks) callback(now);
    };
    const choices = () => el('choices').querySelectorAll('button');
    const answer = () => cards.find(card => imageUrl(card) === el('question').querySelector('img')?.src);
    const choiceFor = card => choices().find(node => node.querySelector('strong')?.textContent === card.word);
    const correctChoice = () => choiceFor(answer());
    const wrongChoice = () => choices().find(node => node !== correctChoice());
    async function begin() { click('start'); await settle(); advance(650); }
    function submit(correct = true) { click(correct ? correctChoice() : wrongChoice()); advance(650); }
    window.openWordCardTableGame();
    return { el, click, advance, choices, answer, correctChoice, wrongChoice, begin, submit, calls, frames, timers, images, section, window, document };
}

test('friend image and explanation appear with the name concealed while my four cards show words only', async () => {
    const g = harness(); g.click('start'); await settle();
    assert.equal(g.calls.loads, 1); assert.equal(g.calls.urls.length, 1);
    assert.equal(g.choices().length, 4);
    assert.ok(g.choices().every(button => button.disabled));
    const answer = g.answer(), question = g.el('question');
    assert.ok(answer, 'the displayed image belongs to the repository fixture');
    assert.equal(question.querySelector('strong').textContent, '? ? ?');
    assert.equal(question.querySelector('strong').getAttribute('aria-label'), '가려진 단어 이름');
    assert.equal(question.querySelector('p').textContent, answer.explanation);
    assert.ok(!question.textContent.includes(answer.word));
    assert.ok(!question.querySelector('img').alt.includes(answer.word));
    assert.equal(new Set(g.choices().map(button => button.querySelector('strong').textContent)).size, 4);
    assert.equal(g.choices().filter(button => button.querySelector('strong').textContent === answer.word).length, 1);
    assert.ok(g.choices().every(button => button.children.length === 1));
    assert.ok(g.choices().every(button => button.children[0].tagName === 'STRONG'));
    assert.ok(g.choices().every(button => button.textContent === button.querySelector('strong').textContent));
    assert.ok(g.choices().every(button => !button.querySelector('img') && !button.querySelector('p')));
    g.advance(649); assert.ok(g.choices().every(button => button.disabled));
    g.advance(1); assert.ok(g.choices().every(button => !button.disabled));
    g.click('listen'); assert.deepEqual(g.calls.speech, [answer.explanation]);
});

test('a correct card awards one point only after delivery, reveals its name, and claps', async () => {
    const g = harness(); await g.begin();
    const answer = g.answer(), selected = g.correctChoice(), other = g.wrongChoice();
    g.click(selected); g.advance(300);
    assert.equal(g.el('flying').hidden, false);
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.el('attempts').textContent, '0번');
    assert.equal(g.el('question').querySelector('strong').textContent, '? ? ?');
    other.emit('click'); selected.emit('click');
    g.advance(350);
    assert.equal(g.el('score').textContent, '1'); assert.equal(g.el('attempts').textContent, '1번');
    assert.equal(g.el('question').querySelector('strong').textContent, answer.word);
    assert.equal(g.el('friend').dataset.mood, 'happy'); assert.equal(g.el('point-pop').textContent, '+1');
    assert.equal(g.el('flying').hidden, true); assert.equal(g.el('next').hidden, false);
    assert.equal(g.document.activeElement, g.el('next'));
    selected.emit('click'); g.advance(10000);
    assert.equal(g.el('score').textContent, '1'); assert.equal(g.el('attempts').textContent, '1번');
});

test('a wrong card produces the oops reaction and preserves the existing score', async () => {
    const g = harness(); await g.begin(); g.submit();
    g.click('next'); await settle(); g.advance(650);
    const answer = g.answer(); g.submit(false);
    assert.equal(g.el('score').textContent, '1'); assert.equal(g.el('attempts').textContent, '2번');
    assert.equal(g.el('friend').dataset.mood, 'oops'); assert.equal(g.el('point-pop').textContent, '');
    assert.equal(g.el('question').querySelector('strong').textContent, answer.word);
    assert.equal(g.el('status').dataset.tone, 'oops'); assert.equal(g.el('next').hidden, false);
});

test('reduced motion hides the flying clone without moving it and still awards once after 650 ms', async () => {
    const g = harness({ reducedMotion: true }); await g.begin();
    assert.equal(g.el('question').style.transform, '');
    const selected = g.correctChoice(); g.click(selected);
    const initialTransform = g.el('flying').style.transform;
    g.advance(1);
    assert.equal(g.el('flying').hidden, true);
    assert.equal(g.el('flying').style.transform, initialTransform);
    g.advance(648);
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.el('attempts').textContent, '0번');
    assert.equal(g.el('flying').style.transform, initialTransform);
    selected.emit('click'); g.advance(1);
    assert.equal(g.el('score').textContent, '1'); assert.equal(g.el('attempts').textContent, '1번');
    assert.equal(g.el('friend').dataset.mood, 'happy'); assert.equal(g.el('flying').hidden, true);
    selected.emit('click'); g.advance(10000);
    assert.equal(g.el('score').textContent, '1'); assert.equal(g.el('attempts').textContent, '1번');
});

test('mobile reveal scrolls the friend reaction into view and respects reduced motion', async () => {
    for (const reducedMotion of [false, true]) {
        const g = harness({ mobile: true, reducedMotion }); await g.begin();
        g.click(g.correctChoice()); g.advance(649);
        assert.equal(g.calls.scroll.length, 0, 'scroll only when the reaction is ready');
        g.advance(1);
        assert.deepEqual(g.calls.scroll, [{ id: 'wct-friend', block: 'start', behavior: reducedMotion ? 'instant' : 'smooth' }]);
        assert.equal(g.el('friend').dataset.mood, 'happy');
        g.click('next'); await settle(); g.advance(650); g.submit(false);
        assert.equal(g.calls.scroll.length, 2, 'incorrect-answer reactions must also be visible');
        assert.equal(g.calls.scroll[1].id, 'wct-friend');
        assert.equal(g.el('friend').dataset.mood, 'oops');
    }
    const desktop = harness(); await desktop.begin(); desktop.submit();
    assert.equal(desktop.calls.scroll.length, 0, 'desktop play keeps the current view');
});

test('each next round reloads the repository and avoids immediately repeating the answer', async () => {
    const g = harness(); await g.begin();
    for (let index = 1; index <= 3; index++) {
        const oldAnswer = g.answer(); g.submit(index !== 2);
        g.click('next'); g.el('next').emit('click'); await settle();
        assert.equal(g.calls.loads, index + 1, 'a duplicate next click must not start another load');
        assert.equal(g.calls.urls.length, index + 1);
        assert.notEqual(g.answer().id, oldAnswer.id);
        assert.equal(g.el('question').querySelector('strong').textContent, '? ? ?');
        assert.equal(g.el('friend').dataset.mood, 'waiting');
        assert.equal(g.el('point-pop').textContent, '');
        g.advance(650);
    }
});

test('backgrounding mid-play prevents a hidden reward until an explicit resume', async () => {
    const g = harness(); await g.begin(); g.click(g.correctChoice()); g.advance(250);
    g.document.hidden = true; g.document.emit('visibilitychange'); g.advance(60000);
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.frames.size, 0);
    assert.equal(g.el('overlay').hidden, false); assert.equal(g.el('start').textContent, '이어서 하기');
    g.click('start'); assert.equal(g.frames.size, 0, 'hidden pages cannot resume');
    g.document.hidden = false; g.document.emit('visibilitychange');
    assert.equal(g.frames.size, 0, 'returning to the page does not automatically resume');
    g.click('start'); g.advance(399); assert.equal(g.el('score').textContent, '0');
    g.advance(1); assert.equal(g.el('score').textContent, '1');
    assert.equal(g.el('attempts').textContent, '1번');
});

test('Escape pause and resume return focus to a playable choice or next action', async () => {
    const g = harness(); await g.begin();
    g.section.emit('keydown', { key: 'Escape' }); g.click('start');
    assert.ok(g.choices().includes(g.document.activeElement));
    assert.equal(g.document.activeElement.disabled, false);
    g.submit(); g.section.emit('keydown', { key: 'Escape' }); g.click('start');
    assert.equal(g.document.activeElement, g.el('next'));
});

test('closing aborts image preparation and reopening cannot receive the abandoned result', async () => {
    const g = harness({ imageMode: 'manual' }); g.click('start'); await settle();
    assert.equal(g.images.length, 1); assert.equal(g.timers.size, 1);
    const abandoned = [...g.images];
    g.window.closeWordCardTableGame(); await settle();
    assert.ok(abandoned.every(img => img.onload === null && img.onerror === null));
    assert.equal(g.timers.size, 0); assert.equal(g.frames.size, 0);
    g.window.openWordCardTableGame(); g.click('start'); await settle();
    abandoned.forEach(img => img.complete()); await settle();
    assert.equal(g.choices().length, 0);
    g.images.slice(1).forEach(img => img.complete()); await settle(); g.advance(650);
    assert.equal(g.choices().length, 4); assert.equal(g.el('score').textContent, '0');
    assert.equal(g.calls.loads, 2);
});

test('a stale repository response cannot overwrite a newly opened game', async () => {
    const oldLoad = deferred();
    const g = harness({ loadCards: count => count === 1 ? oldLoad.promise : cards });
    g.click('start'); g.window.stopWordCardTableGame();
    g.window.openWordCardTableGame(); await g.begin();
    const currentPicture = g.el('question').querySelector('img').src;
    oldLoad.resolve(cards.slice(0, 2)); await settle(); g.advance(5000);
    assert.equal(g.el('question').querySelector('img').src, currentPicture);
    assert.equal(g.el('overlay').hidden, true); assert.equal(g.choices().length, 4);
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.calls.urls.length, 1);
});

test('closing and reopening during flight discard the pending score and old animation', async () => {
    const g = harness(); await g.begin(); g.click(g.correctChoice()); g.advance(200);
    const oldCallbacks = [...g.frames.values()]; g.window.stopWordCardTableGame();
    g.window.openWordCardTableGame(); oldCallbacks.forEach(callback => callback(10000)); g.advance(10000);
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.el('attempts').textContent, '0번');
    assert.equal(g.el('flying').hidden, true); assert.equal(g.frames.size, 0);
    assert.equal(g.el('overlay').hidden, false); assert.equal(g.choices().length, 0);
    await g.begin(); g.submit(); assert.equal(g.el('score').textContent, '1');
});

test('failed repository images stop the round without substitute cards', async () => {
    const g = harness({ imageMode: 'error' }); g.click('start'); await settle();
    assert.equal(g.el('overlay').hidden, false);
    assert.equal(g.el('overlay-title').textContent, '카드를 준비하지 못했어요');
    assert.equal(g.el('start').textContent, '다시 불러오기');
    assert.equal(g.el('repository').hidden, false);
    assert.equal(g.choices().length, 0); assert.equal(g.el('question').children.length, 0);
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.frames.size, 0);
    assert.equal(g.images.length, 1); assert.equal(g.timers.size, 0);
    assert.ok(g.images.every(img => img.url.startsWith('https://repository.example/SharedWordCards/')));
    g.click('start'); await settle(); assert.equal(g.calls.loads, 2);
});

test('fewer than four published cards shows the real count and retry reloads the repository', async () => {
    const g = harness({ loadCards: count => count === 1 ? cards.slice(0, 3) : cards });
    g.click('start'); await settle();
    assert.match(g.el('overlay-copy').textContent, /4장 이상/);
    assert.match(g.el('overlay-copy').textContent, /지금은 3장/);
    assert.equal(g.calls.urls.length, 0); assert.equal(g.images.length, 0); assert.equal(g.choices().length, 0);
    g.click('start'); await settle(); g.advance(650);
    assert.equal(g.calls.loads, 2); assert.equal(g.choices().length, 4); assert.equal(g.calls.urls.length, 1); assert.equal(g.el('overlay').hidden, true);
});

test('finish cannot interrupt loading, dealing, or a pending scored delivery', async () => {
    const load = deferred(), g = harness({ loadCards: () => load.promise });
    g.click('start'); assert.equal(g.el('finish').disabled, true);
    g.el('finish').emit('click'); load.resolve(cards); await settle();
    assert.equal(g.el('overlay').hidden, true); assert.equal(g.el('finish').disabled, true);
    g.el('finish').emit('click'); g.advance(650);
    assert.equal(g.el('finish').disabled, false);
    g.click(g.correctChoice()); assert.equal(g.el('finish').disabled, true);
    g.el('finish').emit('click'); g.advance(650);
    assert.equal(g.el('score').textContent, '1'); assert.equal(g.el('overlay').hidden, true);
    assert.equal(g.el('finish').disabled, false);
});

test('finish reports completed attempts and a new game resets score before reloading', async () => {
    const g = harness(); await g.begin(); g.submit();
    g.click('next'); await settle(); g.advance(650); g.submit(false);
    g.click('finish');
    assert.equal(g.el('overlay').hidden, false); assert.equal(g.el('overlay-title').textContent, '1점! 잘 놀았어요');
    assert.match(g.el('overlay-copy').textContent, /2장의 카드를 내고 1개의 단어/);
    assert.equal(g.el('start').textContent, '한 판 더 하기'); assert.equal(g.frames.size, 0);
    g.click('start');
    assert.equal(g.el('score').textContent, '0'); assert.equal(g.el('attempts').textContent, '0번');
    await settle(); g.advance(650);
    assert.equal(g.calls.loads, 3); assert.equal(g.el('round-number').textContent, '01');
    assert.equal(g.choices().length, 4); assert.equal(g.el('question').querySelector('strong').textContent, '? ? ?');
});
