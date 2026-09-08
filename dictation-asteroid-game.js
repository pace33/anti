import {
    ASTEROID_WORDS,
    createAsteroidGameState,
    getAsteroidFallDuration,
    resolveAsteroidDeadline
} from './dictation-asteroid-core.mjs';

const elements = {};
let state = createAsteroidGameState();
let currentWord = ASTEROID_WORDS[0];
let previousWord = '';
let animationFrame = 0;
let resolutionTimer = 0;
let pendingResolution = null;
let fallStartedAt = 0;
let fallDuration = getAsteroidFallDuration(0);
let pausedRemaining = 0;
let resolving = false;
let initialized = false;

function cacheElements() {
    elements.section = document.getElementById('dictation-asteroid-game-section');
    elements.field = document.getElementById('dictation-asteroid-field');
    elements.asteroid = document.getElementById('dictation-asteroid');
    elements.word = document.getElementById('dictation-asteroid-word');
    elements.line = document.getElementById('dictation-defense-line');
    elements.missile = document.getElementById('dictation-asteroid-missile');
    elements.canvas = document.getElementById('dictation-asteroid-writing-canvas');
    elements.score = document.getElementById('dictation-asteroid-score');
    elements.streak = document.getElementById('dictation-asteroid-streak');
    elements.lives = document.getElementById('dictation-asteroid-lives');
    elements.instruction = document.getElementById('dictation-asteroid-instruction');
    elements.timeFill = document.getElementById('dictation-time-fill');
    elements.overlay = document.getElementById('dictation-asteroid-overlay');
    elements.overlayTitle = document.getElementById('dictation-asteroid-overlay-title');
    elements.overlayCopy = document.getElementById('dictation-asteroid-overlay-copy');
    elements.start = document.getElementById('dictation-asteroid-start');
    elements.sound = document.getElementById('dictation-asteroid-sound');
    elements.clear = document.getElementById('dictation-asteroid-clear');
}

function updateHud() {
    if (!elements.score) return;
    elements.score.textContent = String(state.score);
    elements.streak.textContent = String(state.streak);
    elements.lives.textContent = `${'♥'.repeat(state.lives)}${'♡'.repeat(Math.max(0, 3 - state.lives))}`;
}

function announce(message, tone = '') {
    if (!elements.instruction) return;
    elements.instruction.textContent = message;
    elements.instruction.dataset.tone = tone;
}

function speakCurrentWord() {
    if (!currentWord) return;
    if (typeof window.speakChar === 'function') {
        window.speakChar(currentWord);
        return;
    }
    window.speechSynthesis?.cancel?.();
    const utterance = new SpeechSynthesisUtterance(currentWord);
    utterance.lang = 'ko-KR';
    window.speechSynthesis?.speak?.(utterance);
}

function chooseWord() {
    const candidates = ASTEROID_WORDS.filter((word) => word !== previousWord);
    const next = candidates[Math.floor(Math.random() * candidates.length)] || ASTEROID_WORDS[0];
    previousWord = next;
    return next;
}

function resetWritingCanvas() {
    if (!elements.canvas || !currentWord) return;
    window.setupAsteroidTraceCanvas?.(elements.canvas, currentWord);
}

function asteroidTravelBounds() {
    const fieldHeight = elements.field?.clientHeight || 520;
    const lineTop = elements.line?.offsetTop || Math.round(fieldHeight * 0.73);
    const asteroidHeight = elements.asteroid?.offsetHeight || 108;
    return { start: 12, end: Math.max(80, lineTop - asteroidHeight + 12) };
}

function setAsteroidProgress(progress) {
    const safe = Math.max(0, Math.min(1, progress));
    const { start, end } = asteroidTravelBounds();
    elements.asteroid.style.top = `${start + (end - start) * safe}px`;
    elements.asteroid.style.setProperty('--asteroid-spin', `${safe * 24}deg`);
    elements.timeFill.style.width = `${Math.max(0, (1 - safe) * 100)}%`;
    elements.timeFill.dataset.danger = safe >= 0.72 ? 'true' : 'false';
}

function cancelGameLoops() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (resolutionTimer) window.clearTimeout(resolutionTimer);
    animationFrame = 0;
    resolutionTimer = 0;
    pendingResolution = null;
}

function scheduleResolution(callback, delay) {
    if (resolutionTimer) window.clearTimeout(resolutionTimer);
    const remaining = Math.max(0, Number(delay) || 0);
    pendingResolution = { callback, remaining, dueAt: performance.now() + remaining };
    resolutionTimer = window.setTimeout(() => {
        const pending = pendingResolution;
        resolutionTimer = 0;
        pendingResolution = null;
        pending?.callback?.();
    }, remaining);
}

function spawnAsteroid() {
    if (state.status !== 'playing') return;
    resolving = false;
    currentWord = chooseWord();
    fallDuration = getAsteroidFallDuration(state.score);
    fallStartedAt = performance.now();
    pausedRemaining = fallDuration;
    elements.word.textContent = currentWord;
    elements.asteroid.className = 'dictation-asteroid-rock';
    elements.asteroid.removeAttribute('hidden');
    elements.missile.className = 'dictation-asteroid-missile';
    elements.missile.style.removeProperty('--missile-x');
    elements.missile.style.removeProperty('--missile-y');
    resetWritingCanvas();
    setAsteroidProgress(0);
    announce(`“${currentWord}”을 획순대로 따라 쓰세요!`);
    window.setTimeout(() => {
        if (state.status === 'playing' && !resolving && currentWord === elements.word.textContent) speakCurrentWord();
    }, 250);
    animationFrame = requestAnimationFrame(updateFall);
}

function updateFall(now) {
    if (state.status !== 'playing' || resolving) return;
    const elapsed = safeElapsed(now - fallStartedAt);
    const progress = elapsed / fallDuration;
    pausedRemaining = Math.max(0, fallDuration - elapsed);
    setAsteroidProgress(progress);
    if (progress >= 1) {
        missAsteroid();
        return;
    }
    animationFrame = requestAnimationFrame(updateFall);
}

function safeElapsed(value) {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function missAsteroid() {
    if (resolving || state.status !== 'playing') return;
    resolving = true;
    cancelGameLoops();
    elements.asteroid.classList.add('is-impacting');
    state = resolveAsteroidDeadline(state);
    updateHud();
    if (state.status === 'gameover') {
        announce('소행성이 방어선을 통과했어요.', 'danger');
        scheduleResolution(showGameOver, 650);
        return;
    }
    announce(`방어선 통과! 생명이 ${state.lives}개 남았어요.`, 'danger');
    scheduleResolution(spawnAsteroid, 900);
}

function launchMissile() {
    if (resolving || state.status !== 'playing') return;
    resolving = true;
    cancelGameLoops();
    const fieldRect = elements.field.getBoundingClientRect();
    const asteroidRect = elements.asteroid.getBoundingClientRect();
    const targetX = asteroidRect.left + asteroidRect.width / 2 - (fieldRect.left + fieldRect.width / 2);
    const targetY = asteroidRect.top + asteroidRect.height / 2 - (fieldRect.bottom - 62);
    elements.missile.classList.add('is-ready');
    elements.missile.style.setProperty('--missile-x', `${targetX}px`);
    elements.missile.style.setProperty('--missile-y', `${targetY}px`);
    announce('정확해요! 미사일 발사!', 'success');
    requestAnimationFrame(() => elements.missile.classList.add('is-firing'));
    scheduleResolution(destroyAsteroid, 430);
}

function destroyAsteroid() {
    if (state.status !== 'playing') return;
    elements.asteroid.classList.add('is-destroyed');
    elements.missile.classList.remove('is-ready', 'is-firing');
    state = {
        ...state,
        score: state.score + 1,
        streak: state.streak + 1,
        wave: state.wave + 1
    };
    updateHud();
    announce(`격추 성공! ${state.streak}번 연속으로 막았어요.`, 'success');
    scheduleResolution(spawnAsteroid, 720);
}

function showGameOver() {
    state.status = 'gameover';
    elements.overlayTitle.textContent = `격추 ${state.score}개!`;
    elements.overlayCopy.textContent = state.score
        ? `에이두와 함께 우주를 지켰어요. 최고 연속 격추는 계속 도전해서 높여 보세요!`
        : '괜찮아요. 낱말의 주황색 시작점부터 천천히 다시 따라 써 보세요.';
    elements.start.textContent = '다시 도전';
    elements.overlay.classList.remove('hidden');
    elements.start.focus();
}

function startGame() {
    cancelGameLoops();
    state = { ...createAsteroidGameState(), status: 'playing' };
    updateHud();
    elements.overlay.classList.add('hidden');
    elements.start.textContent = '게임 시작';
    spawnAsteroid();
}

function pauseGame() {
    if (state.status !== 'playing') return;
    state.status = 'paused';
    if (resolving && pendingResolution) {
        pendingResolution.remaining = Math.max(0, pendingResolution.dueAt - performance.now());
        if (resolutionTimer) window.clearTimeout(resolutionTimer);
        resolutionTimer = 0;
    } else {
        pausedRemaining = Math.max(0, fallDuration - (performance.now() - fallStartedAt));
        if (animationFrame) cancelAnimationFrame(animationFrame);
        animationFrame = 0;
    }
    announce('게임이 잠시 멈췄어요.', 'paused');
}

function resumeGame() {
    if (state.status !== 'paused') return;
    state.status = 'playing';
    if (resolving && pendingResolution) {
        scheduleResolution(pendingResolution.callback, pendingResolution.remaining);
        announce('격추 연출을 이어서 진행해요.', 'paused');
        return;
    }
    fallStartedAt = performance.now() - Math.max(0, fallDuration - pausedRemaining);
    announce(`“${currentWord}”을 이어서 따라 쓰세요!`);
    animationFrame = requestAnimationFrame(updateFall);
}

function initializeGame() {
    if (initialized) return;
    cacheElements();
    if (!elements.section || !elements.canvas) return;
    elements.start.addEventListener('click', startGame);
    elements.sound.addEventListener('click', speakCurrentWord);
    elements.clear.addEventListener('click', () => {
        if (state.status !== 'playing' || resolving) return;
        resetWritingCanvas();
        announce(`“${currentWord}”을 처음부터 다시 따라 쓰세요.`);
    });
    elements.canvas.addEventListener('tracewritingcomplete', launchMissile);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseGame();
        else resumeGame();
    });
    window.addEventListener('resize', () => {
        if (!elements.section.classList.contains('hidden') && state.status !== 'ready') {
            setAsteroidProgress(1 - pausedRemaining / Math.max(1, fallDuration));
            window.refreshAsteroidTraceCanvas?.(elements.canvas);
        }
    });
    initialized = true;
}

window.openAsteroidDictationGame = function openAsteroidDictationGame() {
    initializeGame();
    window.closeAiedueKoreanModal?.();
    window.showAiedueTopLevelSection?.('dictation-asteroid-game-section');
    state = createAsteroidGameState();
    resolving = false;
    updateHud();
    elements.overlayTitle.textContent = '낱말 소행성을 막아 주세요!';
    elements.overlayCopy.textContent = '소행성이 방어선을 지나기 전에 낱말을 획순대로 따라 쓰면 미사일이 자동으로 발사돼요.';
    elements.start.textContent = '게임 시작';
    elements.overlay.classList.remove('hidden');
    resetWritingCanvas();
    setAsteroidProgress(0);
    elements.start.focus();
};

window.stopAsteroidDictationGame = function stopAsteroidDictationGame() {
    cancelGameLoops();
    state = createAsteroidGameState();
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
