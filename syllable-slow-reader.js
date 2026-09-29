import {
    buildSyllableReaderTokens,
    getSyllableReaderGap,
    getSyllableReaderSequence,
    normalizeSyllableReaderText
} from './syllable-slow-reader-core.mjs';

const MAX_GRAPHEMES = 80;
const PLAYBACK_RATE = 0.72;
const STORAGE_VERSION = 'v1';
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
    gapTimer: null,
    gapResolve: null,
    historyTab: 'today',
    storageKey: '',
    records: { todayDate: '', today: [], everyday: [] }
};

const $ = (id) => document.getElementById(id);
const ui = () => ({
    section: $('reading-custom-maker'),
    input: $('ssr-text-input'),
    board: $('ssr-board'),
    play: $('ssr-play'),
    playIcon: $('ssr-play-icon'),
    playText: $('ssr-play-text'),
    range: $('ssr-gap-range'),
    gapDisplay: $('ssr-gap-display'),
    settings: $('ssr-settings'),
    settingsPopup: $('ssr-settings-popup'),
    settingsClose: $('ssr-settings-close'),
    status: $('ssr-status'),
    count: $('ssr-count'),
    historyList: $('ssr-history-list')
});

function getTodayKey() {
    try {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (_) {
        return new Date().toISOString().slice(0, 10);
    }
}

function getAccountKey() {
    const fromApp = window.getAiedueKoreanCurrentUserId?.();
    const fromFirebase = window.firebase?.auth?.()?.currentUser?.uid || window.auth?.currentUser?.uid;
    return String(fromApp || fromFirebase || 'guest').replace(/[^\w.-]/g, '_');
}

function normalizeRecords(value = {}) {
    const todayDate = getTodayKey();
    const sourceDate = value.todayDate === todayDate ? todayDate : todayDate;
    return {
        todayDate: sourceDate,
        today: value.todayDate === todayDate && Array.isArray(value.today) ? value.today.filter(isRecord).slice(0, 60) : [],
        everyday: Array.isArray(value.everyday) ? value.everyday.filter(isRecord).slice(0, 120) : []
    };
}

function isRecord(record) {
    return Boolean(record && typeof record.id === 'string' && typeof record.text === 'string' && record.text.trim());
}

function storageKeyForCurrentAccount() {
    return `aiedue-hangul-card-list-${STORAGE_VERSION}:${getAccountKey()}`;
}

function loadRecords() {
    const key = storageKeyForCurrentAccount();
    if (state.storageKey === key && state.records.todayDate === getTodayKey()) return;
    state.storageKey = key;
    try {
        state.records = normalizeRecords(JSON.parse(localStorage.getItem(key) || '{}'));
    } catch (_) {
        state.records = normalizeRecords({});
    }
    saveRecords();
}

function saveRecords() {
    if (!state.storageKey) state.storageKey = storageKeyForCurrentAccount();
    try {
        localStorage.setItem(state.storageKey, JSON.stringify(state.records));
    } catch (error) {
        console.warn('한글 카드 리스트 저장 실패:', error);
    }
}

function makeRecord(text) {
    const normalized = normalizeSyllableReaderText(text, MAX_GRAPHEMES).trim();
    return {
        id: `card-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        text: normalized,
        createdAt: Date.now()
    };
}

function addTodayRecord(text) {
    loadRecords();
    const normalized = normalizeSyllableReaderText(text, MAX_GRAPHEMES).trim();
    if (!normalized) return;
    const withoutDuplicate = state.records.today.filter((record) => record.text !== normalized);
    state.records.today = [makeRecord(normalized), ...withoutDuplicate].slice(0, 60);
    saveRecords();
    renderHistory();
}

function promoteTodayRecord(id) {
    loadRecords();
    const record = state.records.today.find((item) => item.id === id);
    if (!record) return;
    state.records.today = state.records.today.filter((item) => item.id !== id);
    state.records.everyday = [{ ...record, id: `daily-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, savedAt: Date.now() }, ...state.records.everyday.filter((item) => item.text !== record.text)].slice(0, 120);
    saveRecords();
    renderHistory();
    setStatus('일상 탭에 저장했어요. 오늘 기록에서는 옮겨졌습니다.', 'success');
}

function removeRecord(bucket, id) {
    loadRecords();
    if (bucket !== 'today' && bucket !== 'everyday') return;
    state.records[bucket] = state.records[bucket].filter((item) => item.id !== id);
    saveRecords();
    renderHistory();
    setStatus('한글 카드 리스트에서 제거했어요.');
}

function formatRecordTime(timestamp) {
    if (!timestamp) return '';
    try {
        return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(timestamp));
    } catch (_) {
        return '';
    }
}

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
    if (elements.playText) elements.playText.textContent = preparing ? '준비 중' : (playing ? '멈춤' : '읽기');
}

function setStatus(message, tone = '') {
    const status = ui().status;
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
}

function toggleSettings(force) {
    const elements = ui();
    const shouldShow = typeof force === 'boolean' ? force : elements.settingsPopup?.classList.contains('hidden');
    elements.settingsPopup?.classList.toggle('hidden', !shouldShow);
    elements.settings?.setAttribute('aria-expanded', String(shouldShow));
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

function renderTokensInto(container, text) {
    const tokens = buildSyllableReaderTokens(text, MAX_GRAPHEMES).filter(({ kind }) => kind === 'speakable');
    tokens.forEach((token) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'ssr-history-token';
        button.textContent = token.text;
        button.setAttribute('aria-label', `${token.text} 발음 듣기`);
        button.addEventListener('click', () => speakHistoryToken(token.text, button));
        container.append(button);
    });
}

function renderHistory() {
    loadRecords();
    const elements = ui();
    if (!elements.historyList) return;
    const bucket = state.historyTab === 'everyday' ? 'everyday' : 'today';
    const rows = state.records[bucket] || [];
    elements.historyList.setAttribute('aria-labelledby', bucket === 'today' ? 'ssr-history-tab-today' : 'ssr-history-tab-everyday');
    elements.historyList.replaceChildren();
    document.querySelectorAll('[data-ssr-history-tab]').forEach((button) => {
        const active = button.dataset.ssrHistoryTab === bucket;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
    });
    if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'ssr-history-empty';
        empty.textContent = bucket === 'today' ? '오늘 읽은 한글 카드가 아직 없어요.' : '오래 보관할 일상 한글 카드가 아직 없어요.';
        elements.historyList.append(empty);
        return;
    }
    rows.forEach((record) => {
        const item = document.createElement('article');
        item.className = 'ssr-history-item';
        const main = document.createElement('div');
        main.className = 'ssr-history-main';
        const text = document.createElement('p');
        text.className = 'ssr-history-text';
        text.textContent = record.text;
        const sub = document.createElement('div');
        sub.className = 'ssr-history-sub';
        sub.textContent = bucket === 'today' ? `${formatRecordTime(record.createdAt)} 읽음` : '일상 보관';
        const tokens = document.createElement('div');
        tokens.className = 'ssr-history-tokens';
        renderTokensInto(tokens, record.text);
        main.append(text, sub, tokens);

        const actions = document.createElement('div');
        actions.className = 'ssr-history-actions';
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'ssr-history-play';
        play.textContent = '재생';
        play.addEventListener('click', () => playRecord(record));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'ssr-history-remove';
        remove.textContent = '제거';
        remove.addEventListener('click', () => removeRecord(bucket, record.id));
        const pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'ssr-history-pin';
        pin.textContent = bucket === 'today' ? '일상' : '일상✓';
        pin.disabled = bucket !== 'today';
        if (bucket === 'today') pin.addEventListener('click', () => promoteTodayRecord(record.id));
        actions.append(play, remove, pin);
        item.append(main, actions);
        elements.historyList.append(item);
    });
}

function render() {
    loadRecords();
    const elements = ui();
    if (!elements.input || !elements.board) return;
    const normalized = normalizeSyllableReaderText(elements.input.value, MAX_GRAPHEMES);
    if (elements.input.value !== normalized) elements.input.value = normalized;
    const tokens = buildSyllableReaderTokens(normalized, MAX_GRAPHEMES);
    const sequence = tokens.filter(({ kind }) => kind === 'speakable');
    elements.board.replaceChildren();
    if (elements.count) elements.count.textContent = `${tokens.length}/${MAX_GRAPHEMES}`;
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
    if (elements.play) elements.play.disabled = sequence.length === 0;
}

async function speakOne(token, card) {
    stopReader();
    const runId = state.runId;
    setPlayingUi(true, true);
    card?.classList.add('active');
    card?.setAttribute('aria-current', 'true');
    setStatus(`'${token.text}' 발음을 듣는 중…`, 'playing');
    let completed = false;
    try {
        completed = Boolean(await window.speakTextKo?.(token.text, null, { playbackRate: PLAYBACK_RATE }));
    } catch (error) {
        console.error('음절 발음 재생 실패:', error);
    } finally {
        if (runId === state.runId) {
            card?.classList.remove('active');
            card?.removeAttribute('aria-current');
            clearActiveCards();
            setPlayingUi(false);
            setStatus(completed ? '다른 글자를 누르거나 전체 읽기를 시작해 보세요.' : '소리를 재생하지 못했습니다. 소리 설정을 확인한 뒤 다시 눌러 주세요.', completed ? '' : 'error');
        }
    }
}

async function speakHistoryToken(text, button) {
    await speakOne({ text }, button);
}

async function startReader(textOverride = '', { remember = true } = {}) {
    const elements = ui();
    const sourceText = textOverride || elements.input?.value || '';
    const sequence = getSyllableReaderSequence(sourceText, MAX_GRAPHEMES);
    if (!sequence.length) {
        setStatus('읽을 글자를 입력해 주세요.', 'error');
        elements.input?.focus();
        return;
    }
    if (textOverride && elements.input) {
        elements.input.value = normalizeSyllableReaderText(textOverride, MAX_GRAPHEMES);
        render();
    }
    if (remember) addTodayRecord(sourceText);

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

function playRecord(record) {
    if (!record?.text) return;
    startReader(record.text, { remember: true });
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
    elements.range.addEventListener('input', () => {
        const gap = getSyllableReaderGap(elements.range.value);
        elements.gapDisplay.textContent = gap.label;
        if (state.isPlaying) stopReader('간격이 바뀌어 읽기를 멈췄습니다.');
    });
    elements.play.addEventListener('click', () => {
        if (state.isPlaying) stopReader('읽기를 중지했습니다.');
        else startReader();
    });
    elements.settings?.addEventListener('click', () => toggleSettings());
    elements.settingsClose?.addEventListener('click', () => toggleSettings(false));
    document.addEventListener('click', (event) => {
        const target = event.target;
        if (!elements.settingsPopup || elements.settingsPopup.classList.contains('hidden')) return;
        if (elements.settingsPopup.contains(target) || elements.settings?.contains(target)) return;
        toggleSettings(false);
    });
    document.querySelectorAll('[data-ssr-history-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            state.historyTab = button.dataset.ssrHistoryTab === 'everyday' ? 'everyday' : 'today';
            renderHistory();
        });
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden && state.isPlaying) stopReader();
    });
    loadRecords();
    render();
    renderHistory();
}

window.openSyllableSlowReader = function openSyllableSlowReader() {
    bind();
    loadRecords();
    render();
    renderHistory();
    setStatus('');
    window.requestAnimationFrame(() => ui().input?.focus());
};

window.stopSyllableSlowReader = stopReader;
window.closeSyllableSlowReader = function closeSyllableSlowReader() {
    stopReader();
};

bind();
