const freezeQuestion = (question) => Object.freeze({
    ...question,
    options: Object.freeze(question.options.map((option) => Object.freeze({ ...option })))
});

export const DIAGNOSTIC_CONTENT_VERSION = 'student-placement-v2';

export const ONBOARDING_DIALOGUE = Object.freeze([
    Object.freeze({ speaker: '에이두', text: '안녕! 난 에이두야! 에이두 한글은 처음이지?', pose: 'wave' }),
    Object.freeze({ speaker: '에이두', text: '에이두 한글은 한글과 친해지는 곳이야!', pose: 'welcome' }),
    Object.freeze({ speaker: '에이두', text: '우리가 재미있게 글을 읽고 쓸 수 있도록 성장하는 곳이란 말이지!', pose: 'grow' }),
    Object.freeze({ speaker: '에이두', text: '음… 그래서 그런데 너는 한글에 대해서 어느 정도 알고 있니?', pose: 'think' }),
    Object.freeze({ speaker: '에이두', text: '혹시 나랑 한글 공부하기 전에 퀴즈를 맞춰볼까?', pose: 'quiz' })
]);

export const ASSIGNMENT_DIALOGUE = Object.freeze({
    4: Object.freeze([
        Object.freeze({ speaker: '에이두', text: '우와! 넌 한글에 대해서 이미 공부를 많이 한 친구구나! 나랑 4단계 문해력을 같이 공부하면 좋겠다!', pose: 'celebrate' }),
        Object.freeze({ speaker: '에이두', text: '내가 4단계 문해력을 열어 줄 테니까 나랑 같이 공부하자!', pose: 'welcome' })
    ]),
    3: Object.freeze([
        Object.freeze({ speaker: '에이두', text: '멋져! 과일 그림과 낱말을 아주 잘 알고 있구나!', pose: 'celebrate' }),
        Object.freeze({ speaker: '에이두', text: '내가 3단계 교과 맞춤쓰기를 열어 줄게. 나랑 같이 시작하자!', pose: 'welcome' })
    ]),
    2: Object.freeze([
        Object.freeze({ speaker: '에이두', text: '잘했어! 자음과 모음 소리를 알고 있구나!', pose: 'celebrate' }),
        Object.freeze({ speaker: '에이두', text: '내가 2단계 한글 해득을 열어 줄게. 소리와 글자를 더 재미있게 만나 보자!', pose: 'welcome' })
    ]),
    1: Object.freeze([
        Object.freeze({ speaker: '에이두', text: '수고했어! 이제 나랑 도형 그리기부터 해 보면서 한글을 공부해 보자!', pose: 'celebrate' }),
        Object.freeze({ speaker: '에이두', text: '내가 1단계 그리기 단계를 열어 줄게. 천천히 즐겁게 시작하자!', pose: 'welcome' })
    ])
});

export const DIAGNOSTIC_BANK = Object.freeze({
    4: Object.freeze([
        freezeQuestion({
            id: 'literacy-easy-1', kind: 'literacy-multiple-choice', difficulty: 'easy',
            instruction: '글을 읽고 알맞은 답을 고르세요.',
            passage: '아침부터 비가 내렸어요. 민지는 학교에 갈 때 노란 우산을 쓰고 장화를 신었어요.',
            prompt: '민지가 우산을 쓴 까닭은 무엇인가요?',
            options: [
                { id: 'a', text: '비가 내려서' }, { id: 'b', text: '바람이 불어서' },
                { id: 'c', text: '날씨가 추워서' }, { id: 'd', text: '햇빛이 강해서' }
            ], correctOptionId: 'a'
        }),
        freezeQuestion({
            id: 'literacy-easy-2', kind: 'literacy-multiple-choice', difficulty: 'easy',
            instruction: '글을 읽고 알맞은 답을 고르세요.',
            passage: '강아지는 아침밥을 먹지 못했어요. 배가 고픈 강아지는 밥그릇 앞에 앉아 주인을 바라보았어요.',
            prompt: '강아지가 밥그릇 앞에 앉은 까닭은 무엇인가요?',
            options: [
                { id: 'a', text: '산책하고 싶어서' }, { id: 'b', text: '배가 고파서' },
                { id: 'c', text: '잠을 자고 싶어서' }, { id: 'd', text: '친구를 기다려서' }
            ], correctOptionId: 'b'
        }),
        freezeQuestion({
            id: 'literacy-easy-3', kind: 'literacy-multiple-choice', difficulty: 'easy',
            instruction: '글을 읽고 알맞은 답을 고르세요.',
            passage: '오늘은 학교 운동회 날이에요. 준호는 운동화를 신고 친구들과 달리기하려고 운동장으로 갔어요.',
            prompt: '준호는 어디로 갔나요?',
            options: [
                { id: 'a', text: '도서관' }, { id: 'b', text: '교실' },
                { id: 'c', text: '운동장' }, { id: 'd', text: '급식실' }
            ], correctOptionId: 'c'
        })
    ]),
    3: Object.freeze([
        freezeQuestion({
            id: 'fruit-word-1', kind: 'fruit-picture-word-match',
            instruction: '과일 그림을 보고 알맞은 낱말을 고르세요.', card: { visual: '🍎', alt: '빨간 사과 그림' },
            prompt: '이 과일의 이름은 무엇인가요?',
            options: [{ id: 'a', text: '사과' }, { id: 'b', text: '포도' }, { id: 'c', text: '수박' }, { id: 'd', text: '참외' }],
            correctOptionId: 'a'
        }),
        freezeQuestion({
            id: 'fruit-word-2', kind: 'fruit-picture-word-match',
            instruction: '과일 그림을 보고 알맞은 낱말을 고르세요.', card: { visual: '🍌', alt: '노란 바나나 그림' },
            prompt: '이 과일의 이름은 무엇인가요?',
            options: [{ id: 'a', text: '딸기' }, { id: 'b', text: '바나나' }, { id: 'c', text: '복숭아' }, { id: 'd', text: '귤' }],
            correctOptionId: 'b'
        }),
        freezeQuestion({
            id: 'fruit-word-3', kind: 'fruit-picture-word-match',
            instruction: '과일 그림을 보고 알맞은 낱말을 고르세요.', card: { visual: '🍓', alt: '빨간 딸기 그림' },
            prompt: '이 과일의 이름은 무엇인가요?',
            options: [{ id: 'a', text: '배' }, { id: 'b', text: '체리' }, { id: 'c', text: '딸기' }, { id: 'd', text: '레몬' }],
            correctOptionId: 'c'
        })
    ]),
    2: Object.freeze([
        freezeQuestion({
            id: 'jamo-tts-1', kind: 'tts-jamo-identification',
            instruction: '스피커 버튼을 누르고, 들은 소리와 같은 글자를 고르세요.', prompt: '어떤 자음의 이름을 들었나요?', speechText: '기역',
            options: [{ id: 'a', text: 'ㄱ', spokenLabel: '기역' }, { id: 'b', text: 'ㄴ', spokenLabel: '니은' }, { id: 'c', text: 'ㄷ', spokenLabel: '디귿' }, { id: 'd', text: 'ㅁ', spokenLabel: '미음' }],
            correctOptionId: 'a'
        }),
        freezeQuestion({
            id: 'jamo-tts-2', kind: 'tts-jamo-identification',
            instruction: '스피커 버튼을 누르고, 들은 소리와 같은 글자를 고르세요.', prompt: '어떤 자음의 이름을 들었나요?', speechText: '니은',
            options: [{ id: 'a', text: 'ㅁ', spokenLabel: '미음' }, { id: 'b', text: 'ㄴ', spokenLabel: '니은' }, { id: 'c', text: 'ㄹ', spokenLabel: '리을' }, { id: 'd', text: 'ㅂ', spokenLabel: '비읍' }],
            correctOptionId: 'b'
        }),
        freezeQuestion({
            id: 'jamo-tts-3', kind: 'tts-jamo-identification',
            instruction: '스피커 버튼을 누르고, 들은 소리와 같은 글자를 고르세요.', prompt: '어떤 모음 소리를 들었나요?', speechText: '아',
            options: [{ id: 'a', text: 'ㅓ', spokenLabel: '어' }, { id: 'b', text: 'ㅗ', spokenLabel: '오' }, { id: 'c', text: 'ㅏ', spokenLabel: '아' }, { id: 'd', text: 'ㅜ', spokenLabel: '우' }],
            correctOptionId: 'c'
        })
    ])
});

export const createInitialDiagnosticState = () => Object.freeze({
    contentVersion: DIAGNOSTIC_CONTENT_VERSION,
    value: 'intro', introIndex: 0, tier: null, questionIndex: null,
    selectedOptionId: null,
    scores: Object.freeze({ 4: 0, 3: 0, 2: 0 }),
    answeredQuestionIds: Object.freeze([]), assignedLevel: null, resultIndex: 0
});

const immutable = (state, changes) => Object.freeze({ ...state, ...changes });
const questionFor = (state) => DIAGNOSTIC_BANK[state.tier]?.[state.questionIndex];

function beginTier(state, tier) {
    return immutable(state, { value: 'question', tier, questionIndex: 0, selectedOptionId: null });
}

function finishTier(state) {
    const score = state.scores[state.tier];
    if (score >= 2) return immutable(state, { value: 'assigned', questionIndex: null, selectedOptionId: null, assignedLevel: state.tier, resultIndex: 0 });
    if (state.tier === 4) return beginTier(state, 3);
    if (state.tier === 3) return beginTier(state, 2);
    return immutable(state, { value: 'assigned', questionIndex: null, selectedOptionId: null, assignedLevel: 1, resultIndex: 0 });
}

export function transitionDiagnostic(state, event) {
    if (!state || !event?.type) return state;
    if (state.value === 'intro' && event.type === 'NEXT') {
        if (state.introIndex < ONBOARDING_DIALOGUE.length - 1) return immutable(state, { introIndex: state.introIndex + 1 });
        return beginTier(state, 4);
    }
    if (state.value === 'question' && event.type === 'SELECT_OPTION') {
        const question = questionFor(state);
        if (!question?.options.some((option) => option.id === event.optionId)) return state;
        return immutable(state, { selectedOptionId: event.optionId });
    }
    if (state.value === 'question' && event.type === 'SUBMIT') {
        const question = questionFor(state);
        if (!question || !state.selectedOptionId || state.answeredQuestionIds.includes(question.id)) return state;
        const correct = state.selectedOptionId === question.correctOptionId;
        const scores = Object.freeze({ ...state.scores, [state.tier]: state.scores[state.tier] + Number(correct) });
        const committed = immutable(state, {
            scores, selectedOptionId: null,
            answeredQuestionIds: Object.freeze([...state.answeredQuestionIds, question.id])
        });
        if (state.questionIndex + 1 < DIAGNOSTIC_BANK[state.tier].length) return immutable(committed, { questionIndex: state.questionIndex + 1 });
        return finishTier(committed);
    }
    if (state.value === 'assigned' && event.type === 'NEXT_RESULT') {
        const lines = ASSIGNMENT_DIALOGUE[state.assignedLevel] || [];
        if (state.resultIndex < lines.length - 1) return immutable(state, { resultIndex: state.resultIndex + 1 });
        return immutable(state, { value: 'complete' });
    }
    return state;
}

export function getStageAccess(assignedLevel) {
    if (![1, 2, 3, 4].includes(assignedLevel)) return Object.freeze({ 1: 'locked', 2: 'locked', 3: 'locked', 4: 'locked' });
    return Object.freeze(Object.fromEntries([1, 2, 3, 4].map((level) => [level, level <= assignedLevel ? 'open' : 'locked'])));
}

export function getUnlockedLevelsForPlacement(assignedLevel) {
    const normalizedLevel = Number(assignedLevel);
    const access = getStageAccess(normalizedLevel);
    if (access[normalizedLevel] !== 'open') return Object.freeze([]);
    return Object.freeze([1, 2, 3, 4].filter((level) => access[level] === 'open'));
}

export function shouldRunStudentDiagnostic({ role, assignedLevel, diagnosticStatus, diagnosticVersion } = {}) {
    return role === 'student' && (diagnosticStatus !== 'complete' || diagnosticVersion !== DIAGNOSTIC_CONTENT_VERSION || ![1, 2, 3, 4].includes(Number(assignedLevel)));
}
