import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import {
    buildWordCardId,
    buildWordCardIllustrationPath,
    getWordCardResolution,
    isValidWordCardIllustrationPath,
    sortPublishedWordCards,
    WORD_CARD_GENERATION_VERSION
} from '../word-card-utils.mjs';

const [app, html] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8')
]);
function between(start, end) {
    const from = app.indexOf(start), to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `missing app section: ${start}`);
    return app.slice(from, to);
}
const sourceCode = between('async function getSharedWordCardImageUrl', 'async function renderSharedWordCardDetail');
const facadeCode = sourceCode.slice(sourceCode.indexOf('window.aiedueWordCardTableSource'));

// These records exist only in tests; production rounds must come from the
// application's authenticated shared repository and storage facade.
const cardId = await buildWordCardId('나무');
const card = Object.freeze({
    id: cardId, word: '나무', explanation: '줄기와 잎이 있는 식물이에요.',
    status: 'published', isPublic: true, generationVersion: WORD_CARD_GENERATION_VERSION,
    illustration: Object.freeze({ path: buildWordCardIllustrationPath(cardId, 'source-test-generation') })
});
const snapshot = entries => ({ docs: entries.map(entry => ({ id: entry.id, data: () => entry.data })) });
const validSnapshot = () => snapshot([{ id: cardId, data: card }]);
function deferred() {
    let resolve;
    const promise = new Promise(yes => { resolve = yes; });
    return { promise, resolve };
}

function harness({ readCatalog = validSnapshot, readImage = () => 'blob:repository/tree' } = {}) {
    const calls = { queries: [], images: [], spoken: [], stopped: 0 };
    const context = {
        window: {}, auth: { currentUser: { uid: 'student-1' } }, currentUserId: 'student-1',
        db: {}, storage: {}, SHARED_WORD_CARD_COLLECTION: 'sharedWordCardsV1', WORD_CARD_GENERATION_VERSION,
        collection: (_db, path) => ({ path }),
        where: (field, operator, value) => ({ field, operator, value }),
        queryLimit: count => ({ count }),
        query: (collection, ...constraints) => ({ collection, constraints }),
        getDocs: async query => { calls.queries.push(query); return readCatalog(); },
        storageRef: (_storage, path) => ({ path }),
        getDownloadURL: async reference => { calls.images.push(reference.path); return readImage(); },
        sortPublishedWordCards, getWordCardResolution, isValidWordCardIllustrationPath,
        speakTextKo: text => calls.spoken.push(text), cancelSpeech: () => { calls.stopped += 1; }
    };
    // Execute the actual helper and facade, not a duplicate implementation.
    vm.runInNewContext(sourceCode, context);
    return { context, calls, source: context.window.aiedueWordCardTableSource };
}

test('the public game facade is immutable, read-only, and delegates speech to the existing player', () => {
    const { source, calls } = harness();
    assert.equal(Object.isFrozen(source), true);
    assert.deepEqual(Object.keys(source), ['loadCards', 'getImageUrl', 'speak', 'stopSpeech']);
    assert.doesNotMatch(facadeCode, /\b(?:setDoc|updateDoc|deleteDoc|runTransaction|ensureSharedWordCard|claimSharedWordCard|generateSharedWordCard|commitAsteroidRun|awardKoreanPracticeExperience|applyAiedueExperienceReward)\s*\(/);
    assert.doesNotMatch(facadeCode, /\bfetch\s*\(/);
    source.speak(card.explanation); source.stopSpeech();
    assert.deepEqual(calls.spoken, [card.explanation]);
    assert.equal(calls.stopped, 1);
    assert.equal(calls.queries.length, 0); assert.equal(calls.images.length, 0);
});

test('catalog reads query published public version-1 cards within the data-server limit of 100', async () => {
    const { source, calls } = harness();
    const cards = await source.loadCards();
    assert.equal(cards.length, 1); assert.equal(cards[0].id, cardId);
    assert.equal(calls.queries.length, 1);
    assert.equal(calls.queries[0].collection.path, 'sharedWordCardsV1');
    assert.deepEqual(JSON.parse(JSON.stringify(calls.queries[0].constraints)), [
        { field: 'status', operator: '==', value: 'published' },
        { field: 'isPublic', operator: '==', value: true },
        { field: 'generationVersion', operator: '==', value: 1 },
        { count: 100 }
    ]);
});

test('snapshot IDs override stored IDs and returned rows still undergo shared-card validation', async () => {
    const { source } = harness({ readCatalog: () => snapshot([
        { id: cardId, data: { ...card, id: 'injected-document-id' } },
        { id: 'invalid-snapshot-id', data: card },
        { id: cardId, data: { ...card, isPublic: false } },
        { id: cardId, data: { ...card, status: 'generating' } },
        { id: cardId, data: { ...card, generationVersion: 2 } },
        { id: cardId, data: { ...card, illustration: { path: '/unrelated-image.webp' } } }
    ]) });
    const cards = await source.loadCards();
    assert.equal(cards.length, 1);
    assert.equal(cards[0].id, cardId);
    assert.equal(cards[0].illustration.path, card.illustration.path);
});

test('missing or mismatched authentication blocks catalog and image reads before any I/O', async () => {
    for (const [authUid, profileUid] of [[null, null], [null, 'student-1'], ['student-2', 'student-1'], ['student-1', null]]) {
        const { context, source, calls } = harness();
        context.auth.currentUser = authUid ? { uid: authUid } : null;
        context.currentUserId = profileUid;
        await assert.rejects(source.loadCards(), { code: 'cards/login-required' });
        await assert.rejects(source.getImageUrl(card), { code: 'cards/login-required' });
        assert.equal(calls.queries.length, 0); assert.equal(calls.images.length, 0);
    }
});

test('an account switch or sign-out during a catalog await cannot deliver the old response', async () => {
    for (const nextUid of [null, 'student-2']) {
        const response = deferred();
        const { context, source, calls } = harness({ readCatalog: () => response.promise });
        const pending = source.loadCards();
        const rejected = assert.rejects(pending, { code: 'cards/login-required' });
        assert.equal(calls.queries.length, 1);
        context.auth.currentUser = nextUid ? { uid: nextUid } : null;
        context.currentUserId = nextUid;
        response.resolve(validSnapshot());
        await rejected;
    }
});

test('image reads use the existing validated repository storage path, ignoring injected URLs', async () => {
    const { source, calls } = harness();
    assert.equal(await source.getImageUrl({ ...card, imageUrl: 'https://injected.invalid/demo.webp' }), 'blob:repository/tree');
    assert.deepEqual(calls.images, [card.illustration.path]);
    for (const invalid of [
        { ...card, isPublic: false }, { ...card, status: 'failed' },
        { ...card, generationVersion: 2 }, { ...card, id: 'invalid-id' },
        { ...card, illustration: { path: 'https://injected.invalid/demo.webp' } }
    ]) await assert.rejects(source.getImageUrl(invalid));
    assert.equal(calls.images.length, 1, 'invalid image cards must never reach storage');
});

test('identity changes during a storage await reject the image before it can enter the game', async () => {
    for (const change of ['auth', 'profile', 'both', 'sign-out']) {
        const image = deferred();
        const { context, source, calls } = harness({ readImage: () => image.promise });
        const pending = source.getImageUrl(card);
        const rejected = assert.rejects(pending, { code: 'cards/login-required' });
        assert.equal(calls.images.length, 1);
        if (change === 'auth' || change === 'both') context.auth.currentUser = { uid: 'student-2' };
        if (change === 'profile' || change === 'both') context.currentUserId = 'student-2';
        if (change === 'sign-out') { context.auth.currentUser = null; context.currentUserId = null; }
        image.resolve('blob:obsolete-account-image');
        await rejected;
    }
});

test('catalog and storage failures propagate without alternate data or image sources', async () => {
    const failure = new Error('repository unavailable');
    const catalog = harness({ readCatalog: () => { throw failure; } });
    await assert.rejects(catalog.source.loadCards(), error => error === failure);
    assert.equal(catalog.calls.queries.length, 1); assert.equal(catalog.calls.images.length, 0);
    const storage = harness({ readImage: () => { throw failure; } });
    await assert.rejects(storage.source.getImageUrl(card), error => error === failure);
    assert.equal(storage.calls.images.length, 1);
});

test('the stage-3 lab action is allowlisted, launches the controller, and registers its section and assets', () => {
    const allowlist = between('const SAFE_MODAL_ACTIONS', 'function isSafeModalAction');
    assert.match(allowlist, /'openAiedueLabWordCardGame'/);
    const lab = between('window.openAiedueLab =', 'window.openAiedueLabDictationGame =');
    assert.match(lab, /onclick="openAiedueLabWordCardGame\(\)"/);
    assert.match(lab, /단어 카드 한 판/); assert.match(lab, /한글 3단계/);
    let launched = 0;
    const launcher = { window: { openWordCardTableGame: () => { launched += 1; } } };
    vm.runInNewContext(between('window.openAiedueLabWordCardGame =', 'window.openAiedueLabTimeQuiz ='), launcher);
    launcher.window.openAiedueLabWordCardGame();
    assert.equal(launched, 1);
    assert.match(between('const topLevelSectionIds', 'function getVisibleDisplayValue'), /'word-card-table-game-section'/);
    assert.match(html, /<section\b[^>]*id="word-card-table-game-section"[^>]*class="[^"]*view-section[^"]*word-card-table-game[^"]*hidden"[^>]*aria-labelledby="wct-title"[^>]*><\/section>/);
    assert.match(html, /<link\b[^>]*href="word-card-table\.css\?v=[^"]+"/);
    assert.match(html, /<script\b[^>]*type="module"[^>]*src="word-card-table-game\.js\?v=[^"]+"/);
    assert.match(html, /<script\b[^>]*type="module"[^>]*src="app\.js\?v=[^"]*word-card-table[^"]*"/);
});

test('navigation and auth integration stop obsolete games and keep the RPG HUD hidden', () => {
    const navigation = between('function showTopLevelSection', 'window.showAiedueTopLevelSection');
    assert.match(navigation, /if \(!isWordCardGame\) window\.stopWordCardTableGame\?\.\(\)/);
    assert.match(navigation, /classList\.toggle\('word-card-table-open', isWordCardGame\)/);
    assert.match(navigation, /setRpgHudVisible\([\s\S]*&& !isWordCardGame/);
    assert.match(between('function setRpgHudVisible', 'function removeDeprecatedRpgWordBankActions'), /!document\.body\.classList\.contains\('word-card-table-open'\)/);
    const authStart = app.indexOf('onAuthStateChanged(auth, async (user) => {');
    const guardStart = app.indexOf('\n', authStart) + 1;
    const guardEnd = app.indexOf('    if (!user) {', guardStart);
    assert.ok(authStart >= 0 && guardEnd > guardStart);
    let stopped = 0; const routes = [];
    const context = {
        currentUserId: 'student-1',
        window: { stopWordCardTableGame: () => { stopped += 1; } },
        document: { getElementById: id => ({ classList: { contains: () => id !== 'word-card-table-game-section' } }) },
        showTopLevelSection: route => routes.push(route)
    };
    vm.runInNewContext(`function checkIdentity(user) {${app.slice(guardStart, guardEnd)}}`, context);
    context.checkIdentity({ uid: 'student-1' });
    assert.equal(stopped, 0);
    context.checkIdentity({ uid: 'student-2' });
    context.checkIdentity(null);
    assert.equal(stopped, 2);
    assert.deepEqual(routes, ['start-screen', 'start-screen']);
});
