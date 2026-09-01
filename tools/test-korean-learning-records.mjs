import assert from 'node:assert/strict';
import {
    MASTERY_CORRECT_THRESHOLD,
    applyKoreanMasteryAttempt,
    buildKoreanQuestionId,
    getKoreanMasteryKey,
    getTodayReviewQuestions,
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

console.log('한글 학생 기록/숙련도 테스트 완료');
