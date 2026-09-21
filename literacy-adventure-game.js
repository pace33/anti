const state = {
    round: null,
    busy: false,
    score: 0,
    initialized: false,
    selectedAnswer: null,
    submitted: false,
    runId: ''
};

const $ = (id) => document.getElementById(id);

const TYPE_LABELS = Object.freeze({
    multipleChoice: '객관식 · 4지선다',
    shortAnswer: '단답형',
    essay: '서술형'
});

const RESPONSE_GUIDES = Object.freeze({
    multipleChoice: '지문의 시간·장소·인물 행동을 연결해 가장 타당한 추리를 고르세요.',
    shortAnswer: '여러 단서가 가리키는 핵심 인물·물건·원인을 짧게 적으세요.',
    essay: '추리한 결론을 먼저 쓰고, 그렇게 판단한 지문 속 근거를 함께 설명하세요.'
});

const DIFFICULTY_LABELS = Object.freeze({
    easy: '쉬움',
    normal: '보통',
    hard: '어려움',
    expert: '매우 어려움'
});

function setWorkspaceDisabled(disabled) {
    document.querySelectorAll('#literacy-adventure-options button, #literacy-adventure-input')
        .forEach((element) => { element.disabled = disabled; });
}

function isGameVisible() {
    return !$('literacy-adventure-game-section')?.classList.contains('hidden');
}

function hasCurrentAnswer() {
    return state.round?.type === 'multipleChoice'
        ? Number.isInteger(state.selectedAnswer)
        : Boolean(String($('literacy-adventure-input')?.value || '').trim());
}

function updateProgress() {
    const hasAnswer = hasCurrentAnswer();
    document.querySelectorAll('#literacy-adventure-steps li').forEach((item, index) => {
        const done = index === 0 || (index === 1 && hasAnswer) || (index === 2 && state.submitted);
        const active = !state.submitted && ((index === 1 && !hasAnswer) || (index === 2 && hasAnswer));
        item.classList.toggle('done', done);
        item.classList.toggle('active', active);
    });
    $('literacy-adventure-game-section')?.classList.toggle('has-response', hasAnswer);
    const submit = $('literacy-adventure-submit');
    if (submit) submit.disabled = state.busy || state.submitted || !hasAnswer;
}

function renderPassage() {
    const passage = $('literacy-adventure-passage');
    passage.replaceChildren();
    const paragraphs = String(state.round?.passage || '')
        .split(/\n+/)
        .map((text) => text.trim())
        .filter(Boolean);
    (paragraphs.length ? paragraphs : ['사건 지문을 불러오지 못했어요.']).forEach((text, index) => {
        const paragraph = document.createElement('p');
        paragraph.className = 'literacy-case-paragraph';
        const marker = document.createElement('span');
        marker.className = 'literacy-case-paragraph-marker';
        marker.textContent = String(index + 1).padStart(2, '0');
        marker.setAttribute('aria-hidden', 'true');
        const copy = document.createElement('span');
        copy.textContent = text;
        paragraph.append(marker, copy);
        passage.appendChild(paragraph);
    });
}

function chooseOption(index, button) {
    if (state.busy || state.submitted) return;
    state.selectedAnswer = index;
    document.querySelectorAll('#literacy-adventure-options button').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
    });
    updateProgress();
}

function renderAnswer() {
    const round = state.round;
    $('literacy-adventure-question').textContent = round.question;
    $('literacy-adventure-difficulty').textContent = round.isLimitBreakMode
        ? `한계돌파 · ${DIFFICULTY_LABELS[round.difficulty] || round.difficulty || '맞춤'}`
        : (DIFFICULTY_LABELS[round.difficulty] || round.difficulty || '맞춤');
    $('literacy-adventure-type').textContent = TYPE_LABELS[round.type] || '추리 문제';
    $('literacy-adventure-response-guide').textContent = RESPONSE_GUIDES[round.type] || RESPONSE_GUIDES.essay;
    const options = $('literacy-adventure-options');
    const inputWrap = $('literacy-adventure-input-wrap');
    options.replaceChildren();
    inputWrap.classList.toggle('hidden', round.type === 'multipleChoice');
    if (round.type === 'multipleChoice') {
        (round.options || []).forEach((option, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.setAttribute('aria-pressed', 'false');
            const number = document.createElement('span');
            number.textContent = String(index + 1);
            const text = document.createElement('strong');
            text.textContent = String(option);
            button.append(number, text);
            button.addEventListener('click', () => chooseOption(index, button));
            options.appendChild(button);
        });
    } else {
        const input = $('literacy-adventure-input');
        input.disabled = false;
        input.value = '';
        input.rows = round.type === 'essay' ? 6 : 2;
        input.maxLength = round.type === 'essay' ? 800 : 80;
        input.placeholder = '';
    }
    updateProgress();
}

function resetDesk() {
    state.selectedAnswer = null;
    state.submitted = false;
    $('literacy-adventure-game-section')?.classList.remove('has-response', 'case-solved', 'case-recheck');
    $('literacy-adventure-feedback').className = '';
    $('literacy-adventure-feedback').textContent = '';
    const restart = $('literacy-adventure-restart');
    restart.classList.add('hidden');
    restart.disabled = false;
    restart.textContent = '다음 사건 수사';
    $('literacy-adventure-submit').classList.remove('hidden');
    setWorkspaceDisabled(false);
}

async function startRound() {
    if (state.busy) return;
    const isNextRound = state.submitted;
    const start = $('literacy-adventure-start');
    const restart = $('literacy-adventure-restart');
    const answerPanel = $('literacy-adventure-answer');
    state.busy = true;
    answerPanel?.setAttribute('aria-busy', 'true');
    if (isNextRound) {
        restart.disabled = true;
        restart.textContent = '사건 기록을 받는 중…';
    } else {
        start.disabled = true;
        start.textContent = '사건 기록을 받는 중…';
    }
    try {
        const facade = window.aiedueLiteracyAdventureData;
        if (!facade?.createRound) throw new Error('문해력 탐정단 데이터를 준비하지 못했어요.');
        const round = await facade.createRound();
        state.round = round;
        resetDesk();
        $('literacy-adventure-dan').textContent = round.isLimitBreakMode ? `문해력 ${round.dan || 1}단 · 한계돌파` : `문해력 ${round.dan || 1}단`;
        renderPassage();
        renderAnswer();
        $('literacy-adventure-loading').classList.add('hidden');
        if (isGameVisible()) $('literacy-adventure-passage')?.focus({ preventScroll: true });
    } catch (error) {
        if (isNextRound) {
            restart.disabled = false;
            restart.textContent = '다음 사건 다시 수사';
        } else {
            start.disabled = false;
            start.textContent = '사건 수사 다시 시작';
            $('literacy-adventure-loading').classList.remove('hidden');
            $('literacy-adventure-loading').querySelector('p').textContent = error?.message || '사건 기록을 준비하지 못했어요.';
        }
    } finally {
        state.busy = false;
        answerPanel?.removeAttribute('aria-busy');
        updateProgress();
    }
}

async function submit() {
    if (state.busy || !state.round || state.submitted) return;
    const value = state.round.type === 'multipleChoice'
        ? state.selectedAnswer
        : $('literacy-adventure-input').value;
    if (state.round.type === 'multipleChoice' && !Number.isInteger(value)) {
        $('literacy-adventure-feedback').textContent = '가장 타당한 추리를 먼저 골라 주세요.';
        return;
    }
    if (state.round.type !== 'multipleChoice' && !String(value).trim()) {
        $('literacy-adventure-feedback').textContent = '지문을 바탕으로 추리한 답을 적어 주세요.';
        return;
    }
    const answerPanel = $('literacy-adventure-answer');
    state.busy = true;
    answerPanel?.setAttribute('aria-busy', 'true');
    setWorkspaceDisabled(true);
    updateProgress();
    $('literacy-adventure-feedback').className = 'checking';
    $('literacy-adventure-feedback').textContent = state.round.type === 'essay'
        ? '에이두 탐정이 결론과 지문 근거를 함께 확인하고 있어요…'
        : '사건 기록의 단서와 추리를 대조하고 있어요…';
    try {
        const result = await window.aiedueLiteracyAdventureData.submitAnswer(value);
        state.submitted = true;
        window.recordKoreanStageGameResult?.({
            gameId: 'literacy-detective',
            successCount: result.isCorrect ? 1 : 0,
            attemptCount: 1,
            runId: state.runId
        })?.catch?.(() => {});
        if (result.isCorrect) state.score += 1;
        $('literacy-adventure-score').textContent = `해결 ${state.score}`;
        $('literacy-adventure-game-section')?.classList.add(result.isCorrect ? 'case-solved' : 'case-recheck');
        const feedback = $('literacy-adventure-feedback');
        feedback.className = result.isCorrect ? 'published' : 'revision';
        feedback.replaceChildren();
        const headline = document.createElement('strong');
        headline.textContent = result.isCorrect ? '🔎 사건 해결' : '🧩 추리 다시 확인';
        const detail = document.createElement('span');
        detail.textContent = `${result.detail}${result.explanation ? ` ${result.explanation}` : ''}`;
        const evidence = document.createElement('small');
        evidence.textContent = result.levelUpCount > 0
            ? `레벨 ${result.aeduLevel}로 올랐어요!${result.removedWarningTokens ? ` 주의토큰 ${result.removedWarningTokens}개도 줄었어요.` : ''}`
            : result.isCorrect
            ? '지문 속 여러 정보를 연결해 타당한 결론을 찾았어요.'
            : '인물의 행동, 시간, 장소, 원인 사이에 모순이 없는지 다시 살펴보세요.';
        feedback.append(headline, detail, evidence);
        $('literacy-adventure-submit').classList.add('hidden');
        $('literacy-adventure-restart').classList.remove('hidden');
        setWorkspaceDisabled(true);
        updateProgress();
        if (isGameVisible()) $('literacy-adventure-restart').focus();
    } catch (error) {
        setWorkspaceDisabled(false);
        $('literacy-adventure-feedback').className = 'revision';
        $('literacy-adventure-feedback').textContent = error?.message || '수사 기록을 저장하지 못했어요. 같은 답으로 다시 시도해 주세요.';
    } finally {
        state.busy = false;
        answerPanel?.removeAttribute('aria-busy');
        updateProgress();
    }
}

window.initLiteracyAdventureGame = function initLiteracyAdventureGame() {
    state.runId = globalThis.crypto?.randomUUID?.() || `literacy-detective-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (!state.initialized) {
        $('literacy-adventure-start')?.addEventListener('click', startRound);
        $('literacy-adventure-submit')?.addEventListener('click', submit);
        $('literacy-adventure-input')?.addEventListener('input', updateProgress);
        $('literacy-adventure-restart')?.addEventListener('click', startRound);
        state.initialized = true;
    }
    $('literacy-adventure-loading')?.classList.remove('hidden');
    const start = $('literacy-adventure-start');
    if (start) {
        start.disabled = state.busy;
        start.textContent = state.busy ? '수사를 준비하는 중…' : '첫 사건 수사 시작';
    }
};
