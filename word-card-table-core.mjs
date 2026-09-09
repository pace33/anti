import { sortPublishedWordCards, normalizeWordCardWord } from './word-card-utils.mjs';

export function playableWordCards(cards = []) {
    const words = new Set(), ids = new Set();
    return sortPublishedWordCards(cards).filter(card => {
        if (typeof card.word !== 'string' || typeof card.explanation !== 'string' || !card.explanation.trim()) return false;
        const word = normalizeWordCardWord(card.word).toLocaleLowerCase('ko');
        if (!word || words.has(word) || ids.has(card.id)) return false;
        words.add(word); ids.add(card.id); return true;
    });
}

export function shuffleCards(cards, random = Math.random) {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function createWordCardRound(cards, previousId = '', random = Math.random) {
    const pool = playableWordCards(cards);
    if (pool.length < 4) {
        const error = new Error(`그림과 설명이 있는 공개 단어 카드가 서로 다른 단어로 4장 이상 필요해요. 지금은 ${pool.length}장이에요.`);
        error.code = 'cards/too-few'; throw error;
    }
    const candidates = shuffleCards(pool.filter(card => card.id !== previousId), random);
    const answer = candidates[0];
    const others = shuffleCards(pool.filter(card => card.id !== answer.id), random).slice(0, 3);
    return { answer, choices: shuffleCards([answer, ...others], random), availableCount: pool.length };
}

export const createWordCardState = () => ({ status: 'ready', score: 0, attempts: 0 });
export function resolveWordCardAnswer(state, round, selectedId) {
    if (state.status !== 'choosing' || !round?.choices.some(card => card.id === selectedId)) return state;
    const correct = selectedId === round.answer.id;
    return { ...state, status: 'feedback', attempts: state.attempts + 1, score: state.score + (correct ? 1 : 0), correct };
}

function assertActive(signal) {
    if (signal?.aborted) throw new DOMException('카드 요청이 취소됐어요.', 'AbortError');
}

// The only source is the app's existing read-only repository/storage facade.
// No authored word list, generation calls, or card-media fallback is provided.
export async function loadWordCardRound(source, { previousId = '', signal, random = Math.random, prepareImage = async () => {} } = {}) {
    if (!source?.loadCards || !source?.getImageUrl) {
        const error = new Error('에이두에 로그인한 뒤 연구실에서 단어 카드 게임을 열어 주세요.');
        error.code = 'cards/login-required'; throw error;
    }
    assertActive(signal);
    const cards = await source.loadCards();
    assertActive(signal);
    const round = createWordCardRound(cards, previousId, random);
    const imageUrl = await source.getImageUrl(round.answer);
    assertActive(signal);
    if (typeof imageUrl !== 'string' || !/^(blob:|https?:\/\/|\/)/.test(imageUrl)) throw new Error('저장소 카드 그림을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    await prepareImage(imageUrl, signal);
    assertActive(signal);
    // The friend owns the single illustrated prompt card. The player's hand is
    // deliberately reduced to identifiers and words so media or explanations
    // cannot accidentally leak into the four answer controls.
    const choices = round.choices.map(({ id, word }) => ({ id, word }));
    return { ...round, choices, answer: { ...round.answer, imageUrl } };
}
