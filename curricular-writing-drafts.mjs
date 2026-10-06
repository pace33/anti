// Account-owned checkpoints: never contribute to mastery, completed rounds or rewards.
const text = (value, limit = 600) => typeof value === 'string' ? value.slice(0, limit) : '';
const idText = value => text(value, 120).replace(/[^a-zA-Z0-9:_.-]/g, '');
const clamp = (value, max = 1) => Math.max(0, Math.min(max, Number(value) || 0));
const strings = value => Array.isArray(value) ? value.slice(0, 10).map(v => text(v)).filter(Boolean) : [];
function result(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return { word: text(raw.word), sentence: text(raw.sentence), answer: text(raw.answer), written: text(raw.written),
        analysis: text(raw.analysis, 1500), difficulty: Math.max(1, clamp(raw.difficulty, 3)), source: text(raw.source, 100),
        correct: raw.correct === true, retryCorrect: raw.retryCorrect === true, retryAttempted: raw.retryAttempted === true,
        retryPending: raw.retryPending === true, score: clamp(raw.score) };
}
function strokes(raw) {
    if (!Array.isArray(raw)) return [];
    // Bound profile size; retain the shape of long strokes by uniform sampling.
    const paths = raw.slice(0, 200).filter(Array.isArray);
    const perStroke = Math.min(40, Math.max(2, Math.floor(1200 / Math.max(1, paths.length))));
    return paths.map(stroke => {
        const valid = stroke.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        const count = Math.min(perStroke, valid.length);
        return Array.from({ length: count }, (_, i) => {
            const p = valid[count === 1 ? 0 : Math.round(i * (valid.length - 1) / (count - 1))];
            return { x: Number(clamp(p.x).toFixed(4)), y: Number(clamp(p.y).toFixed(4)) };
        });
    }).filter(stroke => stroke.length > 1);
}
function item(raw = {}) {
    return { word: text(raw.word), sentence: text(raw.sentence), answer: text(raw.answer), audioText: text(raw.audioText),
        canvasGuide: text(raw.canvasGuide), hintText: text(raw.hintText), displayText: text(raw.displayText), source: text(raw.source, 100),
        difficulty: Math.max(1, clamp(raw.difficulty, 3)), originalDifficulty: Math.max(1, clamp(raw.originalDifficulty, 3)),
        coverage: clamp(raw.coverage), traceComplete: raw.traceComplete === true, aiGraded: raw.aiGraded === true,
        retryMode: raw.retryMode === true, retryUsed: raw.retryUsed === true, aiResult: result(raw.aiResult), firstAiResult: result(raw.firstAiResult),
        strokes: strokes(raw.strokes) };
}
function session(raw = {}, includeNext = true) {
    if (raw.mode !== 'curricular' || !['trace', 'mission'].includes(raw.kind) || raw.tutorial || raw.autoSaved || !Array.isArray(raw.items)) return null;
    const items = raw.items.slice(0, 10).filter(v => v && typeof v === 'object').map(item).filter(v => v.word || v.answer || v.sentence);
    if (!items.length) return null;
    return { kind: raw.kind, mode: 'curricular', marker: text(raw.marker, 100), practiceReview: raw.practiceReview === true,
        difficulty: Math.max(1, clamp(raw.difficulty, 3)), fromPhoto: raw.fromPhoto === true, curricularRoundId: idText(raw.curricularRoundId),
        photoCapturedAt: text(raw.photoCapturedAt, 40), photoWords: strings(raw.photoWords), reviewWords: strings(raw.reviewWords),
        items, currentIndex: Math.floor(clamp(raw.currentIndex, items.length - 1)), graded: null, saved: false, autoSaved: false,
        startedAt: text(raw.startedAt, 40), draftId: idText(raw.draftId),
        nextMissionSession: includeNext && raw.nextMissionSession ? session(raw.nextMissionSession, false) : null };
}
export function buildCurricularDraft(raw, updatedAt = new Date().toISOString()) {
    const savedSession = session(raw);
    const id = idText(raw?.draftId || raw?.curricularRoundId || raw?.startedAt);
    if (!savedSession || !id) return null;
    savedSession.draftId = id;
    return { id, status: 'in-progress', updatedAt: text(updatedAt, 40), session: savedSession,
        words: [...new Set(savedSession.items.map(v => v.word).filter(Boolean))],
        checkedCount: savedSession.items.filter(v => savedSession.kind === 'trace' ? v.traceComplete : v.aiGraded).length };
}
export function normalizeCurricularDrafts(raw = []) {
    if (!Array.isArray(raw)) return [];
    const byId = new Map();
    for (const entry of raw.slice(0, 30)) {
        const draft = buildCurricularDraft({ ...entry?.session, draftId: entry?.id }, entry?.updatedAt);
        if (!draft) continue;
        const previous = byId.get(draft.id);
        if (!previous || draft.updatedAt > previous.updatedAt) byId.set(draft.id, draft);
    }
    return [...byId.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
}
export function upsertCurricularDraft(raw, draft) {
    return normalizeCurricularDrafts([draft, ...normalizeCurricularDrafts(raw)]);
}
export function resumeCurricularDraft(draft) {
    return normalizeCurricularDrafts([draft])[0]?.session || null;
}
