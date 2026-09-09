import test from 'node:test';
import assert from 'node:assert/strict';
import {
    playableWordCards,
    shuffleCards,
    createWordCardRound,
    createWordCardState,
    resolveWordCardAnswer,
    loadWordCardRound
} from '../word-card-table-core.mjs';
import {
    buildWordCardId,
    buildWordCardIllustrationPath,
    WORD_CARD_GENERATION_VERSION,
    normalizeWordCardWord
} from '../word-card-utils.mjs';

// Authored fixtures are deliberately confined to tests. Production questions
// must be returned by the shared repository and its storage facade.
async function cardFixture(word) {
    const id = await buildWordCardId(word);
    return Object.freeze({
        id, word, explanation: `${word}의 뜻을 설명하는 저장소 문장이에요.`,
        status: 'published', isPublic: true,
        generationVersion: WORD_CARD_GENERATION_VERSION,
        illustration: Object.freeze({ path: buildWordCardIllustrationPath(id, 'test-generation-token') })
    });
}
const fixtures = Object.freeze(await Promise.all(['가방', '나무', '다리', '바다', '사과', '하늘'].map(cardFixture)));
const fixtureIds = fixtures.map(card => card.id);

function deferred() {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function repository(cards = fixtures) {
    return {
        loadCards: async () => cards,
        getImageUrl: async card => `blob:repository/${card.id}`
    };
}

function assertRound(round, cards) {
    const allowed = new Set(cards.map(card => card.id));
    assert.equal(round.choices.length, 4);
    assert.equal(new Set(round.choices.map(card => card.id)).size, 4);
    assert.equal(new Set(round.choices.map(card => normalizeWordCardWord(card.word))).size, 4);
    assert.equal(round.choices.filter(card => card.id === round.answer.id).length, 1);
    assert.ok(round.choices.every(card => allowed.has(card.id)));
}

test('only published public version-1 cards with their own repository image path are playable', () => {
    const valid = fixtures[0];
    const invalid = [
        { ...valid, status: 'generating' },
        { ...valid, status: 'failed' },
        { ...valid, status: 'draft' },
        { ...valid, isPublic: false },
        { ...valid, isPublic: 'true' },
        { ...valid, generationVersion: WORD_CARD_GENERATION_VERSION + 1 },
        { ...valid, generationVersion: undefined },
        { ...valid, id: 'untrusted-card-id' },
        { ...valid, illustration: fixtures[1].illustration },
        { ...valid, illustration: { path: 'https://example.invalid/card.webp' } },
        { ...valid, illustration: { path: valid.illustration.path.replace('illustration.webp', '../illustration.webp') } },
        { ...valid, illustration: null },
        { ...valid, word: '' },
        { ...valid, word: '   ' },
        { ...valid, word: {} },
        { ...valid, explanation: '' },
        { ...valid, explanation: ' \n ' },
        { ...valid, explanation: {} },
        null, undefined
    ];
    for (const candidate of invalid) {
        assert.deepEqual(playableWordCards([candidate]), [], `unexpected playable card: ${JSON.stringify(candidate)}`);
    }
    assert.deepEqual(playableWordCards([valid]), [valid]);
    assert.deepEqual(playableWordCards(), []);
});

test('duplicate document IDs and equivalent normalized words never create duplicate choices', async () => {
    const fullWidth = await cardFixture('Ａ 나무');
    const normalWidth = await cardFixture('A 나무');
    const anotherId = await cardFixture('독립 문서');
    const candidates = [
        ...fixtures,
        { ...fixtures[0] },
        { ...fixtures[0], word: '다른 표기지만 같은 문서' },
        { ...anotherId, word: '  나무!  ' },
        fullWidth, normalWidth,
        { ...await cardFixture('대소문자 별도 문서'), word: 'a 나무' }
    ];
    const cards = playableWordCards(candidates);
    const ids = cards.map(card => card.id);
    const words = cards.map(card => normalizeWordCardWord(card.word).toLocaleLowerCase('ko'));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(new Set(words).size, words.length);
    assert.equal(ids.filter(id => id === fixtures[0].id).length, 1);
    assert.equal(words.filter(word => word === '나무').length, 1);
    assert.equal(words.filter(word => word === 'a 나무').length, 1);
});

test('each shuffle preserves real input cards without modifying the repository snapshot', () => {
    for (const value of [0, .2, .5, .999999]) {
        const shuffled = shuffleCards(fixtures, () => value);
        assert.notStrictEqual(shuffled, fixtures);
        assert.deepEqual(shuffled.map(card => card.id).sort(), [...fixtureIds].sort());
        assert.ok(shuffled.every(card => fixtures.includes(card)));
        assert.deepEqual(fixtures.map(card => card.id), fixtureIds);
    }
});

test('every round has four distinct repository cards, exactly one answer and no repeated target', () => {
    for (const cards of [fixtures.slice(0, 4), fixtures]) {
        for (const previous of cards) {
            for (const value of [0, .15, .48, .77, .999999]) {
                const round = createWordCardRound(cards, previous.id, () => value);
                assertRound(round, cards);
                assert.notEqual(round.answer.id, previous.id);
                assert.equal(round.availableCount, cards.length);
                assert.ok(round.choices.every(card => cards.includes(card)));
            }
        }
    }
});

test('fewer than four distinct usable repository cards fails without authored fallback choices', async () => {
    for (let count = 0; count < 4; count += 1) {
        const cards = fixtures.slice(0, count);
        assert.throws(() => createWordCardRound(cards), { code: 'cards/too-few' });
        let mediaReads = 0;
        await assert.rejects(loadWordCardRound({
            loadCards: async () => cards,
            getImageUrl: async () => { mediaReads += 1; return 'blob:unexpected'; }
        }), { code: 'cards/too-few' });
        assert.equal(mediaReads, 0);
    }
    assert.throws(() => createWordCardRound(Array(8).fill(fixtures[0])), { code: 'cards/too-few' });
});

test('each next round rereads the source and immediately reflects repository additions and removals', async () => {
    let cards = fixtures.slice(0, 4), reads = 0;
    const source = {
        loadCards: async () => { reads += 1; return cards; },
        getImageUrl: async card => `blob:repository/${card.id}`
    };
    let previousId = '';
    for (let index = 0; index < 3; index += 1) {
        cards = fixtures.slice(index, index + 4);
        const round = await loadWordCardRound(source, { previousId, random: () => .999 });
        assert.equal(reads, index + 1);
        assertRound(round, cards);
        assert.deepEqual(round.choices.map(card => card.id).sort(), cards.map(card => card.id).sort());
        assert.notEqual(round.answer.id, previousId);
        if (index) {
            assert.ok(round.choices.some(card => card.id === fixtures[index + 3].id), 'new repository card missing');
            assert.ok(!round.choices.some(card => card.id === fixtures[index - 1].id), 'removed repository card reused');
        }
        previousId = round.answer.id;
    }
});

test('only the friend answer image comes from storage; four text choices never load media', async () => {
    const cards = fixtures.slice(0, 4).map(card => ({ ...card, imageUrl: 'https://injected.invalid/demo.webp' }));
    const loaded = [], prepared = [];
    const controller = new AbortController();
    const round = await loadWordCardRound({
        loadCards: async () => cards,
        getImageUrl: async card => { loaded.push(card.id); return `blob:repository/${card.id}`; }
    }, {
        signal: controller.signal,
        prepareImage: async (url, signal) => { prepared.push(url); assert.strictEqual(signal, controller.signal); }
    });
    assertRound(round, cards);
    assert.deepEqual(loaded, [round.answer.id]);
    assert.deepEqual(prepared, [`blob:repository/${round.answer.id}`]);
    assert.equal(round.answer.imageUrl, `blob:repository/${round.answer.id}`);
    assert.ok(round.choices.every(card => !Object.hasOwn(card, 'imageUrl')));
    assert.notStrictEqual(round.answer, round.choices.find(card => card.id === round.answer.id));
    assert.ok(cards.every(card => card.imageUrl === 'https://injected.invalid/demo.webp'), 'source card mutated');
});

test('missing repository services and catalog failures reject instead of providing demonstration data', async () => {
    for (const source of [undefined, {}, { loadCards: async () => fixtures }, { getImageUrl: async () => 'blob:test' }]) {
        await assert.rejects(loadWordCardRound(source));
    }
    const failure = new Error('repository unavailable');
    let mediaReads = 0;
    await assert.rejects(loadWordCardRound({
        loadCards: async () => { throw failure; },
        getImageUrl: async () => { mediaReads += 1; return 'blob:unexpected'; }
    }), error => error === failure);
    assert.equal(mediaReads, 0);
});

test('failed, missing or unusable storage images never produce playable fallback rounds', async () => {
    for (const imageUrl of ['', null, undefined, 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
        let prepared = 0;
        await assert.rejects(loadWordCardRound({
            loadCards: async () => fixtures.slice(0, 4),
            getImageUrl: async () => imageUrl
        }, { prepareImage: async () => { prepared += 1; } }));
        assert.equal(prepared, 0);
    }
    const storageFailure = new Error('storage download failed');
    await assert.rejects(loadWordCardRound({
        loadCards: async () => fixtures,
        getImageUrl: async () => { throw storageFailure; }
    }), error => error === storageFailure);
    const decodeFailure = new Error('image decode failed');
    await assert.rejects(loadWordCardRound(repository(), {
        prepareImage: async () => { throw decodeFailure; }
    }), error => error === decodeFailure);
});

test('an already aborted request never starts a catalog read', async () => {
    const controller = new AbortController();
    controller.abort();
    let reads = 0;
    await assert.rejects(loadWordCardRound({
        ...repository(), loadCards: async () => { reads += 1; return fixtures; }
    }, { signal: controller.signal }), { name: 'AbortError' });
    assert.equal(reads, 0);
});

test('abort while awaiting the catalog blocks all subsequent image loads', async () => {
    const controller = new AbortController(), catalog = deferred();
    let mediaReads = 0;
    const pending = loadWordCardRound({
        loadCards: () => catalog.promise,
        getImageUrl: async () => { mediaReads += 1; return 'blob:unexpected'; }
    }, { signal: controller.signal });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    controller.abort();
    catalog.resolve(fixtures);
    await rejected;
    assert.equal(mediaReads, 0);
});

test('abort while awaiting the friend image URL prevents image preparation and returning a round', async () => {
    const controller = new AbortController(), image = deferred(), started = deferred();
    let prepared = 0;
    const pending = loadWordCardRound({
        loadCards: async () => fixtures,
        getImageUrl: () => { started.resolve(); return image.promise; }
    }, {
        signal: controller.signal,
        prepareImage: async () => { prepared += 1; }
    });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await started.promise;
    controller.abort();
    image.resolve('blob:repository/image');
    await rejected;
    assert.equal(prepared, 0);
});

test('abort during image decode prevents the completed media from reviving an obsolete round', async () => {
    const controller = new AbortController(), decoded = deferred(), started = deferred();
    const pending = loadWordCardRound(repository(), {
        signal: controller.signal,
        prepareImage: () => { started.resolve(); return decoded.promise; }
    });
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await started.promise;
    controller.abort();
    decoded.resolve();
    await rejected;
});

test('a new play session owns independent zero score and attempts', () => {
    const first = createWordCardState(), second = createWordCardState();
    assert.deepEqual(first, { status: 'ready', score: 0, attempts: 0 });
    first.score = 9;
    first.attempts = 12;
    assert.deepEqual(second, { status: 'ready', score: 0, attempts: 0 });
});

test('input outside the choosing phase or outside the current four cards cannot award points', () => {
    const round = createWordCardRound(fixtures.slice(0, 4));
    for (const status of ['ready', 'loading', 'feedback', 'closed', 'error']) {
        const state = Object.freeze({ status, score: 3, attempts: 5 });
        assert.strictEqual(resolveWordCardAnswer(state, round, round.answer.id), state);
    }
    const state = Object.freeze({ status: 'choosing', score: 3, attempts: 5 });
    for (const selectedId of [fixtures[5].id, 'invented-answer', '', undefined]) {
        assert.strictEqual(resolveWordCardAnswer(state, round, selectedId), state);
    }
    assert.strictEqual(resolveWordCardAnswer(state, null, fixtures[0].id), state);
});

test('a wrong answer counts one attempt with no score and cannot be changed into a reward', () => {
    const round = createWordCardRound(fixtures);
    const wrong = round.choices.find(card => card.id !== round.answer.id);
    const before = Object.freeze({ status: 'choosing', score: 2, attempts: 4 });
    const result = resolveWordCardAnswer(before, round, wrong.id);
    assert.deepEqual(result, { status: 'feedback', score: 2, attempts: 5, correct: false });
    assert.strictEqual(resolveWordCardAnswer(result, round, round.answer.id), result);
    assert.strictEqual(resolveWordCardAnswer(result, round, wrong.id), result);
    assert.deepEqual(before, { status: 'choosing', score: 2, attempts: 4 });
});

test('a correct answer earns exactly one point and repeated clicks never earn another', () => {
    const round = createWordCardRound(fixtures);
    const before = Object.freeze({ status: 'choosing', score: 7, attempts: 9 });
    const result = resolveWordCardAnswer(before, round, round.answer.id);
    assert.deepEqual(result, { status: 'feedback', score: 8, attempts: 10, correct: true });
    for (const card of round.choices) assert.strictEqual(resolveWordCardAnswer(result, round, card.id), result);
    assert.deepEqual(before, { status: 'choosing', score: 7, attempts: 9 });
});

test('a sequence of fresh rounds keeps session score equal to correct first answers only', async () => {
    const outcomes = [true, false, true, true, false, false, true];
    let state = createWordCardState(), previousId = '', correctCount = 0;
    for (let index = 0; index < outcomes.length; index += 1) {
        const round = await loadWordCardRound(repository(), { previousId });
        state = { ...state, status: 'choosing' };
        const selectedId = outcomes[index]
            ? round.answer.id
            : round.choices.find(card => card.id !== round.answer.id).id;
        state = resolveWordCardAnswer(state, round, selectedId);
        correctCount += outcomes[index] ? 1 : 0;
        assert.equal(state.score, correctCount);
        assert.equal(state.attempts, index + 1);
        assert.equal(state.correct, outcomes[index]);
        assert.strictEqual(resolveWordCardAnswer(state, round, round.answer.id), state);
        previousId = round.answer.id;
    }
    assert.equal(state.score, 4);
    assert.equal(createWordCardState().score, 0);
});
