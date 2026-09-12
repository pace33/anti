const state = { round: null, gate: 0, busy: false, score: 0, initialized: false };
const $ = (id) => document.getElementById(id);

function setStep(gate) {
    state.gate = gate;
    document.querySelectorAll('#literacy-adventure-steps li').forEach((item, index) => {
        item.classList.toggle('active', index === gate);
        item.classList.toggle('done', index < gate);
    });
    const clues = [
        '지문을 천천히 읽고 중요한 내용을 머릿속에 그려 보세요.',
        `핵심 낱말: ${(state.round?.keywords || []).slice(0, 5).join(' · ') || '지문에서 반복되는 낱말을 찾아보세요.'}`,
        `문제 유형은 ${state.round?.type === 'multipleChoice' ? '객관식' : state.round?.type === 'shortAnswer' ? '단답형' : '서술형'}이에요. 질문이 무엇을 묻는지 찾아보세요.`,
        '마지막 관문이에요. 지문 속 근거를 떠올려 답을 골라요.'
    ];
    $('literacy-adventure-clue').textContent = clues[gate];
    $('literacy-adventure-next').textContent = gate >= 3 ? '답변 열기' : ['다음 관문', '단서 확인', '최종 문제로'][gate] || '다음 관문';
    $('literacy-adventure-answer').classList.toggle('unlocked', gate >= 3);
    if (gate >= 3) renderAnswer();
}

function renderAnswer() {
    const round = state.round;
    $('literacy-adventure-question').textContent = round.question;
    const options = $('literacy-adventure-options');
    const inputWrap = $('literacy-adventure-input-wrap');
    options.innerHTML = '';
    inputWrap.classList.toggle('hidden', round.type === 'multipleChoice');
    if (round.type === 'multipleChoice') {
        (round.options || []).forEach((option, index) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${index + 1}. ${option}`;
            button.addEventListener('click', () => submit(index));
            options.appendChild(button);
        });
    } else {
        $('literacy-adventure-input').value = '';
        $('literacy-adventure-input').placeholder = round.type === 'essay' ? '지문 속 근거를 넣어 자세히 적어 보세요.' : '짧은 답을 적어 보세요.';
    }
}

async function startRound() {
    if (state.busy) return;
    state.busy = true;
    const start = $('literacy-adventure-start');
    start.disabled = true;
    start.textContent = '탐험 지도를 만드는 중…';
    try {
        const facade = window.aiedueLiteracyAdventureData;
        if (!facade?.createRound) throw new Error('문해력 게임 데이터를 준비하지 못했어요.');
        state.round = await facade.createRound();
        window.showLiteracyAdventureGameSection?.();
        $('literacy-adventure-passage').textContent = state.round.passage;
        $('literacy-adventure-dan').textContent = `문해력 ${state.round.dan || 1}단`;
        $('literacy-adventure-question').textContent = '4개 관문을 지나면 문제가 열려요.';
        $('literacy-adventure-options').innerHTML = '';
        $('literacy-adventure-input-wrap').classList.add('hidden');
        $('literacy-adventure-feedback').textContent = '';
        $('literacy-adventure-restart').classList.add('hidden');
        $('literacy-adventure-loading').classList.add('hidden');
        setStep(0);
        $('literacy-adventure-next').focus({ preventScroll: true });
    } catch (error) {
        window.showLiteracyAdventureGameSection?.();
        start.disabled = false;
        start.textContent = '다시 탐험 시작하기';
        $('literacy-adventure-loading').classList.remove('hidden');
        $('literacy-adventure-loading').querySelector('p').textContent = error?.message || '탐험을 준비하지 못했어요.';
    } finally {
        state.busy = false;
    }
}

async function submit(answer) {
    if (state.busy || !state.round) return;
    const value = answer ?? $('literacy-adventure-input').value;
    if (state.round.type !== 'multipleChoice' && !String(value).trim()) {
        $('literacy-adventure-feedback').textContent = '답을 먼저 적어 주세요.';
        return;
    }
    state.busy = true;
    document.querySelectorAll('#literacy-adventure-options button, #literacy-adventure-submit').forEach((el) => { el.disabled = true; });
    $('literacy-adventure-feedback').textContent = state.round.type === 'essay' ? 'AI가 지문 근거를 확인하고 있어요…' : '답을 확인하고 있어요…';
    try {
        const result = await window.aiedueLiteracyAdventureData.submitAnswer(value);
        window.showLiteracyAdventureGameSection?.();
        if (result.isCorrect) state.score += 1;
        $('literacy-adventure-score').textContent = `⭐ ${state.score}`;
        $('literacy-adventure-feedback').textContent = `${result.isCorrect ? '🎉 탐험 성공!' : '🔎 다시 살펴봐요.'} ${result.detail}${result.explanation ? ` ${result.explanation}` : ''}`;
        $('literacy-adventure-restart').classList.remove('hidden');
        $('literacy-adventure-restart').focus();
    } catch (error) {
        window.showLiteracyAdventureGameSection?.();
        $('literacy-adventure-feedback').textContent = error?.message || '답을 저장하지 못했어요. 다시 시도해 주세요.';
        document.querySelectorAll('#literacy-adventure-options button, #literacy-adventure-submit').forEach((el) => { el.disabled = false; });
    } finally {
        state.busy = false;
    }
}

window.initLiteracyAdventureGame = function initLiteracyAdventureGame() {
    if (!state.initialized) {
        $('literacy-adventure-start')?.addEventListener('click', startRound);
        $('literacy-adventure-next')?.addEventListener('click', () => {
            if (!state.round) return;
            if (state.gate < 3) setStep(state.gate + 1);
            else renderAnswer();
        });
        $('literacy-adventure-submit')?.addEventListener('click', () => submit());
        $('literacy-adventure-restart')?.addEventListener('click', startRound);
        state.initialized = true;
    }
    $('literacy-adventure-loading')?.classList.remove('hidden');
    const start = $('literacy-adventure-start');
    if (start) { start.disabled = false; start.textContent = '탐험 시작하기'; }
};
