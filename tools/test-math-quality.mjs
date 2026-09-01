import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    TIME_QUIZ_REWARDS,
    buildClockOptions,
    calculateWalletReward,
    classifyLineTrend,
    experienceForAttempt,
    generateClockTime,
    timeKey,
    validateClockInput
} from '../math/math-quality-core.mjs';

function sequenceRandom(values) {
    let index = 0;
    return () => values[index++ % values.length];
}

assert.deepEqual(TIME_QUIZ_REWARDS, { easy: 1, middle: 3, hard: 5, 'very-hard': 10 });

const generated = generateClockTime('middle', sequenceRandom([0, 0, 0.1, 0.2]), [{ hour: 1, minute: 0 }]);
assert.notEqual(timeKey(generated), '1:00', '직전 문제와 같은 시각을 피해야 합니다.');
assert.ok([0, 15, 30, 45].includes(generated.minute), '보통 난이도는 15분 간격이어야 합니다.');

for (const difficulty of ['easy', 'middle', 'hard']) {
    for (const answer of [{ hour: 12, minute: 0 }, { hour: 3, minute: 15 }, { hour: 11, minute: 55 }]) {
        const options = buildClockOptions(answer, difficulty, sequenceRandom([0.7, 0.2, 0.9, 0.1]));
        assert.equal(options.length, 4, `${difficulty} 선택지는 4개여야 합니다.`);
        assert.equal(new Set(options.map(timeKey)).size, 4, `${difficulty} 선택지는 중복되면 안 됩니다.`);
        assert.equal(options.filter((option) => timeKey(option) === timeKey(answer)).length, 1, '정답은 정확히 한 개여야 합니다.');
        options.forEach((option) => {
            assert.ok(option.hour >= 1 && option.hour <= 12);
            assert.ok(option.minute >= 0 && option.minute <= 59);
        });
    }
}

assert.equal(validateClockInput(12, 59), '');
assert.match(validateClockInput(0, 30), /1부터 12/);
assert.match(validateClockInput(3, 60), /0부터 59/);
assert.match(validateClockInput(Number.NaN, 0), /숫자/);

assert.equal(experienceForAttempt({ experienceReward: 999 }, { isCorrect: true, activityType: 'time-quiz', difficulty: 'easy' }), 1, '시간 퀴즈 보상은 클라이언트 요청으로 부풀릴 수 없어야 합니다.');
assert.equal(experienceForAttempt({ experienceReward: 999 }, { isCorrect: true, activityType: 'time-quiz', difficulty: 'very-hard' }), 10);
assert.equal(experienceForAttempt({ experienceReward: 7 }, { isCorrect: true }), 7);
assert.equal(experienceForAttempt({ experienceReward: 999 }, { isCorrect: true }), 10, '일반 문항 경험치는 상한 10이어야 합니다.');
assert.equal(experienceForAttempt({ experienceReward: 10 }, { isCorrect: false }), 0, '오답에는 경험치를 주면 안 됩니다.');

const reward = calculateWalletReward({ aeduExperience: 95, aeduLevel: 1, balance: 250, warningTokens: 2 }, 10);
assert.deepEqual(reward, {
    updates: {
        aeduExperience: 5,
        aeduLevel: 2,
        balance: 1250,
        coins: 1250,
        aeduTokens: 1250,
        warningTokens: 1
    },
    levelUps: 1,
    levelUpPoints: 1000,
    warningReduced: 1
});
const multiLevel = calculateWalletReward({ aeduExperience: 95, aeduLevel: 3, coins: 10 }, 210);
assert.equal(multiLevel.levelUps, 3);
assert.equal(multiLevel.updates.aeduExperience, 5);
assert.equal(multiLevel.updates.aeduLevel, 6);
assert.equal(multiLevel.updates.balance, 3010);
const legacy = calculateWalletReward({ experience: 195, level: 1, aeduTokens: 500 }, 10);
assert.equal(legacy.updates.aeduLevel, 3, '누적 경험치 형식도 현재 레벨로 정규화해야 합니다.');
assert.equal(legacy.updates.aeduExperience, 5);

assert.equal(classifyLineTrend([2, 3, 3, 5]), 'up');
assert.equal(classifyLineTrend([5, 4, 4, 1]), 'down');
assert.equal(classifyLineTrend([3, 3, 3]), 'steady');
assert.equal(classifyLineTrend([2, 5, 3, 6]), 'mixed');

const spiral = await readFile(new URL('../math/math-spiral.js', import.meta.url), 'utf8');
assert.match(spiral, /정확한 합을 구한 뒤/);
assert.match(spiral, /첫 점과 마지막 점만 보지 말고/);
assert.match(spiral, /파란 칸 수를 전체 20칸으로 나눈 뒤/);
assert.doesNotMatch(spiral, /style=\\"width:\$\{a\}%\\">\$\{a\}%<\/span>/, '비율 그래프가 정답을 그림 안에 노출하면 안 됩니다.');
assert.match(spiral, /분수 곱셈 그림과 정답이 일치하지 않습니다/);
assert.match(spiral, /원 문항 선택지는 4개여야 합니다/);
['분수의 나눗셈', '소수 곱셈', '삼각형 넓이', '원의 넓이', '직육면체 겉넓이', '무게 단위 바꾸기'].forEach((marker) => {
    assert.ok(spiral.includes(marker), `부족했던 문제 유형이 없습니다: ${marker}`);
});

console.log('에이두 수학 품질 테스트 완료: 시간 퀴즈·경험치·레벨업 보상·문제 유형 검증 통과');
