import { sortPublishedWordCards } from './word-card-utils.mjs?v=20260907-word-card-schema-hotfix-v5';


export function wordCardPublication(card) {
    return card?.publishedGenerationToken || card?.illustration?.path || '';
}
export function buildWordCardRepository(data = {}, currentUserId = '') {
    const requests = Array.isArray(data.requests) ? data.requests : [];
    const requested = new Map(requests.map(entry => [entry.cardId, entry]));
    const seen = data.seen || {};
    const cards = sortPublishedWordCards(data.cards || []).map(card => ({
        ...card, requestedByMe: requested.has(card.id) || Boolean(currentUserId && card.createdBy === currentUserId),
        isNew: seen[card.id] !== wordCardPublication(card)
    }));
    const mine = cards.filter(card => card.requestedByMe);
    mine.sort((a, b) => Number(b.isNew) - Number(a.isNew)
        || String(requested.get(b.id)?.requestedAt || '').localeCompare(String(requested.get(a.id)?.requestedAt || '')));
    const published = new Set(cards.map(card => card.id));
    return { mine, others: cards.filter(card => !card.requestedByMe),
        pending: requests.filter(request => !published.has(request.cardId)) };
}
export function wordCardRequestStatus(status) {
    if (status === 'generating') return '만들고 있어요';
    if (status === 'failed' || status === 'needs-review') return '제작 확인 중';
    return '신청 완료 · 제작 대기';
}
