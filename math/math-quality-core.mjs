export const TIME_QUIZ_REWARDS = Object.freeze({
    easy: 1,
    middle: 3,
    hard: 5,
    'very-hard': 10
});

export const LEVEL_EXPERIENCE = 100;
export const LEVEL_UP_POINTS = 1000;

function asFiniteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function asNonNegativeInteger(value, fallback = 0) {
    return Math.max(0, Math.floor(asFiniteNumber(value, fallback)));
}

export function timeKey(time) {
    return `${Number(time?.hour)}:${String(Number(time?.minute)).padStart(2, '0')}`;
}

function normalizeHour(hour) {
    return ((Math.floor(hour) - 1 + 12) % 12) + 1;
}

function pushClockOption(options, hour, minute, misconceptionTag) {
    const candidate = { hour: normalizeHour(hour), minute: Math.floor(minute), misconceptionTag };
    if (candidate.minute < 0 || candidate.minute > 59) return;
    if (!options.some((option) => timeKey(option) === timeKey(candidate))) options.push(candidate);
}

function shuffled(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

export function generateClockTime(difficulty, random = Math.random, recentTimes = []) {
    const recent = new Set(recentTimes.map(timeKey));
    const minutes = difficulty === 'easy'
        ? [0]
        : difficulty === 'middle'
            ? [0, 15, 30, 45]
            : Array.from({ length: 60 }, (_, index) => index);
    let candidate = { hour: 12, minute: minutes[0] };
    for (let attempt = 0; attempt < 80; attempt += 1) {
        candidate = {
            hour: Math.floor(random() * 12) + 1,
            minute: minutes[Math.floor(random() * minutes.length)]
        };
        if (!recent.has(timeKey(candidate))) return candidate;
    }
    return candidate;
}

export function buildClockOptions(correctAnswer, difficulty, random = Math.random) {
    const correct = {
        hour: normalizeHour(correctAnswer.hour),
        minute: Math.max(0, Math.min(59, Math.floor(correctAnswer.minute))),
        misconceptionTag: ''
    };
    const options = [correct];
    const minuteStep = difficulty === 'easy' ? 0 : difficulty === 'middle' ? 15 : 5;

    if (minuteStep) {
        pushClockOption(options, correct.hour, (correct.minute + minuteStep) % 60, 'minute-hand-nearby');
        pushClockOption(options, correct.hour, (correct.minute - minuteStep + 60) % 60, 'minute-hand-nearby');
    }
    pushClockOption(options, correct.hour + 1, correct.minute, 'hour-hand-one-ahead');
    pushClockOption(options, correct.hour - 1, correct.minute, 'hour-hand-one-behind');

    if (correct.minute % 5 === 0) {
        const swappedHour = correct.minute === 0 ? 12 : correct.minute / 5;
        const swappedMinute = (correct.hour % 12) * 5;
        pushClockOption(options, swappedHour, swappedMinute, 'hour-minute-hand-swapped');
    }

    let offset = 2;
    while (options.length < 4) {
        pushClockOption(options, correct.hour + offset, correct.minute, 'hour-hand-position');
        offset += 1;
    }
    return shuffled(options.slice(0, 4), random);
}

export function validateClockInput(hour, minute) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '시간과 분을 숫자로 입력해주세요.';
    if (hour < 1 || hour > 12) return '시는 1부터 12까지 입력해주세요.';
    if (minute < 0 || minute > 59) return '분은 0부터 59까지 입력해주세요.';
    return '';
}

export function clockMisconceptionTag(selected, correct) {
    if (!selected || !correct) return 'clock-reading';
    if (selected.misconceptionTag) return selected.misconceptionTag;
    if (selected.hour === correct.hour) return 'minute-hand-position';
    if (selected.minute === correct.minute) return 'hour-hand-position';
    return 'hour-minute-hand';
}

export function experienceForAttempt(payload = {}, attempt = payload) {
    if (attempt?.isCorrect !== true) return 0;
    if (attempt?.activityType === 'time-quiz') {
        return TIME_QUIZ_REWARDS[attempt.difficulty] || 0;
    }
    const requested = payload.experienceReward;
    if (requested == null) return 2;
    return Math.min(10, asNonNegativeInteger(requested, 0));
}

export function calculateWalletReward(profile = {}, experienceReward = 0) {
    const rawExperience = Math.max(0, asFiniteNumber(profile.aeduExperience ?? profile.experience ?? profile.exp, 0));
    const storedExperience = rawExperience % LEVEL_EXPERIENCE;
    const derivedLevel = Math.floor(rawExperience / LEVEL_EXPERIENCE) + 1;
    const level = Math.max(1, asNonNegativeInteger(profile.aeduLevel ?? profile.level ?? profile.schoolLevel, 1), derivedLevel);
    const balance = Math.max(0, asFiniteNumber(profile.balance ?? profile.coins ?? profile.aeduTokens, 0));
    const warningTokens = asNonNegativeInteger(profile.warningTokens, 0);
    const grantedExperience = Math.max(0, asFiniteNumber(experienceReward, 0));
    const totalExperience = storedExperience + grantedExperience;
    const levelUps = Math.floor(totalExperience / LEVEL_EXPERIENCE);
    const levelUpPoints = levelUps * LEVEL_UP_POINTS;
    const warningReduced = Math.min(warningTokens, levelUps);
    const nextBalance = balance + levelUpPoints;
    return {
        updates: {
            aeduExperience: totalExperience % LEVEL_EXPERIENCE,
            aeduLevel: level + levelUps,
            balance: nextBalance,
            coins: nextBalance,
            aeduTokens: nextBalance,
            warningTokens: warningTokens - warningReduced
        },
        levelUps,
        levelUpPoints,
        warningReduced
    };
}

export function classifyLineTrend(values = []) {
    if (values.length < 2) return 'steady';
    const changes = values.slice(1).map((value, index) => Math.sign(value - values[index]));
    if (changes.every((change) => change === 0)) return 'steady';
    if (changes.every((change) => change >= 0) && changes.some((change) => change > 0)) return 'up';
    if (changes.every((change) => change <= 0) && changes.some((change) => change < 0)) return 'down';
    return 'mixed';
}
