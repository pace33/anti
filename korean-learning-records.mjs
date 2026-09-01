export const MASTERY_CORRECT_THRESHOLD = 3;

function stableHash(value) {
    let hash = 2166136261;
    for (const char of String(value || '')) {
        hash ^= char.codePointAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function buildKoreanQuestionId({ lessonId, activityType, answer, word, prompt } = {}) {
    const identity = [lessonId || 'unknown', activityType || 'activity', answer || word || prompt || 'target'].join('|');
    return `k2_${stableHash(identity)}`;
}

export function getKoreanMasteryKey(attempt = {}) {
    return [attempt.stage || 2, attempt.lessonId || 'unknown', attempt.activityType || 'activity', attempt.questionId || buildKoreanQuestionId(attempt)].join('|');
}

export function applyKoreanMasteryAttempt(current, attempt = {}) {
    const now = attempt.createdAt || new Date().toISOString();
    const isReview = attempt.attemptSource === 'review';
    if (attempt.isCorrect && !isReview) return current || null;

    const next = {
        ...(current || {}),
        masteryKey: getKoreanMasteryKey(attempt),
        studentId: attempt.studentId,
        stage: attempt.stage || 2,
        lessonId: attempt.lessonId,
        lessonTitle: attempt.lessonTitle,
        unitId: attempt.unitId ?? null,
        activityType: attempt.activityType,
        questionId: attempt.questionId,
        questionType: attempt.questionType,
        inputType: attempt.inputType,
        questionText: attempt.questionText || attempt.prompt || attempt.word || attempt.answer,
        correctAnswer: attempt.correctAnswer || attempt.answer || attempt.word,
        errorType: attempt.errorType || current?.errorType || null,
        wrongCount: Number(current?.wrongCount || 0),
        reviewCorrectCount: Number(current?.reviewCorrectCount || 0),
        masteryStatus: current?.masteryStatus || 'weak',
        firstWrongAt: current?.firstWrongAt || null,
        lastWrongAt: current?.lastWrongAt || null,
        lastReviewAt: current?.lastReviewAt || null,
        createdAt: current?.createdAt || now,
        updatedAt: now
    };

    if (!attempt.isCorrect) {
        next.wrongCount += 1;
        next.reviewCorrectCount = 0;
        next.masteryStatus = 'weak';
        next.firstWrongAt ||= now;
        next.lastWrongAt = now;
        next.lastStudentAnswer = attempt.studentAnswer ?? attempt.userAnswer ?? '';
        next.lastRecognizedAnswer = attempt.recognizedAnswer ?? null;
        next.lastSimilarityScore = attempt.similarityScore ?? null;
        next.passThreshold = attempt.passThreshold ?? null;
        if (isReview) next.lastReviewAt = now;
        return next;
    }

    next.reviewCorrectCount += 1;
    next.lastReviewAt = now;
    next.masteryStatus = next.reviewCorrectCount >= MASTERY_CORRECT_THRESHOLD ? 'mastered' : 'learning';
    return next;
}

export function getTodayReviewQuestions(masteryByKey = {}, maxQuestions = 10) {
    return Object.values(masteryByKey || {})
        .filter((item) => item && ['weak', 'learning'].includes(item.masteryStatus))
        .sort((a, b) => Number(b.wrongCount || 0) - Number(a.wrongCount || 0)
            || String(b.lastWrongAt || '').localeCompare(String(a.lastWrongAt || '')))
        .slice(0, maxQuestions);
}

export function summarizeKoreanStudentRecords(attempts = [], masteryByKey = {}, now = new Date()) {
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const todayAttempts = attempts.filter((attempt) => String(attempt.localDate || attempt.createdAt || '').slice(0, 10) === localDate);
    const masteryItems = Object.values(masteryByKey || {}).filter(Boolean);
    return {
        todayAttempts: todayAttempts.length,
        todayCorrect: todayAttempts.filter((attempt) => attempt.isCorrect).length,
        reviewCount: masteryItems.filter((item) => ['weak', 'learning'].includes(item.masteryStatus)).length,
        learningCount: masteryItems.filter((item) => item.masteryStatus === 'learning').length,
        masteredCount: masteryItems.filter((item) => item.masteryStatus === 'mastered').length
    };
}

export function buildKoreanAreaProgress(attempts = []) {
    const areas = new Map();
    attempts.forEach((attempt) => {
        const unitId = Number(attempt.unitId);
        if (!Number.isInteger(unitId) || unitId < 1) return;
        if (!areas.has(unitId)) areas.set(unitId, new Map());
        const questions = areas.get(unitId);
        const questionId = attempt.questionId || buildKoreanQuestionId(attempt);
        const current = questions.get(questionId) || false;
        questions.set(questionId, current || Boolean(attempt.isCorrect));
    });
    return [...areas.entries()].sort((a, b) => a[0] - b[0]).map(([unitId, questions]) => {
        const total = questions.size;
        const reached = [...questions.values()].filter(Boolean).length;
        return { unitId, total, reached, rate: total ? Math.round((reached / total) * 100) : 0 };
    });
}

export function buildKoreanWeeklyProgress(attempts = [], now = new Date()) {
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date(now);
        date.setHours(12, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const dayAttempts = attempts.filter((attempt) => String(attempt.localDate || attempt.createdAt || '').slice(0, 10) === localDate);
        const correctQuestions = new Set(dayAttempts.filter((attempt) => attempt.isCorrect).map((attempt) => attempt.questionId || buildKoreanQuestionId(attempt)));
        days.push({ localDate, label: `${date.getMonth() + 1}/${date.getDate()}`, attempts: dayAttempts.length, correct: correctQuestions.size });
    }
    return days;
}

export function summarizeKoreanMasteryDistribution(masteryByKey = {}) {
    const result = { weak: 0, learning: 0, mastered: 0, total: 0 };
    Object.values(masteryByKey || {}).forEach((item) => {
        if (!item || !Object.hasOwn(result, item.masteryStatus)) return;
        result[item.masteryStatus] += 1;
        result.total += 1;
    });
    return result;
}

export function buildKoreanGrowthRecommendations(attempts = [], masteryByKey = {}, limit = 3) {
    const units = new Map();
    attempts.forEach((attempt) => {
        const unitId = Number(attempt.unitId);
        if (!Number.isInteger(unitId) || unitId < 1 || typeof attempt.isCorrect !== 'boolean') return;
        if (!units.has(unitId)) {
            units.set(unitId, { unitId, attempts: 0, correctAttempts: 0, wrongAttempts: 0, wrongQuestions: new Set() });
        }
        const unit = units.get(unitId);
        unit.attempts += 1;
        if (attempt.isCorrect) {
            unit.correctAttempts += 1;
            return;
        }
        unit.wrongAttempts += 1;
        unit.wrongQuestions.add(attempt.questionId || buildKoreanQuestionId(attempt));
    });
    const masteryItems = Object.values(masteryByKey || {}).filter(Boolean);
    const activeUnits = new Set(masteryItems
        .filter((item) => ['weak', 'learning'].includes(item.masteryStatus))
        .map((item) => Number(item.unitId))
        .filter((unitId) => Number.isInteger(unitId) && unitId > 0));
    return [...units.values()]
        .filter((unit) => unit.wrongAttempts > 0 && (!masteryItems.length || activeUnits.has(unit.unitId)))
        .map((unit) => ({
            unitId: unit.unitId,
            attempts: unit.attempts,
            wrongAttempts: unit.wrongAttempts,
            wrongQuestions: unit.wrongQuestions.size,
            accuracy: Math.round((unit.correctAttempts / unit.attempts) * 100),
            priority: unit.wrongAttempts >= 3 || (unit.attempts >= 2 && unit.correctAttempts / unit.attempts < 0.5) ? 'high' : 'practice'
        }))
        .sort((a, b) => b.wrongAttempts - a.wrongAttempts || a.accuracy - b.accuracy || a.unitId - b.unitId)
        .slice(0, Math.max(0, limit));
}
