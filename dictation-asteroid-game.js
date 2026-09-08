import {
    ASTEROID_GAME_DURATION_SECONDS,
    createAsteroidGameState,
    createAsteroidWordQueue,
    getAsteroidFallDuration,
    isAsteroidGameExpired,
    resolveAsteroidDeadline,
    resolveAsteroidHit
} from './dictation-asteroid-core.mjs?v=20260908-dictation-asteroid-v3';

const elements = {};
let state = createAsteroidGameState();
let wordQueue = createAsteroidWordQueue();
let currentWord = wordQueue.current;
let animationFrame = 0;
let resolutionTimer = 0;
let pendingResolution = null;
let fallStartedAt = 0;
let fallDuration = getAsteroidFallDuration(0);
let fallRemaining = fallDuration;
let gameDeadline = 0;
let gameRemaining = ASTEROID_GAME_DURATION_SECONDS * 1000;
let resolving = false;
let initialized = false;
let runId = '';
let completedRun = null;
let bgmEnabled = true;
let audioContext = null;
let bgmTimer = 0;
let bgmStep = 0;
let lifecycleGeneration = 0;
let leaderboardRequest = 0;
const auxiliaryTimers = new Set();
const auxiliaryFrames = new Set();

function trackedTimeout(callback, delay) {
    const id = window.setTimeout(() => { auxiliaryTimers.delete(id); callback(); }, delay);
    auxiliaryTimers.add(id);
    return id;
}

function trackedFrame(callback) {
    const id = requestAnimationFrame((now) => { auxiliaryFrames.delete(id); callback(now); });
    auxiliaryFrames.add(id);
    return id;
}

function cancelAuxiliaryWork() {
    auxiliaryTimers.forEach((id) => window.clearTimeout(id));
    auxiliaryFrames.forEach((id) => cancelAnimationFrame(id));
    auxiliaryTimers.clear();
    auxiliaryFrames.clear();
}

function cacheElements() {
    const ids = {
        section: 'dictation-asteroid-game-section', field: 'dictation-asteroid-field', asteroid: 'dictation-asteroid',
        word: 'dictation-asteroid-word', line: 'dictation-defense-line', missile: 'dictation-asteroid-missile',
        canvas: 'dictation-asteroid-writing-canvas', score: 'dictation-asteroid-score', streak: 'dictation-asteroid-streak',
        gameTime: 'dictation-game-time', instruction: 'dictation-asteroid-instruction', timeFill: 'dictation-time-fill',
        overlay: 'dictation-asteroid-overlay', overlayTitle: 'dictation-asteroid-overlay-title',
        overlayCopy: 'dictation-asteroid-overlay-copy', start: 'dictation-asteroid-start', sound: 'dictation-asteroid-sound',
        clear: 'dictation-asteroid-clear', nextWord: 'dictation-next-word', afterNextWord: 'dictation-after-next-word',
        scorePop: 'dictation-score-pop', explosion: 'dictation-explosion', bgmToggle: 'dictation-bgm-toggle',
        leaderboard: 'dictation-leaderboard-list', resultReward: 'dictation-result-reward', saveStatus: 'dictation-save-status',
        saveRetry: 'dictation-save-retry'
    };
    Object.entries(ids).forEach(([key, id]) => { elements[key] = document.getElementById(id); });
}

function safeElapsed(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }
function newRunId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
        const value = Math.floor(Math.random() * 16);
        return (token === 'x' ? value : (value & 3) | 8).toString(16);
    });
}

function updateHud() {
    if (!elements.score) return;
    elements.score.textContent = String(state.score);
    elements.streak.textContent = String(state.streak);
    elements.gameTime.textContent = String(Math.max(0, Math.ceil(gameRemaining / 1000)));
    elements.gameTime.parentElement?.toggleAttribute('data-danger', gameRemaining <= 10000);
}

function updateQueueDisplay() {
    const snapshot = wordQueue.snapshot();
    currentWord = snapshot.current;
    elements.word.textContent = snapshot.current;
    elements.nextWord.textContent = snapshot.next;
    elements.afterNextWord.textContent = snapshot.afterNext;
}

function announce(message, tone = '') {
    if (!elements.instruction) return;
    elements.instruction.textContent = message;
    elements.instruction.dataset.tone = tone;
}

function speakCurrentWord() {
    if (!currentWord) return;
    if (typeof window.speakChar === 'function') return window.speakChar(currentWord);
    window.speechSynthesis?.cancel?.();
    const utterance = new SpeechSynthesisUtterance(currentWord);
    utterance.lang = 'ko-KR';
    window.speechSynthesis?.speak?.(utterance);
}

function resetWritingCanvas() {
    if (elements.canvas && currentWord) window.setupAsteroidTraceCanvas?.(elements.canvas, currentWord);
}

function asteroidTravelBounds() {
    const fieldHeight = elements.field?.clientHeight || 520;
    const lineTop = elements.line?.offsetTop || Math.round(fieldHeight * 0.72);
    const asteroidHeight = elements.asteroid?.offsetHeight || 112;
    return { start: 12, end: Math.max(80, lineTop - asteroidHeight + 12) };
}

function setAsteroidProgress(progress) {
    const safe = Math.max(0, Math.min(1, progress));
    const { start, end } = asteroidTravelBounds();
    elements.asteroid.style.top = `${start + (end - start) * safe}px`;
    elements.asteroid.style.setProperty('--asteroid-spin', `${safe * 32}deg`);
}

function updateTotalClock(now) {
    gameRemaining = Math.max(0, gameDeadline - now);
    const ratio = gameRemaining / (ASTEROID_GAME_DURATION_SECONDS * 1000);
    elements.timeFill.style.width = `${Math.max(0, ratio * 100)}%`;
    elements.timeFill.dataset.danger = ratio <= 1 / 6 ? 'true' : 'false';
    updateHud();
    return gameRemaining > 0;
}

function updateGameFrame(now) {
    if (state.status !== 'playing') return;
    if (!updateTotalClock(now)) return finishGame();
    if (!resolving) {
        const elapsed = safeElapsed(now - fallStartedAt);
        fallRemaining = Math.max(0, fallDuration - elapsed);
        setAsteroidProgress(elapsed / fallDuration);
        if (!fallRemaining) {
            missAsteroid();
        }
    }
    animationFrame = requestAnimationFrame(updateGameFrame);
}

function cancelResolution() {
    if (resolutionTimer) window.clearTimeout(resolutionTimer);
    resolutionTimer = 0;
    pendingResolution = null;
}

function cancelGameLoops() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    cancelResolution();
    cancelAuxiliaryWork();
    lifecycleGeneration += 1;
}

function scheduleResolution(callback, delay) {
    cancelResolution();
    const remaining = Math.max(0, Number(delay) || 0);
    pendingResolution = { callback, remaining, dueAt: performance.now() + remaining };
    resolutionTimer = window.setTimeout(() => {
        const pending = pendingResolution;
        resolutionTimer = 0;
        pendingResolution = null;
        pending?.callback?.();
    }, remaining);
}

function ensureAudio() {
    if (!audioContext || audioContext.state === 'closed') {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        audioContext = new AudioCtor();
    }
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
}

function playTone(frequency, duration = .12, type = 'sine', volume = .035, offset = 0, effectSound = false) {
    const ctx = ensureAudio();
    if (!ctx || (!bgmEnabled && !effectSound)) return;
    const start = ctx.currentTime + offset;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .03);
}

function playBgmBeat() {
    if (!bgmEnabled || state.status !== 'playing') return;
    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46, 880, 783.99];
    const bass = [130.81, 130.81, 146.83, 146.83, 174.61, 174.61, 196, 196];
    playTone(melody[bgmStep % melody.length], .17, 'triangle', .022);
    if (bgmStep % 2 === 0) playTone(bass[bgmStep % bass.length], .26, 'square', .012);
    bgmStep += 1;
}

function startBgm() {
    if (!bgmEnabled) return;
    ensureAudio();
    if (bgmTimer) window.clearInterval(bgmTimer);
    bgmStep = 0;
    playBgmBeat();
    bgmTimer = window.setInterval(playBgmBeat, 240);
}

function stopBgm({ close = false } = {}) {
    if (bgmTimer) window.clearInterval(bgmTimer);
    bgmTimer = 0;
    if (close && audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    if (close) audioContext = null;
}

function playMissileSound() {
    [330, 520, 780].forEach((frequency, index) => playTone(frequency, .16, 'sawtooth', .045, index * .07, true));
}
function playExplosionSound() {
    [180, 120, 75].forEach((frequency, index) => playTone(frequency, .22, 'square', .04, index * .04, true));
}
function playMissSound() { playTone(110, .3, 'sawtooth', .03, 0, true); }

function positionEffectAtAsteroid(effect) {
    const fieldRect = elements.field.getBoundingClientRect();
    const rockRect = elements.asteroid.getBoundingClientRect();
    effect.style.left = `${rockRect.left + rockRect.width / 2 - fieldRect.left}px`;
    effect.style.top = `${rockRect.top + rockRect.height / 2 - fieldRect.top}px`;
}

function restartEffect(element, className, duration = 760) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
    trackedTimeout(() => element.classList.remove(className), Math.max(0, Number(duration) || 0));
}

function advanceAndSpawn() {
    if (state.status !== 'playing') return;
    wordQueue.advance();
    spawnAsteroid();
}

function spawnAsteroid() {
    if (state.status !== 'playing') return;
    resolving = false;
    updateQueueDisplay();
    fallDuration = getAsteroidFallDuration(state.score);
    fallStartedAt = performance.now();
    fallRemaining = fallDuration;
    elements.asteroid.className = 'dictation-asteroid-rock';
    elements.asteroid.removeAttribute('hidden');
    elements.missile.className = 'dictation-asteroid-missile';
    elements.missile.style.removeProperty('--missile-x');
    elements.missile.style.removeProperty('--missile-y');
    resetWritingCanvas();
    setAsteroidProgress(0);
    announce(`“${currentWord}”를 오른쪽에 획순대로 써 주세요.`);
    const generation = lifecycleGeneration;
    const spawnedWord = currentWord;
    trackedTimeout(() => {
        if (generation === lifecycleGeneration && state.status === 'playing' && !resolving && currentWord === spawnedWord) speakCurrentWord();
    }, 180);
}

function missAsteroid() {
    if (resolving || state.status !== 'playing') return;
    resolving = true;
    elements.asteroid.classList.add('is-impacting');
    state = resolveAsteroidDeadline(state);
    updateHud();
    playMissSound();
    announce(`“${currentWord}”를 놓쳤어요. 다음 글자를 막아 봐요!`, 'danger');
    scheduleResolution(advanceAndSpawn, 560);
}

function launchMissile() {
    if (resolving || state.status !== 'playing') return;
    const now = performance.now();
    if (isAsteroidGameExpired(gameDeadline, now)) {
        gameRemaining = 0;
        finishGame();
        return;
    }
    resolving = true;
    fallRemaining = Math.max(0, fallDuration - (now - fallStartedAt));
    const fieldRect = elements.field.getBoundingClientRect();
    const asteroidRect = elements.asteroid.getBoundingClientRect();
    const missileRect = elements.missile.getBoundingClientRect();
    const targetX = asteroidRect.left + asteroidRect.width / 2 - (fieldRect.left + fieldRect.width / 2);
    const targetY = asteroidRect.top + asteroidRect.height / 2 - (fieldRect.bottom - missileRect.height - 32);
    elements.missile.classList.add('is-ready');
    elements.missile.style.setProperty('--missile-x', `${targetX}px`);
    elements.missile.style.setProperty('--missile-y', `${targetY}px`);
    announce('정확해요! 에이두 미사일 발사!', 'success');
    playMissileSound();
    // The writing succeeded before the deadline, so secure the point now; only the visual impact is delayed.
    state = resolveAsteroidHit(state);
    updateHud();
    const generation = lifecycleGeneration;
    trackedFrame(() => {
        if (generation === lifecycleGeneration && state.status === 'playing') elements.missile.classList.add('is-firing');
    });
    scheduleResolution(destroyAsteroid, 720);
}

function destroyAsteroid() {
    if (state.status !== 'playing') return;
    positionEffectAtAsteroid(elements.explosion);
    positionEffectAtAsteroid(elements.scorePop);
    restartEffect(elements.explosion, 'is-active', 1550);
    restartEffect(elements.scorePop, 'is-visible', 1450);
    restartEffect(elements.field, 'is-shaking');
    elements.asteroid.classList.add('is-destroyed');
    elements.missile.classList.remove('is-ready', 'is-firing');
    playExplosionSound();
    announce(`격추 성공! ${state.score}개를 막았어요.`, 'success');
    scheduleResolution(advanceAndSpawn, 900);
}

function renderLeaderboard(rows = []) {
    elements.leaderboard.replaceChildren();
    if (!rows.length) {
        const li = document.createElement('li');
        const span = document.createElement('span');
        const strong = document.createElement('strong');
        span.textContent = '첫 기록에 도전해요!';
        strong.textContent = '—';
        li.append(span, strong);
        elements.leaderboard.append(li);
        return;
    }
    rows.slice(0, 10).forEach((row) => {
        const li = document.createElement('li');
        const span = document.createElement('span');
        const strong = document.createElement('strong');
        span.textContent = `${row.icon || '🚀'} ${row.name || '이름 없음'}`;
        strong.textContent = `${Math.max(0, Number(row.bestDestroyed) || 0)}개`;
        li.append(span, strong);
        elements.leaderboard.append(li);
    });
}

async function refreshLeaderboard(generation = lifecycleGeneration) {
    const request = ++leaderboardRequest;
    try {
        const rows = await window.aiedueAsteroidPersistence?.loadLeaderboard?.();
        if (generation === lifecycleGeneration && request === leaderboardRequest && Array.isArray(rows)) renderLeaderboard(rows);
    } catch (error) {
        console.warn('소행성 명예의 전당 불러오기 실패', error);
        if (generation === lifecycleGeneration && request === leaderboardRequest) renderLeaderboard([]);
    }
}

async function saveRunResult(completedRunId, score, generation) {
    const persistence = window.aiedueAsteroidPersistence;
    if (!persistence?.getCurrentPlayer?.()) {
        elements.saveRetry.classList.add('hidden');
        if (generation === lifecycleGeneration) elements.saveStatus.textContent = '로그인하면 경험치와 명예의 전당 기록이 저장돼요.';
        await refreshLeaderboard(generation);
        return;
    }
    if (generation === lifecycleGeneration) elements.saveStatus.textContent = '경험치와 기록을 저장하고 있어요…';
    try {
        const result = await persistence.commitRun(completedRunId, score);
        if (generation !== lifecycleGeneration) return;
        if (!result?.saved) {
            elements.saveRetry.classList.remove('hidden');
            elements.saveStatus.textContent = '로그인 정보를 확인한 뒤 다시 도전해 주세요.';
        } else {
            elements.saveRetry.classList.add('hidden');
            elements.resultReward.textContent = `+${result.xpAwarded} XP · 개인 최고 ${result.leaderboard.bestDestroyed}개`;
            elements.saveStatus.textContent = result.duplicate ? '이미 저장된 경기 기록을 확인했어요.' : '경험치와 명예의 전당 기록을 저장했어요!';
        }
    } catch (error) {
        console.warn('소행성 게임 결과 저장 실패', error);
        if (generation === lifecycleGeneration) {
            elements.saveRetry.classList.remove('hidden');
            elements.saveStatus.textContent = '기록 저장에 실패했어요. 같은 기록으로 다시 저장해 주세요.';
        }
    }
    await refreshLeaderboard(generation);
}

function finishGame() {
    if (!['playing', 'paused'].includes(state.status)) return;
    cancelGameLoops();
    state.status = 'gameover';
    gameRemaining = 0;
    updateHud();
    stopBgm({ close: true });
    window.cancelSpeech?.();
    window.speechSynthesis?.cancel?.();
    elements.overlayTitle.textContent = `60초 동안 ${state.score}개 격추!`;
    elements.overlayCopy.textContent = state.score
        ? `에이두와 함께 ${state.score}개의 낱말 소행성을 막았어요. 놓친 글자 ${state.missed}개 · 최고 연속 ${state.maxStreak}회`
        : '괜찮아요. 오른쪽 쓰기판의 주황색 시작점부터 천천히 다시 따라 써 보세요.';
    elements.resultReward.textContent = `획득 예정 경험치 +${state.score} XP`;
    elements.saveStatus.textContent = '';
    elements.saveRetry.classList.add('hidden');
    elements.start.textContent = '다시 도전';
    elements.overlay.classList.remove('hidden');
    elements.start.focus();
    completedRun = Object.freeze({ runId, score: state.score });
    saveRunResult(completedRun.runId, completedRun.score, lifecycleGeneration);
}

function startGame() {
    cancelGameLoops();
    state = { ...createAsteroidGameState(), status: 'playing' };
    wordQueue = createAsteroidWordQueue();
    runId = newRunId();
    completedRun = null;
    gameRemaining = ASTEROID_GAME_DURATION_SECONDS * 1000;
    gameDeadline = performance.now() + gameRemaining;
    resolving = false;
    elements.resultReward.textContent = '';
    elements.saveStatus.textContent = '';
    elements.overlay.classList.add('hidden');
    elements.start.textContent = '게임 시작';
    updateHud();
    startBgm();
    spawnAsteroid();
    animationFrame = requestAnimationFrame(updateGameFrame);
}

function pauseGame() {
    if (state.status !== 'playing') return;
    const now = performance.now();
    state.status = 'paused';
    gameRemaining = Math.max(0, gameDeadline - now);
    if (resolving && pendingResolution) {
        pendingResolution.remaining = Math.max(0, pendingResolution.dueAt - now);
        if (resolutionTimer) window.clearTimeout(resolutionTimer);
        resolutionTimer = 0;
    } else {
        fallRemaining = Math.max(0, fallDuration - (now - fallStartedAt));
    }
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    stopBgm();
    audioContext?.suspend?.().catch(() => {});
    window.cancelSpeech?.();
    window.speechSynthesis?.cancel?.();
    announce('게임이 잠시 멈췄어요.', 'paused');
}

function resumeGame() {
    if (state.status !== 'paused') return;
    state.status = 'playing';
    const now = performance.now();
    gameDeadline = now + gameRemaining;
    if (resolving && pendingResolution) {
        scheduleResolution(pendingResolution.callback, pendingResolution.remaining);
    } else {
        fallStartedAt = now - Math.max(0, fallDuration - fallRemaining);
    }
    startBgm();
    announce(`“${currentWord}”를 이어서 써 주세요.`, 'paused');
    animationFrame = requestAnimationFrame(updateGameFrame);
}

function toggleBgm() {
    bgmEnabled = !bgmEnabled;
    elements.bgmToggle.setAttribute('aria-pressed', String(bgmEnabled));
    elements.bgmToggle.classList.toggle('is-muted', !bgmEnabled);
    elements.bgmToggle.lastChild.textContent = bgmEnabled ? ' BGM' : ' 꺼짐';
    if (!bgmEnabled) stopBgm();
    else if (state.status === 'playing') startBgm();
}

function initializeGame() {
    if (initialized) return;
    cacheElements();
    if (!elements.section || !elements.canvas) return;
    elements.start.addEventListener('click', startGame);
    elements.sound.addEventListener('click', speakCurrentWord);
    elements.bgmToggle.addEventListener('click', toggleBgm);
    elements.saveRetry.addEventListener('click', () => {
        if (!completedRun || state.status !== 'gameover') return;
        elements.saveRetry.classList.add('hidden');
        saveRunResult(completedRun.runId, completedRun.score, lifecycleGeneration);
    });
    elements.clear.addEventListener('click', () => {
        if (state.status !== 'playing' || resolving) return;
        resetWritingCanvas();
        announce(`“${currentWord}”를 처음부터 다시 써 주세요.`);
    });
    elements.canvas.addEventListener('tracewritingcomplete', launchMissile);
    document.addEventListener('visibilitychange', () => document.hidden ? pauseGame() : resumeGame());
    window.addEventListener('resize', () => {
        if (!elements.section.classList.contains('hidden')) {
            if (state.status !== 'ready') setAsteroidProgress(1 - fallRemaining / Math.max(1, fallDuration));
            window.refreshAsteroidTraceCanvas?.(elements.canvas);
        }
    });
    initialized = true;
}

window.openAsteroidDictationGame = function openAsteroidDictationGame() {
    initializeGame();
    cancelGameLoops();
    stopBgm({ close: true });
    window.cancelSpeech?.();
    window.speechSynthesis?.cancel?.();
    window.closeAiedueKoreanModal?.();
    window.showAiedueTopLevelSection?.('dictation-asteroid-game-section');
    state = createAsteroidGameState();
    wordQueue = createAsteroidWordQueue();
    currentWord = wordQueue.current;
    gameRemaining = ASTEROID_GAME_DURATION_SECONDS * 1000;
    resolving = false;
    updateQueueDisplay();
    updateHud();
    elements.timeFill.style.width = '100%';
    elements.timeFill.dataset.danger = 'false';
    elements.overlayTitle.textContent = '60초 우주 방어 작전!';
    elements.overlayCopy.textContent = '떨어지는 한 글자를 오른쪽에 획순대로 쓰세요. 다음과 다다음 글자도 미리 볼 수 있어요.';
    elements.resultReward.textContent = '';
    elements.saveStatus.textContent = '';
    elements.saveRetry.classList.add('hidden');
    elements.start.textContent = '게임 시작';
    elements.overlay.classList.remove('hidden');
    resetWritingCanvas();
    setAsteroidProgress(0);
    refreshLeaderboard();
    elements.start.focus();
};

window.stopAsteroidDictationGame = function stopAsteroidDictationGame() {
    cancelGameLoops();
    stopBgm({ close: true });
    state = createAsteroidGameState();
    gameRemaining = ASTEROID_GAME_DURATION_SECONDS * 1000;
    resolving = false;
    window.cancelSpeech?.();
    window.speechSynthesis?.cancel?.();
};

window.closeAsteroidDictationGame = function closeAsteroidDictationGame() {
    window.stopAsteroidDictationGame();
    window.showAiedueTopLevelSection?.('dashboard-section');
    document.getElementById('dashboard-section')?.focus?.();
};

initializeGame();
