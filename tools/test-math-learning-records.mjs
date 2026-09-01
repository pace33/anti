import assert from 'node:assert/strict';
import {
    applyMathAttempt,
    buildMathAreaProgress,
    buildMathGrowthRecommendations,
    buildMathProgressId,
    buildMathWeeklyProgress,
    summarizeMathStudentRecords
} from '../math/math-learning-records.mjs';

assert.equal(buildMathProgressId('student-a', 'number/make-10'), 'student-a__number%2Fmake-10');
assert.throws(() => buildMathProgressId('', 'make-10'), /requires uid and nodeId/);

const baseAttempt = {
    uid: 'student-a',
    studentId: 'student-a',
    nodeId: 'make-10',
    nodeTitle: '10 만들기',
    domain: 'number',
    gradeBand: '1-2',
    activityType: 'choice',
    representation: 'visualization',
    questionId: 'make-10-pair',
    correctAnswer: '3',
    studentAnswer: '4',
    isCorrect: false,
    completed: false,
    misconceptionTags: ['number-bond'],
    attemptId: 'attempt-1',
    createdAt: '2026-08-25T01:00:00.000Z'
};

let progress = applyMathAttempt(null, baseAttempt);
assert.equal(progress.status, 'learning');
assert.equal(progress.masteryState, 'learning');
assert.equal(progress.attemptCount, 1);
assert.equal(progress.wrongCount, 1);
assert.equal(progress.misconceptionCounts['number-bond'], 1);
assert.deepEqual(progress.representationScores.visualization, { attempts: 1, correct: 0, wrong: 1, accuracyRate: 0 });

// Replaying the same idempotent attempt must not inflate progress counters.
progress = applyMathAttempt(progress, baseAttempt);
assert.equal(progress.attemptCount, 1);
assert.equal(progress.wrongCount, 1);

progress = applyMathAttempt(progress, {
    ...baseAttempt,
    attemptId: 'attempt-2',
    stepKey: 'visualization',
    studentAnswer: '3',
    isCorrect: true,
    createdAt: '2026-08-25T01:02:00.000Z'
});
assert.deepEqual(progress.completedSteps, ['visualization']);
assert.equal(progress.consecutiveCorrect, 1);

progress = applyMathAttempt(progress, {
    ...baseAttempt,
    attemptId: 'attempt-3',
    stepKey: 'application',
    studentAnswer: '3',
    isCorrect: true,
    completed: true,
    createdAt: '2026-08-25T01:04:00.000Z'
});
assert.equal(progress.completed, true);
assert.equal(progress.status, 'completed');
assert.equal(progress.masteryState, 'basic');
assert.equal(progress.completedAt, '2026-08-25T01:04:00.000Z');
assert.equal(progress.nextReviewAt, '2026-08-26T01:04:00.000Z');

progress = applyMathAttempt(progress, {
    ...baseAttempt,
    attemptId: 'attempt-4',
    attemptSource: 'review',
    studentAnswer: '3',
    isCorrect: true,
    createdAt: '2026-08-26T01:04:00.000Z'
});
progress = applyMathAttempt(progress, {
    ...baseAttempt,
    attemptId: 'attempt-5',
    attemptSource: 'review',
    studentAnswer: '3',
    isCorrect: true,
    createdAt: '2026-08-29T01:04:00.000Z'
});
assert.equal(progress.reviewCorrectCount, 2);
assert.equal(progress.masteryState, 'stable');
assert.equal(progress.nextReviewAt, '2026-09-05T01:04:00.000Z');

const geometryProgress = {
    uid: 'student-a',
    nodeId: 'read-clock',
    nodeTitle: '시각 읽기',
    domain: 'geometry',
    gradeBand: '1-2',
    completed: false,
    masteryState: 'learning',
    attemptCount: 4,
    correctCount: 1,
    wrongCount: 3,
    accuracyRate: 25,
    misconceptionCounts: { 'hour-minute-hand': 2 },
    lastAttemptAt: '2026-08-31T02:00:00.000Z'
};
const dueReview = {
    uid: 'student-a',
    nodeId: 'shape-sort',
    nodeTitle: '도형 분류',
    domain: 'geometry',
    gradeBand: '1-2',
    completed: true,
    masteryState: 'basic',
    attemptCount: 3,
    correctCount: 3,
    wrongCount: 0,
    accuracyRate: 100,
    nextReviewAt: '2020-01-01T00:00:00.000Z',
    lastAttemptAt: '2026-08-20T00:00:00.000Z'
};

const curriculum = [
    {
        id: 'number',
        bands: {
            '1-2': [
                { id: 'make-10', title: '10 만들기' },
                { id: 'place-value', title: '자릿값' }
            ]
        }
    },
    {
        id: 'geometry',
        bands: {
            '1-2': [
                { id: 'read-clock', title: '시각 읽기' },
                { id: 'shape-sort', title: '도형 분류' }
            ]
        }
    }
];

const areaProgress = buildMathAreaProgress([progress, geometryProgress, dueReview], curriculum);
assert.deepEqual(areaProgress.find((area) => area.domain === 'number'), {
    domain: 'number', total: 2, started: 1, completed: 1, learning: 0, reviewDue: 0, rate: 50
});
assert.deepEqual(areaProgress.find((area) => area.domain === 'geometry'), {
    domain: 'geometry', total: 2, started: 2, completed: 1, learning: 1, reviewDue: 1, rate: 50
});

const attemptDocs = [
    { nodeId: 'make-10', isCorrect: false, localDate: '2026-08-31', createdAt: '2026-08-31T01:00:00.000Z' },
    { nodeId: 'make-10', isCorrect: true, localDate: '2026-09-01', createdAt: '2026-09-01T01:00:00.000Z' },
    { nodeId: 'read-clock', isCorrect: true, completed: true, createdAt: '2026-09-01T02:00:00.000Z' }
];
const weekly = buildMathWeeklyProgress(attemptDocs, {
    now: '2026-09-01T12:00:00+09:00',
    days: 7,
    utcOffsetMinutes: 540
});
assert.equal(weekly.length, 7);
assert.deepEqual(weekly.at(-1), {
    localDate: '2026-09-01',
    label: '9/1',
    attempts: 2,
    correct: 2,
    wrong: 0,
    completedNodes: 1,
    accuracyRate: 100
});

const summary = summarizeMathStudentRecords([progress, geometryProgress, dueReview], attemptDocs);
assert.equal(summary.trackedNodes, 3);
assert.equal(summary.completedNodes, 2);
assert.equal(summary.learningNodes, 1);
assert.equal(summary.reviewDueNodes, 1);
assert.equal(summary.totalAttempts, 3);
assert.equal(summary.correctAttempts, 2);
assert.equal(summary.accuracyRate, 67);

const recommendations = buildMathGrowthRecommendations([progress, geometryProgress, dueReview], curriculum, 2);
assert.equal(recommendations.length, 2);
assert.equal(recommendations[0].nodeId, 'read-clock');
assert.equal(recommendations[0].priority, 'high');
assert.equal(recommendations[1].nodeId, 'shape-sort');
assert.match(recommendations[1].reason, /복습/);

const starterRecommendations = buildMathGrowthRecommendations([], curriculum, 8);
assert.deepEqual(starterRecommendations.map((item) => item.nodeId), ['make-10', 'read-clock']);
assert(starterRecommendations.every((item) => item.priority === 'next'));

console.log('수학 학습 기록/영역 진도/주간 성장 테스트 완료');
