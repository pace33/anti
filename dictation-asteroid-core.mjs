export const ASTEROID_WORDS = Object.freeze([
    '나무', '모자', '우유', '바다', '구름', '노을',
    '하늘', '우주', '별빛', '달빛', '토끼', '사과',
    '학교', '친구', '마음', '고래', '기차', '로켓'
]);

export function createAsteroidGameState() {
    return { score: 0, streak: 0, lives: 3, wave: 1, status: 'ready' };
}

export function getAsteroidFallDuration(score = 0) {
    const safeScore = Math.max(0, Number(score) || 0);
    return Math.max(6500, 15000 - safeScore * 650);
}

export function resolveAsteroidHit(state) {
    const score = Math.max(0, Number(state?.score) || 0) + 1;
    const streak = Math.max(0, Number(state?.streak) || 0) + 1;
    return {
        score,
        streak,
        lives: Math.max(0, Number(state?.lives) || 0),
        wave: Math.max(1, Number(state?.wave) || 1) + 1,
        status: 'playing'
    };
}

export function resolveAsteroidDeadline(state) {
    const lives = Math.max(0, (Number(state?.lives) || 0) - 1);
    const wave = Math.max(1, Number(state?.wave) || 1);
    return {
        score: Math.max(0, Number(state?.score) || 0),
        streak: 0,
        lives,
        wave: lives > 0 ? wave + 1 : wave,
        status: lives > 0 ? 'playing' : 'gameover'
    };
}
