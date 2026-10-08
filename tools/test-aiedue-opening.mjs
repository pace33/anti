import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const opening = readFileSync(new URL('../aiedue-opening.js', import.meta.url), 'utf8');
const openingCss = readFileSync(new URL('../aiedue-opening.css', import.meta.url), 'utf8');

function harness({ seen = false, reducedMotion = false, handler, rejectPlay = false } = {}) {
    const elements = [], timers = new Map(), observers = [];
    let nextTimer = 0, now = 0;
    class Events {
        listeners = new Map();
        addEventListener(type, callback, options = {}) {
            const listeners = this.listeners.get(type) || [];
            listeners.push({ callback, once: options.once });
            this.listeners.set(type, listeners);
        }
        removeEventListener(type, callback) {
            this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item.callback !== callback));
        }
        emit(type, detail = {}) {
            for (const item of [...(this.listeners.get(type) || [])]) {
                if (item.once) this.removeEventListener(type, item.callback);
                item.callback({ type, target: this, preventDefault() {}, ...detail });
            }
        }
    }
    const document = new Events();
    class Element extends Events {
        constructor(tagName, id, classes = '') {
            super();
            this.tagName = tagName;
            this.id = id;
            this.children = [];
            this.style = {};
            this.attributes = {};
            this.classes = new Set();
            this.className = classes;
            this.classList = {
                contains: value => this.classes.has(value),
                add: value => { this.classes.add(value); this.notifyClass(); },
                remove: value => { this.classes.delete(value); this.notifyClass(); }
            };
            this.paused = true;
            this.duration = 11.9;
            this.currentTime = 0;
            elements.push(this);
        }
        get className() { return [...this.classes].join(' '); }
        set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
        get isConnected() { return this === document.body || !!this.parent?.isConnected; }
        notifyClass() { for (const observer of observers) if (observer.target === this) observer.callback(); }
        append(...children) {
            for (const child of children) { child.remove(); child.parent = this; this.children.push(child); }
        }
        remove() {
            if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
            this.parent = null;
        }
        setAttribute(name, value) { this.attributes[name] = value; }
        removeAttribute(name) { delete this.attributes[name]; if (name === 'src') this.src = ''; }
        querySelector(selector) { return this.children.find(child => child.classList.contains(selector.slice(1))); }
        focus() { document.activeElement = this; }
        click() { this.emit('click'); }
        play() { this.paused = false; return rejectPlay ? Promise.reject(new Error('Playback unavailable')) : Promise.resolve(); }
        pause() { this.paused = true; }
        load() { this.loaded = true; }
        showModal() { this.open = true; }
        close() { this.open = false; }
    }
    document.body = new Element('body');
    const start = new Element('div', 'start-screen');
    const login = new Element('div', 'login-section', 'hidden');
    const button = new Element('button', null, 'btn-start');
    const replay = new Element('button', 'dashboard-intro-button');
    document.body.append(start, login, replay);
    start.append(button);
    document.activeElement = button;
    document.getElementById = id => elements.find(element => element.id === id);
    document.createElement = tag => new Element(tag);
    const motion = new Events();
    motion.matches = reducedMotion;
    const window = { matchMedia: () => motion };
    if (handler) window.showLoginFromStart = handler;
    const storage = new Map(seen ? [['aiedue-star-opening-gemini-v2', '1']] : []);
    const context = {
        document, window,
        sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe(target) { this.target = target; }
            disconnect() { this.target = null; }
        },
        setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id)
    };
    // The real start button's inline click calls this same global entry point.
    button.addEventListener('click', () => window.showLoginFromStart());
    vm.runInNewContext(opening, context, { filename: 'aiedue-opening.js' });
    const video = () => elements.filter(element => element.tagName === 'video').at(-1);
    return {
        start, login, button, replay, document, window, motion, video,
        overlay: () => video()?.parent,
        begin() { video().emit('canplay'); video().emit('playing'); },
        advance(ms) {
            const end = now + ms;
            for (;;) {
                const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
                if (!due) break;
                now = due[1].at;
                timers.delete(due[0]);
                due[1].callback();
            }
            now = end;
        }
    };
}

function assertUnlocked(h) {
    assert.equal(h.start.classList.contains('is-opening'), false, 'real start button is visible again');
    assert.equal(h.overlay().classList.contains('is-ending'), true, 'overlay no longer intercepts clicks');
    assert.equal(h.video().paused, true);
    h.advance(700);
    assert.equal(h.overlay().isConnected, false, 'finished overlay is removed after its fade');
}

test('automatic intro hands over before its drawn start button appears', () => {
    const h = harness(); h.begin();
    const overlay = h.overlay();
    overlay.children[1].focus();
    assert.equal(h.start.classList.contains('is-opening'), true);
    h.video().currentTime = 9.34; h.video().emit('timeupdate');
    assert.equal(overlay.classList.contains('is-ending'), false);
    h.video().currentTime = 9.35; h.video().emit('timeupdate');
    assert.equal(h.document.activeElement, h.button);
    assert.match(openingCss, /#start-screen\s*>\s*\.aiedue-opening\.is-ending\s*\{[^}]*pointer-events:\s*none\s*;/);
    assertUnlocked(h);
});

test('shorter automatic videos hand over before their natural end', () => {
    const h = harness(); h.begin();
    h.video().duration = 7;
    h.video().currentTime = 6.34; h.video().emit('timeupdate');
    assert.equal(h.start.classList.contains('is-opening'), true);
    h.video().currentTime = 6.36; h.video().emit('timeupdate');
    assertUnlocked(h);
});

test('natural ending restores the real start button and clicking opens login without app.js', () => {
    const h = harness(); h.begin(); h.video().emit('ended');
    assertUnlocked(h);
    h.button.click();
    assert.equal(h.start.classList.contains('hidden'), true);
    assert.equal(h.start.style.display, 'none');
    assert.equal(h.login.classList.contains('hidden'), false);
    assert.equal(h.login.style.display, 'flex');
});

test('startup navigation can finish an active intro and reveal login', () => {
    const h = harness(); h.begin(); h.button.click();
    assert.equal(h.start.classList.contains('hidden'), true);
    assert.equal(h.login.style.display, 'flex');
    assertUnlocked(h);
});

test('startup fallback preserves an existing app handler and allows later replacement', () => {
    let calls = 0;
    const handler = () => calls++;
    const ready = harness({ seen: true, handler });
    assert.equal(ready.window.showLoginFromStart, handler);
    ready.button.click(); assert.equal(calls, 1);
    const loading = harness({ seen: true });
    loading.window.showLoginFromStart = handler;
    loading.button.click(); assert.equal(calls, 2);
});

for (const exit of ['skip', 'Escape', 'error']) {
    test(`${exit} unlocks the automatic intro immediately`, () => {
        const h = harness(); h.begin();
        if (exit === 'skip') h.overlay().children[1].click();
        else if (exit === 'Escape') h.document.emit('keydown', { key: 'Escape' });
        else h.video().emit('error');
        assertUnlocked(h);
    });
}

test('loading and stalled playback watchdogs restore access to start', () => {
    const loading = harness(); loading.advance(5000); assertUnlocked(loading);
    const stalled = harness(); stalled.begin(); stalled.advance(24999);
    assert.equal(stalled.start.classList.contains('is-opening'), true);
    stalled.advance(1); assertUnlocked(stalled);
});

test('autoplay rejection unlocks start', async () => {
    const h = harness({ rejectPlay: true }); h.video().emit('canplay');
    await Promise.resolve();
    assertUnlocked(h);
});

test('manual replay keeps playing past the automatic handover and restores focus when ended', () => {
    const h = harness({ seen: true }); h.replay.focus(); h.replay.click();
    const overlay = h.overlay();
    h.video().emit('playing'); h.video().currentTime = 9.5; h.video().emit('timeupdate');
    assert.equal(overlay.open, true);
    assert.equal(overlay.classList.contains('is-ending'), false);
    assert.equal(h.video().paused, false);
    h.video().emit('ended');
    assert.equal(overlay.open, false);
    assert.equal(h.document.activeElement, h.replay);
    assertUnlocked(h);
});

test('reduced motion and a seen session skip the video but retain startup navigation', () => {
    for (const options of [{ reducedMotion: true }, { seen: true }]) {
        const h = harness(options);
        assert.equal(h.video(), undefined);
        h.button.click();
        assert.equal(h.start.style.display, 'none');
        assert.equal(h.login.classList.contains('hidden'), false);
        assert.equal(h.login.style.display, 'flex');
    }
});

test('a reduced motion change finishes an intro already playing', () => {
    const h = harness(); h.begin(); h.motion.matches = true; h.motion.emit('change');
    assertUnlocked(h);
});
