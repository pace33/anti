import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function section(start, end) {
    const from = app.indexOf(start), to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from);
    return app.slice(from, to);
}
const setupSource = section('function setLiteracyCompanionState', 'window.selectLiteracyMultipleChoice = function');
const resultSource = section('async function showLiteracyResult', 'window.claimLiteracyWrongReviewReward');

function harness(persist) {
    const elements = new Map();
    const element = (id) => {
        if (!elements.has(id)) elements.set(id, {
            dataset: { state: 'reading' }, style: {}, value: '',
            classList: { add() {}, remove() {} }, insertAdjacentHTML() {}
        });
        return elements.get(id);
    };
    const errors = [];
    const context = vm.createContext({
        document: { getElementById: element },
        activeLiteracyQuestion: {}, userLiteracyAnswerChecked: true, isLiteracyLimitBreakMode: false,
        showTopLevelSection() {}, updateLiteracyDanBadges() {},
        normalizeLiteracyKeywords: () => [], escapeHtml: String,
        normalizeLiteracyScore: (value) => value ?? null,
        createLiteracyAttemptPayload: (isCorrect, details) => ({ ...details, isCorrect, question: {}, attemptId: 'test' }),
        persistLiteracyAttemptAtomic: persist || (async (attempt) => ({ canonicalAttempt: attempt })),
        applyCommittedLiteracyAttempt() {}, showLiteracyPromotionNotice() {},
        showModal: (message) => errors.push(message), console: { error() {} },
        window: { setInterval() {}, clearInterval() {} }
    });
    vm.runInContext(setupSource + resultSource, context);
    return { context, element, errors, state: () => element('literacy-reading-companion').dataset.state };
}

test('saved canonical result chooses the companion for both correct and incorrect answers', async () => {
    for (const correct of [true, false]) {
        const h = harness(async (attempt) => ({ canonicalAttempt: { ...attempt, isCorrect: correct } }));
        assert.equal(await h.context.showLiteracyResult(!correct, {}), true);
        assert.equal(h.state(), correct ? 'correct' : 'incorrect');
        assert.deepEqual(h.errors, []);
    }
});

test('all three question formats restore the reading pose on the next question', () => {
    const h = harness();
    for (const type of ['multipleChoice', 'shortAnswer', 'essay']) {
        h.context.setLiteracyCompanionState('incorrect');
        h.context.setupLiteracyWorkspace({ type, difficulty: 'easy', passage: '지문', question: '문제', options: ['하나'] });
        assert.equal(h.state(), 'reading');
        assert.equal(h.context.userLiteracyAnswerChecked, false);
    }
});

test('the companion waits for persistence and stays reading after a failed save', async () => {
    let reject;
    const h = harness(() => new Promise((_, fail) => { reject = fail; }));
    const pending = h.context.showLiteracyResult(true, {});
    assert.equal(h.state(), 'reading');
    reject(new Error('offline'));
    assert.equal(await pending, false);
    assert.equal(h.state(), 'reading');
    assert.equal(h.context.userLiteracyAnswerChecked, false);
    assert.equal(h.errors.length, 1);
});

test('a delayed result from the previous question cannot change the new companion', async () => {
    let finish;
    const h = harness((attempt) => new Promise((resolve) => { finish = () => resolve({ canonicalAttempt: attempt }); }));
    const pending = h.context.showLiteracyResult(false, {});
    h.context.setupLiteracyWorkspace({ type: 'shortAnswer', difficulty: 'easy', passage: '다음 지문', question: '다음 문제' });
    finish();
    await pending;
    assert.equal(h.state(), 'reading');
    assert.deepEqual(h.errors, []);
});

test('missing decorative markup does not break result rendering', async () => {
    const h = harness();
    h.context.document.getElementById = (id) => id === 'literacy-reading-companion' ? null : h.element(id);
    await h.context.showLiteracyResult(true, {});
    assert.deepEqual(h.errors, []);
});
