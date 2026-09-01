import assert from 'node:assert/strict';
import {
    MASTERY_CORRECT_THRESHOLD,
    applyKoreanMasteryAttempt,
    buildKoreanAreaProgress,
    buildKoreanGrowthRecommendations,
    buildKoreanQuestionId,
    buildKoreanWeeklyProgress,
    getKoreanMasteryKey,
    getTodayReviewQuestions,
    summarizeKoreanMasteryDistribution,
    summarizeKoreanStudentRecords
} from '../korean-learning-records.mjs';

const base = {
    studentId: 'student-a', stage: 2, lessonId: 2, activityType: 'listenAndFind',
    questionText: '거', answer: '거', correctAnswer: '거', userAnswer: '고', studentAnswer: '고',
    questionType: 'character', inputType: 'choice', isCorrect: false, attemptSource: 'normal',
    createdAt: '2026-09-01T01:00:00.000Z', localDate: '2026-09-01'
};
base.questionId = buildKoreanQuestionId(base);
const key = getKoreanMasteryKey(base);

let mastery = applyKoreanMasteryAttempt(null, base);
assert.equal(mastery.masteryStatus, 'weak');
assert.equal(mastery.wrongCount, 1);
assert.equal(mastery.lastStudentAnswer, '고');

for (let count = 1; count <= MASTERY_CORRECT_THRESHOLD; count += 1) {
    mastery = applyKoreanMasteryAttempt(mastery, {
        ...base, isCorrect: true, userAnswer: '거', studentAnswer: '거', attemptSource: 'review',
        createdAt: `2026-09-01T0${count + 1}:00:00.000Z`
    });
    assert.equal(mastery.masteryStatus, count >= MASTERY_CORRECT_THRESHOLD ? 'mastered' : 'learning');
}

mastery = applyKoreanMasteryAttempt(mastery, { ...base, createdAt: '2026-09-01T06:00:00.000Z' });
assert.equal(mastery.masteryStatus, 'weak');
assert.equal(mastery.reviewCorrectCount, 0);
assert.equal(mastery.wrongCount, 2);

const queue = getTodayReviewQuestions({ [key]: mastery }, 10);
assert.equal(queue.length, 1);
assert.equal(queue[0].questionId, base.questionId);

const summary = summarizeKoreanStudentRecords([
    base,
    { ...base, isCorrect: true, localDate: '2026-09-01' }
], { [key]: mastery }, new Date('2026-09-01T12:00:00+09:00'));
assert.equal(summary.todayAttempts, 2);
assert.equal(summary.todayCorrect, 1);
assert.equal(summary.reviewCount, 1);

const areaProgress = buildKoreanAreaProgress([
    { ...base, unitId: 1, isCorrect: false },
    { ...base, unitId: 1, isCorrect: true },
    { ...base, unitId: 1, questionId: 'another-question', isCorrect: false }
]);
assert.deepEqual(areaProgress, [{ unitId: 1, total: 2, reached: 1, rate: 50 }]);

const weeklyProgress = buildKoreanWeeklyProgress([
    { ...base, isCorrect: true, localDate: '2026-09-01' },
    { ...base, isCorrect: true, localDate: '2026-09-01' },
    { ...base, questionId: 'another-question', isCorrect: true, localDate: '2026-09-01' }
], new Date('2026-09-01T12:00:00+09:00'));
assert.equal(weeklyProgress.length, 7);
assert.equal(weeklyProgress.at(-1).correct, 2);

const masteryDistribution = summarizeKoreanMasteryDistribution({
    weak: mastery,
    learning: { masteryStatus: 'learning' },
    mastered: { masteryStatus: 'mastered' }
});
assert.deepEqual(masteryDistribution, { weak: 1, learning: 1, mastered: 1, total: 3 });

const growthRecommendations = buildKoreanGrowthRecommendations([
    { ...base, unitId: 1, questionId: 'vowel-1', isCorrect: false },
    { ...base, unitId: 1, questionId: 'vowel-1', isCorrect: false },
    { ...base, unitId: 1, questionId: 'vowel-2', isCorrect: true },
    { ...base, unitId: 2, questionId: 'consonant-1', isCorrect: false },
    { ...base, unitId: 2, questionId: 'consonant-2', isCorrect: true },
    { ...base, unitId: 3, questionId: 'word-1', isCorrect: false }
], {
    vowel: { unitId: 1, masteryStatus: 'weak' },
    consonant: { unitId: 2, masteryStatus: 'learning' },
    masteredWord: { unitId: 3, masteryStatus: 'mastered' }
});
assert.equal(growthRecommendations.length, 2);
assert.deepEqual(growthRecommendations[0], { unitId: 1, attempts: 3, wrongAttempts: 2, wrongQuestions: 1, accuracy: 33, priority: 'high' });
assert.equal(growthRecommendations[1].unitId, 2);

console.log('한글 학생 기록/숙련도 테스트 완료');
