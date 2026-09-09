import {
    KOREAN_LAB_TIME_DIFFICULTIES,
    KOREAN_LAB_TIME_REWARDS,
    buildKoreanLabClockOptions,
    createKoreanLabAttemptId,
    formatKoreanLabTime,
    generateKoreanLabClockTime,
    timeKey,
    validateKoreanLabClockInput
} from './korean-lab-time-quiz-core.mjs?v=20260909-3';

const section = document.getElementById('korean-lab-time-quiz-section');
const labels = Object.freeze({ easy: '쉬움', middle: '보통', hard: '어려움', 'very-hard': '도전' });
const state = {
    difficulty: 'easy', correct: null, selected: null, recent: [], question: 0,
    attemptsLeft: 3, settled: false, submitting: false, timer: 0, generation: 0, attemptId: null
};
const ui = {};
let initialized = false;

function initialize() {
    if (initialized || !section) return;
    for (const id of ['clock','hour-hand','minute-hand','reward-label','question-count','options','inputs','hour-input','minute-input','check','feedback']) {
        ui[id] = document.getElementById(`kltq-${id}`);
    }
    section.querySelectorAll('[data-difficulty]').forEach((button) => {
        button.addEventListener('click', () => setDifficulty(button.dataset.difficulty));
    });
    ui.check.addEventListener('click', checkAnswer);
    [ui['hour-input'], ui['minute-input']].forEach((input) => input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') void checkAnswer();
    }));
    section.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') window.closeKoreanLabTimeQuiz();
    });
    initialized = true;
}

function setFeedback(message, tone = '') {
    ui.feedback.textContent = message;
    ui.feedback.className = `kltq-feedback${tone ? ` ${tone}` : ''}`;
}

function setDisabled(disabled) {
    ui.check.disabled = disabled;
    section.querySelectorAll('[data-difficulty], #kltq-options button, #kltq-inputs input').forEach((node) => { node.disabled = disabled; });
}

function renderClock() {
    if (!state.correct) return;
    const minuteAngle = state.correct.minute * 6;
    const hourAngle = (state.correct.hour % 12) * 30 + state.correct.minute * .5;
    ui['minute-hand'].style.transform = `translateX(-50%) rotate(${minuteAngle}deg)`;
    ui['hour-hand'].style.transform = `translateX(-50%) rotate(${hourAngle}deg)`;
    ui.clock.setAttribute('aria-label', `${labels[state.difficulty]} 난이도 문제 시계`);
}

function renderDifficulty() {
    section.querySelectorAll('[data-difficulty]').forEach((button) => button.classList.toggle('active', button.dataset.difficulty === state.difficulty));
    ui['reward-label'].textContent = `정답 경험치 +${KOREAN_LAB_TIME_REWARDS[state.difficulty]} EXP`;
}

function selectOption(option, button) {
    if (state.settled || state.submitting) return;
    state.selected = option;
    ui.options.querySelectorAll('button').forEach((node) => node.classList.toggle('selected', node === button));
    setFeedback('선택한 답을 확인해 보세요.');
}

function renderAnswers() {
    const isInput = state.difficulty === 'very-hard';
    ui.options.replaceChildren();
    ui.options.classList.toggle('hidden', isInput);
    ui.inputs.classList.toggle('hidden', !isInput);
    if (isInput) {
        ui['hour-input'].value = '';
        ui['minute-input'].value = '';
        window.setTimeout(() => ui['hour-input'].focus({ preventScroll: true }), 0);
        return;
    }
    buildKoreanLabClockOptions(state.correct, state.difficulty).forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${index + 1}. ${formatKoreanLabTime(option)}`;
        button.dataset.time = timeKey(option);
        button.addEventListener('click', () => selectOption(option, button));
        ui.options.append(button);
    });
}

function nextQuestion() {
    window.clearTimeout(state.timer);
    state.correct = generateKoreanLabClockTime(state.difficulty, Math.random, state.recent);
    state.attemptId = createKoreanLabAttemptId();
    state.recent = [...state.recent, state.correct].slice(-3);
    state.selected = null;
    state.question += 1;
    state.attemptsLeft = 3;
    state.settled = false;
    state.submitting = false;
    ui['question-count'].textContent = `문제 ${state.question} · ${labels[state.difficulty]}`;
    renderClock();
    renderAnswers();
    renderDifficulty();
    setDisabled(false);
    setFeedback(state.difficulty === 'very-hard' ? '시와 분을 직접 입력해 주세요. 기회는 3번이에요.' : '답을 골라 주세요.');
}

function setDifficulty(difficulty) {
    if (!KOREAN_LAB_TIME_DIFFICULTIES.includes(difficulty) || state.submitting) return;
    state.difficulty = difficulty;
    nextQuestion();
}

function reveal(correct) {
    ui.options.querySelectorAll('button').forEach((button) => {
        button.classList.toggle('correct', button.dataset.time === timeKey(state.correct));
        button.classList.toggle('wrong', !correct && button.classList.contains('selected'));
    });
}

async function checkAnswer() {
    if (!state.correct || state.settled || state.submitting) return;
    let answer = state.selected;
    if (state.difficulty === 'very-hard') {
        const hour = Number.parseInt(ui['hour-input'].value, 10);
        const minute = Number.parseInt(ui['minute-input'].value, 10);
        const validation = validateKoreanLabClockInput(hour, minute);
        if (validation) { setFeedback(validation, 'warn'); return; }
        answer = { hour, minute };
    } else if (!answer) {
        setFeedback('답을 먼저 골라 주세요.', 'warn');
        return;
    }

    const correct = timeKey(answer) === timeKey(state.correct);
    if (!correct && state.difficulty === 'very-hard' && state.attemptsLeft > 1) {
        state.attemptsLeft -= 1;
        setFeedback(`다시 살펴보세요. 남은 기회 ${state.attemptsLeft}번`, 'warn');
        ui['hour-input'].select();
        return;
    }

    state.settled = true;
    reveal(correct);
    setDisabled(true);
    if (!correct) {
        setFeedback(`정답은 ${formatKoreanLabTime(state.correct)}이에요.`, 'error');
        state.timer = window.setTimeout(nextQuestion, 1600);
        return;
    }

    state.submitting = true;
    const generation = state.generation;
    const reward = KOREAN_LAB_TIME_REWARDS[state.difficulty];
    const attemptId = state.attemptId;
    try {
        if (!window.aiedueKoreanLabTimeQuizData?.awardExperience) throw new Error('한글 보상 저장소가 준비되지 않았습니다.');
        await window.aiedueKoreanLabTimeQuizData.awardExperience(reward, attemptId);
        if (generation !== state.generation) return;
        setFeedback(`정답이에요! 한글 경험치 +${reward} EXP`, 'ok');
        state.timer = window.setTimeout(nextQuestion, 1100);
    } catch (error) {
        console.error('Korean lab time quiz reward failed:', error);
        state.settled = false;
        state.submitting = false;
        setDisabled(false);
        setFeedback('정답이에요. 경험치 저장 연결을 확인한 뒤 다시 눌러 주세요.', 'warn');
    }
}

window.openKoreanLabTimeQuiz = function openKoreanLabTimeQuiz() {
    initialize();
    if (!initialized) return;
    window.closeAiedueKoreanModal?.();
    window.showAiedueTopLevelSection?.('korean-lab-time-quiz-section');
    state.generation += 1;
    state.question = 0;
    state.recent = [];
    nextQuestion();
    section.focus({ preventScroll: true });
};

window.stopKoreanLabTimeQuiz = function stopKoreanLabTimeQuiz() {
    window.clearTimeout(state.timer);
    state.timer = 0;
    state.generation += 1;
    state.submitting = false;
};

window.closeKoreanLabTimeQuiz = function closeKoreanLabTimeQuiz() {
    window.stopKoreanLabTimeQuiz();
    document.body.classList.remove('korean-lab-time-quiz-open');
    window.showAiedueTopLevelSection?.('dashboard-section');
    window.openAiedueLab?.();
};

initialize();
