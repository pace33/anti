import assert from 'node:assert/strict';
import test from 'node:test';
import {
    KOREAN_LAB_TIME_REWARDS,
    buildKoreanLabClockOptions,
    createKoreanLabAttemptId,
    formatKoreanLabTime,
    generateKoreanLabClockTime,
    timeKey,
    validateKoreanLabClockInput
} from '../korean-lab-time-quiz-core.mjs';

function sequence(values) {
    let index = 0;
    return () => values[index++ % values.length];
}

test('난이도별 생성 분 단위와 경험치가 한글 연구실 규칙을 따른다', () => {
    assert.deepEqual(KOREAN_LAB_TIME_REWARDS, { easy: 1, middle: 3, hard: 5, 'very-hard': 10 });
    assert.equal(generateKoreanLabClockTime('easy', sequence([.2, .9])).minute, 0);
    assert.ok([0, 15, 30, 45].includes(generateKoreanLabClockTime('middle', sequence([.3, .7])).minute));
    const hard = generateKoreanLabClockTime('hard', sequence([.4, .37]));
    assert.ok(hard.hour >= 1 && hard.hour <= 12);
    assert.ok(hard.minute >= 0 && hard.minute <= 59);
});

test('최근 세 문제와 같은 시각은 가능한 경우 반복하지 않는다', () => {
    const random = sequence([0, 0, .2, .4]);
    const next = generateKoreanLabClockTime('easy', random, [{ hour: 1, minute: 0 }]);
    assert.notEqual(timeKey(next), '1:00');
});

test('객관식은 정답 하나를 포함한 서로 다른 네 선택지를 만든다', () => {
    const answer = { hour: 3, minute: 15 };
    const options = buildKoreanLabClockOptions(answer, 'middle', () => .5);
    assert.equal(options.length, 4);
    assert.equal(new Set(options.map(timeKey)).size, 4);
    assert.ok(options.some((option) => timeKey(option) === timeKey(answer)));
});

test('직접 입력 범위와 한국어 시각 표기를 검증한다', () => {
    assert.equal(validateKoreanLabClockInput(12, 59), '');
    assert.match(validateKoreanLabClockInput(0, 10), /1부터 12/);
    assert.match(validateKoreanLabClockInput(3, 60), /0부터 59/);
    assert.match(validateKoreanLabClockInput(Number.NaN, 10), /숫자/);
    assert.equal(formatKoreanLabTime({ hour: 7, minute: 5 }), '7시 5분');
});

test('randomUUID가 없는 환경에서도 서로 다른 UUID 영수증 ID를 만든다', () => {
    const first = createKoreanLabAttemptId(null, () => 0, () => 123456789);
    const second = createKoreanLabAttemptId(null, () => 0, () => 123456789);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assert.match(first, uuid);
    assert.match(second, uuid);
    assert.notEqual(first, second);
});
