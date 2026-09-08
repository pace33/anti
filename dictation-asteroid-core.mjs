export const ASTEROID_GAME_DURATION_SECONDS = 60;

export function isAsteroidGameExpired(deadline, now) {
    return Number.isFinite(deadline) && Number.isFinite(now) && now >= deadline;
}

// Every prompt is exactly one precomposed Hangul syllable.  Keep the familiar
// basic consonant row near the front, then provide enough variety for a full run.
export const ASTEROID_WORDS = Object.freeze([
    '가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하', '와',
    '거', '너', '더', '러', '머', '버', '서', '어', '저', '처', '커', '터', '퍼', '허',
    '고', '노', '도', '로', '모', '보', '소', '오', '조', '초', '코', '토', '포', '호',
    '구', '누', '두', '루', '무', '부', '수', '우', '주', '추', '쿠', '투', '푸', '후',
    '기', '니', '디', '리', '미', '비', '시', '이', '지', '치', '키', '티', '피', '히',
    '개', '내', '대', '래', '매', '배', '새', '애', '재', '채', '해',
    '야', '여', '요', '유', '위', '워', '왜', '외', '의'
]);

export function createAsteroidGameState() {
    return { score: 0, streak: 0, maxStreak: 0, missed: 0, wave: 1, status: 'ready' };
}

export function getAsteroidFallDuration(score = 0) {
    const safeScore = Math.max(0, Number(score) || 0);
    return Math.max(4200, 10500 - safeScore * 180);
}

export function resolveAsteroidHit(state) {
    const streak = Math.max(0, Number(state?.streak) || 0) + 1;
    return {
        score: Math.max(0, Number(state?.score) || 0) + 1,
        streak,
        maxStreak: Math.max(Math.max(0, Number(state?.maxStreak) || 0), streak),
        missed: Math.max(0, Number(state?.missed) || 0),
        wave: Math.max(1, Number(state?.wave) || 1) + 1,
        status: 'playing'
    };
}

// A miss is a streak break, not a game-ending condition. Only the total game
// clock may move the controller to `gameover`.
export function resolveAsteroidDeadline(state) {
    return {
        score: Math.max(0, Number(state?.score) || 0),
        streak: 0,
        maxStreak: Math.max(0, Number(state?.maxStreak) || Number(state?.streak) || 0),
        missed: Math.max(0, Number(state?.missed) || 0) + 1,
        wave: Math.max(1, Number(state?.wave) || 1) + 1,
        status: 'playing'
    };
}

function normalizePool(words) {
    const unique = [...new Set(Array.from(words || []).filter((word) => /^[가-힣]$/.test(word)))];
    if (unique.length < 2) throw new TypeError('Asteroid queue requires at least two unique Hangul syllables.');
    return unique;
}

/**
 * Creates a three-word look-ahead queue. Supplying a deterministic random
 * function makes every queue operation deterministic in tests/replays.
 */
export function createAsteroidWordQueue(words = ASTEROID_WORDS, random = Math.random) {
    const pool = normalizePool(words);
    const rng = typeof random === 'function' ? random : Math.random;
    const queue = [];

    function pick(except) {
        const candidates = pool.filter((word) => word !== except);
        const sample = Number(rng());
        const normalized = Number.isFinite(sample) ? Math.min(0.999999999999, Math.max(0, sample)) : 0;
        return candidates[Math.floor(normalized * candidates.length)];
    }

    while (queue.length < 3) queue.push(pick(queue.at(-1)));

    return Object.freeze({
        get current() { return queue[0]; },
        get next() { return queue[1]; },
        get afterNext() { return queue[2]; },
        snapshot() { return Object.freeze({ current: queue[0], next: queue[1], afterNext: queue[2] }); },
        advance() {
            queue.shift();
            queue.push(pick(queue.at(-1)));
            return this.snapshot();
        }
    });
}

// Short alias for consumers that prefer the generic name.
export const createAsteroidQueue = createAsteroidWordQueue;
