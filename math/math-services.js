import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import {
    addDoc,
    collection,
    collectionGroup,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    getFirestore,
    limit as queryLimit,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    setDoc,
    where
} from "./aiedu-data-adapter.js?v=20260901-math-data-v1";
import {
    applyMathAttempt,
    buildMathAreaProgress,
    buildMathGrowthRecommendations,
    buildMathProgressId,
    buildMathWeeklyProgress,
    summarizeMathStudentRecords
} from "./math-learning-records.mjs?v=20260901-math-complete-v2";

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const MATH_PROGRESS_COLLECTION = 'mathStudentProgress';
const MATH_ATTEMPT_COLLECTION = 'mathAttempts';
const MATH_ASSIGNMENT_COLLECTION = 'mathAssignments';
const LEVEL_EXPERIENCE = 100;
const LEVEL_UP_POINTS = 1000;
const DEFAULT_CORRECT_EXPERIENCE = 2;
const MAX_QUERY_DOCUMENTS = 1200;
const DOMAIN_LABELS = Object.freeze({
    number: '수와 연산',
    relation: '변화와 관계',
    geometry: '도형과 측정',
    data: '자료와 가능성',
    unknown: '기타'
});
const USER_ICONS = Object.freeze(['🐻', '🐱', '🐶', '🦊', '🐰', '🐯', '🦁', '🐸', '🐨', '🐼', '🐮', '🐷', '🦒', '🦓', '🐘', '🦄']);

const state = {
    user: null,
    uid: null,
    profile: null,
    progressDocs: [],
    assignments: [],
    error: null,
    generation: 0,
    sessionPromise: Promise.resolve(),
    profileUnsubscribe: null,
    progressUnsubscribe: null
};

let resolveInitialAuth;
const initialAuthReady = new Promise((resolve) => { resolveInitialAuth = resolve; });
let initialAuthResolved = false;
const shopItems = new Map();
const classStudents = new Map();

function asNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function asNonNegativeNumber(value, fallback = 0) {
    return Math.max(0, asNumber(value, fallback));
}

function asNonNegativeInteger(value, fallback = 0) {
    return Math.max(0, Math.floor(asNumber(value, fallback)));
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
}

function safeImageSource(value) {
    const source = String(value || '').trim();
    if (/^https:\/\//i.test(source)) return source;
    if (/^(?:\.\/|\/)?[a-z0-9_./-]+\.(?:png|jpe?g|webp|gif)(?:\?[a-z0-9=&._-]+)?$/i.test(source)) return source;
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
    return '';
}

function normalizeDocument(snapshot) {
    return snapshot?.exists?.() ? { id: snapshot.id, ...snapshot.data() } : null;
}

function normalizeQuery(snapshot) {
    return snapshot?.docs?.map((item) => ({ id: item.id, ...item.data() })) || [];
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

function formatDateTime(value) {
    const milliseconds = timestampMillis(value);
    return Number.isFinite(milliseconds) ? new Date(milliseconds).toLocaleString('ko-KR') : '-';
}

function localDateNow() {
    return new Date().toLocaleDateString('sv-SE');
}

function randomId(prefix) {
    const value = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `${prefix}-${value}`;
}

function safeDocumentId(value) {
    return String(value || '').trim().replaceAll('/', '%2F').slice(0, 1400);
}

function normalizeCurriculum() {
    const lessons = typeof window.getAiedueMathCurriculumLessons === 'function'
        ? window.getAiedueMathCurriculumLessons()
        : [];
    return (Array.isArray(lessons) ? lessons : []).map((lesson) => ({
        ...lesson,
        nodeId: lesson.nodeId || lesson.id,
        domain: lesson.domain || lesson.domainId || lesson.areaId || 'unknown',
        gradeBand: lesson.gradeBand || lesson.band || null
    })).filter((lesson) => lesson.nodeId);
}

function normalizeLevelExperience(profile = {}) {
    const rawExperience = asNonNegativeNumber(profile.aeduExperience ?? profile.experience ?? profile.exp, 0);
    const explicitLevel = Math.max(1, Math.floor(asNumber(profile.aeduLevel ?? profile.level ?? profile.schoolLevel, 1)));
    const derivedLevel = Math.floor(rawExperience / LEVEL_EXPERIENCE) + 1;
    return {
        aeduExperience: rawExperience >= LEVEL_EXPERIENCE ? rawExperience % LEVEL_EXPERIENCE : rawExperience,
        aeduLevel: Math.max(explicitLevel, derivedLevel)
    };
}

function normalizeWallet(profile = {}) {
    const balance = asNonNegativeNumber(profile.balance ?? profile.coins ?? profile.aeduTokens, 0);
    const level = normalizeLevelExperience(profile);
    return {
        balance,
        coins: balance,
        aeduTokens: balance,
        warningTokens: asNonNegativeInteger(profile.warningTokens, 0),
        ...level
    };
}

function completedNodeIds(progressDocs = state.progressDocs) {
    return progressDocs.filter((progress) => progress.completed === true
        || ['completed', 'basic', 'stable', 'extended', 'mastered'].includes(String(progress.status || progress.masteryState || '').toLowerCase()))
        .map((progress) => progress.nodeId || progress.lessonId)
        .filter(Boolean);
}

function roleOf(profile = state.profile) {
    return String(profile?.role || 'student').toLowerCase() === 'teacher' ? 'teacher' : 'student';
}

function requireUid() {
    if (!state.uid) throw new Error('에이두 수학에 먼저 로그인해 주세요.');
    return state.uid;
}

function requireTeacher() {
    const uid = requireUid();
    if (roleOf() !== 'teacher') throw new Error('교사 계정으로 로그인해 주세요.');
    return uid;
}

function notify(message) {
    if (typeof window.showModal === 'function') {
        window.showModal(escapeHtml(message));
        return;
    }
    console.info(message);
}

function dispatch(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail }));
}

function renderSharedProfile(profile = {}) {
    const wallet = normalizeWallet(profile);
    const name = profile.name || profile.displayName || state.user?.email || '이름 없음';
    const icon = profile.icon || profile.profileIcon || '🐻';
    const roleLabel = roleOf(profile) === 'teacher' ? '선생님' : '학생';
    const selectors = [
        ['.sync-account-name', name],
        ['.sync-user-role', roleLabel],
        ['.sync-user-icon', icon],
        ['.sync-coins', Math.floor(wallet.balance).toLocaleString('ko-KR')],
        ['.sync-warning-tokens', wallet.warningTokens],
        ['.sync-aedu-level', wallet.aeduLevel],
        ['.sync-aedu-exp-percent', `${Math.floor(wallet.aeduExperience)}%`]
    ];
    selectors.forEach(([selector, value]) => document.querySelectorAll(selector).forEach((element) => { element.textContent = String(value); }));
    document.querySelectorAll('.sync-aedu-exp-bar').forEach((element) => { element.style.width = `${Math.max(0, Math.min(100, wallet.aeduExperience))}%`; });
    const ids = {
        'dashboard-account-name': name,
        'dashboard-account-name-header': name,
        'dashboard-coins': Math.floor(wallet.balance).toLocaleString('ko-KR'),
        'dashboard-coins-header': Math.floor(wallet.balance).toLocaleString('ko-KR'),
        'dashboard-warning-tokens-header': wallet.warningTokens,
        'user-role-badge': roleLabel,
        'user-icon-btn': icon,
        'dashboard-user-icon-header': icon
    };
    Object.entries(ids).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = String(value);
    });
    const isTeacher = roleOf(profile) === 'teacher';
    document.getElementById('teacher-manage-btn')?.classList.toggle('hidden', !isTeacher);
    document.getElementById('rpg-teacher-manage-btn')?.classList.toggle('hidden', !isTeacher);
    document.querySelectorAll('.rpg-student-learning-button').forEach((element) => element.classList.toggle('hidden', isTeacher));
    const levelLabel = document.getElementById('dashboard-level-label');
    if (levelLabel) levelLabel.textContent = `Lv.${wallet.aeduLevel} · 경험치 ${Math.floor(wallet.aeduExperience)}%`;
    document.querySelectorAll('.rpg-experience-track').forEach((element) => element.setAttribute('aria-valuenow', String(Math.floor(wallet.aeduExperience))));
}

function stopSubscriptions() {
    for (const key of ['profileUnsubscribe', 'progressUnsubscribe']) {
        if (typeof state[key] === 'function') {
            try { state[key](); } catch (error) { console.warn(`Math ${key} failed`, error); }
        }
        state[key] = null;
    }
}

async function loadProfile(uid, retries = 15) {
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const snapshot = await getDoc(doc(db, 'users', uid));
        if (snapshot.exists()) return normalizeDocument(snapshot);
        if (attempt < retries) await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
    return null;
}

async function queryProgress(uid) {
    const snapshot = await getDocs(query(
        collection(db, MATH_PROGRESS_COLLECTION),
        where('uid', '==', uid),
        queryLimit(MAX_QUERY_DOCUMENTS)
    ));
    return normalizeQuery(snapshot);
}

async function queryAttempts(uid, cap = MAX_QUERY_DOCUMENTS) {
    const snapshot = await getDocs(query(
        collection(db, MATH_ATTEMPT_COLLECTION),
        where('uid', '==', uid),
        queryLimit(Math.max(1, Math.min(MAX_QUERY_DOCUMENTS, asNonNegativeInteger(cap, MAX_QUERY_DOCUMENTS))))
    ));
    return normalizeQuery(snapshot).sort((left, right) => timestampMillis(right.createdAt) - timestampMillis(left.createdAt));
}

async function queryAssignments(field, value) {
    const snapshot = await getDocs(query(
        collection(db, MATH_ASSIGNMENT_COLLECTION),
        where(field, '==', value),
        queryLimit(500)
    ));
    return normalizeQuery(snapshot).sort((left, right) => timestampMillis(right.assignedAt) - timestampMillis(left.assignedAt));
}

async function loadSessionData(uid) {
    const [profile, progressDocs, assignments] = await Promise.all([
        loadProfile(uid),
        queryProgress(uid),
        queryAssignments('studentId', uid)
    ]);
    if (!profile) throw new Error('사용자 프로필을 찾을 수 없습니다.');
    return { profile, progressDocs, assignments };
}

function startSubscriptions(uid) {
    stopSubscriptions();
    state.profileUnsubscribe = onSnapshot(doc(db, 'users', uid), (snapshot) => {
        if (uid !== state.uid || !snapshot.exists()) return;
        state.profile = normalizeDocument(snapshot);
        renderSharedProfile(state.profile);
        dispatch('aiedue-math-profile-updated', { uid, profile: state.profile });
    }, (error) => console.warn('Math profile sync failed', error));

    const progressQuery = query(collection(db, MATH_PROGRESS_COLLECTION), where('uid', '==', uid), queryLimit(MAX_QUERY_DOCUMENTS));
    state.progressUnsubscribe = onSnapshot(progressQuery, (snapshot) => {
        if (uid !== state.uid) return;
        state.progressDocs = normalizeQuery(snapshot);
        const detail = { uid, progressDocs: state.progressDocs, completedNodeIds: completedNodeIds() };
        dispatch('aiedue-math-progress-updated', detail);
    }, (error) => console.warn('Math progress sync failed', error));
}

function readyDetail() {
    return {
        uid: state.uid,
        profile: state.profile,
        progressDocs: state.progressDocs,
        completedNodeIds: completedNodeIds(),
        assignments: state.assignments,
        error: state.error
    };
}

async function bootstrapSession(user, generation) {
    if (!user) {
        state.user = null;
        state.uid = null;
        state.profile = null;
        state.progressDocs = [];
        state.assignments = [];
        state.error = null;
        stopSubscriptions();
        const detail = readyDetail();
        dispatch('aiedue-math-data-ready', detail);
        return detail;
    }

    state.user = user;
    state.uid = user.uid;
    try {
        const session = await loadSessionData(user.uid);
        if (generation !== state.generation || user.uid !== state.uid) return readyDetail();
        state.profile = session.profile;
        state.progressDocs = session.progressDocs;
        state.assignments = session.assignments;
        state.error = null;
        renderSharedProfile(state.profile);
        startSubscriptions(user.uid);
    } catch (error) {
        if (generation === state.generation) state.error = error;
        console.error('Math data bootstrap failed', error);
    }
    const detail = readyDetail();
    dispatch('aiedue-math-data-ready', detail);
    return detail;
}

onAuthStateChanged(auth, (user) => {
    const generation = ++state.generation;
    state.sessionPromise = bootstrapSession(user, generation);
    if (!initialAuthResolved) {
        initialAuthResolved = true;
        resolveInitialAuth();
    }
});

async function ready() {
    await initialAuthReady;
    await state.sessionPromise;
    requireUid();
    if (state.error) throw state.error;
    return readyDetail();
}

async function loadProgress() {
    await ready();
    state.progressDocs = await queryProgress(requireUid());
    return {
        uid: state.uid,
        profile: state.profile,
        progressDocs: state.progressDocs,
        completedNodeIds: completedNodeIds(),
        summary: summarizeMathStudentRecords(state.progressDocs)
    };
}

function buildAttempt(payload, uid) {
    const nodeId = String(payload?.nodeId || '').trim();
    if (!nodeId) throw new Error('수학 시도에는 nodeId가 필요합니다.');
    if (typeof payload.isCorrect !== 'boolean') throw new Error('수학 시도에는 isCorrect가 필요합니다.');
    const createdAt = payload.createdAt || new Date().toISOString();
    const attemptIdSource = payload.attemptId || (payload.questionId ? `question-${payload.questionId}` : randomId('attempt'));
    const attemptId = safeDocumentId(attemptIdSource);
    return {
        ...payload,
        attemptId,
        uid,
        studentId: uid,
        nodeId,
        isCorrect: payload.isCorrect === true,
        completed: Boolean(payload.completed),
        attemptSource: payload.attemptSource === 'review' ? 'review' : 'normal',
        misconceptionTags: Array.isArray(payload.misconceptionTags) ? payload.misconceptionTags : [],
        createdAt,
        localDate: payload.localDate || localDateNow(),
        source: 'aiedue-math'
    };
}

function rewardForAttempt(payload, attempt) {
    if (!attempt.isCorrect) return 0;
    const requested = payload.experienceReward;
    return requested == null ? DEFAULT_CORRECT_EXPERIENCE : asNonNegativeNumber(requested, 0);
}

function walletReward(profile, experienceReward) {
    const wallet = normalizeWallet(profile);
    const totalExperience = wallet.aeduExperience + experienceReward;
    const levelUps = Math.floor(totalExperience / LEVEL_EXPERIENCE);
    const levelUpPoints = levelUps * LEVEL_UP_POINTS;
    const warningReduced = Math.min(wallet.warningTokens, levelUps);
    const balance = wallet.balance + levelUpPoints;
    return {
        updates: {
            aeduExperience: totalExperience % LEVEL_EXPERIENCE,
            aeduLevel: wallet.aeduLevel + levelUps,
            balance,
            coins: balance,
            aeduTokens: balance,
            warningTokens: wallet.warningTokens - warningReduced
        },
        levelUps,
        levelUpPoints,
        warningReduced
    };
}

async function recordAttempt(payload = {}) {
    await ready();
    const uid = requireUid();
    const attempt = buildAttempt(payload, uid);
    const progressRef = doc(db, MATH_PROGRESS_COLLECTION, buildMathProgressId(uid, attempt.nodeId));
    const attemptRef = doc(db, MATH_ATTEMPT_COLLECTION, attempt.attemptId);
    const userRef = doc(db, 'users', uid);
    const assignmentId = String(attempt.assignmentId || '').trim();
    const assignmentRef = assignmentId ? doc(db, MATH_ASSIGNMENT_COLLECTION, safeDocumentId(assignmentId)) : null;

    const result = await runTransaction(db, async (transaction) => {
        const existingAttempt = await transaction.get(attemptRef);
        if (existingAttempt.exists()) {
            const progressSnapshot = await transaction.get(progressRef);
            const saved = existingAttempt.data() || {};
            return {
                progress: progressSnapshot.exists() ? { id: progressSnapshot.id, ...progressSnapshot.data() } : null,
                grantedExperience: asNonNegativeNumber(saved.grantedExperience, 0),
                levelUps: asNonNegativeInteger(saved.levelUps, 0),
                warningReduced: asNonNegativeInteger(saved.warningReduced, 0),
                levelUpPoints: asNonNegativeNumber(saved.levelUpPoints, 0),
                duplicate: true,
                saved: true,
                attempt: { id: existingAttempt.id, ...saved }
            };
        }

        const progressSnapshot = await transaction.get(progressRef);
        const userSnapshot = await transaction.get(userRef);
        let assignmentSnapshot = null;
        if (assignmentRef) assignmentSnapshot = await transaction.get(assignmentRef);
        if (!userSnapshot.exists()) throw new Error('사용자 프로필을 찾을 수 없습니다.');

        const currentProgress = progressSnapshot.exists() ? progressSnapshot.data() : null;
        const progress = applyMathAttempt(currentProgress, attempt);
        const grantedExperience = rewardForAttempt(payload, attempt);
        const reward = walletReward(userSnapshot.data() || {}, grantedExperience);
        const savedAttempt = {
            ...attempt,
            grantedExperience,
            levelUps: reward.levelUps,
            warningReduced: reward.warningReduced,
            levelUpPoints: reward.levelUpPoints,
            serverUpdatedAt: serverTimestamp()
        };

        transaction.set(progressRef, { ...progress, serverUpdatedAt: serverTimestamp() });
        transaction.set(attemptRef, savedAttempt);
        transaction.set(userRef, {
            ...reward.updates,
            mathLastAttemptAt: attempt.createdAt,
            mathLastNodeId: attempt.nodeId,
            updatedAt: serverTimestamp()
        }, { merge: true });
        if (assignmentSnapshot?.exists() && attempt.completed) {
            transaction.set(assignmentRef, {
                status: 'completed',
                completedAt: attempt.createdAt,
                updatedAt: serverTimestamp()
            }, { merge: true });
        }
        return {
            progress: { id: progressRef.id, ...progress },
            grantedExperience,
            levelUps: reward.levelUps,
            warningReduced: reward.warningReduced,
            levelUpPoints: reward.levelUpPoints,
            duplicate: false,
            saved: true,
            attempt: { id: attemptRef.id, ...savedAttempt },
            profileUpdates: reward.updates
        };
    });

    if (!result.duplicate && result.progress) {
        const byId = new Map(state.progressDocs.map((item) => [item.nodeId, item]));
        byId.set(result.progress.nodeId, result.progress);
        state.progressDocs = [...byId.values()];
        state.profile = { ...(state.profile || {}), ...(result.profileUpdates || {}) };
        renderSharedProfile(state.profile);
        dispatch('aiedue-math-progress-updated', {
            uid,
            progressDocs: state.progressDocs,
            completedNodeIds: completedNodeIds(),
            latest: result.progress
        });
    }
    return result;
}

async function loadStudentRecords(uid = state.uid) {
    await ready();
    if (uid !== state.uid && roleOf() !== 'teacher') throw new Error('다른 학생의 기록은 교사만 볼 수 있습니다.');
    const [progressDocs, attemptDocs] = await Promise.all([queryProgress(uid), queryAttempts(uid)]);
    const curriculum = normalizeCurriculum();
    return {
        uid,
        progressDocs,
        attemptDocs,
        summary: summarizeMathStudentRecords(progressDocs, attemptDocs),
        areas: buildMathAreaProgress(progressDocs, curriculum),
        weekly: buildMathWeeklyProgress(attemptDocs),
        recommendations: buildMathGrowthRecommendations(progressDocs, curriculum, 5)
    };
}

async function loadTodayReview() {
    await ready();
    const [progressDocs, assignments] = await Promise.all([
        queryProgress(requireUid()),
        queryAssignments('studentId', state.uid)
    ]);
    const curriculum = normalizeCurriculum();
    const lessons = new Map(curriculum.map((lesson) => [lesson.nodeId, lesson]));
    const activeAssignments = assignments.filter((assignment) => !['completed', 'cancelled'].includes(String(assignment.status || 'assigned').toLowerCase()));
    const assignedNodeIds = new Set(activeAssignments.map((assignment) => assignment.nodeId));
    const assignmentReviews = activeAssignments.map((assignment) => {
        const lesson = lessons.get(assignment.nodeId) || {};
        return {
            nodeId: assignment.nodeId,
            title: assignment.nodeTitle || lesson.title || assignment.nodeId,
            domain: assignment.domain || lesson.domain || 'unknown',
            gradeBand: assignment.gradeBand || lesson.gradeBand || null,
            priority: 'assigned',
            reason: `${assignment.teacherName || '선생님'}이 배정한 개념이에요.`,
            assignmentId: assignment.id
        };
    });
    const recommendations = buildMathGrowthRecommendations(progressDocs, curriculum, 8)
        .filter((item) => !assignedNodeIds.has(item.nodeId));
    return { assignments: activeAssignments, reviews: [...assignmentReviews, ...recommendations].slice(0, 10), progressDocs };
}

function showServiceSection(sectionId) {
    const section = document.getElementById(sectionId);
    if (!section) return false;
    document.querySelectorAll('.view-section').forEach((candidate) => {
        const visible = candidate === section;
        candidate.classList.toggle('hidden', !visible);
        candidate.style.display = visible ? 'flex' : 'none';
    });
    window.collapseRpgHud?.();
    document.getElementById('aiedue-rpg-hud')?.classList.remove('hidden');
    section.scrollTop = 0;
    return true;
}

function toggleRpgHudPanel(button) {
    const hud = document.getElementById('aiedue-rpg-hud');
    const tray = document.getElementById('rpg-action-tray');
    if (!hud) return false;
    const isExpanded = hud.classList.toggle('rpg-collapsed') === false;
    button?.setAttribute('aria-expanded', String(isExpanded));
    button?.setAttribute('aria-label', isExpanded ? '메뉴 접기' : '메뉴 펼치기');
    if (!isExpanded) {
        hud.classList.remove('actions-open');
        const actionButton = hud.querySelector('.rpg-expand-button');
        actionButton?.setAttribute('aria-expanded', 'false');
        actionButton?.setAttribute('aria-label', '하단 메뉴 펼치기');
        tray?.setAttribute('aria-hidden', 'true');
        if (tray) tray.inert = true;
    }
    return isExpanded;
}

function renderAreaCards(areas = []) {
    return areas.map((area) => `<article class="bg-white rounded-3xl border border-sky-100 p-4 shadow-sm">
        <div class="flex justify-between gap-3"><strong>${escapeHtml(DOMAIN_LABELS[area.domain] || area.domain)}</strong><span>${area.rate}%</span></div>
        <div class="h-3 rounded-full bg-slate-100 mt-3 overflow-hidden"><div class="h-full bg-sky-400" style="width:${Math.max(0, Math.min(100, area.rate))}%"></div></div>
        <p class="text-sm text-slate-500 mt-2">완료 ${area.completed}/${area.total} · 복습 ${area.reviewDue}</p>
    </article>`).join('');
}

function bindNodeButtons(root) {
    root?.querySelectorAll('[data-math-node]').forEach((button) => {
        button.addEventListener('click', () => {
            const nodeId = button.dataset.mathNode;
            const assignmentId = button.dataset.assignmentId || null;
            if (typeof window.openSpiralLesson !== 'function') return notify('수학 활동을 아직 불러오지 못했습니다.');
            window.openSpiralLesson(nodeId, { attemptSource: 'review', ...(assignmentId ? { assignmentId } : {}) });
        });
    });
}

async function openMathRecords() {
    const root = document.getElementById('math-records-content');
    if (!showServiceSection('math-records-section') || !root) return false;
    root.innerHTML = '<p class="font-black text-sky-700">수학 기록을 불러오는 중이에요...</p>';
    try {
        const records = await loadStudentRecords();
        root.innerHTML = `<div class="w-full max-w-6xl mx-auto p-5 space-y-5">
            <section class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-white rounded-3xl p-4"><strong class="text-2xl">${records.summary.completedNodes}</strong><p>완료 개념</p></div>
                <div class="bg-white rounded-3xl p-4"><strong class="text-2xl">${records.summary.totalAttempts}</strong><p>풀이 수</p></div>
                <div class="bg-white rounded-3xl p-4"><strong class="text-2xl">${records.summary.accuracyRate}%</strong><p>정답률</p></div>
                <div class="bg-white rounded-3xl p-4"><strong class="text-2xl">${records.summary.reviewDueNodes}</strong><p>오늘 복습</p></div>
            </section>
            <section class="grid md:grid-cols-2 gap-3">${renderAreaCards(records.areas)}</section>
            <section class="bg-white rounded-[32px] p-5"><div class="flex items-center justify-between"><h2 class="text-2xl font-black">최근 풀이</h2><button type="button" class="btn-primary px-4 py-2" id="math-record-review-button">오늘 복습</button></div>
                <div class="mt-4 space-y-2">${records.attemptDocs.slice(0, 12).map((attempt) => `<div class="rounded-2xl bg-slate-50 p-3"><strong>${escapeHtml(attempt.nodeTitle || attempt.nodeId)}</strong><span class="ml-2 ${attempt.isCorrect ? 'text-emerald-600' : 'text-red-500'}">${attempt.isCorrect ? '정답' : '오답'}</span><small class="block text-slate-400">${escapeHtml(formatDateTime(attempt.createdAt))}</small></div>`).join('') || '<p class="text-slate-400">아직 저장된 풀이가 없어요.</p>'}</div>
            </section>
        </div>`;
        root.querySelector('#math-record-review-button')?.addEventListener('click', () => { void openMathReview(); });
        return records;
    } catch (error) {
        root.innerHTML = `<p class="text-red-500 font-bold">${escapeHtml(error.message || '기록을 불러오지 못했습니다.')}</p>`;
        return false;
    }
}

async function openMathReview() {
    const root = document.getElementById('math-review-content');
    if (!showServiceSection('math-review-section') || !root) return false;
    root.innerHTML = '<p class="font-black text-sky-700">오늘의 복습을 준비하는 중이에요...</p>';
    try {
        const review = await loadTodayReview();
        root.innerHTML = `<div class="w-full max-w-5xl mx-auto p-5 space-y-5">
            <section class="grid md:grid-cols-2 gap-4">${review.reviews.map((item) => `<article class="bg-white rounded-[28px] border border-violet-100 p-5 shadow-sm"><span class="text-xs font-black text-violet-600">${escapeHtml(item.priority === 'assigned' ? '선생님 배정' : DOMAIN_LABELS[item.domain] || item.domain)}</span><h2 class="text-xl font-black mt-1">${escapeHtml(item.title || item.nodeId)}</h2><p class="text-sm text-slate-500 mt-2">${escapeHtml(item.reason || '다시 연습해요.')}</p><button type="button" class="btn-primary px-4 py-2 mt-4" data-math-node="${escapeHtml(item.nodeId)}" ${item.assignmentId ? `data-assignment-id="${escapeHtml(item.assignmentId)}"` : ''}>복습 시작</button></article>`).join('') || '<div class="bg-white rounded-[28px] p-8 text-center text-slate-500 md:col-span-2">오늘 예정된 복습이 없어요. 새 개념에 도전해 보세요!</div>'}</section>
        </div>`;
        bindNodeButtons(root);
        return review;
    } catch (error) {
        root.innerHTML = `<p class="text-red-500 font-bold">${escapeHtml(error.message || '복습을 불러오지 못했습니다.')}</p>`;
        return false;
    }
}

async function loadClassStudents() {
    const teacherId = requireTeacher();
    const students = new Map();
    try {
        const classSnapshot = await getDoc(doc(db, 'classes', teacherId));
        const ids = classSnapshot.exists() && Array.isArray(classSnapshot.data().students) ? classSnapshot.data().students : [];
        const profiles = await Promise.all(ids.map((studentId) => getDoc(doc(db, 'users', studentId)).catch(() => null)));
        profiles.forEach((snapshot) => {
            if (snapshot?.exists()) students.set(snapshot.id, normalizeDocument(snapshot));
        });
    } catch (error) {
        console.warn('Math class document load failed', error);
    }
    try {
        const snapshot = await getDocs(query(collection(db, 'users'), where('teacherId', '==', teacherId), queryLimit(200)));
        normalizeQuery(snapshot).forEach((student) => {
            if (roleOf(student) === 'student') students.set(student.id, student);
        });
    } catch (error) {
        console.warn('Math teacher students query failed', error);
    }
    classStudents.clear();
    [...students.entries()].forEach(([id, student]) => classStudents.set(id, student));
    return [...students.values()].sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'ko'));
}

async function loadClassReport() {
    const teacherId = requireTeacher();
    const [students, assignments] = await Promise.all([
        loadClassStudents(),
        queryAssignments('teacherId', teacherId)
    ]);
    const reports = await Promise.all(students.map(async (student) => {
        const progressDocs = await queryProgress(student.id);
        return {
            student,
            progressDocs,
            summary: summarizeMathStudentRecords(progressDocs),
            areas: buildMathAreaProgress(progressDocs, normalizeCurriculum())
        };
    }));
    return { students, reports, assignments };
}

function assignmentId(teacherId, studentId, nodeId) {
    return safeDocumentId(`${teacherId}__${studentId}__${nodeId}`);
}

async function assignConcept(studentId, nodeId) {
    await ready();
    const teacherId = requireTeacher();
    const student = classStudents.get(studentId);
    const lesson = normalizeCurriculum().find((item) => item.nodeId === nodeId);
    if (!student) throw new Error('학급 학생을 찾을 수 없습니다.');
    if (!lesson) throw new Error('배정할 수학 개념을 찾을 수 없습니다.');
    const id = assignmentId(teacherId, studentId, nodeId);
    await setDoc(doc(db, MATH_ASSIGNMENT_COLLECTION, id), {
        assignmentId: id,
        teacherId,
        teacherUid: teacherId,
        teacherName: state.profile?.name || '선생님',
        studentId,
        studentName: student.name || '학생',
        nodeId,
        nodeTitle: lesson.title || nodeId,
        domain: lesson.domain,
        gradeBand: lesson.gradeBand,
        status: 'assigned',
        source: 'aiedue-math',
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    }, { merge: true });
    return id;
}

async function removeAssignment(id) {
    await ready();
    requireTeacher();
    await deleteDoc(doc(db, MATH_ASSIGNMENT_COLLECTION, safeDocumentId(id)));
}

async function openMathClass() {
    const root = document.getElementById('math-class-content');
    if (!showServiceSection('math-class-section') || !root) return false;
    root.innerHTML = '<p class="font-black text-sky-700">학급 수학 기록을 불러오는 중이에요...</p>';
    try {
        await ready();
        requireTeacher();
        const report = await loadClassReport();
        const lessons = normalizeCurriculum();
        root.innerHTML = `<div class="w-full max-w-7xl mx-auto p-5 space-y-5">
            <section class="bg-white rounded-[32px] p-5"><h2 class="text-xl font-black">개념 배정</h2><div class="grid md:grid-cols-[1fr_2fr_auto] gap-3 mt-3"><select id="math-assign-student" class="premium-input"><option value="">학생 선택</option>${report.students.map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.name || student.id)}</option>`).join('')}</select><select id="math-assign-node" class="premium-input"><option value="">개념 선택</option>${lessons.map((lesson) => `<option value="${escapeHtml(lesson.nodeId)}">${escapeHtml(`${DOMAIN_LABELS[lesson.domain] || lesson.domain} · ${lesson.title}`)}</option>`).join('')}</select><button type="button" id="math-assign-button" class="btn-primary px-5 py-3">배정</button></div></section>
            <section class="grid md:grid-cols-2 gap-4">${report.reports.map(({ student, summary, areas }) => `<article class="bg-white rounded-[28px] p-5 border border-teal-100"><div class="flex justify-between gap-3"><div><h2 class="text-xl font-black">${escapeHtml(student.name || '학생')}</h2><p class="text-xs text-teal-600">${escapeHtml(student.userCode || student.code || '')}</p></div><button type="button" class="btn-outline px-3 py-2" data-student-report="${escapeHtml(student.id)}">상세</button></div><p class="mt-3 font-bold">완료 ${summary.completedNodes}개 · 정답률 ${summary.accuracyRate}% · 복습 ${summary.reviewDueNodes}개</p><div class="mt-3 text-sm text-slate-500">${areas.map((area) => `${DOMAIN_LABELS[area.domain] || area.domain} ${area.rate}%`).join(' · ')}</div></article>`).join('') || '<p class="text-slate-400">학급에 등록된 학생이 없습니다.</p>'}</section>
            <section class="bg-white rounded-[32px] p-5"><h2 class="text-xl font-black">배정 목록</h2><div class="mt-3 space-y-2">${report.assignments.map((assignment) => `<div class="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-3"><span><strong>${escapeHtml(assignment.studentName || assignment.studentId)}</strong> · ${escapeHtml(assignment.nodeTitle || assignment.nodeId)} <small class="text-slate-400">${escapeHtml(assignment.status || 'assigned')}</small></span><button type="button" class="text-red-500 font-bold" data-remove-assignment="${escapeHtml(assignment.id)}">삭제</button></div>`).join('') || '<p class="text-slate-400">배정된 개념이 없습니다.</p>'}</div></section>
        </div>`;
        root.querySelector('#math-assign-button')?.addEventListener('click', async () => {
            const studentId = root.querySelector('#math-assign-student')?.value;
            const nodeId = root.querySelector('#math-assign-node')?.value;
            if (!studentId || !nodeId) return notify('학생과 개념을 모두 선택해 주세요.');
            try { await assignConcept(studentId, nodeId); notify('수학 개념을 배정했습니다.'); await openMathClass(); }
            catch (error) { notify(error.message || '개념 배정에 실패했습니다.'); }
        });
        root.querySelectorAll('[data-remove-assignment]').forEach((button) => button.addEventListener('click', async () => {
            try { await removeAssignment(button.dataset.removeAssignment); await openMathClass(); }
            catch (error) { notify(error.message || '배정을 삭제하지 못했습니다.'); }
        }));
        root.querySelectorAll('[data-student-report]').forEach((button) => button.addEventListener('click', () => { void openMathStudentReport(button.dataset.studentReport); }));
        return report;
    } catch (error) {
        root.innerHTML = `<p class="text-red-500 font-bold">${escapeHtml(error.message || '학급 기록을 불러오지 못했습니다.')}</p>`;
        return false;
    }
}

async function openMathStudentReport(studentId) {
    try {
        const records = await loadStudentRecords(studentId);
        const student = classStudents.get(studentId);
        openServiceModal(`${student?.name || '학생'} 수학 리포트`, `<div class="space-y-4"><p class="font-black">완료 ${records.summary.completedNodes}개 · 정답률 ${records.summary.accuracyRate}% · 복습 ${records.summary.reviewDueNodes}개</p><div class="grid grid-cols-2 gap-3">${renderAreaCards(records.areas)}</div><h3 class="font-black text-lg">추천 학습</h3>${records.recommendations.map((item) => `<p class="rounded-2xl bg-slate-50 p-3"><strong>${escapeHtml(item.title)}</strong><br><span class="text-sm text-slate-500">${escapeHtml(item.reason)}</span></p>`).join('') || '<p>추천 항목이 없습니다.</p>'}</div>`);
        return records;
    } catch (error) {
        notify(error.message || '학생 리포트를 불러오지 못했습니다.');
        return false;
    }
}

function ensureServiceModal() {
    let modal = document.getElementById('aiedue-math-service-modal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'aiedue-math-service-modal';
    modal.className = 'fixed inset-0 hidden items-center justify-center bg-black/60 p-4';
    modal.style.zIndex = '2200';
    modal.innerHTML = `<div class="w-full max-w-4xl max-h-[90vh] overflow-auto rounded-[32px] bg-white p-6 shadow-2xl"><div class="flex items-center justify-between gap-3 mb-4"><h2 id="aiedue-math-service-title" class="text-2xl font-black"></h2><button type="button" id="aiedue-math-service-close" class="text-3xl" aria-label="닫기">×</button></div><div id="aiedue-math-service-content"></div></div>`;
    modal.querySelector('#aiedue-math-service-close').addEventListener('click', closeServiceModal);
    modal.addEventListener('click', (event) => { if (event.target === modal) closeServiceModal(); });
    document.body.appendChild(modal);
    return modal;
}

function openServiceModal(title, html) {
    window.collapseRpgHud?.();
    const modal = ensureServiceModal();
    modal.querySelector('#aiedue-math-service-title').textContent = title;
    modal.querySelector('#aiedue-math-service-content').innerHTML = html;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    return modal;
}

function closeServiceModal() {
    const modal = document.getElementById('aiedue-math-service-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

function shopPrice(item, profile = state.profile) {
    const basePrice = asNonNegativeInteger(item.price, 0);
    const warningTokenCount = asNonNegativeInteger(profile?.warningTokens, 0);
    const multiplier = warningTokenCount ? Math.min(5, warningTokenCount + 1) : 1;
    return { basePrice, warningTokenCount, multiplier, adjustedPrice: basePrice * multiplier };
}

function money(value) {
    return `${asNonNegativeInteger(value).toLocaleString('ko-KR')}점`;
}

async function loadAssignedShopItems(uid) {
    const assignmentCollection = collection(db, 'users', uid, 'assignedShopItems');
    let snapshot;
    try { snapshot = await getDocs(query(assignmentCollection, orderBy('assignedAt', 'desc'))); }
    catch { snapshot = await getDocs(assignmentCollection); }
    const assignments = normalizeQuery(snapshot);
    const output = [];
    for (const assignment of assignments) {
        let item = null;
        if (assignment.itemId) {
            const itemSnapshot = await getDoc(doc(db, 'shopItems', assignment.itemId)).catch(() => null);
            if (itemSnapshot?.exists()) item = normalizeDocument(itemSnapshot);
        }
        if (!item && (assignment.name || assignment.itemName)) item = { id: assignment.itemId || assignment.id, ...assignment };
        if (!item) continue;
        shopItems.set(item.id, item);
        output.push({ assignment, item });
    }
    return output;
}

async function loadTeacherShopItems() {
    const teacherId = requireTeacher();
    let snapshot;
    try {
        snapshot = await getDocs(query(collection(db, 'shopItems'), where('teacherId', '==', teacherId), orderBy('createdAt', 'desc')));
    } catch {
        snapshot = await getDocs(query(collection(db, 'shopItems'), where('teacherId', '==', teacherId)));
    }
    const items = normalizeQuery(snapshot);
    shopItems.clear();
    items.forEach((item) => shopItems.set(item.id, item));
    return items;
}

function itemImage(item) {
    const source = safeImageSource(item.imageUrl);
    return source
        ? `<img src="${escapeHtml(source)}" alt="${escapeHtml(item.name || '상점 물품')}" class="w-full h-32 object-cover rounded-2xl bg-slate-100">`
        : '<div class="w-full h-32 rounded-2xl bg-amber-50 flex items-center justify-center text-5xl">🎁</div>';
}

async function openStudentShop() {
    const uid = requireUid();
    const displayItems = await loadAssignedShopItems(uid);
    const wallet = normalizeWallet(state.profile || {});
    const modal = openServiceModal('🛒 에이두 수학 상점', `<div class="flex justify-end mb-4"><strong class="rounded-2xl bg-amber-50 px-4 py-2 text-amber-700">내 포인트 ${money(wallet.balance)}</strong></div><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">${displayItems.map(({ item }) => {
        const price = shopPrice(item);
        return `<article class="rounded-[28px] border border-amber-100 p-4 shadow-sm">${itemImage(item)}<h3 class="text-xl font-black mt-3">${escapeHtml(item.name || '상점 물품')}</h3><p class="text-sm text-slate-500 min-h-10">${escapeHtml(item.description || '')}</p><div class="mt-3"><strong class="text-amber-600">${money(price.adjustedPrice)}</strong>${price.multiplier > 1 ? `<small class="block text-red-500">주의 토큰으로 ${price.multiplier}배</small>` : ''}</div><button type="button" class="btn-primary w-full py-2 mt-3" data-buy-item="${escapeHtml(item.id)}">구매</button></article>`;
    }).join('') || '<p class="text-slate-400 sm:col-span-2 lg:col-span-3 text-center py-8">아직 선생님이 배부한 물품이 없습니다.</p>'}</div>`);
    modal.querySelectorAll('[data-buy-item]').forEach((button) => button.addEventListener('click', () => { void confirmShopPurchase(button.dataset.buyItem); }));
}

async function openTeacherShop() {
    const items = await loadTeacherShopItems();
    const modal = openServiceModal('🛒 교사 상점 관리', `<div class="flex justify-end mb-4"><button type="button" id="math-shop-add" class="btn-primary px-4 py-2">물품 추가</button></div><div class="space-y-3">${items.map((item) => `<article class="rounded-3xl border p-4 flex flex-col md:flex-row md:items-center gap-3"><div class="flex-1"><h3 class="text-xl font-black">${escapeHtml(item.name || '상점 물품')}</h3><p class="text-sm text-slate-500">${escapeHtml(item.description || '')}</p><strong class="text-amber-600">${money(item.price)}</strong></div><div class="flex flex-wrap gap-2"><button type="button" class="btn-primary px-3 py-2" data-distribute-item="${escapeHtml(item.id)}">배부</button><button type="button" class="btn-outline px-3 py-2" data-edit-item="${escapeHtml(item.id)}">수정</button><button type="button" class="btn-outline px-3 py-2 text-red-500" data-delete-item="${escapeHtml(item.id)}">삭제</button></div></article>`).join('') || '<p class="text-slate-400 text-center py-8">등록한 물품이 없습니다.</p>'}</div>`);
    modal.querySelector('#math-shop-add')?.addEventListener('click', () => openShopItemEditor());
    modal.querySelectorAll('[data-edit-item]').forEach((button) => button.addEventListener('click', () => openShopItemEditor(button.dataset.editItem)));
    modal.querySelectorAll('[data-delete-item]').forEach((button) => button.addEventListener('click', () => { void deleteShopItem(button.dataset.deleteItem); }));
    modal.querySelectorAll('[data-distribute-item]').forEach((button) => button.addEventListener('click', () => { void openShopDistribution(button.dataset.distributeItem); }));
}

async function openAiedueMathShop() {
    try {
        await ready();
        if (roleOf() === 'teacher') await openTeacherShop();
        else await openStudentShop();
    } catch (error) {
        notify(error.message || '상점을 불러오지 못했습니다.');
    }
}

function openShopItemEditor(itemId = '') {
    const item = itemId ? shopItems.get(itemId) : null;
    const modal = openServiceModal(itemId ? '상점 물품 수정' : '상점 물품 추가', `<form id="math-shop-editor" class="space-y-3"><input id="math-shop-name" class="premium-input w-full" placeholder="물품 이름" value="${escapeHtml(item?.name || '')}" required><input id="math-shop-price" type="number" min="0" class="premium-input w-full" placeholder="가격" value="${asNonNegativeInteger(item?.price)}" required><input id="math-shop-image" class="premium-input w-full" placeholder="https 이미지 URL" value="${escapeHtml(item?.imageUrl || '')}"><textarea id="math-shop-description" class="premium-input w-full min-h-28" placeholder="설명">${escapeHtml(item?.description || '')}</textarea><button type="submit" class="btn-primary w-full py-3">저장</button></form>`);
    modal.querySelector('#math-shop-editor').addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            await saveShopItem(itemId, {
                name: modal.querySelector('#math-shop-name').value.trim(),
                price: modal.querySelector('#math-shop-price').value,
                imageUrl: modal.querySelector('#math-shop-image').value.trim(),
                description: modal.querySelector('#math-shop-description').value.trim()
            });
            await openTeacherShop();
        } catch (error) { notify(error.message || '물품을 저장하지 못했습니다.'); }
    });
}

async function saveShopItem(itemId = '', input = {}) {
    await ready();
    const teacherId = requireTeacher();
    const payload = {
        name: String(input.name || '').trim() || '상점 물품',
        price: asNonNegativeInteger(input.price, 0),
        imageUrl: safeImageSource(input.imageUrl) || '',
        description: String(input.description || '').trim(),
        teacherId,
        teacherName: state.profile?.name || '선생님',
        updatedAt: serverTimestamp()
    };
    if (itemId) {
        await setDoc(doc(db, 'shopItems', itemId), payload, { merge: true });
        return itemId;
    }
    const reference = await addDoc(collection(db, 'shopItems'), { ...payload, createdAt: serverTimestamp() });
    return reference.id;
}

async function deleteShopItem(itemId) {
    await ready();
    requireTeacher();
    if (typeof window.confirm === 'function' && !window.confirm('이 상점 물품을 삭제할까요?')) return false;
    await deleteDoc(doc(db, 'shopItems', itemId));
    try {
        const snapshot = await getDocs(query(collectionGroup(db, 'assignedShopItems'), where('itemId', '==', itemId)));
        await Promise.allSettled(snapshot.docs.map((item) => deleteDoc(item.ref)));
    } catch (error) {
        console.warn('Math assigned shop cleanup failed', error);
    }
    await openTeacherShop();
    return true;
}

async function openShopDistribution(itemId) {
    const item = shopItems.get(itemId);
    if (!item) return notify('상점 물품을 찾을 수 없습니다.');
    const students = await loadClassStudents();
    const modal = openServiceModal('학생별 물품 배부', `<p class="font-black text-amber-600 mb-3">${escapeHtml(item.name || '상점 물품')}</p><div class="max-h-[55vh] overflow-auto space-y-2">${students.map((student) => `<label class="flex items-center justify-between rounded-2xl bg-slate-50 p-3"><span>${escapeHtml(student.name || student.id)} <small>${escapeHtml(student.userCode || '')}</small></span><input type="checkbox" data-shop-student value="${escapeHtml(student.id)}"></label>`).join('') || '<p>학급 학생이 없습니다.</p>'}</div><button type="button" id="math-shop-distribute" class="btn-primary w-full py-3 mt-4">선택 학생에게 배부</button>`);
    modal.querySelector('#math-shop-distribute')?.addEventListener('click', async () => {
        const ids = [...modal.querySelectorAll('[data-shop-student]:checked')].map((input) => input.value);
        if (!ids.length) return notify('배부할 학생을 선택해 주세요.');
        try { await distributeShopItem(itemId, ids); notify(`${ids.length}명에게 물품을 배부했습니다.`); await openTeacherShop(); }
        catch (error) { notify(error.message || '물품을 배부하지 못했습니다.'); }
    });
}

async function distributeShopItem(itemId, studentIds = []) {
    await ready();
    const teacherId = requireTeacher();
    const item = shopItems.get(itemId) || normalizeDocument(await getDoc(doc(db, 'shopItems', itemId)));
    if (!item) throw new Error('상점 물품을 찾을 수 없습니다.');
    const allowedStudents = new Set((await loadClassStudents()).map((student) => student.id));
    const targets = [...new Set(studentIds)].filter((id) => allowedStudents.has(id));
    if (!targets.length) throw new Error('배부할 학급 학생이 없습니다.');
    await Promise.all(targets.map((studentId) => setDoc(doc(db, 'users', studentId, 'assignedShopItems', itemId), {
        itemId,
        itemName: item.name || '상점 물품',
        name: item.name || '상점 물품',
        description: item.description || '',
        price: asNonNegativeInteger(item.price),
        imageUrl: item.imageUrl || '',
        teacherId,
        teacherName: state.profile?.name || '선생님',
        assignedAt: serverTimestamp()
    }, { merge: true })));
    return targets;
}

async function confirmShopPurchase(itemId) {
    const item = shopItems.get(itemId);
    if (!item) return notify('상점 물품을 찾을 수 없습니다.');
    const price = shopPrice(item);
    const modal = openServiceModal('구매 확인', `<p><strong>${escapeHtml(item.name || '상점 물품')}</strong>을(를) <strong class="text-amber-600">${money(price.adjustedPrice)}</strong>에 구매할까요?</p>${price.multiplier > 1 ? `<p class="text-red-500 mt-2">주의 토큰 ${price.warningTokenCount}개로 가격이 ${price.multiplier}배입니다.</p>` : ''}<button type="button" id="math-shop-purchase" class="btn-primary w-full py-3 mt-5">구매하기</button>`);
    modal.querySelector('#math-shop-purchase')?.addEventListener('click', async () => {
        try { await purchaseShopItem(itemId); notify('구매가 완료됐습니다.'); await openStudentShop(); }
        catch (error) { notify(error.message || '구매하지 못했습니다.'); }
    });
}

async function purchaseShopItem(itemId) {
    await ready();
    const uid = requireUid();
    if (roleOf() === 'teacher') throw new Error('학생 계정에서 구매해 주세요.');
    const userRef = doc(db, 'users', uid);
    const itemRef = doc(db, 'shopItems', itemId);
    const assignmentRef = doc(db, 'users', uid, 'assignedShopItems', itemId);
    const logRef = doc(collection(db, 'purchaseLog'));
    const result = await runTransaction(db, async (transaction) => {
        const userSnapshot = await transaction.get(userRef);
        const itemSnapshot = await transaction.get(itemRef);
        const assignmentSnapshot = await transaction.get(assignmentRef);
        if (!userSnapshot.exists()) throw new Error('사용자 프로필을 찾을 수 없습니다.');
        if (!itemSnapshot.exists() || !assignmentSnapshot.exists()) throw new Error('배부된 상점 물품을 찾을 수 없습니다.');
        const profile = userSnapshot.data() || {};
        const item = itemSnapshot.data() || {};
        const price = shopPrice(item, profile);
        const wallet = normalizeWallet(profile);
        if (wallet.balance < price.adjustedPrice) throw new Error('포인트가 부족합니다.');
        const balance = wallet.balance - price.adjustedPrice;
        const updates = { balance, coins: balance, aeduTokens: balance, updatedAt: serverTimestamp() };
        transaction.set(userRef, updates, { merge: true });
        transaction.set(logRef, {
            studentId: uid,
            studentName: profile.name || '학생',
            userCode: profile.userCode || profile.code || null,
            itemId,
            itemName: item.name || '상점 물품',
            price: price.adjustedPrice,
            basePrice: price.basePrice,
            warningTokenCount: price.warningTokenCount,
            priceMultiplier: price.multiplier,
            teacherId: item.teacherId || assignmentSnapshot.data().teacherId || profile.teacherId || null,
            teacherName: item.teacherName || assignmentSnapshot.data().teacherName || '',
            source: 'aiedue-math',
            purchasedAt: serverTimestamp()
        });
        return updates;
    });
    state.profile = { ...(state.profile || {}), ...result };
    renderSharedProfile(state.profile);
    return result;
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    const input = document.getElementById('settings-name-input');
    if (input) input.value = state.profile?.name || '';
    modal?.classList.remove('hidden');
    return Boolean(modal);
}

function closeSettingsModal() {
    document.getElementById('settings-modal')?.classList.add('hidden');
}

async function saveSettings() {
    try {
        await ready();
        const name = document.getElementById('settings-name-input')?.value.trim();
        if (!name) return notify('이름을 입력해 주세요.');
        await setDoc(doc(db, 'users', state.uid), { name, updatedAt: serverTimestamp() }, { merge: true });
        state.profile = { ...(state.profile || {}), name };
        renderSharedProfile(state.profile);
        closeSettingsModal();
        notify('설정이 저장되었습니다.');
    } catch (error) { notify(error.message || '설정을 저장하지 못했습니다.'); }
}

function openIconModal() {
    const modal = document.getElementById('icon-modal');
    const grid = document.getElementById('icon-grid');
    if (grid) {
        grid.innerHTML = USER_ICONS.map((icon) => `<button type="button" class="w-20 h-20 bg-slate-50 rounded-2xl text-4xl" data-math-icon="${icon}">${icon}</button>`).join('');
        grid.querySelectorAll('[data-math-icon]').forEach((button) => button.addEventListener('click', () => { void selectIcon(button.dataset.mathIcon); }));
    }
    modal?.classList.remove('hidden');
    return Boolean(modal);
}

function closeIconModal() {
    document.getElementById('icon-modal')?.classList.add('hidden');
}

async function selectIcon(icon) {
    try {
        await ready();
        if (!USER_ICONS.includes(icon)) throw new Error('선택할 수 없는 아이콘입니다.');
        await setDoc(doc(db, 'users', state.uid), { icon, updatedAt: serverTimestamp() }, { merge: true });
        state.profile = { ...(state.profile || {}), icon };
        renderSharedProfile(state.profile);
        closeIconModal();
    } catch (error) { notify(error.message || '아이콘을 저장하지 못했습니다.'); }
}

const dataApi = {
    ready,
    loadProgress,
    recordAttempt,
    loadStudentRecords,
    loadTodayReview,
    loadClassReport,
    assignConcept,
    removeAssignment,
    openAiedueMathShop,
    get uid() { return state.uid; },
    get profile() { return state.profile; }
};

window.aiedueMathData = dataApi;
window.openMathRecords = openMathRecords;
window.openAiedueMathRecords = openMathRecords;
window.openMathReview = openMathReview;
window.openMathTodayReview = openMathReview;
window.openAiedueMathReview = openMathReview;
window.openAiedueMathTodayReview = openMathReview;
window.openMathClass = openMathClass;
window.openMathClassManagement = openMathClass;
window.openAiedueMathClass = openMathClass;
window.openMathStudentReport = openMathStudentReport;
window.assignAiedueMathConcept = assignConcept;
window.deleteAiedueMathAssignment = removeAssignment;
window.openAiedueMathShop = openAiedueMathShop;
window.openAiedueMathShopItemEditor = openShopItemEditor;
window.saveAiedueMathShopItem = saveShopItem;
window.deleteAiedueMathShopItem = deleteShopItem;
window.openAiedueMathShopDistribution = openShopDistribution;
window.distributeAiedueMathShopItem = distributeShopItem;
window.purchaseAiedueMathShopItem = purchaseShopItem;
window.closeAiedueMathServiceModal = closeServiceModal;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.openIconModal = openIconModal;
window.closeIconModal = closeIconModal;
window.selectIcon = selectIcon;
window.toggleRpgHudPanel = toggleRpgHudPanel;
