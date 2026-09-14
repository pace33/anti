import assert from 'node:assert/strict';
import test from 'node:test';
import {
    SYLLABLE_READER_GAPS,
    buildSyllableReaderTokens,
    getSyllableReaderGap,
    getSyllableReaderSequence,
    normalizeSyllableReaderText,
    segmentSyllableReaderText
} from '../syllable-slow-reader-core.mjs';

test('한글 완성형과 겹받침 음절을 글자 단위로 유지한다', () => {
    assert.deepEqual(segmentSyllableReaderText('값 읽기'), ['값', ' ', '읽', '기']);
    assert.deepEqual(getSyllableReaderSequence('값 읽기').map(({ text }) => text), ['값', '읽', '기']);
});

test('공백과 문장부호는 보이지만 TTS 재생 순서에서는 제외한다', () => {
    const tokens = buildSyllableReaderTokens('안녕, 세상!');
    assert.deepEqual(tokens.map(({ kind }) => kind), [
        'speakable', 'speakable', 'punctuation', 'space', 'speakable', 'speakable', 'punctuation'
    ]);
    assert.deepEqual(tokens.map(({ speakIndex }) => speakIndex), [0, 1, null, null, 2, 3, null]);
});

test('조합형 입력은 NFC로 정규화하고 이모지는 한 덩어리로 보존한다', () => {
    assert.equal(normalizeSyllableReaderText('\u1100\u1161 👨‍👩‍👧‍👦'), '가 👨‍👩‍👧‍👦');
});

test('최대 글자 수를 넘는 입력을 grapheme 기준으로 자른다', () => {
    assert.equal(normalizeSyllableReaderText('가나다라마바사', 4), '가나다라');
});

test('쉬는 간격은 네 단계로 고정하고 잘못된 값은 보통으로 돌린다', () => {
    assert.equal(SYLLABLE_READER_GAPS[1].milliseconds, 200);
    assert.equal(SYLLABLE_READER_GAPS[4].milliseconds, 1000);
    assert.equal(getSyllableReaderGap('3').milliseconds, 700);
    assert.equal(getSyllableReaderGap('unknown').milliseconds, 400);
});
