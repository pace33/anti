import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    createUserWithEmailAndPassword,
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    doc,
    getDoc,
    getFirestore,
    runTransaction,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let inputPassword = '';
let loginSuccess = false;
let currentUserId = null;
let currentUserData = null;
let lastModalTrigger = null;

const topLevelSectionIds = ['start-screen', 'login-section', 'dashboard-section', 'math-activities-section', 'time-quiz-section'];
const TIME_QUIZ_DIFFICULTIES = ['easy', 'middle', 'hard', 'very-hard'];
const TIME_QUIZ_DIFFICULTY_LABELS = { easy: '쉬움', middle: '보통', hard: '어려움', 'very-hard': '매우 어려움' };
const TIME_QUIZ_EXP_REWARDS = { easy: 1, middle: 3, hard: 5, 'very-hard': 10 };
const MATH_LEVEL_EXP_REQUIRED = 100;
const MATH_LEVEL_UP_COINS = 1000;
const timeQuizState = {
    difficulty: 'easy',
    consecutiveWrong: 0,
    lockUntil: 0,
    correctAnswer: { hour: 12, minute: 0 },
    selectedAnswer: null,
    attemptsLeft: 3,
    isLocked: false,
    lastCompletionAt: ''
};

function showTopLevelSection(sectionId) {
    topLevelSectionIds.forEach((id) => {
        const section = document.getElementById(id);
        if (!section) return;
        const visible = id === sectionId;
        section.classList.toggle('hidden', !visible);
        section.style.display = visible ? 'flex' : 'none';
        section.style.zIndex = visible ? '20' : '';
    });
    setRpgHudVisible(Boolean(currentUserId) && !['start-screen', 'login-section'].includes(sectionId));
    if (sectionId === 'time-quiz-section') {
        window.requestAnimationFrame(renderTimeQuizClock);
    }
}

function setRpgHudVisible(isVisible) {
    const hud = document.getElementById('aiedue-rpg-hud');
    hud?.classList.toggle('hidden', !isVisible);
    document.body.classList.toggle('rpg-hud-active', isVisible);
    if (!isVisible && hud) closeRpgTray();
}

function closeRpgTray() {
    const hud = document.getElementById('aiedue-rpg-hud');
    const tray = document.getElementById('rpg-action-tray');
    const button = hud?.querySelector('.rpg-expand-button');
    hud?.classList.remove('actions-open');
    button?.setAttribute('aria-expanded', 'false');
    button?.setAttribute('aria-label', '하단 메뉴 펼치기');
    tray?.setAttribute('aria-hidden', 'true');
    if (tray) tray.inert = true;
}

window.toggleRpgHudActions = function toggleRpgHudActions(button) {
    const hud = document.getElementById('aiedue-rpg-hud');
    const tray = document.getElementById('rpg-action-tray');
    if (!hud || !tray) return;
    const isOpen = hud.classList.toggle('actions-open');
    button?.setAttribute('aria-expanded', String(isOpen));
    button?.setAttribute('aria-label', isOpen ? '하단 메뉴 접기' : '하단 메뉴 펼치기');
    tray.setAttribute('aria-hidden', String(!isOpen));
    tray.inert = !isOpen;
};

window.showLoginFromStart = function showLoginFromStart() {
    showTopLevelSection('login-section');
};

window.openDashboard = function openDashboard() {
    showTopLevelSection('dashboard-section');
};

window.openMathActivities = function openMathActivities() {
    showTopLevelSection('math-activities-section');
};

window.openTimeQuiz = function openTimeQuiz() {
    showTopLevelSection('time-quiz-section');
    initializeTimeQuiz();
};

window.goBackFromRpgHud = function goBackFromRpgHud() {
    const visible = topLevelSectionIds.find((id) => {
        const section = document.getElementById(id);
        return section && !section.classList.contains('hidden') && section.style.display !== 'none';
    });
    if (visible === 'time-quiz-section') {
        openMathActivities();
        return;
    }
    if (visible === 'math-activities-section') {
        openDashboard();
        return;
    }
    openDashboard();
};

window.toggleInfoDrawer = function toggleInfoDrawer() {
    document.getElementById('info-drawer')?.classList.toggle('open');
    document.getElementById('drawer-overlay')?.classList.toggle('visible');
};

window.toggleMute = function toggleMute() {
    const music = document.getElementById('bg-music');
    const muted = !music.muted;
    music.muted = muted;
    document.querySelectorAll('#mute-icon, .mute-icon-span').forEach((el) => {
        el.textContent = muted ? '🔇' : '🔊';
    });
    if (!muted) music.play().catch(() => undefined);
};

window.switchLoginView = function switchLoginView(type) {
    const isTeacher = type === 'teacher';
    document.getElementById('student-login-view')?.classList.toggle('hidden', isTeacher);
    document.getElementById('teacher-login-view')?.classList.toggle('hidden', !isTeacher);
    document.getElementById('student-tab-btn')?.classList.toggle('active', !isTeacher);
    document.getElementById('teacher-tab-btn')?.classList.toggle('active', isTeacher);
};

window.addNumber = function addNumber(number) {
    if (inputPassword.length >= 8) return;
    inputPassword += String(number);
    document.getElementById('password-display').textContent = inputPassword;
};

window.backspace = function backspace() {
    inputPassword = inputPassword.slice(0, -1);
    document.getElementById('password-display').textContent = inputPassword;
};

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function showModal(message, options = {}) {
    const modal = document.getElementById('result-modal');
    const messageEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const icon = document.getElementById('modal-icon');
    lastModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    messageEl.innerHTML = message;
    confirmBtn.classList.toggle('hidden', Boolean(options.hideConfirm));
    icon.classList.toggle('hidden', Boolean(options.hideIcon));
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
}

window.showModal = showModal;

window.handleModalConfirm = function handleModalConfirm() {
    const modal = document.getElementById('result-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.getElementById('modal-confirm-btn')?.classList.remove('hidden');
    document.getElementById('modal-icon')?.classList.remove('hidden');
    if (lastModalTrigger?.isConnected) lastModalTrigger.focus();
    lastModalTrigger = null;
    if (loginSuccess && !currentUserId && auth.currentUser) return;
};

async function ensureTeacherProfile(user, fallbackName = '') {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const data = snap.data() || {};
        if ((data.role || '').toLowerCase() !== 'teacher') {
            await signOut(auth);
            throw new Error('teacher-account-required');
        }
        return { id: snap.id, ...data };
    }
    const profile = {
        uid: user.uid,
        name: fallbackName || user.displayName || '선생님',
        email: user.email || '',
        role: 'teacher',
        userCode: null,
        coins: 0,
        balance: 0,
        aeduExperience: 0,
        aeduLevel: 1,
        warningTokens: 0,
        createdAt: serverTimestamp()
    };
    await setDoc(ref, profile, { merge: true });
    return profile;
}

window.checkStudentLogin = async function checkStudentLogin() {
    const normalizedCode = inputPassword.trim();
    if (!normalizedCode || !/^\d+$/.test(normalizedCode)) {
        showModal('유효한 로그인 번호를 입력해주세요.');
        return;
    }
    const codeAsInt = parseInt(normalizedCode, 10);
    try {
        await signInWithEmailAndPassword(auth, `${codeAsInt}@abc.com`, `${codeAsInt}qwerty`);
    } catch (error) {
        console.error('Student login error:', error);
        inputPassword = '';
        document.getElementById('password-display').textContent = '';
        showModal('로그인 번호가 올바르지 않거나 해당 학생을 찾을 수 없어요.<br>다시 한 번 해봐요!');
    }
};

window.checkTeacherLogin = async function checkTeacherLogin() {
    const email = document.getElementById('teacher-email').value.trim();
    const pw = document.getElementById('teacher-pw').value;
    if (!email || !pw) {
        showModal('이메일과 비밀번호를 써주세요.');
        return;
    }
    try {
        const credential = await signInWithEmailAndPassword(auth, email, pw);
        await ensureTeacherProfile(credential.user);
    } catch (error) {
        console.error('Teacher login error:', error);
        showModal(error.message === 'teacher-account-required' ? '교사 계정만 로그인할 수 있어요.' : '이메일 또는 비밀번호가 올바르지 않아요.');
    }
};

window.checkTeacherGoogleLogin = async function checkTeacherGoogleLogin() {
    try {
        const credential = await signInWithPopup(auth, new GoogleAuthProvider());
        await ensureTeacherProfile(credential.user);
    } catch (error) {
        console.error('Teacher google login error:', error);
        showModal(error.message === 'teacher-account-required' ? '교사 계정만 로그인할 수 있어요.' : 'Google 로그인 중 오류가 발생했어요. 다시 시도해주세요.');
    }
};

const TEST_LOGIN_ACCOUNTS = {
    student: { email: '9001@abc.com', password: '9001qwerty', name: '학생 테스트', role: 'student', userCode: 9001 },
    teacher: { email: 'teacher9001@abc.com', password: 'teacher9001qwerty', name: '교사 테스트', role: 'teacher', userCode: null }
};

function buildTestUserProfile(user, account) {
    return {
        uid: user.uid,
        name: account.name,
        email: account.email,
        userCode: account.userCode,
        role: account.role,
        coins: 0,
        balance: 0,
        aeduExperience: 0,
        aeduLevel: 1,
        warningTokens: 0,
        testAccount: true,
        updatedAt: serverTimestamp()
    };
}

async function signInOrCreateTestAccount(account) {
    let credential;
    try {
        credential = await signInWithEmailAndPassword(auth, account.email, account.password);
    } catch (error) {
        const canCreate = error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential';
        if (!canCreate) throw error;
        credential = await createUserWithEmailAndPassword(auth, account.email, account.password);
    }
    const profile = buildTestUserProfile(credential.user, account);
    await setDoc(doc(db, 'users', credential.user.uid), profile, { merge: true });
    return profile;
}

window.testLoginStudent = async function testLoginStudent() {
    try {
        inputPassword = '';
        document.getElementById('password-display').textContent = '';
        await signInOrCreateTestAccount(TEST_LOGIN_ACCOUNTS.student);
    } catch (error) {
        console.error('Test student login error:', error);
        showModal('학생 테스트 계정을 준비하거나 로그인하는 중 오류가 발생했습니다.');
    }
};

window.testLoginTeacher = async function testLoginTeacher() {
    try {
        await signInOrCreateTestAccount(TEST_LOGIN_ACCOUNTS.teacher);
    } catch (error) {
        console.error('Test teacher login error:', error);
        showModal('교사 테스트 계정을 준비하거나 로그인하는 중 오류가 발생했습니다.');
    }
};

window.handleLogout = async function handleLogout() {
    await signOut(auth);
    currentUserId = null;
    currentUserData = null;
    loginSuccess = false;
    document.getElementById('info-drawer')?.classList.remove('open');
    document.getElementById('drawer-overlay')?.classList.remove('visible');
    setRpgHudVisible(false);
    showTopLevelSection('login-section');
    inputPassword = '';
    document.getElementById('password-display').textContent = '';
    switchLoginView('student');
};

window.openStudentSignupModal = function openStudentSignupModal() {
    document.getElementById('student-signup-name').value = '';
    document.getElementById('student-signup-modal').classList.remove('hidden');
    document.getElementById('student-signup-modal').style.display = 'flex';
};

window.closeStudentSignupModal = function closeStudentSignupModal() {
    document.getElementById('student-signup-modal').classList.add('hidden');
    document.getElementById('student-signup-modal').style.display = 'none';
};

window.openTeacherSignupModal = function openTeacherSignupModal() {
    document.getElementById('teacher-signup-modal').classList.remove('hidden');
    document.getElementById('teacher-signup-modal').style.display = 'flex';
};

window.closeTeacherSignupModal = function closeTeacherSignupModal() {
    document.getElementById('teacher-signup-modal').classList.add('hidden');
    document.getElementById('teacher-signup-modal').style.display = 'none';
};

window.createStudentAccount = async function createStudentAccount() {
    const name = document.getElementById('student-signup-name').value.trim();
    if (!name) {
        showModal('이름을 입력해주세요.');
        return;
    }
    try {
        const counterRef = doc(db, 'metadata', 'counters');
        const newCode = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            const nextCode = counterDoc.exists() && counterDoc.data().lastUserCode ? counterDoc.data().lastUserCode + 1 : 1;
            transaction.set(counterRef, { lastUserCode: nextCode }, { merge: true });
            return nextCode;
        });
        const userCredential = await createUserWithEmailAndPassword(auth, `${newCode}@abc.com`, `${newCode}qwerty`);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            name,
            email: `${newCode}@abc.com`,
            userCode: newCode,
            role: 'student',
            coins: 0,
            balance: 0,
            aeduExperience: 0,
            aeduLevel: 1,
            warningTokens: 0,
            createdAt: serverTimestamp()
        }, { merge: true });
        await signOut(auth);
        closeStudentSignupModal();
        showModal(`계정이 만들어졌어요!<br><strong>${escapeHtml(name)}</strong> 학생의 로그인 번호는 <strong class="text-sky-600">${newCode}</strong> 입니다.`);
        inputPassword = '';
        document.getElementById('password-display').textContent = '';
    } catch (error) {
        console.error('Student sign-up error:', error);
        showModal('회원가입 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
};

window.createTeacherAccount = async function createTeacherAccount() {
    const name = document.getElementById('teacher-signup-name').value.trim();
    const email = document.getElementById('teacher-signup-email').value.trim();
    const password = document.getElementById('teacher-signup-pw').value;
    if (!name || !email || !password) {
        showModal('이름, 이메일, 비밀번호를 모두 입력해주세요.');
        return;
    }
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            name,
            email,
            role: 'teacher',
            userCode: null,
            coins: 0,
            balance: 0,
            aeduExperience: 0,
            aeduLevel: 1,
            warningTokens: 0,
            createdAt: serverTimestamp()
        }, { merge: true });
        await signOut(auth);
        closeTeacherSignupModal();
        showModal(`환영합니다, ${escapeHtml(name)} 선생님!<br>이제 로그인해서 사용해보세요.`);
    } catch (error) {
        console.error('Teacher sign-up error:', error);
        showModal(error.code === 'auth/email-already-in-use' ? '이미 사용 중인 이메일입니다. 다른 이메일을 사용해주세요.' : '선생님 회원가입 중 오류가 발생했어요.');
    }
};

function renderProfile(data = {}) {
    const name = data.name || data.displayName || auth.currentUser?.email || '이름 없음';
    const role = (data.role || '').toLowerCase() === 'teacher' ? '선생님' : '학생';
    const icon = data.icon || data.profileIcon || '🐻';
    const coins = Number(data.balance ?? data.coins ?? 0) || 0;
    const warningTokens = Number(data.warningTokens ?? 0) || 0;
    const level = Number(data.aeduLevel ?? data.level ?? 1) || 1;
    const exp = Math.max(0, Math.min(100, Math.floor(Number(data.aeduExperience ?? data.experience ?? 0) || 0)));
    document.querySelectorAll('.sync-account-name').forEach((el) => { el.textContent = name; });
    document.querySelectorAll('.sync-user-role').forEach((el) => { el.textContent = role; });
    document.querySelectorAll('.sync-user-icon').forEach((el) => { el.textContent = icon; });
    document.querySelectorAll('.sync-coins').forEach((el) => { el.textContent = String(coins); });
    document.querySelectorAll('.sync-warning-tokens').forEach((el) => { el.textContent = String(warningTokens); });
    document.querySelectorAll('.sync-aedu-level').forEach((el) => { el.textContent = String(level); });
    document.querySelectorAll('.sync-aedu-exp-percent').forEach((el) => { el.textContent = `${exp}%`; });
    document.querySelectorAll('.sync-aedu-exp-bar').forEach((el) => { el.style.width = `${exp}%`; });
    document.getElementById('dashboard-account-name').textContent = name;
    document.getElementById('dashboard-coins').textContent = String(coins);
    document.getElementById('user-role-badge').textContent = role;
    document.getElementById('user-icon-btn').textContent = icon;
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        currentUserId = null;
        currentUserData = null;
        setRpgHudVisible(false);
        return;
    }
    try {
        currentUserId = user.uid;
        const userRef = doc(db, 'users', user.uid);
        let userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
            if (user.providerData.some((provider) => provider.providerId === 'google.com')) {
                await ensureTeacherProfile(user);
                userSnap = await getDoc(userRef);
            } else {
                showModal('사용자 정보를 찾을 수 없습니다. 다시 시도해주세요.');
                return;
            }
        }
        currentUserData = { id: userSnap.id, ...userSnap.data() };
        renderProfile(currentUserData);
        loginSuccess = true;
        const startVisible = !document.getElementById('start-screen')?.classList.contains('hidden');
        const loginVisible = !document.getElementById('login-section')?.classList.contains('hidden');
        if (startVisible || loginVisible) openDashboard();
        else setRpgHudVisible(true);
    } catch (error) {
        console.error('Auth state handling error:', error);
        if (error.message !== 'teacher-account-required') showModal('로그인 정보를 불러오는 중 오류가 발생했어요.');
    }
});

function setTimeQuizDifficulty(difficulty) {
    if (!TIME_QUIZ_DIFFICULTIES.includes(difficulty)) return;
    timeQuizState.difficulty = difficulty;
    timeQuizState.selectedAnswer = null;
    timeQuizState.attemptsLeft = 3;
    updateTimeQuizDifficultyButtons();
    generateTimeQuizQuestion();
}

function updateTimeQuizDifficultyButtons() {
    document.querySelectorAll('.time-difficulty-btn').forEach((button) => {
        button.classList.toggle('active', button.dataset.difficulty === timeQuizState.difficulty);
    });
    document.getElementById('time-quiz-current-difficulty').textContent = TIME_QUIZ_DIFFICULTY_LABELS[timeQuizState.difficulty];
}

function initializeTimeQuiz() {
    if (initializeTimeQuiz.done) {
        renderTimeQuizClock();
        return;
    }
    initializeTimeQuiz.done = true;
    document.querySelectorAll('.time-difficulty-btn').forEach((button) => button.addEventListener('click', () => setTimeQuizDifficulty(button.dataset.difficulty)));
    document.getElementById('time-quiz-check-btn')?.addEventListener('click', checkTimeQuizAnswer);
    ['time-quiz-hour-input', 'time-quiz-minute-input'].forEach((id) => {
        document.getElementById(id)?.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') checkTimeQuizAnswer();
        });
    });
    window.addEventListener('resize', renderTimeQuizClock);
    updateTimeQuizDifficultyButtons();
    generateTimeQuizQuestion();
}

function generateTimeQuizQuestion() {
    const now = Date.now();
    const lockMessage = document.getElementById('time-quiz-lock-message');
    if (timeQuizState.lockUntil > now && timeQuizState.difficulty !== 'very-hard') {
        timeQuizState.isLocked = true;
        const remainSec = Math.ceil((timeQuizState.lockUntil - now) / 1000);
        lockMessage.classList.remove('hidden');
        lockMessage.textContent = `연속 3문제 오답! ${remainSec}초 후 다시 도전할 수 있어요.`;
        disableTimeQuizInputs(true);
        return;
    }
    timeQuizState.isLocked = false;
    lockMessage.classList.add('hidden');
    lockMessage.textContent = '';
    disableTimeQuizInputs(false);
    timeQuizState.correctAnswer = generateTimeByDifficulty(timeQuizState.difficulty);
    timeQuizState.selectedAnswer = null;
    if (timeQuizState.difficulty === 'very-hard') timeQuizState.attemptsLeft = 3;
    renderTimeQuizAnswerArea();
    renderTimeQuizClock();
    updateTimeQuizMeta();
    updateTimeQuizFeedback('');
}

function disableTimeQuizInputs(disabled) {
    document.getElementById('time-quiz-check-btn').disabled = disabled;
    document.querySelectorAll('#time-quiz-options button').forEach((button) => { button.disabled = disabled; });
    ['time-quiz-hour-input', 'time-quiz-minute-input'].forEach((id) => { document.getElementById(id).disabled = disabled; });
}

function generateTimeByDifficulty(difficulty) {
    const hour = Math.floor(Math.random() * 12) + 1;
    if (difficulty === 'easy') return { hour, minute: 0 };
    if (difficulty === 'middle') {
        const options = [0, 15, 30, 45];
        return { hour, minute: options[Math.floor(Math.random() * options.length)] };
    }
    return { hour, minute: Math.floor(Math.random() * 60) };
}

function renderTimeQuizAnswerArea() {
    const optionsWrap = document.getElementById('time-quiz-options');
    const inputWrap = document.getElementById('time-quiz-input-wrap');
    const hourInput = document.getElementById('time-quiz-hour-input');
    const minuteInput = document.getElementById('time-quiz-minute-input');
    optionsWrap.innerHTML = '';
    if (timeQuizState.difficulty === 'very-hard') {
        optionsWrap.hidden = true;
        inputWrap.classList.add('active');
        hourInput.value = '';
        minuteInput.value = '';
        hourInput.focus();
        return;
    }
    optionsWrap.hidden = false;
    inputWrap.classList.remove('active');
    buildTimeQuizOptions().forEach((option, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'time-option-btn';
        button.textContent = `${index + 1}. ${formatTimeQuizLabel(option.hour, option.minute)}`;
        button.dataset.hour = String(option.hour);
        button.dataset.minute = String(option.minute);
        button.addEventListener('click', () => {
            if (timeQuizState.isLocked) return;
            document.querySelectorAll('.time-option-btn').forEach((btn) => btn.classList.remove('selected'));
            button.classList.add('selected');
            timeQuizState.selectedAnswer = option;
        });
        optionsWrap.appendChild(button);
    });
}

function buildTimeQuizOptions() {
    const options = [timeQuizState.correctAnswer];
    while (options.length < 4) {
        const candidate = generateTimeByDifficulty(timeQuizState.difficulty);
        if (!options.some((opt) => opt.hour === candidate.hour && opt.minute === candidate.minute)) options.push(candidate);
    }
    return options.sort(() => Math.random() - 0.5);
}

function formatTimeQuizLabel(hour, minute) {
    return `${hour}시 ${minute}분`;
}

async function awardMathExperience(expAmount) {
    const safeExpAmount = Math.max(0, Math.floor(Number(expAmount) || 0));
    if (!currentUserId || safeExpAmount <= 0) {
        return { levelUps: 0, warningReduced: 0 };
    }

    const userRef = doc(db, 'users', currentUserId);
    const nextProfile = await runTransaction(db, async (transaction) => {
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다.');

        const data = userSnap.data() || {};
        const currentExp = Math.max(0, Math.floor(Number(data.aeduExperience ?? data.experience ?? 0) || 0));
        const currentLevel = Math.max(1, Math.floor(Number(data.aeduLevel ?? data.level ?? 1) || 1));
        const currentBalance = Math.max(0, Math.floor(Number(data.balance ?? data.coins ?? 0) || 0));
        const currentWarningTokens = Math.max(0, Math.floor(Number(data.warningTokens ?? 0) || 0));

        const totalExp = currentExp + safeExpAmount;
        const levelUps = Math.floor(totalExp / MATH_LEVEL_EXP_REQUIRED);
        const nextExp = totalExp % MATH_LEVEL_EXP_REQUIRED;
        const coinReward = levelUps * MATH_LEVEL_UP_COINS;
        const warningReduced = Math.min(currentWarningTokens, levelUps);
        const nextBalance = currentBalance + coinReward;

        const updates = {
            aeduExperience: nextExp,
            aeduLevel: currentLevel + levelUps,
            balance: nextBalance,
            coins: nextBalance,
            warningTokens: currentWarningTokens - warningReduced,
            updatedAt: serverTimestamp()
        };
        transaction.set(userRef, updates, { merge: true });

        return {
            ...data,
            ...updates,
            id: userSnap.id,
            levelUps,
            warningReduced
        };
    });

    currentUserData = nextProfile;
    renderProfile(currentUserData);
    return {
        levelUps: nextProfile.levelUps || 0,
        warningReduced: nextProfile.warningReduced || 0
    };
}

async function checkTimeQuizAnswer() {
    if (timeQuizState.isLocked) return;
    const correct = timeQuizState.correctAnswer;
    let isCorrect = false;
    if (timeQuizState.difficulty === 'very-hard') {
        const hour = parseInt(document.getElementById('time-quiz-hour-input').value, 10);
        const minute = parseInt(document.getElementById('time-quiz-minute-input').value, 10);
        if (Number.isNaN(hour) || Number.isNaN(minute)) {
            updateTimeQuizFeedback('시간과 분을 입력해주세요.', 'warn');
            return;
        }
        isCorrect = hour === correct.hour && minute === correct.minute;
    } else {
        if (!timeQuizState.selectedAnswer) {
            updateTimeQuizFeedback('답을 먼저 선택해주세요.', 'warn');
            return;
        }
        isCorrect = timeQuizState.selectedAnswer.hour === correct.hour && timeQuizState.selectedAnswer.minute === correct.minute;
    }
    if (isCorrect) {
        const expReward = TIME_QUIZ_EXP_REWARDS[timeQuizState.difficulty];
        let rewardResult = { levelUps: 0, warningReduced: 0 };
        try {
            rewardResult = await awardMathExperience(expReward);
        } catch (error) {
            console.error('Math time quiz experience award failed:', error);
            updateTimeQuizFeedback('정답입니다! 하지만 경험치 저장 중 오류가 발생했어요.', 'warn');
            return;
        }
        timeQuizState.consecutiveWrong = 0;
        if (rewardResult.levelUps > 0) {
            timeQuizState.lastCompletionAt = new Date().toISOString();
            updateTimeQuizFeedback(`정답입니다! 레벨업으로 ${MATH_LEVEL_UP_COINS.toLocaleString('ko-KR')}원 지급, 주의토큰 ${rewardResult.warningReduced}개 감소!`, 'ok');
        } else {
            updateTimeQuizFeedback(`정답입니다! 경험치 +${expReward}`, 'ok');
        }
        highlightTimeQuizOptions();
        window.setTimeout(generateTimeQuizQuestion, 700);
    } else {
        if (timeQuizState.difficulty === 'very-hard') {
            timeQuizState.attemptsLeft -= 1;
            updateTimeQuizMeta();
            if (timeQuizState.attemptsLeft > 0) {
                updateTimeQuizFeedback(`오답! 남은 기회: ${timeQuizState.attemptsLeft}`, 'warn');
                document.getElementById('time-quiz-hour-input').value = '';
                document.getElementById('time-quiz-minute-input').value = '';
                return;
            }
        }
        timeQuizState.consecutiveWrong += 1;
        updateTimeQuizFeedback(`오답! 정답은 ${formatTimeQuizLabel(correct.hour, correct.minute)} 입니다.`, 'error');
        highlightTimeQuizOptions();
        if (timeQuizState.consecutiveWrong >= 3 && timeQuizState.difficulty !== 'very-hard') {
            timeQuizState.lockUntil = Date.now() + 60 * 1000;
            const countdown = window.setInterval(() => {
                if (Date.now() >= timeQuizState.lockUntil) {
                    window.clearInterval(countdown);
                    timeQuizState.consecutiveWrong = 0;
                    timeQuizState.lockUntil = 0;
                    generateTimeQuizQuestion();
                    return;
                }
                generateTimeQuizQuestion();
            }, 1000);
            generateTimeQuizQuestion();
            return;
        }
        window.setTimeout(generateTimeQuizQuestion, 1000);
    }
    updateTimeQuizMeta();
}

function highlightTimeQuizOptions() {
    if (timeQuizState.difficulty === 'very-hard') return;
    const correct = timeQuizState.correctAnswer;
    document.querySelectorAll('.time-option-btn').forEach((button) => {
        const hour = parseInt(button.dataset.hour, 10);
        const minute = parseInt(button.dataset.minute, 10);
        if (hour === correct.hour && minute === correct.minute) button.classList.add('correct');
        else if (timeQuizState.selectedAnswer && hour === timeQuizState.selectedAnswer.hour && minute === timeQuizState.selectedAnswer.minute) button.classList.add('incorrect');
    });
}

function updateTimeQuizFeedback(message, tone = '') {
    const feedbackEl = document.getElementById('time-quiz-feedback');
    feedbackEl.textContent = message;
    feedbackEl.className = `math-feedback ${tone}`.trim();
}

function updateTimeQuizMeta() {
    document.getElementById('time-quiz-exp-reward').textContent = String(TIME_QUIZ_EXP_REWARDS[timeQuizState.difficulty]);
    document.getElementById('time-quiz-streak').textContent = String(timeQuizState.consecutiveWrong);
    document.getElementById('time-quiz-attempts').textContent = timeQuizState.difficulty === 'very-hard' ? String(timeQuizState.attemptsLeft) : '-';
    document.getElementById('time-quiz-last-completion').textContent = formatCompletionDateTime(timeQuizState.lastCompletionAt);
}

function formatCompletionDateTime(value) {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function renderTimeQuizClock() {
    const canvas = document.getElementById('time-quiz-canvas');
    if (!canvas) return;
    const container = canvas.parentElement;
    const size = Math.max(260, Math.min(container.clientWidth, container.clientHeight || container.clientWidth));
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const radius = size / 2;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(radius, radius);
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.9, 0, 2 * Math.PI);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = radius * 0.045;
    ctx.strokeStyle = '#1688cf';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.05, 0, 2 * Math.PI);
    ctx.fillStyle = '#1f3551';
    ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `900 ${radius * 0.14}px "Noto Sans KR", sans-serif`;
    for (let num = 1; num <= 12; num += 1) {
        const angle = num * Math.PI / 6;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -radius * 0.72);
        ctx.rotate(-angle);
        ctx.fillStyle = '#1f3551';
        ctx.fillText(String(num), 0, 0);
        ctx.restore();
    }
    ctx.font = `800 ${radius * 0.07}px "Noto Sans KR", sans-serif`;
    for (let minuteMark = 0; minuteMark < 60; minuteMark += 5) {
        const angle = minuteMark * Math.PI / 30;
        ctx.save();
        ctx.rotate(angle);
        ctx.translate(0, -radius * 0.96);
        ctx.rotate(-angle);
        ctx.fillStyle = '#6b8aa4';
        ctx.fillText(String(minuteMark), 0, 0);
        ctx.restore();
    }
    const hour = timeQuizState.correctAnswer.hour % 12;
    const minute = timeQuizState.correctAnswer.minute;
    drawTimeQuizHand(ctx, (hour * Math.PI / 6) + (minute * Math.PI / (6 * 60)), radius * 0.5, radius * 0.07, '#1f3551');
    drawTimeQuizHand(ctx, minute * Math.PI / 30, radius * 0.7, radius * 0.045, '#1688cf');
}

function drawTimeQuizHand(ctx, angle, length, width, color) {
    ctx.save();
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.rotate(angle);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -length);
    ctx.stroke();
    ctx.restore();
}

document.getElementById('result-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) window.handleModalConfirm();
});
document.getElementById('student-signup-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeStudentSignupModal();
});
document.getElementById('teacher-signup-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) closeTeacherSignupModal();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('result-modal')?.classList.contains('hidden')) window.handleModalConfirm();
});

initializeTimeQuiz();
