import {
    buildSyllableReaderTokens,
    getSyllableReaderGap,
    getSyllableReaderSequence,
    normalizeSyllableReaderText
} from './syllable-slow-reader-core.mjs';

const MAX_GRAPHEMES = 80;
const PLAYBACK_RATE = 0.72;
const SAMPLE_TEXTS = [
    '동해물과 백두산이',
    '가 나 다 라 마 바 사',
    '사과 바나나 수박 포도',
    '천천히 또박또박 읽어요',
    '오늘도 참 좋은 하루'
];

const state = {
    bound: false,
    isPlaying: false,
    runId: 0,
    sampleIndex: 0,
    gapTimer: null,
    gapResolve: null
};

const $ = (id) => document.getElementById(id);
const ui = () => ({
    section: $('reading-custom-maker'),
    input: $('ssr-text-input'),
    board: $('ssr-board'),
    empty: $('ssr-empty'),
    play: $('ssr-play'),
    playIcon: $('ssr-play-icon'),
    playText: $('ssr-play-text'),
    clear: $('ssr-clear'),
    sample: $('ssr-sample'),
    range: $('ssr-gap-range'),
    gapDisplay: $('ssr-gap-display'),
    status: $('ssr-status'),
    count: $('ssr-count')
});

function clearActiveCards() {
    ui().board?.querySelectorAll('.ssr-token.active').forEach((card) => {
        card.classList.remove('active');
        card.removeAttribute('aria-current');
    });
}

function setPlayingUi(playing, preparing = false) {
    const elements = ui();
    state.isPlaying = playing;
    elements.section?.classList.toggle('is-playing', playing);
    elements.play?.setAttribute('aria-pressed', String(playing));
    if (elements.playIcon) elements.playIcon.textContent = preparing ? '◌' : (playing ? '■' : '▶');
    if (elements.playText) elements.playText.textContent = preparing ? '음성 준비 중…' : (playing ? '읽기 멈춤' : '천천히 읽기');
}

function setStatus(message, tone = '') {
    const status = ui().status;
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
}

function cancelGapWait() {
    if (state.gapTimer) window.clearTimeout(state.gapTimer);
    state.gapTimer = null;
    const resolve = state.gapResolve;
    state.gapResolve = null;
    resolve?.(false);
}

function waitForGap(milliseconds, runId) {
    return new Promise((resolve) => {
        state.gapResolve = resolve;
        state.gapTimer = window.setTimeout(() => {
            state.gapTimer = null;
            state.gapResolve = null;
            resolve(runId === state.runId);
        }, milliseconds);
    });
}

function stopReader(message = '') {
    const shouldCancelSpeech = state.isPlaying || Boolean(state.gapTimer);
    state.runId += 1;
    cancelGapWait();
    if (shouldCancelSpeech) window.cancelSpeech?.();
    clearActiveCards();
    setPlayingUi(false);
    if (message) setStatus(message);
}

function cardForSpeakIndex(index) {
    return ui().board?.querySelector(`[data-speak-index="${index}"]`);
}

function activateCard(index, total) {
    clearActiveCards();
    const card = cardForSpeakIndex(index);
    if (!card) return null;
    card.classList.add('active');
    card.setAttribute('aria-current', 'true');
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    setStatus(`읽는 중: '${card.textContent}' (${index + 1}/${total})`, 'playing');
    return card;
}

function render() {
    const elements = ui();
    if (!elements.input || !elements.board) return;
    const normalized = normalizeSyllableReaderText(elements.input.value, MAX_GRAPHEMES);
    if (elements.input.value !== normalized) elements.input.value = normalized;
    const tokens = buildSyllableReaderTokens(normalized, MAX_GRAPHEMES);
    const sequence = tokens.filter(({ kind }) => kind === 'speakable');
    elements.board.replaceChildren();
    elements.count.textContent = `${tokens.length}/${MAX_GRAPHEMES}`;
    if (!tokens.length) {
        const empty = document.createElement('p');
        empty.id = 'ssr-empty';
        empty.className = 'ssr-empty';
        empty.textContent = '글자를 입력하면 음절 카드가 나타나요.';
        elements.board.append(empty);
    }

    tokens.forEach((token) => {
        if (token.kind === 'space') {
            const space = document.createElement('span');
            space.className = 'ssr-space';
            space.setAttribute('aria-hidden', 'true');
            elements.board.append(space);
            return;
        }
        const card = document.createElement(token.kind === 'speakable' ? 'button' : 'span');
        card.className = `ssr-token ${token.kind}`;
        card.textContent = token.text;
        if (token.kind === 'speakable') {
            card.type = 'button';
            card.dataset.speakIndex = String(token.speakIndex);
            card.setAttribute('aria-label', `${token.text} 발음 듣기`);
            card.addEventListener('click', () => speakOne(token, card));
        } else {
            card.setAttribute('aria-hidden', 'true');
        }
        elements.board.append(card);
    });
    elements.play.disabled = sequence.length === 0;
}

async function speakOne(token, card) {
    stopReader();
    const runId = state.runId;
    setPlayingUi(true, true);
    card.classList.add('active');
    card.setAttribute('aria-current', 'true');
    setStatus(`'${token.text}' 발음을 듣는 중…`, 'playing');
    let completed = false;
    try {
        completed = Boolean(await window.speakTextKo?.(token.text, null, { playbackRate: PLAYBACK_RATE }));
    } catch (error) {
        console.error('음절 발음 재생 실패:', error);
    } finally {
        if (runId === state.runId) {
            clearActiveCards();
            setPlayingUi(false);
            setStatus(completed ? '다른 글자를 누르거나 전체 읽기를 시작해 보세요.' : '소리를 재생하지 못했습니다. 소리 설정을 확인한 뒤 다시 눌러 주세요.', completed ? '' : 'error');
        }
    }
}

async function startReader() {
    const elements = ui();
    const sequence = getSyllableReaderSequence(elements.input?.value, MAX_GRAPHEMES);
    if (!sequence.length) {
        setStatus('읽을 글자를 입력해 주세요.', 'error');
        elements.input?.focus();
        return;
    }

    stopReader();
    const runId = state.runId;
    const gap = getSyllableReaderGap(elements.range?.value);
    setPlayingUi(true, true);
    setStatus('에이두 음성을 준비하고 있습니다…', 'playing');

    try {
        for (let index = 0; index < sequence.length; index += 1) {
            if (runId !== state.runId) return;
            setPlayingUi(true);
            activateCard(index, sequence.length);
            const completed = await window.speakTextKo?.(sequence[index].text, null, { playbackRate: PLAYBACK_RATE });
            if (runId !== state.runId) return;
            if (!completed) {
                stopReader();
                setStatus('소리를 재생하지 못했습니다. 소리 설정이나 연결 상태를 확인한 뒤 다시 눌러 주세요.', 'error');
                return;
            }
            clearActiveCards();
            if (index < sequence.length - 1 && !(await waitForGap(gap.milliseconds, runId))) return;
        }
    } catch (error) {
        if (runId !== state.runId) return;
        console.error('음절 슬로우 리더 재생 실패:', error);
        stopReader();
        setStatus('소리를 재생하지 못했습니다. 소리 설정이나 연결 상태를 확인한 뒤 다시 눌러 주세요.', 'error');
        return;
    }

    if (runId !== state.runId) return;
    setPlayingUi(false);
    setStatus('전체 글자를 모두 읽었습니다! 🎉', 'success');
}

function bind() {
    if (state.bound) return;
    const elements = ui();
    if (!elements.section) return;
    state.bound = true;
    elements.input.value = SAMPLE_TEXTS[0];
    elements.input.addEventListener('input', () => {
        if (state.isPlaying) stopReader('입력이 바뀌어 읽기를 멈췄습니다.');
        render();
    });
    elements.clear.addEventListener('click', () => {
        stopReader();
        elements.input.value = '';
        render();
        setStatus('읽을 글자를 입력해 주세요.');
        elements.input.focus();
    });
    elements.sample.addEventListener('click', () => {
        stopReader();
        state.sampleIndex = (state.sampleIndex + 1) % SAMPLE_TEXTS.length;
        elements.input.value = SAMPLE_TEXTS[state.sampleIndex];
        render();
        setStatus('예시 글을 바꿨습니다.');
    });
    elements.range.addEventListener('input', () => {
        const gap = getSyllableReaderGap(elements.range.value);
        elements.gapDisplay.textContent = gap.label;
        if (state.isPlaying) stopReader('간격이 바뀌어 읽기를 멈췄습니다.');
    });
    elements.play.addEventListener('click', () => {
        if (state.isPlaying) stopReader('읽기를 중지했습니다.');
        else startReader();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state.isPlaying) stopReader();
    });
    render();
}

window.openSyllableSlowReader = function openSyllableSlowReader() {
    bind();
    render();
    setStatus('준비 완료. 재생 버튼을 누르면 한 글자씩 읽어 줍니다.');
    window.requestAnimationFrame(() => ui().input?.focus());
};

window.stopSyllableSlowReader = stopReader;
window.closeSyllableSlowReader = function closeSyllableSlowReader() {
    stopReader();
};

bind();
