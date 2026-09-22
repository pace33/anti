import assert from 'node:assert/strict';
import test from 'node:test';
import {
    ASSIGNMENT_DIALOGUE,
    DIAGNOSTIC_CONTENT_VERSION,
    DIAGNOSTIC_BANK,
    ONBOARDING_DIALOGUE,
    createInitialDiagnosticState,
    getStageAccess,
    getUnlockedLevelsForPlacement,
    shouldRunStudentDiagnostic,
    transitionDiagnostic
} from '../student-onboarding-diagnostic-core.mjs';

function enterQuestions() {
    let state = createInitialDiagnosticState();
    for (let index = 0; index < ONBOARDING_DIALOGUE.length; index += 1) {
        state = transitionDiagnostic(state, { type: 'NEXT' });
    }
    return state;
}

function answer(state, correct) {
    const question = DIAGNOSTIC_BANK[state.tier][state.questionIndex];
    const option = question.options.find((item) => (item.id === question.correctOptionId) === correct);
    state = transitionDiagnostic(state, { type: 'SELECT_OPTION', optionId: option.id });
    return transitionDiagnostic(state, { type: 'SUBMIT' });
}

function answerTier(state, score) {
    for (let index = 0; index < 3; index += 1) state = answer(state, index < score);
    return state;
}

test('온보딩은 에이두 이름이 보이는 다섯 대사 뒤 4단계 진단을 연다', () => {
    assert.equal(ONBOARDING_DIALOGUE.length, 5);
    assert.ok(ONBOARDING_DIALOGUE.every((line) => line.speaker === '에이두' && line.text.length > 0));
    let state = createInitialDiagnosticState();
    for (let index = 0; index < 4; index += 1) {
        state = transitionDiagnostic(state, { type: 'NEXT' });
        assert.equal(state.value, 'intro');
        assert.equal(state.introIndex, index + 1);
    }
    state = transitionDiagnostic(state, { type: 'NEXT' });
    assert.deepEqual({ value: state.value, tier: state.tier, questionIndex: state.questionIndex }, { value: 'question', tier: 4, questionIndex: 0 });
});

test('각 진단 묶음은 고정된 세 문제와 하나의 유효한 정답을 가진다', () => {
    const ids = [];
    for (const tier of [4, 3, 2]) {
        assert.equal(DIAGNOSTIC_BANK[tier].length, 3);
        for (const question of DIAGNOSTIC_BANK[tier]) {
            ids.push(question.id);
            assert.equal(question.options.length, 4);
            assert.equal(question.options.filter((option) => option.id === question.correctOptionId).length, 1);
            assert.ok(question.instruction && question.prompt);
        }
    }
    assert.equal(new Set(ids).size, 9);
    assert.deepEqual(DIAGNOSTIC_BANK[4].map((question) => question.kind), Array(3).fill('literacy-multiple-choice'));
    assert.ok(DIAGNOSTIC_BANK[4].every((question) => question.difficulty === 'easy'));
    assert.deepEqual(DIAGNOSTIC_BANK[3].map((question) => question.kind), Array(3).fill('fruit-picture-word-match'));
    assert.ok(DIAGNOSTIC_BANK[3].every((question) => question.card?.visual && question.card?.alt));
    assert.deepEqual(DIAGNOSTIC_BANK[2].map((question) => question.kind), Array(3).fill('tts-jamo-identification'));
    assert.ok(DIAGNOSTIC_BANK[2].every((question) => question.speechText && question.options.every((option) => option.spokenLabel)));
});

test('2점 이상은 현재 단계를 배정하고 0~1점은 다음 하위 진단으로 내린다', () => {
    for (let level4Score = 0; level4Score <= 3; level4Score += 1) {
        let state = answerTier(enterQuestions(), level4Score);
        if (level4Score >= 2) {
            assert.equal(state.assignedLevel, 4);
            assert.equal(state.answeredQuestionIds.length, 3);
            continue;
        }
        assert.deepEqual({ value: state.value, tier: state.tier, questionIndex: state.questionIndex }, { value: 'question', tier: 3, questionIndex: 0 });
        for (let level3Score = 0; level3Score <= 3; level3Score += 1) {
            let level3State = answerTier(state, level3Score);
            if (level3Score >= 2) {
                assert.equal(level3State.assignedLevel, 3);
                assert.equal(level3State.answeredQuestionIds.length, 6);
                continue;
            }
            assert.equal(level3State.tier, 2);
            for (let level2Score = 0; level2Score <= 3; level2Score += 1) {
                const finalState = answerTier(level3State, level2Score);
                assert.equal(finalState.assignedLevel, level2Score >= 2 ? 2 : 1);
                assert.equal(finalState.answeredQuestionIds.length, 9);
            }
        }
    }
});

test('선택하지 않은 제출, 잘못된 보기, 완료 문제의 중복 제출은 점수를 바꾸지 않는다', () => {
    const state = enterQuestions();
    assert.strictEqual(transitionDiagnostic(state, { type: 'SUBMIT' }), state);
    assert.strictEqual(transitionDiagnostic(state, { type: 'SELECT_OPTION', optionId: 'not-an-option' }), state);
    const selected = transitionDiagnostic(state, { type: 'SELECT_OPTION', optionId: DIAGNOSTIC_BANK[4][0].correctOptionId });
    const submitted = transitionDiagnostic(selected, { type: 'SUBMIT' });
    assert.equal(submitted.scores[4], 1);
    assert.strictEqual(transitionDiagnostic(submitted, { type: 'SUBMIT' }), submitted);
});

test('배정 단계와 그 하위 단계는 열리고 상위 단계만 잠긴다', () => {
    for (const assignedLevel of [1, 2, 3, 4]) {
        const access = getStageAccess(assignedLevel);
        assert.equal(Object.values(access).filter((value) => value === 'open').length, assignedLevel);
        for (const level of [1, 2, 3, 4]) assert.equal(access[level], level <= assignedLevel ? 'open' : 'locked');
    }
    assert.ok(Object.values(getStageAccess(null)).every((value) => value === 'locked'));
});

test('코어 단계 접근 객체를 앱에서 사용하는 누적 단계 배열로 안전하게 변환한다', () => {
    for (const assignedLevel of [1, 2, 3, 4]) {
        assert.deepEqual([...getUnlockedLevelsForPlacement(assignedLevel)], Array.from({ length: assignedLevel }, (_, index) => index + 1));
    }
    for (const invalidLevel of [null, 0, 5, '잘못된 단계']) {
        assert.deepEqual([...getUnlockedLevelsForPlacement(invalidLevel)], []);
    }
});

test('각 배정 결과는 에이두의 두 문장 안내 뒤 완료된다', () => {
    for (const level of [1, 2, 3, 4]) {
        assert.equal(ASSIGNMENT_DIALOGUE[level].length, 2);
        assert.ok(ASSIGNMENT_DIALOGUE[level].every((line) => line.speaker === '에이두'));
        let state = { ...createInitialDiagnosticState(), value: 'assigned', assignedLevel: level, resultIndex: 0 };
        state = transitionDiagnostic(state, { type: 'NEXT_RESULT' });
        assert.equal(state.resultIndex, 1);
        state = transitionDiagnostic(state, { type: 'NEXT_RESULT' });
        assert.equal(state.value, 'complete');
    }
});

test('미배정 학생만 진단하며 교사와 이미 배정된 학생은 우회한다', () => {
    assert.equal(createInitialDiagnosticState().contentVersion, DIAGNOSTIC_CONTENT_VERSION);
    assert.equal(shouldRunStudentDiagnostic({ role: 'student' }), true);
    assert.equal(shouldRunStudentDiagnostic({ role: 'student', assignedLevel: 3, diagnosticStatus: 'complete', diagnosticVersion: DIAGNOSTIC_CONTENT_VERSION }), false);
    assert.equal(shouldRunStudentDiagnostic({ role: 'teacher' }), false);
    assert.equal(shouldRunStudentDiagnostic({ role: 'admin' }), false);
});
