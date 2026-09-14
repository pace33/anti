const DEFAULT_MAX_GRAPHEMES = 80;

export const SYLLABLE_READER_GAPS = Object.freeze({
    1: Object.freeze({ milliseconds: 200, label: '짧게 (0.2초)' }),
    2: Object.freeze({ milliseconds: 400, label: '보통 (0.4초)' }),
    3: Object.freeze({ milliseconds: 700, label: '느리게 (0.7초)' }),
    4: Object.freeze({ milliseconds: 1000, label: '매우 느리게 (1.0초)' })
});

export function segmentSyllableReaderText(value = '') {
    const normalized = String(value ?? '').normalize('NFC');
    if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
        return Array.from(segmenter.segment(normalized), ({ segment }) => segment);
    }
    return Array.from(normalized);
}

export function normalizeSyllableReaderText(value = '', maxGraphemes = DEFAULT_MAX_GRAPHEMES) {
    const safeLimit = Math.max(1, Math.floor(Number(maxGraphemes) || DEFAULT_MAX_GRAPHEMES));
    return segmentSyllableReaderText(value).slice(0, safeLimit).join('');
}

export function isSyllableReaderSpeakable(grapheme = '') {
    return /[\p{L}\p{N}]/u.test(String(grapheme));
}

export function buildSyllableReaderTokens(value = '', maxGraphemes = DEFAULT_MAX_GRAPHEMES) {
    const text = normalizeSyllableReaderText(value, maxGraphemes);
    let speakIndex = 0;
    return segmentSyllableReaderText(text).map((grapheme, visualIndex) => {
        const whitespace = /^\s+$/u.test(grapheme);
        const speakable = !whitespace && isSyllableReaderSpeakable(grapheme);
        const token = {
            text: grapheme,
            visualIndex,
            kind: whitespace ? 'space' : (speakable ? 'speakable' : 'punctuation'),
            speakIndex: speakable ? speakIndex : null
        };
        if (speakable) speakIndex += 1;
        return Object.freeze(token);
    });
}

export function getSyllableReaderSequence(value = '', maxGraphemes = DEFAULT_MAX_GRAPHEMES) {
    return buildSyllableReaderTokens(value, maxGraphemes).filter(({ kind }) => kind === 'speakable');
}

export function getSyllableReaderGap(value) {
    const key = String(value);
    return SYLLABLE_READER_GAPS[key] || SYLLABLE_READER_GAPS[2];
}
