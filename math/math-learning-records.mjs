export const MATH_PROGRESS_SCHEMA_VERSION = 1;
export const MATH_DOMAINS = Object.freeze(['number', 'relation', 'geometry', 'data']);

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RECENT_ATTEMPT_IDS = 50;

function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function asNonNegativeInteger(value, fallback = 0) {
    return Math.max(0, Math.floor(asNumber(value, fallback)));
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
    return [...new Set(asArray(values).map((value) => String(value || '').trim()).filter(Boolean))];
}

function timestampMillis(value) {
    if (value == null || value === '') return NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value?.toMillis === 'function') return Number(value.toMillis());
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const seconds = Number(value?.seconds ?? value?._seconds);
    const nanoseconds = Number(value?.nanoseconds ?? value?._nanoseconds ?? value?.nanos ?? 0);
    if (Number.isFinite(seconds) && Number.isFinite(nanoseconds)) return seconds * 1000 + nanoseconds / 1e6;
    return new Date(value).getTime();
}

function isoDateTime(value, fallback = new Date()) {
    const milliseconds = timestampMillis(value);
    return new Date(Number.isFinite(milliseconds) ? milliseconds : fallback).toISOString();
}

function addDays(isoValue, days) {
    return new Date(timestampMillis(isoValue) + Math.max(0, days) * DAY_MS).toISOString();
}

function unwrapDocument(document) {
    if (!document) return null;
    if (typeof document.data === 'function') return { id: document.id, ...document.data() };
    if (document.document && typeof document.document === 'object') {
        const nested = document.document;
        return { id: nested.id || document.id, ...(nested.data || nested.value || nested) };
    }
    return document;
}

function documentList(documents) {
    return asArray(documents).map(unwrapDocument).filter(Boolean);
}

function documentNodeId(document) {
    return String(document?.nodeId ?? document?.lessonId ?? document?.id ?? '').trim();
}

function documentDomain(document) {
    return String(document?.domain ?? document?.areaId ?? document?.area ?? 'unknown').trim() || 'unknown';
}

function isCompletedProgress(document) {
    return Boolean(document?.completed || document?.isCompleted || document?.status === 'completed'
        || ['basic', 'stable', 'extended'].includes(document?.masteryState));
}

function isReviewDue(document, now = new Date()) {
    if (!isCompletedProgress(document) || !document?.nextReviewAt) return false;
    const dueAt = timestampMillis(document.nextReviewAt);
    return Number.isFinite(dueAt) && dueAt <= timestampMillis(now);
}

function normalizeRepresentationScore(value = {}) {
    const attempts = asNonNegativeInteger(value.attempts ?? value.attemptCount);
    const correct = Math.min(attempts, asNonNegativeInteger(value.correct ?? value.correctCount));
    return {
        attempts,
        correct,
        wrong: Math.max(0, attempts - correct),
        accuracyRate: attempts ? Math.round((correct / attempts) * 100) : 0
    };
}

function normalizeCurriculumLessons(curriculumLessons = []) {
    const lessons = [];
    asArray(curriculumLessons).forEach((entry) => {
        if (entry?.bands && typeof entry.bands === 'object') {
            Object.entries(entry.bands).forEach(([gradeBand, bandLessons]) => {
                asArray(bandLessons).forEach((lesson) => lessons.push({
                    ...lesson,
                    nodeId: lesson.nodeId || lesson.id,
                    domain: lesson.domain || entry.domain || entry.id,
                    gradeBand: lesson.gradeBand || gradeBand
                }));
            });
            return;
        }
        if (entry) lessons.push({ ...entry, nodeId: entry.nodeId || entry.id });
    });
    return lessons.filter((lesson) => lesson.nodeId);
}

function localDateFor(value, utcOffsetMinutes) {
    const milliseconds = timestampMillis(value);
    if (!Number.isFinite(milliseconds)) return '';
    return new Date(milliseconds + utcOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);
}

function dateForAttempt(attempt, utcOffsetMinutes) {
    const explicit = String(attempt?.localDate || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(explicit)
        ? explicit
        : localDateFor(attempt?.createdAt ?? attempt?.updatedAt, utcOffsetMinutes);
}

function newestDocument(left, right) {
    const leftTime = timestampMillis(left?.updatedAt ?? left?.lastAttemptAt ?? left?.createdAt);
    const rightTime = timestampMillis(right?.updatedAt ?? right?.lastAttemptAt ?? right?.createdAt);
    return (!Number.isFinite(leftTime) || rightTime >= leftTime) ? right : left;
}

function uniqueProgressDocuments(progressDocs = []) {
    const byNode = new Map();
    documentList(progressDocs).forEach((document) => {
        const nodeId = documentNodeId(document);
        if (!nodeId) return;
        byNode.set(nodeId, byNode.has(nodeId) ? newestDocument(byNode.get(nodeId), document) : document);
    });
    return [...byNode.values()];
}

export function buildMathProgressId(uid, nodeId) {
    const userPart = String(uid ?? '').trim();
    const nodePart = String(nodeId ?? '').trim();
    if (!userPart || !nodePart) throw new TypeError('buildMathProgressId requires uid and nodeId.');
    return `${encodeURIComponent(userPart)}__${encodeURIComponent(nodePart)}`;
}

export function applyMathAttempt(existing, attempt = {}) {
    const current = unwrapDocument(existing) || {};
    const uid = String(attempt.uid ?? attempt.studentId ?? current.uid ?? current.studentId ?? '').trim();
    const nodeId = String(attempt.nodeId ?? attempt.lessonId ?? current.nodeId ?? current.lessonId ?? '').trim();
    if (!uid || !nodeId) throw new TypeError('applyMathAttempt requires an authenticated uid and nodeId.');

    const attemptId = String(attempt.attemptId || '').trim();
    const recentAttemptIds = uniqueStrings(current.recentAttemptIds);
    if (attemptId && recentAttemptIds.includes(attemptId)) return { ...current };

    const now = isoDateTime(attempt.createdAt ?? attempt.updatedAt);
    const isCorrect = attempt.isCorrect === true;
    const completedNow = Boolean(attempt.completed ?? attempt.isCompleted ?? attempt.nodeCompleted);
    const wasCompleted = isCompletedProgress(current);
    const completed = wasCompleted || completedNow;
    const attemptSource = attempt.attemptSource === 'review' ? 'review' : 'normal';
    const attemptCount = asNonNegativeInteger(current.attemptCount) + 1;
    const correctCount = asNonNegativeInteger(current.correctCount) + (isCorrect ? 1 : 0);
    const wrongCount = asNonNegativeInteger(current.wrongCount) + (isCorrect ? 0 : 1);
    const stepKey = String(attempt.stepKey ?? attempt.representation ?? attempt.stepName
        ?? (attempt.stepIndex != null ? `step-${attempt.stepIndex}` : '')).trim();
    const completedSteps = uniqueStrings([
        ...asArray(current.completedSteps),
        ...(isCorrect && stepKey ? [stepKey] : [])
    ]);

    const representation = String(attempt.representation || stepKey || attempt.activityType || 'general').trim();
    const representationScores = { ...(current.representationScores || {}) };
    const representationScore = normalizeRepresentationScore(representationScores[representation]);
    representationScore.attempts += 1;
    if (isCorrect) representationScore.correct += 1;
    representationScore.wrong = representationScore.attempts - representationScore.correct;
    representationScore.accuracyRate = Math.round((representationScore.correct / representationScore.attempts) * 100);
    representationScores[representation] = representationScore;

    const misconceptionCounts = { ...(current.misconceptionCounts || {}) };
    if (!isCorrect) {
        uniqueStrings([attempt.misconceptionTag, ...asArray(attempt.misconceptionTags)]).forEach((tag) => {
            misconceptionCounts[tag] = asNonNegativeInteger(misconceptionCounts[tag]) + 1;
        });
    }

    let reviewCorrectCount = asNonNegativeInteger(current.reviewCorrectCount);
    if (!isCorrect) reviewCorrectCount = 0;
    else if (attemptSource === 'review') reviewCorrectCount += 1;

    let masteryState = completed
        ? (wasCompleted && ['basic', 'stable', 'extended'].includes(current.masteryState) ? current.masteryState : 'basic')
        : 'learning';
    if (completed && !isCorrect) masteryState = 'basic';
    if (completed && reviewCorrectCount >= 2) masteryState = 'stable';
    if (completed && attempt.extended === true) masteryState = 'extended';

    let nextReviewAt = current.nextReviewAt || null;
    if (completedNow || !isCorrect) nextReviewAt = addDays(now, 1);
    if (completed && attemptSource === 'review' && isCorrect) {
        const intervals = [3, 7, 14, 30];
        nextReviewAt = addDays(now, intervals[Math.min(reviewCorrectCount - 1, intervals.length - 1)]);
    }

    return {
        ...current,
        schemaVersion: MATH_PROGRESS_SCHEMA_VERSION,
        uid,
        studentId: uid,
        nodeId,
        domain: attempt.domain ?? current.domain ?? null,
        gradeBand: attempt.gradeBand ?? current.gradeBand ?? null,
        nodeTitle: attempt.nodeTitle ?? attempt.lessonTitle ?? current.nodeTitle ?? null,
        status: completed ? 'completed' : 'learning',
        masteryState,
        completed,
        completedSteps,
        attemptCount,
        correctCount,
        wrongCount,
        accuracyRate: Math.round((correctCount / attemptCount) * 100),
        consecutiveCorrect: isCorrect ? asNonNegativeInteger(current.consecutiveCorrect) + 1 : 0,
        reviewCorrectCount,
        representationScores,
        misconceptionCounts,
        recentAttemptIds: attemptId
            ? [...recentAttemptIds, attemptId].slice(-MAX_RECENT_ATTEMPT_IDS)
            : recentAttemptIds,
        lastAttemptId: attemptId || current.lastAttemptId || null,
        lastActivityType: attempt.activityType ?? current.lastActivityType ?? null,
        lastQuestionId: attempt.questionId ?? current.lastQuestionId ?? null,
        lastStudentAnswer: attempt.studentAnswer ?? attempt.userAnswer ?? current.lastStudentAnswer ?? null,
        lastCorrectAnswer: attempt.correctAnswer ?? attempt.answer ?? current.lastCorrectAnswer ?? null,
        lastIsCorrect: isCorrect,
        lastAttemptSource: attemptSource,
        startedAt: current.startedAt || current.createdAt || now,
        createdAt: current.createdAt || now,
        lastAttemptAt: now,
        updatedAt: now,
        completedAt: current.completedAt || (completedNow ? now : null),
        nextReviewAt
    };
}

export function buildMathAreaProgress(progressDocs = [], curriculumLessons = []) {
    const progress = uniqueProgressDocuments(progressDocs);
    const lessons = normalizeCurriculumLessons(curriculumLessons);
    const domains = new Set(MATH_DOMAINS);
    progress.forEach((document) => domains.add(documentDomain(document)));
    lessons.forEach((lesson) => domains.add(documentDomain(lesson)));

    return [...domains].filter((domain) => domain !== 'unknown' || progress.some((item) => documentDomain(item) === 'unknown')).map((domain) => {
        const areaProgress = progress.filter((document) => documentDomain(document) === domain);
        const curriculumNodeIds = new Set(lessons.filter((lesson) => documentDomain(lesson) === domain).map(documentNodeId));
        const total = curriculumNodeIds.size || areaProgress.length;
        const completed = areaProgress.filter(isCompletedProgress).length;
        const reviewDue = areaProgress.filter((document) => isReviewDue(document)).length;
        return {
            domain,
            total,
            started: areaProgress.length,
            completed,
            learning: Math.max(0, areaProgress.length - completed),
            reviewDue,
            rate: total ? Math.round((completed / total) * 100) : 0
        };
    });
}

export function summarizeMathStudentRecords(progressDocs = [], attemptDocs = []) {
    const progress = uniqueProgressDocuments(progressDocs);
    const attempts = documentList(attemptDocs);
    const completedNodes = progress.filter(isCompletedProgress).length;
    const totalAttempts = attempts.length || progress.reduce((sum, item) => sum + asNonNegativeInteger(item.attemptCount), 0);
    const correctAttempts = attempts.length
        ? attempts.filter((attempt) => attempt.isCorrect === true).length
        : progress.reduce((sum, item) => sum + asNonNegativeInteger(item.correctCount), 0);
    const wrongAttempts = attempts.length
        ? attempts.filter((attempt) => attempt.isCorrect !== true).length
        : Math.max(0, totalAttempts - correctAttempts);
    const lastStudiedAt = [...progress, ...attempts]
        .map((item) => item.lastAttemptAt ?? item.updatedAt ?? item.createdAt)
        .filter(Boolean)
        .sort((left, right) => timestampMillis(right) - timestampMillis(left))[0] || null;

    return {
        trackedNodes: progress.length,
        completedNodes,
        learningNodes: Math.max(0, progress.length - completedNodes),
        reviewDueNodes: progress.filter((document) => isReviewDue(document)).length,
        totalAttempts,
        correctAttempts,
        wrongAttempts,
        accuracyRate: totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
        lastStudiedAt,
        areas: buildMathAreaProgress(progress)
    };
}

export function buildMathWeeklyProgress(attemptDocs = [], options = {}) {
    const attempts = documentList(attemptDocs);
    const now = new Date(options.now ?? Date.now());
    const days = Math.min(31, Math.max(1, asNonNegativeInteger(options.days, 7) || 7));
    const utcOffsetMinutes = Number.isFinite(Number(options.utcOffsetMinutes))
        ? Number(options.utcOffsetMinutes)
        : -now.getTimezoneOffset();
    const rows = [];

    for (let offset = days - 1; offset >= 0; offset -= 1) {
        const day = new Date(now.getTime() - offset * DAY_MS);
        const localDate = localDateFor(day, utcOffsetMinutes);
        const dayAttempts = attempts.filter((attempt) => dateForAttempt(attempt, utcOffsetMinutes) === localDate);
        const completedNodeIds = new Set(dayAttempts.filter((attempt) => Boolean(attempt.completed ?? attempt.isCompleted ?? attempt.nodeCompleted)).map(documentNodeId).filter(Boolean));
        const correct = dayAttempts.filter((attempt) => attempt.isCorrect === true).length;
        rows.push({
            localDate,
            label: `${Number(localDate.slice(5, 7))}/${Number(localDate.slice(8, 10))}`,
            attempts: dayAttempts.length,
            correct,
            wrong: dayAttempts.length - correct,
            completedNodes: completedNodeIds.size,
            accuracyRate: dayAttempts.length ? Math.round((correct / dayAttempts.length) * 100) : 0
        });
    }
    return rows;
}

export function buildMathGrowthRecommendations(progressDocs = [], curriculumLessons = [], limit = 3) {
    const progress = uniqueProgressDocuments(progressDocs);
    const lessons = normalizeCurriculumLessons(curriculumLessons);
    const lessonById = new Map(lessons.map((lesson) => [documentNodeId(lesson), lesson]));
    const recommendations = progress.map((document) => {
        const nodeId = documentNodeId(document);
        const lesson = lessonById.get(nodeId) || {};
        const attempts = Math.max(1, asNonNegativeInteger(document.attemptCount, 1));
        const wrongCount = asNonNegativeInteger(document.wrongCount);
        const misconceptionTotal = Object.values(document.misconceptionCounts || {}).reduce((sum, count) => sum + asNonNegativeInteger(count), 0);
        const due = isReviewDue(document);
        const completed = isCompletedProgress(document);
        const accuracyRate = Number.isFinite(Number(document.accuracyRate))
            ? Number(document.accuracyRate)
            : Math.round(((attempts - wrongCount) / attempts) * 100);
        const score = (due ? 70 : 0) + (!completed ? 45 : 0) + wrongCount * 8 + misconceptionTotal * 4 + Math.max(0, 70 - accuracyRate);
        const priority = due || accuracyRate < 50 ? 'high' : (!completed || wrongCount ? 'practice' : 'review');
        const reason = due
            ? '복습 예정일이 지났어요.'
            : (!completed ? '아직 배우는 중인 개념이에요.' : (wrongCount ? '오답이 남아 있어 다시 확인하면 좋아요.' : '간격 복습으로 기억을 다져요.'));
        return {
            nodeId,
            domain: documentDomain(document) !== 'unknown' ? documentDomain(document) : documentDomain(lesson),
            gradeBand: document.gradeBand ?? lesson.gradeBand ?? null,
            title: document.nodeTitle || lesson.title || nodeId,
            masteryState: document.masteryState || (completed ? 'basic' : 'learning'),
            accuracyRate,
            priority,
            reason,
            score
        };
    }).filter((item) => item.score > 0);

    if (!recommendations.length && lessons.length) {
        const domainStarters = MATH_DOMAINS
            .map((domain) => lessons.find((lesson) => documentDomain(lesson) === domain))
            .filter(Boolean);
        return domainStarters.slice(0, Math.max(0, asNonNegativeInteger(limit, 3))).map((lesson) => ({
            nodeId: documentNodeId(lesson),
            domain: documentDomain(lesson),
            gradeBand: lesson.gradeBand ?? null,
            title: lesson.title || documentNodeId(lesson),
            masteryState: 'not-started',
            accuracyRate: 0,
            priority: 'next',
            reason: '새로 시작할 수 있는 개념이에요.',
            score: 1
        }));
    }

    return recommendations
        .sort((left, right) => right.score - left.score || left.accuracyRate - right.accuracyRate || left.nodeId.localeCompare(right.nodeId))
        .slice(0, Math.max(0, asNonNegativeInteger(limit, 3)));
}
