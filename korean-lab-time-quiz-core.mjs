export const KOREAN_LAB_TIME_REWARDS = Object.freeze({ easy: 1, middle: 3, hard: 5, 'very-hard': 10 });
export const KOREAN_LAB_TIME_DIFFICULTIES = Object.freeze(Object.keys(KOREAN_LAB_TIME_REWARDS));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let fallbackAttemptSequence = 0;

export function createKoreanLabAttemptId(cryptoProvider = globalThis.crypto, random = Math.random, now = Date.now) {
    const nativeId = typeof cryptoProvider?.randomUUID === 'function' ? cryptoProvider.randomUUID() : '';
    if (UUID_PATTERN.test(nativeId)) return nativeId.toLowerCase();

    const bytes = new Uint8Array(16);
    if (typeof cryptoProvider?.getRandomValues === 'function') {
        cryptoProvider.getRandomValues(bytes);
    } else {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(random() * 256) & 255;
        const timestamp = Math.max(0, Math.floor(Number(now()) || 0));
        fallbackAttemptSequence = (fallbackAttemptSequence + 1) >>> 0;
        for (let index = 0; index < 6; index += 1) bytes[5 - index] ^= Math.floor(timestamp / (256 ** index)) & 255;
        for (let index = 0; index < 4; index += 1) bytes[15 - index] ^= (fallbackAttemptSequence >>> (index * 8)) & 255;
    }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function timeKey(time) {
    return `${Number(time?.hour)}:${String(Number(time?.minute)).padStart(2, '0')}`;
}

function normalizeHour(hour) {
    return ((Math.floor(Number(hour)) - 1 + 12) % 12) + 1;
}

function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [result[index], result[swap]] = [result[swap], result[index]];
    }
    return result;
}

export function generateKoreanLabClockTime(difficulty, random = Math.random, recent = []) {
    const minutes = difficulty === 'easy' ? [0]
        : difficulty === 'middle' ? [0, 15, 30, 45]
            : Array.from({ length: 60 }, (_, index) => index);
    const recentKeys = new Set(recent.map(timeKey));
    let candidate = { hour: 12, minute: minutes[0] };
    for (let attempt = 0; attempt < 80; attempt += 1) {
        candidate = {
            hour: Math.floor(random() * 12) + 1,
            minute: minutes[Math.floor(random() * minutes.length)]
        };
        if (!recentKeys.has(timeKey(candidate))) return candidate;
    }
    return candidate;
}

export function buildKoreanLabClockOptions(correctTime, difficulty, random = Math.random) {
    const correct = { hour: normalizeHour(correctTime.hour), minute: Math.max(0, Math.min(59, Math.floor(correctTime.minute))) };
    const options = [{ ...correct }];
    const add = (hour, minute) => {
        const option = { hour: normalizeHour(hour), minute: Math.max(0, Math.min(59, Math.floor(minute))) };
        if (!options.some((item) => timeKey(item) === timeKey(option))) options.push(option);
    };
    const step = difficulty === 'middle' ? 15 : difficulty === 'easy' ? 0 : 5;
    if (step) {
        add(correct.hour, (correct.minute + step) % 60);
        add(correct.hour, (correct.minute - step + 60) % 60);
    }
    add(correct.hour + 1, correct.minute);
    add(correct.hour - 1, correct.minute);
    let offset = 2;
    while (options.length < 4) add(correct.hour + offset++, correct.minute);
    return shuffle(options.slice(0, 4), random);
}

export function validateKoreanLabClockInput(hour, minute) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return '시간과 분을 숫자로 입력해 주세요.';
    if (hour < 1 || hour > 12) return '시는 1부터 12까지 입력해 주세요.';
    if (minute < 0 || minute > 59) return '분은 0부터 59까지 입력해 주세요.';
    return '';
}

export function formatKoreanLabTime(time) {
    return `${time.hour}시 ${time.minute}분`;
}
