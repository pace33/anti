const state = {
    round: null,
    busy: false,
    score: 0,
    initialized: false,
    selectedEvidence: '',
    selectedAnswer: null,
    submitted: false
};

const $ = (id) => document.getElementById(id);

const TYPE_LABELS = Object.freeze({
    multipleChoice: '선택형',
    shortAnswer: '단답형',
    essay: '서술형'
});

const DIFFICULTY_LABELS = Object.freeze({
    easy: '쉬움',
    normal: '보통',
    hard: '어려움',
    expert: '매우 어려움'
});

function setWorkspaceDisabled(disabled) {
    document.querySelectorAll('#literacy-adventure-passage button, #literacy-adventure-options button, #literacy-adventure-input')
        .forEach((element) => { element.disabled = disabled; });
}

function isGameVisible() {
    return !$('literacy-adventure-game-section')?.classList.contains('hidden');
}

function splitPassageIntoSentences(passage) {
    const paragraphs = String(passage || '').split(/\n+/).map((text) => text.trim()).filter(Boolean);
    const sentences = paragraphs.flatMap((paragraph) => paragraph.match(/[^.!?。！？]+[.!?。！？]?/g) || [paragraph]);
    return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

function updateProgress() {
    const hasEvidence = Boolean(state.selectedEvidence);
    const hasAnswer = state.round?.type === 'multipleChoice'
        ? Number.isInteger(state.selectedAnswer)
        : Boolean(String($('literacy-adventure-input')?.value || '').trim());
    document.querySelectorAll('#literacy-adventure-steps li').forEach((item, index) => {
        const done = index === 0 || (index === 1 && hasEvidence) || (index === 2 && state.submitted);
        const active = !state.submitted && ((index === 1 && !hasEvidence) || (index === 2 && hasEvidence));
        item.classList.toggle('done', done);
        item.classList.toggle('active', active);
    });
    $('literacy-adventure-answer')?.classList.toggle('unlocked', hasEvidence);
    const submit = $('literacy-adventure-submit');
    if (submit) submit.disabled = state.busy || state.submitted || !hasEvidence || !hasAnswer;
}

function chooseEvidence(sentence, button) {
    if (state.busy || state.submitted) return;
    state.selectedEvidence = sentence;
    document.querySelectorAll('#literacy-adventure-passage button').forEach((item) => {
        const selected = item === button;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
    });
    const clue = $('literacy-adventure-clue');
    clue.querySelector('span').textContent = '취재 메모';
    clue.querySelector('strong').textContent = `“${sentence}”`;
    clue.querySelector('small').textContent = '이 문장을 근거로 답을 완성하세요.';
    updateProgress();
    if (window.matchMedia('(max-width: 900px)').matches) {
        const answer = $('literacy-adventure-answer');
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        answer?.focus({ preventScroll: true });
        answer?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
}

function renderPassage() {
    const passage = $('literacy-adventure-passage');
    passage.innerHTML = '';
    splitPassageIntoSentences(state.round?.passage).forEach((sentence, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'literacy-news-sentence';
        button.setAttribute('aria-pressed', 'false');
        const number = document.createElement('span');
        number.textContent = String(index + 1);
        const text = document.createElement('span');
        text.textContent = sentence;
        button.append(number, text);
        button.addEventListener('click', () => chooseEvidence(sentence, button));
        passage.appendChild(button);
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
    $('literacy-adventure-difficulty').textContent = DIFFICULTY_LABELS[round.difficulty] || round.difficulty || '맞춤';
    $('literacy-adventure-type').textContent = TYPE_LABELS[round.type] || '문해력';
    const options = $('literacy-adventure-options');
    const inputWrap = $('literacy-adventure-input-wrap');
    options.innerHTML = '';
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
        input.placeholder = round.type === 'essay'
            ? '선택한 근거를 활용해 내 생각을 적어 보세요.'
            : '지문에서 찾은 답을 짧게 적어 보세요.';
    }
    updateProgress();
}

function resetDesk() {
    state.selectedEvidence = '';
    state.selectedAnswer = null;
    state.submitted = false;
    $('literacy-adventure-clue').innerHTML = '<span>취재 메모</span><strong>아직 고른 근거가 없습니다.</strong><small>왼쪽 기사에서 중요한 문장을 하나 누르세요.</small>';
    $('literacy-adventure-feedback').className = '';
    $('literacy-adventure-feedback').textContent = '';
    const restart = $('literacy-adventure-restart');
    restart.classList.add('hidden');
    restart.disabled = false;
    restart.textContent = '다음 취재 시작';
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
        restart.textContent = '취재 자료를 받는 중…';
    } else {
        start.disabled = true;
        start.textContent = '취재 자료를 받는 중…';
    }
    try {
        const facade = window.aiedueLiteracyAdventureData;
        if (!facade?.createRound) throw new Error('문해력 편집국 데이터를 준비하지 못했어요.');
        const round = await facade.createRound();
        state.round = round;
        resetDesk();
        $('literacy-adventure-dan').textContent = `문해력 ${round.dan || 1}단`;
        renderPassage();
        renderAnswer();
        $('literacy-adventure-loading').classList.add('hidden');
        if (isGameVisible()) document.querySelector('#literacy-adventure-passage button')?.focus({ preventScroll: true });
    } catch (error) {
        if (isNextRound) {
            restart.disabled = false;
            restart.textContent = '다음 취재 다시 시도';
        } else {
            start.disabled = false;
            start.textContent = '다시 편집 회의 열기';
            $('literacy-adventure-loading').classList.remove('hidden');
            $('literacy-adventure-loading').querySelector('p').textContent = error?.message || '취재 자료를 준비하지 못했어요.';
        }
    } finally {
        state.busy = false;
        answerPanel?.removeAttribute('aria-busy');
        updateProgress();
    }
}

async function submit() {
    if (state.busy || !state.round || state.submitted) return;
    if (!state.selectedEvidence) {
        $('literacy-adventure-feedback').textContent = '기사에서 답의 근거가 되는 문장을 먼저 골라 주세요.';
        return;
    }
    const value = state.round.type === 'multipleChoice'
        ? state.selectedAnswer
        : $('literacy-adventure-input').value;
    if (state.round.type === 'multipleChoice' && !Number.isInteger(value)) {
        $('literacy-adventure-feedback').textContent = '헤드라인에 들어갈 답을 먼저 골라 주세요.';
        return;
    }
    if (state.round.type !== 'multipleChoice' && !String(value).trim()) {
        $('literacy-adventure-feedback').textContent = '기사에 실을 답을 먼저 적어 주세요.';
        return;
    }
    const answerPanel = $('literacy-adventure-answer');
    state.busy = true;
    answerPanel?.setAttribute('aria-busy', 'true');
    setWorkspaceDisabled(true);
    updateProgress();
    $('literacy-adventure-feedback').className = 'checking';
    $('literacy-adventure-feedback').textContent = state.round.type === 'essay'
        ? '편집장이 지문 근거와 답안을 함께 확인하고 있어요…'
        : '기사의 사실 관계를 확인하고 있어요…';
    try {
        const result = await window.aiedueLiteracyAdventureData.submitAnswer(value);
        state.submitted = true;
        if (result.isCorrect) state.score += 1;
        $('literacy-adventure-score').textContent = `발행 ${state.score}`;
        const feedback = $('literacy-adventure-feedback');
        feedback.className = result.isCorrect ? 'published' : 'revision';
        feedback.replaceChildren();
        const headline = document.createElement('strong');
        headline.textContent = result.isCorrect ? '📰 발행 성공' : '✍️ 팩트 재확인';
        const detail = document.createElement('span');
        detail.textContent = `${result.detail}${result.explanation ? ` ${result.explanation}` : ''}`;
        const evidence = document.createElement('small');
        evidence.textContent = `내가 고른 근거: “${state.selectedEvidence}”`;
        feedback.append(headline, detail, evidence);
        $('literacy-adventure-submit').classList.add('hidden');
        $('literacy-adventure-restart').classList.remove('hidden');
        setWorkspaceDisabled(true);
        updateProgress();
        if (isGameVisible()) $('literacy-adventure-restart').focus();
    } catch (error) {
        setWorkspaceDisabled(false);
        $('literacy-adventure-feedback').className = 'revision';
        $('literacy-adventure-feedback').textContent = error?.message || '기사를 저장하지 못했어요. 같은 답으로 다시 시도해 주세요.';
    } finally {
        state.busy = false;
        answerPanel?.removeAttribute('aria-busy');
        updateProgress();
    }
}

window.initLiteracyAdventureGame = function initLiteracyAdventureGame() {
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
        start.textContent = state.busy ? '작업을 마무리하는 중…' : '오늘의 편집 회의 시작';
    }
};
