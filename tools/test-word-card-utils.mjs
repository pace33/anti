import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildWordCardExplanationPrompt,
    buildWordCardId,
    buildWordCardImageEditPrompt,
    buildWordCardIllustrationPath,
    getWordCardResolution,
    isValidWordCardId,
    isValidWordCardIllustrationPath,
    normalizeWordCardWord,
    sortPublishedWordCards,
    validateWordCardText
} from '../word-card-utils.mjs';

test('단어를 NFKC와 공백 기준으로 정규화한다', () => {
    assert.equal(normalizeWordCardWord('  사   과!  '), '사 과');
    assert.equal(normalizeWordCardWord('ＳＰＡＣＥ 우주'), 'SPACE 우주');
});

test('같은 정규화 단어는 같은 결정적 SHA-256 ID를 사용한다', async () => {
    const first = await buildWordCardId('사과');
    const second = await buildWordCardId('  사과  ');
    assert.equal(first, second);
    assert.match(first, /^wc1_[a-f0-9]{64}$/);
});

test('게시된 공개 완성 카드만 재사용하고 유효한 생성 lease는 기다린다', async () => {
    const id = await buildWordCardId('사과');
    const path = buildWordCardIllustrationPath(id, '1712345678-owner_token', 'webp');
    const complete = { id, status: 'published', isPublic: true, word: '사과', explanation: '과일이에요.', illustration: { path } };
    assert.equal(getWordCardResolution(complete, 100), 'reuse');
    assert.equal(getWordCardResolution({ ...complete, isPublic: false }, 100), 'generate');
    assert.equal(getWordCardResolution({ ...complete, id: 'bad-id' }, 100), 'generate');
    assert.equal(getWordCardResolution({ ...complete, illustration: { path: 'SharedWordCards/other/illustration.webp' } }, 100), 'generate');
    assert.equal(getWordCardResolution({ status: 'generating', leaseExpiresAtMs: 200 }, 100), 'wait');
    assert.equal(getWordCardResolution({ status: 'generating', leaseExpiresAtMs: 50 }, 100), 'generate');
    assert.equal(getWordCardResolution({ status: 'failed' }, 100), 'generate');
});

test('카드 ID와 lease별 이미지 경로는 허용 형식만 사용한다', async () => {
    const id = await buildWordCardId('나무');
    const first = buildWordCardIllustrationPath(id, '1700000000-owner_a', 'png');
    const second = buildWordCardIllustrationPath(id, '1700000001-owner_b', 'png');
    assert.notEqual(first, second);
    assert.equal(isValidWordCardId(id), true);
    assert.equal(isValidWordCardId('wc1_bad'), false);
    assert.equal(isValidWordCardIllustrationPath(first, id), true);
    assert.equal(isValidWordCardIllustrationPath(first, await buildWordCardId('하늘')), false);
    assert.throws(() => buildWordCardIllustrationPath(id, '1234567', 'webp'), /경로/);
    assert.match(buildWordCardIllustrationPath(id, '12345678', 'webp'), /12345678/);
    assert.throws(() => buildWordCardIllustrationPath(id, '../escape', 'svg'), /경로/);
});

test('AI 설명 결과를 길이 제한과 HTML 제거 후 검증한다', () => {
    const safe = validateWordCardText({ word: ' 사과 ', explanation: '<b>둥글고 달콤한 과일이에요.</b>' });
    assert.deepEqual(safe, { word: '사과', normalizedWord: '사과', explanation: 'b둥글고 달콤한 과일이에요./b' });
    assert.throws(() => validateWordCardText({ word: '123', explanation: '숫자예요.' }), /한국어 단어/);
    assert.throws(() => validateWordCardText({ word: '사과', explanation: '' }), /설명/);
});

test('설명·이미지 프롬프트에 단어와 교육용 제약이 포함된다', () => {
    const textPrompt = buildWordCardExplanationPrompt('사과');
    const imagePrompt = buildWordCardImageEditPrompt('사과', '둥글고 달콤한 과일이에요.');
    assert.match(textPrompt, /JSON만 출력/);
    assert.match(textPrompt, /사과/);
    assert.match(imagePrompt, /같은 캐릭터/);
    assert.match(imagePrompt, /순백색/);
    assert.match(imagePrompt, /글자, 자막, 말풍선/);
});

test('공용 저장소에는 게시 완료된 공개 카드만 가나다순으로 보인다', async () => {
    const treeId = await buildWordCardId('나무');
    const skyId = await buildWordCardId('하늘');
    const bagId = await buildWordCardId('가방');
    const cards = sortPublishedWordCards([
        { id: skyId, status: 'published', isPublic: true, word: '하늘', explanation: '설명', illustration: { path: buildWordCardIllustrationPath(skyId, '1-sky-token', 'webp') } },
        { id: bagId, status: 'generating', isPublic: false, word: '가방', explanation: '설명', illustration: { path: buildWordCardIllustrationPath(bagId, '1-bag-token', 'webp') } },
        { id: treeId, status: 'published', isPublic: true, word: '나무', explanation: '설명', illustration: { path: buildWordCardIllustrationPath(treeId, '1-tree-token', 'png') } },
        { id: bagId, status: 'published', isPublic: false, word: '비공개', explanation: '설명', illustration: { path: buildWordCardIllustrationPath(bagId, '2-bag-token', 'webp') } },
        { id: 'bad-id', status: 'published', isPublic: true, word: '조작', explanation: '설명', illustration: { path: 'SharedWordCards/bad/illustration.webp' } }
    ]);
    assert.deepEqual(cards.map((card) => card.word), ['나무', '하늘']);
});
