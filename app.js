// =========================================================================
// --- AIEDUE SCHOOL SHARED FIREBASE AUTH + FIRESTORE ENGINE ---
// 에이두 스쿨과 같은 Firebase 프로젝트/Auth/Firestore를 직접 사용합니다.
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    collection,
    collectionGroup,
    query,
    where,
    getDocs,
    limit as queryLimit,
    orderBy,
    runTransaction,
    serverTimestamp,
    arrayUnion,
    arrayRemove,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import {
    getStorage,
    ref as storageRef,
    uploadBytes,
    listAll,
    getMetadata,
    getDownloadURL,
    deleteObject
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";
import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/+esm";
import { PDFDocument } from "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
// =========================================================================

let currentView = 'student';
let inputPassword = "";
let loginSuccess = false;
let currentLearningStep = -1;
let unlockedLevels = [1];

function normalizeUnlockedLevels(value, role = currentUserRole) {
    if (String(role || '').toLowerCase() === 'teacher') return [1, 2, 3, 4];
    if (!Array.isArray(value)) return [1];
    return Array.from(new Set(value.map(Number).filter((level) => Number.isInteger(level) && level >= 1 && level <= 4))).sort((a, b) => a - b);
}

const activityRoutes = {
    drawing: { level: 1, sectionId: 'drawing-activities-section', page: 'drawing.html', label: '그리기' },
    hangul: { level: 2, sectionId: 'hangul-activities-section', page: 'hangul.html', label: '한글 해득' },
    dictation: { level: 3, sectionId: 'dictation-activities-section', page: 'dictation.html', label: '교과 맞춤쓰기' },
    literacy: { level: 4, sectionId: 'literacy-activities-section', page: 'literacy.html', label: '문해력' }
};

function getActivityRouteFromLocation() {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('activity');
    if (activityRoutes[route]) return route;

    const pathName = (window.location.pathname || '').split('/').pop();
    const pathRoute = Object.entries(activityRoutes).find(([, config]) => config.page === pathName);
    return pathRoute ? pathRoute[0] : null;
}

let pendingActivityRoute = getActivityRouteFromLocation();

function showActivityLoading(message = '로딩중...') {
    const overlay = document.getElementById('activity-loading-overlay');
    if (!overlay) return;
    const text = overlay.querySelector('.activity-loading-text');
    if (text) text.innerText = message;
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-busy', 'true');
}

function hideActivityLoading() {
    const overlay = document.getElementById('activity-loading-overlay');
    if (!overlay) return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-busy', 'false');
}

function getVisibleActivityRoute() {
    return Object.entries(activityRoutes).find(([, route]) => {
        const section = document.getElementById(route.sectionId);
        return section && !section.classList.contains('hidden');
    })?.[0] || null;
}

function hydrateActivityRouteSection(activityKey) {
    if (activityKey === 'drawing') {
        updateDrawingDashboardPreview();
    } else if (activityKey === 'hangul') {
        updateTodayKoreanPreview();
    } else if (activityKey === 'dictation') {
        updateDictationDashboardPreview();
    } else if (activityKey === 'literacy') {
        updateLiteracyDashboardPreview();
    }

    updateSyncedActivityHeaders({ name: currentUserName, coins: currentUserCoins, icon: currentUserIcon });
}

window.openActivityPage = function openActivityPage(activityKey) {
    const route = activityRoutes[activityKey];
    if (!route) return;
    pendingActivityRoute = activityKey;
    // 버튼 클릭은 중간 HTML로 이동하지 않고 현재 앱 안에서 바로 전환한다.
    // 그래야 에이두 한글 시작화면이 짧게 깜빡이지 않는다.
    showActivityLoading();
    window.setTimeout(() => {
        const opened = openActivityRoute(activityKey, { pushUrl: true, allowBeforeLogin: true });
        if (opened) {
            window.setTimeout(hideActivityLoading, 160);
        } else {
            hideActivityLoading();
        }
    }, 120);
}

function openActivityRoute(activityKey, options = {}) {
    const route = activityRoutes[activityKey];
    if (!route) return false;
    if (!loginSuccess && !options.allowBeforeLogin) return false;

    if (!unlockedLevels.includes(route.level)) {
        pendingActivityRoute = null;
        showModal(`${route.label}은 선생님이 아직 열어주지 않았어요.`);
        return false;
    }

    showTopLevelSection(route.sectionId);
    document.getElementById('main-container').style.maxWidth = '1100px';
    hydrateActivityRouteSection(activityKey);

    if (options.replaceUrl && window.history?.replaceState) {
        window.history.replaceState(null, '', route.page);
    } else if (options.pushUrl && window.history?.pushState) {
        window.history.pushState(null, '', route.page);
    }

    return true;
}

function openPendingActivityRoute() {
    if (!pendingActivityRoute || !loginSuccess) return false;
    const opened = openActivityRoute(pendingActivityRoute, { replaceUrl: true });
    if (opened) pendingActivityRoute = null;
    return opened;
}

window.addEventListener('popstate', () => {
    const routeFromUrl = getActivityRouteFromLocation();
    if (routeFromUrl) {
        if (loginSuccess) {
            openActivityRoute(routeFromUrl);
        } else {
            pendingActivityRoute = routeFromUrl;
        }
    }
});

let activeUnitKey = 'vowel';
let currentUserId = null;
let currentUserName = '이름 없음';
let currentUserIcon = '🐻';
let currentUserCoins = 0;
let currentUserBalance = 0;
let currentUserAeduTokens = 0;
let currentUserWarningTokens = 0;
let currentUserAeduExperience = 0;
let currentUserAeduLevel = 1;
let currentUserProfileSnapshot = {};
let currentUserProfileUnsubscribe = null;
let lastSyncedProfileUid = null;
const aiedueKoreanShopItemsCache = new Map();
let currentUnderstandingStep = 1;
let currentLearningActivityStep = null;
let currentLearningDetailSectionIndex = 0;
let currentUserRole = 'student';
let currentUserDrawingStep = -1;
let drawingPortfolio = { missions: {}, free: [], unlockedTemplates: [], rewardedMilestones: [], shapeStats: {}, unpaidCooldownUntil: 0 };
let drawingWorkspaceMode = 'free';
let drawingWorkspaceMissionStep = null;
let drawingCanvasInitialized = false;
let currentUserDictationStep = -1;
let dictationPortfolio = { missions: {}, aiWords: [], koreanBank: { words: [] }, wrongBank: [], completedBank: [], captures: [], dictationLocked: true, hasCompletedOnce: false };
let activeDictationItem = null;
let activeDictationSession = null;
let activeDictationCameraStream = null;
let activeWordBankCameraStream = null;
let pendingWordBankCameraReward = null;
let activeDictationPhotoFile = null;
let activeDictationPhotoDataUrl = '';
let activeDictationImageAnalysis = '';
let activeSpellingQuestion = null;
let literacyPortfolio = { history: [], stats: { "easy-multipleChoice": { attempts: 0, corrects: 0, wrongs: 0 } } };
let activeLiteracyQuestion = null;
let isLiteracyLimitBreakMode = false;
let userLiteracyAnswerChecked = false;

const KOREAN_ERROR_TYPES = {
    VOWEL: "vowel",
    CONSONANT: "consonant",
    COMPLEX_VOWEL: "complexVowel",
    BATCHIM: "batchim",
    BATCHIM_FAMILY: "batchimFamily",
    SYLLABLE: "syllable",
    MEANING_MATCH: "meaningMatch",
    NONSENSE_READ: "nonsenseRead",
    NO_RESPONSE: "noResponse"
};

const CHANCHAN_LESSONS = [
    {
        id: "start",
        unit: 1,
        title: "배움 시작: 모음과 자음",
        focus: ["모음", "자음"],
        activities: ["jamoSort", "listenAndFind", "writeOnCanvas"],
        letters: ["가", "머", "바", "나", "라"],
        description: "글자에서 모음과 자음을 찾아요."
    },
    {
        id: 1,
        unit: 1,
        title: "모음의 시작",
        focus: ["ㅡ", "ㅣ", "●"],
        activities: ["listenAndFind", "writeOnCanvas"],
        letters: ["ㅡ", "ㅣ"],
        description: "하늘, 땅, 사람에서 모음이 시작됨을 배워요."
    },
    {
        id: 2,
        unit: 1,
        title: "ㅏ, ㅓ 공부하기",
        focus: ["ㅏ", "ㅓ"],
        activities: ["listenAndFind", "writeOnCanvas"],
        letters: ["ㅏ", "ㅓ"],
        hints: {
            "ㅏ": "해가 바깥쪽에 있어 밝은 느낌이에요.",
            "ㅓ": "해가 안쪽에 있어 안으로 들어가는 느낌이에요."
        }
    },
    {
        id: 3,
        unit: 1,
        title: "ㅗ, ㅜ 공부하기",
        focus: ["ㅗ", "ㅜ"],
        activities: ["listenAndFind", "writeOnCanvas"],
        letters: ["ㅗ", "ㅜ"],
        hints: {
            "ㅗ": "해가 위에 있어 올라가는 느낌이에요.",
            "ㅜ": "해가 아래에 있어 내려가는 느낌이에요."
        }
    },
    {
        id: 13,
        unit: 3,
        title: "ㅏ, ㅣ 단어 공부하기",
        focus: ["ㅏ", "ㅣ"],
        activities: ["readThreeTimes", "fillOneJamo", "wordPictureMatch", "nonsenseWordRead", "writeOnCanvas"],
        words: ["아이", "아버지", "가수", "가지", "나무", "마차", "기타", "고기", "다리", "나비", "파리", "허리"],
        nonsenseWords: ["아으", "나모", "다미", "가리"],
        fillItems: [
            { word: "아이", prompt: "□이", answer: "아", hint: "처음 소리를 들어 봐요." },
            { word: "나무", prompt: "나□", answer: "무", hint: "마지막 글자를 들어 봐요." },
            { word: "다리", prompt: "다□", answer: "리", hint: "두 번째 글자를 들어 봐요." }
        ],
        pictureItems: [
            { word: "아이", icon: "👧" },
            { word: "아버지", icon: "👨‍👧" },
            { word: "가수", icon: "🎤" },
            { word: "가지", icon: "🍆" },
            { word: "나무", icon: "🌳" },
            { word: "마차", icon: "🐴" },
            { word: "기타", icon: "🎸" },
            { word: "고기", icon: "🥩" },
            { word: "다리", icon: "🦵" },
            { word: "나비", icon: "🦋" },
            { word: "파리", icon: "🪰" },
            { word: "허리", icon: "🧍" }
        ]
    },
    {
        id: 14,
        unit: 3,
        title: "ㅡ, ㅗ, ㅓ 단어 공부하기",
        focus: ["ㅡ", "ㅗ", "ㅓ"],
        activities: ["readThreeTimes", "fillOneJamo", "wordPictureMatch", "nonsenseWordRead", "writeOnCanvas"],
        words: ["버스", "치즈", "모기", "주스", "스키", "피아노", "포도", "소파", "꼬마", "소나무", "거미", "저고리"],
        nonsenseWords: ["버치", "키주", "카루", "두보"],
        fillItems: [
            { word: "버스", prompt: "버□", answer: "스", hint: "마지막 글자를 들어 봐요." },
            { word: "포도", prompt: "포□", answer: "도", hint: "두 번째 글자를 들어 봐요." },
            { word: "거미", prompt: "거□", answer: "미", hint: "마지막 글자를 들어 봐요." }
        ],
        pictureItems: [
            { word: "버스", icon: "🚌" },
            { word: "치즈", icon: "🧀" },
            { word: "모기", icon: "🦟" },
            { word: "주스", icon: "🧃" },
            { word: "스키", icon: "⛷️" },
            { word: "피아노", icon: "🎹" },
            { word: "포도", icon: "🍇" },
            { word: "소파", icon: "🛋️" },
            { word: "꼬마", icon: "🧒" },
            { word: "소나무", icon: "🌲" },
            { word: "거미", icon: "🕷️" },
            { word: "저고리", icon: "👘" }
        ]
    },
    {
        id: 20,
        unit: 5,
        title: "복잡한 모음 단어 공부하기",
        focus: ["ㅑ", "ㅕ", "ㅘ", "ㅝ", "ㅟ", "ㅢ", "ㅙ", "ㅚ"],
        activities: ["readThreeTimes", "fillOneJamo", "wordPictureMatch", "nonsenseWordRead", "writeOnCanvas"],
        words: ["해", "여우", "야구", "우표", "요리사", "우유", "새", "야채", "여자", "비녀", "소녀", "가야", "가요", "고요", "유도", "유리", "뉴스", "튜브", "의사", "의자", "바위", "거위", "과자", "교과서", "추위", "더위", "위치", "토의", "주의", "회의", "사과", "효과", "좌우", "화로", "왜가리", "돼지"],
        nonsenseWords: ["그배", "여구", "디야", "스바냐", "요자", "요우", "버유", "무사", "와토", "화지", "두과", "버위", "위치", "테추", "소의", "보녀", "주려", "고라", "오휴", "지외", "소아", "버즈", "구의", "바애"],
        fillItems: [
            { word: "야구", prompt: "ㅇ□", answer: "ㅑ", hint: "첫 글자의 모음을 완성해요." },
            { word: "의사", prompt: "ㅇ□", answer: "ㅢ", hint: "처음 소리를 들어 봐요." },
            { word: "여우", prompt: "ㅇ□", answer: "ㅕ", hint: "첫 글자의 모음을 완성해요." },
            { word: "과자", prompt: "ㄱ□", answer: "ㅘ", hint: "복잡한 모음 소리를 들어 봐요." },
            { word: "비녀", prompt: "ㅂ□", answer: "ㅣ", hint: "비녀의 첫 소리를 들어 봐요." },
            { word: "야채", prompt: "ㅇ□", answer: "ㅑ", hint: "야채의 첫 소리를 들어 봐요." }
        ],
        pictureItems: [
            { word: "해", icon: "☀️" },
            { word: "여우", icon: "🦊" },
            { word: "야구", icon: "⚾" },
            { word: "우표", icon: "📮" },
            { word: "요리사", icon: "🧑‍🍳" },
            { word: "우유", icon: "🥛" },
            { word: "의사", icon: "🧑‍⚕️" },
            { word: "의자", icon: "🪑" },
            { word: "바위", icon: "🪨" },
            { word: "거위", icon: "🪿" },
            { word: "과자", icon: "🍪" },
            { word: "교과서", icon: "📘" }
        ]
    },
    {
        id: 21,
        unit: 6,
        title: "ㅁ, ㅂ 받침",
        focus: ["ㅁ", "ㅂ"],
        activities: ["listenAndFind", "fillOneJamo", "writeOnCanvas"],
        words: ["곰", "감", "밤", "뱀", "솜", "힘", "밥", "입", "컵", "집", "답"],
        fillItems: [
            { word: "곰", prompt: "고□", answer: "ㅁ", hint: "입을 다물며 끝나는 소리예요." },
            { word: "밥", prompt: "바□", answer: "ㅂ", hint: "입술을 닫으며 끝나는 소리예요." }
        ]
    },
    {
        id: 26,
        unit: 7,
        title: "대표받침 단어 읽기",
        focus: ["ㅁ", "ㅂ", "ㅇ", "ㄱ", "ㄴ", "ㄹ", "ㄷ"],
        activities: ["readThreeTimes", "listenAndFind", "fillOneJamo", "wordGame"],
        words: ["염소", "감자", "구름", "수첩", "집게", "서랍", "강가", "야구공", "늑대", "국자", "축구공", "책상", "기린", "분수", "고릴라", "갈매기", "돋보기", "걷다"],
        rule: "그림과 소리를 함께 확인하고 7가지 대표받침이 들어간 단어를 정확하게 읽어요."
    },
    {
        id: 27,
        unit: 8,
        title: "ㅂ 받침가족",
        focus: ["ㅂ", "ㅍ"],
        activities: ["batchimFamily", "readThreeTimes"],
        words: ["입", "앞", "옆", "숲", "잎", "톱"],
        rule: "소리는 비슷하지만 글자는 달라요. 쓰기보다 읽기 중심으로 학습해요."
    },
    {
        id: 28,
        unit: 8,
        title: "ㄱ 받침가족",
        focus: ["ㄱ", "ㅋ", "ㄲ"],
        activities: ["batchimFamily", "readThreeTimes"],
        words: ["약", "떡", "밖", "부엌", "깎다", "볶다"],
        rule: "대표소리 /ㄱ/으로 읽어요."
    },
    {
        id: 29,
        unit: 8,
        title: "ㄷ 받침가족",
        focus: ["ㄷ", "ㅌ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅎ"],
        activities: ["batchimFamily", "readThreeTimes"],
        words: ["옷", "낮", "팥", "빛", "꽃", "좋다"],
        rule: "대표소리 /ㄷ/으로 읽어요."
    }
];

window.KOREAN_ERROR_TYPES = KOREAN_ERROR_TYPES;
window.CHANCHAN_LESSONS = CHANCHAN_LESSONS;

const chanchanLessonById = Object.fromEntries(CHANCHAN_LESSONS.map((lesson) => [String(lesson.id), lesson]));
let koreanActivityStartedAt = Date.now();
window.koreanAudioReplayCounts = {};
window.koreanRetryCounts = {};

const learningDetailData = {
    1: {
        title: '배움 1: 모음의 시작',
        subtitle: '땅, 사람, 둥근 해 모양에서 모음이 시작된다는 내용을 익혀요.',
        sections: [
            {
                label: '이해하기',
                title: '모음은 우리가 살고 있는 세상에서 시작해요.',
                cards: [
                    '땅은 옆으로 길게 펼쳐져 있어요. 땅의 모양에서 ㅡ가 태어났어요.',
                    '사람은 땅 위에 곧게 서 있어요. 서 있는 사람의 모양에서 ㅣ가 태어났어요.',
                    '해는 하늘에 둥글게 떠 있어요. 둥근 해의 모양에서 ●가 태어났어요.'
                ]
            },
            {
                label: '듣고 찾기',
                title: '소리를 듣고 기본 모양을 찾아요.',
                cards: [
                    '선생님이 말한 소리를 듣고 ㅡ, ㅣ, ● 중에서 알맞은 모양을 골라요.',
                    '땅, 사람, 둥근 해 모양을 보며 모음이 시작되는 원리를 익혀요.'
                ]
            },
            {
                label: '쓰기',
                title: '둥근 해, 땅, 사람 모양 따라 쓰기',
                cards: [
                    'ㅡ, ㅣ, ●를 크게 한 번씩 따라 써요.',
                    '쓰기 순서를 보며 땅, 사람, 둥근 해 모양을 천천히 써요.'
                ]
            }
        ]
    },
    2: {
        title: '배움 2: ㅏ, ㅓ 공부하기',
        subtitle: '듣기, 따라하기, 쓰기 순서로 익혀요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅏ, ㅓ',
                cards: [
                    'ㅣ+ㆍ→ㅏ',
                    'ㆍ+ㅣ→ㅓ'
                ]
            },
            {
                label: '비교하기',
                title: '듣고 찾기',
                cards: [
                    'ㅏ와 ㅓ 카드에서 선생님이 말한 글자를 골라요.'
                ]
            },
            {
                label: '따라하기 1 · 2',
                title: '동작 따라하기, 따라하며 읽기',
                cards: [
                    '몸 방향을 바꿔 ㅏ, ㅓ 모양을 표현해요.',
                    '그림을 보며 ㅏ, ㅓ를 소리 내어 반복해요.'
                ]
            },
            {
                label: '쓰기',
                title: '쓰면서 소리 내어 읽기',
                cards: [
                    '획순 번호와 화살표를 보며 ㅏ, ㅓ를 세 번씩 따라 쓰고, 완성한 글자를 읽어요.',
                    '공책 빈칸에 ㅏ/ㅓ 중 알맞은 모음을 골라 써요: ㄱ + __ = 가, ㄱ + __ = 거'
                ]
            },
            {
                label: '단어 예시',
                title: 'ㅏ와 ㅓ가 들어간 낱말 읽기',
                cards: [
                    'ㅏ 낱말: 가방, 바나나, 사자',
                    'ㅓ 낱말: 버섯, 거북, 저금통',
                    '활동: ㅏ가 들어간 낱말에는 동그라미, ㅓ가 들어간 낱말에는 밑줄을 그어요.'
                ]
            },
            {
                label: '확인 문제',
                title: '듣고 고르고, 빈칸을 채워요',
                cards: [
                    '고르기: “가” 소리가 나는 카드를 찾아요. 보기: 가방 / 거미 / 고기',
                    '빈칸: ㄴ + ㅏ = __, ㄴ + ㅓ = __',
                    '쓰기: 오늘 고른 낱말 하나를 공책에 따라 쓰고 소리 내어 읽어요.'
                ]
            }
        ]
    },
    3: {
        title: '배움 3: ㅗ, ㅜ 공부하기',
        subtitle: '위/아래 위치를 구분하며 읽고 써요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅗ, ㅜ',
                cards: [
                    'ㅡ+ㆍ→ㅗ',
                    'ㆍ+ㅡ→ㅜ'
                ]
            },
            {
                label: '비교하기',
                title: '듣고 찾기',
                cards: [
                    'ㅗ와 ㅜ 카드를 보고 들은 소리를 찾아요.'
                ]
            },
            {
                label: '따라하기 1 · 2',
                title: '동작 따라하기, 따라하며 읽기',
                cards: [
                    '팔의 위/아래 동작으로 ㅗ, ㅜ를 구분해요.',
                    '여섯 칸 활동에서 ㅗ, ㅜ를 번갈아 읽어요.'
                ]
            },
            {
                label: '쓰기 · 확인하기',
                title: '읽기, 듣고 찾기',
                cards: [
                    'ㅗ, ㅜ를 따라 쓰고 소리 내어 읽어요.',
                    '확인하기 1(읽기), 확인하기 2(듣고 찾기)로 마무리해요.'
                ]
            },
            {
                label: '단어 예시',
                title: 'ㅗ와 ㅜ가 들어간 낱말 읽기',
                cards: [
                    'ㅗ 낱말: 오리, 고리, 모자',
                    'ㅜ 낱말: 우산, 구름, 두부',
                    '활동: 낱말을 읽고 ㅗ/ㅜ 소리가 나는 글자를 찾아 색칠해요.'
                ]
            },
            {
                label: '쓰기 활동',
                title: '빈칸에 알맞은 모음을 써요',
                cards: [
                    '공책에 ㅗ와 ㅜ를 세 번씩 따라 쓰며 “오, 우”라고 읽어요.',
                    '빈칸: ㅇ + ㅗ = __, ㅇ + ㅜ = __',
                    '고르기: “우” 소리가 나는 낱말을 찾아요. 보기: 오리 / 우산 / 모자'
                ]
            }
        ]
    },
    4: {
        title: '배움 4: ㅡ, ㅣ 공부하기',
        subtitle: '기본 모음을 읽고 구분해요.',
        sections: [
            {
                label: '이해하기 1 · 2',
                title: 'ㅡ, ㅣ',
                cards: [
                    '사람(🧒)과 땅(🟫) 그림을 보고 ㅣ, ㅡ 기본 모양을 확인해요.',
                    '세로선(ㅣ)과 가로선(ㅡ)의 쓰기 방향을 함께 익혀요.'
                ]
            },
            {
                label: '비교하기',
                title: '듣고 찾기',
                cards: [
                    'ㅣ와 ㅡ 카드 중에서 들은 글자를 선택해요.'
                ]
            },
            {
                label: '따라하기 1 · 2',
                title: '동작 따라하기, 따라하며 읽기',
                cards: [
                    '서 있는 자세(ㅣ), 양팔을 편 자세(ㅡ)로 동작을 표현해요.',
                    '칸 활동에서 ㅣ, ㅡ를 반복해 읽어요.'
                ]
            },
            {
                label: '쓰기 · 확인하기',
                title: '읽기, 듣고 찾기',
                cards: [
                    'ㅣ, ㅡ를 따라 쓰며 읽어요.',
                    '확인하기 1(읽기), 확인하기 2(듣고 찾기) 활동을 해요.'
                ]
            }
        ]
    },
    5: {
        title: '배움 5: ㅑ, ㅕ 공부하기',
        subtitle: '오른쪽/왼쪽 짧은 선 두 개를 구분하며 읽고 써요.',
        sections: [
            {
                label: '이해하기 · 비교하기',
                title: 'ㅑ, ㅕ의 모양과 점자 비교',
                cards: [
                    'ㅏ+ㆍ→ㅑ',
                    'ㅓ+ㆍ→ㅕ'
                ]
            },
            {
                label: '따라하기 1 · 2 · 쓰기',
                title: '동작으로 익히고 따라 읽은 뒤 써요',
                cards: [
                    '동작 따라하기에서 팔 방향으로 ㅑ, ㅕ 모양을 표현해요.',
                    '여섯 칸 활동에서 ㅑ, ㅕ를 반복해 읽고 쓰기 칸에 따라 써요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기로 마무리',
                cards: [
                    '확인하기 1에서 제시된 글자 묶음을 소리 내어 읽어요.',
                    '확인하기 2 카드에서 들은 글자(ㅑ/ㅕ/기본 모음)를 찾아 마무리해요.'
                ]
            }
        ]
    },
    6: {
        title: '배움 6: ㅛ, ㅠ 공부하기',
        subtitle: '위/아래 두 줄 모양을 구분하며 익혀요.',
        sections: [
            {
                label: '이해하기 · 비교하기',
                title: 'ㅛ, ㅠ의 모양과 점자 비교',
                cards: [
                    'ㅗ+ㆍ→ㅛ',
                    'ㅜ+ㆍ→ㅠ'
                ]
            },
            {
                label: '따라하기 1 · 2 · 쓰기',
                title: '동작과 읽기·쓰기로 반복 연습',
                cards: [
                    '동작 따라하기에서 팔의 위/아래 자세로 ㅛ와 ㅠ를 표현해요.',
                    '따라하며 읽기와 쓰기 칸 활동으로 ㅛ, ㅠ를 반복 연습해요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기 활동',
                cards: [
                    '확인하기 1에서 섞여 있는 모음을 정확히 읽어요.',
                    '확인하기 2 카드에서 ㅛ, ㅠ를 중심으로 들은 소리를 찾아요.'
                ]
            }
        ]
    },
    7: {
        title: '배움 7: 다시 공부하기',
        subtitle: '배운 모음을 읽기·쓰기·단어 활동으로 종합해요.',
        sections: [
            {
                label: '읽기 · 쓰기',
                title: '기본 모음 전체 다시 읽고 쓰기',
                cards: [
                    '아, 야, 어, 여, 오, 요, 우, 유, 으, 이를 순서대로 읽어요.',
                    '같은 글자 배열을 따라 쓰며 소리 내어 읽어요.'
                ]
            },
            {
                label: '읽기 · 듣고 찾기',
                title: '단어 읽기와 모음 찾기',
                cards: [
                    '아이, 여우, 오이, 우유 단어를 그림과 함께 읽어요.',
                    '듣고 찾기 카드에서 들은 모음을 골라요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 7 활동 완료하기',
                cards: [
                    '배움 5~7에서 익힌 모음을 한 번 더 읽고 오늘 학습을 정리해요.',
                    '완료하기 버튼을 눌러 다음 배움 단계로 이동해요.'
                ]
            }
        ]
    },
    8: {
        title: '배움 8: ㄱ, ㅋ, ㄲ 공부하기',
        subtitle: '이해하기→따라하기/쓰기→확인하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기 1',
                title: 'ㄱ, ㅋ, ㄲ의 소리와 입모양',
                cards: [
                    'ㄱ+ㅏ→가',
                    'ㅋ+ㅏ→카',
                    'ㄲ+ㅏ→까'
                ]
            },
            {
                label: '따라하기 · 쓰기',
                title: 'ㄱ, ㅋ, ㄲ 따라 읽고 써요',
                cards: [
                    '따라하기에서 ㄱ, ㅋ, ㄲ을 보고 소리 내어 읽어요.',
                    '쓰기 칸에서 ㄱ, ㅋ, ㄲ을 바르게 반복해서 써요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 ㄱ, ㅋ, ㄲ 배열을 정확히 읽어요.',
                    '확인하기 2에서 제시된 카드 중 들은 글자를 찾아요.'
                ]
            },
            {
                label: '이해하기 2',
                title: '가, 카, 까 글자 만들기',
                cards: [
                    'ㄱ+ㅏ=가, ㅋ+ㅏ=카, ㄲ+ㅏ=까로 확장해 읽어요.',
                    '기본 자음을 모음 ㅏ와 결합해 새 글자를 만들어요.'
                ]
            },
            {
                label: '확인하기 3 · 4',
                title: '글자 만들기와 듣고 찾기 마무리',
                cards: [
                    '확인하기 3에서 ㄱ/ㅋ/ㄲ에 모음을 붙여 글자를 만들어요.',
                    '확인하기 4 듣고 찾기까지 끝낸 뒤 완료하기를 눌러요.'
                ]
            }
        ]
    },
    9: {
        title: '배움 9: ㄴ, ㄷ, ㅌ, ㄸ 공부하기',
        subtitle: '활동별로 나눠서 읽기·쓰기·찾기를 단계적으로 진행해요.',
        sections: [
            {
                label: '이해하기 1',
                title: 'ㄴ, ㄷ, ㅌ, ㄸ의 소리와 입모양',
                cards: [
                    'ㄴ+ㅏ→나',
                    'ㄷ+ㅏ→다',
                    'ㅌ+ㅏ→타',
                    'ㄸ+ㅏ→따'
                ]
            },
            {
                label: '따라하기 · 쓰기',
                title: 'ㄴ, ㄷ, ㅌ, ㄸ 따라 읽고 써요',
                cards: [
                    '따라하기에서 네 글자를 순서대로 읽고 소리 내요.',
                    '쓰기 칸에서 ㄴ, ㄷ, ㅌ, ㄸ을 반복해 써요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 제시된 글자 묶음을 읽어요.',
                    '확인하기 2에서 들은 글자를 찾아 선택해요.'
                ]
            },
            {
                label: '이해하기 2',
                title: '나, 다, 타, 따 글자 만들기',
                cards: [
                    'ㄴ/ㄷ/ㅌ/ㄸ에 ㅏ를 붙여 나, 다, 타, 따를 만들어요.',
                    '만든 글자를 큰 소리로 읽고 차이를 확인해요.'
                ]
            },
            {
                label: '확인하기 3 · 4',
                title: '글자 만들기와 듣고 찾기 마무리',
                cards: [
                    '확인하기 3에서 모음 결합 글자를 직접 만들어 봐요.',
                    '확인하기 4 듣고 찾기를 완료하고 완료하기를 눌러요.'
                ]
            }
        ]
    },
    10: {
        title: '배움 10: ㅁ, ㅂ, ㅍ, ㅃ 공부하기',
        subtitle: '입모양과 소리 차이를 익히고 활동별 페이지로 마무리해요.',
        sections: [
            {
                label: '이해하기 1',
                title: 'ㅁ, ㅂ, ㅍ, ㅃ의 소리와 입모양',
                cards: [
                    'ㅁ+ㅏ→마',
                    'ㅂ+ㅏ→바',
                    'ㅍ+ㅏ→파',
                    'ㅃ+ㅏ→빠'
                ]
            },
            {
                label: '따라하기 · 쓰기',
                title: 'ㅁ, ㅂ, ㅍ, ㅃ 따라 읽고 써요',
                cards: [
                    '따라하기에서 ㅁ, ㅂ, ㅍ, ㅃ을 반복해서 읽어요.',
                    '쓰기 칸에서 글자를 또박또박 써 보며 읽어요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 글자 묶음을 읽으며 차이를 구분해요.',
                    '확인하기 2에서 카드 중 들은 글자를 찾아요.'
                ]
            },
            {
                label: '이해하기 2',
                title: '마, 바, 파, 빠 글자 만들기',
                cards: [
                    'ㅁ/ㅂ/ㅍ/ㅃ에 ㅏ를 붙여 마, 바, 파, 빠를 만들어요.',
                    '만든 글자를 읽고 소리 차이를 확인해요.'
                ]
            },
            {
                label: '확인하기 3 · 4',
                title: '글자 만들기와 듣고 찾기 마무리',
                cards: [
                    '확인하기 3에서 모음 결합 글자를 완성해요.',
                    '확인하기 4 듣고 찾기까지 끝내고 완료하기를 눌러요.'
                ]
            }
        ]
    },
    11: {
        title: '배움 11: ㅅ, ㅈ, ㅊ, ㅉ, ㅆ 공부하기',
        subtitle: '이해하기→따라하기/쓰기→확인하기→글자 만들기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기 1',
                title: 'ㅅ, ㅈ, ㅊ, ㅉ, ㅆ의 소리와 입모양',
                cards: [
                    'ㅅ+ㅏ→사',
                    'ㅈ+ㅏ→자',
                    'ㅊ+ㅏ→차',
                    'ㅉ+ㅏ→짜',
                    'ㅆ+ㅏ→싸'
                ]
            },
            {
                label: '따라하기 · 쓰기',
                title: 'ㅅ, ㅈ, ㅊ, ㅉ, ㅆ 따라 읽고 써요',
                cards: [
                    '따라하기에서 다섯 글자를 듣고 따라 말해요.',
                    '쓰기 칸에서 ㅅ, ㅈ, ㅊ, ㅉ, ㅆ을 순서대로 따라 쓰며 읽어요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 제시된 글자 묶음(예: ㅅㅅㅈㅈ, ㅈㅈㅊㅊ, ㅅㅈㅆㅉ)을 소리 내어 읽어요.',
                    '확인하기 2에서 4칸 카드 중에서 선생님이 말한 글자를 찾아요.'
                ]
            },
            {
                label: '이해하기 2',
                title: '사, 자, 차, 짜, 싸 글자 만들기',
                cards: [
                    'ㅅ/ㅈ/ㅊ/ㅉ/ㅆ에 모음 ㅏ를 붙여 사, 자, 차, 짜, 싸를 만들어요.',
                    '만든 글자를 순서대로 읽으며 소리 차이를 확인해요.'
                ]
            },
            {
                label: '확인하기 3 · 4',
                title: '글자 만들기와 듣고 찾기 마무리',
                cards: [
                    '확인하기 3에서 자음+모음 결합 글자를 완성해요.',
                    '확인하기 4(듣고 찾기)에서 사/저/초/쑤, 조/치/찌/수, 싸/즈/초/쭈, 짜/지/즈/시 카드 활동을 하고 완료해요.'
                ]
            }
        ]
    },
    12: {
        title: '배움 12: ㅇ, ㅎ, ㄹ 공부하기',
        subtitle: '활동별 페이지로 읽기·쓰기·글자 만들기·듣고 찾기를 순서대로 진행해요.',
        sections: [
            {
                label: '이해하기 1',
                title: 'ㅇ, ㅎ, ㄹ의 소리와 입모양',
                cards: [
                    'ㅇ+ㅏ→아',
                    'ㅎ+ㅏ→하',
                    'ㄹ+ㅏ→라'
                ]
            },
            {
                label: '따라하기 · 쓰기',
                title: 'ㅇ, ㅎ, ㄹ 따라 읽고 써요',
                cards: [
                    '따라하기에서 ㅇ, ㅎ, ㄹ을 반복해 읽어요.',
                    '쓰기 칸에서 ㅇ, ㅎ, ㄷ, ㄹ 배열을 따라 쓰며 소리 내어 읽어요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 ㅇㅇㅎㅎ, ㅎㅎㅇㅇ, ㄷㄷㄹㄹ, ㄹㄹㄷㄷ, ㅇㅎㄷㄹ, ㅎㅇㄹㄷ을 읽어요.',
                    '확인하기 2에서 4칸 카드 중 들은 글자를 골라요.'
                ]
            },
            {
                label: '이해하기 2',
                title: '아, 하, 라 글자 만들기',
                cards: [
                    'ㅇ+ㅏ=아, ㅎ+ㅏ=하, ㄹ+ㅏ=라를 만들어 읽어요.',
                    '완성된 글자 아/하/라의 모양과 소리를 구분해요.'
                ]
            },
            {
                label: '확인하기 3 · 4',
                title: '글자 만들기와 듣고 찾기 마무리',
                cards: [
                    '확인하기 3에서 ㅇ/ㅎ/ㄹ과 모음을 결합해 글자를 완성해요.',
                    '확인하기 4(듣고 찾기)에서 아·허·우·루, 호·러·로·후, 이·흐·호·으, 오·리·희·어 카드 활동 후 완료하기를 눌러요.'
                ]
            }
        ]
    },
    13: {
        title: '배움 13: ㅏ, ㅣ 단어 공부하기',
        subtitle: '그림 단어 듣기→소리 내어 읽기→그림-단어 연결→따라 쓰기 순서로 진행해요.',
        sections: [
            {
                label: '읽기 1',
                title: '‘ㅏ’ 단어 읽기',
                cards: [
                    '아이, 아버지, 가수, 가지, 나무, 마차 그림 단어를 소리 내어 읽어요.',
                    '같은 페이지의 추가 단어(아기, 기사, 소아, 나라, 자리, 까치 등)도 함께 읽어요.'
                ]
            },
            {
                label: '읽기 2',
                title: '‘ㅣ’ 단어 읽기',
                cards: [
                    '기타, 고기, 다리, 나비, 파리, 허리 그림 단어를 정확히 읽어요.',
                    '오리, 느끼, 바구니, 코끼리, 라디오, 어머니, 부리, 뿌리 같은 단어를 확장 읽기해요.'
                ]
            },
            {
                label: '읽기 3',
                title: '‘ㅏ, ㅣ’ 무의미 단어 읽기',
                cards: [
                    '가디, 까초, 기처, 라지오, 버리, 하리처럼 의미 없는 음절 결합을 또박또박 읽어요.',
                    'ㅏ/ㅣ 모음 소리가 들어간 낱말을 구분해서 읽는 연습을 해요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽고 찾기',
                cards: [
                    '그림 옆에 제시된 두 단어 중 알맞은 단어를 찾아 읽어요.',
                    '확인하기 1, 2 페이지를 각각 진행하며 단어-그림 짝을 정확히 맞춰요.'
                ]
            },
            {
                label: '쓰기 1',
                title: '빈칸 글자 완성하기(1)',
                cards: [
                    '아이, 나무, 다리, 가지, 파리, 나비의 빈칸 글자를 채워 완성해요.',
                    '제시된 초성/중성 힌트를 보고 단어를 완성한 뒤 큰 소리로 읽어요.'
                ]
            },
            {
                label: '쓰기 2',
                title: '빈칸 글자 완성하기(2)',
                cards: [
                    '가수, 허리, 기타, 바구니, 코끼리, 아버지 단어의 빈칸을 완성해요.',
                    '활동을 마친 뒤 완성 단어를 한 번 더 읽으며 확인해요.'
                ]
            },
            {
                label: '놀이',
                title: '단어 놀이 해보기',
                cards: [
                    '가위바위보 게임판에서 이동한 칸의 단어를 큰 소리로 읽어요.',
                    '출발에서 도착까지 규칙에 맞게 진행하며 ㅏ/ㅣ 단어를 반복해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 13 활동 완료하기',
                cards: [
                    '읽기, 확인하기, 쓰기, 놀이 활동을 모두 마쳤는지 점검해요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 배움 14로 이동해요.'
                ]
            }
        ]
    },
    14: {
        title: '배움 14: ㅡ, ㅗ, ㅓ 단어 공부하기',
        subtitle: '그림 단어 듣기→소리 내어 읽기→그림-단어 연결→따라 쓰기 순서로 진행해요.',
        sections: [
            {
                label: '읽기 1',
                title: '‘ㅡ, ㅗ’ 단어 읽기',
                cards: [
                    '버스, 치즈, 스키, 주스, 모기, 포도 그림 단어를 읽어요.',
                    '카드, 지도, 모두, 도시, 그루, 토지, 부모, 꼬리 단어를 함께 읽어요.'
                ]
            },
            {
                label: '읽기 2',
                title: '‘ㅗ, ㅓ’ 단어 읽기',
                cards: [
                    '소나무, 소파, 저고리, 거미, 피아노, 너구리 그림 단어를 읽어요.',
                    '파도, 도로, 기도, 수저, 머리, 꼬마, 보라, 거리 단어를 추가로 읽어요.'
                ]
            },
            {
                label: '읽기 3',
                title: '‘ㅡ, ㅗ, ㅓ’ 무의미 단어 읽기',
                cards: [
                    '버서, 퍼도, 누스, 저구리, 소이즈, 으리처럼 의미 없는 단어를 소리 내어 읽어요.',
                    '세 모음(ㅡ/ㅗ/ㅓ)이 들어간 음절을 구분하며 발음해요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽고 찾기',
                cards: [
                    '그림마다 두 단어 중 알맞은 낱말을 찾아 읽어요.',
                    '확인하기 1, 2를 따로 진행하며 모음 소리를 비교해요.'
                ]
            },
            {
                label: '쓰기 1',
                title: '빈칸 글자 완성하기(1)',
                cards: [
                    '버스, 치즈, 모기, 주스, 스키, 피아노 단어의 빈칸을 채워요.',
                    '힌트 글자를 활용해 모음 위치를 확인하며 단어를 완성해요.'
                ]
            },
            {
                label: '쓰기 2',
                title: '빈칸 글자 완성하기(2)',
                cards: [
                    '포도, 소파, 꼬마, 소나무, 거미, 저고리 단어를 완성해요.',
                    '완성한 단어를 다시 읽으며 ㅡ, ㅗ, ㅓ 소리를 확인해요.'
                ]
            },
            {
                label: '놀이',
                title: '단어 놀이 해보기',
                cards: [
                    '가위바위보 게임판에서 도착한 칸의 단어를 큰 소리로 읽어요.',
                    '규칙(이긴 친구 1칸 이동, 도착 단어 읽기, 먼저 도착한 친구 승리)을 지켜 진행해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 14 활동 완료하기',
                cards: [
                    '읽기, 확인하기, 쓰기, 놀이 활동을 모두 마쳤는지 점검해요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 다음 단원으로 이동해요.'
                ]
            }
        ]
    },
    15: {
        title: '배움 15: ㅐ, ㅔ',
        subtitle: '비교하기→확인하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '비교하기 1 · 2',
                title: '입 모양을 보고 소리의 차이를 알아봐요',
                cards: [
                    'ㅣ는 입을 작게 벌려요.',
                    'ㅔ는 입을 조금 더 벌려요.',
                    'ㅐ는 입을 가장 크게 벌려요.',
                    '소리를 들으며 입이 벌어지는 모습을 살펴보세요.',
                    '이제 ㅔ와 ㅐ 소리를 듣고 알맞은 글자를 골라 보세요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '소리 내어 읽기',
                cards: [
                    'ㅏ/ㅣ/ㅐ/ㅔ 조합(예: ㅏ ㅣ ㅐ ㅔ, ㅓ ㅣ ㅔ ㅐ 등)을 순서대로 읽어요.',
                    '비슷한 모양의 모음을 천천히 비교하며 또박또박 읽어요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '글자 만들기',
                cards: [
                    '표에서 자음(ㄱ, ㄴ, ㄷ, ㅁ, ㅂ, ㅎ, ㅅ)과 ㅐ/ㅔ를 결합해 글자를 만들어요.',
                    '예시(개, 게)를 참고해 빈칸을 채운 뒤 완성 글자를 읽어요.'
                ]
            },
            {
                label: '확인하기 3',
                title: '단어 연결하기',
                cards: [
                    '단어(개, 해, 배, 게)를 해당 그림(강아지, 해, 배(배/boat), 게)과 연결해요.',
                    '단어를 연결한 후 소리 내어 한 번 더 읽으며 확인해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 15 활동 완료하기',
                cards: [
                    '비교하기와 확인하기 활동을 모두 마쳤는지 점검해요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 배움 16으로 이동해요.'
                ]
            }
        ]
    },
    16: {
        title: '배움 16: ㅖ, ㅒ',
        subtitle: '비교하기→확인하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '비교하기 1',
                title: '입모양을 보고 ㅖ와 ㅒ 소리를 알아봐요',
                cards: [
                    'ㅣ는 입을 조금 벌려요.',
                    'ㅖ는 ㅣ에서 시작해 입을 더 벌려요.',
                    'ㅒ는 ㅖ보다 입을 더 크게 벌려요.',
                    '소리를 듣고 입모양을 함께 살펴보세요.',
                    '이제 ㅖ와 ㅒ 소리를 듣고 알맞은 글자를 골라 보세요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 ㅣ/ㅖ/ㅒ가 섞인 배열을 소리 내어 읽어요.',
                    '확인하기 2에서 제시된 카드 중 선생님이 말한 소리를 찾아요.'
                ]
            },
            {
                label: '확인하기 3',
                title: '글자 만들기',
                cards: [
                    '자음(ㄱ, ㄴ, ㅅ, ㅇ, ㅍ, ㅎ)과 ㅖ/ㅒ를 결합해 글자를 만들어요.',
                    '예시(계, 개)를 보고 같은 방식으로 빈칸을 완성해요.'
                ]
            },
            {
                label: '확인하기 4',
                title: '단어 연결하기',
                cards: [
                    '단어(애기, 시계, 예의)를 해당 그림(아이들, 시계, 예의 인사)과 연결해요.',
                    '연결 후 단어를 정확한 발음으로 다시 읽어요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 16 활동 완료하기',
                cards: [
                    '비교하기와 확인하기 활동을 순서대로 마쳤는지 확인해요.',
                    '마지막 페이지의 완료하기 버튼으로 배움 17로 이동해요.'
                ]
            }
        ]
    },
    17: {
        title: '배움 17: ㅘ, ㅝ',
        subtitle: '이해하기→확인하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅘ, ㅝ 글자 만들기',
                cards: [
                    'ㅗ+ㅏ→ㅘ, ㅜ+ㅓ→ㅝ 결합 원리를 보고 글자가 만들어지는 과정을 익혀요.',
                    '두 글자의 모양과 소리를 비교하며 읽어요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '소리 내어 읽기',
                cards: [
                    'ㅗ/ㅏ/ㅘ/ㅝ, ㅜ/ㅓ/ㅝ/ㅘ처럼 섞인 배열을 천천히 읽어요.',
                    'ㅘ와 ㅝ 소리가 섞였을 때도 정확히 구분해 읽어요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '듣고 찾기',
                cards: [
                    '카드에서 들은 모음(ㅘ, ㅝ, 기본 모음)을 골라요.',
                    '단어 카드(해, 워, 와, 개 / 배, 와, 워, 에)에서도 들은 소리를 찾아요.'
                ]
            },
            {
                label: '확인하기 3',
                title: '글자 만들기',
                cards: [
                    '자음(ㄱ, ㄴ, ㅇ, ㅂ, ㅎ)과 ㅘ/ㅝ를 결합해 새로운 글자를 만들어요.',
                    '예시(과, 궈)를 참고해 표의 빈칸을 채워 읽어요.'
                ]
            },
            {
                label: '확인하기 4',
                title: '단어 연결하기',
                cards: [
                    '단어(과자, 화가)를 알맞은 그림(과자, 화가)과 연결해요.',
                    '연결한 단어를 한 번 더 읽으며 ㅘ 소리를 확인해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 17 활동 완료하기',
                cards: [
                    '이해하기와 확인하기 활동을 모두 완료했는지 점검해요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 배움 18로 이동해요.'
                ]
            }
        ]
    },
    18: {
        title: '배움 18: ㅟ, ㅢ',
        subtitle: '이해하기→확인하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅟ, ㅢ 글자 만들기',
                cards: [
                    'ㅜ+ㅣ→ㅟ, ㅡ+ㅣ→ㅢ 결합 과정을 보고 모양을 익혀요.',
                    '두 글자의 발음을 비교하며 천천히 읽어요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '소리 내어 읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 ㅜ/ㅣ/ㅟ/ㅢ 조합을 소리 내어 읽어요.',
                    '확인하기 2 카드에서 들은 소리를 찾아 선택해요.'
                ]
            },
            {
                label: '확인하기 3',
                title: '글자 만들기',
                cards: [
                    '자음(ㄱ, ㄴ, ㄷ, ㅇ, ㅌ, ㅎ)에 ㅟ/ㅢ를 붙여 글자를 만들어요.',
                    '예시(귀, 괴 등 유사 결합 읽기 경험)를 떠올리며 표를 완성해요.'
                ]
            },
            {
                label: '확인하기 4',
                title: '단어 연결하기',
                cards: [
                    '단어(귀, 의사, 의자)를 그림(귀, 의사, 의자)과 연결해요.',
                    '활동 후 단어를 다시 읽으며 ㅟ/ㅢ 소리를 구분해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 18 활동 완료하기',
                cards: [
                    '이해하기와 확인하기 활동을 모두 마쳤는지 확인해요.',
                    '마지막 페이지 완료하기 버튼을 눌러 배움 19로 이동해요.'
                ]
            }
        ]
    },
    19: {
        title: '배움 19: ㅞ, ㅙ, ㅚ',
        subtitle: '이해하기→확인하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅞ, ㅙ, ㅚ 만들기와 소리 비교',
                cards: [
                    'ㅘ+ㅣ→ㅙ, ㅝ+ㅣ→ㅞ, ㅗ+ㅣ→ㅚ로 확장되는 과정을 관찰해요.',
                    'ㅞ, ㅙ, ㅚ 세 소리가 모두 비슷하게 /ㅞ, ㅞ, ㅞ/로 들린다는 점을 확인해요.'
                ]
            },
            {
                label: '확인하기 1 · 2',
                title: '소리 내어 읽기와 듣고 찾기',
                cards: [
                    '확인하기 1에서 ㅜ/ㅣ/ㅟ/ㅢ/ㅙ/ㅞ/ㅚ가 섞인 배열을 읽어요.',
                    '확인하기 2 카드에서 들은 소리와 같은 글자를 찾아요.'
                ]
            },
            {
                label: '확인하기 3',
                title: '글자 만들기',
                cards: [
                    '자음(ㄱ, ㄷ, ㅇ, ㅌ, ㅎ)과 ㅙ/ㅞ/ㅚ를 결합해 글자를 만들어요.',
                    '예시(궤, 돼, 뇌)를 참고해 표의 빈칸을 채워 읽어요.'
                ]
            },
            {
                label: '확인하기 4',
                title: '단어 연결하기',
                cards: [
                    '단어(왜, 뇌, 돼지, 쇠, 외투)를 그림과 연결해요.',
                    '연결한 뒤 단어를 반복해 읽으며 ㅙ/ㅞ/ㅚ를 구분해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 19 활동 완료하기',
                cards: [
                    '이해하기와 확인하기 모든 페이지를 마쳤는지 점검해요.',
                    '마지막 페이지 완료하기 버튼을 눌러 다음 배움으로 이동해요.'
                ]
            }
        ]
    },
    20: {
        title: '배움 20: 복잡한 모음 단어 공부하기',
        subtitle: '사진 순서대로 읽기·확인하기·쓰기·놀이를 활동별 페이지로 진행해요.',
        sections: [
            {
                label: '읽기 1',
                title: '복잡한 모음 단어 읽기',
                cards: [
                    '해, 여우, 야구, 우표, 요리사, 우유 그림 단어를 읽어요.',
                    '새, 야채, 여자, 비녀, 소녀, 가야, 가요, 고요, 유도, 유리, 뉴스, 튜브 단어를 반복해 읽어요.'
                ]
            },
            {
                label: '읽기 2',
                title: '복잡한 모음 단어 확장 읽기',
                cards: [
                    '의사, 의자, 바위, 거위, 과자, 교과서 그림 단어를 읽어요.',
                    '추위, 더위, 위치, 토의, 주의, 회의, 사과, 효과, 좌우, 화로, 왜가리, 돼지 단어를 읽어요.'
                ]
            },
            {
                label: '읽기 3',
                title: '복잡한 모음 무의미 단어 읽기',
                cards: [
                    '그배, 여구, 디야, 스바냐, 요자, 요우, 버유, 무사, 와토처럼 의미 없는 단어를 읽어요.',
                    '화지, 두과, 버위, 위치, 테추, 소의, 보녀, 주려, 고라 등으로 복잡한 모음 발음을 연습해요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '읽고 찾기 (1)',
                cards: [
                    '그림마다 제시된 두 단어 중 알맞은 단어를 골라 읽어요.',
                    '여우/야우, 해/애, 야구/여구, 우유/유우처럼 비슷한 소리를 비교해요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '읽고 찾기 (2)',
                cards: [
                    '의사/의서, 바위/버위, 과자/과지, 거우/거위, 더우/더위, 교과서/교과스처럼 올바른 단어를 찾아요.',
                    '야처/야채, 의자/으자, 추위/추이, 오표/우표를 읽고 정확한 발음을 확인해요.'
                ]
            },
            {
                label: '쓰기 1',
                title: '완성해 보기 (1)',
                cards: [
                    '그림을 보고 야구, 의사, 여우, 과자, 비녀, 야채의 빈칸 글자를 채워요.',
                    '힌트 자음을 참고해 복잡한 모음 글자를 맞게 완성해요.'
                ]
            },
            {
                label: '쓰기 2',
                title: '완성해 보기 (2)',
                cards: [
                    '돼지, 거위, 더위, 튜브, 추위, 우표의 빈칸을 채워 단어를 완성해요.',
                    '완성한 단어를 다시 읽으며 복잡한 모음 소리를 확인해요.'
                ]
            },
            {
                label: '놀이',
                title: '단어 놀이 해보기',
                cards: [
                    '가위바위보 게임판에서 이긴 친구가 1칸 이동하고 도착 칸 단어를 읽어요.',
                    '놀이 활동을 마친 뒤 마지막 페이지에서 완료하기 버튼으로 배움 21로 이동해요.'
                ]
            }
        ]
    },
    21: {
        title: '배움 21: ㅁ, ㅂ 받침',
        subtitle: '이해하기→연습하기→읽기/쓰기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅁ, ㅂ 받침 소리 익히기',
                cards: [
                    '가+ㅁ→감',
                    '나+ㅂ→납'
                ]
            },
            {
                label: '연습하기',
                title: '받침을 넣어 천천히 읽기',
                cards: [
                    '각 모음 줄(가-하, 거-허, 고-호, 구-후, 그-흐, 기-히)에 ㅁ 받침을 넣어 읽어요.',
                    '같은 활동을 ㅂ 받침으로 반복해 읽으며 소리 차이를 연습해요.'
                ]
            },
            {
                label: '읽기',
                title: '단어 읽기',
                cards: [
                    '바ㅁ, 저ㅁ, 그ㅁ, 수ㅁ, 해ㅁ, 꾸ㅁ / 저ㅁ, 시ㅁ, 샤ㅁ푸, 이ㅁ, 그ㅁ, 니ㅁ 카드로 단어를 읽어요.',
                    '이ㅂ, 바ㅂ, 토ㅂ, 커ㅂ, 즈ㅂ, 고ㅂ / 고지ㅂ, 수어ㅂ, 구ㄴ차 등 단어 카드도 정확히 읽어요.'
                ]
            },
            {
                label: '쓰기 · 단어 찾기',
                title: '듣고 받침쓰기와 그림 단어 쓰기',
                cards: [
                    '쓰기 활동에서 추ㅂ, 여소ㅂ, 하푸ㅂ, 튀기ㅂ, 내비ㅂ, 아치ㅂ처럼 들은 받침을 써요.',
                    '단어 찾기에서 보기(름ㅁ, 림ㅁ, 김ㅁ, 차ㅁ / 처ㅂ, 지ㅂ, 저ㅂ, 라ㅂ)를 활용해 그림 단어를 완성해요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 단어 묶음(예: 곰, 점수, 몸무게 / 밥, 집밥, 모래톱)을 스스로 읽어요.',
                    '모든 활동을 마친 뒤 마지막 페이지의 완료하기 버튼을 눌러 배움 22로 이동해요.'
                ]
            }
        ]
    },
    22: {
        title: '배움 22: ㅇ, ㄱ 받침',
        subtitle: '이해하기→연습하기→읽기/쓰기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅇ, ㄱ 받침 소리 익히기',
                cards: [
                    '가+ㅇ→강',
                    '바+ㄱ→박'
                ]
            },
            {
                label: '연습하기',
                title: '받침을 넣어 천천히 읽기',
                cards: [
                    '각 모음 줄(가-하, 거-허, 고-호, 구-후, 그-흐, 기-히)에 ㅇ 받침을 넣어 읽어요.',
                    '같은 줄을 ㄱ 받침으로 반복하며 소리 변화를 연습해요.'
                ]
            },
            {
                label: '읽기',
                title: '단어 읽기',
                cards: [
                    '고ㅇ, 벼ㅇ, 서ㅇ, 쿠ㅇ, 와ㅇ, 하ㅇ / 사자ㅇ, 야오ㅇ, 바마ㅇ 단어 카드를 읽어요.',
                    '부ㄱ, 가ㄱ, 토ㄱ, 쭈ㄱ, 떠ㄱ, 꽤ㄱ / 하ㄱ교, 소시ㄱ, 미여ㄱ구 단어 카드도 읽어요.'
                ]
            },
            {
                label: '쓰기 · 단어 찾기',
                title: '듣고 받침쓰기와 그림 단어 쓰기',
                cards: [
                    '쓰기 활동에서 흐ㅇ, 구ㄱ, 지부ㅇ, 도새ㅇ, 세사ㅇ, 까추ㅇ처럼 들은 받침을 써요.',
                    '단어 찾기에서 보기(마ㅇ, 푸ㅇ, 사ㅇ, 머ㅇ / 조ㄱ, 바ㄱ, 추ㄱ, 하ㄱ)를 활용해 그림 단어를 완성해요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 낱말 묶음(예: 흥, 방송, 강낭콩 / 국, 풍덩, 경기장 / 박, 약국, 행복해)을 읽어요.',
                    '모든 활동을 마친 뒤 마지막 페이지의 완료하기 버튼을 눌러 다음 배움으로 이동해요.'
                ]
            }
        ]
    },
    23: {
        title: '배움 23: ㄴ, ㄹ 받침',
        subtitle: '이해하기→연습하기→읽기/쓰기→도전하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㄴ, ㄹ 받침 소리 익히기',
                cards: [
                    '가+ㄴ→간',
                    '가+ㄹ→갈'
                ]
            },
            {
                label: '연습하기',
                title: '받침을 넣어 천천히 읽기',
                cards: [
                    '가-하, 거-허, 고-호, 구-후, 그-흐, 기-히 줄에 ㄴ 받침을 넣어 천천히 읽어요.',
                    '같은 줄을 ㄹ 받침으로 반복해 읽으며 /ㄴ/과 /ㄹ/ 소리를 비교해요.'
                ]
            },
            {
                label: '읽기',
                title: '단어 읽기',
                cards: [
                    '무ㄴ, 사ㄴ, 바ㄴ, 처ㄴ, 꾸ㄴ, 패ㄴ / 내ㄴ, 녀ㄴ, 펴ㄴ, 도서과ㄴ 단어 카드를 읽어요.',
                    '부ㄹ, 도ㄹ, 기ㄹ, 화ㄹ, 규ㄹ, 싸ㄹ / 따기ㄹ, 하느ㄹ, 다스기 단어 카드도 읽어요.'
                ]
            },
            {
                label: '쓰기 · 단어 찾기',
                title: '듣고 받침쓰기와 그림 단어 쓰기',
                cards: [
                    '쓰기 활동에서 끄ㄴ, 시워ㄴ, 서바ㄴ, 사초ㄴ, 화부ㄴ, 어니ㄹ, 태귀도처럼 들은 받침을 써요.',
                    '단어 찾기에서 보기(부ㄴ, 사ㄴ, 리ㄴ, 자ㄴ / 무ㄹ, 스ㄹ, 어ㄹ, 코ㄹ, 구ㄹ)를 보고 그림 단어를 완성해요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 단어 묶음(예: 판, 산, 훈련 / 그만, 부분, 소년 / 천천히, 건전지, 위인전)을 소리 내어 읽어요.',
                    '활동을 모두 마친 뒤 마지막 페이지에서 완료하기 버튼을 눌러 배움 24로 이동해요.'
                ]
            }
        ]
    },
    24: {
        title: '배움 24: ㄷ 받침',
        subtitle: '이해하기→연습하기→읽기/쓰기→도전하기 순서로 활동별 페이지를 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㄷ 받침 소리 익히기',
                cards: [
                    '가+ㄷ→갇',
                    '받침에서 ㄷ 소리가 나요.'
                ]
            },
            {
                label: '연습하기',
                title: '받침을 넣어 천천히 읽기',
                cards: [
                    '가-하, 거-허, 고-호, 구-후, 그-흐, 기-히 줄에 ㄷ 받침을 넣어 읽어요.',
                    '같은 모음 줄을 반복해 읽으며 받침이 붙을 때의 소리를 안정적으로 익혀요.'
                ]
            },
            {
                label: '읽기',
                title: '단어 읽기',
                cards: [
                    '어ㄷ, 가ㄷ, 소ㄷ, 비ㄷ, 차ㄷ, 유ㄷ / 바ㄷ, 고ㄷ게, 이트나ㄹ 카드로 단어를 읽어요.',
                    '무다, 드다, 수가라ㄱ, 시다, 거다, 도보기 카드도 정확하게 읽어요.'
                ]
            },
            {
                label: '쓰기 · 단어 찾기',
                title: '듣고 받침쓰기와 그림 단어 쓰기',
                cards: [
                    '쓰기 활동에서 무다, 드다, 수가라ㄱ, 시다, 거다, 도보기처럼 들은 받침을 써요.',
                    '단어 찾기에서 보기(거ㄷ, 다ㄷ, 도ㄷ)를 활용해 그림 단어(걷다, 닫다, 돋보기)를 완성해요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 단어 묶음(예: 올, 날, 달 / 곧게, 걷다, 돋다 / 돋보기, 이튿날, 숟가락)을 읽어요.',
                    '활동을 모두 마친 뒤 마지막 페이지에서 완료하기 버튼을 눌러 배움 25로 이동해요.'
                ]
            }
        ]
    },
    25: {
        title: '배움 25: 도전, 받침왕! (1)',
        subtitle: '듣고 찾기→읽기→도전하기를 활동별 페이지로 나누어 진행해요.',
        sections: [
            {
                label: '듣고 찾기 1 · 2',
                title: '들은 낱말에 ○표 하기',
                cards: [
                    '1~20번 문항에서 제시된 두 글자 카드 중 들은 낱말에 ○표 해요.',
                    'ㅇ/ㄱ/ㄴ/ㄹ/ㄷ/ㅁ/ㅂ 받침이 섞인 음절을 구분해 들으며 정확히 선택해요.'
                ]
            },
            {
                label: '읽기',
                title: '한 줄 씩 소리 내어 읽기',
                cards: [
                    '표에 제시된 낱말 줄(예: 으음음, 알알 앙, 언언 엄)을 한 줄씩 읽어요.',
                    '왼쪽·오른쪽 문제를 번갈아 읽고 확인 칸으로 스스로 점검해요.'
                ]
            },
            {
                label: '도전하기',
                title: '그림에 알맞은 글자 따라 길 찾기',
                cards: [
                    '출발에서 시작해 그림에 맞는 글자를 고르며 길을 따라가요.',
                    '산/상, 물/문, 별/번, 책/챔, 왕/왑처럼 받침이 다른 선택지를 비교해요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 25 활동 완료하기',
                cards: [
                    '듣고 찾기, 읽기, 도전하기 활동을 모두 마쳤는지 확인해요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 다음 배움으로 이동해요.'
                ]
            }
        ]
    },
    26: {
        title: '배움 26: 대표받침 단어 읽기',
        subtitle: '읽기→확인하기→쓰기→놀이를 활동별 페이지로 나누어 진행해요.',
        sections: [
            {
                label: '읽기 1',
                title: '받침 ㅁ, ㅂ 단어 읽기',
                cards: [
                    '염소, 감자, 구름, 수첩, 집게, 서랍 그림 단어를 읽어요.',
                    '김치, 감기, 입구, 밥집 / 봄비, 소금, 춥다, 몸집 / 잠수, 잠자리, 줍다, 종이접기 단어를 따라 읽어요.'
                ]
            },
            {
                label: '읽기 2',
                title: '받침 ㅇ, ㄱ 단어 읽기',
                cards: [
                    '강가, 야구공, 늑대, 국자, 축구공, 책상 그림 단어를 읽어요.',
                    '석가탑, 행복, 사랑, 태극기 / 박수, 막대기, 호박, 독수리 / 악어, 떡국, 옥수수, 백조 단어를 읽어요.'
                ]
            },
            {
                label: '읽기 3',
                title: '받침 ㄴ, ㄹ, ㄷ 단어 읽기',
                cards: [
                    '기린, 분수, 고릴라, 갈매기, 돋보기, 걷다 그림 단어를 읽어요.',
                    '버선, 눈사람, 겨울, 뜯다 / 변기, 원숭이, 마을, 쏠다 / 만두, 병원, 솔방울, 받침 단어를 읽어요.'
                ]
            },
            {
                label: '읽기 4',
                title: '‘7가지’ 대표받침 무의미 단어 읽기',
                cards: [
                    '섬씨, 비비, 럽스터, 카럼, 경주, 빽지, 아반, 아가틸 등 다양한 배열을 읽어요.',
                    '곰버, 서집, 소래질, 경낭이, 보벅주, 석자집, 안시리, 아르빌, 소자컬처럼 의미 없는 단어도 읽어요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '읽고 찾기 (ㅁ, ㅂ / ㅇ, ㄱ)',
                cards: [
                    '염소/영소, 감자/감자, 구름/구릉, 수첩/수철, 집게/집게, 서랑/서랍에서 맞는 단어를 골라요.',
                    '강가/감가, 야구골/야구공, 눔대/늑대, 국자/굴자처럼 비슷한 받침을 구분해 읽어요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '읽고 찾기 (ㄴ, ㄹ, ㄷ)',
                cards: [
                    '축구공/충구경, 책상/챙상, 기링/기린, 분수/불수, 고를라/고릴라, 갈매기/간매기에서 맞는 단어를 찾아요.',
                    '만두/맘두, 솔방울/솔방을, 돈보기/돌보기, 걸다/걸다처럼 헷갈리는 받침 단어를 비교하며 읽어요.'
                ]
            },
            {
                label: '쓰기 1',
                title: '완성해 보기 (ㅁ, ㅂ 단어)',
                cards: [
                    '염소, 감자, 구름, 수첩, 집게, 서랍 그림의 빈칸을 채워 단어를 완성해요.',
                    '받침 위치를 확인하면서 소리와 글자가 맞는지 소리 내어 읽어요.'
                ]
            },
            {
                label: '쓰기 2',
                title: '완성해 보기 (ㅇ, ㄱ / ㄴ, ㄹ, ㄷ 단어)',
                cards: [
                    '늑대, 국자, 책상, 기린, 분수, 걷다 그림의 빈칸을 채워 단어를 완성해요.',
                    '완성한 뒤 정확한 받침 소리로 다시 읽으며 스스로 점검해요.'
                ]
            },
            {
                label: '놀이',
                title: '단어 놀이 해보기',
                cards: [
                    '가위바위보 게임판에서 이긴 친구가 지우개를 1칸 움직이고 도착 칸 단어를 읽어요.',
                    '출발에서 도착까지 먼저 도착한 친구가 이겨요.'
                ]
            },
            {
                label: '마무리',
                title: '배움 26 활동 완료하기',
                cards: [
                    '읽기 1~4, 확인하기 1~2, 쓰기 1~2, 놀이 활동을 모두 마쳤는지 확인해요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 배움 27로 이동해요.'
                ]
            }
        ]
    },
    27: {
        title: '배움 27: ㅂ 받침가족',
        subtitle: '이해하기→연습하기→읽기→도전하기를 활동별 페이지로 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㅂ, ㅍ 받침 소리 익히기',
                cards: [
                    'ㅂ(비읍)과 ㅍ(피읖)은 받침에서 모두 /ㅂ/ 소리로 나는 점을 익혀요.',
                    '입 모양과 손 동작을 보며 받침 소리가 같다는 규칙을 확인해요.'
                ]
            },
            {
                label: '연습하기',
                title: '들리는 대로 받침쓰기',
                cards: [
                    '이ㅍ→이, 이ㅂ→이, 여ㅍ→여, 수ㅍ→수, 지ㅂ→지, 아ㅍ→아처럼 받침을 빼고 읽는 연습을 해요.',
                    '저시ㅂ→저시, 무르ㅍ→무르, 더바ㅍ→더바, 노다ㅍ→노다 카드로 /ㅂ/ 소리를 반복해요.'
                ]
            },
            {
                label: '읽기',
                title: '받침소리를 생각하며 단어 읽기',
                cards: [
                    '지ㅂ, 아ㅍ, 바ㅂ, 사ㅂ, 여ㅍ, 수ㅍ / 토ㅂ, 노다, 저다, 추다를 소리 내어 읽어요.',
                    '무르, 저시, 뒤더다, 가다, 이체, 이사귀, 아치마, 보고시다 카드도 받침 소리를 생각하며 읽어요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 묶음(입, 앞, 옆, 톱, 숲, 법, 잎 / 답답, 쉽다, 깊다, 덮밥 / 눕지대, 구급차, 앞치마)을 읽어요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 배움 28로 이동해요.'
                ]
            }
        ]
    },
    28: {
        title: '배움 28: ㄱ 받침가족',
        subtitle: '이해하기→연습하기→읽기→도전하기를 활동별 페이지로 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㄱ, ㅋ, ㄲ 받침 소리 익히기',
                cards: [
                    'ㄱ(기역), ㅋ(키읔), ㄲ(쌍기역)은 받침에서 모두 /ㄱ/ 소리가 나요.',
                    '세 글자는 모양이 다르지만 받침소리는 같다는 점을 확인해요.'
                ]
            },
            {
                label: '연습하기',
                title: '들리는 대로 받침쓰기',
                cards: [
                    '바ㄲ→바, 구ㄱ→구, 까ㄷㅏ→까다, 부어ㅋ→부어, 무ㄲ다→무다, 나시터ㄲ→나시터를 연습해요.',
                    '약속하기: ㄱ, ㅋ, ㄲ는 글자는 다르지만 받침소리는 /ㄱ/으로 같아요.'
                ]
            },
            {
                label: '읽기',
                title: '받침소리를 생각하며 단어 읽기',
                cards: [
                    '보ㄱ, 너ㅋ, 서다ㄲ, 구자ㄱ, 싸ㄱ, 무다ㄲ, 까다ㄲ, 부어ㅋ 단어를 읽어요.',
                    '꺼다ㄱ, 보다ㄲ, 떠보이ㄱㄲ, 시타ㄱ, 꺼다ㄲ, 새버너ㅋ, 꼬대기ㄱ, 아파으로ㄴㄲ 카드도 읽어요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 묶음(약, 박, 곽, 북, 넋, 깍, 떡 / 엮다, 식탁, 창밖, 북녘, 섞다 / 새벽녘, 연필깎이, 볶습니다)을 읽어요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 배움 29로 이동해요.'
                ]
            }
        ]
    },
    29: {
        title: '배움 29: ㄷ 받침가족',
        subtitle: '이해하기→연습하기→읽기→도전하기를 활동별 페이지로 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: 'ㄷ, ㅅ, ㅆ, ㅈ, ㅊ, ㅌ, ㅎ 받침 소리 익히기',
                cards: [
                    'ㄷ, ㅅ, ㅆ, ㅈ, ㅊ, ㅌ, ㅎ은 받침에서 모두 /ㄷ/ 소리로 나요.',
                    '글자는 달라도 받침소리가 같다는 규칙을 손 동작과 함께 확인해요.'
                ]
            },
            {
                label: '연습하기 1',
                title: '들리는 대로 받침쓰기 (1)',
                cards: [
                    '꼬ㅊ→꼬, 비ㅅ→비, 유ㅈ→유 카드에서 받침을 넣거나 빼며 소리를 익혀요.',
                    '같은 /ㄷ/ 소리를 내는 받침 글자를 번갈아 읽으며 구분해요.'
                ]
            },
            {
                label: '연습하기 2',
                title: '들리는 대로 받침쓰기 (2)',
                cards: [
                    '오ㅅ→오, 소ㅌ→소, 나ㅈ→나, 씨ㅅ다→씨다, 저소ㅈ→저소 활동을 해요.',
                    '버꼬ㅈ→버꼬, 찌다ㅎ→찌다 카드까지 읽고 받침소리를 확인해요.'
                ]
            },
            {
                label: '읽기',
                title: '받침소리를 생각하며 단어 읽기',
                cards: [
                    '오ㅅ, 비ㅊ, 꼬ㄷ, 파ㅌ, 부ㅅ, 미ㅌ / 나ㅅ, 거ㅌ, 수ㅊ, 모ㅅ, 뜨ㅅ, 나ㅈ 카드를 읽어요.',
                    '사다ㅆ, 버꼬ㅈㅈ, 끄나다ㅌ, 버서ㅅ, 저다ㅈ, 초코리스ㄹ, 노라다ㅎ, 쪼겨나다ㅆ 카드도 읽어요.'
                ]
            },
            {
                label: '도전하기',
                title: '스스로 정확하게 읽기',
                cards: [
                    '1단계~3단계 묶음(옷, 낫, 팥, 옻, 뜻, 윷, 빛 / 잇다, 찾다, 도넛, 쫓다, 짖다 / 가마솥, 자줏빛, 쫓겨났다)을 읽어요.',
                    '마지막 페이지에서 완료하기 버튼을 눌러 다음 배움으로 이동해요.'
                ]
            }
        ]
    },
    30: {
        title: '배움 30: 도전, 받침왕! (2)',
        subtitle: '문제 풀기→길 찾기 활동을 페이지별로 진행해요.',
        sections: [
            {
                label: '도전하기 1',
                title: '도전, 받침왕! (2) 문제 풀기',
                cards: [
                    '1~20번 문제에서 두 음절 카드를 비교하고 알맞은 받침 소리를 읽어요.',
                    '예: 아+ㅅ/ㄴ, 아+ㅍ/ㅇ, 이+ㅆ/ㄴ, 우+ㅊ/ㅇ처럼 받침 차이를 정확히 구분해요.'
                ]
            },
            {
                label: '도전하기 2',
                title: '그림에 알맞은 글자 따라 길 찾기',
                cards: [
                    '출발에서 시작해 그림 뜻에 맞는 단어를 고르며 도착까지 이동해요.',
                    '꽃/꼭, 낚시/남시, 젖소/전소, 숲/숨, 빗/빙, 무릎/무로프처럼 헷갈리는 받침을 구별해요.'
                ]
            },
            {
                label: '도전하기 3',
                title: '그림에 알맞은 글자 따라 길 찾기 (2)',
                cards: [
                    '두 번째 길 찾기에서 덮밥/더밥, 높다/녹다, 부엌/부얼, 햇빛/핻빕, 접시/적시, 앞/악을 비교해요.',
                    '모든 길 찾기 활동을 마친 뒤 마지막 페이지에서 완료하기 버튼을 눌러 배움 31로 이동해요.'
                ]
            }
        ]
    },
    31: {
        title: '배움 31: 받침가족 단어 공부하기',
        subtitle: '읽기→확인하기→놀이를 활동별 페이지로 나누어 진행해요.',
        sections: [
            {
                label: '읽기 1',
                title: '받침 ㅂ, ㅍ 단어 읽기',
                cards: [
                    '김밥, 입술, 팝콘, 은행잎, 무릎, 짚신 그림 단어를 읽어요.',
                    '낙엽, 월급, 옆구리, 잎사귀 / 방법, 가볍다, 짚신, 형편 / 과즙, 깊다, 옆방, 덮개 단어를 따라 읽어요.'
                ]
            },
            {
                label: '읽기 2',
                title: '받침 ㄱ, ㄲ, ㅋ 단어 읽기',
                cards: [
                    '저녁, 과녁, 부엌, 낚시, 닦다, 볶음밥 그림 단어를 읽어요.',
                    '달력, 극장, 묶음, 엮다 / 국수, 들녘, 깎다, 밖으로 / 수박, 저물녘, 떡볶이, 섞다 단어를 읽어요.'
                ]
            },
            {
                label: '읽기 3',
                title: '받침 ㄷ 가족 단어 읽기',
                cards: [
                    '숟가락, 가마솥, 모래밭, 젖소, 첫째, 돛단배 그림 단어를 읽어요.',
                    '듣기, 입맛, 젖다, 있다 / 쓰레받기, 멋지다, 낮잠, 하얗다 / 바깥, 좋다, 별빛, 꽃밭 단어를 읽어요.'
                ]
            },
            {
                label: '읽기 4',
                title: '‘3가지’ 받침가족 무의미 단어 읽기',
                cards: [
                    '아슙, 낙후, 석히, 후쿠귝, 르국, 해직처럼 받침이 들어간 무의미 단어를 읽어요.',
                    '바마솝, 리오낫, 지훌밥, 다랼, 가름, 배무돛 등 다양한 배열을 정확하게 읽어요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '읽고 찾기 (받침 ㅂ·ㄱ·ㄲ·ㄹ)',
                cards: [
                    '저녁/저녁, 과녁/과녕, 부엌/부엇, 낚시/낭시, 닦다/단다, 볶음밥/볶음밥에서 맞는 단어를 찾아요.',
                    '김밥/김밥, 입술/입술, 팝콘/팜콘, 은행잎/은행입처럼 비슷한 받침을 구분해 읽어요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '읽고 찾기 (받침 ㄷ 가족)',
                cards: [
                    '무릎/무름, 짚신/집신, 숟가락/숙가락, 모래밭/모래방, 첫째/청째, 젖소/전소에서 맞는 단어를 찾아요.',
                    '돛단배/돗단배, 형편/헌편, 낮잠/낮잠처럼 헷갈리는 받침 단어를 비교하며 읽어요.'
                ]
            },
            {
                label: '놀이',
                title: '단어 놀이 해보기',
                cards: [
                    '가위바위보 게임판에서 이긴 친구가 지우개를 1칸 움직이고 도착 칸 단어를 읽어요.',
                    '출발에서 도착까지 먼저 도착한 친구가 이기며, 마지막 페이지에서 완료하기 버튼을 눌러 배움 32로 이동해요.'
                ]
            }
        ]
    },
    32: {
        title: '배움 32: 겹받침 있는 단어 읽기',
        subtitle: '이해하기→읽기→확인하기를 활동별 페이지로 진행해요.',
        sections: [
            {
                label: '이해하기',
                title: '겹받침은 대표소리가 있어요',
                cards: [
                    '읽다 카드(읽다→익따)로 겹받침에서 대표소리가 나는 원리를 이해해요.',
                    '그림과 단어를 연결해 읽고, 읽으면서 쓰며, 발음이 달라지는 점을 구분해요.'
                ]
            },
            {
                label: '읽기 1',
                title: '겹받침 단어 읽기 (1)',
                cards: [
                    '읽다, 닭, 흙, 밝다 단어를 그림과 함께 읽고 대표소리를 확인해요.',
                    '읽다→익따, 닭→닥, 흙→흑, 밝다→박따처럼 소리 변화를 익혀요.'
                ]
            },
            {
                label: '읽기 2',
                title: '겹받침 단어 읽기 (2)',
                cards: [
                    '많다, 괜찮다, 넓다, 짧다 단어를 읽고 소리 나는 받침을 찾아요.',
                    '많다→만타, 괜찮다→괜찬타, 넓다→널따, 짧다→짤따처럼 발음을 비교해요.'
                ]
            },
            {
                label: '읽기 3',
                title: '겹받침 단어 읽기 (3)',
                cards: [
                    '늙다, 싫다, 앉다, 없다 단어를 읽고 소리 변화를 확인해요.',
                    '늙다→늑따, 싫다→실타, 앉다→안따, 없다→업따 발음을 반복해 읽어요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '읽고 알맞은 그림 찾기 (1)',
                cards: [
                    '읽다, 흙, 싫다, 없다, 닭 단어를 읽고 오른쪽에서 알맞은 그림과 연결해요.',
                    '그림-단어 짝을 맞춘 뒤 단어를 다시 한 번 정확하게 읽어요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '읽고 알맞은 그림 찾기 (2)',
                cards: [
                    '앉다, 많다, 밝다, 괜찮다, 넓다 단어를 읽고 알맞은 그림을 찾아 연결해요.',
                    '확인 활동을 모두 마친 뒤 마지막 페이지에서 완료하기 버튼을 눌러 배움 33으로 이동해요.'
                ]
            }
        ]
    },
    33: {
        title: '배움 33: 겹받침 단어 공부하기',
        subtitle: '읽기→확인하기 활동을 페이지별로 진행해요.',
        sections: [
            {
                label: '읽기 1',
                title: '겹받침 단어 읽기',
                cards: [
                    '읽다, 닭, 흙, 밝다 그림 단어를 읽고 대표소리를 함께 익혀요.',
                    '읽다/닭/흙/밝다의 받침 발음을 구분해 반복 읽어요.'
                ]
            },
            {
                label: '읽기 2',
                title: '겹받침 단어 읽기 (확장)',
                cards: [
                    '많다, 괜찮다, 넓다, 짧다 그림 단어를 읽어요.',
                    '많다·괜찮다·넓다·짧다의 발음을 정확하게 구분해 읽어요.'
                ]
            },
            {
                label: '읽기 3',
                title: '겹받침 단어 읽기 (심화)',
                cards: [
                    '늙다, 싫다, 앉다, 없다 그림 단어를 읽고 소리를 확인해요.',
                    '대표소리 발음으로 읽은 뒤 표기와 소리의 차이를 다시 점검해요.'
                ]
            },
            {
                label: '확인하기 1',
                title: '읽고 찾기 (1)',
                cards: [
                    '읽다/일다, 닭/달, 흙/훌, 밝다/박다처럼 비슷한 낱말 중 맞는 단어를 골라요.',
                    '한 칸씩 읽고 그림과 함께 정답 단어를 확인해요.'
                ]
            },
            {
                label: '확인하기 2',
                title: '읽고 찾기 (2)',
                cards: [
                    '많다/맍다, 괜찮다/괜찬다, 넓다/널다, 짧다/짤다, 없다/업다를 비교해 맞는 단어를 골라요.',
                    '모든 확인 활동을 마친 뒤 마지막 페이지에서 완료하기 버튼을 눌러 한글 학습을 마무리해요.'
                ]
            }
        ]
    }
};

const unitMeta = {
    vowel: { unit: 1, label: '모음', color: '#f59e0b' },
    consonant: { unit: 2, label: '자음', color: '#10b981' },
    noBatchimWord: { unit: 3, label: '받침 없는 단어 읽기', color: '#f97316' },
    complexVowel: { unit: 4, label: '복잡한 모음', color: '#8b5cf6' },
    complexVowelWord: { unit: 5, label: '복잡한 모음 단어 읽기', color: '#a855f7' },
    batchim: { unit: 6, label: '대표받침', color: '#ef4444' },
    batchimWord: { unit: 7, label: '대표받침 단어 읽기', color: '#f97316' },
    complexBatchim: { unit: 8, label: '복잡한 받침', color: '#0ea5e9' },
    complexBatchimWord: { unit: 9, label: '복잡한 받침 단어 읽기', color: '#0284c7' }
};

const learningPracticeFlows = {
    1: { listen: 'ㅡ, ㅣ, 둥근 해. 모음은 땅, 사람, 둥근 해에서 시작해요.', choices: ['ㅡ', 'ㅣ', '●'], writeLines: ['ㅡ ㅡ ㅡ ㅡ', 'ㅣ ㅣ ㅣ ㅣ', '● ● ● ●'] },
    2: { listen: 'ㅏ, ㅓ. ㅏ는 밝은 느낌, ㅓ는 어두운 느낌이에요.', choices: ['ㅏ', 'ㅓ', 'ㅡ', 'ㅣ'], writeLines: ['ㅏ ㅏ ㅏ ㅏ', 'ㅓ ㅓ ㅓ ㅓ'] },
    3: { listen: 'ㅗ, ㅜ. ㅗ는 올라가는 느낌, ㅜ는 내려가는 느낌이에요.', choices: ['ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'], writeLines: ['ㅗ ㅗ ㅗ ㅗ', 'ㅜ ㅜ ㅜ ㅜ'] },
    4: { listen: 'ㅡ, ㅣ. 가로선이 ㅡ, 세로선이 ㅣ예요.', choices: ['ㅡ', 'ㅣ', 'ㅗ', 'ㅏ'], writeLines: ['ㅡ ㅡ ㅡ ㅡ', 'ㅣ ㅣ ㅣ ㅣ'] },
    5: { listen: 'ㅑ, ㅕ. 짧은 선이 두 개 붙어 있어요.', choices: ['ㅑ', 'ㅕ', 'ㅏ', 'ㅓ'], writeLines: ['ㅑ ㅑ ㅑ ㅑ', 'ㅕ ㅕ ㅕ ㅕ'] },
    6: { listen: 'ㅛ, ㅠ. 세로선 두 개가 위에 있으면 ㅛ, 아래에 있으면 ㅠ예요.', choices: ['ㅛ', 'ㅠ', 'ㅗ', 'ㅜ'], writeLines: ['ㅛ ㅛ ㅛ ㅛ', 'ㅠ ㅠ ㅠ ㅠ'] },
    7: { listen: '아, 야, 어, 여, 오, 요, 우, 유, 으, 이. 배운 모음을 모두 읽어봐요.', choices: ['아', '야', '어', '여', '오', '요', '우', '유', '으', '이'], writeLines: ['아 야 어 여 오', '요 우 유 으 이'] },
    8: { listen: 'ㄱ, ㅋ, ㄲ. 기역, 키읔, 쌍기역 순서로 소리가 세져요.', choices: ['ㄱ', 'ㅋ', 'ㄲ'], writeLines: ['ㄱ ㄱ ㄱ ㄱ', 'ㅋ ㅋ ㄲ ㄲ'] },
    9: { listen: 'ㄴ, ㄷ, ㅌ, ㄸ. 기본/거센/된소리를 구분해요.', choices: ['ㄴ', 'ㄷ', 'ㅌ', 'ㄸ'], writeLines: ['ㄴ ㄴ ㄷ ㄷ', 'ㅌ ㅌ ㄸ ㄸ'] },
    10: { listen: 'ㅁ, ㅂ, ㅍ, ㅃ. 기본/거센/된소리를 구분해요.', choices: ['ㅁ', 'ㅂ', 'ㅍ', 'ㅃ'], writeLines: ['ㅁ ㅁ ㅂ ㅂ', 'ㅍ ㅍ ㅃ ㅃ'] },
    11: { listen: 'ㅅ, ㅈ, ㅊ, ㅉ, ㅆ. 기본/거센/된소리를 구분해요.', choices: ['ㅅ', 'ㅈ', 'ㅊ', 'ㅉ', 'ㅆ'], writeLines: ['ㅅ ㅅ ㅈ ㅈ', 'ㅊ ㅊ ㅉ ㅆ'] },
    12: { listen: 'ㅇ, ㅎ, ㄹ. 이응, 히읗, 리을이에요.', choices: ['ㅇ', 'ㅎ', 'ㄹ', '아'], writeLines: ['ㅇ ㅇ ㅎ ㅎ', 'ㄹ ㄹ 아 아'] },
    13: { listen: '아이, 나무, 기타, 나비. ㅏ와 ㅣ가 들어간 낱말이에요.', choices: ['아이', '나무', '기타', '나비'], writeLines: ['아이 나무', '기타 나비'] },
    14: { listen: '버스, 포도, 거미, 모기. ㅡ, ㅗ, ㅓ가 들어간 낱말이에요.', choices: ['버스', '포도', '거미', '모기'], writeLines: ['버스 포도', '거미 모기'] },
    15: { listen: 'ㅣ, ㅔ, ㅐ. 입이 점점 크게 벌어지는 소리예요.', choices: ['ㅣ', 'ㅔ', 'ㅐ', 'ㅏ'], writeLines: ['ㅔ ㅔ ㅔ ㅔ', 'ㅐ ㅐ ㅐ ㅐ'] },
    16: { listen: 'ㅖ, ㅒ. ㅔ와 ㅐ보다 짧은 선이 하나 더 있어요.', choices: ['ㅖ', 'ㅒ', 'ㅔ', 'ㅐ'], writeLines: ['ㅖ ㅖ ㅖ ㅖ', 'ㅒ ㅒ ㅒ ㅒ'] },
    17: { listen: 'ㅘ, ㅝ. ㅗ+ㅏ=ㅘ, ㅜ+ㅓ=ㅝ로 만들어요.', choices: ['ㅘ', 'ㅝ', '과', '원'], writeLines: ['ㅘ ㅘ ㅘ ㅘ', 'ㅝ ㅝ ㅝ ㅝ'] },
    18: { listen: 'ㅟ, ㅢ. ㅜ+ㅣ=ㅟ, ㅡ+ㅣ=ㅢ로 만들어요.', choices: ['ㅟ', 'ㅢ', '귀', '의'], writeLines: ['ㅟ ㅟ ㅟ ㅟ', 'ㅢ ㅢ ㅢ ㅢ'] },
    19: { listen: 'ㅞ, ㅙ, ㅚ. 모두 비슷한 소리가 나요.', choices: ['ㅞ', 'ㅙ', 'ㅚ', 'ㅔ'], writeLines: ['ㅞ ㅙ ㅚ ㅔ', 'ㅞ ㅞ ㅙ ㅙ'] },
    20: { listen: '의사, 과자, 바위, 거위. 복잡한 모음이 들어간 낱말이에요.', choices: ['의사', '과자', '바위', '거위'], writeLines: ['의사 과자', '바위 거위'] },
    21: { listen: '감, 밥, 봄, 집. ㅁ과 ㅂ 받침이에요.', choices: ['감', '밥', '봄', '집'], writeLines: ['감 봄 밥 집', '엄 숨 입 잡'] },
    22: { listen: '강, 공, 국, 각. ㅇ과 ㄱ 받침이에요.', choices: ['강', '공', '국', '각'], writeLines: ['강 공 국 각', '왕 쌍 박 축'] },
    23: { listen: '산, 문, 달, 길. ㄴ과 ㄹ 받침이에요.', choices: ['산', '문', '달', '길'], writeLines: ['산 문 달 길', '안 반 별 솔'] },
    24: { listen: '낮, 꽃, 밭, 곧. ㄷ 소리 받침이에요.', choices: ['낮', '꽃', '밭', '곧'], writeLines: ['낮 꽃 밭 곧', '옷 맞 낮 곧'] },
    25: { listen: '김밥, 국물, 달빛, 공원. 받침 단어예요.', choices: ['김밥', '국물', '달빛', '공원'], writeLines: ['김밥 국물', '달빛 공원'] },
    26: { listen: '낚시, 꽃밭, 곧장, 값. 대표 받침 단어예요.', choices: ['낚시', '꽃밭', '곧장', '값'], writeLines: ['낚시 꽃밭', '곧장 값'] },
    27: { listen: '잎, 없다, 숲, 좁다. ㅂ 받침 가족이에요.', choices: ['잎', '없다', '숲', '좁다'], writeLines: ['잎 없다', '숲 좁다'] },
    28: { listen: '낚다, 닭, 긁다, 흙. ㄱ 받침 가족이에요.', choices: ['낚다', '닭', '긁다', '흙'], writeLines: ['낚다 닭', '긁다 흙'] },
    29: { listen: '낮, 꽃, 밭, 빛. ㄷ 받침 가족이에요.', choices: ['낮', '꽃', '밭', '빛'], writeLines: ['낮 꽃', '밭 빛'] },
    30: { listen: '삶, 앉다, 닭, 읽다. 받침왕 도전이에요.', choices: ['삶', '앉다', '닭', '읽다'], writeLines: ['삶 앉다', '닭 읽다'] },
    31: { listen: '읽다, 닭고기, 삶다, 흙. 받침 가족 단어예요.', choices: ['읽다', '닭고기', '삶다', '흙'], writeLines: ['읽다 닭고기', '삶다 흙'] },
    32: { listen: '앉다, 읽다, 넓다, 닮다. 겹받침 단어를 읽어요.', choices: ['앉다', '읽다', '넓다', '닮다'], writeLines: ['앉다 읽다', '넓다 닮다'] },
    33: { listen: '밟다, 맑다, 짧다, 얇다. 겹받침 단어를 공부해요.', choices: ['밟다', '맑다', '짧다', '얇다'], writeLines: ['밟다 맑다', '짧다 얇다'] }
};

const learningUnits = {
    vowel: [
        { step: 0, title: '배움 시작: 모음과 자음', page: 12 },
        { step: 1, title: '배움 1: 모음의 시작', page: 13 },
        { step: 2, title: '배움 2: ㅏ, ㅓ 공부하기', page: 14 },
        { step: 3, title: '배움 3: ㅗ, ㅜ 공부하기', page: 16 },
        { step: 4, title: '배움 4: ㅡ, ㅣ 공부하기', page: 19 },
        { step: 5, title: '배움 5: ㅑ, ㅕ 공부하기', page: 23 },
        { step: 6, title: '배움 6: ㅛ, ㅠ 공부하기', page: 26 },
        { step: 7, title: '배움 7: 다시 공부하기', page: 29 }
    ],
    consonant: [
        { step: 8, title: '배움 8: ㄱ, ㅋ, ㄲ 공부하기', page: 35 },
        { step: 9, title: '배움 9: ㄴ, ㄷ, ㅌ, ㄸ 공부하기', page: 40 },
        { step: 10, title: '배움 10: ㅁ, ㅂ, ㅍ, ㅃ 공부하기', page: 46 },
        { step: 11, title: '배움 11: ㅅ, ㅈ, ㅊ, ㅉ, ㅆ 공부하기', page: 52 },
        { step: 12, title: '배움 12: ㅇ, ㅎ, ㄹ 공부하기', page: 60 }
    ],
    noBatchimWord: [
        { step: 13, title: '배움 13: ㅏ, ㅣ 단어 공부하기', page: 71 },
        { step: 14, title: '배움 14: ㅡ, ㅗ, ㅓ 단어 공부하기', page: 79 }
    ],
    complexVowel: [
        { step: 15, title: '배움 15: ㅐ, ㅔ', page: 92 },
        { step: 16, title: '배움 16: ㅖ, ㅒ', page: 96 },
        { step: 17, title: '배움 17: ㅘ, ㅝ', page: 100 },
        { step: 18, title: '배움 18: ㅟ, ㅢ', page: 103 },
        { step: 19, title: '배움 19: ㅞ, ㅙ, ㅚ', page: 106 }
    ],
    complexVowelWord: [
        { step: 20, title: '배움 20: 복잡한 모음 단어 공부하기', page: 113 }
    ],
    batchim: [
        { step: 21, title: '배움 21: ㅁ, ㅂ 받침', page: 125 },
        { step: 22, title: '배움 22: ㅇ, ㄱ 받침', page: 131 },
        { step: 23, title: '배움 23: ㄴ, ㄹ 받침', page: 137 },
        { step: 24, title: '배움 24: ㄷ 받침', page: 143 },
        { step: 25, title: '배움 25: 도전, 받침왕! (1)', page: 146 }
    ],
    batchimWord: [
        { step: 26, title: '배움 26: 대표받침 단어 읽기', page: 153 }
    ],
    complexBatchim: [
        { step: 27, title: '배움 27: ㅂ 받침가족', page: 165 },
        { step: 28, title: '배움 28: ㄱ 받침가족', page: 168 },
        { step: 29, title: '배움 29: ㄷ 받침가족', page: 171 },
        { step: 30, title: '배움 30: 도전, 받침왕! (2)', page: 175 }
    ],
    complexBatchimWord: [
        { step: 31, title: '배움 31: 받침가족 단어 공부하기', page: 183 },
        { step: 32, title: '배움 32: 겹받침 있는 단어 읽기', page: 190 },
        { step: 33, title: '배움 33: 겹받침 단어 공부하기', page: 191 }
    ]
};

function normalizeDigits(value = '') {
    return value.replace(/[\uFF10-\uFF19]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0xFEE0));
}

function getLearningLevelLabel(step) {
    return step < 0 ? '배움 새싹' : `배움 레벨 ${step}`;
}

function getLearningStepBadge(step) {
    return step < 0 ? '새싹' : String(step);
}

function ensureInfoDrawerPortal() {
    const drawer = document.getElementById('info-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (!drawer || !overlay) return;
    if (drawer.parentElement !== document.body) {
        document.body.appendChild(overlay);
        document.body.appendChild(drawer);
    }
}

const FIREBASE_DRAWING_COLLECTION = 'aiedueKoreanDrawingsV2';

function asNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}

function calculateAiedueLevel(experience) {
    return Math.max(1, Math.floor(asNumber(experience, 0) / 100) + 1);
}

function normalizeAiedueLevelExperience(userData = {}) {
    const rawExperience = Math.max(0, asNumber(userData?.aeduExperience ?? userData?.experience ?? userData?.exp ?? currentUserAeduExperience, 0));
    const explicitLevelRaw = userData?.aeduLevel ?? userData?.level ?? userData?.schoolLevel ?? currentUserAeduLevel;
    const explicitLevel = Number.isFinite(Number(explicitLevelRaw)) ? Math.max(1, Math.floor(Number(explicitLevelRaw))) : 1;
    const derivedLevel = calculateAiedueLevel(rawExperience);
    // 에이두 스쿨 구버전은 aeduExperience를 누적 EXP로 저장했고, 일부 계정은 level 필드만 수십 레벨로 갖고 있다.
    // 에이두 한글 UI/보상은 레벨 내부 0~99% 게이지를 쓰되, 저장된 학교 레벨을 절대 Lv.1로 낮추지 않는다.
    const aeduLevel = Math.max(explicitLevel, derivedLevel);
    const aeduExperience = rawExperience >= 100 ? (rawExperience % 100) : rawExperience;
    return { aeduLevel, aeduExperience };
}

function buildAiedueSchoolProfileSnapshot(userData = {}) {
    const balance = asNumber(userData?.balance ?? userData?.coins ?? userData?.aeduTokens ?? currentUserBalance ?? currentUserCoins, 0);
    const coins = balance;
    const aeduTokens = asNumber(userData?.aeduTokens ?? userData?.aeduToken ?? balance ?? currentUserAeduTokens, balance);
    const warningTokens = asNumber(userData?.warningTokens ?? currentUserWarningTokens, 0);
    const { aeduExperience, aeduLevel } = normalizeAiedueLevelExperience(userData);
    return {
        userId: userData?.uid || currentUserId || null,
        userCode: userData?.userCode ?? userData?.code ?? userData?.studentCode ?? null,
        userName: userData?.name || currentUserName || '이름 없음',
        userIcon: userData?.icon || currentUserIcon || '🐻',
        role: (userData?.role || currentUserRole || 'student').toLowerCase(),
        email: userData?.email || auth.currentUser?.email || null,
        teacherId: userData?.teacherId || userData?.createdBy || null,
        classId: userData?.classId || userData?.classCode || userData?.className || userData?.teacherId || null,
        classCode: userData?.classCode || null,
        className: userData?.className || null,
        coins,
        balance,
        aeduTokens,
        warningTokens,
        aeduExperience,
        aeduLevel,
        currentLearningStep: asNumber(userData?.currentLearningStep ?? currentLearningStep, -1),
        currentDrawingStep: asNumber(userData?.currentDrawingStep ?? currentUserDrawingStep, -1),
        currentDictationStep: asNumber(userData?.currentDictationStep ?? currentUserDictationStep, -1),
        unlockedLevels: normalizeUnlockedLevels(userData?.unlockedLevels, userData?.role || currentUserRole)
    };
}

function setCurrentAiedueSchoolWalletFromSnapshot(snapshot = {}) {
    const syncedBalance = asNumber(snapshot.balance ?? snapshot.coins ?? snapshot.aeduTokens, currentUserBalance ?? currentUserCoins);
    currentUserBalance = syncedBalance;
    currentUserCoins = syncedBalance;
    currentUserAeduTokens = asNumber(snapshot.aeduTokens, syncedBalance);
    currentUserWarningTokens = asNumber(snapshot.warningTokens, currentUserWarningTokens);
    const normalizedLevel = normalizeAiedueLevelExperience(snapshot);
    currentUserAeduLevel = normalizedLevel.aeduLevel;
    currentUserAeduExperience = normalizedLevel.aeduExperience;
}

// 전역 단계별 경험치 배율 데이터 (koreanExperienceMultipliers 마커)
window.koreanExperienceMultipliers = {
    max1: { s1: 1.0 },
    max2: { s1: 0.5, s2: 1.0 },
    max3: { s1: 0.33, s2: 0.66, s3: 1.0 },
    max4: { s1: 0.25, s2: 0.5, s3: 0.75, s4: 1.0 }
};

// 단계별 경험치 배율 계산 함수 (calculateStageExperienceMultiplier 마커)
function calculateStageExperienceMultiplier(activityStep) {
    const userUnlocked = normalizeUnlockedLevels(currentUserProfileSnapshot?.unlockedLevels ?? unlockedLevels, currentUserRole);
    const numericStep = Number(activityStep);
    if (currentUserRole !== 'teacher' && !userUnlocked.includes(numericStep)) return 0;
    const maxUnlockedStep = Math.max(1, ...userUnlocked.map(Number));
    const m = window.koreanExperienceMultipliers;
    let mapping = m[`max${maxUnlockedStep}`];
    if (!mapping) {
        return Math.min(1.0, activityStep / maxUnlockedStep);
    }
    const val = mapping[`s${numericStep}`];
    return typeof val === 'number' ? val : Math.min(1.0, numericStep / maxUnlockedStep);
}

async function saveKoreanExperienceMultipliers() {
    if (!currentUserId) return;
    const multipliers = {
        max1: {
            s1: asNumber(document.getElementById('exp-mult-m1-s1')?.value, 1.0)
        },
        max2: {
            s1: asNumber(document.getElementById('exp-mult-m2-s1')?.value, 0.5),
            s2: asNumber(document.getElementById('exp-mult-m2-s2')?.value, 1.0)
        },
        max3: {
            s1: asNumber(document.getElementById('exp-mult-m3-s1')?.value, 0.33),
            s2: asNumber(document.getElementById('exp-mult-m3-s2')?.value, 0.66),
            s3: asNumber(document.getElementById('exp-mult-m3-s3')?.value, 1.0)
        },
        max4: {
            s1: asNumber(document.getElementById('exp-mult-m4-s1')?.value, 0.25),
            s2: asNumber(document.getElementById('exp-mult-m4-s2')?.value, 0.5),
            s3: asNumber(document.getElementById('exp-mult-m4-s3')?.value, 0.75),
            s4: asNumber(document.getElementById('exp-mult-m4-s4')?.value, 1.0)
        }
    };
    const classId = currentUserId;
    try {
        await setDoc(doc(db, 'classes', classId), { koreanExperienceMultipliers: multipliers }, { merge: true });
        window.koreanExperienceMultipliers = multipliers;
        showModal('단계별 경험치 배율 설정이 저장되었습니다.');
        if (typeof window.loadStudents === 'function') {
            await window.loadStudents();
        }
    } catch (error) {
        console.warn('classes/{classId} 저장 실패, fallback 시도:', error);
        try {
            await setDoc(doc(db, 'users', currentUserId), { koreanSettings: { koreanExperienceMultipliers: multipliers } }, { merge: true });
            window.koreanExperienceMultipliers = multipliers;
            showModal('단계별 경험치 배율 설정이 저장되었습니다. (교사 개인 설정)');
            if (typeof window.loadStudents === 'function') {
                await window.loadStudents();
            }
        } catch (err2) {
            console.error('교사 설정 저장 실패', err2);
            showModal('설정 저장 실패: ' + err2.message);
        }
    }
}

window.saveKoreanExperienceMultipliers = saveKoreanExperienceMultipliers;

async function loadKoreanExperienceMultipliers(teacherId, classId) {
    let loaded = null;
    const classIds = Array.from(new Set([classId, teacherId].filter(Boolean)));
    for (const candidateClassId of classIds) {
        try {
            const snap = await getDoc(doc(db, 'classes', candidateClassId));
            if (snap.exists() && snap.data().koreanExperienceMultipliers) {
                loaded = snap.data().koreanExperienceMultipliers;
                break;
            }
        } catch (e) { console.warn('classes multipliers load error', e); }
    }
    if (!loaded && teacherId) {
        try {
            const snap = await getDoc(doc(db, 'users', teacherId));
            if (snap.exists() && snap.data().koreanSettings?.koreanExperienceMultipliers) {
                loaded = snap.data().koreanSettings.koreanExperienceMultipliers;
            }
        } catch (e) { console.warn('teacher profile multipliers load error', e); }
    }
    if (!loaded && classId) {
        try {
            const snap = await getDoc(doc(db, 'users', classId));
            if (snap.exists() && snap.data().koreanSettings?.koreanExperienceMultipliers) {
                loaded = snap.data().koreanSettings.koreanExperienceMultipliers;
            }
        } catch (e) { console.warn('class-owner profile multipliers load error', e); }
    }
    if (loaded) {
        window.koreanExperienceMultipliers = loaded;
    } else {
        window.koreanExperienceMultipliers = {
            max1: { s1: 1.0 },
            max2: { s1: 0.5, s2: 1.0 },
            max3: { s1: 0.33, s2: 0.66, s3: 1.0 },
            max4: { s1: 0.25, s2: 0.5, s3: 0.75, s4: 1.0 }
        };
    }
}

function applyAieduePointReward(points = 0) {
    const reward = Math.max(0, asNumber(points, 0));
    if (!reward) return {};
    currentUserCoins = asNumber(currentUserCoins, 0) + reward;
    currentUserBalance = asNumber(currentUserBalance, currentUserCoins - reward) + reward;
    currentUserAeduTokens = asNumber(currentUserAeduTokens, currentUserBalance - reward) + reward;

    currentUserProfileSnapshot = {
        ...currentUserProfileSnapshot,
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens
    };

    // UI 반영
    const coinsEl = document.getElementById('dashboard-coins'); if (coinsEl) coinsEl.innerText = currentUserCoins;
    const coinsHeaderEl = document.getElementById('dashboard-coins-header'); if (coinsHeaderEl) coinsHeaderEl.innerText = currentUserCoins;
    updateSyncedActivityHeaders({ name: currentUserName, coins: currentUserCoins, icon: currentUserIcon });

    return {
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        updatedAt: serverTimestamp()
    };
}

const AIEDUE_LEVEL_UP_POINT_REWARD = 1000;

function applyAiedueExperienceReward(percent = 0, meta = {}) {
    const addedExp = Math.max(0, asNumber(percent, 0));
    if (!addedExp) return {};

    const beforeLevel = Math.max(1, asNumber(currentUserAeduLevel, 1));
    const beforeWarningTokens = Math.max(0, Math.floor(asNumber(currentUserWarningTokens, 0)));
    let newExp = asNumber(currentUserAeduExperience, 0) + addedExp;
    let levelUpCount = 0;
    let removedWarningTokens = 0;
    let levelUpPoints = 0;
    while (newExp >= 100) {
        newExp -= 100;
        levelUpCount++;
    }

    newExp = Math.min(99.999, Math.max(0, parseFloat(newExp.toFixed(3))));
    currentUserAeduExperience = newExp;

    if (levelUpCount > 0) {
        currentUserAeduLevel = beforeLevel + levelUpCount;
        removedWarningTokens = Math.min(beforeWarningTokens, levelUpCount);
        currentUserWarningTokens = beforeWarningTokens - removedWarningTokens;
        levelUpPoints = levelUpCount * AIEDUE_LEVEL_UP_POINT_REWARD;
        applyAieduePointReward(levelUpPoints);

        if (typeof showModal === 'function' && !meta.deferLevelUpNotice) {
            showModal(`🎉 축하합니다! 레벨업했습니다!\nLv. ${currentUserAeduLevel} (보상 ${levelUpPoints}포인트${removedWarningTokens ? ` · 주의토큰 ${removedWarningTokens}개 차감` : ''})`);
        }
    }

    const source = String(meta.activityLabel || meta.source || activityRoutes[getVisibleActivityRoute()]?.label || '에이두 한글 활동').slice(0, 80);
    const stageMultiplier = Math.max(0, asNumber(meta.stageMultiplier, 1));
    const baseReward = Math.max(0, asNumber(meta.baseReward, stageMultiplier ? addedExp / stageMultiplier : addedExp));
    const multiplierRate = Math.round(stageMultiplier * 100);
    const studentName = String(currentUserProfileSnapshot?.name || currentUserName || '학생').slice(0, 40);
    let activityMessage = `${studentName}이 ${source}을 통해 기본 경험치 ${baseReward.toFixed(1)}%의 ${multiplierRate}%인 ${addedExp.toFixed(1)}%를 받았다.`;
    if (levelUpCount > 0) {
        activityMessage += ` 레벨 ${beforeLevel}에서 ${currentUserAeduLevel}으로 레벨업하며 돈 ${levelUpPoints.toLocaleString()}점이 지급되고 주의토큰 ${removedWarningTokens}개가 감소되었다.`;
    }
    const activity = {
        id: `experience_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        type: 'experience',
        source,
        baseExperience: baseReward,
        multiplier: stageMultiplier,
        grantedExperience: addedExp,
        levelBefore: beforeLevel,
        levelAfter: currentUserAeduLevel,
        levelUpPoints,
        warningTokensReduced: removedWarningTokens,
        createdAtMs: Date.now(),
        message: activityMessage
    };
    const koreanActivityLog = currentUserRole === 'student'
        ? [activity, ...(Array.isArray(currentUserProfileSnapshot?.koreanActivityLog) ? currentUserProfileSnapshot.koreanActivityLog : [])].slice(0, 200)
        : (Array.isArray(currentUserProfileSnapshot?.koreanActivityLog) ? currentUserProfileSnapshot.koreanActivityLog : []);

    currentUserProfileSnapshot = {
        ...currentUserProfileSnapshot,
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel,
        koreanActivityLog
    };

    updateSyncedActivityHeaders({ name: currentUserName, coins: currentUserCoins, icon: currentUserIcon });

    return {
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel,
        koreanActivityLog,
        updatedAt: serverTimestamp()
    };
}

function getVisibleActivityExperienceTarget() {
    const hud = document.getElementById('aiedue-rpg-hud');
    return hud && !hud.classList.contains('hidden') ? hud : null;
}

function getExperienceAnimationStart(source) {
    const canvas = source instanceof HTMLCanvasElement ? source : source?.closest?.('.trace-canvas-wrap')?.querySelector?.('canvas');
    if (canvas) {
        const paths = Array.isArray(canvas._tracePaths) ? canvas._tracePaths : [];
        const lastPath = paths[paths.length - 1];
        const lastPoint = Array.isArray(lastPath) ? lastPath[lastPath.length - 1] : null;
        const rect = canvas.getBoundingClientRect();
        if (lastPoint && Number.isFinite(lastPoint.x) && Number.isFinite(lastPoint.y)) {
            return { x: rect.left + lastPoint.x, y: rect.top + lastPoint.y };
        }
        return { x: rect.right - 28, y: rect.top + rect.height * 0.45 };
    }
    const rect = source?.getBoundingClientRect?.();
    return rect
        ? { x: rect.left + rect.width * 0.7, y: rect.top + rect.height * 0.5 }
        : { x: window.innerWidth * 0.5, y: window.innerHeight * 0.6 };
}

async function animateExperienceOrb(source, percent, onApproach) {
    const target = getVisibleActivityExperienceTarget();
    if (!target || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const track = target.querySelector('.rpg-experience-track, .activity-exp-track') || target;
    const targetRect = track.getBoundingClientRect();
    const start = getExperienceAnimationStart(source);
    const end = { x: targetRect.left + targetRect.width * 0.5, y: targetRect.top + targetRect.height * 0.5 };
    const orb = document.createElement('div');
    orb.className = 'aiedue-exp-orb';
    orb.setAttribute('aria-hidden', 'true');
    orb.innerHTML = `<span>+${Math.floor(percent)}%</span>`;
    orb.style.left = `${start.x}px`;
    orb.style.top = `${start.y}px`;
    document.body.appendChild(orb);

    let approachTimer = null;
    try {
        if (typeof onApproach === 'function') approachTimer = window.setTimeout(onApproach, 590);
        const animation = orb.animate([
            { transform: 'translate(-50%, -50%) scale(.65)', opacity: 0 },
            { transform: 'translate(-50%, -70%) scale(1.12)', opacity: 1, offset: 0.18 },
            { transform: `translate(calc(-50% + ${(end.x - start.x) * 0.6}px), calc(-50% + ${(end.y - start.y) * 0.46 - 48}px)) scale(1)`, opacity: 1, offset: 0.65 },
            { transform: `translate(calc(-50% + ${end.x - start.x}px), calc(-50% + ${end.y - start.y}px)) scale(.55)`, opacity: 0.2 }
        ], { duration: 820, easing: 'cubic-bezier(.2,.82,.25,1)', fill: 'forwards' });
        await animation.finished;
    } catch {}
    if (approachTimer) window.clearTimeout(approachTimer);
    if (typeof onApproach === 'function') onApproach();
    orb.remove();
    target.classList.remove('experience-received');
    requestAnimationFrame(() => target.classList.add('experience-received'));
    window.setTimeout(() => target.classList.remove('experience-received'), 700);
}

async function awardKoreanPracticeExperience(percent, source, meta = {}) {
    const baseReward = Math.max(0, asNumber(percent, 0));
    const stageMultiplier = calculateStageExperienceMultiplier(2);
    const reward = baseReward * stageMultiplier;
    if (!reward) return { grantedExperience: 0, stageMultiplier };
    let wallet = null;
    const applyReward = () => {
        if (wallet) return;
        wallet = applyAiedueExperienceReward(reward, { ...meta, source: meta.source || source, baseReward, stageMultiplier });
    };
    await animateExperienceOrb(source, reward, applyReward);
    applyReward();
    if (currentUserId) {
        try {
            await setDoc(doc(db, 'users', currentUserId), wallet, { merge: true });
        } catch (error) {
            console.warn('한글 연습 경험치 저장 실패', error);
        }
    }
    return { ...wallet, grantedExperience: reward, stageMultiplier };
}

function isTraceWritingComplete(canvas) {
    if (!canvas) return false;
    const cells = Array.isArray(canvas._traceCells) ? canvas._traceCells : [];
    const completed = canvas._traceCompleted || {};
    return cells.length > 0 && cells.every((cell) => {
        const totalStrokes = Array.isArray(cell.strokes) ? cell.strokes.length : 0;
        return totalStrokes > 0 && asNumber(completed[cell.index], 0) >= totalStrokes;
    });
}

let learningDetailCompletionObserver = null;
let learningDetailNavGuideShownForPage = '';
let learningDetailStaticGuideTimer = null;

function resetLearningDetailNavigationGuide() {
    learningDetailCompletionObserver?.disconnect();
    learningDetailCompletionObserver = null;
    window.clearTimeout(learningDetailStaticGuideTimer);
    learningDetailStaticGuideTimer = null;
    const guide = document.getElementById('learning-detail-nav-guide');
    const nav = document.getElementById('learning-detail-nav');
    guide?.classList.add('hidden');
    if (guide) guide.textContent = '';
    nav?.querySelectorAll('.learning-nav-guided').forEach((button) => button.classList.remove('learning-nav-guided'));
}

function showLearningDetailNavigationGuide() {
    const section = document.getElementById('learning-detail-section');
    const nav = document.getElementById('learning-detail-nav');
    const guide = document.getElementById('learning-detail-nav-guide');
    if (!section || section.classList.contains('hidden') || !nav || !guide) return;
    const completeButton = document.getElementById('learning-detail-complete-btn');
    const nextButton = document.getElementById('learning-detail-next-btn');
    const target = completeButton && !completeButton.classList.contains('hidden') ? completeButton : nextButton;
    if (!target || target.disabled) return;
    const pageKey = `${section.dataset.currentStep || ''}:${section.dataset.currentSection || ''}`;
    if (learningDetailNavGuideShownForPage === pageKey) return;
    learningDetailNavGuideShownForPage = pageKey;
    const isComplete = target === completeButton;
    guide.textContent = isComplete
        ? '활동을 모두 마쳤어요. 완료하기를 눌러 주세요.'
        : '활동을 마쳤어요. 다음으로를 눌러 주세요.';
    guide.classList.remove('hidden');
    target.classList.remove('learning-nav-guided');
    requestAnimationFrame(() => target.classList.add('learning-nav-guided'));
    nav.scrollIntoView({
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'end'
    });
}

function learningDetailPageLooksComplete(root) {
    if (!root) return false;
    const completionGroups = [
        ['.choice-chip-button', 'correct'],
        ['[data-family-card]', 'is-heard'],
        ['.lesson25-question-card', 'is-complete'],
        ['.lesson25-reading-check', 'is-complete'],
        ['.lesson25-path-stage', 'is-complete'],
        ['.lesson26-find-card', 'is-complete'],
        ['.lesson21-m-pair', 'is-complete'],
        ['.lesson21-m-syllable-cell.is-target', 'is-complete'],
        ['.lesson21-b-word-item', 'is-complete'],
        ['.lesson21-m-picture-item', 'is-complete']
    ];
    let foundRequirements = false;
    for (const [selector, completedClass] of completionGroups) {
        const items = [...root.querySelectorAll(selector)];
        if (!items.length) continue;
        foundRequirements = true;
        if (!items.every((item) => item.classList.contains(completedClass))) return false;
    }
    const traceCanvases = [...root.querySelectorAll('.trace-writing-canvas')];
    if (traceCanvases.length) {
        foundRequirements = true;
        if (!traceCanvases.every((canvas) => isTraceWritingComplete(canvas) || canvas.dataset.completed === 'true')) return false;
    }
    return foundRequirements;
}

function setupLearningDetailCompletionGuide() {
    resetLearningDetailNavigationGuide();
    learningDetailNavGuideShownForPage = '';
    const content = document.getElementById('learning-detail-content');
    if (!content) return;
    const check = () => {
        if (learningDetailPageLooksComplete(content)) showLearningDetailNavigationGuide();
    };
    learningDetailCompletionObserver = new MutationObserver(check);
    learningDetailCompletionObserver.observe(content, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'data-completed']
    });
    const trackedActivitySelector = 'canvas, [data-family-card], .choice-chip-button, .lesson25-question-card, .lesson25-reading-check, .lesson25-path-stage, .lesson26-find-card, .lesson21-m-pair, .lesson21-m-syllable-cell.is-target, .lesson21-b-word-item, .lesson21-m-picture-item';
    const hasTrackedActivity = Boolean(content.querySelector(trackedActivitySelector));
    const reviewButtons = hasTrackedActivity ? [] : [...content.querySelectorAll('button')].filter((button) => {
        const label = button.textContent?.trim() || '';
        return !button.disabled && !/다시|지우기|초기화|한 번 더|다음 문제/.test(label);
    });
    if (reviewButtons.length) {
        reviewButtons.forEach((button) => button.addEventListener('click', () => {
            button.dataset.learningReviewed = 'true';
            if (!learningDetailPageLooksComplete(content)
                && reviewButtons.every((item) => item.dataset.learningReviewed === 'true')) {
                showLearningDetailNavigationGuide();
            }
        }));
    } else if (!hasTrackedActivity) {
        learningDetailStaticGuideTimer = window.setTimeout(showLearningDetailNavigationGuide, 1200);
    }
}

window.showLearningDetailNavigationGuide = showLearningDetailNavigationGuide;

function escapeKoreanShopHtml(value = '') {
    return escapeHtml(value);
}

function escapeHtml(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function escapeInlineJsString(value = '') {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/"/g, '\\x22')
        .replace(/\x60/g, '\\x60')
        .replace(/</g, '\\x3C')
        .replace(/>/g, '\\x3E')
        .replace(/&/g, '\\x26');
}

function safeImageSource(value = '') {
    const source = String(value ?? '').trim();
    if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(source)) return source;
    if (/^blob:https?:\/\//i.test(source)) return source;
    if (/^https:\/\//i.test(source)) return source;
    if (/^(?:\.\/|\/)?[a-z0-9_./-]+\.(?:png|jpe?g|webp|gif)(?:\?[a-z0-9=&._-]+)?$/i.test(source)) return source;
    return '';
}

let lastModalTrigger = null;

const SAFE_MODAL_ACTIONS = new Set([
    'changeLimitBreakDifficulty',
    'changeMissionSelection',
    'closeAiedueKoreanModal',
    'confirmAiedueKoreanDistributeShopItem',
    'confirmAiedueKoreanShopPurchase',
    'deleteAiedueKoreanShopItem',
    'distributeAllAiedueKoreanShopItems',
    'editAiedueKoreanShopItem',
    'enterAiedueCraftAsTeacher',
    'handleModalConfirm',
    'openAiedueKoreanDistributeShopItem',
    'openAiedueKoreanShopItemEditor',
    'openAiedueCraftShop',
    'openKoreanStudentReport',
    'purchaseAiedueCraftAccess',
    'purchaseAiedueKoreanShopItem',
    'saveAiedueKoreanShopItem',
    'selectDrawingTemplate',
    'startLimitBreakChallenge',
    'startTodayLiteracyMission'
]);

function isSafeModalAction(handler = '') {
    const source = String(handler).trim();
    const match = source.match(/^(?:window\.)?([A-Za-z_$][\w$]*)\(([^()]*)\)(?:;\s*closeAiedueKoreanModal\(\);?)?$/);
    if (!match || !SAFE_MODAL_ACTIONS.has(match[1])) return false;
    return /^[\w\s'",.-]*$/.test(match[2]);
}

function sanitizeModalHtml(markup = '') {
    const template = document.createElement('template');
    template.innerHTML = String(markup);
    template.content.querySelectorAll('script, iframe, object, embed, link, meta, style, form, svg, math').forEach((node) => node.remove());
    template.content.querySelectorAll('*').forEach((element) => {
        Array.from(element.attributes).forEach((attribute) => {
            const name = attribute.name.toLowerCase();
            if (name.startsWith('on')) {
                if (name !== 'onclick' || !isSafeModalAction(attribute.value)) element.removeAttribute(attribute.name);
                return;
            }
            if (['srcdoc', 'formaction', 'xlink:href'].includes(name)) {
                element.removeAttribute(attribute.name);
                return;
            }
            if (name === 'src') {
                const safeSource = safeImageSource(attribute.value);
                if (safeSource) element.setAttribute('src', safeSource);
                else element.removeAttribute('src');
                return;
            }
            if (name === 'href') {
                const href = String(attribute.value || '').trim();
                if (!/^(?:https:\/\/|mailto:|#|\/(?!\/)|\.\/)/i.test(href)) element.removeAttribute('href');
            }
        });
        if (element.getAttribute('target') === '_blank') element.setAttribute('rel', 'noopener noreferrer');
    });
    return template.innerHTML;
}

function formatAiedueShopCurrency(value = 0) {
    return `${Math.max(0, Math.floor(asNumber(value, 0))).toLocaleString('ko-KR')}점`;
}

function calculateKoreanShopPrice(item = {}, profile = currentUserProfileSnapshot) {
    const basePrice = Math.max(0, Math.floor(asNumber(item.price, 0)));
    const warningTokenCount = Math.max(0, Math.floor(asNumber(profile?.warningTokens, 0)));
    const multiplier = warningTokenCount > 0 ? Math.min(5, warningTokenCount + 1) : 1;
    return { basePrice, warningTokenCount, multiplier, adjustedPrice: basePrice * multiplier };
}

async function loadAiedueKoreanAssignedShopItems() {
    if (!currentUserId) return [];
    const assignmentsRef = collection(db, `users/${currentUserId}/assignedShopItems`);
    let assignmentSnapshot;
    try {
        assignmentSnapshot = await getDocs(query(assignmentsRef, orderBy('assignedAt', 'desc')));
    } catch (error) {
        console.warn('assignedShopItems orderBy query failed, retrying without order', error);
        assignmentSnapshot = await getDocs(assignmentsRef);
    }
    const assignments = assignmentSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    const displayItems = [];
    for (const assignment of assignments) {
        let item = null;
        if (assignment.itemId) {
            try {
                const itemSnap = await getDoc(doc(db, 'shopItems', assignment.itemId));
                if (itemSnap.exists()) item = { id: itemSnap.id, ...itemSnap.data() };
            } catch (error) {
                console.warn('assigned shop item fetch failed', assignment.itemId, error);
            }
        }
        if (!item && (assignment.name || assignment.itemName)) {
            item = {
                id: assignment.itemId || assignment.id,
                name: assignment.name || assignment.itemName,
                description: assignment.description || '',
                price: assignment.price || assignment.basePrice || 0,
                imageUrl: assignment.imageUrl || '',
                teacherId: assignment.teacherId,
                teacherName: assignment.teacherName
            };
        }
        if (!item) continue;
        item.teacherId = item.teacherId || assignment.teacherId || currentUserProfileSnapshot.teacherId || null;
        item.teacherName = item.teacherName || assignment.teacherName || '';
        displayItems.push({ assignment, item });
        aiedueKoreanShopItemsCache.set(item.id, item);
    }
    return displayItems;
}

function showKoreanShopModal(body) {
    const modal = document.getElementById('result-modal');
    modal.dataset.plainClose = 'true';
    showModal(`<div class="text-left relative"><button type="button" class="absolute -top-2 right-0 text-4xl font-black text-gray-400 hover:text-gray-700" onclick="closeAiedueKoreanModal()">×</button>${body}</div>`, { hideConfirm: true, hideIcon: true, plainClose: true });
}

window.closeAiedueKoreanModal = function() {
    const modal = document.getElementById('result-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        modal.dataset.plainClose = '';
    }
    if (lastModalTrigger?.isConnected) lastModalTrigger.focus();
    lastModalTrigger = null;
}

function renderAiedueKoreanShopItems(displayItems = []) {
    return `<div class="korean-shop-grid custom-scrollbar">
        <div class="aiedu-craft-shop-card korean-embed-card p-4 rounded-3xl shadow-sm flex flex-col">
            <div class="aiedu-craft-card-hero">
                <div class="aiedu-craft-card-icon" aria-hidden="true">⛏️</div>
                <div class="min-w-0">
                    <div class="text-xs font-black text-amber-200 tracking-widest">ALWAYS FIRST</div>
                    <div class="text-2xl font-black">에이두 크래프트</div>
                    <div class="text-sm text-white/80 mt-1">내 에이두 계정으로 바로 연결되는 실시간 3D 크래프트 월드</div>
                </div>
            </div>
            <div class="flex items-center justify-between gap-3 mt-4">
                <div><div class="text-xs font-bold text-gray-500">고정 가격</div><div class="text-xl font-black text-amber-600">1,000점</div></div>
                <div class="aiedu-craft-card-actions flex-1 max-w-md">
                    <button type="button" class="btn-outline aiedu-craft-shop-link px-4 py-2 text-sm" onclick="openAiedueCraftShop()">상점</button>
                    <button type="button" class="btn-primary px-4 py-2 text-sm" onclick="purchaseAiedueCraftAccess()">구매</button>
                </div>
            </div>
        </div>
        ${displayItems.map(({ assignment, item }) => {
            const pricing = calculateKoreanShopPrice(item);
            const assignedAt = assignment.assignedAt && typeof assignment.assignedAt.toDate === 'function'
                ? assignment.assignedAt.toDate().toLocaleString('ko-KR')
                : '';
            const imageSource = safeImageSource(item.imageUrl);
            const imageHtml = imageSource
                ? `<img src="${escapeHtml(imageSource)}" alt="${escapeKoreanShopHtml(item.name || '상점 물품')}" class="w-full h-28 object-cover rounded-2xl mb-3 bg-gray-100" onerror="this.style.display='none'">`
                : `<div class="w-full h-28 rounded-2xl mb-3 bg-amber-50 flex items-center justify-center text-5xl">🎁</div>`;
            const priceHtml = pricing.warningTokenCount > 0
                ? `<div class="text-sm"><div class="line-through text-gray-400">원래 ${formatAiedueShopCurrency(pricing.basePrice)}</div><div class="font-black text-red-500">현재 ${formatAiedueShopCurrency(pricing.adjustedPrice)}</div><div class="text-xs text-gray-500">주의 토큰 ${pricing.warningTokenCount}개로 ${pricing.multiplier}배</div></div>`
                : `<div class="font-black text-amber-600">${formatAiedueShopCurrency(pricing.basePrice)}</div>`;
            return `<div class="korean-embed-card p-4 bg-white border border-amber-100 rounded-3xl shadow-sm flex flex-col">
                ${imageHtml}
                <div class="flex-grow">
                    <div class="text-lg font-black text-[#2c3e50]">${escapeKoreanShopHtml(item.name || '상점 물품')}</div>
                    <div class="text-xs text-gray-400 mt-1">${escapeKoreanShopHtml(item.teacherName || '선생님')} ${assignedAt ? `· ${escapeKoreanShopHtml(assignedAt)} 배부` : ''}</div>
                    <div class="text-sm text-gray-600 mt-2 min-h-[2.25rem]">${escapeKoreanShopHtml(item.description || '')}</div>
                </div>
                <div class="flex items-center justify-between gap-3 mt-4">
                    ${priceHtml}
                    <button type="button" class="btn-primary px-4 py-2 text-sm" onclick="confirmAiedueKoreanShopPurchase('${escapeInlineJsString(item.id)}')">구매</button>
                </div>
            </div>`;
        }).join('')}
        ${displayItems.length ? '' : '<div class="text-center py-8 text-gray-500 font-bold md:col-span-2 xl:col-span-3">아직 선생님이 배부한 다른 상점 물품이 없어요.</div>'}
    </div>`;
}

async function getAiedueKoreanClassStudents() {
    const students = new Map();
    try {
        const classSnap = await getDoc(doc(db, 'classes', currentUserId));
        const ids = classSnap.exists() && Array.isArray(classSnap.data().students) ? classSnap.data().students : [];
        const snaps = await Promise.all(ids.map((sid) => getDoc(doc(db, 'users', sid)).catch(() => null)));
        snaps.forEach((snap) => { if (snap?.exists()) students.set(snap.id, { id: snap.id, ...snap.data() }); });
    } catch (error) { console.warn('class students fetch failed', error); }
    try {
        const teacherSnap = await getDocs(query(collection(db, 'users'), where('teacherId', '==', currentUserId)));
        teacherSnap.docs.forEach((snap) => {
            const data = snap.data() || {};
            if ((data.role || 'student') === 'student') students.set(snap.id, { id: snap.id, ...data });
        });
    } catch (error) { console.warn('teacherId students fetch failed', error); }
    return Array.from(students.values()).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

async function loadAiedueKoreanTeacherShopItems() {
    let snap;
    try {
        snap = await getDocs(query(collection(db, 'shopItems'), where('teacherId', '==', currentUserId), orderBy('createdAt', 'desc')));
    } catch (error) {
        snap = await getDocs(query(collection(db, 'shopItems'), where('teacherId', '==', currentUserId)));
    }
    const items = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    aiedueKoreanShopItemsCache.clear();
    items.forEach((item) => aiedueKoreanShopItemsCache.set(item.id, item));
    return items;
}

function renderAiedueKoreanTeacherShop(items = []) {
    const rows = items.length ? items.map((item) => `
        <div class="korean-embed-card p-4 bg-white rounded-3xl border flex flex-col md:flex-row md:items-center gap-3">
            <div class="flex-1"><div class="text-lg font-black text-[#2c3e50]">${escapeKoreanShopHtml(item.name || '상점 물품')}</div><div class="text-sm text-gray-500">${escapeKoreanShopHtml(item.description || '')}</div><div class="text-amber-600 font-black mt-1">${formatAiedueShopCurrency(item.price)}</div></div>
            <div class="flex gap-2 flex-wrap justify-end">
                <button type="button" class="btn-primary px-3 py-2 text-sm" onclick="openAiedueKoreanDistributeShopItem('${escapeInlineJsString(item.id)}')">항목별 배부</button>
                <button type="button" class="btn-outline px-3 py-2 text-sm" onclick="editAiedueKoreanShopItem('${escapeInlineJsString(item.id)}')">수정</button>
                <button type="button" class="btn-outline px-3 py-2 text-sm text-red-500" onclick="deleteAiedueKoreanShopItem('${escapeInlineJsString(item.id)}')">삭제</button>
            </div>
        </div>`).join('') : '<div class="text-center py-10 text-gray-500 font-bold">등록한 상점 물품이 없어요. 추가 버튼으로 만들어보세요.</div>';
    return `<div class="aiedu-craft-shop-card korean-embed-card p-5 rounded-3xl shadow-sm mb-5">
        <div class="aiedu-craft-card-hero"><div class="aiedu-craft-card-icon" aria-hidden="true">⛏️</div><div><div class="text-xs font-black text-amber-200 tracking-widest">TEACHER CRAFT</div><div class="text-2xl font-black">에이두 크래프트</div><div class="text-sm text-white/80 mt-1">교사 계정으로 크래프트에 접속하고 상점을 이용할 수 있어요.</div></div></div>
        <div class="flex flex-wrap justify-end gap-2 mt-4"><button type="button" class="btn-outline px-4 py-2" onclick="enterAiedueCraftAsTeacher()">크래프트 접속</button><button type="button" class="btn-primary px-4 py-2" onclick="openAiedueCraftShop()">크래프트 상점 이용</button></div>
    </div><div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4 pr-10"><div><h3 class="text-2xl font-black text-[#2c3e50]">🛒 교사 상점 관리</h3><p class="text-sm text-gray-500 font-bold">에이두 스쿨과 같은 shopItems / assignedShopItems를 관리해요.</p></div><div class="flex gap-2 flex-wrap"><button type="button" class="btn-primary px-4 py-2" onclick="openAiedueKoreanShopItemEditor()">추가</button><button type="button" class="btn-outline px-4 py-2" onclick="distributeAllAiedueKoreanShopItems()">내 학급 전체 배부</button></div></div><div class="space-y-3 max-h-[55vh] overflow-y-auto custom-scrollbar pr-1">${rows}</div>`;
}

async function openAiedueKoreanTeacherShop() {
    showKoreanShopModal('<div class="text-center py-8 font-black text-[#2c3e50]">교사 상점을 불러오는 중이에요...</div>');
    try {
        const items = await loadAiedueKoreanTeacherShopItems();
        showKoreanShopModal(renderAiedueKoreanTeacherShop(items));
    } catch (error) {
        console.error('teacher shop load failed', error);
        showModal('교사 상점 정보를 불러오지 못했어요.');
    }
}

window.openAiedueKoreanShop = async function() {
    if (!loginSuccess || !currentUserId) {
        showModal('먼저 로그인하면 상점을 볼 수 있어요.');
        return;
    }
    if (currentUserRole === 'teacher') {
        await openAiedueKoreanTeacherShop();
        return;
    }
    showKoreanShopModal('<div class="text-center py-8 font-black text-[#2c3e50]">상점 물품을 불러오는 중이에요...</div>');
    try {
        aiedueKoreanShopItemsCache.clear();
        const displayItems = await loadAiedueKoreanAssignedShopItems();
        const balance = currentUserBalance || currentUserCoins || 0;
        showKoreanShopModal(`
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-4 pr-10">
                <h3 class="text-2xl font-black text-[#2c3e50]">🛒 에이두 상점</h3>
                <div class="px-4 py-2 rounded-2xl bg-amber-50 text-amber-700 font-black">내 포인트 ${formatAiedueShopCurrency(balance)}</div>
            </div>
            ${renderAiedueKoreanShopItems(displayItems)}
        `);
    } catch (error) {
        console.error('Aiedue Korean shop load failed', error);
        showModal('상점 물품을 불러오지 못했어요. 잠시 후 다시 눌러주세요.');
    }
}

// =========================================================================
// --- AIEDUE CRAFT ACCOUNT LINK + NATIVE SHOP (ported from y5496694/aiedue) ---
// =========================================================================
const AIEDUE_CRAFT_ACCESS_PRICE = 1000;
const AIEDUE_CRAFT_URL = 'https://aiedue.ddns.net/Aiedue_Craft.html';
const AIEDUE_CRAFT_API_BASE = 'https://aiedue.ddns.net/craft-api';
const AIEDUE_CRAFT_FIXED_KEYS = new Set(['coal', 'iron_ingot', 'gold_ingot', 'diamond']);

function getAiedueCraftTeacherUsername(email = '') {
    return String(email || '').trim().split('@')[0];
}

function getAiedueCraftStudentCode(profile = currentUserProfileSnapshot) {
    const explicitCode = profile?.userCode ?? profile?.code ?? profile?.studentCode ?? '';
    if (String(explicitCode ?? '').trim()) return String(explicitCode).trim();
    const email = String(profile?.email || auth.currentUser?.email || '').trim();
    return email.endsWith('@abc.com') ? email.split('@')[0] : '';
}

function getAiedueCraftPlayerName() {
    if (currentUserRole === 'teacher') {
        return getAiedueCraftTeacherUsername(currentUserProfileSnapshot?.email || auth.currentUser?.email || '');
    }
    const code = getAiedueCraftStudentCode();
    return code ? `aiedue${code}` : '';
}

function buildAiedueCraftUrl() {
    const params = new URLSearchParams();
    const player = getAiedueCraftPlayerName();
    if (player) params.set('craftUser', player);
    if (currentUserRole === 'teacher') {
        const email = currentUserProfileSnapshot?.email || auth.currentUser?.email || '';
        params.set('craftRole', 'teacher');
        if (email) params.set('teacherEmail', email);
    } else {
        params.set('craftRole', 'student');
        const code = getAiedueCraftStudentCode();
        if (code) params.set('studentCode', code);
    }
    return `${AIEDUE_CRAFT_URL}?${params.toString()}`;
}

async function callAiedueCraftApi(path, options = {}) {
    const user = auth.currentUser;
    if (!user || typeof user.getIdToken !== 'function') throw new Error('에이두 한글에 먼저 로그인해 주세요.');
    const token = await user.getIdToken();
    const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(`${AIEDUE_CRAFT_API_BASE}${path}`, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `크래프트 서버 응답 오류 (${response.status})`);
    return data;
}

async function grantAiedueCraftTeacherOp(player) {
    if (currentUserRole !== 'teacher' || !player) return null;
    return callAiedueCraftApi('/op', { method: 'POST', body: JSON.stringify({ player }) });
}

window.enterAiedueCraftAsTeacher = async function enterAiedueCraftAsTeacher() {
    if (!loginSuccess || !currentUserId || currentUserRole !== 'teacher') return showModal('교사 계정으로 로그인해 주세요.');
    const player = getAiedueCraftPlayerName();
    if (!player) return showModal('교사 이메일에서 크래프트 계정명을 만들지 못했어요.');
    try {
        await grantAiedueCraftTeacherOp(player);
        closeAiedueKoreanModal();
        window.location.href = buildAiedueCraftUrl();
    } catch (error) {
        console.error('Teacher Craft access failed', error);
        showModal(`에이두 크래프트 접속 준비 실패: ${escapeKoreanShopHtml(error.message || '알 수 없는 오류')}`);
    }
}

function syncAiedueCraftWallet(nextBalance) {
    currentUserBalance = nextBalance;
    currentUserCoins = nextBalance;
    currentUserAeduTokens = nextBalance;
    currentUserProfileSnapshot = { ...currentUserProfileSnapshot, balance: nextBalance, coins: nextBalance, aeduTokens: nextBalance };
    updateSyncedActivityHeaders({ name: currentUserName, coins: nextBalance, icon: currentUserIcon });
    const dashboardCoins = document.getElementById('dashboard-coins');
    const headerCoins = document.getElementById('dashboard-coins-header');
    if (dashboardCoins) dashboardCoins.innerText = nextBalance;
    if (headerCoins) headerCoins.innerText = nextBalance;
}

async function updateAiedueCraftBalance(delta, reason, targetOverride = null) {
    const targetId = targetOverride?.id || currentUserId;
    if (!targetId) throw new Error('로그인 정보를 찾을 수 없습니다.');
    const userRef = doc(db, 'users', targetId);
    let previousBalance = 0;
    let nextBalance = 0;
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(userRef);
        if (!snap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다.');
        const data = snap.data() || {};
        previousBalance = asNumber(data.balance ?? data.coins ?? data.aeduTokens, 0);
        nextBalance = previousBalance + asNumber(delta, 0);
        if (nextBalance < 0) throw new Error('포인트가 부족합니다.');
        transaction.update(userRef, { balance: nextBalance, coins: nextBalance, aeduTokens: nextBalance, updatedAt: serverTimestamp() });
    });
    if (targetId === currentUserId) syncAiedueCraftWallet(nextBalance);
    addDoc(collection(db, 'transferLog'), {
        userId: targetId,
        userName: targetOverride?.name || (targetId === currentUserId ? currentUserName : ''),
        kind: 'money',
        delta,
        previousBalance,
        nextBalance,
        reason,
        source: 'aiedue-craft',
        createdAt: serverTimestamp()
    }).catch((error) => console.warn('craft wallet log failed', error));
    return nextBalance;
}

window.purchaseAiedueCraftAccess = async function purchaseAiedueCraftAccess() {
    if (!loginSuccess || !currentUserId) return showModal('먼저 로그인하면 에이두 크래프트를 구매할 수 있어요.');
    if (!getAiedueCraftPlayerName()) return showModal('크래프트 계정으로 연결할 학생 코드 또는 교사 이메일을 찾지 못했어요.');
    if (!confirm('에이두 크래프트를 1,000점에 구매하고 접속할까요?')) return;
    try {
        await updateAiedueCraftBalance(-AIEDUE_CRAFT_ACCESS_PRICE, '에이두 크래프트 접속 구매');
        await addDoc(collection(db, 'purchaseLog'), {
            studentId: currentUserId,
            studentName: currentUserName,
            userCode: currentUserProfileSnapshot.userCode || null,
            itemId: 'aiedue-craft-access',
            itemName: '에이두 크래프트',
            price: AIEDUE_CRAFT_ACCESS_PRICE,
            source: 'aiedue-korean',
            craftPlayer: getAiedueCraftPlayerName(),
            purchasedAt: serverTimestamp()
        }).catch((error) => console.warn('Aiedue Craft purchase log failed', error));
        await grantAiedueCraftTeacherOp(getAiedueCraftPlayerName()).catch((error) => console.warn('Teacher OP grant failed', error));
        closeAiedueKoreanModal();
        window.location.href = buildAiedueCraftUrl();
    } catch (error) {
        console.error('Aiedue Craft access purchase failed', error);
        showModal(`에이두 크래프트 구매 실패: ${escapeKoreanShopHtml(error.message || '알 수 없는 오류')}`);
    }
}

const craftShopModal = document.getElementById('aiedu-craft-shop-modal');
const craftShopStatus = document.getElementById('aiedu-craft-shop-status');
const craftInventoryList = document.getElementById('aiedu-craft-inventory-list');
const craftAuctionList = document.getElementById('aiedu-craft-auction-list');
const craftRandomList = document.getElementById('aiedu-craft-random-list');
const craftRandomTimer = document.getElementById('aiedu-craft-random-timer');
const craftTargetPlayerSelect = document.getElementById('aiedu-craft-target-player-select');
let craftShopLastTrigger = null;

function setAiedueCraftShopStatus(message, tone = 'info') {
    if (!craftShopStatus) return;
    craftShopStatus.textContent = message;
    craftShopStatus.dataset.tone = tone;
}

function getAiedueCraftCount(button, selector, fallback = 1, max = 64) {
    const input = button?.closest('.aiedu-craft-row, .aiedu-craft-product')?.querySelector(selector) || button?.parentElement?.querySelector(selector);
    const raw = Math.floor(Number(input?.value || fallback));
    return Number.isFinite(raw) ? Math.max(1, Math.min(max, raw)) : 1;
}

function renderAiedueCraftInventory(items = []) {
    if (!craftInventoryList) return;
    if (!items.length) {
        craftInventoryList.innerHTML = '<p class="text-gray-400 text-center py-8">인벤토리에 표시할 물품이 없어요.</p>';
        return;
    }
    craftInventoryList.innerHTML = items.map((item) => {
        const maxCount = Math.max(0, Math.floor(Number(item.count || 0)));
        const unitPrice = Math.max(0, Number(item.unitPrice || 0));
        const itemName = String(item.nameKo || item.name || item.key || item.id || '아이템');
        const fixedSell = AIEDUE_CRAFT_FIXED_KEYS.has(String(item.key || ''));
        const safeId = escapeHtml(String(item.id ?? ''));
        const safeName = escapeKoreanShopHtml(itemName);
        const disabled = fixedSell && item.sellable && maxCount > 0 ? '' : 'disabled';
        const action = fixedSell
            ? `<div class="aiedu-craft-row-actions"><input type="number" min="1" max="${maxCount}" value="${Math.max(1, maxCount)}" class="aiedu-craft-number-input aiedu-craft-sell-count" ${maxCount ? '' : 'disabled'}><button type="button" class="btn-primary px-3 py-2 text-xs aiedu-craft-sell-btn" data-id="${safeId}" data-damage="${Number(item.damage || 0)}" data-count="${maxCount}" data-name="${safeName}" ${disabled}>판매</button></div>`
            : `<div class="grid grid-cols-3 gap-2 items-end mt-2"><label class="text-xs text-gray-500">개수<input type="number" min="1" max="${maxCount}" value="${Math.max(1, maxCount)}" class="aiedu-craft-number-input aiedu-craft-auction-count w-full mt-1"></label><label class="text-xs text-gray-500">개당 가격<input type="number" min="1" value="100" class="aiedu-craft-number-input aiedu-craft-auction-price w-full mt-1"></label><button type="button" class="btn-primary px-2 py-2 text-xs aiedu-craft-auction-create-btn" data-id="${safeId}" data-command-id="${escapeHtml(String(item.commandId || ''))}" data-key="${escapeHtml(String(item.key || ''))}" data-damage="${Number(item.damage || 0)}" data-count="${maxCount}" data-name="${safeName}" ${maxCount ? '' : 'disabled'}>경매 등록</button></div>`;
        return `<div class="aiedu-craft-row"><div class="flex justify-between gap-2"><div><p class="font-black text-[#2c3e50]">${safeName}</p><p class="text-xs text-gray-500">보유 ${maxCount}개 · ${fixedSell ? `개당 ${unitPrice.toLocaleString()}점` : '가격 직접 지정'}</p></div><span class="text-xs font-black ${fixedSell ? 'text-emerald-700' : 'text-violet-700'}">${fixedSell ? '즉시 판매' : '경매 등록'}</span></div>${action}</div>`;
    }).join('');
}

async function refreshAiedueCraftInventory() {
    const player = getAiedueCraftPlayerName();
    if (!player) throw new Error('연동할 크래프트 계정을 찾지 못했어요.');
    setAiedueCraftShopStatus(`${player} 인벤토리를 조회하는 중...`);
    if (craftInventoryList) craftInventoryList.innerHTML = '<p class="text-gray-400 text-center py-8">조회 중...</p>';
    const data = await callAiedueCraftApi(`/inventory?player=${encodeURIComponent(player)}`);
    renderAiedueCraftInventory(data.items || []);
    setAiedueCraftShopStatus(`${player} 인벤토리 조회 완료`, 'ok');
}

async function sellAiedueCraftItem(button) {
    const row = button.closest('.aiedu-craft-row');
    const maxCount = Number(button.dataset.count || 0);
    const requested = Math.floor(Number(row?.querySelector('.aiedu-craft-sell-count')?.value || maxCount));
    if (!Number.isFinite(requested) || requested < 1 || requested > maxCount) return showModal(`판매 개수는 1개부터 보유 수량 ${maxCount}개까지 입력해 주세요.`);
    button.disabled = true;
    try {
        const result = await callAiedueCraftApi('/sell', { method: 'POST', body: JSON.stringify({ player: getAiedueCraftPlayerName(), id: Number(button.dataset.id), damage: Number(button.dataset.damage || 0), count: requested }) });
        const soldCount = Number(result.count || result.removedCount || requested);
        const amount = Number(result.amount || soldCount * Number(result.unitPrice || 0));
        await updateAiedueCraftBalance(amount, `에이두 크래프트 판매: ${result.itemName || button.dataset.name} ${soldCount}개`);
        setAiedueCraftShopStatus(`${result.itemName || button.dataset.name} ${soldCount}개 판매 완료: ${amount.toLocaleString()}점 지급`, 'ok');
        await refreshAiedueCraftInventory();
    } finally { button.disabled = false; }
}

async function buyAiedueCraftItem(button) {
    const item = button.dataset.item || 'diamond';
    const itemName = button.dataset.name || '다이아몬드';
    const count = getAiedueCraftCount(button, '.aiedu-craft-buy-count');
    const price = Number(button.dataset.price || 1000) * count;
    button.disabled = true;
    await updateAiedueCraftBalance(-price, `에이두 크래프트 ${itemName} ${count}개 구매`);
    try {
        await callAiedueCraftApi('/buy', { method: 'POST', body: JSON.stringify({ player: getAiedueCraftPlayerName(), item, count }) });
        setAiedueCraftShopStatus(`${itemName} ${count}개 구매 완료! 게임 인벤토리를 확인해 주세요.`, 'ok');
        await refreshAiedueCraftInventory().catch(() => {});
    } catch (error) {
        await updateAiedueCraftBalance(price, `에이두 크래프트 ${itemName} 구매 실패 환불`).catch(() => {});
        throw error;
    } finally { button.disabled = false; }
}

async function createAiedueCraftAuction(button) {
    const row = button.closest('.aiedu-craft-row');
    const maxCount = Number(button.dataset.count || 0);
    const count = Math.floor(Number(row?.querySelector('.aiedu-craft-auction-count')?.value || 1));
    const unitPrice = Math.floor(Number(row?.querySelector('.aiedu-craft-auction-price')?.value || 1));
    if (!Number.isFinite(count) || count < 1 || count > maxCount || !Number.isFinite(unitPrice) || unitPrice < 1) return showModal('경매 수량과 가격을 다시 확인해 주세요.');
    button.disabled = true;
    try {
        const payload = { player: getAiedueCraftPlayerName(), id: button.dataset.id, commandId: button.dataset.commandId, key: button.dataset.key, damage: Number(button.dataset.damage || 0), count, unitPrice, itemName: button.dataset.name };
        const result = await callAiedueCraftApi('/auction/create', { method: 'POST', body: JSON.stringify(payload) });
        setAiedueCraftShopStatus(`${result.itemName || payload.itemName} ${count}개 경매 등록 완료`, 'ok');
        await Promise.allSettled([refreshAiedueCraftInventory(), refreshAiedueCraftAuction()]);
    } finally { button.disabled = false; }
}

function renderAiedueCraftAuction(listings = []) {
    if (!craftAuctionList) return;
    if (!listings.length) {
        craftAuctionList.innerHTML = '<p class="text-gray-400 text-center py-6">등록된 경매 물품이 없어요.</p>';
        return;
    }
    craftAuctionList.innerHTML = listings.map((listing) => {
        const own = listing.sellerUid === currentUserId;
        const count = Math.max(1, Number(listing.count || 1));
        const unitPrice = Math.max(1, Number(listing.unitPrice || 1));
        const name = escapeKoreanShopHtml(listing.itemName || listing.key || '아이템');
        const action = own
            ? `<button type="button" class="btn-outline px-3 py-2 text-xs aiedu-craft-auction-cancel-btn" data-id="${escapeHtml(String(listing.id || ''))}">내 물품 취소</button>`
            : `<div class="aiedu-craft-row-actions"><input type="number" min="1" max="${count}" value="1" class="aiedu-craft-number-input aiedu-craft-auction-buy-count"><button type="button" class="btn-primary px-3 py-2 text-xs aiedu-craft-auction-buy-btn" data-id="${escapeHtml(String(listing.id || ''))}" data-unit-price="${unitPrice}" data-max-count="${count}" data-name="${name}">구매</button></div>`;
        return `<div class="aiedu-craft-row"><div class="flex justify-between gap-2"><div><p class="font-black">${name}</p><p class="text-xs text-gray-500">판매자 ${escapeKoreanShopHtml(listing.sellerName || listing.sellerPlayer || '')} · ${count}개 · 개당 ${unitPrice.toLocaleString()}점</p></div></div>${action}</div>`;
    }).join('');
}

async function refreshAiedueCraftAuction() {
    if (craftAuctionList) craftAuctionList.innerHTML = '<p class="text-gray-400 text-center py-6">경매장을 불러오는 중...</p>';
    const data = await callAiedueCraftApi('/auction/list');
    renderAiedueCraftAuction(data.listings || []);
}

async function buyAiedueCraftAuction(button) {
    const row = button.closest('.aiedu-craft-row');
    const maxCount = Number(button.dataset.maxCount || 1);
    const count = Math.floor(Number(row?.querySelector('.aiedu-craft-auction-buy-count')?.value || 1));
    if (!Number.isFinite(count) || count < 1 || count > maxCount) return showModal(`구매 수량은 1개부터 ${maxCount}개까지 입력해 주세요.`);
    const purchaseId = globalThis.crypto?.randomUUID?.() || `auction_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    button.disabled = true;
    try {
        const result = await callAiedueCraftApi('/auction/buy', {
            method: 'POST',
            body: JSON.stringify({ id: button.dataset.id, player: getAiedueCraftPlayerName(), count, purchaseId })
        });
        if (!result.sellerPayout?.settled) throw new Error('판매자 대금 정산이 확인되지 않았습니다.');
        if (Number.isFinite(Number(result.buyerBalance))) syncAiedueCraftWallet(Number(result.buyerBalance));
        setAiedueCraftShopStatus(`${result.itemName || button.dataset.name} ${count}개 경매 구매 완료 · 판매자에게 ${Number(result.sellerPayout.amount || result.totalPrice || 0).toLocaleString()}점 지급`, 'ok');
        await Promise.allSettled([refreshAiedueCraftAuction(), refreshAiedueCraftInventory()]);
    } finally { button.disabled = false; }
}

async function cancelAiedueCraftAuction(listingId) {
    const result = await callAiedueCraftApi('/auction/cancel', { method: 'POST', body: JSON.stringify({ id: listingId, player: getAiedueCraftPlayerName() }) });
    setAiedueCraftShopStatus(`${result.itemName || '경매 물품'} 취소 완료`, 'ok');
    await Promise.allSettled([refreshAiedueCraftAuction(), refreshAiedueCraftInventory()]);
}

function renderAiedueCraftRandomMarket(items = [], expiresAt = 0) {
    if (!craftRandomList) return;
    if (craftRandomTimer) craftRandomTimer.textContent = expiresAt ? `다음 무료 갱신 ${new Date(expiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '';
    if (!items.length) {
        craftRandomList.innerHTML = '<p class="text-gray-400 text-center py-6">랜덤 상품이 없어요.</p>';
        return;
    }
    craftRandomList.innerHTML = items.map((item) => {
        const stock = Math.max(0, Math.min(10, Math.floor(Number(item.stock ?? 10))));
        const name = escapeKoreanShopHtml(item.name || item.key || '아이템');
        return `<div class="aiedu-craft-row"><div class="flex justify-between gap-2"><div><p class="font-black">${name}</p><p class="text-xs text-gray-500">개당 100점 · 재고 ${stock}개</p></div><div class="aiedu-craft-row-actions mt-0"><input type="number" min="1" max="${Math.max(1, stock)}" value="${stock ? 1 : 0}" class="aiedu-craft-number-input aiedu-craft-random-count" ${stock ? '' : 'disabled'}><button type="button" class="btn-primary px-3 py-2 text-xs aiedu-craft-random-buy-btn" data-key="${escapeHtml(String(item.key || ''))}" data-name="${name}" data-stock="${stock}" ${stock ? '' : 'disabled'}>${stock ? '구매' : '품절'}</button></div></div></div>`;
    }).join('');
}

async function refreshAiedueCraftRandomMarket({ paid = false } = {}) {
    if (paid) await updateAiedueCraftBalance(-500, '에이두 크래프트 랜덤마켓 수동 새로고침');
    try {
        const data = await callAiedueCraftApi(paid ? '/random-market/refresh' : '/random-market', { method: paid ? 'POST' : 'GET' });
        renderAiedueCraftRandomMarket(data.items || [], data.expiresAt || 0);
        setAiedueCraftShopStatus(paid ? '랜덤마켓 새로고침 완료' : '랜덤마켓 불러오기 완료', 'ok');
    } catch (error) {
        if (paid) await updateAiedueCraftBalance(500, '에이두 크래프트 랜덤마켓 새로고침 실패 환불').catch(() => {});
        throw error;
    }
}

async function buyAiedueCraftRandom(button) {
    const stock = Math.max(0, Number(button.dataset.stock || 0));
    const count = getAiedueCraftCount(button, '.aiedu-craft-random-count', 1, stock);
    const price = count * 100;
    await updateAiedueCraftBalance(-price, `에이두 크래프트 랜덤마켓 구매: ${button.dataset.name} ${count}개`);
    try {
        await callAiedueCraftApi('/random-market/buy', { method: 'POST', body: JSON.stringify({ player: getAiedueCraftPlayerName(), key: button.dataset.key, count }) });
        setAiedueCraftShopStatus(`${button.dataset.name} ${count}개 랜덤마켓 구매 완료`, 'ok');
        await Promise.allSettled([refreshAiedueCraftInventory(), refreshAiedueCraftRandomMarket()]);
    } catch (error) {
        await updateAiedueCraftBalance(price, '에이두 크래프트 랜덤마켓 구매 실패 환불').catch(() => {});
        throw error;
    }
}

async function loadAiedueCraftOnlinePlayers() {
    if (!craftTargetPlayerSelect) return;
    const data = await callAiedueCraftApi('/players/online');
    const self = getAiedueCraftPlayerName().toLowerCase();
    const players = (data.players || []).filter((player) => String(player).toLowerCase() !== self);
    craftTargetPlayerSelect.replaceChildren(...(players.length
        ? players.map((player) => { const option = document.createElement('option'); option.value = String(player); option.textContent = String(player); return option; })
        : [Object.assign(document.createElement('option'), { value: '', textContent: '현재 온라인 친구 없음' })]));
}

async function buyAiedueCraftCommand(kind) {
    const meta = {
        home: { price: 500, endpoint: '/command/home', label: '집으로 이동' },
        teleport: { price: 500, endpoint: '/command/teleport', label: '친구에게 이동' },
        housewand: { price: 1000, endpoint: '/command/housewand', label: '집 소환기 구매' }
    }[kind];
    if (!meta) return;
    const target = kind === 'teleport' ? String(craftTargetPlayerSelect?.value || '').trim() : '';
    if (kind === 'teleport' && !target) return showModal('이동할 온라인 친구를 선택해 주세요.');
    await updateAiedueCraftBalance(-meta.price, `에이두 크래프트 명령 구매: ${target ? `${target}에게 이동` : meta.label}`);
    try {
        const result = await callAiedueCraftApi(meta.endpoint, { method: 'POST', body: JSON.stringify({ player: getAiedueCraftPlayerName(), target }) });
        setAiedueCraftShopStatus(result.itemName ? `${result.itemName} 지급 완료!` : `${target ? `${target}에게 이동` : meta.label} 처리 완료`, 'ok');
        if (kind === 'housewand') await refreshAiedueCraftInventory().catch(() => {});
    } catch (error) {
        await updateAiedueCraftBalance(meta.price, '에이두 크래프트 명령 구매 실패 환불').catch(() => {});
        throw error;
    }
}

function closeAiedueCraftShop() {
    craftShopModal?.classList.add('hidden');
    craftShopModal?.classList.remove('flex');
    document.body.style.overflow = '';
    craftShopLastTrigger?.focus();
    craftShopLastTrigger = null;
}

window.openAiedueCraftShop = function openAiedueCraftShop() {
    if (!loginSuccess || !currentUserId) return showModal('먼저 로그인하면 크래프트 상점을 볼 수 있어요.');
    if (!getAiedueCraftPlayerName()) return showModal('크래프트 계정으로 연결할 학생 코드 또는 교사 이메일을 찾지 못했어요.');
    craftShopLastTrigger = document.activeElement;
    closeAiedueKoreanModal();
    craftShopModal?.classList.remove('hidden');
    craftShopModal?.classList.add('flex');
    document.body.style.overflow = 'hidden';
    setAiedueCraftShopStatus('인벤토리·경매장·랜덤마켓을 불러오는 중...');
    Promise.allSettled([refreshAiedueCraftInventory(), refreshAiedueCraftAuction(), refreshAiedueCraftRandomMarket(), loadAiedueCraftOnlinePlayers()]).then((results) => {
        const failures = results.filter((result) => result.status === 'rejected');
        if (failures.length) setAiedueCraftShopStatus(failures[0].reason?.message || '일부 정보를 불러오지 못했어요.', 'warn');
        else setAiedueCraftShopStatus('크래프트 상점 준비 완료', 'ok');
    });
}

document.getElementById('close-aiedu-craft-shop-btn')?.addEventListener('click', closeAiedueCraftShop);
craftShopModal?.addEventListener('click', (event) => { if (event.target === craftShopModal) closeAiedueCraftShop(); });
document.getElementById('refresh-aiedu-craft-inventory-btn')?.addEventListener('click', () => refreshAiedueCraftInventory().catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.getElementById('refresh-aiedu-craft-auction-btn')?.addEventListener('click', () => refreshAiedueCraftAuction().catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.getElementById('refresh-aiedu-craft-auction-inline-btn')?.addEventListener('click', () => refreshAiedueCraftAuction().catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.getElementById('refresh-aiedu-craft-random-btn')?.addEventListener('click', () => refreshAiedueCraftRandomMarket({ paid: true }).catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.getElementById('buy-aiedu-craft-home-tp-btn')?.addEventListener('click', () => buyAiedueCraftCommand('home').catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.getElementById('buy-aiedu-craft-housewand-btn')?.addEventListener('click', () => buyAiedueCraftCommand('housewand').catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.getElementById('buy-aiedu-craft-target-tp-btn')?.addEventListener('click', () => buyAiedueCraftCommand('teleport').catch((error) => setAiedueCraftShopStatus(error.message, 'error')));
document.querySelectorAll('.buy-aiedu-craft-item-btn').forEach((button) => button.addEventListener('click', () => buyAiedueCraftItem(button).catch((error) => setAiedueCraftShopStatus(error.message, 'error'))));
craftInventoryList?.addEventListener('click', (event) => {
    const sellButton = event.target.closest('.aiedu-craft-sell-btn');
    const auctionButton = event.target.closest('.aiedu-craft-auction-create-btn');
    if (sellButton && !sellButton.disabled) sellAiedueCraftItem(sellButton).catch((error) => setAiedueCraftShopStatus(error.message, 'error'));
    if (auctionButton && !auctionButton.disabled) createAiedueCraftAuction(auctionButton).catch((error) => setAiedueCraftShopStatus(error.message, 'error'));
});
craftAuctionList?.addEventListener('click', (event) => {
    const buyButton = event.target.closest('.aiedu-craft-auction-buy-btn');
    const cancelButton = event.target.closest('.aiedu-craft-auction-cancel-btn');
    if (buyButton && !buyButton.disabled) buyAiedueCraftAuction(buyButton).catch((error) => setAiedueCraftShopStatus(error.message, 'error'));
    if (cancelButton) cancelAiedueCraftAuction(cancelButton.dataset.id).catch((error) => setAiedueCraftShopStatus(error.message, 'error'));
});
craftRandomList?.addEventListener('click', (event) => {
    const button = event.target.closest('.aiedu-craft-random-buy-btn');
    if (button && !button.disabled) buyAiedueCraftRandom(button).catch((error) => setAiedueCraftShopStatus(error.message, 'error'));
});
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && craftShopModal && !craftShopModal.classList.contains('hidden')) closeAiedueCraftShop(); });

// =========================================================================
// --- AIEDUE KOREAN NATIVE CLOUD (no school redirect/iframe) ---
// =========================================================================
const koreanCloudState = { students: [], selectedStudentId: null, selectedStudentName: '', editor: null };
function getKoreanCloudUserId() { return currentUserId || auth.currentUser?.uid || null; }
function getKoreanCloudDisplayName(fileName = '') { return String(fileName).replace(/^\d+_/, '').replace(/\.pdf$/i, ''); }
function formatKoreanCloudFileSize(bytes = 0) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }

window.openAiedueKoreanCloud = function openAiedueKoreanCloud() {
    if (!loginSuccess || !getKoreanCloudUserId()) { showModal('로그인 후 에이두 클라우드를 사용할 수 있어요.'); return; }
    const main = document.getElementById('main-container');
    const cloud = document.getElementById('aiedue-korean-cloud-section');
    if (!main || !cloud) return;
    if (cloud.parentElement !== main) main.appendChild(cloud);
    cloud.classList.remove('hidden');
    cloud.style.display = 'flex';
    cloud.style.zIndex = '60';
    renderAiedueKoreanCloud();
}
window.closeAiedueKoreanCloud = function closeAiedueKoreanCloud() {
    const cloud = document.getElementById('aiedue-korean-cloud-section');
    if (!cloud) return;
    cloud.classList.add('hidden');
    cloud.style.display = 'none';
}

async function renderAiedueKoreanCloud() {
    const isTeacher = currentUserRole === 'teacher';
    document.getElementById('korean-cloud-teacher-panel')?.classList.toggle('hidden', !isTeacher);
    document.getElementById('korean-cloud-student-panel')?.classList.toggle('hidden', isTeacher);
    const title = document.getElementById('korean-cloud-title'); if (title) title.textContent = isTeacher ? '에이두 한글 클라우드' : '나의 에이두 한글 클라우드';
    const desc = document.getElementById('korean-cloud-desc'); if (desc) desc.textContent = isTeacher ? '에이두 한글 안에서 내 PDF를 관리하고 우리 반 학생에게 배부해요.' : '배부 받은 PDF를 열고 쓰기·그리기·수정할 수 있어요.';
    await loadAiedueKoreanCloudFiles(getKoreanCloudUserId(), isTeacher ? 'korean-cloud-teacher-my-files' : 'korean-cloud-student-my-files', isTeacher ? 'korean-cloud-teacher-my-empty' : 'korean-cloud-student-my-empty');
    if (isTeacher) await loadAiedueKoreanCloudStudents();
}

async function loadAiedueKoreanCloudFiles(userId, listId, emptyId) {
    const list = document.getElementById(listId); const empty = document.getElementById(emptyId); if (!list || !userId) return [];
    list.innerHTML = '<div class="col-span-full text-center py-8 text-gray-400 font-bold">파일을 불러오는 중...</div>';
    try {
        const result = await listAll(storageRef(storage, `cloud/${userId}`));
        const files = [];
        for (const itemRef of result.items) { const meta = await getMetadata(itemRef).catch(() => ({})); files.push({ name: itemRef.name, fullPath: itemRef.fullPath, ref: itemRef, size: meta.size || 0, timeCreated: meta.timeCreated || '', ownerId: userId }); }
        files.sort((a, b) => new Date(b.timeCreated || 0) - new Date(a.timeCreated || 0));
        list.innerHTML = ''; if (empty) empty.classList.toggle('hidden', files.length > 0); if (!files.length) return files;
        files.forEach((file) => list.appendChild(createAiedueKoreanCloudFileCard(file, userId))); return files;
    } catch (error) { console.error('Aiedue Korean cloud load failed:', error); list.innerHTML = '<div class="col-span-full text-center py-8 text-red-500 font-bold">파일 목록을 불러오지 못했어요.</div>'; if (empty) empty.classList.add('hidden'); return []; }
}

function createAiedueKoreanCloudFileCard(file, ownerId) {
    const isTeacher = currentUserRole === 'teacher'; const card = document.createElement('div');
    const date = file.timeCreated ? new Date(file.timeCreated).toLocaleString('ko-KR') : '';
    card.className = 'korean-cloud-file-card bg-white border border-amber-100 rounded-3xl p-4 shadow-sm flex flex-col gap-3';
    card.innerHTML = `<div class="flex items-start gap-3"><div class="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center text-2xl">📄</div><div class="min-w-0 flex-1"><div class="font-black text-[#2c3e50] truncate" title="${escapeHtml(file.name)}">${escapeHtml(getKoreanCloudDisplayName(file.name))}</div><div class="text-xs text-gray-400 mt-1">${formatKoreanCloudFileSize(file.size)}${date ? ` · ${escapeHtml(date)}` : ''}</div></div></div><div class="grid grid-cols-2 gap-2 mt-auto"><button type="button" class="btn-primary px-3 py-2 text-sm korean-cloud-open">열기</button>${isTeacher ? '<button type="button" class="btn-outline px-3 py-2 text-sm korean-cloud-send">배부</button>' : ''}<button type="button" class="btn-outline px-3 py-2 text-sm korean-cloud-rename">수정</button><button type="button" class="btn-outline px-3 py-2 text-sm text-red-500 korean-cloud-delete">삭제</button></div>`;
    card.querySelector('.korean-cloud-open')?.addEventListener('click', () => openAiedueKoreanPdfEditor(file.fullPath, ownerId));
    card.querySelector('.korean-cloud-send')?.addEventListener('click', () => openAiedueKoreanCloudDistributeModal(file));
    card.querySelector('.korean-cloud-rename')?.addEventListener('click', () => renameAiedueKoreanCloudFile(file, ownerId));
    card.querySelector('.korean-cloud-delete')?.addEventListener('click', () => deleteAiedueKoreanCloudFile(file, ownerId));
    return card;
}

async function uploadAiedueKoreanCloudFile(file, targetUserId = getKoreanCloudUserId()) {
    if (!file || file.type !== 'application/pdf') { showModal('PDF 파일만 업로드할 수 있어요.'); return; }
    if (!targetUserId) return;
    try { const safeName = file.name.replace(/[\\/]/g, '_'); await uploadBytes(storageRef(storage, `cloud/${targetUserId}/${Date.now()}_${safeName}`), file, { contentType: 'application/pdf' }); showModal('업로드가 완료되었어요.'); await refreshAiedueKoreanCloudListForOwner(targetUserId); }
    catch (error) { console.error('Aiedue Korean cloud upload failed:', error); showModal('업로드 중 오류가 발생했어요.'); }
}
async function deleteAiedueKoreanCloudFile(file, ownerId) { if (!confirm('이 PDF를 삭제할까요?')) return; try { await deleteObject(file.ref || storageRef(storage, file.fullPath)); await refreshAiedueKoreanCloudListForOwner(ownerId); } catch (error) { console.error('Aiedue Korean cloud delete failed:', error); showModal('삭제 중 오류가 발생했어요.'); } }
async function renameAiedueKoreanCloudFile(file, ownerId) {
    const next = prompt('새 파일 이름을 입력하세요.', getKoreanCloudDisplayName(file.name)); if (!next || !next.trim()) return;
    try { const url = await getDownloadURL(file.ref || storageRef(storage, file.fullPath)); const blob = await fetch(url).then((r) => r.blob()); const timestamp = file.name.match(/^\d+/)?.[0] || Date.now(); const newName = `${timestamp}_${next.trim().replace(/\.pdf$/i, '')}.pdf`; await uploadBytes(storageRef(storage, `cloud/${ownerId}/${newName}`), blob, { contentType: 'application/pdf' }); await deleteObject(file.ref || storageRef(storage, file.fullPath)); await refreshAiedueKoreanCloudListForOwner(ownerId); }
    catch (error) { console.error('Aiedue Korean cloud rename failed:', error); showModal('파일 수정 중 오류가 발생했어요.'); }
}
async function refreshAiedueKoreanCloudListForOwner(ownerId) { if (ownerId === getKoreanCloudUserId()) await renderAiedueKoreanCloud(); else await loadAiedueKoreanCloudFiles(ownerId, 'korean-cloud-student-files', 'korean-cloud-student-empty'); }

async function loadAiedueKoreanCloudStudents() { const list = document.getElementById('korean-cloud-student-list'); if (!list) return; list.innerHTML = '<div class="text-center py-8 text-gray-400 font-bold col-span-full">학생 목록을 불러오는 중...</div>'; try { koreanCloudState.students = await getAiedueKoreanClassStudents(); renderAiedueKoreanCloudStudentList(''); } catch (error) { console.error('Aiedue Korean cloud students failed:', error); list.innerHTML = '<div class="text-center py-8 text-red-500 font-bold col-span-full">학생 목록을 불러오지 못했어요.</div>'; } }
function renderAiedueKoreanCloudStudentList(filter = '') { const list = document.getElementById('korean-cloud-student-list'); if (!list) return; const term = filter.trim().toLowerCase(); const students = koreanCloudState.students.filter((s) => !term || String(s.name || '').toLowerCase().includes(term) || String(s.userCode || '').toLowerCase().includes(term)); if (!students.length) { list.innerHTML = '<div class="text-center py-8 text-gray-400 font-bold col-span-full">표시할 학생이 없어요.</div>'; return; } list.innerHTML = students.map((s) => `<button type="button" class="korean-embed-card bg-white rounded-3xl p-4 text-left border hover:border-amber-300" onclick="openAiedueKoreanCloudStudentFiles('${escapeInlineJsString(s.id || s.uid)}', '${escapeInlineJsString(s.name || '이름 없음')}')"><div class="text-lg font-black text-[#2c3e50]">${escapeHtml(s.name || '이름 없음')}</div><div class="text-xs text-gray-400 mt-1">${escapeHtml(s.userCode || s.code || '')}</div><div class="text-sm text-amber-600 font-bold mt-3">학생 파일 보기 →</div></button>`).join(''); }
window.openAiedueKoreanCloudStudentFiles = async function openAiedueKoreanCloudStudentFiles(studentId, studentName) { koreanCloudState.selectedStudentId = studentId; koreanCloudState.selectedStudentName = studentName; document.getElementById('korean-cloud-student-files-panel')?.classList.remove('hidden'); const name = document.getElementById('korean-cloud-selected-student-name'); if (name) name.textContent = `${studentName} 학생 파일`; await loadAiedueKoreanCloudFiles(studentId, 'korean-cloud-student-files', 'korean-cloud-student-empty'); }

async function openAiedueKoreanCloudDistributeModal(file) {
    const students = koreanCloudState.students.length ? koreanCloudState.students : await getAiedueKoreanClassStudents(); if (!students.length) { showModal('배부할 학생이 없어요.'); return; }
    const overlay = document.createElement('div'); overlay.className = 'fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[1300] p-4';
    overlay.innerHTML = `<div class="bg-white rounded-[32px] p-6 w-full max-w-lg shadow-2xl"><div class="flex justify-between items-start gap-3 mb-5"><div><h3 class="text-2xl font-black text-[#2c3e50]">PDF 배부</h3><p class="text-sm text-gray-500 font-bold mt-1">${escapeHtml(getKoreanCloudDisplayName(file.name))}</p></div><button type="button" class="btn-outline px-3 py-2" data-close>닫기</button></div><button type="button" class="btn-primary w-full py-3 mb-4" data-all>우리 반 전체에게 배부</button><div class="max-h-[45vh] overflow-y-auto space-y-2 custom-scrollbar">${students.map((s) => `<button type="button" class="w-full p-3 rounded-2xl border text-left hover:bg-amber-50" data-send="${escapeHtml(s.id || s.uid)}" data-name="${escapeHtml(s.name || '이름 없음')}"><b>${escapeHtml(s.name || '이름 없음')}</b><span class="block text-xs text-gray-400">${escapeHtml(s.userCode || '')}</span></button>`).join('')}</div></div>`; document.body.appendChild(overlay);
    const close = () => overlay.remove(); overlay.querySelector('[data-close]')?.addEventListener('click', close); overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    const copyTo = async (studentIds) => { const url = await getDownloadURL(file.ref || storageRef(storage, file.fullPath)); const blob = await fetch(url).then((r) => r.blob()); for (const sid of studentIds) await uploadBytes(storageRef(storage, `cloud/${sid}/${file.name}`), blob, { contentType: 'application/pdf' }); };
    overlay.querySelector('[data-all]')?.addEventListener('click', async (e) => { if (!confirm(`${students.length}명에게 배부할까요?`)) return; e.currentTarget.disabled = true; e.currentTarget.textContent = '배부 중...'; try { await copyTo(students.map((s) => s.id || s.uid)); close(); showModal('우리 반 전체에게 배부했어요.'); } catch (error) { console.error(error); showModal('배부 중 오류가 발생했어요.'); } });
    overlay.querySelectorAll('[data-send]').forEach((btn) => btn.addEventListener('click', async () => { btn.disabled = true; btn.textContent = '배부 중...'; try { await copyTo([btn.dataset.send]); close(); showModal(`${btn.dataset.name} 학생에게 배부했어요.`); } catch (error) { console.error(error); showModal('배부 중 오류가 발생했어요.'); } }));
}

window.triggerAiedueKoreanCloudUpload = function triggerAiedueKoreanCloudUpload(target = 'mine') { document.getElementById(target === 'student' ? 'korean-cloud-student-upload-input' : 'korean-cloud-upload-input')?.click(); }
document.getElementById('korean-cloud-upload-input')?.addEventListener('change', (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadAiedueKoreanCloudFile(file, getKoreanCloudUserId()); });
document.getElementById('korean-cloud-student-upload-input')?.addEventListener('change', (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file && koreanCloudState.selectedStudentId) uploadAiedueKoreanCloudFile(file, koreanCloudState.selectedStudentId); });
document.getElementById('korean-cloud-student-search')?.addEventListener('input', (event) => renderAiedueKoreanCloudStudentList(event.target.value));

async function openAiedueKoreanPdfEditor(filePath, ownerId) {
    const modal = document.getElementById('korean-cloud-pdf-editor-modal'); const canvas = document.getElementById('korean-cloud-pdf-canvas'); const drawCanvas = document.getElementById('korean-cloud-draw-canvas'); const loading = document.getElementById('korean-cloud-pdf-loading'); if (!modal || !canvas || !drawCanvas) return;
    modal.classList.remove('hidden'); loading?.classList.remove('hidden'); const ctx = canvas.getContext('2d'); const drawCtx = drawCanvas.getContext('2d');
    try { const ref = storageRef(storage, filePath); const url = await getDownloadURL(ref); const pdf = await pdfjsLib.getDocument(url).promise; koreanCloudState.editor = { filePath, ownerId, ref, url, pdf, page: 1, total: pdf.numPages, scale: 1.2, mode: 'pen', drawing: false, overlays: {}, canvas, drawCanvas, ctx, drawCtx }; setupAiedueKoreanPdfCanvasEvents(); await renderAiedueKoreanPdfPage(); }
    catch (error) { console.error('Aiedue Korean PDF open failed:', error); showModal('PDF를 열 수 없어요.'); closeAiedueKoreanPdfEditor(); }
    finally { loading?.classList.add('hidden'); }
}
async function renderAiedueKoreanPdfPage() { const ed = koreanCloudState.editor; if (!ed) return; const page = await ed.pdf.getPage(ed.page); const area = document.getElementById('korean-cloud-pdf-area'); const baseViewport = page.getViewport({ scale: 1 }); const fitScale = area ? Math.min(1.6, Math.max(0.75, (area.clientWidth - 36) / baseViewport.width)) : 1.2; ed.scale = fitScale; const viewport = page.getViewport({ scale: ed.scale }); ed.canvas.width = ed.drawCanvas.width = viewport.width; ed.canvas.height = ed.drawCanvas.height = viewport.height; await page.render({ canvasContext: ed.ctx, viewport }).promise; redrawAiedueKoreanPdfOverlay(); const pageInfo = document.getElementById('korean-cloud-page-info'); if (pageInfo) pageInfo.textContent = `${ed.page} / ${ed.total}`; }
function setupAiedueKoreanPdfCanvasEvents() {
    const ed = koreanCloudState.editor; if (!ed || ed.drawCanvas.dataset.ready === '1') return; ed.drawCanvas.dataset.ready = '1';
    const getPos = (event) => { const touch = event.touches?.[0] || event.changedTouches?.[0]; const src = touch || event; const rect = ed.drawCanvas.getBoundingClientRect(); return { x: (src.clientX - rect.left) / ed.scale, y: (src.clientY - rect.top) / ed.scale }; };
    const down = (event) => { event.preventDefault(); const pos = getPos(event); if (ed.mode === 'text') { const text = prompt('넣을 글자를 입력하세요.'); if (text?.trim()) { const page = ed.page; ed.overlays[page] ||= { paths: [], texts: [] }; ed.overlays[page].texts.push({ ...pos, text: text.trim(), color: document.getElementById('korean-cloud-editor-color')?.value || '#ef4444', size: 20 }); redrawAiedueKoreanPdfOverlay(); } return; } ed.drawing = true; ed.currentPath = [pos]; };
    const move = (event) => { if (!ed.drawing) return; event.preventDefault(); ed.currentPath.push(getPos(event)); redrawAiedueKoreanPdfOverlay(true); };
    const up = () => { if (!ed.drawing) return; ed.drawing = false; const page = ed.page; ed.overlays[page] ||= { paths: [], texts: [] }; if (ed.currentPath?.length > 1) ed.overlays[page].paths.push({ points: [...ed.currentPath], color: document.getElementById('korean-cloud-editor-color')?.value || '#ef4444', width: Number(document.getElementById('korean-cloud-editor-width')?.value || 4) }); ed.currentPath = []; redrawAiedueKoreanPdfOverlay(); };
    ed.drawCanvas.addEventListener('mousedown', down); ed.drawCanvas.addEventListener('mousemove', move); document.addEventListener('mouseup', up); ed.drawCanvas.addEventListener('touchstart', down, { passive: false }); ed.drawCanvas.addEventListener('touchmove', move, { passive: false }); ed.drawCanvas.addEventListener('touchend', up);
}
function redrawAiedueKoreanPdfOverlay(includeCurrent = false) { const ed = koreanCloudState.editor; if (!ed) return; ed.drawCtx.clearRect(0, 0, ed.drawCanvas.width, ed.drawCanvas.height); const overlay = ed.overlays[ed.page] || { paths: [], texts: [] }; const drawPath = (path) => { if (!path.points || path.points.length < 2) return; ed.drawCtx.beginPath(); ed.drawCtx.strokeStyle = path.color; ed.drawCtx.lineWidth = path.width * ed.scale; ed.drawCtx.lineCap = 'round'; ed.drawCtx.lineJoin = 'round'; ed.drawCtx.moveTo(path.points[0].x * ed.scale, path.points[0].y * ed.scale); path.points.slice(1).forEach((p) => ed.drawCtx.lineTo(p.x * ed.scale, p.y * ed.scale)); ed.drawCtx.stroke(); }; overlay.paths.forEach(drawPath); if (includeCurrent && ed.currentPath?.length) drawPath({ points: ed.currentPath, color: document.getElementById('korean-cloud-editor-color')?.value || '#ef4444', width: Number(document.getElementById('korean-cloud-editor-width')?.value || 4) }); overlay.texts.forEach((t) => { ed.drawCtx.fillStyle = t.color; ed.drawCtx.font = `${t.size * ed.scale}px "Noto Sans KR", sans-serif`; ed.drawCtx.fillText(t.text, t.x * ed.scale, t.y * ed.scale); }); }
window.setAiedueKoreanPdfTool = function setAiedueKoreanPdfTool(mode) { if (!koreanCloudState.editor) return; koreanCloudState.editor.mode = mode; document.querySelectorAll('.korean-cloud-tool').forEach((btn) => btn.classList.toggle('active', btn.dataset.tool === mode)); }
window.prevAiedueKoreanPdfPage = async function prevAiedueKoreanPdfPage() { const ed = koreanCloudState.editor; if (ed && ed.page > 1) { ed.page--; await renderAiedueKoreanPdfPage(); } }
window.nextAiedueKoreanPdfPage = async function nextAiedueKoreanPdfPage() { const ed = koreanCloudState.editor; if (ed && ed.page < ed.total) { ed.page++; await renderAiedueKoreanPdfPage(); } }
window.clearAiedueKoreanPdfPage = function clearAiedueKoreanPdfPage() { const ed = koreanCloudState.editor; if (!ed) return; ed.overlays[ed.page] = { paths: [], texts: [] }; redrawAiedueKoreanPdfOverlay(); }
window.saveAiedueKoreanPdfEditor = async function saveAiedueKoreanPdfEditor() {
    const ed = koreanCloudState.editor; if (!ed) return; const saveBtn = document.getElementById('korean-cloud-pdf-save'); if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '저장 중...'; }
    try { const originalBytes = await fetch(ed.url).then((r) => r.arrayBuffer()); const pdfDoc = await PDFDocument.load(originalBytes); const pages = pdfDoc.getPages(); for (const [pageNumStr, overlay] of Object.entries(ed.overlays)) { if (!overlay.paths?.length && !overlay.texts?.length) continue; const pageNum = Number(pageNumStr); const page = pages[pageNum - 1]; const pdfPage = await ed.pdf.getPage(pageNum); const viewport = pdfPage.getViewport({ scale: 2 }); const tmp = document.createElement('canvas'); tmp.width = viewport.width; tmp.height = viewport.height; const tmpCtx = tmp.getContext('2d'); const scale = 2; tmpCtx.clearRect(0, 0, tmp.width, tmp.height); overlay.paths.forEach((path) => { tmpCtx.beginPath(); tmpCtx.strokeStyle = path.color; tmpCtx.lineWidth = path.width * scale; tmpCtx.lineCap = 'round'; tmpCtx.lineJoin = 'round'; tmpCtx.moveTo(path.points[0].x * scale, path.points[0].y * scale); path.points.slice(1).forEach((p) => tmpCtx.lineTo(p.x * scale, p.y * scale)); tmpCtx.stroke(); }); overlay.texts.forEach((t) => { tmpCtx.fillStyle = t.color; tmpCtx.font = `${t.size * scale}px "Noto Sans KR", sans-serif`; tmpCtx.fillText(t.text, t.x * scale, t.y * scale); }); const png = await pdfDoc.embedPng(tmp.toDataURL('image/png')); page.drawImage(png, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() }); } const bytes = await pdfDoc.save(); await uploadBytes(ed.ref, new Blob([bytes], { type: 'application/pdf' }), { contentType: 'application/pdf' }); ed.overlays = {}; showModal('PDF가 저장되었어요.'); await refreshAiedueKoreanCloudListForOwner(ed.ownerId); }
    catch (error) { console.error('Aiedue Korean PDF save failed:', error); showModal('PDF 저장 중 오류가 발생했어요.'); }
    finally { if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '저장'; } }
}
window.closeAiedueKoreanPdfEditor = function closeAiedueKoreanPdfEditor() { document.getElementById('korean-cloud-pdf-editor-modal')?.classList.add('hidden'); koreanCloudState.editor = null; }

window.openAiedueKoreanShopItemEditor = function(itemId = '') {
    const item = itemId ? aiedueKoreanShopItemsCache.get(itemId) : {};
    showKoreanShopModal(`
        <div class="pr-10"><h3 class="text-2xl font-black text-[#2c3e50] mb-4">${itemId ? '상점 물품 수정' : '상점 물품 추가'}</h3>
        <div class="space-y-3">
            <input id="korean-shop-edit-name" class="premium-input bg-white" placeholder="물품 이름" value="${escapeKoreanShopHtml(item?.name || '')}">
            <input id="korean-shop-edit-price" type="number" min="0" class="premium-input bg-white" placeholder="가격" value="${Number(item?.price || 0)}">
            <input id="korean-shop-edit-image" class="premium-input bg-white" placeholder="이미지 URL" value="${escapeKoreanShopHtml(item?.imageUrl || '')}">
            <textarea id="korean-shop-edit-desc" class="premium-input bg-white min-h-[110px]" placeholder="설명">${escapeKoreanShopHtml(item?.description || '')}</textarea>
            <button type="button" class="btn-primary w-full py-3" onclick="saveAiedueKoreanShopItem('${escapeInlineJsString(itemId)}')">저장</button>
        </div></div>`);
}

window.editAiedueKoreanShopItem = function(itemId) { openAiedueKoreanShopItemEditor(itemId); }

window.saveAiedueKoreanShopItem = async function(itemId = '') {
    const payload = {
        name: document.getElementById('korean-shop-edit-name')?.value.trim() || '상점 물품',
        price: Math.max(0, Math.floor(Number(document.getElementById('korean-shop-edit-price')?.value || 0))),
        imageUrl: document.getElementById('korean-shop-edit-image')?.value.trim() || '',
        description: document.getElementById('korean-shop-edit-desc')?.value.trim() || '',
        teacherId: currentUserId,
        teacherName: currentUserName || currentUserProfileSnapshot.userName || '선생님',
        updatedAt: serverTimestamp()
    };
    try {
        if (itemId) await setDoc(doc(db, 'shopItems', itemId), payload, { merge: true });
        else await addDoc(collection(db, 'shopItems'), { ...payload, createdAt: serverTimestamp() });
        await openAiedueKoreanTeacherShop();
    } catch (error) { console.error('shop item save failed', error); showModal('상점 물품 저장에 실패했어요.'); }
}

window.deleteAiedueKoreanShopItem = async function(itemId) {
    if (!confirm('이 상점 물품을 삭제할까요?')) return;
    try {
        await deleteDoc(doc(db, 'shopItems', itemId));
        try {
            const assignmentsSnap = await getDocs(query(collectionGroup(db, 'assignedShopItems'), where('itemId', '==', itemId)));
            await Promise.allSettled(assignmentsSnap.docs.map((docSnap) => deleteDoc(docSnap.ref)));
        } catch (cleanupError) {
            console.warn('assigned shop item cleanup failed', cleanupError);
        }
        await openAiedueKoreanTeacherShop();
    }
    catch (error) { console.error('shop item delete failed', error); showModal('상점 물품 삭제에 실패했어요.'); }
}

async function assignAiedueKoreanShopItemToStudent(item, student) {
    await setDoc(doc(db, `users/${student.id}/assignedShopItems`, item.id), {
        itemId: item.id,
        itemName: item.name || '상점 물품',
        name: item.name || '상점 물품',
        description: item.description || '',
        price: Number(item.price || 0),
        imageUrl: item.imageUrl || '',
        teacherId: currentUserId,
        teacherName: currentUserName || '선생님',
        assignedAt: serverTimestamp()
    }, { merge: true });
}

window.openAiedueKoreanDistributeShopItem = async function(itemId) {
    const item = aiedueKoreanShopItemsCache.get(itemId);
    if (!item) return;
    const students = await getAiedueKoreanClassStudents();
    const list = students.length ? students.map((st) => `<label class="flex items-center justify-between p-2 rounded-xl hover:bg-gray-50"><span class="font-bold">${escapeKoreanShopHtml(st.name || '학생')} <span class="text-xs text-gray-400">${escapeKoreanShopHtml(st.userCode || '')}</span></span><input type="checkbox" class="korean-shop-student-check" value="${escapeHtml(st.id)}"></label>`).join('') : '<p class="text-center text-gray-500 py-6">학급 학생이 없어요.</p>';
    showKoreanShopModal(`<div class="pr-10"><h3 class="text-2xl font-black text-[#2c3e50] mb-2">학생별 배부</h3><p class="font-bold text-amber-600 mb-4">${escapeKoreanShopHtml(item.name || '상점 물품')}</p><div class="max-h-[55vh] overflow-y-auto custom-scrollbar border rounded-3xl p-3">${list}</div><button type="button" class="btn-primary w-full mt-4 py-3" onclick="confirmAiedueKoreanDistributeShopItem('${escapeInlineJsString(itemId)}')">선택 학생에게 배부</button></div>`);
}

window.confirmAiedueKoreanDistributeShopItem = async function(itemId) {
    const item = aiedueKoreanShopItemsCache.get(itemId);
    const ids = Array.from(document.querySelectorAll('.korean-shop-student-check:checked')).map((el) => el.value);
    if (!item || !ids.length) { showModal('배부할 학생을 선택해주세요.'); return; }
    const students = (await getAiedueKoreanClassStudents()).filter((st) => ids.includes(st.id));
    try { await Promise.all(students.map((st) => assignAiedueKoreanShopItemToStudent(item, st))); showModal(`${students.length}명에게 배부했어요.`); }
    catch (error) { console.error('distribute failed', error); showModal('배부에 실패했어요.'); }
}

window.distributeAllAiedueKoreanShopItems = async function() {
    const items = Array.from(aiedueKoreanShopItemsCache.values());
    const students = await getAiedueKoreanClassStudents();
    if (!items.length || !students.length) { showModal('배부할 물품이나 학생이 없어요.'); return; }
    if (!confirm(`내 학급 ${students.length}명에게 상점 물품 ${items.length}개를 모두 배부할까요?`)) return;
    try {
        const jobs = [];
        items.forEach((item) => students.forEach((st) => jobs.push(assignAiedueKoreanShopItemToStudent(item, st))));
        await Promise.all(jobs);
        showModal(`내 학급 전체에 ${items.length}개 상점 물품을 배부했어요.`);
    } catch (error) { console.error('bulk distribute failed', error); showModal('전체 배부에 실패했어요.'); }
}

window.confirmAiedueKoreanShopPurchase = function(itemId) {
    const item = aiedueKoreanShopItemsCache.get(itemId);
    if (!item) {
        showModal('상점 물품 정보를 찾을 수 없어요.');
        return;
    }
    const pricing = calculateKoreanShopPrice(item);
    showModal(`
        <div class="text-left">
            <h3 class="text-2xl font-black text-[#2c3e50] mb-3">구매할까요?</h3>
            <p class="text-gray-700"><strong>${escapeKoreanShopHtml(item.name || '상점 물품')}</strong>을(를) <strong class="text-amber-600">${formatAiedueShopCurrency(pricing.adjustedPrice)}</strong>에 구매합니다.</p>
            ${pricing.warningTokenCount > 0 ? `<p class="text-sm text-red-500 mt-2">주의 토큰 ${pricing.warningTokenCount}개 때문에 가격이 ${pricing.multiplier}배예요.</p>` : ''}
            <div class="flex justify-end gap-2 mt-6">
                <button type="button" class="btn-outline px-4 py-2" onclick="handleModalConfirm()">취소</button>
                <button type="button" class="btn-primary px-4 py-2" onclick="purchaseAiedueKoreanShopItem('${escapeInlineJsString(itemId)}')">구매하기</button>
            </div>
        </div>
    `);
}

window.purchaseAiedueKoreanShopItem = async function(itemId) {
    const item = aiedueKoreanShopItemsCache.get(itemId);
    if (!item || !currentUserId) {
        showModal('구매 정보를 찾을 수 없어요.');
        return;
    }
    const pricing = calculateKoreanShopPrice(item);
    const userRef = doc(db, 'users', currentUserId);
    try {
        let updatedWallet = null;
        await runTransaction(db, async (transaction) => {
            const userSnap = await transaction.get(userRef);
            if (!userSnap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다.');
            const userData = userSnap.data() || {};
            const balance = asNumber(userData.balance ?? userData.coins ?? userData.aeduTokens, 0);
            if (balance < pricing.adjustedPrice) throw new Error('포인트가 부족합니다.');
            const coins = asNumber(userData.coins ?? balance, balance);
            const aeduTokens = asNumber(userData.aeduTokens ?? balance, balance);
            const aeduExperience = asNumber(userData.aeduExperience ?? currentUserAeduExperience, 0);
            updatedWallet = {
                balance: balance - pricing.adjustedPrice,
                coins: Math.max(0, coins - pricing.adjustedPrice),
                aeduTokens: Math.max(0, aeduTokens - pricing.adjustedPrice),
                aeduExperience,
                aeduLevel: asNumber(userData.aeduLevel ?? calculateAiedueLevel(aeduExperience), 1)
            };
            transaction.update(userRef, { ...updatedWallet, updatedAt: serverTimestamp() });
        });
        currentUserBalance = updatedWallet.balance;
        currentUserCoins = updatedWallet.coins;
        currentUserAeduTokens = updatedWallet.aeduTokens;
        currentUserAeduExperience = updatedWallet.aeduExperience;
        currentUserAeduLevel = updatedWallet.aeduLevel;
        currentUserProfileSnapshot = { ...currentUserProfileSnapshot, ...updatedWallet };
        updateSyncedActivityHeaders({ name: currentUserName, coins: currentUserCoins, icon: currentUserIcon });
        document.getElementById('dashboard-coins').innerText = currentUserCoins;
        document.getElementById('dashboard-coins-header').innerText = currentUserCoins;
        const teacherId = item.teacherId || currentUserProfileSnapshot.teacherId || null;
        await addDoc(collection(db, 'purchaseLog'), {
            studentId: currentUserId,
            studentName: currentUserName,
            userCode: currentUserProfileSnapshot.userCode || null,
            itemId,
            itemName: item.name || '상점 물품',
            price: pricing.adjustedPrice,
            basePrice: pricing.basePrice,
            warningTokenCount: pricing.warningTokenCount,
            priceMultiplier: pricing.multiplier,
            teacherId,
            teacherName: item.teacherName || '',
            source: 'aiedue-korean',
            purchasedAt: serverTimestamp()
        });
        showModal(`${escapeKoreanShopHtml(item.name || '상점 물품')} 구매가 완료됐어요!`);
    } catch (error) {
        console.error('Aiedue Korean shop purchase failed', error);
        showModal(`구매 실패: ${escapeKoreanShopHtml(error.message || '알 수 없는 오류')}`);
    }
}

function updateSyncedActivityHeaders({ name, coins, icon } = {}) {
    document.querySelectorAll('.sync-account-name').forEach((el) => {
        el.innerText = name || '이름 없음';
    });
    document.querySelectorAll('.sync-coins').forEach((el) => {
        el.innerText = coins ?? 0;
    });
    document.querySelectorAll('.sync-user-icon').forEach((el) => {
        el.innerText = icon || '🐻';
    });
    document.querySelectorAll('.sync-user-role').forEach((el) => {
        el.innerText = currentUserRole === 'teacher' ? '선생님' : '학생';
    });
    const level = typeof currentUserAeduLevel !== 'undefined' ? currentUserAeduLevel : 1;
    document.querySelectorAll('.sync-aedu-level').forEach((el) => {
        el.innerText = level;
    });
    const exp = typeof currentUserAeduExperience !== 'undefined' ? currentUserAeduExperience : 0;
    document.querySelectorAll('.sync-aedu-exp-percent').forEach((el) => {
        el.innerText = `${Math.floor(exp)}%`;
    });
    document.querySelectorAll('.sync-aedu-exp-bar').forEach((el) => {
        el.style.width = `${Math.min(100, Math.max(0, exp))}%`;
    });
    document.getElementById('aiedue-rpg-hud')?.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', String(Math.min(100, Math.max(0, Math.floor(exp)))));
    const warnings = typeof currentUserWarningTokens !== 'undefined' ? currentUserWarningTokens : 0;
    document.querySelectorAll('.sync-warning-tokens').forEach((el) => {
        el.innerText = Math.max(0, Math.floor(asNumber(warnings, 0)));
    });
}

function updateAccountName(name) {
    const safeName = name || '이름 없음';
    document.getElementById('dashboard-account-name').innerText = safeName;
    const coins = document.getElementById('dashboard-coins')?.innerText || 0;
    const icon = document.getElementById('user-icon-btn')?.innerText || '🐻';
    updateSyncedActivityHeaders({ name: safeName, coins, icon });
}

function findLearningItemByStep(step) {
    const allItems = Object.values(learningUnits).flat();
    return allItems.find((item) => item.step === step) || null;
}

function updateTodayKoreanPreview() {
    const nextStep = currentLearningStep + 1;
    const todayLabel = document.getElementById('today-korean-step-label');
    if (!todayLabel) return;
    if (currentLearningStep >= 33) {
        todayLabel.innerText = '한글 배움 완료';
        return;
    }
    if (nextStep <= 0) {
        todayLabel.innerText = '배움 시작 활동';
        return;
    }
    const nextItem = findLearningItemByStep(nextStep);
    todayLabel.innerText = nextItem ? nextItem.title : `배움 ${nextStep} 활동`;
}

function updateDashboardExperience(userData = {}) {
    currentUserRole = (userData?.role || 'student').toLowerCase();
    const rawLearningStep = Number(userData?.currentLearningStep);
    currentLearningStep = Number.isFinite(rawLearningStep) ? Math.min(33, Math.max(-1, Math.floor(rawLearningStep))) : -1;

    // 교사가 학생 계정에 저장한 단계만 활성화한다. 교사는 전체 단계를 확인할 수 있다.
    unlockedLevels = normalizeUnlockedLevels(userData?.unlockedLevels, currentUserRole);
    if (currentUserRole === 'teacher') {
        document.getElementById('teacher-manage-btn').classList.remove('hidden');
        document.getElementById('rpg-teacher-manage-btn')?.classList.remove('hidden');
        document.getElementById('rpg-student-shop-btn')?.classList.remove('hidden');
    } else {
        document.getElementById('teacher-manage-btn').classList.add('hidden');
        document.getElementById('rpg-teacher-manage-btn')?.classList.add('hidden');
        document.getElementById('rpg-student-shop-btn')?.classList.remove('hidden');
    }

    // Profile UI Upgrade
    const name = userData?.name || '홍길동';
    const icon = userData?.icon || '🐻';
    currentUserProfileSnapshot = buildAiedueSchoolProfileSnapshot(userData);
    setCurrentAiedueSchoolWalletFromSnapshot(currentUserProfileSnapshot);
    const coins = currentUserCoins;
    currentUserDrawingStep = Number.isFinite(Number(userData?.currentDrawingStep)) ? Math.max(-1, Math.floor(Number(userData.currentDrawingStep))) : -1;
    if (currentUserRole === 'teacher') {
        currentUserDrawingStep = Math.max(currentUserDrawingStep, drawingMissions.length);
    }
    currentUserName = name;
    currentUserIcon = icon;
    currentUserCoins = Number(coins) || 0;
    currentUserBalance = asNumber(currentUserProfileSnapshot.balance, currentUserCoins);
    currentUserAeduTokens = asNumber(currentUserProfileSnapshot.aeduTokens, currentUserBalance);
    currentUserWarningTokens = asNumber(currentUserProfileSnapshot.warningTokens, 0);
    currentUserAeduExperience = asNumber(currentUserProfileSnapshot.aeduExperience, currentUserAeduExperience);
    currentUserAeduLevel = asNumber(currentUserProfileSnapshot.aeduLevel, currentUserAeduLevel);
    drawingPortfolio = {
        missions: userData?.drawingPortfolio?.missions || {},
        free: Array.isArray(userData?.drawingPortfolio?.free) ? userData.drawingPortfolio.free : [],
        unlockedTemplates: Array.isArray(userData?.drawingPortfolio?.unlockedTemplates) ? userData.drawingPortfolio.unlockedTemplates : [],
        rewardedMilestones: Array.isArray(userData?.drawingPortfolio?.rewardedMilestones) ? userData.drawingPortfolio.rewardedMilestones : [],
        shapeStats: userData?.drawingPortfolio?.shapeStats || {},
        unpaidCooldownUntil: Number(userData?.drawingPortfolio?.unpaidCooldownUntil || 0)
    };
    currentUserDictationStep = Number.isFinite(Number(userData?.currentDictationStep)) ? Math.max(-1, Math.floor(Number(userData.currentDictationStep))) : -1;
    dictationPortfolio = normalizeDictationPortfolio(userData?.dictationPortfolio);
    if (currentUserRole === 'teacher') {
        currentUserDictationStep = Math.max(currentUserDictationStep, dictationItems.length);
    }
    literacyPortfolio = normalizeLiteracyPortfolio(userData?.literacyPortfolio, userData?.literacyDan);

    // Main Sidebar/Drawer Info
    document.getElementById('dashboard-account-name').innerText = name;
    document.getElementById('user-role-badge').innerText = currentUserRole === 'teacher' ? '선생님' : '학생';
    document.getElementById('dashboard-level-label').innerText = currentUserRole === 'teacher' ? '선생님 모드' : `${currentLearningStep + 1}단계`;
    document.getElementById('dashboard-coins').innerText = coins;
    document.getElementById('user-icon-btn').innerText = icon;

    // Header Info (Direct Display)
    const headerName = document.getElementById('dashboard-account-name-header');
    const headerCoins = document.getElementById('dashboard-coins-header');
    const headerIcon = document.getElementById('dashboard-user-icon-header');

    if (headerName) headerName.innerText = name;
    if (headerCoins) headerCoins.innerText = coins;
    if (headerIcon) headerIcon.innerText = icon;
    const headerWarnings = document.getElementById('dashboard-warning-tokens-header');
    if (headerWarnings) headerWarnings.innerText = currentUserWarningTokens;
    updateSyncedActivityHeaders({ name, coins, icon });

    // Update Level Cards
    for (let i = 1; i <= 4; i++) {
        const card = document.getElementById(`card-level-${i}`);
        const isUnlocked = unlockedLevels.includes(i);
        if (isUnlocked) {
            card.classList.remove('locked');
        } else {
            card.classList.add('locked');
        }
        card.disabled = !isUnlocked;
        card.setAttribute('aria-disabled', String(!isUnlocked));
    }

    updateTodayKoreanPreview();
    updateDrawingDashboardPreview();
    updateDictationDashboardPreview();
    updateLiteracyDashboardPreview();
}

function stopAiedueSchoolProfileSync() {
    if (typeof currentUserProfileUnsubscribe === 'function') {
        try { currentUserProfileUnsubscribe(); } catch (error) { console.warn('Aiedue school profile sync unsubscribe failed', error); }
    }
    currentUserProfileUnsubscribe = null;
    lastSyncedProfileUid = null;
}

function startAiedueSchoolProfileSync(uid) {
    if (!uid || lastSyncedProfileUid === uid) return;
    stopAiedueSchoolProfileSync();
    lastSyncedProfileUid = uid;
    const userRef = doc(db, 'users', uid);
    currentUserProfileUnsubscribe = onSnapshot(userRef, async (snapshot) => {
        if (!snapshot.exists()) return;
        const userData = snapshot.data() || {};
        try {
            const teacherId = userData.teacherId || null;
            const classId = userData.classId || userData.classCode || null;
            await loadKoreanExperienceMultipliers(teacherId, classId);
            updateDashboardExperience(userData);
            updateSyncedActivityHeaders({ name: currentUserName, coins: currentUserCoins, icon: currentUserIcon });
            const visibleActivityRoute = getVisibleActivityRoute();
            if (visibleActivityRoute) hydrateActivityRouteSection(visibleActivityRoute);
            console.info('[AiedueSchoolSync] profile synced', {
                uid,
                balance: currentUserBalance,
                coins: currentUserCoins,
                aeduTokens: currentUserAeduTokens,
                aeduExperience: currentUserAeduExperience,
                aeduLevel: currentUserAeduLevel,
                warningTokens: currentUserWarningTokens
            });
        } catch (error) {
            console.warn('Aiedue school profile sync update failed', error);
        }
    }, (error) => {
        console.warn('Aiedue school profile sync listener failed', error);
    });
}

const topLevelSectionIds = [
    'start-screen',
    'login-section',
    'dashboard-section',
    'drawing-activities-section',
    'dictation-activities-section',
    'literacy-activities-section',
    'hangul-activities-section',
    'my-drawing-section',
    'drawing-workspace-section',
    'my-dictation-section',
    'dictation-workspace-section',
    'spelling-quiz-section',
    'my-korean-section',
    'learning-start-section',
    'learning-detail-section',
    'letter-writing-section',
    'word-writing-quiz-section',
    'word-listening-quiz-section',
    'reading-practice-section',
    'hangul-game-section',
    'aiedue-korean-cloud-section',
    'literacy-workspace-section'
];

function getVisibleDisplayValue(section) {
    return section.classList.contains('view-section') ? 'flex' : 'block';
}

function setTopLevelSectionVisible(sectionId, isVisible) {
    const section = document.getElementById(sectionId);
    if (!section) return;

    if (isVisible) {
        section.classList.remove('hidden');
        section.style.display = getVisibleDisplayValue(section);
        section.style.zIndex = section.classList.contains('view-section') ? '20' : '15';
        return;
    }

    section.classList.add('hidden');
    section.style.display = 'none';
    section.style.zIndex = '';
}

function showTopLevelSection(sectionId) {
    topLevelSectionIds.forEach((id) => {
        setTopLevelSectionVisible(id, id === sectionId);
    });
    setRpgHudVisible(Boolean(currentUserId) && !['start-screen', 'login-section'].includes(sectionId));

    // 일부 진입 경로(브라우저 뒤로가기/직접 섹션 표시/외부 라우트)에서는
    // openMyKoreanSection() 또는 openMyDrawingFromDashboard()를 거치지 않아
    // 동적으로 채우는 단계 목록이 빈 화면으로 남을 수 있다.
    refreshDynamicSectionContent(sectionId);
}

function setRpgHudVisible(isVisible) {
    const hud = document.getElementById('aiedue-rpg-hud');
    hud?.classList.toggle('hidden', !isVisible);
    if (!isVisible && hud) {
        hud.classList.remove('actions-open');
        hud.querySelector('.rpg-expand-button')?.setAttribute('aria-expanded', 'false');
        hud.querySelector('.rpg-expand-button')?.setAttribute('aria-label', '하단 메뉴 펼치기');
        const tray = hud.querySelector('.rpg-action-tray');
        tray?.setAttribute('aria-hidden', 'true');
        if (tray) tray.inert = true;
    }
    document.body.classList.toggle('rpg-hud-active', isVisible);
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

window.goBackFromRpgHud = function goBackFromRpgHud() {
    const visibleSectionId = topLevelSectionIds.find((id) => {
        const section = document.getElementById(id);
        return section && !section.classList.contains('hidden') && section.style.display !== 'none';
    });
    if (!visibleSectionId || visibleSectionId === 'dashboard-section') {
        openDashboard();
        return;
    }
    if (['drawing-activities-section', 'dictation-activities-section', 'literacy-activities-section', 'hangul-activities-section'].includes(visibleSectionId)) {
        openDashboard();
        return;
    }
    if (['my-drawing-section', 'drawing-workspace-section'].includes(visibleSectionId)) {
        goDrawingDashboard();
        return;
    }
    if (['my-dictation-section', 'dictation-workspace-section', 'spelling-quiz-section'].includes(visibleSectionId)) {
        goDictationDashboard();
        return;
    }
    if (visibleSectionId === 'literacy-workspace-section') {
        showTopLevelSection('literacy-activities-section');
        return;
    }
    if (['my-korean-section', 'learning-start-section', 'learning-detail-section', 'letter-writing-section', 'word-writing-quiz-section', 'word-listening-quiz-section', 'reading-practice-section', 'hangul-game-section'].includes(visibleSectionId)) {
        goHangulDashboard();
        return;
    }
    openDashboard();
};

function refreshDynamicSectionContent(sectionId) {
    requestAnimationFrame(() => {
        if (sectionId === 'my-korean-section') {
            const profileLevel = document.getElementById('my-korean-profile-level');
            const profileName = document.getElementById('my-korean-profile-name');
            const stepLabel = document.getElementById('current-learning-step-label');
            if (profileLevel) profileLevel.innerText = getLearningLevelLabel(currentLearningStep);
            if (profileName) profileName.innerText = document.getElementById('dashboard-account-name')?.innerText || currentUserName || '이름';
            if (stepLabel) stepLabel.innerText = getLearningStepBadge(currentLearningStep);
            if (typeof renderMyKoreanTabs === 'function') renderMyKoreanTabs();
            if (typeof renderMyKoreanList === 'function') renderMyKoreanList();
        }

        if (sectionId === 'my-drawing-section' && typeof renderMyDrawingSection === 'function') {
            renderMyDrawingSection();
        }
    });
}

function syncInitialHiddenSections() {
    topLevelSectionIds.forEach((id) => {
        const section = document.getElementById(id);
        if (section?.classList.contains('hidden')) {
            section.style.display = 'none';
        }
    });
}

syncInitialHiddenSections();

window.showLoginFromStart = function() {
    showTopLevelSection('login-section');

    // 만약 이미 음악이 켜져 있다면 계속 유지, 꺼져 있다면 그대로 유지
}

let isMuted = true;

window.playClickSound = function() {
    if (!isMuted) {
        const sound = document.getElementById('click-sound');
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => {});
        }
    }
};

// 전역 클릭 리스너 (모든 버튼 및 클릭 가능 요소에 효과음 적용)
document.addEventListener('click', (e) => {
    const target = e.target;
    if (target.closest('button') || target.closest('.level-card') || target.closest('.nav-tab')) {
        playClickSound();
    }
});

window.toggleMute = function() {
    const bgm = document.getElementById('bg-music');
    const icons = document.querySelectorAll('.mute-control-btn span');
    const btns = document.querySelectorAll('.mute-control-btn');

    if (isMuted) {
        bgm.volume = 0.3;
        bgm.play().catch(e => console.log("Play blocked:", e));
        icons.forEach(icon => icon.textContent = '🔊');
        btns.forEach(btn => btn.classList.add('playing'));
        isMuted = false;
    } else {
        bgm.pause();
        icons.forEach(icon => icon.textContent = '🔇');
        btns.forEach(btn => btn.classList.remove('playing'));
        isMuted = true;
    }
}

window.switchLoginView = function(role) {
    currentView = role;
    const studentBtn = document.getElementById('student-tab-btn');
    const teacherBtn = document.getElementById('teacher-tab-btn');
    const studentView = document.getElementById('student-login-view');
    const teacherView = document.getElementById('teacher-login-view');

    if (role === 'student') {
        studentBtn.classList.add('active');
        teacherBtn.classList.remove('active');
        studentView.classList.remove('hidden');
        teacherView.classList.add('hidden');
    } else {
        studentBtn.classList.remove('active');
        teacherBtn.classList.add('active');
        studentView.classList.add('hidden');
        teacherView.classList.remove('hidden');
    }
}

window.enterLevel = function(level) {
    const activityByLevel = { 1: 'drawing', 2: 'hangul', 3: 'dictation', 4: 'literacy' };
    const activityKey = activityByLevel[level];
    if (activityKey) {
        openActivityRoute(activityKey);
        return;
    }

    showModal(`✨ ${level}단계 모험은 곧 시작됩니다!`);
}

function hideAllActivitySections() {
    [
        'my-korean-section',
        'learning-start-section',
        'learning-detail-section',
        'letter-writing-section',
        'word-writing-quiz-section',
        'word-listening-quiz-section',
        'reading-practice-section',
        'hangul-game-section',
        'aiedue-korean-cloud-section',
        'my-drawing-section',
        'drawing-workspace-section',
        'my-dictation-section',
        'dictation-workspace-section',
        'spelling-quiz-section'
    ].forEach((id) => setTopLevelSectionVisible(id, false));
}

function showDashboardOnly() {
    showTopLevelSection('dashboard-section');
}

function openDashboard() {
    showDashboardOnly();
    document.getElementById('main-container').style.maxWidth = '1100px';
    // 로그인 후 대시보드 진입 시 배경음악 정지
    const bgm = document.getElementById('bg-music');
    if (bgm) {
        bgm.pause();
        bgm.currentTime = 0;
    }
    isMuted = true;
    document.querySelectorAll('.mute-control-btn span').forEach(icon => icon.textContent = '🔇');
    document.querySelectorAll('.mute-control-btn').forEach(btn => btn.classList.remove('playing'));
}

window.showDashboardOnly = showDashboardOnly;
window.openDashboard = openDashboard;

async function ensureTeacherProfile(user, fallbackName) {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            name: fallbackName || user.displayName || '선생님',
            email: user.email || '',
            role: 'teacher',
            userCode: null,
            coins: 0,
            balance: 0,
            portfolio: {},
            drawingPortfolio: { missions: {}, free: [] },
            dictationPortfolio: { missions: {}, aiWords: [] },
            aeduTokens: 0,
            aeduExperience: 0,
            aeduLevel: 1,
            currentDrawingStep: 5,
            currentDictationStep: 5,
            warningTokens: 0,
            createdAt: serverTimestamp()
        }, { merge: true });
        return { name: fallbackName || user.displayName || '선생님', role: 'teacher' };
    }
    const data = snap.data();
    if ((data.role || '').toLowerCase() !== 'teacher') {
        throw new Error('teacher-account-required');
    }
    return data;
}


window.addNumber = function addNumber(num) {
    if (inputPassword.length < 8) {
        inputPassword += num;
        document.getElementById('password-display').innerText = inputPassword;
    }
}

window.backspace = function backspace() {
    inputPassword = inputPassword.slice(0, -1);
    document.getElementById('password-display').innerText = inputPassword;
}

window.goHomeDashboard = function goHomeDashboard() {
    showDashboardOnly();
}

window.goHangulDashboard = function goHangulDashboard() {
    updateTodayKoreanPreview();
    showTopLevelSection('hangul-activities-section');
}

window.goDrawingDashboard = function goDrawingDashboard() {
    updateDrawingDashboardPreview();
    showTopLevelSection('drawing-activities-section');
}

window.goDictationDashboard = function goDictationDashboard() {
    showTopLevelSection('dictation-activities-section');
}

window.openMyKoreanFromDashboard = function openMyKoreanFromDashboard() {
    if (currentLearningStep < 0 && currentUserRole !== 'teacher') {
        showModal('배움 시작 활동을 완료하면 나의 한글이 열려요.');
        return;
    }
    openMyKoreanSection();
}

window.openLetterWritingActivity = function openLetterWritingActivity(category = 'letter') {
    showTopLevelSection('letter-writing-section');
    requestAnimationFrame(() => {
        const tab = document.querySelector(`.letter-top-btn[data-category="${category}"]`);
        if (tab) {
            tab.click();
        } else if (typeof window.refreshLetterWritingCanvas === 'function') {
            window.refreshLetterWritingCanvas();
        }
    });
}

window.openWordWritingQuizActivity = function openWordWritingQuizActivity() {
    showTopLevelSection('word-writing-quiz-section');
    requestAnimationFrame(() => {
        if (typeof window.refreshWordWritingCanvas === 'function') {
            window.refreshWordWritingCanvas();
        }
    });
}

window.openWordListeningQuizActivity = function openWordListeningQuizActivity() {
    showTopLevelSection('word-listening-quiz-section');
}

window.openReadingPracticeActivity = function openReadingPracticeActivity() {
    showTopLevelSection('reading-practice-section');
    requestAnimationFrame(() => {
        renderReadingPracticeCards();
    });
}

const readingPracticeCards = {
    greeting: [
        { phrase: '안녕하세요', emoji: '👋' },
        { phrase: '감사합니다', emoji: '🙏' },
        { phrase: '죄송합니다', emoji: '😢' },
        { phrase: '반가워요', emoji: '✨' },
        { phrase: '안녕히 가세요', emoji: '🙋' },
        { phrase: '또 만나요', emoji: '🤗' }
    ],
    animal: [
        { phrase: '강아지', emoji: '🐶' },
        { phrase: '고양이', emoji: '🐱' },
        { phrase: '토끼', emoji: '🐰' },
        { phrase: '코끼리', emoji: '🐘' },
        { phrase: '기린', emoji: '🦒' },
        { phrase: '사자', emoji: '🦁' }
    ],
    food: [
        { phrase: '김밥', emoji: '🍙' },
        { phrase: '떡볶이', emoji: '🍲' },
        { phrase: '비빔밥', emoji: '🥗' },
        { phrase: '라면', emoji: '🍜' },
        { phrase: '사과', emoji: '🍎' },
        { phrase: '수박', emoji: '🍉' }
    ]
};
let activeReadingCategory = 'greeting';
let readingSlowMode = false;
let readingActiveCard = null;
let readingSlowTimer = null;

window.toggleReadingSlowMode = function toggleReadingSlowMode() {
    readingSlowMode = !readingSlowMode;
    const btn = document.getElementById('reading-slow-toggle');
    if (btn) {
        btn.setAttribute('aria-pressed', readingSlowMode ? 'true' : 'false');
        btn.classList.toggle('active', readingSlowMode);
        btn.innerHTML = readingSlowMode
            ? '<span aria-hidden="true">🐌</span><span>느리게 읽는 중</span>'
            : '<span aria-hidden="true">🐢</span><span>느리게 읽기</span>';
    }
    clearReadingSpeechState();
}

function clearReadingSpeechState() {
    if (readingSlowTimer) {
        clearTimeout(readingSlowTimer);
        readingSlowTimer = null;
    }
    cancelSpeech();
    if (readingActiveCard) {
        readingActiveCard.querySelectorAll('.reading-card-char').forEach((span) => {
            span.classList.remove('active');
        });
        readingActiveCard = null;
    }
}

function speakReadingPhrase(card, phrase) {
    clearReadingSpeechState();
    card.classList.add('reading-card-bounce');
    window.setTimeout(() => card.classList.remove('reading-card-bounce'), 420);
    if (readingSlowMode) {
        speakReadingPhraseSlowly(card, phrase);
        return;
    }
    const chars = card.querySelectorAll('.reading-card-char');
    chars.forEach((span) => span.classList.add('active'));
    speakTextKo(phrase, () => chars.forEach((span) => span.classList.remove('active')), { playbackRate: 0.96 });
}

function speakReadingPhraseSlowly(card, phrase) {
    readingActiveCard = card;
    const spans = card.querySelectorAll('.reading-card-char');
    const chars = Array.from(phrase);
    let index = 0;
    const speakNext = () => {
        if (index >= chars.length) {
            clearReadingSpeechState();
            return;
        }
        const char = chars[index];
        const span = spans[index];
        if (!char.trim()) {
            index += 1;
            readingSlowTimer = window.setTimeout(speakNext, 220);
            return;
        }
        if (span) span.classList.add('active');
        const finishChar = () => {
            if (span) span.classList.remove('active');
            index += 1;
            readingSlowTimer = window.setTimeout(speakNext, 180);
        };
        speakTextKo(char, finishChar, { playbackRate: 0.82 });
    };
    speakNext();
}

function renderReadingPracticeCards() {
    const grid = document.getElementById('reading-cards-grid');
    if (!grid) return;
    const cards = readingPracticeCards[activeReadingCategory] || readingPracticeCards.greeting;
    grid.innerHTML = cards.map((item, index) => {
        const chars = Array.from(item.phrase).map((char, charIndex) => (
            `<span class="reading-card-char${char === ' ' ? ' space' : ''}" data-index="${charIndex}">${char === ' ' ? '&nbsp;' : char}</span>`
        )).join('');
        return `<button type="button" class="reading-card" data-index="${index}" aria-label="${item.phrase} 읽기">
            <span class="reading-card-emoji" aria-hidden="true">${item.emoji}</span>
            <span class="reading-card-phrase">${chars}</span>
        </button>`;
    }).join('');
    grid.querySelectorAll('.reading-card').forEach((card) => {
        card.addEventListener('click', () => {
            const item = cards[Number(card.dataset.index)];
            if (item) speakReadingPhrase(card, item.phrase);
        });
    });
}

document.querySelectorAll('[data-reading-category]').forEach((button) => {
    button.addEventListener('click', () => {
        clearReadingSpeechState();
        activeReadingCategory = button.dataset.readingCategory;
        document.querySelectorAll('[data-reading-category]').forEach((item) => item.classList.toggle('active', item === button));
        renderReadingPracticeCards();
    });
});

window.openHangulGameActivity = function openHangulGameActivity() {
    showTopLevelSection('hangul-game-section');
    requestAnimationFrame(() => {
        if (typeof window.startHangulSoundGame === 'function') {
            window.startHangulSoundGame();
        }
    });
}

const drawingShapeLibrary = [
    { key: 'line', label: '직선', color: '#7c3aed' },
    { key: 'wave', label: '꾸불선', color: '#0ea5e9' },
    { key: 'circle', label: '동그라미', color: '#ef4444' },
    { key: 'triangle', label: '세모', color: '#f97316' },
    { key: 'square', label: '네모', color: '#22c55e' },
    { key: 'star', label: '별', color: '#facc15' },
    { key: 'pentagon', label: '오각형', color: '#14b8a6' },
    { key: 'heart', label: '하트', color: '#ec4899' },
    { key: 'diamond', label: '마름모', color: '#8b5cf6' },
    { key: 'zigzag', label: '지그재그', color: '#64748b' }
];
const drawingShapeMap = Object.fromEntries(drawingShapeLibrary.map((item) => [item.key, item]));

const drawingTemplateLibrary = [
    { key: 'blank', label: '빈 종이', type: 'free', shapes: [] },
    { key: 'line', label: '직선 연습', type: 'trace', shapes: [{ shape: 'line', x: 0.18, y: 0.3, w: 0.64, h: 0.01 }, { shape: 'line', x: 0.18, y: 0.5, w: 0.64, h: 0.01 }, { shape: 'line', x: 0.18, y: 0.7, w: 0.64, h: 0.01 }] },
    { key: 'waves', label: '꾸불선 연습', type: 'trace', shapes: [{ shape: 'wave', x: 0.5, y: 0.35, w: 0.7, h: 0.16 }, { shape: 'wave', x: 0.5, y: 0.6, w: 0.7, h: 0.14 }] },
    { key: 'circles', label: '동그라미 연습', type: 'trace', shapes: [{ shape: 'circle', x: 0.32, y: 0.48, w: 0.24, h: 0.24 }, { shape: 'circle', x: 0.66, y: 0.52, w: 0.3, h: 0.2 }] },
    { key: 'shapes', label: '도형 마을', type: 'trace', shapes: [{ shape: 'square', x: 0.22, y: 0.48, w: 0.22, h: 0.22 }, { shape: 'triangle', x: 0.62, y: 0.5, w: 0.28, h: 0.28 }, { shape: 'circle', x: 0.48, y: 0.28, w: 0.16, h: 0.16 }, { shape: 'diamond', x: 0.78, y: 0.3, w: 0.18, h: 0.18 }] },
    { key: 'flower', label: '꽃밭', type: 'coloring', shapes: [{ shape: 'circle', x: 0.5, y: 0.42, w: 0.14, h: 0.14 }, { shape: 'circle', x: 0.38, y: 0.42, w: 0.13, h: 0.13 }, { shape: 'circle', x: 0.62, y: 0.42, w: 0.13, h: 0.13 }, { shape: 'circle', x: 0.5, y: 0.3, w: 0.13, h: 0.13 }, { shape: 'circle', x: 0.5, y: 0.55, w: 0.13, h: 0.13 }, { shape: 'line', x: 0.5, y: 0.62, w: 0, h: 0.24 }, { shape: 'wave', x: 0.36, y: 0.74, w: 0.28, h: 0.08 }] },
    { key: 'house', label: '우리 집', type: 'coloring', shapes: [{ shape: 'square', x: 0.5, y: 0.58, w: 0.36, h: 0.3 }, { shape: 'triangle', x: 0.5, y: 0.33, w: 0.46, h: 0.28 }, { shape: 'square', x: 0.43, y: 0.6, w: 0.09, h: 0.09 }, { shape: 'square', x: 0.6, y: 0.6, w: 0.09, h: 0.09 }] },
    { key: 'tree', label: '나무', type: 'coloring', shapes: [{ shape: 'line', x: 0.5, y: 0.52, w: 0, h: 0.32 }, { shape: 'circle', x: 0.5, y: 0.34, w: 0.28, h: 0.24 }, { shape: 'circle', x: 0.38, y: 0.42, w: 0.22, h: 0.18 }, { shape: 'circle', x: 0.62, y: 0.42, w: 0.22, h: 0.18 }] },
    { key: 'butterfly', label: '나비', type: 'coloring', shapes: [{ shape: 'line', x: 0.5, y: 0.35, w: 0, h: 0.34 }, { shape: 'heart', x: 0.38, y: 0.45, w: 0.22, h: 0.24 }, { shape: 'heart', x: 0.62, y: 0.45, w: 0.22, h: 0.24 }, { shape: 'wave', x: 0.43, y: 0.22, w: 0.14, h: 0.08 }, { shape: 'wave', x: 0.57, y: 0.22, w: 0.14, h: 0.08 }] },
    { key: 'fish', label: '물고기', type: 'coloring', shapes: [{ shape: 'circle', x: 0.46, y: 0.5, w: 0.34, h: 0.2 }, { shape: 'triangle', x: 0.72, y: 0.5, w: 0.22, h: 0.2 }, { shape: 'circle', x: 0.35, y: 0.46, w: 0.04, h: 0.04 }, { shape: 'wave', x: 0.28, y: 0.68, w: 0.42, h: 0.08 }, { shape: 'wave', x: 0.70, y: 0.68, w: 0.42, h: 0.08 }] },
    { key: 'cat', label: '고양이', type: 'coloring', shapes: [{ shape: 'circle', x: 0.5, y: 0.5, w: 0.28, h: 0.24 }, { shape: 'triangle', x: 0.4, y: 0.32, w: 0.12, h: 0.14 }, { shape: 'triangle', x: 0.6, y: 0.32, w: 0.12, h: 0.14 }, { shape: 'wave', x: 0.32, y: 0.55, w: 0.15, h: 0.06 }, { shape: 'wave', x: 0.53, y: 0.55, w: 0.15, h: 0.06 }] },
    { key: 'rabbit', label: '토끼', type: 'coloring', shapes: [{ shape: 'circle', x: 0.5, y: 0.54, w: 0.24, h: 0.22 }, { shape: 'circle', x: 0.43, y: 0.3, w: 0.09, h: 0.26 }, { shape: 'circle', x: 0.57, y: 0.3, w: 0.09, h: 0.26 }] },
    { key: 'car', label: '자동차', type: 'coloring', shapes: [{ shape: 'square', x: 0.5, y: 0.54, w: 0.48, h: 0.18 }, { shape: 'square', x: 0.5, y: 0.4, w: 0.28, h: 0.14 }, { shape: 'circle', x: 0.35, y: 0.68, w: 0.09, h: 0.09 }, { shape: 'circle', x: 0.65, y: 0.68, w: 0.09, h: 0.09 }] },
    { key: 'rocket', label: '로켓', type: 'coloring', shapes: [{ shape: 'triangle', x: 0.5, y: 0.22, w: 0.18, h: 0.2 }, { shape: 'square', x: 0.5, y: 0.48, w: 0.18, h: 0.32 }, { shape: 'circle', x: 0.5, y: 0.4, w: 0.08, h: 0.08 }, { shape: 'triangle', x: 0.38, y: 0.66, w: 0.12, h: 0.16 }, { shape: 'triangle', x: 0.62, y: 0.66, w: 0.12, h: 0.16 }] },
    { key: 'castle', label: '성', type: 'coloring', shapes: [{ shape: 'square', x: 0.34, y: 0.58, w: 0.18, h: 0.3 }, { shape: 'square', x: 0.66, y: 0.58, w: 0.18, h: 0.3 }, { shape: 'square', x: 0.5, y: 0.64, w: 0.26, h: 0.22 }, { shape: 'triangle', x: 0.34, y: 0.34, w: 0.2, h: 0.18 }, { shape: 'triangle', x: 0.66, y: 0.34, w: 0.2, h: 0.18 }] },
    { key: 'rainbow', label: '무지개', type: 'coloring', shapes: [{ shape: 'wave', variant: 'arc', x: 0.5, y: 0.74, w: 0.70, h: 0.48 }, { shape: 'wave', variant: 'arc', x: 0.5, y: 0.74, w: 0.58, h: 0.39 }, { shape: 'wave', variant: 'arc', x: 0.5, y: 0.74, w: 0.46, h: 0.30 }, { shape: 'circle', x: 0.22, y: 0.70, w: 0.10, h: 0.10 }, { shape: 'circle', x: 0.28, y: 0.67, w: 0.12, h: 0.12 }, { shape: 'circle', x: 0.34, y: 0.70, w: 0.10, h: 0.10 }, { shape: 'circle', x: 0.66, y: 0.70, w: 0.10, h: 0.10 }, { shape: 'circle', x: 0.72, y: 0.67, w: 0.12, h: 0.12 }, { shape: 'circle', x: 0.78, y: 0.70, w: 0.10, h: 0.10 }, { shape: 'line', x: 0.14, y: 0.76, w: 0.72, h: 0 }] },
    { key: 'star', label: '별', type: 'trace', shapes: [{ shape: 'star', x: 0.5, y: 0.5, w: 0.36, h: 0.36 }] },
    { key: 'heart', label: '하트', type: 'trace', shapes: [{ shape: 'heart', x: 0.5, y: 0.5, w: 0.36, h: 0.32 }] },
    { key: 'face', label: '웃는 얼굴', type: 'trace', shapes: [{ shape: 'circle', x: 0.5, y: 0.5, w: 0.34, h: 0.34 }, { shape: 'circle', x: 0.43, y: 0.44, w: 0.04, h: 0.04 }, { shape: 'circle', x: 0.57, y: 0.44, w: 0.04, h: 0.04 }, { shape: 'triangle', x: 0.5, y: 0.57, w: 0.08, h: 0.06 }] },
    { key: 'mountain', label: '산', type: 'coloring', shapes: [{ shape: 'triangle', x: 0.4, y: 0.58, w: 0.34, h: 0.34 }, { shape: 'triangle', x: 0.62, y: 0.56, w: 0.34, h: 0.38 }, { shape: 'circle', x: 0.78, y: 0.24, w: 0.12, h: 0.12 }] },
    { key: 'sea', label: '바다', type: 'coloring', shapes: [{ shape: 'wave', x: 0.28, y: 0.42, w: 0.42, h: 0.08 }, { shape: 'wave', x: 0.70, y: 0.42, w: 0.42, h: 0.08 }, { shape: 'wave', x: 0.26, y: 0.58, w: 0.42, h: 0.08 }, { shape: 'wave', x: 0.68, y: 0.58, w: 0.42, h: 0.08 }, { shape: 'circle', x: 0.82, y: 0.18, w: 0.12, h: 0.12 }] },
    { key: 'school', label: '학교', type: 'coloring', shapes: [{ shape: 'square', x: 0.5, y: 0.58, w: 0.46, h: 0.32 }, { shape: 'triangle', x: 0.5, y: 0.34, w: 0.5, h: 0.18 }, { shape: 'square', x: 0.42, y: 0.56, w: 0.08, h: 0.08 }, { shape: 'square', x: 0.58, y: 0.56, w: 0.08, h: 0.08 }] },
    { key: 'book', label: '책', type: 'coloring', shapes: [{ shape: 'square', x: 0.4, y: 0.52, w: 0.24, h: 0.34 }, { shape: 'square', x: 0.6, y: 0.52, w: 0.24, h: 0.34 }, { shape: 'line', x: 0.5, y: 0.35, w: 0, h: 0.34 }] },
    { key: 'pencil', label: '연필', type: 'trace', shapes: [{ shape: 'line', x: 0.46, y: 0.26, w: 0.08, h: 0 }, { shape: 'triangle', x: 0.5, y: 0.30, w: 0.14, h: 0.14 }, { shape: 'square', x: 0.5, y: 0.52, w: 0.14, h: 0.30 }, { shape: 'line', x: 0.46, y: 0.37, w: 0, h: 0.30 }, { shape: 'line', x: 0.54, y: 0.37, w: 0, h: 0.30 }, { shape: 'square', x: 0.5, y: 0.69, w: 0.14, h: 0.04 }, { shape: 'square', x: 0.5, y: 0.74, w: 0.14, h: 0.06 }] },
    { key: 'cloud', label: '구름', type: 'coloring', shapes: [{ shape: 'circle', x: 0.38, y: 0.5, w: 0.2, h: 0.16 }, { shape: 'circle', x: 0.5, y: 0.44, w: 0.24, h: 0.2 }, { shape: 'circle', x: 0.64, y: 0.5, w: 0.22, h: 0.16 }, { shape: 'line', x: 0.34, y: 0.58, w: 0.34, h: 0 }] },
    { key: 'sun', label: '해님', type: 'coloring', shapes: [{ shape: 'circle', x: 0.5, y: 0.5, w: 0.24, h: 0.24 }, { shape: 'line', x: 0.5, y: 0.16, w: 0, h: 0.12 }, { shape: 'line', x: 0.5, y: 0.72, w: 0, h: 0.12 }, { shape: 'line', x: 0.16, y: 0.5, w: 0.12, h: 0 }, { shape: 'line', x: 0.72, y: 0.5, w: 0.12, h: 0 }] },
    { key: 'moon', label: '달님', type: 'coloring', shapes: [{ shape: 'wave', variant: 'crescent', x: 0.48, y: 0.45, w: 0.26, h: 0.34 }, { shape: 'circle', x: 0.39, y: 0.41, w: 0.03, h: 0.03 }, { shape: 'circle', x: 0.48, y: 0.41, w: 0.03, h: 0.03 }, { shape: 'wave', x: 0.43, y: 0.50, w: 0.08, h: 0.04 }, { shape: 'star', x: 0.72, y: 0.30, w: 0.10, h: 0.10 }, { shape: 'star', x: 0.66, y: 0.58, w: 0.08, h: 0.08 }] },
    { key: 'train', label: '기차', type: 'coloring', shapes: [{ shape: 'square', x: 0.42, y: 0.52, w: 0.32, h: 0.22 }, { shape: 'square', x: 0.68, y: 0.52, w: 0.2, h: 0.22 }, { shape: 'circle', x: 0.34, y: 0.68, w: 0.08, h: 0.08 }, { shape: 'circle', x: 0.56, y: 0.68, w: 0.08, h: 0.08 }, { shape: 'circle', x: 0.72, y: 0.68, w: 0.08, h: 0.08 }] },
    { key: 'boat', label: '배', type: 'coloring', shapes: [{ shape: 'triangle', x: 0.5, y: 0.36, w: 0.28, h: 0.28 }, { shape: 'line', x: 0.5, y: 0.28, w: 0, h: 0.36 }, { shape: 'wave', x: 0.2, y: 0.68, w: 0.6, h: 0.08 }, { shape: 'pentagon', x: 0.5, y: 0.58, w: 0.42, h: 0.18 }] },
    { key: 'dinosaur', label: '공룡', type: 'coloring', shapes: [{ shape: 'circle', x: 0.46, y: 0.52, w: 0.34, h: 0.22 }, { shape: 'circle', x: 0.68, y: 0.38, w: 0.16, h: 0.16 }, { shape: 'triangle', x: 0.38, y: 0.34, w: 0.1, h: 0.12 }, { shape: 'triangle', x: 0.5, y: 0.32, w: 0.1, h: 0.12 }, { shape: 'line', x: 0.34, y: 0.66, w: 0, h: 0.14 }, { shape: 'line', x: 0.56, y: 0.66, w: 0, h: 0.14 }] },
    { key: 'kite', label: '연', type: 'trace', shapes: [{ shape: 'diamond', x: 0.48, y: 0.38, w: 0.34, h: 0.38 }, { shape: 'line', x: 0.48, y: 0.58, w: 0, h: 0.26 }, { shape: 'wave', x: 0.48, y: 0.76, w: 0.28, h: 0.1 }] },
    { key: 'jewel', label: '보석', type: 'coloring', shapes: [{ shape: 'diamond', x: 0.5, y: 0.52, w: 0.38, h: 0.34 }, { shape: 'triangle', x: 0.5, y: 0.3, w: 0.34, h: 0.18 }, { shape: 'line', x: 0.34, y: 0.42, w: 0.32, h: 0 }] },
    { key: 'candy', label: '사탕', type: 'coloring', shapes: [{ shape: 'circle', x: 0.5, y: 0.5, w: 0.20, h: 0.20 }, { shape: 'circle', x: 0.5, y: 0.5, w: 0.10, h: 0.10 }, { shape: 'line', x: 0.40, y: 0.5, w: -0.08, h: -0.06 }, { shape: 'line', x: 0.40, y: 0.5, w: -0.08, h: 0.06 }, { shape: 'line', x: 0.32, y: 0.44, w: 0, h: 0.12 }, { shape: 'line', x: 0.60, y: 0.5, w: 0.08, h: -0.06 }, { shape: 'line', x: 0.60, y: 0.5, w: 0.08, h: 0.06 }, { shape: 'line', x: 0.68, y: 0.44, w: 0, h: 0.12 }] }
];

const drawingTemplates = Object.fromEntries(drawingTemplateLibrary.map((item) => [item.key, item.label]));
const shapeMissionTemplates = drawingShapeLibrary.map((shape) => ({
    key: `shape-${shape.key}`,
    label: shape.label,
    type: 'shape-mission',
    shapes: [{ shape: shape.key, x: 0.5, y: 0.5, w: shape.key === 'line' || shape.key === 'wave' || shape.key === 'zigzag' ? 0.62 : 0.34, h: shape.key === 'line' ? 0 : 0.28 }]
}));
const drawingMissionPool = drawingTemplateLibrary.filter((item) => item.key !== 'blank');
const drawingMissions = drawingMissionPool.map((template, index) => {
    return {
        step: index + 1,
        title: `${template.label} 도형 도안`,
        type: template.type,
        desc: '다양한 그림을 그려보고 그림을 해제해요',
        template: template.key
    };
});

const drawingColors = ['#111827', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#ffffff'];
const drawingBrushSizeMap = { 1: 4, 2: 9, 3: 16, 4: 26 };
let drawingBrushColor = drawingColors[0];
let drawingEraserMode = false;
let drawingBrushLevel = 2;
let drawingBrushSize = drawingBrushSizeMap[drawingBrushLevel];
let drawingActiveTemplate = 'blank';
let drawingActiveTargetTemplate = null;
let drawingUserTracePoints = [];
let drawingWorkspaceAiQuiz = false;
let shapeMissionIndex = 0;
let aiDrawingQuizIndex = 0;
let aiDrawingTargetShape = 'circle';

function ensureDrawingPortfolioShapeFields() {
    drawingPortfolio.missions = drawingPortfolio.missions || {};
    drawingPortfolio.free = Array.isArray(drawingPortfolio.free) ? drawingPortfolio.free : [];
    drawingPortfolio.unlockedTemplates = Array.isArray(drawingPortfolio.unlockedTemplates) ? drawingPortfolio.unlockedTemplates : [];
    drawingPortfolio.rewardedMilestones = Array.isArray(drawingPortfolio.rewardedMilestones) ? drawingPortfolio.rewardedMilestones : [];
    drawingPortfolio.shapeStats = drawingPortfolio.shapeStats || {};
    drawingPortfolio.unpaidCooldownUntil = Number(drawingPortfolio.unpaidCooldownUntil || 0);
}

function getNextDrawingMission() {
    const nextStep = Math.max(1, currentUserDrawingStep + 1);
    return drawingMissions.find((mission) => mission.step === nextStep) || null;
}

function getNextShapeMissionTemplate() {
    const stats = drawingPortfolio.shapeStats || {};
    const sorted = [...shapeMissionTemplates].sort((a, b) => (stats[a.shapes[0].shape]?.accuracy || 0) - (stats[b.shapes[0].shape]?.accuracy || 0));
    const pick = sorted[shapeMissionIndex % Math.min(sorted.length, 5)];
    shapeMissionIndex += 1;
    return pick || shapeMissionTemplates[0];
}

function getWeakShapeRank(limit = 5) {
    ensureDrawingPortfolioShapeFields();
    const stats = drawingPortfolio.shapeStats || {};
    return [...drawingShapeLibrary]
        .map((shape) => ({
            ...shape,
            accuracy: Number(stats[shape.key]?.accuracy || 0),
            attempts: Number(stats[shape.key]?.attempts || 0),
            lastAccuracy: Number(stats[shape.key]?.lastAccuracy || 0)
        }))
        .sort((a, b) => (a.accuracy - b.accuracy) || (a.attempts - b.attempts) || a.label.localeCompare(b.label, 'ko'))
        .slice(0, limit);
}

function getWeakShapeKey() {
    return getWeakShapeRank(1)[0]?.key || 'circle';
}

function getUnlockedDrawingTemplates() {
    ensureDrawingPortfolioShapeFields();
    const unlocked = new Set(['blank', 'line', ...(drawingPortfolio.unlockedTemplates || [])]);
    Object.entries(drawingPortfolio.missions || {}).forEach(([step, record]) => {
        const mission = drawingMissions.find((item) => String(item.step) === String(step));
        if (record && mission?.template) unlocked.add(mission.template);
    });
    return drawingTemplateLibrary.filter((item) => unlocked.has(item.key)).map((item) => item.key);
}

function getAiDrawingTemplate() {
    const rankedShapes = getWeakShapeRank(drawingShapeLibrary.length);
    const zeroAccuracyShapes = rankedShapes.filter((shape) => Number(shape.accuracy || 0) <= 0);
    const weakShapes = (zeroAccuracyShapes.length ? zeroAccuracyShapes : rankedShapes).slice(0, 5);
    const weakKeys = new Set(weakShapes.map((shape) => shape.key));
    const unlocked = new Set(getUnlockedDrawingTemplates());

    const drawingCandidates = drawingTemplateLibrary
        .filter((item) => item.key !== 'blank' && unlocked.has(item.key) && item.shapes?.some((shape) => weakKeys.has(shape.shape)))
        .map((item) => ({ ...item, aiTargetShape: item.shapes.find((shape) => weakKeys.has(shape.shape))?.shape || weakShapes[0]?.key || 'circle' }));
    const shapeCandidates = weakShapes.map((shape) => ({
        ...(shapeMissionTemplates.find((item) => item.key === `shape-${shape.key}`) || shapeMissionTemplates[0]),
        aiTargetShape: shape.key
    }));
    // 해금된 도안 중 약한 도형이 들어간 것이 있으면 도형 단독보다 도안을 우선 출제한다.
    // 그래야 마름모처럼 약한 도형도 '연/보석/도형 마을' 같은 해금 도안으로 연습할 수 있다.
    const pool = (drawingCandidates.length ? drawingCandidates : shapeCandidates).filter(Boolean);
    const pick = pool[Math.floor(Math.random() * pool.length)] || shapeCandidates[0] || drawingTemplateLibrary.find((item) => item.key === 'line');
    aiDrawingTargetShape = pick?.aiTargetShape || pick?.shapes?.[0]?.shape || 'circle';
    return pick;
}

function updateDrawingDashboardPreview() {
    ensureDrawingPortfolioShapeFields();
    const nextMission = getNextDrawingMission();
    const progressLabel = document.getElementById('my-drawing-progress-label');
    const nextTitle = document.getElementById('my-drawing-next-title');
    const dashboardNextLabel = document.getElementById('drawing-mission-next-label');
    const missionBadge = document.getElementById('drawing-mission-badge');
    const completedCount = document.getElementById('my-drawing-completed-count');
    const freeCount = document.getElementById('my-drawing-free-count');
    const nextStepText = nextMission ? `${nextMission.step}단계 할 차례예요` : '모든 그림 미션 완료!';
    if (progressLabel) progressLabel.innerText = nextMission ? `그림 미션 ${nextStepText}` : '그림 미션 완료';
    if (dashboardNextLabel) dashboardNextLabel.innerText = nextStepText;
    if (missionBadge) missionBadge.innerText = nextMission ? `오늘의 미션[${nextMission.step}단계]` : '오늘의 미션[완료]';
    if (nextTitle) nextTitle.innerText = nextMission ? `${nextMission.step}단계: ${nextMission.title}` : '모든 미션 완료';
    if (completedCount) completedCount.innerText = Object.keys(drawingPortfolio.missions || {}).length;
    if (freeCount) freeCount.innerText = drawingPortfolio.free?.length || 0;
}

function renderMyDrawingSection() {
    ensureDrawingPortfolioShapeFields();
    updateDrawingDashboardPreview();
    const root = document.getElementById('my-drawing-mission-list');
    if (!root) return;
    root.innerHTML = drawingMissions.map((mission) => {
        const record = drawingPortfolio.missions?.[mission.step];
        const isOpen = currentUserRole === 'teacher' || mission.step <= Math.max(1, currentUserDrawingStep + 1);
        const isDone = Boolean(record);
        const accuracy = Number(record?.accuracy || 0);
        const imageSource = safeImageSource(record?.image);
        return `
            <div class="korean-embed-card p-4 ${isDone ? 'bg-purple-50 border-purple-100' : ''}">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <div class="text-sm font-black ${isDone ? 'text-purple-600' : 'text-gray-400'}">${mission.step}단계</div>
                        <div class="text-xl font-black text-[#2c3e50]">${mission.title}</div>
                        <p class="text-sm text-gray-500 mt-1">다양한 그림을 그려보고 그림을 해제해요</p>
                        ${isDone ? `<p class="text-xs text-purple-500 font-black mt-1">정확도 ${accuracy}% · ${record.rewardedPoints || 0}포인트</p>` : ''}
                    </div>
                    <div class="text-2xl">${isDone ? '✅' : (isOpen ? '🎨' : '🔒')}</div>
                </div>
                ${imageSource ? `<img src="${escapeHtml(imageSource)}" alt="${escapeHtml(mission.title)} 결과" class="w-full h-36 object-contain bg-white rounded-2xl border mt-4" loading="lazy">` : ''}
                <button type="button" class="${isOpen ? 'btn-primary' : 'btn-outline opacity-50 cursor-not-allowed'} w-full mt-4 py-2 text-sm" ${isOpen ? `onclick="openDrawingMission(${mission.step})"` : 'disabled'}>
                    ${isDone ? '다시 그리기' : (isOpen ? '시작하기' : '잠김')}
                </button>
            </div>
        `;
    }).join('');
}

function configureDrawingWorkspace({ mode, title, desc, template = 'blank', missionStep = null, aiQuiz = false }) {
    isDrawingEvaluating = false;
    ensureDrawingPortfolioShapeFields();
    drawingWorkspaceMode = mode;
    drawingWorkspaceMissionStep = missionStep;
    drawingWorkspaceAiQuiz = Boolean(aiQuiz);
    drawingActiveTemplate = template;
    drawingActiveTargetTemplate = shapeMissionTemplates.find((item) => item.key === template) || drawingTemplateLibrary.find((item) => item.key === template) || drawingTemplateLibrary[0];
    drawingUserTracePoints = [];
    const isShapeMission = mode === 'shape-mission';
    const isInfiniteDrawing = mode === 'infinite-drawing';
    const isCompactMission = isShapeMission || aiQuiz;
    const badge = document.getElementById('drawing-workspace-badge');
    const backButton = document.getElementById('drawing-workspace-back-btn');
    const workspaceTitle = document.getElementById('drawing-workspace-title');
    const workspaceDesc = document.getElementById('drawing-workspace-desc');
    badge.innerText = aiQuiz ? '🤖 AI 그림' : (missionStep ? '그림 미션' : (isShapeMission ? '🔷 도형 미션' : title));
    badge.onclick = isCompactMission ? goDrawingDashboard : null;
    badge.setAttribute('aria-label', isCompactMission ? `${aiQuiz ? 'AI 그림' : '도형 미션'} 닫고 그리기 대시보드로 돌아가기` : '그리기 활동');
    badge.classList.toggle('cursor-pointer', isCompactMission);
    badge.classList.toggle('cursor-default', !isCompactMission);
    if (backButton) backButton.classList.toggle('hidden', isCompactMission);
    workspaceTitle.innerText = title;
    workspaceDesc.innerText = desc;
    workspaceTitle.classList.toggle('hidden', isCompactMission);
    workspaceDesc.classList.toggle('hidden', isCompactMission || !desc);
    const progress = document.getElementById('drawing-workspace-progress');
    if (progress) {
        const text = isShapeMission ? `도형 ${shapeMissionIndex}번째 · ${drawingActiveTargetTemplate?.label || ''}` : (aiQuiz ? `AI 그림 ${aiDrawingQuizIndex}번째 · ${drawingActiveTargetTemplate?.label || ''}` : (missionStep ? `그림 미션 ${missionStep} / ${drawingMissions.length}` : (isInfiniteDrawing ? `그림 미션 [연장] · ${drawingActiveTargetTemplate?.label || ''}` : '')));
        progress.innerText = text;
        progress.classList.toggle('hidden', !text);
    }
    const completionModeActive = Boolean(missionStep) || aiQuiz || mode === 'shape-mission' || isInfiniteDrawing || mode === 'sketchbook';
    document.getElementById('drawing-template-panel').classList.toggle('hidden', completionModeActive);
    document.getElementById('drawing-complete-mission-btn').classList.toggle('hidden', !completionModeActive);
    document.getElementById('drawing-friends-btn').classList.toggle('hidden', Boolean(missionStep) || aiQuiz || mode === 'shape-mission' || isInfiniteDrawing);
    document.getElementById('drawing-save-btn').classList.toggle('hidden', completionModeActive);
    updateDrawingCompleteButtonCooldown();
    showTopLevelSection('drawing-workspace-section');
    requestAnimationFrame(() => {
        initializeDrawingCanvas();
        renderDrawingTemplateButtons(mode);
        resetDrawingCanvas();
    });
}

window.openMyDrawingFromDashboard = function() {
    renderMyDrawingSection();
    showTopLevelSection('my-drawing-section');
}

let drawingInfiniteMode = false;

window.openDrawingInfiniteMode = function() {
    const pool = drawingMissionPool;
    const randomTemplate = pool[Math.floor(Math.random() * pool.length)];
    if (!randomTemplate) return;

    drawingInfiniteMode = true;
    configureDrawingWorkspace({
        mode: 'infinite-drawing',
        title: `그림 미션 [연장]`,
        desc: '무한 랜덤 도안을 그려보아요!',
        template: randomTemplate.key,
        missionStep: null
    });
}

window.openCurrentDrawingMission = function() {
    const nextMission = getNextDrawingMission();
    if (!nextMission) {
        openDrawingInfiniteMode();
        return;
    }
    drawingInfiniteMode = false;
    openDrawingMission(nextMission.step);
}

window.openTodayDrawingActivity = function() {
    const template = getNextShapeMissionTemplate();
    configureDrawingWorkspace({
        mode: 'shape-mission',
        title: '도형 미션',
        desc: '',
        template: template.key
    });
}

window.openDrawingMission = function(step) {
    const mission = drawingMissions.find((item) => item.step === step);
    if (!mission) return;
    const isOpen = currentUserRole === 'teacher' || mission.step <= Math.max(1, currentUserDrawingStep + 1);
    if (!isOpen) {
        showModal('아직 잠긴 단계예요. 앞 단계를 먼저 완료해요!');
        return;
    }
    configureDrawingWorkspace({
        mode: mission.type,
        title: mission.title,
        desc: '다양한 그림을 그려보고 그림을 해제해요',
        template: mission.template,
        missionStep: mission.step
    });
}

window.openSketchbookActivity = function() {
    const firstUnlocked = getUnlockedDrawingTemplates()[0] || 'blank';
    configureDrawingWorkspace({
        mode: 'sketchbook',
        title: '스케치북',
        desc: '자유 그리기, 따라 그리기, 색칠하기를 하나로 모았어요. 해금한 도안을 골라 그려요.',
        template: firstUnlocked
    });
}

window.openFreeDrawingActivity = function() { openSketchbookActivity(); }
window.openTraceDrawingActivity = function() { openSketchbookActivity(); }
window.openColoringActivity = function() { openSketchbookActivity(); }

window.openAiDrawingQuizActivity = function() {
    const template = getAiDrawingTemplate();
    aiDrawingQuizIndex += 1;
    configureDrawingWorkspace({
        mode: 'ai-drawing',
        title: 'AI 그림',
        desc: '',
        template: template.key,
        aiQuiz: true
    });
}

function renderDrawingTemplateButtons(mode) {
    const root = document.getElementById('drawing-template-buttons');
    const picked = document.getElementById('drawing-template-picked');
    if (!root) return;
    if (drawingWorkspaceMissionStep || drawingWorkspaceAiQuiz || mode === 'shape-mission') {
        root.innerHTML = '';
        if (picked) picked.innerText = '';
        return;
    }
    const current = drawingTemplateLibrary.find((item) => item.key === drawingActiveTemplate) || drawingTemplateLibrary[0];
    if (picked) picked.innerText = `현재 도안: ${current?.label || '자유'}`;
    root.innerHTML = '';
}

window.openSketchbookTemplatePicker = function() {
    if (drawingWorkspaceMissionStep || drawingWorkspaceAiQuiz || drawingWorkspaceMode === 'shape-mission') {
        showModal('활동 중에는 연습 모양을 바꿀 수 없어요.');
        return;
    }
    const unlocked = getUnlockedDrawingTemplates();
    const html = drawingTemplateLibrary.map((item) => {
        const isOpen = unlocked.includes(item.key);
        const cls = drawingActiveTemplate === item.key ? 'bg-purple-50 border-purple-300' : '';
        return `<button type="button" class="btn-outline px-3 py-3 text-sm ${cls} ${isOpen ? '' : 'opacity-40 cursor-not-allowed'}" ${isOpen ? `onclick="selectDrawingTemplate('${item.key}'); closeAiedueKoreanModal();"` : 'disabled'}>${item.label}${isOpen ? '' : ' 🔒'}</button>`;
    }).join('');
    showModal(`<div class="text-left relative"><button type="button" class="absolute -top-3 right-0 text-4xl font-black text-gray-400 hover:text-gray-700" onclick="closeAiedueKoreanModal()">×</button><h3 class="text-2xl font-black text-[#2c3e50] mb-4">무엇을 그릴까요?</h3><div class="drawing-template-modal-grid custom-scrollbar">${html}</div></div>`, { hideConfirm: true, hideIcon: true, plainClose: true });
}

window.selectDrawingTemplate = function(template) {
    if (drawingWorkspaceMissionStep || drawingWorkspaceAiQuiz || drawingWorkspaceMode === 'shape-mission') {
        showModal('활동 중에는 연습 모양을 바꿀 수 없어요.');
        return;
    }
    const unlocked = getUnlockedDrawingTemplates();
    if (!unlocked.includes(template)) {
        showModal('아직 해금되지 않은 도안이에요. 그림 미션 단계를 완료하면 열려요!');
        return;
    }
    drawingActiveTemplate = template;
    drawingActiveTargetTemplate = drawingTemplateLibrary.find((item) => item.key === template) || drawingTemplateLibrary[0];
    drawingWorkspaceMode = drawingActiveTargetTemplate?.type || 'sketchbook';
    renderDrawingTemplateButtons(drawingWorkspaceMode);
    resetDrawingCanvas();
}

function initializeDrawingCanvas() {
    const canvas = document.getElementById('drawing-canvas');
    if (!canvas || drawingCanvasInitialized) return;
    const ctx = canvas.getContext('2d');
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    const point = (ev) => {
        const rect = canvas.getBoundingClientRect();
        const source = ev.touches?.length ? ev.touches[0] : ev;
        return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };
    const rememberPoint = (p) => {
        drawingUserTracePoints.push(p);
        if (drawingUserTracePoints.length > 12000) drawingUserTracePoints.shift();
    };
    const start = (ev) => { isDrawing = true; const p = point(ev); lastX = p.x; lastY = p.y; rememberPoint(p); };
    const move = (ev) => {
        if (!isDrawing) return;
        ev.preventDefault();
        const p = point(ev);
        ctx.beginPath();
        ctx.save();
        ctx.globalCompositeOperation = drawingEraserMode ? 'destination-out' : 'source-over';
        ctx.strokeStyle = drawingEraserMode ? 'rgba(0,0,0,1)' : drawingBrushColor;
        ctx.lineWidth = drawingEraserMode ? Math.max(14, drawingBrushSize * 1.15) : drawingBrushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
        if (drawingEraserMode) {
            const rect = canvas.getBoundingClientRect();
            drawDrawingTemplate(ctx, rect.width, rect.height);
        } else rememberPoint(p);
        lastX = p.x;
        lastY = p.y;
    };
    const stop = () => { isDrawing = false; };
    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', stop);
    canvas.addEventListener('mouseout', stop);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', stop);
    renderDrawingBrushSizeButtons();
    const palette = document.getElementById('drawing-color-palette');
    palette.innerHTML = drawingColors.map((color) => `<button type="button" class="drawing-color-swatch" style="background:${color}" onclick="selectDrawingColor('${color}')" title="${color}"></button>`).join('');
    drawingCanvasInitialized = true;
    window.addEventListener('resize', () => {
        if (!document.getElementById('drawing-workspace-section').classList.contains('hidden')) resetDrawingCanvas();
    });
}

function renderDrawingBrushSizeButtons() {
    document.querySelectorAll('#drawing-brush-size-buttons button').forEach((btn) => {
        const level = Number(btn.textContent.trim());
        btn.classList.toggle('active', level === drawingBrushLevel);
        btn.classList.toggle('bg-purple-50', level === drawingBrushLevel);
    });
    const label = document.getElementById('drawing-brush-size-label');
    if (label) label.innerText = `${drawingBrushLevel}단계`;
}

window.selectDrawingBrushSize = function(level) {
    drawingBrushLevel = Math.min(4, Math.max(1, Number(level) || 2));
    drawingBrushSize = drawingBrushSizeMap[drawingBrushLevel];
    renderDrawingBrushSizeButtons();
}

window.selectDrawingColor = function(color) {
    drawingEraserMode = false;
    drawingBrushColor = color;
    document.querySelectorAll('.drawing-color-swatch').forEach((btn) => {
        btn.classList.toggle('active', btn.style.backgroundColor === color || btn.getAttribute('style')?.includes(color));
    });
    const eraserBtn = document.getElementById('drawing-eraser-btn');
    if (eraserBtn) {
        eraserBtn.classList.toggle('bg-purple-50', drawingEraserMode);
        eraserBtn.classList.toggle('active', drawingEraserMode);
    }
}

window.toggleDrawingEraser = function() {
    drawingEraserMode = !drawingEraserMode;
    renderDrawingBrushSizeButtons();
    const eraserBtn = document.getElementById('drawing-eraser-btn');
    if (eraserBtn) {
        eraserBtn.classList.toggle('bg-purple-50', drawingEraserMode);
        eraserBtn.classList.toggle('active', drawingEraserMode);
    }
}

function prepareDrawingCanvas() {
    const canvas = document.getElementById('drawing-canvas');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, rect.width, rect.height);
    return { canvas, ctx, width: rect.width, height: rect.height };
}

function sampleLine(x1, y1, x2, y2, count = 28) {
    return Array.from({ length: count }, (_, i) => {
        const t = count === 1 ? 0 : i / (count - 1);
        return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t };
    });
}

function getShapePoints(item, width, height) {
    const cx = item.x * width;
    const cy = item.y * height;
    const w = Math.max(30, Math.abs(item.w || 0.28) * width);
    const h = Math.max(24, Math.abs(item.h || 0.28) * height);
    const left = cx - w / 2, right = cx + w / 2, top = cy - h / 2, bottom = cy + h / 2;
    const points = [];
    const pushPolygon = (vertices) => vertices.forEach((p, i) => points.push(...sampleLine(p.x, p.y, vertices[(i + 1) % vertices.length].x, vertices[(i + 1) % vertices.length].y, 18)));
    if (item.shape === 'line') return sampleLine(item.x * width, item.y * height, (item.x + (item.w || 0)) * width, (item.y + (item.h || 0)) * height, 38);
    if (item.shape === 'wave') {
        if (item.variant === 'arc') {
            for (let i = 0; i < 70; i++) {
                const t = i / 69;
                const a = Math.PI * (1 - t);
                points.push({ x: cx + Math.cos(a) * w / 2, y: cy - Math.sin(a) * h / 2 });
            }
            return points;
        }
        if (item.variant === 'crescent') {
            const outer = [];
            const inner = [];
            for (let i = 0; i < 48; i++) {
                const t = i / 47;
                const a = -Math.PI / 2 + Math.PI * t;
                outer.push({ x: cx + Math.cos(a) * w / 2, y: cy + Math.sin(a) * h / 2 });
                inner.push({ x: cx + w * 0.22 + Math.cos(a) * w * 0.34, y: cy + Math.sin(a) * h * 0.40 });
            }
            return [...outer, ...inner.reverse()];
        }
        for (let i = 0; i < 60; i++) {
            const t = i / 59;
            points.push({ x: left + w * t, y: cy + Math.sin(t * Math.PI * 4) * h * 0.45 });
        }
        return points;
    }
    if (item.shape === 'zigzag') {
        const vertices = Array.from({ length: 7 }, (_, i) => ({ x: left + (w / 6) * i, y: cy + (i % 2 ? h * 0.45 : -h * 0.45) }));
        vertices.forEach((p, i) => { if (i < vertices.length - 1) points.push(...sampleLine(p.x, p.y, vertices[i + 1].x, vertices[i + 1].y, 12)); });
        return points;
    }
    if (item.shape === 'circle') {
        for (let i = 0; i < 72; i++) {
            const a = Math.PI * 2 * i / 72;
            points.push({ x: cx + Math.cos(a) * w / 2, y: cy + Math.sin(a) * h / 2 });
        }
        return points;
    }
    if (item.shape === 'square') pushPolygon([{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]);
    else if (item.shape === 'triangle') pushPolygon([{ x: cx, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]);
    else if (item.shape === 'diamond') pushPolygon([{ x: cx, y: top }, { x: right, y: cy }, { x: cx, y: bottom }, { x: left, y: cy }]);
    else if (item.shape === 'pentagon') {
        const v = Array.from({ length: 5 }, (_, i) => { const a = -Math.PI / 2 + Math.PI * 2 * i / 5; return { x: cx + Math.cos(a) * w / 2, y: cy + Math.sin(a) * h / 2 }; });
        pushPolygon(v);
    } else if (item.shape === 'star') {
        const v = Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + Math.PI * 2 * i / 10; const r = (i % 2 ? 0.23 : 0.5); return { x: cx + Math.cos(a) * w * r, y: cy + Math.sin(a) * h * r }; });
        pushPolygon(v);
    } else if (item.shape === 'heart') {
        for (let i = 0; i < 80; i++) {
            const t = Math.PI * 2 * i / 80;
            const x = 16 * Math.pow(Math.sin(t), 3);
            const y = -(13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t));
            points.push({ x: cx + x * w / 34, y: cy + y * h / 30 });
        }
    }
    return points;
}

function strokeShapePath(ctx, item, width, height) {
    const pts = getShapePoints(item, width, height);
    if (!pts.length) return;
    ctx.beginPath();
    pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    if (!['line', 'wave', 'zigzag'].includes(item.shape)) ctx.closePath();
    ctx.stroke();
}

function drawDrawingTemplate(ctx, width, height) {
    const template = drawingActiveTargetTemplate || drawingTemplateLibrary.find((item) => item.key === drawingActiveTemplate) || drawingTemplateLibrary[0];
    if (!template?.shapes?.length) return;
    ctx.save();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([14, 12]);
    template.shapes.forEach((shape) => {
        ctx.strokeStyle = drawingShapeMap[shape.shape]?.color || '#94a3b8';
        strokeShapePath(ctx, shape, width, height);
    });
    ctx.setLineDash([]);
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(template.label, width * 0.5, 34);
    ctx.restore();
}

function resetDrawingCanvas() {
    const { ctx, width, height } = prepareDrawingCanvas();
    drawingUserTracePoints = [];
    drawDrawingTemplate(ctx, width, height);
    updateDrawingCompleteButtonCooldown();
}

window.clearDrawingCanvas = function() { resetDrawingCanvas(); }

function evaluateDrawingAccuracy() {
    const canvas = document.getElementById('drawing-canvas');
    const rect = canvas.getBoundingClientRect();
    const template = drawingActiveTargetTemplate || drawingTemplateLibrary.find((item) => item.key === drawingActiveTemplate) || drawingTemplateLibrary[0];
    // 도형 하나를 조금 건드린 것만으로 전체 도안이 통과되지 않도록
    // 브러시가 커져도 판정 반경은 제한하고, 도형 인스턴스별 정확도를 따로 계산한다.
    const threshold = Math.min(22, Math.max(10, drawingBrushSize * 0.9));
    const byShape = {};
    const instances = [];
    let total = 0;
    let hit = 0;
    let accuracySum = 0;
    let instanceCount = 0;
    (template.shapes || []).forEach((shape, index) => {
        const pts = getShapePoints(shape, rect.width, rect.height);
        let shapeHit = 0;
        pts.forEach((target) => {
            const matched = drawingUserTracePoints.some((p) => Math.hypot(p.x - target.x, p.y - target.y) <= threshold);
            if (matched) shapeHit += 1;
        });
        const instanceAccuracy = pts.length ? Math.round((shapeHit / pts.length) * 100) : 0;
        total += pts.length;
        hit += shapeHit;
        accuracySum += instanceAccuracy;
        instanceCount += 1;
        const key = shape.shape;
        byShape[key] = byShape[key] || { hit: 0, total: 0, accuracySum: 0, instanceCount: 0, instances: [] };
        byShape[key].hit += shapeHit;
        byShape[key].total += pts.length;
        byShape[key].accuracySum += instanceAccuracy;
        byShape[key].instanceCount += 1;
        byShape[key].instances.push({ index, hit: shapeHit, total: pts.length, accuracy: instanceAccuracy });
        instances.push({ shape: key, index, hit: shapeHit, total: pts.length, accuracy: instanceAccuracy });
    });
    const accuracy = instanceCount ? Math.round(accuracySum / instanceCount) : 0;
    return { accuracy, hit, total, byShape, instances };
}

function applyShapeAccuracyStats(result) {
    ensureDrawingPortfolioShapeFields();
    Object.entries(result.byShape || {}).forEach(([shapeKey, stat]) => {
        const prev = drawingPortfolio.shapeStats[shapeKey] || { attempts: 0, bestAccuracy: 0, accuracySum: 0, accuracy: 0, pointsHit: 0, pointsTotal: 0, instanceCount: 0 };
        // 같은 도형이 여러 개 있으면 해당 도안 안의 도형별 평균을 한 번의 시도값으로 반영한다.
        const acc = stat.instanceCount ? Math.round(Number(stat.accuracySum || 0) / stat.instanceCount) : (stat.total ? Math.round((stat.hit / stat.total) * 100) : 0);
        const attempts = Number(prev.attempts || 0) + 1;
        const accuracySum = Number(prev.accuracySum || 0) + acc;
        drawingPortfolio.shapeStats[shapeKey] = {
            attempts,
            bestAccuracy: Math.max(Number(prev.bestAccuracy || 0), acc),
            accuracySum,
            accuracy: Math.round(accuracySum / attempts),
            pointsHit: Number(prev.pointsHit || 0) + Number(stat.hit || 0),
            pointsTotal: Number(prev.pointsTotal || 0) + Number(stat.total || 0),
            instanceCount: Number(prev.instanceCount || 0) + Number(stat.instanceCount || 0),
            lastAccuracy: acc,
            updatedAt: new Date().toISOString()
        };
    });
}

window.openMyShapeStats = function() {
    ensureDrawingPortfolioShapeFields();
    const rows = drawingShapeLibrary.map((shape) => {
        const stat = drawingPortfolio.shapeStats?.[shape.key] || {};
        const acc = Number(stat.accuracy || 0);
        return `<div class="korean-embed-card p-4"><div class="flex justify-between items-center"><div class="font-black text-[#2c3e50]">${shape.label}</div><div class="text-purple-600 font-black">${acc}%</div></div><div class="text-xs text-gray-500 mt-1">시도 ${stat.attempts || 0}회 · 최고 ${stat.bestAccuracy || 0}% · 최근 ${stat.lastAccuracy || 0}%</div><div class="w-full h-3 bg-gray-100 rounded-full mt-3 overflow-hidden"><div class="h-full bg-purple-400" style="width:${Math.min(100, acc)}%"></div></div></div>`;
    }).join('');
    showModal(`<div class="text-left"><h3 class="text-2xl font-black text-[#2c3e50] mb-4">나의 도형 정확도</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">${rows}</div></div>`);
}

let isDrawingEvaluating = false;

function setDrawingEvaluationState(evaluating) {
    isDrawingEvaluating = evaluating;
    const btn = document.getElementById('drawing-complete-mission-btn');
    if (!btn) return;
    if (evaluating) {
        btn.disabled = true;
        btn.classList.add('opacity-50');
        btn.innerHTML = `<span class="button-loading-spinner"></span>채점중입니다...`;
    } else {
        btn.disabled = false;
        btn.classList.remove('opacity-50');
        btn.innerHTML = '완료하기';
        updateDrawingCompleteButtonCooldown();
    }
}

function updateDrawingCompleteButtonCooldown() {
    const btn = document.getElementById('drawing-complete-mission-btn');
    if (!btn) return;
    if (isDrawingEvaluating) {
        btn.disabled = true;
        btn.classList.add('opacity-50');
        btn.innerHTML = `<span class="button-loading-spinner"></span>채점중입니다...`;
        return;
    }
    const waitMs = Math.max(0, Number(drawingPortfolio.unpaidCooldownUntil || 0) - Date.now());
    btn.disabled = waitMs > 0;
    btn.classList.toggle('opacity-50', waitMs > 0);
    btn.innerText = waitMs > 0 ? `완료하기 (${Math.ceil(waitMs / 1000)}초)` : '완료하기';
    if (waitMs > 0) setTimeout(updateDrawingCompleteButtonCooldown, 1000);
}

async function persistDrawingData(extra = {}) {
    if (!currentUserId) return;
    const walletExtra = {
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel
    };
    await setDoc(doc(db, 'users', currentUserId), { currentDrawingStep: currentUserDrawingStep, drawingPortfolio, ...walletExtra, ...extra, updatedAt: serverTimestamp() }, { merge: true });
}

function captureDrawingImage() {
    const canvas = document.getElementById('drawing-canvas');
    return canvas.toDataURL('image/png');
}

function buildDrawingRecord({ image, kind, missionStep = null, savedAt, accuracy = null, rewardedPoints = 0, shapeAccuracy = null }) {
    const templateInfo = drawingActiveTargetTemplate || drawingTemplateLibrary.find((item) => item.key === drawingActiveTemplate) || drawingTemplateLibrary[0];
    const profile = buildAiedueSchoolProfileSnapshot({ ...currentUserProfileSnapshot, name: currentUserName, icon: currentUserIcon, role: currentUserRole });
    return {
        image,
        kind,
        mode: drawingWorkspaceMode,
        missionStep,
        template: drawingActiveTemplate,
        templateLabel: templateInfo.label,
        accuracy,
        rewardedPoints,
        shapeAccuracy,
        savedAt,
        ...profile,
        userId: currentUserId || profile.userId || 'anonymous',
        userName: currentUserName || profile.userName || '이름 없음',
        userIcon: currentUserIcon || profile.userIcon || '🐻'
    };
}

function addDrawingRecordToPortfolioGallery(record) {
    if (!record?.image) return;
    ensureDrawingPortfolioShapeFields();
    const keyFor = (item) => [item?.kind, item?.missionStep ?? '', item?.template ?? '', item?.savedAt ?? ''].join('|');
    const recordKey = keyFor(record);
    const currentFree = Array.isArray(drawingPortfolio.free) ? drawingPortfolio.free : [];
    drawingPortfolio.free = [record, ...currentFree.filter((item) => keyFor(item) !== recordKey)].slice(0, 60);
}

// Firestore 저장용 대형 이미지를 최대 640px 크기의 jpeg 썸네일로 압축하는 헬퍼 함수
function compressDrawingImage(dataUrl, maxDim = 640) {
    return new Promise((resolve) => {
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            resolve(dataUrl);
            return;
        }
        const img = new Image();
        img.onload = () => {
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                } else {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
            }

            try {
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(dataUrl);
                    return;
                }
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                let compressedUrl = canvas.toDataURL('image/jpeg', 0.78);
                // Firestore 문서 1MiB 제한을 피하기 위한 2차 축소 fallback.
                if (compressedUrl.length > 850000 && maxDim > 360) {
                    compressDrawingImage(dataUrl, 360).then(resolve);
                    return;
                }
                resolve(compressedUrl);
            } catch (err) {
                console.warn('Image compress canvas draw error', err);
                resolve(dataUrl);
            }
        };
        img.onerror = () => {
            resolve(dataUrl);
        };
        img.src = dataUrl;
    });
}

// savedAt / createdAt 정렬을 지원하기 위한 타임스탬프 파서 및 비교 헬퍼
function getDrawingTimestampValue(item) {
    if (!item) return 0;

    // 1. savedAt 우선 (ISO String)
    if (item.savedAt) {
        const t = Date.parse(item.savedAt);
        if (!isNaN(t)) return t;
    }

    // 2. createdAt (Firestore Timestamp 또는 String)
    if (item.createdAt) {
        if (typeof item.createdAt.toDate === 'function') {
            return item.createdAt.toDate().getTime();
        }
        if (item.createdAt.seconds !== undefined) {
            return item.createdAt.seconds * 1000 + Math.floor((item.createdAt.nanoseconds || 0) / 1000000);
        }
        const t = Date.parse(item.createdAt);
        if (!isNaN(t)) return t;
    }

    return 0;
}

function normalizeDrawingPortfolioForPersistence(value = {}) {
    return {
        missions: value?.missions && typeof value.missions === 'object' ? { ...value.missions } : {},
        free: Array.isArray(value?.free) ? [...value.free] : [],
        unlockedTemplates: Array.isArray(value?.unlockedTemplates) ? [...value.unlockedTemplates] : [],
        rewardedMilestones: Array.isArray(value?.rewardedMilestones) ? [...value.rewardedMilestones] : [],
        shapeStats: value?.shapeStats && typeof value.shapeStats === 'object' ? { ...value.shapeStats } : {},
        unpaidCooldownUntil: Number(value?.unpaidCooldownUntil || 0)
    };
}

function fitDrawingPortfolioToFirestore(value, maxSerializedChars = 320000) {
    const next = normalizeDrawingPortfolioForPersistence(value);
    const serializedSize = () => JSON.stringify(next).length;
    if (serializedSize() <= maxSerializedChars) return next;

    const freeIds = new Set(next.free.map((item) => item?.drawingId).filter(Boolean));
    Object.keys(next.missions)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((step) => {
            const mission = next.missions[step];
            if (serializedSize() <= maxSerializedChars || !mission?.image || !freeIds.has(mission.drawingId)) return;
            next.missions[step] = { ...mission };
            delete next.missions[step].image;
        });

    while (serializedSize() > maxSerializedChars && next.free.length > 1) {
        next.free.pop();
    }

    Object.keys(next.missions)
        .sort((a, b) => Number(a) - Number(b))
        .forEach((step) => {
            const mission = next.missions[step];
            if (serializedSize() <= maxSerializedChars || !mission?.image) return;
            next.missions[step] = { ...mission };
            delete next.missions[step].image;
        });
    return next;
}

function mergeDrawingShapeStats(currentStats, result, updatedAt) {
    const nextStats = { ...(currentStats || {}) };
    Object.entries(result?.byShape || {}).forEach(([shapeKey, stat]) => {
        const previous = nextStats[shapeKey] || {};
        const accuracy = stat.instanceCount
            ? Math.round(Number(stat.accuracySum || 0) / Number(stat.instanceCount || 1))
            : (stat.total ? Math.round((Number(stat.hit || 0) / Number(stat.total)) * 100) : 0);
        const attempts = Number(previous.attempts || 0) + 1;
        const accuracySum = Number(previous.accuracySum || 0) + accuracy;
        nextStats[shapeKey] = {
            attempts,
            bestAccuracy: Math.max(Number(previous.bestAccuracy || 0), accuracy),
            accuracySum,
            accuracy: Math.round(accuracySum / attempts),
            pointsHit: Number(previous.pointsHit || 0) + Number(stat.hit || 0),
            pointsTotal: Number(previous.pointsTotal || 0) + Number(stat.total || 0),
            instanceCount: Number(previous.instanceCount || 0) + Number(stat.instanceCount || 0),
            lastAccuracy: accuracy,
            updatedAt
        };
    });
    return nextStats;
}

function applyCommittedDrawingState(committed) {
    drawingPortfolio = committed.drawingPortfolio;
    currentUserDrawingStep = committed.currentDrawingStep;
    currentUserCoins = committed.coins;
    currentUserBalance = committed.balance;
    currentUserAeduTokens = committed.aeduTokens;
    currentUserWarningTokens = committed.warningTokens;
    currentUserAeduExperience = committed.aeduExperience;
    currentUserAeduLevel = committed.aeduLevel;
    currentUserProfileSnapshot = {
        ...currentUserProfileSnapshot,
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel,
        koreanActivityLog: committed.koreanActivityLog || currentUserProfileSnapshot?.koreanActivityLog || []
    };
}

function buildSharedDrawingGalleryRecord(portfolioRecord, compressedImage, drawingId, existingCreatedAt = null, serverClassId = '') {
    const sharedRecord = {
        drawingId,
        image: compressedImage,
        kind: String(portfolioRecord.kind || 'sketchbook'),
        mode: String(portfolioRecord.mode || 'free'),
        template: String(portfolioRecord.template || 'blank'),
        templateLabel: String(portfolioRecord.templateLabel || '스케치북'),
        savedAt: String(portfolioRecord.savedAt || new Date().toISOString()),
        userId: String(currentUserId),
        userName: String(portfolioRecord.userName || currentUserName || '이름 없음'),
        userIcon: String(portfolioRecord.userIcon || currentUserIcon || '🐻'),
        ownerRef: `users/${currentUserId}`,
        createdAt: existingCreatedAt || serverTimestamp(),
        updatedAt: serverTimestamp()
    };
    const classId = String(serverClassId || '').trim();
    if (classId) sharedRecord.classId = classId;
    if (portfolioRecord.missionStep !== undefined && portfolioRecord.missionStep !== null) {
        sharedRecord.missionStep = Number(portfolioRecord.missionStep);
    }
    if (Number.isFinite(Number(portfolioRecord.accuracy))) sharedRecord.accuracy = Number(portfolioRecord.accuracy);
    if (Number.isFinite(Number(portfolioRecord.rewardedPoints))) sharedRecord.rewardedPoints = Number(portfolioRecord.rewardedPoints);
    return sharedRecord;
}

async function persistDrawingRecord(record, operation = {}) {
    if (!currentUserId) throw new Error('로그인 정보를 확인할 수 없습니다.');
    if (!record?.image) throw new Error('저장할 그림이 없습니다.');

    const collectionRef = collection(db, FIREBASE_DRAWING_COLLECTION);
    const recordRef = record.drawingId ? doc(collectionRef, record.drawingId) : doc(collectionRef);
    const userRef = doc(db, 'users', currentUserId);
    const previousPortfolio = JSON.parse(JSON.stringify(drawingPortfolio));
    record.drawingId = recordRef.id;
    addDrawingRecordToPortfolioGallery(record);

    try {
        const [compressedImage, portfolioThumbnail] = await Promise.all([
            compressDrawingImage(record.image, 640),
            compressDrawingImage(record.image, 120)
        ]);
        const committed = await runTransaction(db, async (transaction) => {
            const recordSnap = await transaction.get(recordRef);
            const userSnap = await transaction.get(userRef);
            const userData = userSnap.exists() ? userSnap.data() : {};
            const serverClassId = String(userData.teacherId || userData.classId || '').trim();
            const serverPortfolio = normalizeDrawingPortfolioForPersistence(userData.drawingPortfolio);
            const existingRecord = serverPortfolio.free.find((item) => item?.drawingId === recordRef.id);
            const isNewRecord = !existingRecord && !recordSnap.exists();
            const missionStepKey = record.kind === 'mission' && record.missionStep != null ? String(record.missionStep) : '';
            const existingMission = missionStepKey ? Boolean(serverPortfolio.missions[missionStepKey]) : false;
            const nextMissions = { ...serverPortfolio.missions };
            const nextRewardedMilestones = [...serverPortfolio.rewardedMilestones];

            if (missionStepKey) nextMissions[missionStepKey] = { ...record, image: portfolioThumbnail };

            let newDrawingReward = 0;
            if (isNewRecord) {
                newDrawingReward = missionStepKey
                    ? (!existingMission ? Math.max(0, Number(operation.missionBaseReward || 0)) : 0)
                    : Math.max(0, Number(operation.pointReward || 0));
                if (missionStepKey && !existingMission) {
                    const completedMissionCount = Object.values(nextMissions).filter(Boolean).length;
                    const unlockedMilestoneCount = Math.floor(completedMissionCount / 5);
                    for (let milestone = 1; milestone <= unlockedMilestoneCount; milestone += 1) {
                        const milestoneId = `drawing-5x-${milestone}`;
                        if (!nextRewardedMilestones.includes(milestoneId)) {
                            nextRewardedMilestones.push(milestoneId);
                            newDrawingReward += 10;
                        }
                    }
                }
            }
            const awardedDrawingPoints = isNewRecord
                ? newDrawingReward
                : Math.max(0, Number(existingRecord?.rewardedPoints ?? recordSnap.data()?.rewardedPoints ?? 0));
            const portfolioRecord = { ...record, image: portfolioThumbnail, rewardedPoints: awardedDrawingPoints };
            if (missionStepKey) nextMissions[missionStepKey] = portfolioRecord;

            const nextPortfolio = fitDrawingPortfolioToFirestore({
                missions: nextMissions,
                free: [portfolioRecord, ...serverPortfolio.free.filter((item) => item?.drawingId !== recordRef.id)].slice(0, 60),
                unlockedTemplates: Array.from(new Set([
                    ...serverPortfolio.unlockedTemplates,
                    operation.unlockedTemplate,
                    missionStepKey ? record.template : null
                ].filter(Boolean))),
                rewardedMilestones: nextRewardedMilestones,
                shapeStats: isNewRecord
                    ? mergeDrawingShapeStats(serverPortfolio.shapeStats, operation.shapeResult, new Date().toISOString())
                    : serverPortfolio.shapeStats,
                unpaidCooldownUntil: isNewRecord && Object.prototype.hasOwnProperty.call(operation, 'unpaidCooldownUntil')
                    ? Number(operation.unpaidCooldownUntil || 0)
                    : serverPortfolio.unpaidCooldownUntil
            });

            let nextExperience = asNumber(userData.aeduExperience, currentUserAeduExperience);
            const beforeLevel = Math.max(1, asNumber(userData.aeduLevel, currentUserAeduLevel || 1));
            let nextLevel = beforeLevel;
            let nextWarningTokens = Math.max(0, Math.floor(asNumber(userData.warningTokens, currentUserWarningTokens)));
            let levelUpCount = 0;
            const shouldGrantExperience = isNewRecord && (!missionStepKey || !existingMission);
            if (shouldGrantExperience) {
                nextExperience += Math.max(0, Number(operation.experienceReward || 0));
                while (nextExperience >= 100) {
                    nextExperience -= 100;
                    levelUpCount += 1;
                }
            }
            nextExperience = Math.min(99.999, Math.max(0, parseFloat(nextExperience.toFixed(3))));
            nextLevel += levelUpCount;
            const removedWarningTokens = Math.min(nextWarningTokens, levelUpCount);
            nextWarningTokens -= removedWarningTokens;
            const levelUpPoints = levelUpCount * AIEDUE_LEVEL_UP_POINT_REWARD;
            const totalPointReward = newDrawingReward + levelUpPoints;
            const serverCoins = asNumber(userData.coins, currentUserCoins);
            const serverBalance = asNumber(userData.balance, serverCoins);
            const serverAeduTokens = asNumber(userData.aeduTokens, serverBalance);
            const grantedExperience = shouldGrantExperience ? Math.max(0, Number(operation.experienceReward || 0)) : 0;
            const baseExperience = Math.max(0, Number(operation.baseExperience ?? grantedExperience));
            const experienceMultiplier = Math.max(0, Number(operation.experienceMultiplier ?? 1));
            const activityMessage = `${String(userData.name || currentUserName || '학생').slice(0, 40)}이 ${String(operation.experienceSource || '그리기 활동').slice(0, 80)}을 통해 기본 경험치 ${baseExperience.toFixed(1)}%의 ${Math.round(experienceMultiplier * 100)}%인 ${grantedExperience.toFixed(1)}%를 받았다.${levelUpCount > 0 ? ` 레벨 ${beforeLevel}에서 ${nextLevel}으로 레벨업하며 돈 ${levelUpPoints.toLocaleString()}점이 지급되고 주의토큰 ${removedWarningTokens}개가 감소되었다.` : ''}`;
            const koreanActivityLog = grantedExperience > 0
                ? [{ id: `drawing_${recordRef.id}`, type: 'experience', source: operation.experienceSource || '그리기 활동', baseExperience, multiplier: experienceMultiplier, grantedExperience, levelBefore: beforeLevel, levelAfter: nextLevel, levelUpPoints, warningTokensReduced: removedWarningTokens, createdAtMs: Date.now(), message: activityMessage }, ...(Array.isArray(userData.koreanActivityLog) ? userData.koreanActivityLog : [])].slice(0, 200)
                : (Array.isArray(userData.koreanActivityLog) ? userData.koreanActivityLog : []);
            const committedState = {
                drawingPortfolio: nextPortfolio,
                currentDrawingStep: Math.max(
                    Number.isFinite(Number(userData.currentDrawingStep)) ? Number(userData.currentDrawingStep) : -1,
                    Number.isFinite(Number(operation.currentDrawingStep)) ? Number(operation.currentDrawingStep) : -1
                ),
                coins: serverCoins + totalPointReward,
                balance: serverBalance + totalPointReward,
                aeduTokens: serverAeduTokens + totalPointReward,
                warningTokens: nextWarningTokens,
                aeduExperience: nextExperience,
                aeduLevel: nextLevel,
                koreanActivityLog,
                awardedDrawingPoints,
                levelUpCount,
                levelUpPoints,
                removedWarningTokens
            };
            const firebaseRecord = buildSharedDrawingGalleryRecord(
                portfolioRecord,
                compressedImage,
                recordRef.id,
                recordSnap.exists() ? recordSnap.data()?.createdAt : null,
                serverClassId
            );
            const userRecord = {
                currentDrawingStep: committedState.currentDrawingStep,
                drawingPortfolio: nextPortfolio,
                coins: committedState.coins,
                balance: committedState.balance,
                aeduTokens: committedState.aeduTokens,
                warningTokens: committedState.warningTokens,
                aeduExperience: committedState.aeduExperience,
                aeduLevel: committedState.aeduLevel,
                koreanActivityLog: committedState.koreanActivityLog,
                updatedAt: serverTimestamp()
            };
            transaction.set(recordRef, firebaseRecord);
            transaction.set(userRef, userRecord, { merge: true });
            return committedState;
        });
        record.rewardedPoints = committed.awardedDrawingPoints;
        applyCommittedDrawingState(committed);
        return committed;
    } catch (error) {
        drawingPortfolio = previousPortfolio;
        console.warn('Atomic drawing save failed', error);
        throw new Error('내 그림과 친구들 그림을 함께 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
}

function normalizeFirebaseDrawingDoc(docSnap) {
    const data = docSnap.data ? docSnap.data() : docSnap;
    return { drawingId: docSnap.id || data?.drawingId, ...data };
}

function addDrawingGalleryItem(merged, item, fallbackKeyPrefix = 'drawing') {
    if (!item?.image) return;
    const key = item.drawingId || item.id || `${fallbackKeyPrefix}-${item.userId || 'unknown'}-${item.savedAt || item.createdAt || Math.random()}`;
    merged.set(key, item);
}

function extractDrawingPortfolioGalleryItems(userId, userData = {}) {
    const portfolio = userData.drawingPortfolio || {};
    const snapshot = buildAiedueSchoolProfileSnapshot({ ...userData, uid: userId });
    const base = {
        userId,
        userCode: snapshot.userCode,
        userName: snapshot.userName || userData.name || '친구',
        userIcon: snapshot.userIcon || userData.icon || '👤',
        teacherId: snapshot.teacherId,
        classId: snapshot.classId,
        classCode: snapshot.classCode,
        className: snapshot.className
    };
    const items = [];
    Object.entries(portfolio.missions || {}).forEach(([step, record]) => {
        if (record?.image) items.push({ ...record, ...base, kind: record.kind || 'mission', missionStep: record.missionStep || Number(step) });
    });
    (portfolio.free || []).forEach((record) => {
        if (record?.image) items.push({ ...record, ...base, kind: record.kind || 'sketchbook' });
    });
    return items;
}

async function loadFriendsDrawingsFromUserPortfolios() {
    if (!currentUserId) return [];
    const profile = buildAiedueSchoolProfileSnapshot(currentUserProfileSnapshot);
    const userPlans = [];
    if (profile.classId) userPlans.push(query(collection(db, 'users'), where('classId', '==', profile.classId), queryLimit(40)));
    if (profile.classCode) userPlans.push(query(collection(db, 'users'), where('classCode', '==', profile.classCode), queryLimit(40)));
    if (profile.teacherId) userPlans.push(query(collection(db, 'users'), where('teacherId', '==', profile.teacherId), queryLimit(40)));
    const merged = new Map();
    for (const q of userPlans) {
        try {
            const snap = await getDocs(q);
            snap.docs.forEach((docSnap) => {
                extractDrawingPortfolioGalleryItems(docSnap.id, docSnap.data() || {}).forEach((item) => addDrawingGalleryItem(merged, item, 'portfolio'));
            });
        } catch (error) {
            console.warn('Drawing portfolio gallery fallback query failed', error);
        }
    }
    return Array.from(merged.values())
        .sort((a, b) => getDrawingTimestampValue(b) - getDrawingTimestampValue(a))
        .slice(0, 60);
}

async function loadFriendsDrawingsFromFirebase() {
    if (!currentUserId) return [];
    const collectionRef = collection(db, FIREBASE_DRAWING_COLLECTION);
    // 친구들 그림은 공개용 필드만 담은 별도 컬렉션이므로 로그인 사용자의 작품을 모두 조회한다.
    // 규칙 배포가 아직 반영되지 않은 동안에도 본인 작품은 보이도록 소유자 쿼리를 fallback으로 둔다.
    const queryPlans = [
        query(collectionRef, queryLimit(80)),
        query(collectionRef, where('userId', '==', currentUserId), queryLimit(80))
    ];
    const merged = new Map();
    for (const q of queryPlans) {
        try {
            const snap = await getDocs(q);
            if (snap && snap.docs) {
                snap.docs.map(normalizeFirebaseDrawingDoc).forEach((item) => addDrawingGalleryItem(merged, item, 'shared'));
            }
            if (merged.size >= 60) break;
        } catch (error) {
            console.warn('Firebase drawing gallery query failed', error);
        }
    }
    const portfolioFallbacks = await loadFriendsDrawingsFromUserPortfolios();
    portfolioFallbacks.forEach((item) => addDrawingGalleryItem(merged, item, 'portfolio'));
    return Array.from(merged.values())
        .sort((a, b) => getDrawingTimestampValue(b) - getDrawingTimestampValue(a))
        .slice(0, 60);
}

window.saveCurrentDrawing = async function() {
    const image = captureDrawingImage();
    const now = new Date().toISOString();
    const kind = drawingWorkspaceMissionStep ? 'mission-draft' : 'sketchbook';
    const record = buildDrawingRecord({ image, kind, missionStep: drawingWorkspaceMissionStep, savedAt: now });
    // 저장은 현재 활동 화면에 그대로 머물며 작품만 보관한다.
    // 그림 미션 단계 완료/해금/이어하기 변경은 완료하기 버튼에서만 처리한다.
    try {
        await persistDrawingRecord(record);
        updateDrawingDashboardPreview();
        showModal(drawingWorkspaceMissionStep ? '현재 그림 미션 작품을 저장했어요. 계속 그릴 수 있어요!' : '그림을 저장했어요!');
    } catch (error) {
        console.error('Failed to save drawing', error);
        updateDrawingDashboardPreview();
        showModal(escapeHtml(error.message || '그림 저장 중 오류가 발생했습니다.'));
    }
}

function showAiedueAutoToast(title, sub = '', duration = 1250) {
    const toast = document.createElement('div');
    toast.className = 'aiedue-toast';
    toast.innerHTML = `<div class="aiedue-toast-title">${escapeKoreanShopHtml(title)}</div>${sub ? `<div class="aiedue-toast-sub">${escapeKoreanShopHtml(sub)}</div>` : ''}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration + 120);
}

function animateAieduePointStar(points = 1) {
    if (!points) return;
    const target = document.querySelector('#drawing-workspace-section:not(.hidden) .sync-coins') || document.querySelector('#my-drawing-section:not(.hidden) .sync-coins') || document.getElementById('dashboard-coins-header') || document.querySelector('.sync-coins');
    const canvas = document.getElementById('drawing-canvas');
    if (!target || !canvas) return;
    const from = canvas.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const star = document.createElement('div');
    star.className = 'flying-aiedue-star';
    star.textContent = '⭐';
    star.style.left = `${from.left + from.width / 2}px`;
    star.style.top = `${from.top + from.height / 2}px`;
    document.body.appendChild(star);
    requestAnimationFrame(() => {
        star.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(.45) rotate(360deg)`;
        star.style.opacity = '0';
    });
    target.classList.add('point-pop');
    setTimeout(() => target.classList.remove('point-pop'), 620);
    setTimeout(() => star.remove(), 900);
}

window.completeTodayDrawingMission = async function() {
    ensureDrawingPortfolioShapeFields();
    if (Date.now() < Number(drawingPortfolio.unpaidCooldownUntil || 0)) {
        updateDrawingCompleteButtonCooldown();
        showModal('조금만 기다렸다가 완료할 수 있어요.');
        return;
    }

    const completionSnapshot = {
        currentUserCoins,
        currentUserBalance,
        currentUserAeduTokens,
        currentUserWarningTokens,
        currentUserAeduExperience,
        currentUserAeduLevel,
        currentUserDrawingStep,
        currentUserProfileSnapshot: JSON.parse(JSON.stringify(currentUserProfileSnapshot || {})),
        drawingPortfolio: JSON.parse(JSON.stringify(drawingPortfolio))
    };
    let drawingPersisted = false;
    setDrawingEvaluationState(true);

    try {
        const result = evaluateDrawingAccuracy();
        applyShapeAccuracyStats(result);
        const image = captureDrawingImage();
        const now = new Date().toISOString();
        const mission = drawingMissions.find((item) => item.step === drawingWorkspaceMissionStep);
        let completedRecord = null;
        let rewardPoints = 0;
        let message = '';
        if (drawingWorkspaceAiQuiz) {
            const targetShapeKey = aiDrawingTargetShape || drawingActiveTargetTemplate?.shapes?.[0]?.shape || Object.keys(result.byShape || {})[0] || 'circle';
            const targetShapeStat = result.byShape?.[targetShapeKey];
            const targetShapeAccuracy = targetShapeStat?.instanceCount ? Math.round(Number(targetShapeStat.accuracySum || 0) / targetShapeStat.instanceCount) : 0;
            const shapeReward = targetShapeAccuracy >= 50 ? 1 : 0;
            const designReward = result.accuracy >= 50 ? 5 : 0;
            rewardPoints = shapeReward + designReward;
            message = `AI 그림 정확도 ${result.accuracy}%. ${rewardPoints ? `에이두 포인트 ${rewardPoints}점을 받았어요.` : '50% 미만이라 포인트는 없어요.'}`;
        } else if (drawingWorkspaceMode === 'shape-mission') {
            rewardPoints = result.accuracy >= 50 ? 1 : 0;
            if (rewardPoints > 0) {
                drawingPortfolio.unpaidCooldownUntil = 0;
                message = `도형 정확도 ${result.accuracy}%! 에이두 포인트 1점을 받았어요.`;
            } else {
                drawingPortfolio.unpaidCooldownUntil = Date.now() + 60000;
                message = `도형 정확도 ${result.accuracy}%. 포인트 없이 다음 도형으로 넘어가요. 다음 완료는 1분 뒤에 누를 수 있어요.`;
            }
        } else if (drawingWorkspaceMode === 'infinite-drawing') {
            rewardPoints = 0;
            message = `그림 미션 [연장] 정확도 ${result.accuracy}%.`;
        } else if (drawingWorkspaceMissionStep) {
            rewardPoints = result.accuracy >= 50 ? 5 : 0;
            const record = buildDrawingRecord({ image, kind: 'mission', missionStep: drawingWorkspaceMissionStep, savedAt: now, accuracy: result.accuracy, rewardedPoints: rewardPoints, shapeAccuracy: result.byShape });
            drawingPortfolio.missions = { ...drawingPortfolio.missions, [drawingWorkspaceMissionStep]: record };
            drawingPortfolio.unlockedTemplates = Array.from(new Set([...(drawingPortfolio.unlockedTemplates || []), mission?.template].filter(Boolean)));
            currentUserDrawingStep = Math.max(currentUserDrawingStep, drawingWorkspaceMissionStep);
            record.rewardedPoints = rewardPoints;
            completedRecord = record;
            message = `${drawingWorkspaceMissionStep}단계 정확도 ${result.accuracy}%. ${mission?.template ? `${drawingTemplates[mission.template]} 도안이 해금됐어요!` : ''}${rewardPoints ? ` 에이두 포인트 ${rewardPoints}점을 받았어요.` : ' 50% 미만이라 포인트는 없어요.'}`;
        }

        if (!drawingWorkspaceMissionStep) {
            let kind = 'sketchbook';
            if (drawingWorkspaceMode === 'shape-mission') kind = 'shape-mission';
            else if (drawingWorkspaceAiQuiz) kind = 'ai-drawing';
            else if (drawingWorkspaceMode === 'infinite-drawing') kind = 'infinite-drawing';

            const record = buildDrawingRecord({ image, kind, savedAt: now, accuracy: result.accuracy, rewardedPoints: rewardPoints, shapeAccuracy: result.byShape });
            completedRecord = record;
        }

        // --- 그리기 경험치 지급 처리 (applyAiedueExperienceReward 마커) ---
        let isDrawingTemplate = false;
        if (drawingWorkspaceMissionStep) {
            isDrawingTemplate = true;
        } else if (drawingWorkspaceAiQuiz) {
            if (drawingActiveTargetTemplate && !aiDrawingTargetShape) {
                isDrawingTemplate = true;
            }
        }

        let baseExp = 0;
        if (isDrawingTemplate) {
            let validInstanceCount = 0;
            if (result && result.byShape) {
                Object.values(result.byShape).forEach((stat) => {
                    if (stat && Array.isArray(stat.instances)) {
                        stat.instances.forEach((inst) => {
                            if (inst && inst.accuracy >= 50) {
                                validInstanceCount++;
                            }
                        });
                    }
                });
            }
            baseExp = validInstanceCount * 1;
        } else {
            let accuracyToUse = result.accuracy;
            if (drawingWorkspaceAiQuiz) {
                const targetShapeKey = aiDrawingTargetShape || drawingActiveTargetTemplate?.shapes?.[0]?.shape || Object.keys(result.byShape || {})[0] || 'circle';
                const targetShapeStat = result.byShape?.[targetShapeKey];
                accuracyToUse = targetShapeStat?.instanceCount ? Math.round(Number(targetShapeStat.accuracySum || 0) / targetShapeStat.instanceCount) : result.accuracy;
            }
            baseExp = (accuracyToUse >= 50) ? 1 : 0;
        }

        const drawingStageMultiplier = calculateStageExperienceMultiplier(1);
        const finalDrawingExp = baseExp * drawingStageMultiplier;

        // 경험치와 레벨업은 아래 Firestore 트랜잭션에서 서버 최신값을 기준으로 반영한다.
        // ------------------------------------------------------------------

        if (!completedRecord) throw new Error('완료한 그림 기록을 만들지 못했습니다.');
        const drawingOperation = {
            pointReward: rewardPoints,
            missionBaseReward: completedRecord.kind === 'mission' ? rewardPoints : 0,
            experienceReward: finalDrawingExp,
            baseExperience: baseExp,
            experienceMultiplier: drawingStageMultiplier,
            experienceSource: drawingWorkspaceMissionStep ? '그리기 도형·그림 미션' : (drawingWorkspaceAiQuiz ? '그리기 AI 퀴즈' : '자유 그리기'),
            currentDrawingStep: currentUserDrawingStep,
            unlockedTemplate: completedRecord.kind === 'mission' ? mission?.template : null,
            shapeResult: result,
            ...(drawingWorkspaceMode === 'shape-mission'
                ? { unpaidCooldownUntil: drawingPortfolio.unpaidCooldownUntil }
                : {})
        };
        const committed = await persistDrawingRecord(completedRecord, drawingOperation);
        rewardPoints = committed.awardedDrawingPoints;
        drawingPersisted = true;
        if (committed.levelUpCount > 0) {
            showModal(`🎉 축하합니다! 레벨업했습니다!\nLv. ${committed.aeduLevel} (보상 ${committed.levelUpPoints}포인트${committed.removedWarningTokens ? ` · 주의토큰 ${committed.removedWarningTokens}개 차감` : ''})`);
        }
        updateDashboardExperience({ name: currentUserName, icon: currentUserIcon, coins: currentUserCoins, role: currentUserRole, currentLearningStep, currentDrawingStep: currentUserDrawingStep, drawingPortfolio, currentDictationStep: currentUserDictationStep, dictationPortfolio });
        updateDrawingDashboardPreview();
        updateDrawingCompleteButtonCooldown();
        animateAieduePointStar(rewardPoints);
        showAiedueAutoToast('잘했어요!!', `정확도 ${result.accuracy}%${rewardPoints ? ` · +${rewardPoints}점` : ''}`);

        if (drawingWorkspaceMode === 'shape-mission') setTimeout(openTodayDrawingActivity, 950);
        else if (drawingWorkspaceAiQuiz) setTimeout(openAiDrawingQuizActivity, 950);
        else if (drawingWorkspaceMode === 'infinite-drawing') {
            setTimeout(openDrawingInfiniteMode, 950);
        } else if (drawingWorkspaceMissionStep) {
            const nextMission = getNextDrawingMission();
            if (nextMission) setTimeout(() => openDrawingMission(nextMission.step), 950);
        }
    } catch (error) {
        console.error('Failed to complete drawing mission', error);
        if (!drawingPersisted) {
            currentUserCoins = completionSnapshot.currentUserCoins;
            currentUserBalance = completionSnapshot.currentUserBalance;
            currentUserAeduTokens = completionSnapshot.currentUserAeduTokens;
            currentUserWarningTokens = completionSnapshot.currentUserWarningTokens;
            currentUserAeduExperience = completionSnapshot.currentUserAeduExperience;
            currentUserAeduLevel = completionSnapshot.currentUserAeduLevel;
            currentUserDrawingStep = completionSnapshot.currentUserDrawingStep;
            currentUserProfileSnapshot = completionSnapshot.currentUserProfileSnapshot;
            drawingPortfolio = completionSnapshot.drawingPortfolio;
            updateDashboardExperience({ name: currentUserName, icon: currentUserIcon, coins: currentUserCoins, role: currentUserRole, currentLearningStep, currentDrawingStep: currentUserDrawingStep, drawingPortfolio, currentDictationStep: currentUserDictationStep, dictationPortfolio });
            updateDrawingDashboardPreview();
        }
        showModal(escapeHtml(error.message || '저장 중 오류가 발생했습니다.'));
    } finally {
        setDrawingEvaluationState(false);
    }
}

window.openFriendsDrawingGallery = async function() {
    const firebaseDrawings = await loadFriendsDrawingsFromFirebase();
    const localWorks = (drawingPortfolio.free || []).map((item) => ({ ...item, userName: currentUserName, userIcon: currentUserIcon, kind: item.kind || 'sketchbook' }));
    const merged = [...firebaseDrawings, ...localWorks].filter((item) => item?.image).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))).slice(0, 60);
    const body = merged.length ? `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 max-h-[70vh] overflow-y-auto custom-scrollbar pr-1">
            ${merged.map((item) => {
                const image = safeImageSource(item.image);
                if (!image) return '';
                return `<div class="korean-embed-card p-3 bg-white"><img src="${escapeHtml(image)}" alt="친구 그림" class="w-full h-44 object-contain bg-gray-50 rounded-2xl border" loading="lazy"><div class="mt-2 text-sm font-black text-[#2c3e50]">${escapeHtml(item.userIcon || '👤')} ${escapeHtml(item.userName || '친구')}</div><div class="text-xs text-gray-500 font-bold">${escapeHtml(item.templateLabel || drawingTemplates[item.template] || '스케치북')} · 정확도 ${Number.isFinite(Number(item.accuracy)) ? Number(item.accuracy) : '-'}% · ${escapeHtml(String(item.savedAt || '').slice(0, 10))}</div></div>`;
            }).join('')}
        </div>
    ` : '<div class="text-center text-gray-500 font-bold py-10">아직 저장된 친구 그림이 없어요.</div>';
    showModal(`<div class="text-left relative"><button type="button" class="absolute -top-3 right-0 text-4xl font-black text-gray-400 hover:text-gray-700" onclick="closeAiedueKoreanModal()">×</button><h3 class="text-2xl font-black text-[#2c3e50] mb-4">친구들 그림 구경하기</h3>${body}</div>`, { hideConfirm: true, hideIcon: true, plainClose: true });
}


const dictationItems = [
    { step: 1, title: '1단계: 쉬운 낱말', prompt: '나무', desc: '받침이 없는 쉬운 낱말을 들어요.' },
    { step: 2, title: '2단계: 받침 낱말', prompt: '산책', desc: '받침이 있는 낱말을 들어요.' },
    { step: 3, title: '3단계: 쉬운 문장', prompt: '나는 학교에 가요.', desc: '짧은 문장을 듣고 받아써요.' },
    { step: 4, title: '4단계: 생활 문장', prompt: '친구와 함께 책을 읽어요.', desc: '조금 긴 문장을 듣고 받아써요.' },
    { step: 5, title: '5단계: 도전 문장', prompt: '오늘 배운 낱말을 공책에 바르게 씁니다.', desc: '문장 부호와 띄어쓰기를 생각해요.' }
];
const spellingFallbackQuestions = [
    { options: ['나는 학교에 가요.', '친구와 함께 놀아요.', '사과를 맛있게 먹어요.', '하늘이 참 맑아여.'], answerIndex: 3, reason: "'맑아여'는 잘못된 표현이고 '맑아요'가 바른 표현이에요." },
    { options: ['오늘은 날씨가 좋아요.', '책을 조용히 읽어요.', '나는 밥을 먹었어요.', '동생이 집에 왔서요.'], answerIndex: 3, reason: "'왔서요'가 아니라 '왔어요'라고 써야 해요." },
    { options: ['선생님께 인사해요.', '공책에 글씨를 써요.', '친구가 웃었어요.', '나는 학교를 갔어요.'], answerIndex: 3, reason: "문맥상 '학교에 갔어요'가 자연스럽고 조사 '에'를 쓰는 것이 좋아요." }
];
let spellingFallbackIndex = 0;

const consonantSoundMap = {
    'ㄱ':'그', 'ㄴ':'느', 'ㄷ':'드', 'ㄹ':'르', 'ㅁ':'므', 'ㅂ':'브',
    'ㅅ':'스', 'ㅇ':'응', 'ㅈ':'즈', 'ㅊ':'츠', 'ㅋ':'크', 'ㅌ':'트',
    'ㅍ':'프', 'ㅎ':'흐', 'ㄲ':'끄', 'ㄸ':'뜨', 'ㅃ':'쁘', 'ㅆ':'쓰', 'ㅉ':'쯔'
};

let globalTtsAudio = null;
let isAudioUnlocked = false;
let activeTtsRequestId = 0;
let activeTtsAbortController = null;
let activeTtsObjectUrl = '';
const AIEDUE_SCHOOL_TTS_ENDPOINT = 'https://us-central1-mansungcoin-c6e06.cloudfunctions.net/ttsHandler';
const AIEDUE_TTS_CHUNK_LIMIT = 180;
const AIEDUE_TTS_RATE_MULTIPLIER = 1.2;

function unlockAudioAndSpeech() {
    // 1. HTML5 Audio Unlock
    if (!isAudioUnlocked) {
        if (!globalTtsAudio) {
            globalTtsAudio = new Audio();
        }
        const originalSrc = globalTtsAudio.src;
        globalTtsAudio.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";
        globalTtsAudio.play().then(() => {
            isAudioUnlocked = true;
            globalTtsAudio.src = originalSrc;
            console.log("HTML5 Audio unlocked.");
        }).catch((e) => {
            console.log("HTML5 Audio unlock failed, will retry:", e);
        });
    }

    // If HTML5 Audio is unlocked, we can remove the listeners
    if (isAudioUnlocked) {
        window.removeEventListener('click', unlockAudioAndSpeech, true);
        window.removeEventListener('touchstart', unlockAudioAndSpeech, true);
    }
}
window.addEventListener('click', unlockAudioAndSpeech, true);
window.addEventListener('touchstart', unlockAudioAndSpeech, true);

function cancelSpeech() {
    activeTtsRequestId += 1;
    activeTtsAbortController?.abort();
    activeTtsAbortController = null;
    if (globalTtsAudio) {
        globalTtsAudio.pause();
        globalTtsAudio.currentTime = 0;
        globalTtsAudio.onended = null;
        globalTtsAudio.onerror = null;
    }
    if (activeTtsObjectUrl) {
        URL.revokeObjectURL(activeTtsObjectUrl);
        activeTtsObjectUrl = '';
    }
}
window.cancelSpeech = cancelSpeech;

function splitAiedueTtsText(text) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (!normalized) return [];
    const chunks = [];
    let remaining = normalized;
    while (remaining.length > AIEDUE_TTS_CHUNK_LIMIT) {
        const windowText = remaining.slice(0, AIEDUE_TTS_CHUNK_LIMIT + 1);
        const sentenceBreak = Math.max(windowText.lastIndexOf('. '), windowText.lastIndexOf('? '), windowText.lastIndexOf('! '), windowText.lastIndexOf(', '), windowText.lastIndexOf(' '));
        const splitAt = sentenceBreak > 40 ? sentenceBreak + 1 : AIEDUE_TTS_CHUNK_LIMIT;
        chunks.push(remaining.slice(0, splitAt).trim());
        remaining = remaining.slice(splitAt).trim();
    }
    if (remaining) chunks.push(remaining);
    return chunks;
}

function waitForAiedueTtsAudio(audio, requestId) {
    return new Promise((resolve, reject) => {
        audio.onended = () => requestId === activeTtsRequestId ? resolve() : reject(new DOMException('재생이 취소됐습니다.', 'AbortError'));
        audio.onerror = () => reject(new Error('TTS 오디오를 재생하지 못했습니다.'));
        const playPromise = audio.play();
        if (playPromise) playPromise.catch(reject);
    });
}

async function playAiedueSchoolTtsChunk(text, playbackRate, requestId, signal) {
    const response = await fetch(AIEDUE_SCHOOL_TTS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify({ text, voice: 'female' }),
        signal
    });
    if (!response.ok) throw new Error(`에이두 스쿨 TTS 응답 오류 (${response.status})`);
    if (!response.headers.get('content-type')?.startsWith('audio/')) throw new Error('에이두 스쿨 TTS가 음원으로 응답하지 않았습니다.');
    const audioBlob = await response.blob();
    if (requestId !== activeTtsRequestId) throw new DOMException('재생이 취소됐습니다.', 'AbortError');
    activeTtsObjectUrl = URL.createObjectURL(audioBlob);
    globalTtsAudio.src = activeTtsObjectUrl;
    globalTtsAudio.playbackRate = playbackRate;
    try {
        await waitForAiedueTtsAudio(globalTtsAudio, requestId);
    } finally {
        if (activeTtsObjectUrl) {
            URL.revokeObjectURL(activeTtsObjectUrl);
            activeTtsObjectUrl = '';
        }
    }
}

async function playGoogleTtsFallback(text, playbackRate, requestId) {
    if (requestId !== activeTtsRequestId) throw new DOMException('재생이 취소됐습니다.', 'AbortError');
    globalTtsAudio.src = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=ko&total=1&idx=0&textlen=${text.length}&client=tw-ob&prev=input`;
    globalTtsAudio.playbackRate = playbackRate;
    await waitForAiedueTtsAudio(globalTtsAudio, requestId);
}

async function playAiedueSchoolTts(text, { playbackRate = 0.85 } = {}) {
    cancelSpeech();
    const requestId = activeTtsRequestId;
    activeTtsAbortController = new AbortController();
    if (!globalTtsAudio) globalTtsAudio = new Audio();
    const chunks = splitAiedueTtsText(text);
    for (const chunk of chunks) {
        try {
            await playAiedueSchoolTtsChunk(chunk, playbackRate, requestId, activeTtsAbortController.signal);
        } catch (error) {
            if (error?.name === 'AbortError' || requestId !== activeTtsRequestId) throw error;
            console.warn('에이두 스쿨 TTS 호출 실패, Google 음원 경로로 재시도합니다.', error);
            await playGoogleTtsFallback(chunk, playbackRate, requestId);
        }
    }
}

function speakTextKo(text, onEndCallback, options = {}) {
    let processedText = text;
    if (typeof text === 'string' && text.length === 1) {
        if (consonantSoundMap[text]) {
            processedText = consonantSoundMap[text];
        }
    }
    const requestedRate = Number(options.playbackRate ?? 0.85);
    const playbackRate = Math.min(2, Math.max(0.5, requestedRate * AIEDUE_TTS_RATE_MULTIPLIER));
    playAiedueSchoolTts(processedText, { ...options, playbackRate })
        .then(() => onEndCallback?.())
        .catch((error) => {
            if (error?.name === 'AbortError') return;
            console.error('에이두 한글 TTS 재생 실패:', error);
            onEndCallback?.();
        });
}

window.speakTextKo = speakTextKo;

function spokenLabelForChar(char) {
    return char === '●' || char === 'ㆍ' ? '둥근 해' : char;
}

window.speakChar = function(char) {
    speakTextKo(spokenLabelForChar(char));
};

// 결합 카드 클릭 시 애니메이션 재시작 + 순차적 자모음 음성(므, 아, 마) 출력
let activeTtsTimeouts = [];
window.restartCombineAnim = function(card, options = {}) {
    if (!card) return;

    // 결합 카드는 숨겨진 화면에서 먼저 만들어질 수 있으므로,
    // 화면에 나타난 뒤 모든 요소의 애니메이션 시간을 다시 0초부터 시작한다.
    const animatedParts = Array.from(card.querySelectorAll(
        '.combine-left, .combine-right, .combine-result, .combine-op, '
        + '.combine-dot-up, .combine-dot-up-double, .combine-dot-down, .combine-dot-down-double, '
        + '.combine-base, .combine-vowel-base, .combine-dot-right, .combine-dot-left'
    ));
    if (!card._combineBaseDelays) {
        card._combineBaseDelays = animatedParts.map((part) => part.style.animationDelay);
    }
    const delays = card._combineBaseDelays;
    const startDelay = Math.max(0, Number(options.startDelay) || 0);
    const getAnimationDelay = (delay) => startDelay
        ? `calc(${delay || '0s'} + ${startDelay}s)`
        : (delay || '');
    if (card._combineRestartFrame) {
        window.cancelAnimationFrame(card._combineRestartFrame);
        card._combineRestartFrame = null;
    }
    card.classList.add('combine-reset');
    animatedParts.forEach((part) => {
        part.style.animation = 'none';
    });
    void card.offsetWidth;
    card._combineRestartFrame = window.requestAnimationFrame(() => {
        animatedParts.forEach((part, index) => {
            part.style.animation = '';
            part.style.animationDelay = getAnimationDelay(delays[index]);
        });
        card.classList.remove('combine-reset');
        void card.offsetWidth;
        card._combineRestartFrame = null;
    });

    // 기존 진행 중인 모든 합성 음성 대기열 취소
    activeTtsTimeouts.forEach(t => clearTimeout(t));
    activeTtsTimeouts = [];
    cancelSpeech();

    const combosAttr = card.getAttribute('data-combos');
    if (combosAttr && options.speak !== false) {
        try {
            const combos = JSON.parse(combosAttr);
            combos.forEach((c, idx) => {
                const getSound = (char) => {
                    if (char === 'ㆍ') return '어';
                    return consonantSoundMap[char] || char;
                };
                const soundL = getSound(c.l);
                const soundR = getSound(c.r);
                const soundRes = c.res;

                // 첫소리 (예: 0s 시작행이면 바로 "므" / "으")
                const t1 = setTimeout(() => {
                    speakTextKo(soundL);
                }, idx * 4700);

                // 가운뎃소리 (1.1초 후 "아" / "어")
                const t2 = setTimeout(() => {
                    speakTextKo(soundR);
                }, idx * 4700 + 1100);

                // 끝소리 (2.5초 후 "마" / "아")
                const t3 = setTimeout(() => {
                    speakTextKo(soundRes);
                }, idx * 4700 + 2500);

                activeTtsTimeouts.push(t1, t2, t3);
            });
        } catch (e) {
            console.error(e);
        }
    }
};

// 글자 결합 패턴 감지 및 애니메이션 카드 생성
function parseCombinations(text) {
    const re = /([가-힣ㄱ-ㅎㅏ-ㅣ●ㆍ]+)\s*\+\s*([가-힣ㄱ-ㅎㅏ-ㅣ●ㆍ]+)\s*[→=]\s*([가-힣ㄱ-ㅎㅏ-ㅣ●]+)/g;
    const out = [];
    let m;
    while ((m = re.exec(text)) !== null) out.push({ l: m[1].trim(), r: m[2].trim(), res: m[3].trim() });
    return out;
}
// 진행 패턴(A→B→C) 감지 - 입 벌림 애니메이션
function parseProgression(text) {
    const re = /([\uac00-\ud7a3\u3131-\u314e\u314f-\u3163]+)(?:\u2192([\uac00-\ud7a3\u3131-\u314e\u314f-\u3163]+))+/;
    const m = re.exec(text);
    if (!m) return null;
    return m[0].split('\u2192');
}
function renderCardContent(card) {
    // 1) A→B→C 진행 패턴: 입 벌림 애니메이션
    const steps = parseProgression(card);
    if (steps && steps.length >= 3) {
        const n = steps.length;
        // 타원 크기: 첫 항목이 가장 좌우가 좌고(입이 존게), 마지링이 널직게
        const steps_html = steps.map((s, i) => {
            const ratio = i / (n - 1);  // 0 → 1
            const w = Math.round(30 + ratio * 40);  // 30px → 70px
            const h = Math.round(56 - ratio * 22);  // 56px → 34px
            const delay = `animation-delay:${i * 0.55}s`;
            const arrDelay = `animation-delay:${i * 0.55 - 0.2}s`;
            const arr = i < n - 1 ? `<span class="mouth-arr" style="${arrDelay}">→</span>` : '';
            return `<div class="mouth-step" style="${delay}">
                <div class="mouth-oval" style="width:${w}px;height:${h}px">${s}</div>
                <span class="mouth-lbl">${s}</span>
            </div>${arr}`;
        }).join('');
        return `<div class="mouth-card">
            <div class="mouth-sequence">${steps_html}</div>
            <div class="mouth-text">${card}</div>
        </div>`;
    }
    // 2) A+B→C 결합 패턴
    const combos = parseCombinations(card);
    if (combos.length) {
        const combosData = JSON.stringify(combos).replace(/"/g, '&quot;');
        const vertUp   = ['ㅗ','ㅛ'];
        const vertDown = ['ㅜ','ㅠ'];
        const vertRight = ['ㅏ','ㅑ','ㅐ','ㅒ'];
        const vertLeft  = ['ㅓ','ㅕ','ㅔ','ㅖ'];
        const rows = combos.map((c, i) => {
            const d = `animation-delay:${i * 4.7}s`;
            const isUp   = vertUp.includes(c.res);
            const isDown = vertDown.includes(c.res);
            const isRight = vertRight.includes(c.res);
            const isLeft = vertLeft.includes(c.res);
            if (isUp || isDown) {
                const dotChar  = (c.l === 'ㆍ') ? c.l : c.r;
                const baseChar = (c.l === 'ㆍ') ? c.r : c.l;
                const dClass   = c.res === 'ㅛ' ? 'combine-dot-up-double' : c.res === 'ㅠ' ? 'combine-dot-down-double' : isUp ? 'combine-dot-up' : 'combine-dot-down';
                const baseClass = isUp ? 'combine-base-up' : 'combine-base-down';
                return `<div class="combine-row">
                    <div class="combine-box ${dClass}" style="${d}">${dotChar}</div>
                    <div class="combine-box combine-base ${baseClass}" style="${d}">${baseChar}</div>
                    <span class="combine-op" style="${d}">→</span>
                    <div class="combine-box combine-result" style="${d}">${c.res}</div>
                </div>`;
            }
            if (isRight || isLeft) {
                const dotChar  = (c.l === 'ㆍ') ? c.l : c.r;
                const baseChar = (c.l === 'ㆍ') ? c.r : c.l;
                const dotClass = isRight ? 'combine-dot-right' : 'combine-dot-left';
                if (isLeft) {
                    return `<div class="combine-row">
                        <div class="combine-box ${dotClass}" style="${d}">${dotChar}</div>
                        <span class="combine-op" style="${d}">+</span>
                        <div class="combine-box combine-vowel-base" style="${d}">${baseChar}</div>
                        <span class="combine-op" style="${d}">→</span>
                        <div class="combine-box combine-result" style="${d}">${c.res}</div>
                    </div>`;
                }
                return `<div class="combine-row">
                    <div class="combine-box combine-vowel-base" style="${d}">${baseChar}</div>
                    <span class="combine-op" style="${d}">+</span>
                    <div class="combine-box ${dotClass}" style="${d}">${dotChar}</div>
                    <span class="combine-op" style="${d}">→</span>
                    <div class="combine-box combine-result" style="${d}">${c.res}</div>
                </div>`;
            }
            const leftClass  = 'combine-left';
            const rightClass = 'combine-right';
            return `<div class="combine-row">
                <div class="combine-box ${leftClass}"  style="${d}">${c.l}</div>
                <span class="combine-op" style="${d}">+</span>
                <div class="combine-box ${rightClass}" style="${d}">${c.r}</div>
                <span class="combine-op" style="${d}">→</span>
                <div class="combine-box combine-result" style="${d}">${c.res}</div>
            </div>`;
        }).join('');
        return `<div class="combine-card" onclick="restartCombineAnim(this)" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();restartCombineAnim(this)}" role="button" tabindex="0" data-combos="${combosData}" title="눌러서 다시 보기">${rows}<div class="combine-replay">🔄 눌러서 다시 보기</div></div>`;
    }
    // 3) 일반 텍스트 카드
    return `<div class="border-2 border-stone-200 rounded-2xl p-4 bg-white text-lg text-stone-700 leading-relaxed">${card}</div>`;
}

function renderVowelOriginScene(types = ['ground', 'person', 'sun']) {
    const enabledTypes = new Set(types);
    const sceneLabel = enabledTypes.has('sun')
        ? '땅, 사람, 둥근 해의 모습에서 모음을 찾는 그림'
        : '땅과 서 있는 사람의 모습에서 ㅡ와 ㅣ를 찾는 그림';
    return `<div class="vowel-origin-scene" style="--origin-card-count:${enabledTypes.size}" aria-label="${sceneLabel}">
        ${enabledTypes.has('ground') ? `<button type="button" class="vowel-origin-card origin-ground-card" data-origin-type="ground" onclick="playVowelOriginCard('ground', { speak: true })" aria-label="땅에서 ㅡ가 되는 모습 다시 보기와 음성 듣기">
            <div class="origin-card-visual" aria-hidden="true">
                <div class="origin-sky-band"><span class="origin-cloud cloud-one"></span><span class="origin-cloud cloud-two"></span></div>
                <div class="origin-ground-band"><span class="origin-grass-blade grass-one"></span><span class="origin-grass-blade grass-two"></span><span class="origin-flower"></span></div>
                <div class="origin-soil-band"></div>
                <div class="origin-focus-line"><span class="origin-light-sweep"></span></div>
                <div class="origin-result-glyph">ㅡ</div>
            </div>
            <div class="origin-card-label">땅</div>
        </button>` : ''}
        ${enabledTypes.has('person') ? `<button type="button" class="vowel-origin-card origin-person-card" data-origin-type="person" onclick="playVowelOriginCard('person', { speak: true })" aria-label="서 있는 사람에서 ㅣ가 되는 모습 다시 보기와 음성 듣기">
            <div class="origin-card-visual" aria-hidden="true">
                <div class="origin-sky-band"></div>
                <div class="origin-person-ground"></div>
                <div class="origin-person-character">
                    <span class="origin-person-head"><i class="origin-person-hair"></i><i class="origin-person-eyes"></i><i class="origin-person-smile"></i></span>
                    <span class="origin-person-body"></span>
                    <span class="origin-person-arm arm-left"></span><span class="origin-person-arm arm-right"></span>
                    <span class="origin-person-leg leg-left"></span><span class="origin-person-leg leg-right"></span>
                </div>
                <div class="origin-vertical-light"></div>
                <div class="origin-result-glyph">ㅣ</div>
            </div>
            <div class="origin-card-label">서 있는 사람</div>
        </button>` : ''}
        ${enabledTypes.has('sun') ? `<button type="button" class="vowel-origin-card origin-sun-card" data-origin-type="sun" onclick="playVowelOriginCard('sun', { speak: true })" aria-label="둥근 해에서 동그라미가 되는 모습 다시 보기와 음성 듣기">
            <div class="origin-card-visual" aria-hidden="true">
                <div class="origin-sky-band"><span class="origin-cloud cloud-one"></span><span class="origin-cloud cloud-two"></span></div>
                <div class="origin-sun-figure">
                    <span class="origin-sun-ray ray-1"></span><span class="origin-sun-ray ray-2"></span><span class="origin-sun-ray ray-3"></span><span class="origin-sun-ray ray-4"></span>
                    <span class="origin-sun-ray ray-5"></span><span class="origin-sun-ray ray-6"></span><span class="origin-sun-ray ray-7"></span><span class="origin-sun-ray ray-8"></span>
                    <span class="origin-sun-core"></span>
                </div>
                <div class="origin-result-glyph"><span class="small-dot-char">●</span></div>
            </div>
            <div class="origin-card-label">둥근 해</div>
        </button>` : ''}
    </div>`;
}

function renderVowelOriginExplanations(types = ['ground', 'person', 'sun']) {
    const enabledTypes = new Set(types);
    return `<div class="origin-explanation-list" aria-live="polite">
        ${enabledTypes.has('ground') ? `<div class="origin-explanation origin-ground-explanation" data-origin-description="ground">
            <div class="origin-explanation-glyph">ㅡ</div>
            <div><strong>땅은 옆으로 길게 펼쳐져 있어요.</strong><span>땅의 모양에서 「ㅡ」가 태어났어요.</span><span>소리는 「으」예요.</span></div>
        </div>` : ''}
        ${enabledTypes.has('person') ? `<div class="origin-explanation origin-person-explanation" data-origin-description="person">
            <div class="origin-explanation-glyph">ㅣ</div>
            <div><strong>사람은 땅 위에 곧게 서 있어요.</strong><span>서 있는 사람의 모양에서 「ㅣ」가 태어났어요.</span><span>소리는 「이」예요.</span></div>
        </div>` : ''}
        ${enabledTypes.has('sun') ? `<div class="origin-explanation origin-sun-explanation" data-origin-description="sun">
            <div class="origin-explanation-glyph"><span class="small-dot-char">●</span></div>
            <div><strong>해는 하늘에 둥글게 떠 있어요.</strong><span>둥근 해의 모양에서 「●」가 태어났어요.</span></div>
        </div>` : ''}
    </div>`;
}

const vowelOriginStages = {
    ground: {
        duration: 6000,
        speech: '땅은 옆으로 길게 펼쳐져 있어요. 땅의 모양에서 ㅡ가 태어났어요. 소리는 으 예요.'
    },
    person: {
        duration: 5800,
        speech: '사람은 땅 위에 곧게 서 있어요. 서 있는 사람의 모양에서 ㅣ가 태어났어요. 소리는 이 예요.'
    },
    sun: {
        duration: 5400,
        speech: '해는 하늘에 둥글게 떠 있어요. 둥근 해의 모양에서 점이 태어났어요.'
    }
};
let vowelOriginTimers = [];
let vowelOriginSequenceToken = 0;

function clearVowelOriginTimers() {
    vowelOriginTimers.forEach((timer) => window.clearTimeout(timer));
    vowelOriginTimers = [];
}

window.stopVowelOriginSequence = function stopVowelOriginSequence() {
    vowelOriginSequenceToken += 1;
    clearVowelOriginTimers();
};

function resetVowelOriginCards() {
    document.querySelectorAll('.vowel-origin-card').forEach((card) => {
        card.classList.remove('is-origin-active', 'is-origin-playing', 'is-origin-complete');
    });
    document.querySelectorAll('.origin-explanation').forEach((description) => {
        description.classList.remove('is-origin-active');
    });
}

function runVowelOriginStage(type, { speak = false, token = vowelOriginSequenceToken } = {}) {
    const config = vowelOriginStages[type];
    const card = document.querySelector(`.vowel-origin-card[data-origin-type="${type}"]`);
    const description = document.querySelector(`.origin-explanation[data-origin-description="${type}"]`);
    if (!config || !card || token !== vowelOriginSequenceToken) return 0;

    document.querySelectorAll('.vowel-origin-card').forEach((item) => item.classList.remove('is-origin-active'));
    document.querySelectorAll('.origin-explanation').forEach((item) => item.classList.remove('is-origin-active'));
    card.classList.remove('is-origin-playing', 'is-origin-complete');
    void card.offsetWidth;
    card.classList.add('is-origin-active', 'is-origin-playing');
    description?.classList.add('is-origin-active');

    if (speak) {
        cancelSpeech();
        speakTextKo(config.speech);
    }

    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const duration = reducedMotion ? 1700 : config.duration;
    const completionTimer = window.setTimeout(() => {
        if (token !== vowelOriginSequenceToken || !card.isConnected) return;
        card.classList.remove('is-origin-playing');
        card.classList.add('is-origin-complete');
    }, duration);
    vowelOriginTimers.push(completionTimer);
    return duration;
}

window.playVowelOriginCard = function playVowelOriginCard(type, options = {}) {
    window.stopVowelOriginSequence();
    resetVowelOriginCards();
    runVowelOriginStage(type, { speak: options.speak !== false, token: vowelOriginSequenceToken });
};

window.playVowelOriginSequence = function playVowelOriginSequence() {
    window.stopVowelOriginSequence();
    resetVowelOriginCards();
    const token = vowelOriginSequenceToken;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const pause = reducedMotion ? 450 : 800;
    let startAt = 350;

    const visibleTypes = Array.from(document.querySelectorAll('.vowel-origin-card[data-origin-type]'))
        .map((card) => card.dataset.originType)
        .filter((type) => vowelOriginStages[type]);
    visibleTypes.forEach((type) => {
        const duration = reducedMotion ? 1700 : vowelOriginStages[type].duration;
        const timer = window.setTimeout(() => runVowelOriginStage(type, { speak: false, token }), startAt);
        vowelOriginTimers.push(timer);
        startAt += duration + pause;
    });
};

// 이해하기 2: 자음 전체 선택 + 음성
window.selectConsonants = function() {
    document.querySelectorAll('.syllable-consonant').forEach(el => el.classList.add('selected-consonant'));
    document.querySelectorAll('.syllable-vowel').forEach(el => el.classList.remove('selected-vowel'));
    speakTextKo('자음');
};
// 이해하기 2: 모음 전체 선택 + 음성
window.selectVowels = function() {
    document.querySelectorAll('.syllable-vowel').forEach(el => el.classList.add('selected-vowel'));
    document.querySelectorAll('.syllable-consonant').forEach(el => el.classList.remove('selected-consonant'));
    speakTextKo('모음');
};


function cleanKoreanWord(text) { return String(text || '').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, '').trim(); }
function cleanKoreanSentence(text) { return String(text || '').replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ0-9\s.,!?]/g, '').replace(/\s+/g, ' ').trim(); }
function normalizeDictationBankItem(item) {
    const sentence = cleanKoreanSentence(item?.sentence || item?.prompt || '');
    if (!sentence) return null;
    return { sentence, source: item?.source || 'dictation', wrongCount: Math.max(0, Number(item?.wrongCount || 0)), correctCount: Math.max(0, Number(item?.correctCount || 0)), lastTriedAt: item?.lastTriedAt || item?.savedAt || null, savedAt: item?.savedAt || new Date().toISOString() };
}
function normalizeDictationPortfolio(raw = {}) {
    const bank = raw?.koreanBank || {};
    return {
        missions: raw?.missions || {},
        aiWords: Array.isArray(raw?.aiWords) ? raw.aiWords : [],
        koreanBank: {
            words: Array.from(new Set((Array.isArray(bank.words) ? bank.words : []).map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord))).slice(0, 300)
        },
        wrongBank: Array.isArray(raw?.wrongBank) ? raw.wrongBank.map(normalizeDictationBankItem).filter(Boolean) : [],
        completedBank: Array.isArray(raw?.completedBank) ? raw.completedBank.map(normalizeDictationBankItem).filter(Boolean) : [],
        captures: Array.isArray(raw?.captures) ? raw.captures.slice(0, 20) : [],
        dictationLocked: raw?.dictationLocked !== false,
        hasCompletedOnce: Boolean(raw?.hasCompletedOnce)
    };
}
const KOREAN_VERB_LIKE_ENDINGS = ['하다','했다','한다','해요','되다','된다','됐다','가다','간다','가요','오다','온다','와요','먹다','먹어요','보다','봐요','읽다','읽어요','쓰다','써요','있다','없다','좋다'];
function isLikelyKoreanNounBankWord(word) {
    const clean = cleanKoreanWord(word);
    if (clean.length < 2 || clean.length > 8) return false;
    if (KOREAN_VERB_LIKE_ENDINGS.some((ending) => clean.endsWith(ending))) return false;
    return true;
}
function extractKoreanBankFromText(text) {
    const words = Array.from(new Set(String(text || '').match(/[가-힣]{2,}/g) || [])).map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord).slice(0, 80);
    return { words };
}
function mergeKoreanBank({ words = [] }) {
    const bank = dictationPortfolio.koreanBank || { words: [] };
    dictationPortfolio.koreanBank = {
        words: Array.from(new Set([...(bank.words || []), ...words.map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord)])).slice(0, 300)
    };
}
async function persistDictationData(extra = {}) {
    dictationPortfolio = normalizeDictationPortfolio(dictationPortfolio);
    const walletExtra = {
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel,
        koreanActivityLog: currentUserProfileSnapshot?.koreanActivityLog || []
    };
    if (currentUserId) await setDoc(doc(db, 'users', currentUserId), { currentDictationStep: currentUserDictationStep, dictationPortfolio, ...walletExtra, ...extra, updatedAt: serverTimestamp() }, { merge: true });
    updateDashboardExperience({ name: currentUserName, icon: currentUserIcon, coins: currentUserCoins, role: currentUserRole, currentLearningStep, currentDrawingStep: currentUserDrawingStep, drawingPortfolio, currentDictationStep: currentUserDictationStep, dictationPortfolio });
}
function isDictationMissionLocked() {
    const words = dictationPortfolio?.koreanBank?.words?.length || 0;
    if (words <= 0) return true;
    if (!dictationPortfolio.hasCompletedOnce) return false;
    return dictationPortfolio.dictationLocked !== false;
}
function updateDictationDashboardPreview() {
    dictationPortfolio = normalizeDictationPortfolio(dictationPortfolio);
    const wrong = dictationPortfolio.wrongBank.length, done = dictationPortfolio.completedBank.length;
    const words = dictationPortfolio.koreanBank.words.length;
    const summary = document.getElementById('dictation-bank-summary'); if (summary) summary.innerText = `오답 ${wrong}개 · 완료 ${done}개`;
    const bankSummary = document.getElementById('korean-bank-summary'); if (bankSummary) bankSummary.innerText = `단어 ${words}개`;
    const badge = document.getElementById('dictation-lock-badge'); const desc = document.getElementById('dictation-mission-desc'); const card = document.getElementById('dictation-mission-card');
    const locked = isDictationMissionLocked();
    if (badge) badge.innerText = locked ? '잠겨 있음' : '오늘의 미션';
    if (desc) desc.innerText = locked ? '미션을 하려면 단어 은행 사진을 먼저 찍어야 해요!' : '단어 은행 기반으로 교과 맞춤쓰기 10문장을 바로 생성해요!';
    if (card) card.classList.toggle('opacity-70', locked);
}
function makeSentenceFromWords(words, index = 0) {
    const picked = words.filter(Boolean); const w1 = picked[index % picked.length] || '나무'; const w2 = picked[(index + 1) % picked.length] || '학교';
    const frames = [`${w1}을 바르게 써요.`, `${w1}와 ${w2}를 배워요.`, `나는 ${w1}을 좋아해요.`, `${w1}이 있는 문장을 읽어요.`, `오늘은 ${w1} 공부를 해요.`];
    return frames[index % frames.length];
}
function createDictationMissionSession() {
    const wrongItems = [...(dictationPortfolio.wrongBank || [])].sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0)).slice(0, 5).map((item) => ({ sentence: item.sentence, source: 'wrong-bank' }));
    const bank = dictationPortfolio.koreanBank || { words: [] }; const generated = []; const existing = new Set(wrongItems.map((item) => item.sentence));
    for (let i = 0; generated.length < (10 - wrongItems.length) && i < 40; i += 1) { const sentence = makeSentenceFromWords(bank.words || [], i); if (!existing.has(sentence) && !generated.some((item) => item.sentence === sentence)) generated.push({ sentence, source: 'generated-word' }); }
    return { kind: 'mission', items: [...wrongItems, ...generated].slice(0, 10), currentIndex: 0, graded: null, saved: false, autoSaved: false, startedAt: new Date().toISOString() };
}
function renderDictationSessionList() {
    const root = document.getElementById('dictation-session-list'); if (!root || !activeDictationSession) return;
    root.innerHTML = activeDictationSession.items.map((item, index) => {
        const graded = activeDictationSession.graded?.[index];
        if (graded) {
            return `<div class="rounded-3xl border-2 ${graded.correct ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'} p-4"><div class="flex items-center justify-between gap-2"><div class="font-black text-red-500">${index + 1}번 ${graded.correct ? '⭕ 완료 은행' : '🟡 오답 은행'}</div><div class="text-xs font-bold text-gray-400">${item.source === 'wrong-bank' ? '오답 복습' : '새 문장'}</div></div><div class="mt-3 text-sm font-bold text-gray-500">정답</div><div class="text-xl font-black text-[#2c3e50]">${escapeHtml(graded.sentence)}</div><div class="mt-3 text-sm font-bold text-gray-500">학생이 쓴 답</div><div class="text-lg font-black ${graded.correct ? 'text-green-700' : 'text-yellow-700'}">${escapeHtml(graded.written || 'AI가 해당 문항 답을 찾지 못했어요.')}</div><p class="mt-2 text-sm text-gray-500 font-bold">${escapeHtml(graded.analysis || '')}</p></div>`;
        }
        return `<button type="button" class="btn-choice text-left ${index === activeDictationSession.currentIndex ? '!border-red-400 !bg-red-50' : ''}" onclick="selectDictationSessionItem(${index})"><span class="font-black text-red-500">문제 ${index + 1}</span><span class="text-xs text-gray-400 ml-2">${item.source === 'wrong-bank' ? '오답 복습' : '새 문장'}</span><span class="float-right">🔊</span></button>`;
    }).join('');
    document.getElementById('dictation-question-label').innerText = `문제 ${activeDictationSession.currentIndex + 1} / ${activeDictationSession.items.length}`;
}
window.selectDictationSessionItem = function(index) { if (!activeDictationSession?.items?.[index]) return; activeDictationSession.currentIndex = index; renderDictationSessionList(); speakTextKo(activeDictationSession.items[index].sentence); }
window.playDictationPrompt = function() { const sentence = activeDictationSession?.items?.[activeDictationSession.currentIndex]?.sentence || activeDictationItem?.prompt; if (sentence) speakTextKo(sentence); }
function configureDictationWorkspace(session, options = {}) {
    activeDictationSession = session; activeDictationItem = session?.items?.[0] ? { prompt: session.items[0].sentence, step: options.step || null } : null;
    if (session.kind === 'practice') stopDictationCamera();

    // 교과 맞춤쓰기 사진만 보기 마커
    const grid = document.getElementById('dictation-workspace-grid');
    const qPanel = document.getElementById('dictation-question-panel');
    if (session.kind === 'bank-camera') {
        if (qPanel) qPanel.classList.add('hidden');
        if (grid) grid.className = 'grid grid-cols-1 gap-6';
    } else if (session.kind === 'practice') {
        if (qPanel) qPanel.classList.remove('hidden');
        if (grid) grid.className = 'grid grid-cols-1 gap-6';
    } else {
        if (qPanel) qPanel.classList.remove('hidden');
        if (grid) grid.className = 'grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6';
    }

    const photoCard = document.getElementById('dictation-photo-card'); if (photoCard) photoCard.classList.toggle('hidden', session.kind === 'practice');
    const photoTitle = document.getElementById('dictation-photo-panel-title'); if (photoTitle) photoTitle.innerText = session.kind === 'bank-camera' ? '단어 은행 사진' : (session.kind === 'mission' ? '태블릿 카메라 / 공책 사진' : '');
    const cameraPanel = document.getElementById('dictation-camera-panel'); if (cameraPanel) cameraPanel.classList.toggle('hidden', session.kind === 'practice');
    const wordPreview = document.getElementById('dictation-ai-word-preview'); if (wordPreview) { wordPreview.classList.add('hidden'); wordPreview.innerText = ''; }
    activeDictationPhotoFile = null; activeDictationPhotoDataUrl = ''; activeDictationImageAnalysis = '';
    document.getElementById('dictation-workspace-badge').innerText = options.badge || (session.kind === 'practice' ? '교과 맞춤쓰기 연습하기' : '오늘의 미션');
    document.getElementById('dictation-workspace-title').innerText = options.title || (session.kind === 'practice' ? '문장 따라 쓰기 연습' : '교과 맞춤쓰기');
    document.getElementById('dictation-workspace-desc').innerText = options.desc || '소리만 듣고 공책에 받아쓴 뒤 태블릿 카메라나 파일 선택으로 AI 채점해요.';
    document.getElementById('dictation-session-kind').innerText = session.kind === 'practice' ? '연습에서는 문장을 보고 따라 써요' : '문제는 TTS로만 들려요';
    document.getElementById('dictation-main-instruction').innerText = session.kind === 'bank-camera' ? '책이나 공책을 카메라에 비춰 단어를 모아요.' : (session.kind === 'practice' ? '아래 문장을 보고 공책에 따라 써요.' : '공책에 들은 말을 받아써요.');
    document.getElementById('dictation-sub-instruction').innerText = session.kind === 'bank-camera' ? 'OCR + AI 사진 분석 후 AI가 단어만 골라 단어 은행에 넣어요.' : (session.kind === 'practice' ? '연습에는 사진 촬영 채점이 필요 없어요.' : '오른쪽 카메라로 공책을 촬영한 뒤 AI가 문제별로 비교 채점합니다.');
    document.getElementById('dictation-answer-box').classList.add('hidden'); document.getElementById('dictation-answer-text').innerHTML = ''; document.getElementById('dictation-save-btn').classList.add('hidden'); document.getElementById('dictation-next-btn').classList.add('hidden'); document.getElementById('dictation-bank-save-btn').classList.add('hidden'); document.getElementById('dictation-grade-btn').classList.toggle('hidden', session.kind !== 'mission');
    document.getElementById('dictation-photo-hint').innerText = session.kind === 'bank-camera' ? '카메라로 촬영하거나 파일을 선택해 단어를 추출하세요.' : (session.kind === 'practice' ? '연습 모드에서는 공책 사진 탭을 사용하지 않아요.' : '태블릿 카메라 화면을 맞추고 촬영하거나, 컴퓨터에서는 파일을 선택하세요.');
    const input = document.getElementById('dictation-photo-input'), preview = document.getElementById('dictation-photo-preview'), ocr = document.getElementById('dictation-ocr-text'); input.value = ''; preview.src = ''; preview.classList.add('hidden'); ocr.value = '';
    renderDictationSessionList(); showTopLevelSection('dictation-workspace-section'); if (session.kind === 'mission' || session.kind === 'bank-camera') setTimeout(() => window.startDictationCamera(), 120); setTimeout(() => window.playDictationPrompt(), 300);
}
function renderBankList(rootId, items, emptyText) { const root = document.getElementById(rootId); if (!root) return; root.innerHTML = items.length ? items.map((item) => `<div class="rounded-2xl border-2 border-red-100 bg-red-50/40 p-4"><div class="text-lg font-black text-[#2c3e50]">${escapeHtml(item.sentence)}</div><div class="text-xs text-gray-500 font-bold mt-1">오답 ${Number(item.wrongCount || 0)}회 · 정답 ${Number(item.correctCount || 0)}회</div></div>`).join('') : `<div class="text-gray-400 font-bold text-center py-8">${escapeHtml(emptyText)}</div>`; }
function renderMyDictationSection() {
    const label = document.getElementById('my-dictation-progress-label'); if (label) label.innerText = currentUserDictationStep < 0 ? '교과 맞춤쓰기 새싹' : `교과 맞춤쓰기 ${currentUserDictationStep}회 완료`;
    renderBankList('dictation-wrong-bank-list', dictationPortfolio.wrongBank || [], '아직 오답 문장이 없어요.'); renderBankList('dictation-completed-bank-list', dictationPortfolio.completedBank || [], '아직 완료 문장이 없어요.');
    const root = document.getElementById('my-dictation-list'); if (!root) return; const missions = Object.values(dictationPortfolio.missions || {}).sort((a, b) => String(b.savedAt || '').localeCompare(String(a.savedAt || ''))).slice(0, 20);
    root.innerHTML = missions.length ? missions.map((record, index) => {
        const photo = safeImageSource(record.photo);
        return `<div class="korean-embed-card p-5 bg-red-50 border-red-100"><div class="text-sm font-black text-red-500">미션 ${missions.length - index}</div><div class="text-xl font-black text-[#2c3e50]">${Number(record.correctCount || 0)}/${Number(record.total || 0)}개 정답</div><p class="text-sm text-gray-500 mt-1">${escapeHtml(String(record.savedAt || '').slice(0, 10))} · 오답 ${Number(record.wrongCount || 0)}개</p>${photo ? `<img src="${escapeHtml(photo)}" alt="교과 맞춤쓰기 기록" class="w-full h-36 object-contain bg-white rounded-2xl border mt-4">` : ''}</div>`;
    }).join('') : '<div class="text-center text-gray-400 font-bold py-10 md:col-span-2">아직 미션 기록이 없어요.</div>';
}
window.openMyDictationFromDashboard = function() { renderMyDictationSection(); showTopLevelSection('my-dictation-section'); }
window.openTodayDictationActivity = function() { if (isDictationMissionLocked()) { openDictationBankCamera(); return; } configureDictationWorkspace(createDictationMissionSession(), { badge: '오늘의 미션', title: '교과 맞춤쓰기' }); }
window.openLevelDictationActivity = function() { window.openTodayDictationActivity(); }
window.openDictationItem = function() { window.openTodayDictationActivity(); }
window.openAiWordPracticeActivity = function() { window.openDictationPracticeActivity(); }
window.openDictationPracticeActivity = function(filter = 'all') {
    const wrong = filter === 'completed' ? [] : (dictationPortfolio.wrongBank || []); const done = filter === 'wrong' ? [] : (dictationPortfolio.completedBank || []);
    const items = [...wrong, ...done].slice(0, 20).map((item) => ({ sentence: item.sentence, source: item.correctCount >= 3 ? 'completed-bank' : 'wrong-bank' }));
    if (!items.length) { items.push(...(dictationPortfolio.koreanBank?.words || []).slice(0, 10).map((_, i) => ({ sentence: makeSentenceFromWords(dictationPortfolio.koreanBank.words, i), source: 'generated-word' }))); }
    if (!items.length) { showModal('연습할 문장이 아직 없어요. 오늘의 노트 사진을 먼저 찍어 단어 은행을 만들어 주세요.'); openDictationBankCamera(); return; }
    configureDictationWorkspace({ kind: 'practice', items, currentIndex: 0, graded: null, saved: false, startedAt: new Date().toISOString() }, { badge: '교과 맞춤쓰기 연습하기', title: '교과 맞춤쓰기 연습하기', desc: '오답/완료/단어 은행 기반 문장을 보고 따라 써요.' });
}
function stopDictationCamera() {
    if (activeDictationCameraStream) {
        activeDictationCameraStream.getTracks().forEach((track) => track.stop());
        activeDictationCameraStream = null;
    }
}

window.startDictationCamera = async function() {
    const panel = document.getElementById('dictation-camera-panel');
    const video = document.getElementById('dictation-camera-video');
    if (!panel || !video) return;
    panel.classList.remove('hidden');
    if (!navigator.mediaDevices?.getUserMedia) {
        document.getElementById('dictation-photo-hint').innerText = '이 기기에서는 카메라 직접 실행이 어려워요. 아래 파일 선택 버튼으로 사진을 올려주세요.';
        return;
    }
    try {
        stopDictationCamera();
        activeDictationCameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 960, max: 1440 }
            },
            audio: false
        });
        video.srcObject = activeDictationCameraStream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        await video.play();
        document.getElementById('dictation-photo-hint').innerText = '웹사이트 안에서 카메라가 켜졌어요. 화면을 맞춘 뒤 카메라로 촬영을 누르세요.';
    } catch (error) {
        console.warn('dictation camera failed', error);
        document.getElementById('dictation-photo-hint').innerText = '카메라가 자동으로 열리지 않으면 파일 선택으로 이어갈 수 있어요.';
    }
}

window.captureDictationCameraPhoto = function() {
    const video = document.getElementById('dictation-camera-video');
    const canvas = document.getElementById('dictation-camera-canvas');
    if (!video || !canvas || !video.videoWidth) {
        showModal('카메라 화면이 아직 준비되지 않았어요. 잠시 후 다시 눌러주세요.');
        return;
    }
    const size = getDictationPhotoSize(video.videoWidth, video.videoHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d').drawImage(video, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL('image/jpeg', DICTATION_PHOTO_JPEG_QUALITY);
    canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `dictation-bank-${Date.now()}.jpg`, { type: 'image/jpeg' });
        document.getElementById('dictation-photo-hint').innerText = '웹사이트에서 사진을 찍었어요. OCR과 AI 사진 분석을 시작합니다.';
        processDictationPhotoFile(file, dataUrl);
    }, 'image/jpeg', DICTATION_PHOTO_JPEG_QUALITY);
}

function setWordBankCameraStatus(message, isLoading = false) {
    const status = document.getElementById('word-bank-camera-status');
    if (!status) return;
    status.innerText = message;
    status.classList.toggle('is-loading', Boolean(isLoading));
}

function stopWordBankCamera() {
    if (activeWordBankCameraStream) {
        activeWordBankCameraStream.getTracks().forEach((track) => track.stop());
        activeWordBankCameraStream = null;
    }
    const video = document.getElementById('word-bank-camera-video');
    if (video) video.srcObject = null;
}

function resetWordBankCameraModal() {
    pendingWordBankCameraReward = null;
    const preview = document.getElementById('word-bank-camera-preview');
    const video = document.getElementById('word-bank-camera-video');
    const result = document.getElementById('word-bank-camera-result');
    const confirm = document.getElementById('word-bank-camera-confirm-btn');
    const retry = document.getElementById('word-bank-camera-retry-btn');
    const capture = document.getElementById('word-bank-camera-capture-btn');
    const input = document.getElementById('word-bank-photo-input');
    if (preview) { preview.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; preview.classList.add('hidden'); }
    if (video) video.classList.remove('hidden');
    if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
    confirm?.classList.add('hidden');
    retry?.classList.add('hidden');
    if (capture) capture.disabled = false;
    if (input) input.value = '';
    setWordBankCameraStatus('카메라를 준비하고 있어요. 오른쪽 위 📷 버튼을 누르면 촬영돼요.');
}

window.startWordBankCamera = async function startWordBankCamera() {
    const video = document.getElementById('word-bank-camera-video');
    if (!video) return;
    video.classList.remove('hidden');
    if (!navigator.mediaDevices?.getUserMedia) {
        setWordBankCameraStatus('카메라가 자동으로 열리지 않으면 아래 사진 파일 선택으로 이어갈 수 있어요.');
        return;
    }
    try {
        stopWordBankCamera();
        activeWordBankCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280, max: 1920 }, height: { ideal: 960, max: 1440 } },
            audio: false
        });
        video.srcObject = activeWordBankCameraStream;
        video.setAttribute('playsinline', '');
        video.muted = true;
        await video.play();
        setWordBankCameraStatus('카메라가 켜졌어요. 노트가 잘 보이게 맞춘 뒤 오른쪽 위 📷 버튼을 누르세요.');
    } catch (error) {
        console.warn('word bank camera failed', error);
        setWordBankCameraStatus('카메라가 자동으로 열리지 않았어요. 아래 사진 파일 선택으로 오늘의 노트를 올릴 수 있어요.');
    }
}

window.openDictationBankCamera = function openDictationBankCamera() {
    const modal = document.getElementById('word-bank-camera-modal');
    if (!modal) {
        const input = document.getElementById('lesson-photo-input');
        if (input) { input.value = ''; input.click(); }
        return;
    }
    resetWordBankCameraModal();
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => window.startWordBankCamera(), 80);
}

window.closeWordBankCameraModal = function closeWordBankCameraModal() {
    stopWordBankCamera();
    const modal = document.getElementById('word-bank-camera-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('modal-open');
}

function renderWordBankCameraResult(words, duplicateCount = 0) {
    const result = document.getElementById('word-bank-camera-result');
    const confirm = document.getElementById('word-bank-camera-confirm-btn');
    const retry = document.getElementById('word-bank-camera-retry-btn');
    if (!result) return;
    const chips = words.map((word) => `<span>${escapeHtml(word)}</span>`).join('');
    result.innerHTML = `<h4>AI 2차 선별 완료</h4><p class="mb-3">아래 단어들을 단어 은행에 저장했어요.</p><div class="word-bank-camera-chip-list">${chips}</div>${duplicateCount ? `<p class="mt-3 text-xs text-emerald-700">중복 단어 ${duplicateCount}개는 제외했어요.</p>` : ''}<p class="mt-4 text-sm text-emerald-800">확인을 누르면 팝업을 닫고 포인트를 지급해요.</p>`;
    result.classList.remove('hidden');
    confirm?.classList.remove('hidden');
    retry?.classList.remove('hidden');
}

async function processWordBankCameraPhoto(file, previewDataUrl = '') {
    const capture = document.getElementById('word-bank-camera-capture-btn');
    const preview = document.getElementById('word-bank-camera-preview');
    const video = document.getElementById('word-bank-camera-video');
    const confirm = document.getElementById('word-bank-camera-confirm-btn');
    const retry = document.getElementById('word-bank-camera-retry-btn');
    const result = document.getElementById('word-bank-camera-result');
    try {
        if (capture) capture.disabled = true;
        confirm?.classList.add('hidden');
        retry?.classList.add('hidden');
        if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
        setWordBankCameraStatus('로딩중~', true);
        const normalized = await normalizeDictationPhotoFile(file, previewDataUrl);
        const dataUrl = normalized.dataUrl || previewDataUrl || await readImageFileAsDataUrl(normalized.file || file);
        const analysisFile = normalized.file || file;
        if (preview && dataUrl) { preview.src = dataUrl; preview.classList.remove('hidden'); }
        if (video) video.classList.add('hidden');
        setWordBankCameraStatus('OCR+AI 분석중~~', true);
        const [ocrText, aiText] = await Promise.all([runDictationOcr(analysisFile), analyzeDictationImageWithAi(dataUrl)]);
        const combined = ['[OCR]', ocrText, '[AI 사진 분석]', aiText].filter(Boolean).join('\n');
        const aiExtracted = await extractDictationWordsWithAi(combined);
        const candidateWords = Array.from(new Set((aiExtracted.words || []).map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord)));
        const existing = new Set(dictationPortfolio.koreanBank?.words || []);
        const newWords = candidateWords.filter((word) => !existing.has(word));
        const duplicateCount = candidateWords.length - newWords.length;
        if (!candidateWords.length) throw new Error('사진에서 저장할 단어를 찾지 못했어요. 글자가 잘 보이게 다시 찍어주세요.');
        if (!newWords.length) throw new Error(`AI가 고른 단어 ${candidateWords.length}개가 이미 단어 은행에 있어요. 다른 노트를 찍어주세요.`);
        mergeKoreanBank({ words: newWords });
        dictationPortfolio.captures = [{
            source: 'today-note-photo',
            ocrText,
            aiAnalysis: aiText,
            words: candidateWords,
            newWords,
            skippedDuplicateWords: duplicateCount,
            photo: dataUrl,
            savedAt: new Date().toISOString()
        }, ...(dictationPortfolio.captures || [])].slice(0, 20);
        dictationPortfolio.dictationLocked = false;
        await persistDictationData();
        updateDictationDashboardPreview();
        pendingWordBankCameraReward = { ready: true };
        setWordBankCameraStatus('AI 2차 선별이 끝났어요!');
        renderWordBankCameraResult(newWords, duplicateCount);
    } catch (error) {
        console.error('word bank camera photo failed', error);
        setWordBankCameraStatus(error.message || '사진 분석에 실패했어요. 다시 찍어주세요.');
        retry?.classList.remove('hidden');
    } finally {
        if (capture) capture.disabled = false;
    }
}

window.captureWordBankCameraPhoto = function captureWordBankCameraPhoto() {
    const video = document.getElementById('word-bank-camera-video');
    const canvas = document.getElementById('word-bank-camera-canvas');
    if (!video || !canvas || !video.videoWidth) {
        setWordBankCameraStatus('카메라 화면이 아직 준비되지 않았어요. 잠시 후 다시 눌러주세요.');
        return;
    }
    const size = getDictationPhotoSize(video.videoWidth, video.videoHeight);
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext('2d').drawImage(video, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL('image/jpeg', DICTATION_PHOTO_JPEG_QUALITY);
    canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], `word-bank-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
        processWordBankCameraPhoto(file, dataUrl);
    }, 'image/jpeg', DICTATION_PHOTO_JPEG_QUALITY);
}

window.retryWordBankCamera = function retryWordBankCamera() {
    resetWordBankCameraModal();
    window.startWordBankCamera();
}

window.confirmWordBankCameraResult = async function confirmWordBankCameraResult() {
    const confirm = document.getElementById('word-bank-camera-confirm-btn');
    if (confirm) confirm.disabled = true;
    try {
        if (pendingWordBankCameraReward?.ready) {
            setWordBankCameraStatus('포인트 지급중~', true);
            await awardLessonPhotoPoints();
            pendingWordBankCameraReward = null;
        }
        window.closeWordBankCameraModal();
    } catch (error) {
        console.error('lesson photo reward failed', error);
        setWordBankCameraStatus('단어는 저장됐지만 포인트 지급 확인에 실패했어요. 잠시 후 다시 확인을 눌러주세요.');
    } finally {
        if (confirm) confirm.disabled = false;
    }
}

async function runDictationOcr(file) {
    try { if (!window.Tesseract) await new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; script.onload = resolve; script.onerror = reject; document.head.appendChild(script); }); const result = await window.Tesseract.recognize(file, 'kor+eng'); return result?.data?.text?.trim() || ''; } catch (error) { console.warn('dictation OCR failed', error); return ''; }
}

function getAiTextFromResponse(data) {
    return (data?.text || data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n') || '').trim();
}
function parseAiJsonObject(rawText, fallback = {}) {
    try {
        const cleaned = String(rawText || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        return JSON.parse(match ? match[0] : cleaned);
    } catch (error) {
        console.warn('AI JSON parse failed', error, rawText);
        return fallback;
    }
}

async function callKoreanAiGenerate(prompt, options = {}) {
    const body = { prompt, model: options.model || '', printTimeout: options.printTimeout || '2m' };
    if (options.imageBase64) {
        body.imageBase64 = options.imageBase64;
        body.imageMime = options.imageMime || 'image/jpeg';
        body.model = options.model || '';
        body.printTimeout = options.printTimeout || '4m';
    }
    const endpoint = '/korean-ai/generate';
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `AI ${res.status}`);
    return getAiTextFromResponse(data);
}

async function analyzeDictationImageWithAi(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) return '';
    const [header, base64] = dataUrl.split(',');
    const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const prompt = '이 이미지는 초등학생의 오늘의 노트 사진입니다. OCR처럼 글자만 읽지 말고, 이미지 자체를 보고 노트/교과서/칠판/그림에 보이는 한국어 문구, 낱말, 사물 이름, 학습 주제어를 최대한 많이 추출해 주세요. 설명하지 말고 단어와 짧은 문구를 줄바꿈으로만 출력하세요.';
    const text = await callKoreanAiGenerate(prompt, { imageBase64: base64, imageMime: mime, printTimeout: '4m' });
    return text || '';
}

function splitDictationCandidateWords(text) {
    return Array.from(new Set(String(text || '').match(/[가-힣]{2,}/g) || []))
        .map(cleanKoreanWord)
        .filter(isLikelyKoreanNounBankWord)
        .slice(0, 120);
}

async function extractDictationWordsWithAi(text) {
    const existingWords = (dictationPortfolio.koreanBank?.words || []).join(', ');
    const visibleCandidates = splitDictationCandidateWords(text).join(', ') || '없음';
    const prompt = `다음은 오늘의 노트 사진에서 얻은 전체 후보입니다.
- OCR로 읽은 글자
- AI가 사진을 보고 분석한 글자/사물/학습 주제어

이 후보 중에서 초등 단어 은행에 넣을 한국어 명사(단어)만 최종 추출하세요.
반드시 지킬 규칙:
1. 명사/개념어/학습 주제어만 남깁니다.
2. 사람 이름, 학생 이름, 교사 이름, 기관명처럼 개인정보가 될 수 있는 고유명사는 제외합니다.
3. 동사, 형용사, 문장, 조사, 어미, 감탄사, 설명 문구는 제외합니다.
4. 한 글자 조각, 숫자만 있는 값, 의미 없는 OCR 조각은 제외합니다.
5. 중복은 제거합니다.
6. 이미 단어 은행에 있는 단어는 제외합니다.

기존 단어 은행: ${existingWords || '없음'}
화면 후보 단어: ${visibleCandidates}

전체 분석 텍스트:
${text}

반드시 JSON만 출력: {"words":["명사"]}`;
    const raw = await callKoreanAiGenerate(prompt, { printTimeout: '3m' }) || '{}';
    const parsed = parseAiJsonObject(raw, { words: [] });
    return {
        words: Array.from(new Set((Array.isArray(parsed.words) ? parsed.words : []).map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord))),
        raw,
        visibleCandidates: splitDictationCandidateWords(text)
    };
}

const LESSON_PHOTO_POINT_REWARD = 500;
const LESSON_PHOTO_DAILY_REWARD_LIMIT = 3;

function getKoreanDateKey() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).format(new Date());
}

async function awardLessonPhotoPoints() {
    if (!currentUserId) return { rewarded: 0, count: 0, limit: LESSON_PHOTO_DAILY_REWARD_LIMIT };
    const userRef = doc(db, 'users', currentUserId);
    let rewardResult = { rewarded: 0, count: 0, limit: LESSON_PHOTO_DAILY_REWARD_LIMIT };
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(userRef);
        if (!snap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다.');
        const data = snap.data() || {};
        const date = getKoreanDateKey();
        const stored = data.koreanLessonPhotoReward || {};
        const count = stored.date === date ? Math.max(0, Number(stored.count || 0)) : 0;
        const balance = asNumber(data.balance ?? data.coins ?? data.aeduTokens, 0);
        if (count >= LESSON_PHOTO_DAILY_REWARD_LIMIT) {
            rewardResult = { rewarded: 0, count, limit: LESSON_PHOTO_DAILY_REWARD_LIMIT, balance };
            return;
        }
        const nextCount = count + 1;
        const nextBalance = balance + LESSON_PHOTO_POINT_REWARD;
        transaction.update(userRef, {
            balance: nextBalance,
            coins: nextBalance,
            aeduTokens: nextBalance,
            koreanLessonPhotoReward: { date, count: nextCount, lastRewardedAt: new Date().toISOString() },
            updatedAt: serverTimestamp()
        });
        rewardResult = { rewarded: LESSON_PHOTO_POINT_REWARD, count: nextCount, limit: LESSON_PHOTO_DAILY_REWARD_LIMIT, balance: nextBalance };
    });
    if (Number.isFinite(Number(rewardResult.balance))) syncAiedueCraftWallet(Number(rewardResult.balance));
    return rewardResult;
}

function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('사진을 불러오지 못했습니다.'));
        reader.readAsDataURL(file);
    });
}

const DICTATION_PHOTO_MAX_SIDE = 1600;
const DICTATION_PHOTO_JPEG_QUALITY = 0.82;

function getDictationPhotoSize(width, height, maxSide = DICTATION_PHOTO_MAX_SIDE) {
    const safeWidth = Math.max(1, Number(width) || maxSide);
    const safeHeight = Math.max(1, Number(height) || maxSide);
    const scale = Math.min(1, maxSide / Math.max(safeWidth, safeHeight));
    return { width: Math.max(1, Math.round(safeWidth * scale)), height: Math.max(1, Math.round(safeHeight * scale)) };
}

function loadDictationPhotoImage(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('사진 미리보기를 만들지 못했습니다.'));
        image.src = dataUrl;
    });
}

function canvasToJpegBlob(canvas, quality = DICTATION_PHOTO_JPEG_QUALITY) {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('사진을 변환하지 못했습니다.')), 'image/jpeg', quality);
    });
}

async function normalizeDictationPhotoFile(file, preferredDataUrl = '') {
    const sourceDataUrl = preferredDataUrl || await readImageFileAsDataUrl(file);
    if (!sourceDataUrl || !sourceDataUrl.startsWith('data:image/')) return { file, dataUrl: sourceDataUrl || '' };
    const image = await loadDictationPhotoImage(sourceDataUrl);
    const size = getDictationPhotoSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const dataUrl = canvas.toDataURL('image/jpeg', DICTATION_PHOTO_JPEG_QUALITY);
    const blob = await canvasToJpegBlob(canvas);
    const normalizedFile = new File([blob], `dictation-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
    return { file: normalizedFile, dataUrl };
}

window.triggerLessonPhotoCapture = function triggerLessonPhotoCapture() {
    if (typeof window.openDictationBankCamera === 'function') {
        window.openDictationBankCamera();
        return;
    }
    const input = document.getElementById('lesson-photo-input');
    if (!input) return;
    input.value = '';
    input.click();
};

window.handleLessonPhotoCapture = async function handleLessonPhotoCapture(input) {
    const file = input?.files?.[0];
    if (!file) return;
    showActivityLoading('오늘의 노트 사진을 불러오는 중...');
    try {
        const normalized = await normalizeDictationPhotoFile(file);
        const dataUrl = normalized.dataUrl;
        const analysisFile = normalized.file || file;
        showActivityLoading('OCR 글자를 읽고 AI가 사진을 분석하는 중...');
        const [ocrText, aiText] = await Promise.all([runDictationOcr(analysisFile), analyzeDictationImageWithAi(dataUrl)]);
        const combined = ['[OCR 단어]', ocrText, '[AI 사진 분석 단어]', aiText].filter(Boolean).join('\n');
        const visibleCandidates = splitDictationCandidateWords(combined);
        showActivityLoading('AI가 명사 단어만 최종 추출하는 중...');
        const aiExtracted = await extractDictationWordsWithAi(combined);
        const candidateWords = Array.from(new Set((aiExtracted.words || []).map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord)));
        if (!candidateWords.length) {
            hideActivityLoading();
            showModal('사진에서 저장할 명사 단어를 찾지 못했어요. 글자나 수업 자료가 잘 보이게 다시 찍어주세요.');
            return;
        }

        showActivityLoading('단어를 저장하는 중...');
        const existing = new Set(dictationPortfolio.koreanBank?.words || []);
        const newWords = candidateWords.filter((word) => !existing.has(word));
        mergeKoreanBank({ words: newWords });
        dictationPortfolio.captures = [{
            source: 'today-note-photo',
            ocrText,
            aiAnalysis: aiText,
            allCandidateWords: visibleCandidates,
            words: candidateWords,
            newWords,
            savedAt: new Date().toISOString()
        }, ...(dictationPortfolio.captures || [])].slice(0, 20);
        dictationPortfolio.dictationLocked = false;
        await persistDictationData();
        const reward = await awardLessonPhotoPoints();
        updateDictationDashboardPreview();

        hideActivityLoading();
        const rewardText = reward.rewarded
            ? `<div class="mt-5 rounded-2xl bg-yellow-50 px-5 py-4 text-yellow-700 font-black">⭐ ${reward.rewarded}포인트 지급 · 오늘 ${reward.count}/${reward.limit}회</div>`
            : `<div class="mt-5 rounded-2xl bg-gray-100 px-5 py-4 text-gray-600 font-black">오늘 사진 보상 ${reward.limit}회를 모두 받았어요.</div>`;
        const savedText = newWords.length ? `새 단어 ${newWords.length}개를 단어 은행에 저장했어요.` : '이미 단어 은행에 있는 단어들이에요.';
        const candidatePreview = visibleCandidates.slice(0, 40).map((word) => `<span class="px-2 py-1 rounded-full bg-slate-100 text-slate-600 font-bold text-xs">${escapeHtml(word)}</span>`).join('') || '<span class="text-gray-400 text-sm font-bold">후보 단어 없음</span>';
        const finalPreview = candidateWords.map((word) => `<span class="px-3 py-2 rounded-full bg-emerald-50 text-emerald-700 font-black">${escapeHtml(word)}</span>`).join('');
        showModal(`<div class="text-left"><h3 class="text-2xl font-black text-[#2c3e50] mb-2">📷 오늘의 노트 사진 분석 완료</h3><p class="text-gray-500 font-bold mb-4">${savedText}</p><div class="mb-4 rounded-2xl bg-slate-50 p-4"><div class="text-sm font-black text-slate-500 mb-2">OCR 단어 + AI 사진 분석 단어</div><div class="flex flex-wrap gap-2 max-h-32 overflow-y-auto">${candidatePreview}</div></div><div class="rounded-2xl bg-emerald-50/40 p-4"><div class="text-sm font-black text-emerald-700 mb-2">AI가 최종 추출한 명사 단어</div><div class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">${finalPreview}</div></div>${rewardText}</div>`);
    } catch (error) {
        console.error('lesson photo capture failed', error);
        hideActivityLoading();
        showModal(`오늘의 노트 사진을 처리하지 못했어요. AI 사진 분석이 정상 동작하는지 확인해주세요.<br><span class="text-sm text-gray-400">${escapeHtml(error.message || String(error))}</span>`);
    } finally {
        if (input) input.value = '';
    }
};

async function processDictationPhotoFile(file, previewDataUrl = '') {
    activeDictationPhotoDataUrl = '';
    activeDictationImageAnalysis = '';
    const normalized = await normalizeDictationPhotoFile(file, previewDataUrl);
    activeDictationPhotoFile = normalized.file || file;
    const preview = document.getElementById('dictation-photo-preview');
    const setPreview = (src) => { activeDictationPhotoDataUrl = src || ''; preview.src = src; preview.classList.remove('hidden'); };
    const dataUrl = normalized.dataUrl || previewDataUrl || await readImageFileAsDataUrl(activeDictationPhotoFile);
    setPreview(dataUrl);
    const kind = activeDictationSession?.kind;
    if (kind === 'mission') {
        const ocrBox = document.getElementById('dictation-ocr-text');
        if (ocrBox) ocrBox.value = '';
        document.getElementById('dictation-photo-hint').innerText = '공책 사진이 준비됐어요. 채점 버튼을 누르면 AI가 문제 문장과 사진을 직접 비교합니다.';
        return;
    }
    document.getElementById('dictation-photo-hint').innerText = kind === 'bank-camera' ? 'OCR 글자를 읽고, AI가 사진 자체를 분석하고 있어요...' : '사진을 불러왔어요.';
    const [ocrText, aiText] = await Promise.all([runDictationOcr(activeDictationPhotoFile), kind === 'bank-camera' ? analyzeDictationImageWithAi(dataUrl) : Promise.resolve('')]);
    activeDictationImageAnalysis = aiText;
    const combined = ['[OCR 단어]', ocrText, '[AI 사진 분석 단어]', aiText].filter(Boolean).join('\n');
    document.getElementById('dictation-ocr-text').value = combined.trim();
    if (kind === 'bank-camera') {
        const extracted = await extractDictationWordsWithAi(combined);
        const existing = new Set(dictationPortfolio.koreanBank?.words || []);
        const newWords = extracted.words.filter((word) => !existing.has(word));
        const dupCount = extracted.words.length - newWords.length;
        const previewBox = document.getElementById('dictation-ai-word-preview');
        previewBox.classList.remove('hidden');
        const allCandidates = splitDictationCandidateWords(combined);
        previewBox.innerText = `OCR+AI 후보: ${allCandidates.slice(0, 30).join(', ') || '없음'}\n최종 명사 단어: ${newWords.length ? newWords.join(', ') : '새로 넣을 단어 없음'}${dupCount ? ` · 중복 ${dupCount}개 제외` : ''}`;
        document.getElementById('dictation-photo-hint').innerText = 'AI가 명사 단어만 최종 추출했어요. 확인 후 단어 은행에 저장하세요.';
    } else {
        document.getElementById('dictation-photo-hint').innerText = '사진이 올라갔어요.';
    }
}

document.getElementById('dictation-photo-input').addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    await processDictationPhotoFile(file);
});

document.getElementById('word-bank-photo-input')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    await processWordBankCameraPhoto(file);
});

window.saveDictationBankPhoto = async function() {
    const text = document.getElementById('dictation-ocr-text').value;
    const aiExtracted = await extractDictationWordsWithAi(text);
    const candidateWords = Array.from(new Set((aiExtracted.words || []).map(cleanKoreanWord).filter(isLikelyKoreanNounBankWord)));
    const existing = new Set(dictationPortfolio.koreanBank?.words || []);
    const words = candidateWords.filter((word) => !existing.has(word));
    const duplicateCount = candidateWords.length - words.length;
    if (!candidateWords.length) { showModal('AI가 최종 추출한 명사 단어가 없어요. OCR 단어와 AI 사진 분석 단어를 확인하거나 사진을 다시 찍어주세요.'); return; }
    if (!words.length) { showModal(`AI가 추출한 명사 ${candidateWords.length}개는 이미 단어 은행에 있어요. 중복 저장하지 않았어요.`); return; }
    mergeKoreanBank({ words });
    dictationPortfolio.captures = [{ source: 'today-note-photo', text, aiAnalysis: activeDictationImageAnalysis, allCandidateWords: splitDictationCandidateWords(text), words: candidateWords, newWords: words, skippedDuplicateWords: duplicateCount, photo: document.getElementById('dictation-photo-preview').src || '', savedAt: new Date().toISOString() }, ...(dictationPortfolio.captures || [])].slice(0, 20);
    dictationPortfolio.dictationLocked = false;
    await persistDictationData();
    stopDictationCamera();
    showModal(`새 단어 ${words.length}개를 단어 은행에 저장했어요.${duplicateCount > 0 ? ` 중복 단어 ${duplicateCount}개는 제외했어요.` : ''} 교과 맞춤쓰기 잠금이 해제됐어요!`);
}
function normalizeForGrade(text) { return String(text || '').replace(/[^가-힣0-9]/g, '').trim(); }
async function gradeDictationSessionWithAi() {
    if (!activeDictationPhotoDataUrl || !activeDictationPhotoDataUrl.startsWith('data:image/')) throw new Error('공책 사진이 없습니다.');
    const [header, base64] = activeDictationPhotoDataUrl.split(',');
    const mime = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const targets = (activeDictationSession?.items || []).map((item, index) => ({ index: index + 1, sentence: item.sentence }));
    const prompt = `초등학생 교과 맞춤쓰기 공책 사진을 AI 시각 분석으로 채점하세요. OCR 텍스트 추출만 하지 말고, 이미지 속 학생 손글씨를 문제 문항별 정답 문장과 직접 비교하세요. 각 문제 문장이 공책 사진에 정확히 포함되어 있으면 correct=true, 누락/오자/불명확하면 correct=false입니다. 학생이 실제로 쓴 것으로 보이는 답을 written에 적고, analysis에는 1문장으로 근거를 적으세요.

문제 목록(JSON):
${JSON.stringify(targets, null, 2)}

반드시 JSON만 출력하세요. 형식: {"results":[{"index":1,"sentence":"정답 문장","written":"학생이 쓴 답","correct":true,"analysis":"사진에서 어떻게 보였는지"}]}`;
    const raw = await callKoreanAiGenerate(prompt, { imageBase64: base64, imageMime: mime, printTimeout: '4m' });
    activeDictationImageAnalysis = raw || '';
    const parsed = parseAiJsonObject(raw, { results: [] });
    const byIndex = new Map((Array.isArray(parsed.results) ? parsed.results : []).map((item) => [Number(item.index), item]));
    return targets.map((target) => {
        const item = byIndex.get(target.index) || {};
        return {
            sentence: target.sentence,
            source: activeDictationSession.items[target.index - 1]?.source || 'mission',
            written: cleanKoreanSentence(item.written || item.studentAnswer || ''),
            correct: item.correct === true,
            analysis: String(item.analysis || item.reason || '').trim()
        };
    });
}
async function saveMissionGradingResult() {
    if (!activeDictationSession?.graded || activeDictationSession.autoSaved) return;
    const now = new Date().toISOString();
    const photo = document.getElementById('dictation-photo-preview').src;
    upsertWrongOrCompleted(activeDictationSession.graded, now);
    const correctCount = activeDictationSession.graded.filter((item) => item.correct).length;
    currentUserDictationStep += 1;
    dictationPortfolio.hasCompletedOnce = true;
    dictationPortfolio.dictationLocked = false;
    dictationPortfolio.missions = { ...(dictationPortfolio.missions || {}), [now]: { total: activeDictationSession.graded.length, correctCount, wrongCount: activeDictationSession.graded.length - correctCount, items: activeDictationSession.graded, aiAnalysis: activeDictationImageAnalysis, photo, savedAt: now } };

    // --- 교과 맞춤쓰기 사진 AI 분석 경험치 보상 적용 ---
    dictationPortfolio.rewardedDictationSessions = dictationPortfolio.rewardedDictationSessions || [];
    const sessionId = activeDictationSession.startedAt || now;
    if (!dictationPortfolio.rewardedDictationSessions.includes(sessionId)) {
        let accuracy = 0;
        if (typeof activeDictationSession.accuracy === 'number') {
            accuracy = activeDictationSession.accuracy;
        } else if (typeof activeDictationSession.correctRate === 'number') {
            accuracy = activeDictationSession.correctRate * 100;
        } else if (typeof activeDictationSession.score === 'number') {
            accuracy = activeDictationSession.score;
        } else if (activeDictationSession.graded.length > 0) {
            accuracy = (correctCount / activeDictationSession.graded.length) * 100;
        }

        if (accuracy >= 70) {
            const baseExp = 50;
            const multiplier = calculateStageExperienceMultiplier(3);
            const finalExp = baseExp * multiplier;
            if (finalExp > 0) {
                applyAiedueExperienceReward(finalExp, { source: '교과 맞춤쓰기 AI 분석', sessionId, accuracy, baseReward: baseExp, stageMultiplier: multiplier });
            }
        }
        dictationPortfolio.rewardedDictationSessions.push(sessionId);
    }
    // --------------------------------------------------

    activeDictationSession.autoSaved = true;
    await persistDictationData();
}
window.revealDictationAnswer = async function() {
    const preview = document.getElementById('dictation-photo-preview');
    if (!preview.src || !activeDictationPhotoDataUrl) { showModal('공책 사진을 먼저 촬영하거나 파일로 선택해주세요.'); return; }
    if (!activeDictationSession || activeDictationSession.kind !== 'mission') return;
    const gradeBtn = document.getElementById('dictation-grade-btn');
    const originalText = gradeBtn.innerText;
    gradeBtn.disabled = true;
    gradeBtn.innerText = 'AI가 공책 사진을 분석 중...';
    document.getElementById('dictation-photo-hint').innerText = 'AI 분석 중입니다. 문제 문항과 공책 사진을 직접 비교하고 있어요.';
    try {
        activeDictationSession.graded = await gradeDictationSessionWithAi();
        const correctCount = activeDictationSession.graded.filter((item) => item.correct).length;
        document.getElementById('dictation-answer-box').classList.remove('hidden');
        document.getElementById('dictation-answer-text').innerHTML = `<div class="text-red-500 font-black">총 ${correctCount}/${activeDictationSession.graded.length}개 완료</div><p class="mt-2 text-sm text-gray-500 font-bold">왼쪽 문항별 카드에서 정답, 학생이 쓴 답, AI 사진 분석 근거를 확인하세요.</p>`;
        renderDictationSessionList();
        await saveMissionGradingResult();
        document.getElementById('dictation-grade-btn').classList.add('hidden');
        document.getElementById('dictation-next-btn').classList.remove('hidden');
        document.getElementById('dictation-photo-hint').innerText = '채점과 오답/완료 은행 반영이 끝났어요. 다음 문제를 누르면 새 5+5 문제가 나옵니다.';
    } catch (error) {
        console.error('dictation AI grading failed', error);
        showModal(`AI 채점에 실패했어요: ${escapeHtml(error.message || error)}`);
        document.getElementById('dictation-photo-hint').innerText = 'AI 채점에 실패했어요. 사진을 다시 촬영하거나 파일을 다시 선택해주세요.';
    } finally {
        gradeBtn.disabled = false;
        gradeBtn.innerText = originalText;
    }
}
function upsertWrongOrCompleted(result, now) {
    const wrongBank = [...(dictationPortfolio.wrongBank || [])]; const completedBank = [...(dictationPortfolio.completedBank || [])]; const removeFrom = (arr, sentence) => arr.filter((item) => item.sentence !== sentence);
    for (const graded of result) { const sentence = cleanKoreanSentence(graded.sentence); const existingWrong = wrongBank.find((item) => item.sentence === sentence); const existingDone = completedBank.find((item) => item.sentence === sentence);
        if (graded.correct) { const item = existingWrong || existingDone || { sentence, source: graded.source, wrongCount: 0, correctCount: 0, savedAt: now }; item.correctCount = (item.correctCount || 0) + 1; item.lastTriedAt = now; if (item.correctCount >= 3 || !existingWrong) { completedBank.splice(0, completedBank.length, ...removeFrom(completedBank, sentence)); completedBank.unshift(item); wrongBank.splice(0, wrongBank.length, ...removeFrom(wrongBank, sentence)); } else if (existingWrong) { existingWrong.correctCount = item.correctCount; existingWrong.lastTriedAt = now; } }
        else { const item = existingWrong || { sentence, source: graded.source, wrongCount: 0, correctCount: 0, savedAt: now }; item.wrongCount = (item.wrongCount || 0) + 1; item.lastTriedAt = now; if (!existingWrong) wrongBank.unshift(item); completedBank.splice(0, completedBank.length, ...removeFrom(completedBank, sentence)); }
    }
    dictationPortfolio.wrongBank = wrongBank.sort((a, b) => (b.wrongCount || 0) - (a.wrongCount || 0)).slice(0, 100); dictationPortfolio.completedBank = completedBank.slice(0, 150);
}
window.startNextDictationMission = function() {
    configureDictationWorkspace(createDictationMissionSession(), { badge: '오늘의 미션', title: '교과 맞춤쓰기', desc: '단어 은행 기반 10문장을 다시 생성해요.' });
}
window.completeDictationItem = async function() {
    showModal('미션 채점 결과는 AI 채점 직후 자동으로 오답/완료 은행에 저장됩니다.');
}
window.openDictationBankModal = function() { const bank = dictationPortfolio.koreanBank || { words: [] }; showModal(`<div class="text-left"><h3 class="text-2xl font-black text-[#2c3e50] mb-4">단어 은행</h3><div class="mb-4"><div class="font-black text-red-500 mb-2">단어 은행 ${bank.words.length}개</div><div class="flex flex-wrap gap-2 max-h-64 overflow-y-auto">${(bank.words || []).map((word) => `<span class="px-3 py-1 rounded-full bg-red-50 text-red-500 font-bold">${escapeHtml(word)}</span>`).join('') || '<span class="text-gray-400">아직 단어가 없어요.</span>'}</div><p class="text-xs text-gray-400 font-bold mt-4">문장 은행은 사용하지 않아요. 교과 맞춤쓰기/문해력 문장은 단어 은행을 바탕으로 미션 시작 때 생성됩니다.</p></div></div>`); }

window.openFindMistakesActivity = function() { showTopLevelSection('spelling-quiz-section'); generateSpellingQuestion(); }
window.generateSpellingQuestion = async function() { activeSpellingQuestion = await createSpellingQuestion(); const root = document.getElementById('spelling-quiz-options'); document.getElementById('spelling-quiz-feedback').classList.add('hidden'); root.innerHTML = activeSpellingQuestion.options.map((text, index) => `<button type="button" class="btn-choice text-left" onclick="checkSpellingAnswer(${index})">${index + 1}. ${escapeHtml(text)}</button>`).join(''); }
async function createSpellingQuestion() {
    try { const bankWords = (dictationPortfolio.koreanBank?.words || []).slice(0, 10).join(', '); const prompt = `초등학생용 맞춤법/문법 객관식 문제를 JSON으로 만들어줘. 가능하면 다음 단어 은행을 반영해: ${bankWords}. 문항 4개 중 하나만 틀린 문장. 형식 {"options":["","","",""],"answerIndex":0,"reason":""}`; const payload = { contents: [{ role: 'user', parts: [{ text: prompt }]}], generationConfig: { responseMimeType: 'application/json' } }; const res = await fetch('/.netlify/functions/generatePlan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'gemini', payload }) }); if (!res.ok) throw new Error(`generatePlan ${res.status}`); const data = await res.json(); const text = data?.candidates?.[0]?.content?.parts?.[0]?.text; const parsed = JSON.parse(text); if (Array.isArray(parsed.options) && parsed.options.length === 4 && Number.isInteger(parsed.answerIndex)) return parsed; throw new Error('bad spelling quiz'); }
    catch { const fallback = spellingFallbackQuestions[spellingFallbackIndex % spellingFallbackQuestions.length]; spellingFallbackIndex += 1; return fallback; }
}
window.checkSpellingAnswer = function(index) { if (!activeSpellingQuestion) return; const buttons = document.querySelectorAll('#spelling-quiz-options .btn-choice'); buttons.forEach((button, buttonIndex) => { button.disabled = true; if (buttonIndex === activeSpellingQuestion.answerIndex) button.classList.add('!bg-green-100', '!border-green-400'); }); const isCorrect = index === activeSpellingQuestion.answerIndex; const feedback = document.getElementById('spelling-quiz-feedback'); feedback.classList.remove('hidden'); feedback.innerHTML = `<div class="text-xl font-black ${isCorrect ? 'text-green-600' : 'text-red-500'}">${isCorrect ? '정답이에요!' : '아쉬워요. 초록색 문장이 틀린 문장이에요.'}</div><div class="mt-3 text-2xl font-black text-[#2c3e50]">${escapeHtml(activeSpellingQuestion.options[activeSpellingQuestion.answerIndex])}</div><p class="mt-3 text-gray-600 font-bold">${escapeHtml(activeSpellingQuestion.reason || '틀린 부분을 바르게 고쳐 읽어봐요.')}</p>`; }

// --- 에이두 문해력 핵심 로직 ---
function normalizeLiteracyPortfolio(raw = {}, fallbackDan = 1) {
    if (!raw || typeof raw !== 'object') raw = {};
    const history = Array.isArray(raw.history) ? raw.history : [];
    const stats = raw.stats || {};
    const dan = Math.max(1, Math.floor(asNumber(raw.dan, asNumber(fallbackDan, 1))));
    const keys = [
        'easy-multipleChoice', 'easy-shortAnswer', 'easy-essay',
        'normal-multipleChoice', 'normal-shortAnswer', 'normal-essay',
        'hard-multipleChoice', 'hard-shortAnswer', 'hard-essay',
        'expert-multipleChoice', 'expert-shortAnswer', 'expert-essay'
    ];
    keys.forEach(k => {
        if (!stats[k]) {
            stats[k] = { attempts: 0, corrects: 0, wrongs: 0 };
        }
    });
    return { history, stats, dan };
}

async function persistLiteracyData(extra = {}) {
    literacyPortfolio = normalizeLiteracyPortfolio(literacyPortfolio);
    const walletExtra = {
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel
    };
    if (currentUserId) {
        await setDoc(doc(db, 'users', currentUserId), { literacyPortfolio, ...walletExtra, ...extra, updatedAt: serverTimestamp() }, { merge: true });
    }
    updateDashboardExperience({
        name: currentUserName,
        icon: currentUserIcon,
        coins: currentUserCoins,
        role: currentUserRole,
        currentLearningStep,
        currentDrawingStep: currentUserDrawingStep,
        drawingPortfolio,
        currentDictationStep: currentUserDictationStep,
        dictationPortfolio,
        literacyPortfolio
    });
}

function getLiteracyStatFromPortfolio(portfolio, difficulty, type) {
    return portfolio?.stats?.[`${difficulty}-${type}`] || { attempts: 0, corrects: 0, wrongs: 0 };
}

function isLiteracyMasteredInPortfolio(portfolio, difficulty, type) {
    const stat = getLiteracyStatFromPortfolio(portfolio, difficulty, type);
    const threshold = type === 'multipleChoice' ? 0.2 : 0.3;
    const minAttempts = type === 'multipleChoice' ? 10 : 1;
    const wrongRate = stat.attempts ? (stat.wrongs || 0) / stat.attempts : 1;
    return stat.attempts >= minAttempts && wrongRate <= threshold;
}

function getLiteracyStat(difficulty, type) {
    return getLiteracyStatFromPortfolio(literacyPortfolio, difficulty, type);
}

function getLiteracyWrongRate(difficulty, type) {
    const stat = getLiteracyStat(difficulty, type);
    if (!stat.attempts) return 1;
    return (stat.wrongs || 0) / stat.attempts;
}

function isLiteracyMastered(difficulty, type) {
    return isLiteracyMasteredInPortfolio(literacyPortfolio, difficulty, type);
}

function isLiteracyUnlocked(difficulty, type) {
    if (difficulty === 'easy' && type === 'multipleChoice') return true;

    if (type === 'shortAnswer') {
        return isLiteracyMastered(difficulty, 'multipleChoice');
    }
    if (type === 'essay') {
        return isLiteracyMastered(difficulty, 'multipleChoice') && isLiteracyMastered(difficulty, 'shortAnswer');
    }

    const previousDifficulty = { normal: 'easy', hard: 'normal', expert: 'hard' }[difficulty];
    if (type === 'multipleChoice' && previousDifficulty) {
        return isLiteracyMastered(previousDifficulty, 'multipleChoice')
            && isLiteracyMastered(previousDifficulty, 'shortAnswer')
            && isLiteracyMastered(previousDifficulty, 'essay');
    }
    return false;
}

function getLiteracyDanPlan(dan = null) {
    const level = Math.max(1, Math.floor(asNumber(dan ?? literacyPortfolio?.dan ?? currentUserProfileSnapshot?.literacyDan, 1)));
    const cycle = Math.floor((level - 1) / 3);
    const typeStep = (level - 1) % 3;
    const difficulties = ['easy', 'normal', 'hard', 'expert'];
    const difficulty = difficulties[Math.min(cycle, difficulties.length - 1)] || 'expert';
    const types = typeStep === 0 ? ['multipleChoice'] : (typeStep === 1 ? ['multipleChoice', 'shortAnswer'] : ['multipleChoice', 'shortAnswer', 'essay']);
    return { dan: level, difficulty, types, type: types[Math.floor(Math.random() * types.length)] };
}

function advanceLiteracyDanIfReady(targetPortfolio = literacyPortfolio) {
    const previousDan = getLiteracyDanPlan(targetPortfolio?.dan).dan;
    let nextDan = previousDan;

    while (nextDan < 12) {
        const plan = getLiteracyDanPlan(nextDan);
        const requiredType = ['multipleChoice', 'shortAnswer', 'essay'][(nextDan - 1) % 3];
        if (!isLiteracyMasteredInPortfolio(targetPortfolio, plan.difficulty, requiredType)) break;
        nextDan += 1;
    }

    targetPortfolio.dan = nextDan;
    if (nextDan === previousDan) return null;
    return { previousDan, nextDan, nextPlan: getLiteracyDanPlan(nextDan) };
}

function showLiteracyPromotionNotice(promotion) {
    if (!promotion) return;
    const typeNames = { multipleChoice: '객관식', shortAnswer: '단답형', essay: '서술형' };
    const nextTypes = promotion.nextPlan.types.map(type => typeNames[type] || type).join(' · ');
    showAiedueAutoToast(
        `🎉 문해력 ${promotion.nextDan}단 승단!`,
        `이제 ${promotion.nextPlan.difficulty.toUpperCase()} · ${nextTypes} 문제가 나와요.`,
        5000
    );
}
function updateLiteracyDanBadges() {
    const plan = getLiteracyDanPlan();
    const label = `문해력 ${plan.dan}단`;
    const badge = document.getElementById('literacy-dan-dashboard-badge');
    if (badge) badge.innerText = label;
    const desc = document.getElementById('literacy-mission-desc');
    if (desc) desc.innerText = `${label} 기준으로 ${plan.difficulty.toUpperCase()} · ${plan.types.map(t => ({multipleChoice:'객관식', shortAnswer:'단답형', essay:'서술형'}[t] || t)).join('/')} 문제가 자동 출제돼요.`;
}

function chooseRecommendedLiteracyMission() {
    const difficulties = ['easy', 'normal', 'hard', 'expert'];
    for (const difficulty of difficulties) {
        const mcReady = isLiteracyMastered(difficulty, 'multipleChoice');
        const shortReady = isLiteracyMastered(difficulty, 'shortAnswer');
        const essayReady = isLiteracyMastered(difficulty, 'essay');
        if (!mcReady) return { difficulty, type: 'multipleChoice' };
        if (!shortReady) return { difficulty, type: Math.random() < 0.5 ? 'multipleChoice' : 'shortAnswer' };
        if (!essayReady) {
            const pool = ['multipleChoice', 'shortAnswer', 'essay'];
            return { difficulty, type: pool[Math.floor(Math.random() * pool.length)] };
        }
    }
    const pool = ['multipleChoice', 'shortAnswer', 'essay'];
    return { difficulty: 'expert', type: pool[Math.floor(Math.random() * pool.length)] };
}

function updateLiteracyDashboardPreview() {
    literacyPortfolio = normalizeLiteracyPortfolio(literacyPortfolio);
    let totalCorrects = 0;
    let totalWrongs = 0;
    Object.values(literacyPortfolio.stats).forEach(s => {
        totalCorrects += s.corrects || 0;
        totalWrongs += s.wrongs || 0;
    });

    const summary = document.getElementById('literacy-record-summary');
    if (summary) {
        summary.innerText = `정답 ${totalCorrects}개 · 오답 ${totalWrongs}개`;
    }

    const words = dictationPortfolio?.koreanBank?.words?.length || 0;
    const bankSummary = document.getElementById('literacy-korean-bank-summary');
    if (bankSummary) {
        bankSummary.innerText = `단어 ${words}개`;
    }
    updateLiteracyDanBadges();
}

const SHARED_LITERACY_COLLECTION = 'sharedLiteracyWrongBankV2';
const SHARED_LITERACY_DOC_ID = Symbol('sharedLiteracyWrongBankDocId');
const SHARED_LITERACY_PUBLIC_STRING_FIELDS = ['passage', 'question', 'difficulty', 'type', 'answer', 'sampleAnswer', 'explanation'];
const LITERACY_KEYWORD_STOP_WORDS = new Set([
    '그리고', '그러나', '그래서', '때문에', '것이다', '있다', '없다', '하는', '한다', '했다',
    '대한', '통해', '위해', '우리', '학생', '사람', '생각', '내용', '이야기', '문장'
]);

function normalizeLiteracyKeywords(primary = {}, fallback = {}) {
    const supplied = Array.isArray(primary.keywords) && primary.keywords.length
        ? primary.keywords
        : (Array.isArray(fallback.keywords) ? fallback.keywords : []);
    let candidates = supplied;
    if (!candidates.length) {
        const sampleAnswer = String(primary.sampleAnswer ?? fallback.sampleAnswer ?? '');
        candidates = sampleAnswer
            .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
            .split(/\s+/)
            .map((word) => word.trim())
            .filter((word) => word.length >= 2 && !LITERACY_KEYWORD_STOP_WORDS.has(word));
    }
    return Array.from(new Set(candidates
        .map((keyword) => String(keyword).trim())
        .filter((keyword) => keyword.length >= 1 && keyword.length <= 30)))
        .slice(0, 5);
}

async function getSharedLiteracyQuestionId(questionData) {
    if (questionData?.[SHARED_LITERACY_DOC_ID]) return String(questionData[SHARED_LITERACY_DOC_ID]);
    if (!globalThis.crypto?.subtle) throw new Error('보안 해시 기능을 사용할 수 없습니다.');
    const source = `${String(questionData?.passage || '')}\u0000${String(questionData?.question || '')}`;
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `q2_${hex}`;
}

function buildSharedLiteracyPublicQuestion(primary = {}, fallback = {}) {
    const publicQuestion = {};
    SHARED_LITERACY_PUBLIC_STRING_FIELDS.forEach((key) => {
        const value = primary[key] ?? fallback[key];
        if (value !== undefined && value !== null) publicQuestion[key] = String(value);
    });
    const options = Array.isArray(primary.options) ? primary.options : fallback.options;
    if (Array.isArray(options)) publicQuestion.options = options.map((option) => String(option));
    const answerIndex = primary.answerIndex ?? fallback.answerIndex;
    if (answerIndex !== undefined && answerIndex !== null && Number.isInteger(Number(answerIndex))) {
        publicQuestion.answerIndex = Number(answerIndex);
    }
    const keywords = normalizeLiteracyKeywords(primary, fallback);
    if (keywords.length) publicQuestion.keywords = keywords;
    return publicQuestion;
}

function writeWrongToSharedBankTransaction(transaction, questionData, now, docRef, docSnap) {
    if (!docSnap.exists()) {
        transaction.set(docRef, {
            ...buildSharedLiteracyPublicQuestion(questionData),
            attempts: 1,
            corrects: 0,
            wrongs: 1,
            createdAt: now,
            updatedAt: now
        });
        return;
    }
    const previous = docSnap.data();
    transaction.update(docRef, {
        attempts: Math.max(0, Number(previous.attempts) || 0) + 1,
        corrects: Math.max(0, Number(previous.corrects) || 0),
        wrongs: Math.max(0, Number(previous.wrongs) || 0) + 1,
        updatedAt: now
    });
}

async function upsertWrongToSharedBank(questionData) {
    try {
        const id = await getSharedLiteracyQuestionId(questionData);
        const docRef = doc(db, SHARED_LITERACY_COLLECTION, id);
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            writeWrongToSharedBankTransaction(transaction, questionData, new Date().toISOString(), docRef, docSnap);
        });
        return true;
    } catch (e) {
        console.error('Firestore shared wrong-bank transaction failed', e);
        return false;
    }
}

function writeCorrectToSharedBankTransaction(transaction, now, docRef, docSnap) {
    if (!docSnap.exists()) return;
    const data = docSnap.data();
    const attempts = Math.max(0, Number(data.attempts) || 0) + 1;
    const corrects = Math.max(0, Number(data.corrects) || 0) + 1;
    if (attempts >= 20 && corrects / attempts >= 0.5) {
        transaction.delete(docRef);
        return;
    }
    transaction.update(docRef, {
        attempts,
        corrects,
        wrongs: Math.max(0, Number(data.wrongs) || 0),
        updatedAt: now
    });
}

async function updateSharedBankCorrect(questionData) {
    try {
        const id = await getSharedLiteracyQuestionId(questionData);
        const docRef = doc(db, SHARED_LITERACY_COLLECTION, id);
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(docRef);
            writeCorrectToSharedBankTransaction(transaction, new Date().toISOString(), docRef, docSnap);
        });
        return true;
    } catch (e) {
        console.error('Firestore shared bank correct-count transaction failed', e);
        return false;
    }
}

async function getSharedBankProblems(difficulty) {
    try {
        const q = query(collection(db, SHARED_LITERACY_COLLECTION), where('difficulty', '==', difficulty), queryLimit(200));
        const querySnapshot = await getDocs(q);
        const list = [];
        querySnapshot.forEach((doc) => {
            const question = { ...doc.data(), id: doc.id };
            Object.defineProperty(question, SHARED_LITERACY_DOC_ID, { value: doc.id });
            list.push(question);
        });
        return list;
    } catch (e) {
        console.error('Firestore shared bank read failed', e);
        return [];
    }
}

window.openLiteracyLimitBreak = async function() {
    showActivityLoading();
    let currentDifficulty = 'easy';

    async function renderLimitBreakModalContent(diff) {
        currentDifficulty = diff;
        const problems = await getSharedBankProblems(diff);
        const counts = { multipleChoice: 0, shortAnswer: 0, essay: 0 };
        problems.forEach(p => {
            if (counts[p.type] !== undefined) {
                counts[p.type]++;
            }
        });

        const modalHtml = `
            <div class="text-left p-2 font-sans">
                <h3 class="text-3xl font-black text-[#2c3e50] mb-4 flex items-center gap-2">🔥 [도전! 한계 돌파]</h3>
                <p class="text-gray-500 font-bold mb-6">다른 사용자들이 틀린 공용 오답 은행 문제에 도전합니다. 정답률 50% 이상이 되면 은행에서 졸업하여 제거됩니다.</p>

                <div class="mb-6">
                    <label class="block font-black text-gray-700 mb-2">1. 난이도 선택</label>
                    <div class="flex gap-2">
                        ${['easy', 'normal', 'hard', 'expert'].map(d => `
                            <button type="button" class="px-4 py-2 rounded-xl font-black text-lg border-2 ${d === diff ? 'bg-purple-600 border-purple-600 text-white' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-50'} transition-all" onclick="window.changeLimitBreakDifficulty('${d}')">
                                ${d.toUpperCase()}
                            </button>
                        `).join('')}
                    </div>
                </div>

                <div class="mb-6 bg-purple-50 p-6 rounded-2xl border-4 border-purple-100">
                    <label class="block font-black text-purple-700 mb-3">2. 현재 불러온 오답 개수 (최대 200개)</label>
                    <div class="grid grid-cols-3 gap-4 text-center">
                        <div class="bg-white p-3 rounded-xl shadow-sm">
                            <div class="text-xs text-gray-400 font-bold">객관식 (4지선다)</div>
                            <div class="text-2xl font-black text-purple-700 mt-1">${counts.multipleChoice}개</div>
                        </div>
                        <div class="bg-white p-3 rounded-xl shadow-sm">
                            <div class="text-xs text-gray-400 font-bold">단답형</div>
                            <div class="text-2xl font-black text-purple-700 mt-1">${counts.shortAnswer}개</div>
                        </div>
                        <div class="bg-white p-3 rounded-xl shadow-sm">
                            <div class="text-xs text-gray-400 font-bold">서술형</div>
                            <div class="text-2xl font-black text-purple-700 mt-1">${counts.essay}개</div>
                        </div>
                    </div>
                </div>

                <button type="button" class="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-black text-xl rounded-2xl shadow-lg transition-all"
                    ${problems.length === 0 ? 'disabled style="opacity: 0.5;"' : ''}
                    onclick="window.startLimitBreakChallenge('${diff}')">
                    ${problems.length === 0 ? '선택한 난이도에 도전할 오답이 없습니다.' : '한계 돌파 도전 시작!'}
                </button>
            </div>
        `;
        return modalHtml;
    }

    window.changeLimitBreakDifficulty = async function(diff) {
        showActivityLoading();
        const content = await renderLimitBreakModalContent(diff);
        hideActivityLoading();
        showModal(content);
    };

    window.startLimitBreakChallenge = async function(diff) {
        window.handleModalConfirm();
        showActivityLoading();
        const problems = await getSharedBankProblems(diff);
        if (problems.length === 0) {
            hideActivityLoading();
            showModal('도전할 문제가 없습니다.');
            return;
        }
        const randomQuestion = problems[Math.floor(Math.random() * problems.length)];
        hideActivityLoading();
        setupLiteracyWorkspace(randomQuestion, true);
    };

    const initialContent = await renderLimitBreakModalContent('easy');
    hideActivityLoading();
    showModal(initialContent);
};

window.openTodayLiteracyMission = function() {
    const plan = getLiteracyDanPlan();
    window.startTodayLiteracyMission(plan.difficulty, plan.type);
};

window.startTodayLiteracyMission = async function(diff, type) {
    showActivityLoading('문해력 문제 로딩중...');
    try {
        const bankWords = (dictationPortfolio.koreanBank?.words || []).slice(0, 8);
        const prompt = generateLiteracyPrompt(diff, type, bankWords);
        const responseText = await callKoreanAiGenerate(prompt, { printTimeout: '3m' });
        const questionData = parseAiQuestionResponse(responseText);
        if (!questionData || !questionData.passage || !questionData.question) throw new Error("AI가 문해력 문제를 올바르게 생성하지 못했습니다.");
        questionData.difficulty = diff;
        questionData.type = type;
        questionData.literacyDan = getLiteracyDanPlan().dan;
        hideActivityLoading();
        setupLiteracyWorkspace(questionData, false);
    } catch (e) {
        hideActivityLoading();
        console.error(e);
        showModal(`문제 생성에 실패했습니다: ${escapeHtml(e.message || e)}. 다시 시도해 주세요.`);
    }
};

window.nextLiteracyQuestion = function() {
    const plan = getLiteracyDanPlan();
    window.startTodayLiteracyMission(plan.difficulty, plan.type);
};

const AIEDUE_LITERACY_FALLBACK_TOPICS = [
    '학교 방송', '비 오는 등굣길', '도서관 약속', '운동회 준비', '잃어버린 물건 찾기',
    '친구에게 사과하기', '동아리 발표', '가족 여행 일기', '시장 심부름', '새 전학생 맞이'
];
let literacyFallbackTopicIndex = Math.floor(Math.random() * AIEDUE_LITERACY_FALLBACK_TOPICS.length);

function pickLiteracyFallbackTopic() {
    const topic = AIEDUE_LITERACY_FALLBACK_TOPICS[literacyFallbackTopicIndex % AIEDUE_LITERACY_FALLBACK_TOPICS.length];
    literacyFallbackTopicIndex += 1;
    return topic;
}

function generateLiteracyPrompt(difficulty, type, bankWords) {
    const hasBankWords = bankWords.length > 0;
    const sourceGuide = hasBankWords
        ? `3. 단어 은행 반영: 아래 단어를 지문의 중심 소재로 자연스럽게 사용해 주세요.\n   단어 은행: ${bankWords.join(', ')}`
        : `3. 생성 주제: ${pickLiteracyFallbackTopic()}\n   단어 은행이 비어 있으므로 위 주제를 중심 소재로 사용하되, 문제 양식은 현재 에이두 한글 문해력 양식을 그대로 따르세요.`;
    let difficultyGuide = '';
    if (difficulty === 'easy') {
        difficultyGuide = '쉬움: 짧은 한 문단 지문으로, 초등학교 1~2학년이 읽기 쉬운 3문장 내외와 아주 친숙한 단어로 구성해 주세요.';
    } else if (difficulty === 'normal') {
        difficultyGuide = '보통: 한 문단 지문으로, 초등학교 3~4학년 수준의 4~6문장과 일상 및 학업 관련 단어로 구성해 주세요.';
    } else if (difficulty === 'hard') {
        difficultyGuide = '어려움: 2~3문단 지문으로, 초등학교 5~6학년 수준의 설명문/논설문 요소와 추론할 거리를 포함해 주세요.';
    } else if (difficulty === 'expert') {
        difficultyGuide = '매우 어려움: 5문단 이상 긴 지문으로, 중학교 1학년 기초 수준의 논리적 추론·비판적 독해를 요구하도록 구성해 주세요.';
    }

    let typeGuide = '';
    if (type === 'multipleChoice') {
        typeGuide = `지문을 바탕으로 풀 수 있는 객관식(4지선다형) 1문제를 출제해 주세요.
포맷: {"passage": "지문 내용", "question": "문제 내용", "options": ["보기1", "보기2", "보기3", "보기4"], "answerIndex": 0, "explanation": "친절한 해설"}`;
    } else if (type === 'shortAnswer') {
        typeGuide = `지문을 바탕으로 풀 수 있는 단답형(정답이 한 단어 또는 5글자 이내의 짧은 어구인 문제) 1문제를 출제해 주세요.
포맷: {"passage": "지문 내용", "question": "문제 내용", "answer": "단답형 정답", "explanation": "친절한 해설"}`;
    } else if (type === 'essay') {
        const easyEssayGuide = difficulty === 'easy'
            ? '지문에서 바로 찾을 수 있거나 친숙하게 생각할 수 있는 아주 쉬운 질문으로 만들고, 학생이 쉬운 낱말을 사용한 한 문장으로 충분히 답할 수 있게 하세요. 모범 답안도 반드시 짧고 쉬운 한 문장으로 작성하세요.'
            : difficulty === 'normal'
                ? '지문의 핵심 내용이나 이유 한 가지만 묻는 쉬운 질문으로 만들고, 학생이 근거 하나를 담은 한 문장으로 충분히 답할 수 있게 하세요. 모범 답안도 반드시 한 문장으로 작성하세요.'
                : '지문을 바탕으로 자신의 생각이나 논리적 근거를 서술하는 생각해볼 만한 질문으로 만드세요.';
        typeGuide = `서술형 1문제를 출제해 주세요. ${easyEssayGuide}
모든 난이도에서 학생에게 미리 보여 줄 핵심어를 3~5개 제공하세요. keywords의 모든 항목은 sampleAnswer에 실제로 들어 있거나 그 의미에 직접 대응하는 핵심 낱말/짧은 어구여야 합니다.
포맷: {"passage": "지문 내용", "question": "문제 내용", "sampleAnswer": "난이도 지시에 맞는 모범 답안", "keywords": ["핵심어1", "핵심어2", "핵심어3"], "explanation": "채점 기준 및 해설"}`;
    }

    return `당신은 초등/중등 국어 문해력 전문 교사입니다.
다음 조건에 따라 흥미롭고 유익한 읽기 지문 1개와 관련 문제 1개를 JSON으로 출제해 주세요.

[조건]
1. 난이도: ${difficulty.toUpperCase()}
   - 난이도 기준: ${difficultyGuide}
2. 문제 유형: ${type === 'multipleChoice' ? '객관식' : type === 'shortAnswer' ? '단답형' : '서술형'}
   - 문제 유형 기준: ${typeGuide}
${sourceGuide}

반드시 백틱(\`\`\`)이나 JSON 이외의 잡다한 설명은 포함하지 말고, 순수한 JSON 텍스트만 출력하세요.`;
}

function parseAiQuestionResponse(rawText) {
    try {
        const cleaned = String(rawText || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        return JSON.parse(match ? match[0] : cleaned);
    } catch (error) {
        console.warn('AI literacy question parse failed', error, rawText);
        return null;
    }
}

function setupLiteracyWorkspace(questionData, isLimitBreak = false) {
    activeLiteracyQuestion = questionData;
    isLiteracyLimitBreakMode = isLimitBreak;
    userLiteracyAnswerChecked = false;

    showTopLevelSection('literacy-workspace-section');

    document.getElementById('literacy-passage-difficulty').innerText = questionData.difficulty.toUpperCase();
    document.getElementById('literacy-passage-content').innerText = questionData.passage;
    document.getElementById('literacy-question-content').innerText = questionData.question;
    const keywordContainer = document.getElementById('literacy-keywords-container');
    if (keywordContainer) {
        keywordContainer.classList.add('hidden');
        keywordContainer.innerHTML = '';
    }
    updateLiteracyDanBadges();

    const typeLabel = document.getElementById('literacy-question-type');
    const typeNames = { multipleChoice: '객관식 (4지선다)', shortAnswer: '단답형', essay: '서술형' };
    typeLabel.innerText = typeNames[questionData.type] || '문제';

    document.getElementById('literacy-options-container').classList.add('hidden');
    document.getElementById('literacy-short-answer-container').classList.add('hidden');
    document.getElementById('literacy-essay-container').classList.add('hidden');
    document.getElementById('literacy-feedback-container').classList.add('hidden');

    document.getElementById('literacy-short-input').value = '';
    document.getElementById('literacy-essay-input').value = '';

    if (questionData.type === 'multipleChoice') {
        const optContainer = document.getElementById('literacy-options-container');
        optContainer.classList.remove('hidden');
        optContainer.innerHTML = (questionData.options || []).map((opt, idx) => `
            <button type="button" class="btn-choice w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 font-bold text-lg transition-all"
                onclick="window.selectLiteracyMultipleChoice(${idx})">
                ${idx + 1}. ${escapeHtml(opt)}
            </button>
        `).join('');
    } else if (questionData.type === 'shortAnswer') {
        document.getElementById('literacy-short-answer-container').classList.remove('hidden');
    } else if (questionData.type === 'essay') {
        document.getElementById('literacy-essay-container').classList.remove('hidden');
        const keywords = normalizeLiteracyKeywords(questionData);
        questionData.keywords = keywords;
        if (keywordContainer && keywords.length) {
            keywordContainer.classList.remove('hidden');
            keywordContainer.innerHTML = `<div class="text-sm font-black text-amber-700 mb-2">💡 답변에 넣어 보면 좋은 핵심어</div><div class="flex flex-wrap gap-2">${keywords.map((keyword) => `<span class="px-3 py-1.5 rounded-full bg-white border-2 border-amber-200 text-amber-800 font-black">${escapeHtml(keyword)}</span>`).join('')}</div>`;
        }
        const essayInput = document.getElementById('literacy-essay-input');
        if (essayInput) {
            essayInput.placeholder = ['easy', 'normal'].includes(String(questionData.difficulty).toLowerCase())
                ? '핵심어를 참고해 한 문장으로 답해 보세요.'
                : '핵심어와 근거를 활용해 답해 보세요. AI가 채점합니다.';
        }
    }
}

window.selectLiteracyMultipleChoice = function(index) {
    if (userLiteracyAnswerChecked) return;
    userLiteracyAnswerChecked = true;
    const isCorrect = index === activeLiteracyQuestion.answerIndex;
    showLiteracyResult(isCorrect, {
        correctAnswerText: activeLiteracyQuestion.options[activeLiteracyQuestion.answerIndex],
        userAnswerText: activeLiteracyQuestion.options[index]
    });
};

window.submitLiteracyShortAnswer = function() {
    if (userLiteracyAnswerChecked) return;
    const input = document.getElementById('literacy-short-input').value.trim();
    if (!input) {
        showModal('답안을 입력해 주세요!');
        return;
    }
    userLiteracyAnswerChecked = true;
    const cleanAnswer = String(activeLiteracyQuestion.answer).replace(/\s+/g, '').toLowerCase();
    const cleanUser = input.replace(/\s+/g, '').toLowerCase();
    const isCorrect = cleanAnswer === cleanUser || cleanUser.includes(cleanAnswer) || cleanAnswer.includes(cleanUser);
    showLiteracyResult(isCorrect, {
        correctAnswerText: activeLiteracyQuestion.answer,
        userAnswerText: input
    });
};

window.submitLiteracyEssayAnswer = async function() {
    if (userLiteracyAnswerChecked) return;
    const input = document.getElementById('literacy-essay-input').value.trim();
    if (!input) {
        showModal('생각을 적어주세요!');
        return;
    }
    userLiteracyAnswerChecked = true;
    showActivityLoading();
    try {
        const essayDifficulty = String(activeLiteracyQuestion.difficulty || 'easy').toLowerCase();
        const essayKeywords = normalizeLiteracyKeywords(activeLiteracyQuestion);
        const prompt = `지문: ${activeLiteracyQuestion.passage}
난이도: ${essayDifficulty}
질문: ${activeLiteracyQuestion.question}
예시답안: ${activeLiteracyQuestion.sampleAnswer}
학생에게 제공된 핵심어: ${essayKeywords.join(', ')}
학생답안: ${input}

위 학생답안을 예시답안을 기준으로 100점 만점으로 정밀하게 채점해 주세요.
지문 내용과 부합하는지, 그리고 핵심 의도를 파악하고 작성했는지 평가하세요.
핵심어는 문자 그대로 같지 않아도 동의어나 같은 뜻의 표현이면 인정하세요.
${['easy', 'normal'].includes(essayDifficulty) ? '이 문제는 한 문장 답변용입니다. 한 문장 안에 핵심 의미가 들어 있으면 충분하며, 답이 짧다는 이유만으로 감점하지 마세요.' : '근거와 논리적 연결을 충분히 갖추었는지 평가하세요.'}
반드시 백틱이나 다른 군더더기 없이 다음 JSON 형식만 반환하세요: {"score": 85, "feedback": "여기에 채점 총평 및 친절한 피드백을 적으세요."}`;

        const responseText = await callKoreanAiGenerate(prompt, { printTimeout: '3m' });
        const cleaned = String(responseText || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        const parsed = JSON.parse(match ? match[0] : cleaned);
        const score = Number(parsed.score) || 0;
        const feedback = parsed.feedback || '채점을 완료했습니다.';
        hideActivityLoading();
        const isCorrect = score >= 80;
        await showLiteracyResult(isCorrect, {
            score: score,
            feedback: feedback,
            correctAnswerText: activeLiteracyQuestion.sampleAnswer,
            userAnswerText: input
        });
    } catch (e) {
        userLiteracyAnswerChecked = false;
        hideActivityLoading();
        console.error(e);
        showModal(`서술형 채점 또는 결과 저장 중 오류가 발생했습니다: ${escapeHtml(e.message || e)}. 다시 시도해 주세요.`);
    }
};

function cloneLiteracyValue(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeLiteracyScore(value) {
    if (value === null || value === undefined || value === '') return null;
    const score = Number(value);
    return Number.isFinite(score) ? score : null;
}

function createLiteracyAttemptPayload(isCorrect, details) {
    if (!activeLiteracyQuestion.pendingLiteracyAttemptId) {
        const randomId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        activeLiteracyQuestion.pendingLiteracyAttemptId = `literacy-attempt-${randomId}`;
    }
    const question = buildSharedLiteracyPublicQuestion(activeLiteracyQuestion);
    if (activeLiteracyQuestion?.[SHARED_LITERACY_DOC_ID]) {
        Object.defineProperty(question, SHARED_LITERACY_DOC_ID, { value: String(activeLiteracyQuestion[SHARED_LITERACY_DOC_ID]) });
    }
    const difficulty = String(question.difficulty || 'easy');
    const type = String(question.type || 'multipleChoice');
    const difficultyKey = difficulty.toLowerCase();
    const typeKey = type.toLowerCase();
    const diffMult = difficultyKey === 'easy' || difficultyKey === '쉬움' ? 2
        : difficultyKey === 'hard' || difficultyKey === '어려움' ? 4
            : difficultyKey === 'expert' || difficultyKey === '매우 어려움' || difficultyKey === '매우어려움' ? 5 : 3;
    const typeMult = typeKey === 'shortanswer' || typeKey === '단답형' ? 7
        : typeKey === 'essay' || typeKey === '서술형' ? 10 : 5;
    const stageMultiplier = Math.max(calculateStageExperienceMultiplier(4), 1);
    const limitBreak = Boolean(isLiteracyLimitBreakMode);
    return Object.freeze({
        attemptId: String(activeLiteracyQuestion.pendingLiteracyAttemptId),
        userId: String(currentUserId || ''),
        question,
        isCorrect: Boolean(isCorrect),
        isLimitBreakMode: limitBreak,
        difficulty,
        type,
        solvedAt: new Date().toISOString(),
        userAnswerText: String(details.userAnswerText ?? ''),
        score: normalizeLiteracyScore(details.score),
        feedback: String(details.feedback || ''),
        correctAnswerText: String(details.correctAnswerText ?? ''),
        pointReward: isCorrect ? 5 : 0,
        baseExperience: isCorrect ? diffMult * typeMult * (limitBreak ? 2 : 1) : 0,
        stageMultiplier,
        experienceReward: isCorrect ? diffMult * typeMult * (limitBreak ? 2 : 1) * stageMultiplier : 0,
        fallback: {
            literacyPortfolio: cloneLiteracyValue(literacyPortfolio),
            literacyDan: literacyPortfolio?.dan,
            studentName: currentUserProfileSnapshot?.name || currentUserName || '학생',
            koreanActivityLog: cloneLiteracyValue(currentUserProfileSnapshot?.koreanActivityLog || []),
            coins: currentUserCoins,
            balance: currentUserBalance,
            aeduTokens: currentUserAeduTokens,
            warningTokens: currentUserWarningTokens,
            aeduExperience: currentUserAeduExperience,
            aeduLevel: currentUserAeduLevel
        }
    });
}

function buildLiteracyServerState(serverData, fallback) {
    const rawPortfolio = serverData.literacyPortfolio ?? fallback.literacyPortfolio;
    const literacyPortfolio = normalizeLiteracyPortfolio(
        cloneLiteracyValue(rawPortfolio || {}),
        serverData.literacyDan ?? fallback.literacyDan
    );
    const balance = asNumber(
        serverData.balance ?? serverData.coins ?? serverData.aeduTokens ?? fallback.balance ?? fallback.coins,
        0
    );
    const aeduTokens = asNumber(serverData.aeduTokens ?? serverData.aeduToken ?? balance, balance);
    const warningTokens = Math.max(0, Math.floor(asNumber(serverData.warningTokens, fallback.warningTokens)));
    const normalizedLevel = normalizeAiedueLevelExperience({
        aeduExperience: serverData.aeduExperience ?? serverData.experience ?? serverData.exp ?? fallback.aeduExperience,
        aeduLevel: serverData.aeduLevel ?? serverData.level ?? serverData.schoolLevel ?? fallback.aeduLevel
    });
    return {
        literacyPortfolio,
        literacyDan: literacyPortfolio.dan,
        coins: balance,
        balance,
        aeduTokens,
        warningTokens,
        aeduExperience: normalizedLevel.aeduExperience,
        aeduLevel: normalizedLevel.aeduLevel,
        studentName: String(serverData.name || fallback.studentName || currentUserName || '학생'),
        koreanActivityLog: cloneLiteracyValue(Array.isArray(serverData.koreanActivityLog) ? serverData.koreanActivityLog : (fallback.koreanActivityLog || []))
    };
}

function applyLiteracyWalletReward(base, pointReward, experienceReward) {
    let balance = base.balance + pointReward;
    let coins = balance;
    let aeduTokens = base.aeduTokens + pointReward;
    let warningTokens = base.warningTokens;
    let aeduExperience = base.aeduExperience + Math.max(0, experienceReward);
    let aeduLevel = base.aeduLevel;
    let levelUpCount = 0;
    while (aeduExperience >= 100) {
        aeduExperience -= 100;
        levelUpCount += 1;
    }
    aeduExperience = Math.min(99.999, Math.max(0, parseFloat(aeduExperience.toFixed(3))));
    const removedWarningTokens = Math.min(warningTokens, levelUpCount);
    warningTokens -= removedWarningTokens;
    aeduLevel += levelUpCount;
    const levelUpPoints = levelUpCount * AIEDUE_LEVEL_UP_POINT_REWARD;
    balance += levelUpPoints;
    coins = balance;
    aeduTokens += levelUpPoints;
    return {
        ...base,
        coins,
        balance,
        aeduTokens,
        warningTokens,
        aeduExperience,
        aeduLevel,
        levelUpCount,
        removedWarningTokens
    };
}

function mergeLiteracyAttemptWithServer(serverData, attempt) {
    const base = buildLiteracyServerState(serverData, attempt.fallback);
    const portfolio = base.literacyPortfolio;
    const statKey = `${attempt.difficulty}-${attempt.type}`;
    if (!portfolio.stats[statKey]) portfolio.stats[statKey] = { attempts: 0, corrects: 0, wrongs: 0 };
    portfolio.stats[statKey].attempts = Math.max(0, Number(portfolio.stats[statKey].attempts) || 0) + 1;
    if (attempt.isCorrect) {
        portfolio.stats[statKey].corrects = Math.max(0, Number(portfolio.stats[statKey].corrects) || 0) + 1;
    } else {
        portfolio.stats[statKey].wrongs = Math.max(0, Number(portfolio.stats[statKey].wrongs) || 0) + 1;
    }
    portfolio.history = [
        {
            passage: attempt.question.passage,
            question: attempt.question.question,
            difficulty: attempt.difficulty,
            type: attempt.type,
            isCorrect: attempt.isCorrect,
            userAnswer: attempt.userAnswerText,
            score: attempt.score,
            solvedAt: attempt.solvedAt
        },
        ...portfolio.history
    ].slice(0, 50);
    const promotion = advanceLiteracyDanIfReady(portfolio);
    const rewarded = applyLiteracyWalletReward(base, attempt.pointReward, attempt.experienceReward);
    const levelUpPoints = Math.max(0, rewarded.aeduLevel - base.aeduLevel) * AIEDUE_LEVEL_UP_POINT_REWARD;
    const activityMessage = `${base.studentName}이 문해력 ${attempt.difficulty} ${attempt.type} 활동을 통해 기본 경험치 ${asNumber(attempt.baseExperience, 0).toFixed(1)}%의 ${Math.round(asNumber(attempt.stageMultiplier, 1) * 100)}%인 ${asNumber(attempt.experienceReward, 0).toFixed(1)}%를 받았다.${rewarded.levelUpCount > 0 ? ` 레벨 ${base.aeduLevel}에서 ${rewarded.aeduLevel}으로 레벨업하며 돈 ${levelUpPoints.toLocaleString()}점이 지급되고 주의토큰 ${rewarded.removedWarningTokens}개가 감소되었다.` : ''}`;
    const koreanActivityLog = attempt.experienceReward > 0
        ? [{ id: `literacy_${attempt.attemptId}`, type: 'experience', source: '문해력 활동', baseExperience: attempt.baseExperience, multiplier: attempt.stageMultiplier, grantedExperience: attempt.experienceReward, levelBefore: base.aeduLevel, levelAfter: rewarded.aeduLevel, levelUpPoints, warningTokensReduced: rewarded.removedWarningTokens, createdAtMs: Date.now(), message: activityMessage }, ...base.koreanActivityLog].slice(0, 200)
        : base.koreanActivityLog;
    return {
        ...rewarded,
        koreanActivityLog,
        literacyPortfolio: portfolio,
        literacyDan: portfolio.dan,
        promotion,
        duplicate: false
    };
}

async function persistLiteracyAttemptAtomic(attempt) {
    if (!attempt.userId) throw new Error('로그인 정보를 확인할 수 없습니다.');
    const userRef = doc(db, 'users', attempt.userId);
    const receiptRef = doc(db, 'users', attempt.userId, 'literacyAttemptReceipts', attempt.attemptId);
    const needsSharedBank = !attempt.isCorrect || attempt.isLimitBreakMode;
    const sharedRef = needsSharedBank
        ? doc(db, SHARED_LITERACY_COLLECTION, await getSharedLiteracyQuestionId(attempt.question))
        : null;
    const now = attempt.solvedAt;

    return runTransaction(db, async (transaction) => {
        const sharedSnap = sharedRef ? await transaction.get(sharedRef) : null;
        const receiptSnap = await transaction.get(receiptRef);
        const userSnap = await transaction.get(userRef);
        if (receiptSnap.exists()) {
            const base = buildLiteracyServerState(userSnap.exists() ? userSnap.data() : {}, attempt.fallback);
            const receipt = receiptSnap.data() || {};
            const canonicalAttempt = Object.freeze({
                ...attempt,
                isCorrect: Boolean(receipt.isCorrect),
                solvedAt: String(receipt.solvedAt || attempt.solvedAt),
                userAnswerText: String(receipt.userAnswerText ?? ''),
                score: Number(receipt.score) >= 0 ? Number(receipt.score) : null,
                feedback: String(receipt.feedback || ''),
                correctAnswerText: String(receipt.correctAnswerText ?? '')
            });
            return { ...base, promotion: null, levelUpCount: 0, removedWarningTokens: 0, duplicate: true, canonicalAttempt };
        }
        const committed = mergeLiteracyAttemptWithServer(userSnap.exists() ? userSnap.data() : {}, attempt);

        if (!attempt.isCorrect) {
            writeWrongToSharedBankTransaction(transaction, attempt.question, now, sharedRef, sharedSnap);
        } else if (attempt.isLimitBreakMode) {
            writeCorrectToSharedBankTransaction(transaction, now, sharedRef, sharedSnap);
        }
        transaction.set(userRef, {
            literacyPortfolio: committed.literacyPortfolio,
            coins: committed.coins,
            balance: committed.balance,
            aeduTokens: committed.aeduTokens,
            warningTokens: committed.warningTokens,
            aeduExperience: committed.aeduExperience,
            aeduLevel: committed.aeduLevel,
            koreanActivityLog: committed.koreanActivityLog,
            literacyDan: committed.literacyDan,
            updatedAt: serverTimestamp()
        }, { merge: true });
        transaction.set(receiptRef, {
            userId: attempt.userId,
            attemptId: attempt.attemptId,
            type: 'literacy-attempt',
            isCorrect: attempt.isCorrect,
            solvedAt: attempt.solvedAt,
            userAnswerText: attempt.userAnswerText,
            score: attempt.score === null ? -1 : attempt.score,
            feedback: attempt.feedback,
            correctAnswerText: attempt.correctAnswerText,
            createdAt: serverTimestamp()
        });
        return { ...committed, canonicalAttempt: attempt };
    });
}

async function persistLiteracyReviewRewardAtomic({ claimId, userId, experienceReward, baseExperience = 2, stageMultiplier = 1, fallback }) {
    if (!claimId || !userId) throw new Error('복습 보상 정보를 확인할 수 없습니다.');
    const userRef = doc(db, 'users', userId);
    const receiptRef = doc(db, 'users', userId, 'literacyReviewReceipts', claimId);
    return runTransaction(db, async (transaction) => {
        const receiptSnap = await transaction.get(receiptRef);
        const userSnap = await transaction.get(userRef);
        const base = buildLiteracyServerState(userSnap.exists() ? userSnap.data() : {}, fallback);
        if (receiptSnap.exists()) {
            return { ...base, levelUpCount: 0, removedWarningTokens: 0, duplicate: true };
        }
        const committed = applyLiteracyWalletReward(base, 0, experienceReward);
        const levelUpPoints = Math.max(0, committed.aeduLevel - base.aeduLevel) * AIEDUE_LEVEL_UP_POINT_REWARD;
        const activityMessage = `${base.studentName}이 문해력 오답 복습을 통해 기본 경험치 ${asNumber(baseExperience, 0).toFixed(1)}%의 ${Math.round(asNumber(stageMultiplier, 1) * 100)}%인 ${asNumber(experienceReward, 0).toFixed(1)}%를 받았다.${committed.levelUpCount > 0 ? ` 레벨 ${base.aeduLevel}에서 ${committed.aeduLevel}으로 레벨업하며 돈 ${levelUpPoints.toLocaleString()}점이 지급되고 주의토큰 ${committed.removedWarningTokens}개가 감소되었다.` : ''}`;
        committed.koreanActivityLog = [{ id: `literacy_review_${claimId}`, type: 'experience', source: '문해력 오답 복습', baseExperience, multiplier: stageMultiplier, grantedExperience: experienceReward, levelBefore: base.aeduLevel, levelAfter: committed.aeduLevel, levelUpPoints, warningTokensReduced: committed.removedWarningTokens, createdAtMs: Date.now(), message: activityMessage }, ...base.koreanActivityLog].slice(0, 200);
        transaction.set(userRef, {
            coins: committed.coins,
            balance: committed.balance,
            aeduTokens: committed.aeduTokens,
            warningTokens: committed.warningTokens,
            aeduExperience: committed.aeduExperience,
            aeduLevel: committed.aeduLevel,
            koreanActivityLog: committed.koreanActivityLog,
            updatedAt: serverTimestamp()
        }, { merge: true });
        transaction.set(receiptRef, {
            userId,
            claimId,
            type: 'literacy-review',
            createdAt: serverTimestamp()
        });
        return { ...committed, duplicate: false };
    });
}

function applyCommittedLiteracyAttempt(committed) {
    literacyPortfolio = committed.literacyPortfolio;
    currentUserCoins = committed.coins;
    currentUserBalance = committed.balance;
    currentUserAeduTokens = committed.aeduTokens;
    currentUserWarningTokens = committed.warningTokens;
    currentUserAeduExperience = committed.aeduExperience;
    currentUserAeduLevel = committed.aeduLevel;
    currentUserProfileSnapshot = {
        ...(currentUserProfileSnapshot || {}),
        literacyPortfolio,
        literacyDan: committed.literacyDan,
        coins: currentUserCoins,
        balance: currentUserBalance,
        aeduTokens: currentUserAeduTokens,
        warningTokens: currentUserWarningTokens,
        aeduExperience: currentUserAeduExperience,
        aeduLevel: currentUserAeduLevel,
        koreanActivityLog: committed.koreanActivityLog || currentUserProfileSnapshot?.koreanActivityLog || []
    };
    const coinsEl = document.getElementById('dashboard-coins');
    if (coinsEl) coinsEl.innerText = currentUserCoins;
    const coinsHeaderEl = document.getElementById('dashboard-coins-header');
    if (coinsHeaderEl) coinsHeaderEl.innerText = currentUserCoins;
    updateSyncedActivityHeaders({ name: currentUserName, coins: currentUserCoins, icon: currentUserIcon });
    updateLiteracyDanBadges();
}

async function showLiteracyResult(isCorrect, details) {
    const answeredQuestion = activeLiteracyQuestion;
    const displayDetails = Object.freeze({
        score: normalizeLiteracyScore(details.score),
        feedback: String(details.feedback || ''),
        correctAnswerText: String(details.correctAnswerText ?? ''),
        userAnswerText: String(details.userAnswerText ?? '')
    });
    let committed;
    let attempt;
    try {
        attempt = createLiteracyAttemptPayload(isCorrect, displayDetails);
        committed = await persistLiteracyAttemptAtomic(attempt);
    } catch (error) {
        userLiteracyAnswerChecked = false;
        console.error('문해력 공용 은행/개인 기록 원자적 저장 실패', error);
        showModal(`결과 저장에 실패해 공용 은행과 나의 기록 모두 반영하지 않았어요: ${escapeHtml(error.message || error)}. 잠시 후 다시 시도해 주세요.`);
        return false;
    }

    answeredQuestion.pendingLiteracyAttemptId = null;
    try {
        applyCommittedLiteracyAttempt(committed);
        if (activeLiteracyQuestion !== answeredQuestion) return true;

        const renderedAttempt = committed.canonicalAttempt || attempt;
        const renderedDetails = Object.freeze({
            score: renderedAttempt.score,
            feedback: String(renderedAttempt.feedback || ''),
            correctAnswerText: String(renderedAttempt.correctAnswerText ?? ''),
            userAnswerText: String(renderedAttempt.userAnswerText ?? '')
        });
        const hasScore = renderedDetails.score !== null && Number.isFinite(Number(renderedDetails.score));

        const feedbackContainer = document.getElementById('literacy-feedback-container');
        const title = document.getElementById('literacy-feedback-title');
        const detail = document.getElementById('literacy-feedback-detail');
        const explanation = document.getElementById('literacy-feedback-explanation');
        feedbackContainer.classList.remove('hidden');
        if (renderedAttempt.isCorrect) {
            title.innerText = hasScore ? `⭕ 정답 (AI 채점: ${renderedDetails.score}점)` : '⭕ 정답입니다!';
            title.className = 'text-2xl font-black text-green-600';
            detail.innerText = renderedDetails.feedback || `답안: ${renderedDetails.userAnswerText}`;
        } else {
            title.innerText = hasScore ? `❌ 아쉬워요 (AI 채점: ${renderedDetails.score}점)` : '❌ 아쉬워요';
            title.className = 'text-2xl font-black text-red-500';
            detail.innerText = renderedDetails.feedback
                ? `${renderedDetails.feedback}\n\n[모범 답안]: ${renderedDetails.correctAnswerText}`
                : `작성 답안: ${renderedDetails.userAnswerText}\n[올바른 정답]: ${renderedDetails.correctAnswerText}`;
        }
        feedbackContainer.style.borderColor = renderedAttempt.isCorrect ? '#bbf7d0' : '#fecaca';
        feedbackContainer.style.backgroundColor = renderedAttempt.isCorrect ? '#f0fdf4' : '#fef2f2';
        explanation.innerText = `💡 해설:\n${renderedAttempt.question.explanation || '지문을 다시 읽고 이해해 보세요.'}`;

        if (!renderedAttempt.isCorrect) {
            const claimId = `review-${renderedAttempt.attemptId}`;
            answeredQuestion.pendingReviewRewardId = claimId;
            let left = 60;
            const renderClaim = () => {
                const extra = document.getElementById('literacy-wrong-review-reward');
                if (!extra) return;
                extra.innerHTML = left > 0
                    ? `<button type="button" class="mt-4 w-full py-3 bg-gray-200 text-gray-500 font-black rounded-2xl" disabled>예시 답안 확인 후 경험치 받기 (${left}초)</button>`
                    : `<button type="button" class="mt-4 w-full py-3 bg-orange-500 text-white font-black rounded-2xl" onclick="claimLiteracyWrongReviewReward('${claimId}')">예시 답안을 따라 확인하고 경험치 받기</button>`;
            };
            explanation.insertAdjacentHTML('beforeend', '<div id="literacy-wrong-review-reward"></div>');
            renderClaim();
            const timer = window.setInterval(() => { left -= 1; renderClaim(); if (left <= 0) window.clearInterval(timer); }, 1000);
        }

        showLiteracyPromotionNotice(committed.promotion);
        if (committed.levelUpCount > 0) {
            showModal(`🎉 축하합니다! 레벨업했습니다!\nLv. ${committed.aeduLevel} (보상 ${committed.levelUpCount * AIEDUE_LEVEL_UP_POINT_REWARD}포인트${committed.removedWarningTokens ? ` · 주의토큰 ${committed.removedWarningTokens}개 차감` : ''})`);
        }
    } catch (uiError) {
        console.error('문해력 결과 저장 후 화면 갱신 실패', uiError);
        showModal('결과 저장은 완료했지만 화면 갱신 중 오류가 발생했어요. 새로고침하면 저장된 기록을 확인할 수 있습니다.');
    }
    return true;
}

window.claimLiteracyWrongReviewReward = async function(claimId) {
    const answeredQuestion = activeLiteracyQuestion;
    if (!answeredQuestion || answeredQuestion.pendingReviewRewardId !== claimId || answeredQuestion.reviewRewardClaimed) return;
    answeredQuestion.reviewRewardClaimed = true;
    const stageMultiplier = Math.max(calculateStageExperienceMultiplier(4), 1);
    const finalExp = 2 * stageMultiplier;
    const box = document.getElementById('literacy-wrong-review-reward');
    if (box) box.innerHTML = '<button type="button" class="mt-4 w-full py-3 bg-gray-200 text-gray-500 font-black rounded-2xl" disabled><span class="button-loading-spinner"></span>복습 경험치 저장 중...</button>';
    try {
        const committed = await persistLiteracyReviewRewardAtomic({
            claimId,
            userId: currentUserId,
            experienceReward: finalExp,
            baseExperience: 2,
            stageMultiplier,
            fallback: {
                literacyPortfolio: cloneLiteracyValue(literacyPortfolio),
                literacyDan: literacyPortfolio?.dan,
                studentName: currentUserProfileSnapshot?.name || currentUserName || '학생',
                koreanActivityLog: cloneLiteracyValue(currentUserProfileSnapshot?.koreanActivityLog || []),
                coins: currentUserCoins,
                balance: currentUserBalance,
                aeduTokens: currentUserAeduTokens,
                warningTokens: currentUserWarningTokens,
                aeduExperience: currentUserAeduExperience,
                aeduLevel: currentUserAeduLevel
            }
        });
        applyCommittedLiteracyAttempt(committed);
        answeredQuestion.pendingReviewRewardId = null;
        if (box) box.innerHTML = `<div class="mt-4 p-3 bg-orange-50 text-orange-600 font-black rounded-2xl text-center">${committed.duplicate ? '이미 받은 복습 경험치예요.' : '오답은 그대로 기록되고, 복습 경험치만 받았어요!'}</div>`;
        if (committed.levelUpCount > 0) {
            showModal(`🎉 축하합니다! 레벨업했습니다!\nLv. ${committed.aeduLevel} (보상 ${committed.levelUpCount * AIEDUE_LEVEL_UP_POINT_REWARD}포인트${committed.removedWarningTokens ? ` · 주의토큰 ${committed.removedWarningTokens}개 차감` : ''})`);
        }
    } catch (error) {
        answeredQuestion.reviewRewardClaimed = false;
        console.error('문해력 오답 복습 경험치 저장 실패', error);
        if (box) box.innerHTML = `<button type="button" class="mt-4 w-full py-3 bg-orange-500 text-white font-black rounded-2xl" onclick="claimLiteracyWrongReviewReward('${escapeHtml(claimId)}')">저장에 실패했어요. 다시 받기</button>`;
    }
}

window.openMyLiteracyRecord = function() {
    const history = literacyPortfolio.history || [];
    const stats = literacyPortfolio.stats || {};

    const statsHtml = Object.keys(stats).map(k => {
        const s = stats[k];
        if (s.attempts === 0) return '';
        const rate = Math.round((s.corrects / s.attempts) * 100);
        const [diff, type] = k.split('-');
        const typeNames = { multipleChoice: '객관식', shortAnswer: '단답형', essay: '서술형' };
        return `
            <div class="bg-gray-50 p-3 rounded-xl border border-gray-200 text-sm">
                <div class="font-black text-gray-700">${escapeHtml(diff.toUpperCase())} - ${escapeHtml(typeNames[type] || type)}</div>
                <div class="mt-1 font-bold text-gray-500">도전: ${Number(s.attempts || 0)}회 | 정답: ${Number(s.corrects || 0)}회 (${Number.isFinite(rate) ? rate : 0}%)</div>
            </div>
        `;
    }).filter(Boolean).join('');

    const historyHtml = history.map((h, i) => {
        const date = new Date(h.solvedAt).toLocaleDateString();
        const typeNames = { multipleChoice: '객관식', shortAnswer: '단답형', essay: '서술형' };
        return `
            <div class="p-4 rounded-xl border-2 ${h.isCorrect ? 'border-green-100 bg-green-50/50' : 'border-red-100 bg-red-50/50'} text-left">
                <div class="flex justify-between items-center mb-1">
                    <span class="font-black text-[#2c3e50]">${h.isCorrect ? '⭕ 정답' : '❌ 오답'} (${escapeHtml(String(h.difficulty || '').toUpperCase())} - ${escapeHtml(typeNames[h.type] || h.type || '문제')})</span>
                    <span class="text-xs text-gray-400 font-bold">${escapeHtml(date)}</span>
                </div>
                <p class="text-sm font-bold text-gray-600 line-clamp-1 mb-1">지문: ${escapeHtml(h.passage || '')}</p>
                <p class="text-base font-black text-gray-800">질문: ${escapeHtml(h.question || '')}</p>
                <p class="text-sm text-gray-500 font-bold mt-1">입력한 답안: ${escapeHtml(h.userAnswer || '(없음)')} ${h.score ? `| AI점수: ${Number(h.score) || 0}점` : ''}</p>
            </div>
        `;
    }).join('') || '<div class="text-gray-400 text-center py-8">아직 푼 문해력 문제가 없어요.</div>';

    const msg = `
        <div class="text-left p-2 max-h-[70vh] overflow-y-auto custom-scrollbar font-sans">
            <h3 class="text-3xl font-black text-[#2c3e50] mb-4">📚 나의 문해력 기록</h3>

            <div class="mb-6">
                <h4 class="font-black text-gray-700 mb-2">유형/난이도별 통계</h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${statsHtml || '<div class="text-gray-400 text-sm font-bold">통계 데이터가 아직 없습니다.</div>'}
                </div>
            </div>

            <div>
                <h4 class="font-black text-gray-700 mb-2">최근 학습 이력 (최대 50개)</h4>
                <div class="space-y-3 font-sans">
                    ${historyHtml}
                </div>
            </div>
        </div>
    `;
    showModal(msg);
};

window.closeEmbeddedActivity = function closeEmbeddedActivity() {
    goHangulDashboard();
}

let embeddedInitialized = false;
function initializeEmbeddedActivities() {
    if (embeddedInitialized) return;
    embeddedInitialized = true;

    initializeLetterWritingActivity();
    initializeWordWritingQuizActivity();
    initializeListeningQuizActivity();
    initializeHangulSoundGame();
}

function resizeCanvasForDisplay(canvas, ctx) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width, height: rect.height };
}

function initializeLetterWritingActivity() {
    const consonants = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ','ㄲ','ㄸ','ㅃ','ㅆ','ㅉ'];
    const vowels = ['ㅏ','ㅑ','ㅓ','ㅕ','ㅗ','ㅛ','ㅜ','ㅠ','ㅡ','ㅣ','ㅐ','ㅔ','ㅒ','ㅖ','ㅘ','ㅙ','ㅚ','ㅝ','ㅞ','ㅟ','ㅢ'];
    const fallbackWords = [
        '가','나','다','라','마','바','사','아','자','차','카','타','파','하',
        '가가','가나','나다','다라','라마','마바','바사','사아','아자','자차','차카','카타','타파','파하',
        '아이','가수','가지','나무','마차','기타','고기','다리','나비','파리','허리',
        '치즈','모기','주스','스키','피아노','포도','소파','꼬마','소나무','거미','저고리','야구','여우','우유','의사','의자',
        '과자','사과','돼지','거위','더위','추위','우표','튜브','바위','소녀'
    ];
    const cleanPracticeWord = (value) => String(value || '').replace(/[^\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣ]/g, '');
    const hasNoBatchim = (value) => Array.from(String(value || '')).every((char) => {
        const code = char.charCodeAt(0);
        if (code < 0xAC00 || code > 0xD7A3) return true;
        return (code - 0xAC00) % 28 === 0;
    });
    const allPracticeWords = [...fallbackWords];
    const collectPracticeWord = (value) => {
        const word = cleanPracticeWord(value);
        if (word && hasNoBatchim(word) && !allPracticeWords.includes(word)) allPracticeWords.push(word);
    };
    const lessonBank = window.CHANCHAN_LESSONS || (typeof CHANCHAN_LESSONS !== 'undefined' ? CHANCHAN_LESSONS : []);
    lessonBank.forEach((lesson) => {
        (lesson.words || []).forEach(collectPracticeWord);
        (lesson.nonsenseWords || []).forEach(collectPracticeWord);
        (lesson.pictureItems || []).forEach((item) => collectPracticeWord(item.word));
        (lesson.fillItems || []).forEach((item) => {
            collectPracticeWord(item.word);
            collectPracticeWord(item.answer);
        });
    });
    const words = allPracticeWords.sort((a, b) => a.localeCompare(b, 'ko'));
    const canvas = document.getElementById('letter-writing-canvas');
    let currentChar = 'ㄱ';
    let currentLetterKind = 'consonant';

    const setTraceGuide = (value, kind = currentLetterKind, options = {}) => {
        currentChar = value;
        currentLetterKind = kind;
        canvas.dataset.guide = value;
        canvas.dataset.spokenText = value;
        delete canvas.dataset.traceSpokenPrompt;
        canvas._traceCompleted = {};
        canvas._tracePaths = [];
        delete canvas.dataset.rewarded;
        initializeTraceWritingCanvas(canvas);
        drawTraceWritingGuide(canvas);
        const feedback = document.getElementById('letter-feedback');
        if (feedback) feedback.textContent = '';
        if (options.speak !== false) {
            speakTextKo(value);
            canvas.dataset.traceSpokenPrompt = value;
        }
    };

    const drawButtons = (target, list, kind) => {
        const root = document.getElementById(target);
        if (!root) return;
        root.innerHTML = list.map((c) => `<button type="button" class="btn-outline px-3 py-1 text-base ${c === currentChar ? 'active' : ''}" data-char="${escapeHtml(c)}" data-kind="${kind}">${escapeHtml(c)}</button>`).join('');
        root.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('#letter-consonants button, #letter-vowels button, #letter-words button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                setTraceGuide(btn.dataset.char, btn.dataset.kind);
            });
        });
    };

    drawButtons('letter-consonants', consonants, 'consonant');
    drawButtons('letter-vowels', vowels, 'vowel');
    const renderWordButtons = (query = '') => {
        const normalized = cleanPracticeWord(query);
        const filtered = normalized ? words.filter((word) => word.includes(normalized)) : words;
        drawButtons('letter-words', filtered, 'practice-word');
        const count = document.getElementById('letter-word-count');
        if (count) count.textContent = normalized ? `${filtered.length}/${words.length}개` : `${words.length}개`;
    };
    renderWordButtons();
    document.getElementById('letter-word-filter')?.addEventListener('input', (event) => renderWordButtons(event.target.value));
    document.querySelectorAll('[data-letter-kind]').forEach((button) => {
        button.addEventListener('click', () => {
            const kind = button.dataset.letterKind;
            document.querySelectorAll('[data-letter-kind]').forEach((item) => item.classList.toggle('active', item === button));
            document.querySelectorAll('[data-letter-kind-panel]').forEach((panel) => {
                panel.classList.toggle('hidden', panel.dataset.letterKindPanel !== kind);
            });
            const firstButton = document.querySelector(`[data-letter-kind-panel="${kind}"] button[data-char]`);
            if (firstButton) firstButton.click();
        });
    });
    setTraceGuide(currentChar, currentLetterKind, { speak: false });
    window.refreshLetterWritingCanvas = () => setTraceGuide(currentChar, currentLetterKind, { speak: false });
    window.addEventListener('resize', () => drawTraceWritingGuide(canvas));

    document.getElementById('letter-clear').addEventListener('click', () => resetTraceWritingCanvas(canvas));
    document.getElementById('letter-play-sound').addEventListener('click', () => {
        speakTextKo(currentChar);
        canvas.dataset.traceSpokenPrompt = currentChar;
    });

    const waitForNextWritingPrompt = (milliseconds = 900) => new Promise((resolve) => {
        window.setTimeout(resolve, milliseconds);
    });

    async function advanceAfterSuccessfulWriting(button, nextPrompt) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        await waitForNextWritingPrompt();
        nextPrompt();
        button.disabled = false;
        button.removeAttribute('aria-busy');
    }

    function advanceLetterWritingPrompt() {
        const panel = document.querySelector(`[data-letter-kind-panel="${currentLetterKind}"]`);
        const buttons = Array.from(panel?.querySelectorAll('button[data-char]') || []);
        if (!buttons.length) return;
        const currentIndex = buttons.findIndex((button) => button.dataset.char === currentChar);
        const nextButton = buttons[(currentIndex + 1 + buttons.length) % buttons.length];
        nextButton?.click();
    }

    async function gradeCompletedWriting({ targetCanvas, button, feedback, reward, attempt }) {
        if (!isTraceWritingComplete(targetCanvas)) {
            feedback.className = 'text-center text-xl font-black mt-3 min-h-[2rem] text-orange-500';
            feedback.textContent = '주황색 획을 순서대로 모두 따라 쓴 뒤 채점해 주세요.';
            return false;
        }
        if (targetCanvas.dataset.rewarded === 'true' || targetCanvas.dataset.rewarded === 'pending') {
            feedback.className = 'text-center text-xl font-black mt-3 min-h-[2rem] text-teal-600';
            feedback.textContent = '이 쓰기는 이미 채점했어요. 새 글자를 골라 연습해 보세요.';
            return false;
        }

        targetCanvas.dataset.rewarded = 'pending';
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        feedback.className = 'text-center text-xl font-black mt-3 min-h-[2rem] text-teal-600';
        feedback.textContent = '참 잘 썼어요! 경험치를 옮기고 있어요.';
        try {
            await recordKoreanAttempt({
                lessonId: currentLearningActivityStep || attempt.lessonId,
                lessonTitle: attempt.lessonTitle,
                unitId: getUnitIdForLesson(currentLearningActivityStep) || null,
                activityType: 'writeOnCanvas',
                word: attempt.word,
                isCorrect: true,
                errorType: null,
                skillTags: attempt.skillTags || []
            });
            const rewardResult = await awardKoreanPracticeExperience(reward, targetCanvas, {
                source: 'hangul-writing',
                practiceType: attempt.practiceType,
                word: attempt.word
            });
            targetCanvas.dataset.rewarded = 'true';
            feedback.className = 'text-center text-2xl font-black mt-3 min-h-[2rem] text-green-600';
            feedback.textContent = `참 잘했어요! 경험치 +${Number(asNumber(rewardResult.grantedExperience, 0).toFixed(2))}%`;
            return true;
        } catch (error) {
            console.warn('한글 쓰기 채점 실패', error);
            delete targetCanvas.dataset.rewarded;
            feedback.className = 'text-center text-xl font-black mt-3 min-h-[2rem] text-red-500';
            feedback.textContent = '채점 기록을 저장하지 못했어요. 잠시 후 다시 눌러 주세요.';
            return false;
        } finally {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        }
    }

    const letterGradeButton = document.getElementById('letter-grade');
    letterGradeButton.addEventListener('click', async () => {
        const reward = currentLetterKind === 'practice-word' ? 2 : 1;
        const kindLabel = currentLetterKind === 'practice-word' ? '낱말' : (currentLetterKind === 'vowel' ? '모음' : '자음');
        const completed = await gradeCompletedWriting({
            targetCanvas: canvas,
            button: letterGradeButton,
            feedback: document.getElementById('letter-feedback'),
            reward,
            attempt: {
                lessonId: 'letter-writing',
                lessonTitle: `${kindLabel} 쓰기 연습`,
                word: currentChar,
                practiceType: currentLetterKind,
                skillTags: ['글자쓰기', kindLabel]
            }
        });
        if (completed) await advanceAfterSuccessfulWriting(letterGradeButton, advanceLetterWritingPrompt);
    });

    document.querySelectorAll('.letter-top-btn').forEach((btn) => btn.addEventListener('click', () => {
        document.querySelectorAll('.letter-top-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const c = btn.dataset.category;
        const titleMap = {
            letter: ['자음 쓰기', '자음을 골라 획순대로 따라 써요.'],
            word: ['낱말 쓰기', '받침 없는 낱말을 골라 따라 써요.'],
            sentence: ['문장 쓰기', '문장을 골라 따라 써요.']
        };
        const title = document.getElementById('letter-writing-title');
        const subtitle = document.getElementById('letter-writing-subtitle');
        if (title && titleMap[c]) title.textContent = titleMap[c][0];
        if (subtitle && titleMap[c]) subtitle.textContent = titleMap[c][1];
        document.getElementById('letter-practice-panel').classList.toggle('hidden', c !== 'letter');
        document.getElementById('letter-word-panel').classList.toggle('hidden', c !== 'word');
        document.getElementById('letter-sentence-panel').classList.toggle('hidden', c !== 'sentence');
        requestAnimationFrame(() => {
            if (c === 'letter') drawTraceWritingGuide(canvas);
            if (c === 'word') drawTraceWritingGuide(document.getElementById('letter-word-writing-canvas'));
            if (c === 'sentence') drawTraceWritingGuide(document.getElementById('letter-sentence-writing-canvas'));
        });
    }));

    const levelLabels = { low: '하', mid: '중', high: '상' };
    const wordExamplesByLevel = {
        low: ['가나', '나비', '바다', '사과', '오리', '모기', '고기', '포도', '우유', '기차', '바지', '소리'],
        mid: ['나무', '토끼', '거미', '다리미', '주머니', '어머니', '아버지', '바구니', '개나리', '도토리', '라디오', '피아노'],
        high: ['바나나', '피아노', '라디오', '아버지', '카메라', '고구마', '코끼리', '비디오', '기러기', '해바라기', '오디오', '파프리카']
    };
    const sentenceExamplesByLevel = {
        low: ['나는 가요.', '나무가 커요.', '사과를 먹어요.', '물이 맑아요.', '해가 떠요.', '새가 날아요.', '비가 와요.', '꽃이 피어요.', '아기가 웃어요.', '친구가 와요.', '우유를 마셔요.', '공을 차요.'],
        mid: ['나는 학교에 가요.', '하늘이 참 맑아요.', '친구와 같이 놀아요.', '나무 아래에서 쉬어요.', '동생과 그림을 그려요.', '아침에 우유를 마셔요.', '공원에서 자전거를 타요.', '선생님께 인사를 해요.', '고양이가 창밖을 보아요.', '가족과 함께 밥을 먹어요.', '도서관에서 책을 빌려요.', '운동장에서 공을 차요.'],
        high: ['사과를 맛있게 먹어요.', '오늘은 기분이 좋아요.', '도서관에서 책을 읽어요.', '궁금한 것을 질문해요.', '친구에게 고마운 마음을 전해요.', '아침 햇살이 교실을 환하게 비춰요.', '주말에는 가족과 공원을 산책해요.', '읽은 책의 내용을 차근차근 말해요.', '비가 그친 뒤 무지개가 떠올랐어요.', '동생과 장난감을 사이좋게 나누어요.', '학교 화단에 예쁜 꽃이 피었어요.', '약속 시간을 지키려고 일찍 출발해요.']
    };
    const embeddedPracticeState = {
        word: { level: 'low', text: wordExamplesByLevel.low[0] },
        sentence: { level: 'low', text: sentenceExamplesByLevel.low[0] }
    };

    function speakKorean(text) {
        speakTextKo(text);
    }

    function splitSentenceForPractice(text) {
        const words = String(text || '').trim().split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        if (words.length === 1) {
            const chars = Array.from(words[0]);
            const middle = Math.max(1, Math.ceil(chars.length / 2));
            return [chars.slice(0, middle).join(''), chars.slice(middle).join('')].filter(Boolean);
        }

        let bestBreak = 1;
        let smallestDifference = Number.POSITIVE_INFINITY;
        for (let index = 1; index < words.length; index += 1) {
            const firstLength = Array.from(words.slice(0, index).join('')).length;
            const secondLength = Array.from(words.slice(index).join('')).length;
            const difference = Math.abs(firstLength - secondLength);
            if (difference < smallestDifference) {
                smallestDifference = difference;
                bestBreak = index;
            }
        }
        return [words.slice(0, bestBreak).join(' '), words.slice(bestBreak).join(' ')];
    }

    function writingGuideForPractice(text, keepTogether = false) {
        if (keepTogether) {
            return splitSentenceForPractice(text)
                .map((line) => line.replace(/[^\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣㆍ●]/g, ''))
                .filter(Boolean)
                .join('/');
        }
        const cleaned = String(text || '').replace(/[^\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣㆍ●\s]/g, '').trim();
        return cleaned.split(/\s+/).filter(Boolean).join('/');
    }

    function setEmbeddedPractice(kind, text, options = {}) {
        const state = embeddedPracticeState[kind];
        state.text = text;
        const output = document.getElementById(`letter-${kind}-output`);
        const feedback = document.getElementById(`letter-${kind}-feedback`);
        const canvas = document.getElementById(`letter-${kind}-writing-canvas`);
        if (output && kind === 'sentence') {
            const lines = splitSentenceForPractice(text);
            output.replaceChildren(...lines.map((line) => {
                const span = document.createElement('span');
                span.className = 'sentence-practice-line';
                span.textContent = line;
                return span;
            }));
        } else if (output) {
            output.textContent = text;
        }
        if (feedback) feedback.textContent = '';
        if (canvas) {
            canvas.dataset.guide = writingGuideForPractice(text, kind === 'sentence');
            canvas.dataset.spokenText = text;
            delete canvas.dataset.traceSpokenPrompt;
            canvas._traceCompleted = {};
            canvas._tracePaths = [];
            delete canvas.dataset.rewarded;
            initializeTraceWritingCanvas(canvas);
            drawTraceWritingGuide(canvas);
        }
        document.querySelectorAll(`#letter-${kind}-examples button`).forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.text === text);
        });
        if (options.speak !== false) {
            speakKorean(text);
            if (canvas) canvas.dataset.traceSpokenPrompt = text;
        }
    }

    function renderEmbeddedPracticeLevels(kind) {
        const root = document.getElementById(`letter-${kind}-level-tabs`);
        root.innerHTML = Object.entries(levelLabels).map(([level, label]) => `
            <button type="button" class="btn-outline px-4 py-1 text-sm ${embeddedPracticeState[kind].level === level ? 'active' : ''}" data-kind="${kind}" data-level="${level}">${label}</button>
        `).join('');
        root.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                embeddedPracticeState[kind].level = btn.dataset.level;
                renderEmbeddedPractice(kind);
            });
        });
    }

    function renderEmbeddedPractice(kind) {
        const examples = kind === 'word' ? wordExamplesByLevel : sentenceExamplesByLevel;
        const root = document.getElementById(`letter-${kind}-examples`);
        const level = embeddedPracticeState[kind].level;
        const list = examples[level] || [];
        renderEmbeddedPracticeLevels(kind);
        if (root) {
            root.innerHTML = list.map((text, index) => `
                <button type="button" class="btn-outline py-3 px-4 ${kind === 'word' ? 'text-xl' : 'text-lg text-left'} ${index === 0 ? 'active' : ''}" data-text="${escapeHtml(text)}">${escapeHtml(text)}</button>
            `).join('');
            root.querySelectorAll('button').forEach((btn) => {
                btn.addEventListener('click', () => setEmbeddedPractice(kind, btn.dataset.text));
            });
        }
        const current = embeddedPracticeState[kind].text;
        const candidates = list.filter((text) => text !== current);
        const next = candidates.length
            ? candidates[Math.floor(Math.random() * candidates.length)]
            : (list[0] || '');
        setEmbeddedPractice(kind, next, { speak: false });
    }

    function pickDifferentPracticeItem(items, currentText = '') {
        const candidates = items.filter((item) => item !== currentText);
        const pool = candidates.length ? candidates : items;
        return pool[Math.floor(Math.random() * pool.length)] || items[0] || '';
    }

    document.getElementById('letter-generate-word').addEventListener('click', () => {
        const button = document.getElementById('letter-generate-word');
        const level = embeddedPracticeState.word.level;
        const examples = wordExamplesByLevel[level] || wordExamplesByLevel.low;
        setEmbeddedPractice('word', pickDifferentPracticeItem(examples, embeddedPracticeState.word.text));
        button.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(.985)' }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' }
        );
    });
    document.getElementById('letter-generate-sentence').addEventListener('click', () => {
        const button = document.getElementById('letter-generate-sentence');
        const level = embeddedPracticeState.sentence.level;
        const previous = embeddedPracticeState.sentence.text;
        const examples = sentenceExamplesByLevel[level] || sentenceExamplesByLevel.low;
        setEmbeddedPractice('sentence', pickDifferentPracticeItem(examples, previous));
        button.animate(
            [{ transform: 'scale(1)' }, { transform: 'scale(.985)' }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'ease-out' }
        );
    });
    document.getElementById('letter-word-play-sound').addEventListener('click', () => {
        speakKorean(embeddedPracticeState.word.text);
        document.getElementById('letter-word-writing-canvas').dataset.traceSpokenPrompt = embeddedPracticeState.word.text;
    });
    document.getElementById('letter-sentence-play-sound').addEventListener('click', () => {
        speakKorean(embeddedPracticeState.sentence.text);
        document.getElementById('letter-sentence-writing-canvas').dataset.traceSpokenPrompt = embeddedPracticeState.sentence.text;
    });
    document.getElementById('letter-word-clear').addEventListener('click', () => resetTraceWritingCanvas(document.getElementById('letter-word-writing-canvas')));
    document.getElementById('letter-sentence-clear').addEventListener('click', () => resetTraceWritingCanvas(document.getElementById('letter-sentence-writing-canvas')));
    const wordGradeButton = document.getElementById('letter-word-grade');
    const sentenceGradeButton = document.getElementById('letter-sentence-grade');
    wordGradeButton.addEventListener('click', async () => {
        const completed = await gradeCompletedWriting({
            targetCanvas: document.getElementById('letter-word-writing-canvas'),
            button: wordGradeButton,
            feedback: document.getElementById('letter-word-feedback'),
            reward: 5,
            attempt: {
                lessonId: 'word-practice-writing',
                lessonTitle: '단어 연습 쓰기',
                word: embeddedPracticeState.word.text,
                practiceType: 'word',
                skillTags: ['단어쓰기', embeddedPracticeState.word.level]
            }
        });
        if (!completed) return;
        await advanceAfterSuccessfulWriting(wordGradeButton, () => {
            const examples = wordExamplesByLevel[embeddedPracticeState.word.level] || wordExamplesByLevel.low;
            setEmbeddedPractice('word', pickDifferentPracticeItem(examples, embeddedPracticeState.word.text));
        });
    });
    sentenceGradeButton.addEventListener('click', async () => {
        const completed = await gradeCompletedWriting({
            targetCanvas: document.getElementById('letter-sentence-writing-canvas'),
            button: sentenceGradeButton,
            feedback: document.getElementById('letter-sentence-feedback'),
            reward: 10,
            attempt: {
                lessonId: 'sentence-practice-writing',
                lessonTitle: '문장 연습 쓰기',
                word: embeddedPracticeState.sentence.text,
                practiceType: 'sentence',
                skillTags: ['문장쓰기', embeddedPracticeState.sentence.level]
            }
        });
        if (!completed) return;
        await advanceAfterSuccessfulWriting(sentenceGradeButton, () => {
            const examples = sentenceExamplesByLevel[embeddedPracticeState.sentence.level] || sentenceExamplesByLevel.low;
            setEmbeddedPractice('sentence', pickDifferentPracticeItem(examples, embeddedPracticeState.sentence.text));
        });
    });
    renderEmbeddedPractice('word');
    renderEmbeddedPractice('sentence');
}

function initializeWordWritingQuizActivity() {
    const canvas = document.getElementById('word-write-canvas');
    const currentEl = document.getElementById('word-write-current');
    const feedback = document.getElementById('word-write-feedback');
    const chanchanExtraSyllables = [
        '아','야','어','여','오','요','우','유','으','이',
        '가','거','고','구','그','기','카','커','코','쿠','크','키','까','꺼','꼬','꾸','끄','끼',
        '나','너','노','누','느','니','다','더','도','두','드','디','타','터','토','투','트','티','따','떠','또','뚜','뜨','띠',
        '마','머','모','무','므','미','바','버','보','부','브','비','파','퍼','포','푸','프','피','빠','뻐','뽀','뿌','쁘','삐',
        '사','서','소','수','스','시','자','저','조','주','즈','지','차','처','초','추','츠','치','짜','쩌','쪼','쭈','쯔','찌','싸','써','쏘','쑤','쓰','씨',
        '하','허','호','후','흐','히','라','러','로','루','르','리'
    ];
    const chanchanExtraWords = [
        '개','해','배','게','네모','세모','시계','예의','얘기','와','과자','화가','원숭이','귀','위','의자','의사','왜','돼지','외투','쇠','뇌',
        '곰','감','밤','뱀','솜','힘','밥','입','컵','집','답','공','강','방','상','병','창','목','국','책','약','죽',
        '산','손','문','눈','돈','물','달','별','길','팔','곧','낟','묻다','듣다','걷다',
        '염소','감자','구름','수첩','집게','서랍','늑대','국자','책상','기린','분수','만두','솔방울','돋보기',
        '앞','옆','숲','잎','톱','떡','밖','부엌','깎다','볶다','옷','낮','팥','빛','꽃','좋다',
        '저녁','과녁','낚시','볶음밥','김밥','입술','팝콘','은행잎','무릎','짚신','숟가락','가마솥','젖소','첫째','돛단배','헝겊','낮잠',
        '읽다','흙','닭','밝다','삶','여덟','많다','넓다','괜찮다','짧다','없다','늙다','앉다','싫다'
    ];
    const isHangulSyllable = (char) => {
        const code = char?.charCodeAt?.(0);
        return code >= 0xAC00 && code <= 0xD7A3;
    };
    const hasBatchim = (char) => isHangulSyllable(char) && ((char.charCodeAt(0) - 0xAC00) % 28) > 0;
    const cleanWord = (value) => String(value || '').replace(/[^\uAC00-\uD7A3]/g, '');
    const pushUnique = (array, value) => {
        if (value && !array.includes(value)) array.push(value);
    };
    function buildChanchanWritingBank() {
        const syllableNoFinal = [];
        const syllableWithFinal = [];
        const words = [];
        const collectSyllables = (text) => {
            Array.from(cleanWord(text)).forEach((char) => {
                if (!isHangulSyllable(char)) return;
                pushUnique(hasBatchim(char) ? syllableWithFinal : syllableNoFinal, char);
            });
        };
        const collectWord = (text) => {
            const word = cleanWord(text);
            if (word.length < 1) return;
            collectSyllables(word);
            if (word.length >= 2) pushUnique(words, word);
        };

        chanchanExtraSyllables.forEach(collectSyllables);
        chanchanExtraWords.forEach(collectWord);
        (window.CHANCHAN_LESSONS || CHANCHAN_LESSONS || []).forEach((lesson) => {
            (lesson.letters || []).forEach((item) => {
                if (cleanWord(item).length === 1) collectSyllables(item);
            });
            (lesson.words || []).forEach(collectWord);
            (lesson.nonsenseWords || []).forEach(collectWord);
            (lesson.pictureItems || []).forEach((item) => collectWord(item.word));
            (lesson.fillItems || []).forEach((item) => {
                collectWord(item.word);
                collectWord(item.answer);
            });
        });

        return {
            syllable: {
                no_jongsung: syllableNoFinal.length ? syllableNoFinal : ['가','너','보','소'],
                with_jongsung: syllableWithFinal.length ? syllableWithFinal : ['각','산','밥','몸']
            },
            word: {
                two_letters: words.filter((word) => Array.from(word).length === 2),
                three_letters: words.filter((word) => Array.from(word).length >= 3)
            },
            sentence: []
        };
    }
    const wordData = buildChanchanWritingBank();
    if (!wordData.word.two_letters.length) wordData.word.two_letters = ['나무','학교'];
    if (!wordData.word.three_letters.length) wordData.word.three_letters = ['바나나','호랑이'];
    const sentenceRecommendations = [
        '나는 학교에 가요.',
        '하늘이 참 맑아요.',
        '친구와 같이 놀아요.',
        '사과를 맛있게 먹어요.',
        '오늘은 기분이 좋아요.',
        '나무 아래에서 쉬어요.',
        '도서관에서 책을 읽어요.',
        '물을 마시고 쉬어요.',
        '엄마와 시장에 가요.',
        '아빠가 책을 읽어요.',
        '강아지가 뛰어가요.',
        '꽃이 예쁘게 피어요.'
    ];
    let mode = 'syllable', sub='no_jongsung', currentWord='가';

    function guideTextForWriting(text) {
        return String(text || '')
            .replace(/[^\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣㆍ●]/g, '')
            .trim();
    }

    function drawGuide() {
        canvas.dataset.guide = mode === 'sentence' ? guideTextForWriting(currentWord) : (currentWord || '');
        canvas._traceCompleted = {};
        canvas._tracePaths = [];
        initializeTraceWritingCanvas(canvas);
        drawTraceWritingGuide(canvas);
    }
    function setSubButtons() {
        const root = document.getElementById('word-write-submodes');
        if (mode === 'syllable') root.innerHTML = `<button type="button" data-sub="no_jongsung" class="btn-outline px-4 py-1 text-base active">받침 없음</button>`;
        else if (mode === 'word') root.innerHTML = `<button type="button" data-sub="two_letters" class="btn-outline px-4 py-1 text-base ${sub === 'two_letters' ? 'active' : ''}">2글자</button><button type="button" data-sub="three_letters" class="btn-outline px-4 py-1 text-base ${sub === 'three_letters' ? 'active' : ''}">3글자 이상</button>`;
        else root.innerHTML = '';
        root.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
            root.querySelectorAll('button').forEach(btn => btn.classList.remove('active'));
            b.classList.add('active');
            sub = b.dataset.sub;
            nextWord();
        }));
    }
    function renderSentenceRecommendations() {
        const root = document.getElementById('word-write-sentence-recommendations');
        if (!root) return;
        const picks = [...sentenceRecommendations].sort(() => Math.random() - 0.5).slice(0, 6);
        root.innerHTML = picks.map((sentence) => `
            <button type="button" class="btn-outline px-4 py-3 text-base text-left" data-sentence="${escapeHtml(sentence)}">${escapeHtml(sentence)}</button>
        `).join('');
        root.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => {
                root.querySelectorAll('button').forEach((item) => item.classList.remove('active'));
                btn.classList.add('active');
                currentWord = btn.dataset.sentence;
                currentEl.textContent = currentWord;
                drawGuide();
                speakTextKo(currentWord);
            });
        });
    }
    async function nextWord() {
        if (mode === 'sentence') {
            const list = [...sentenceRecommendations].sort(() => Math.random() - 0.5);
            currentWord = list[0] || '나는 학교에 가요.';
            currentEl.textContent = currentWord;
            drawGuide();
            speakTextKo(currentWord);
            renderSentenceRecommendations();
            return;
        }
        const list = wordData[mode]?.[sub] || ['가'];
        currentWord = list[Math.floor(Math.random() * list.length)];
        currentEl.textContent = currentWord;
        drawGuide();
        speakTextKo(currentWord);
    }
    async function score() {
        await recordKoreanAttempt({
            lessonId: currentLearningActivityStep || 'word-writing',
            lessonTitle: '낱말 쓰기 연습',
            unitId: getUnitIdForLesson(currentLearningActivityStep) || null,
            activityType: 'writeOnCanvas',
            word: currentWord,
            isCorrect: true,
            errorType: null
        });
        feedback.textContent = '쓰기 완료로 기록했어요.';
        feedback.className = 'text-center text-2xl font-bold mt-3 h-8 text-green-600';
    }

    document.querySelectorAll('.word-mode-tab').forEach((btn) => btn.addEventListener('click', async () => {
        document.querySelectorAll('.word-mode-tab').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        mode = btn.dataset.mode;
        document.getElementById('word-write-name-input-area').classList.toggle('hidden', mode !== 'sentence');
        document.getElementById('word-write-display').classList.toggle('sentence-mode', mode === 'sentence');
        if (mode === 'syllable') sub = 'no_jongsung';
        if (mode === 'word') sub = 'two_letters';
        setSubButtons();
        await nextWord();
    }));
    document.getElementById('word-write-clear').addEventListener('click', () => resetTraceWritingCanvas(canvas));
    document.getElementById('word-write-grade').addEventListener('click', score);
    document.getElementById('word-write-next').addEventListener('click', nextWord);
    document.getElementById('word-write-tts').addEventListener('click', ()=>{ speakTextKo(currentWord); });
    document.getElementById('word-write-start-name').addEventListener('click', () => {
        const val = document.getElementById('word-write-name-input').value.trim();
        if (!val) return;
        currentWord = val;
        currentEl.textContent = currentWord;
        drawGuide();
        speakTextKo(currentWord);
    });
    document.getElementById('word-write-random-sentences').addEventListener('click', renderSentenceRecommendations);
    setSubButtons();
    nextWord();
    window.refreshWordWritingCanvas = drawGuide;
    window.addEventListener('resize', () => drawTraceWritingGuide(canvas));
}

function initializeHangulSoundGame() {
    const targetEl = document.getElementById('hangul-game-target');
    const choicesEl = document.getElementById('hangul-game-choices');
    const feedbackEl = document.getElementById('hangul-game-feedback');
    const scoreEl = document.getElementById('hangul-game-score');
    const streakEl = document.getElementById('hangul-game-streak');
    const roundEl = document.getElementById('hangul-game-round');
    const soundBtn = document.getElementById('hangul-game-sound');
    const restartBtn = document.getElementById('hangul-game-restart');
    const letterModeBtn = document.getElementById('hangul-game-letter-mode');
    const wordModeBtn = document.getElementById('hangul-game-word-mode');
    const visualPill = document.getElementById('hangul-game-visual-pill');
    if (!targetEl || !choicesEl || !feedbackEl) return;

    const fallbackLetters = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하','야','여','오','우','고','구','무','미'];
    const fallbackWords = ['아이','나무','다리','가지','파리','나비','기차','포도','거미','야구','여우','우유','과자','사과','돼지','바나나','피아노','라디오'];
    const cleanHangul = (value) => String(value || '').replace(/[^\uAC00-\uD7A3ㄱ-ㅎㅏ-ㅣ]/g, '');
    const isNoBatchimHangul = (value) => Array.from(String(value || '')).every((char) => {
        const code = char.charCodeAt(0);
        if (code < 0xAC00 || code > 0xD7A3) return true;
        return (code - 0xAC00) % 28 === 0;
    });
    const unique = (list) => [...new Set(list.filter(Boolean))];
    const shuffle = (list) => [...list].sort(() => Math.random() - 0.5);
    const pick = (list) => list[Math.floor(Math.random() * list.length)];

    function buildGameBank() {
        const letters = [...fallbackLetters];
        const words = [...fallbackWords];
        (window.CHANCHAN_LESSONS || CHANCHAN_LESSONS || []).forEach((lesson) => {
            (lesson.letters || []).forEach((item) => {
                const text = cleanHangul(item);
                if (Array.from(text).length === 1) letters.push(text);
            });
            (lesson.words || []).forEach((item) => {
                const text = cleanHangul(item);
                if (Array.from(text).length >= 2 && isNoBatchimHangul(text)) words.push(text);
            });
            (lesson.pictureItems || []).forEach((item) => {
                const text = cleanHangul(item.word);
                if (Array.from(text).length >= 2 && isNoBatchimHangul(text)) words.push(text);
            });
        });
        words.forEach((word) => Array.from(word).forEach((char) => letters.push(char)));
        return { letters: unique(letters), words: unique(words) };
    }

    const bank = buildGameBank();
    let mode = 'letter';
    let correctCount = 0;
    let streak = 0;
    let round = 1;
    let answer = '';
    let rewardGranted = false;
    let gameSession = 0;
    let nextQuestionTimer = null;
    const totalRounds = 10;

    function updateHud() {
        scoreEl.textContent = correctCount;
        streakEl.textContent = streak;
        roundEl.textContent = `${Math.min(round, totalRounds)}/${totalRounds}`;
    }

    function speakAnswer() {
        if (answer) speakTextKo(answer);
    }

    function renderModeButtons() {
        letterModeBtn.classList.toggle('active', mode === 'letter');
        wordModeBtn.classList.toggle('active', mode === 'word');
        if (visualPill) visualPill.textContent = mode === 'letter' ? '글자' : '낱말';
    }

    async function finishGame() {
        targetEl.textContent = '완료!';
        choicesEl.innerHTML = '';
        roundEl.textContent = `${totalRounds}/${totalRounds}`;
        const reward = correctCount * 5;
        feedbackEl.className = 'hangul-game-feedback text-2xl font-black text-[#46b3a5]';
        restartBtn.classList.remove('hidden');
        soundBtn.disabled = true;
        if (!rewardGranted && reward > 0) {
            rewardGranted = true;
            const rewardResult = await awardKoreanPracticeExperience(reward, feedbackEl, {
                source: 'hangul-sound-game',
                correctCount,
                totalRounds,
                mode
            });
            feedbackEl.textContent = `10문제 중 ${correctCount}문제를 맞혔어요. 경험치 +${Number(asNumber(rewardResult.grantedExperience, 0).toFixed(2))}%`;
        } else {
            feedbackEl.textContent = `10문제 중 ${correctCount}문제를 맞혔어요.`;
        }
    }

    function nextQuestion() {
        if (round > totalRounds) {
            void finishGame();
            return;
        }
        const source = mode === 'letter' ? bank.letters : bank.words;
        answer = pick(source);
        const wrongs = shuffle(source.filter((item) => item !== answer)).slice(0, 3);
        const choices = shuffle([answer, ...wrongs]);
        targetEl.textContent = mode === 'letter' ? '글자 듣기 문제' : '낱말 듣기 문제';
        feedbackEl.className = 'hangul-game-feedback text-2xl font-black text-gray-500';
        feedbackEl.textContent = '소리를 듣고 알맞은 카드를 골라요.';
        restartBtn.classList.add('hidden');
        soundBtn.disabled = false;
        choicesEl.innerHTML = choices.map((choice) => `
            <button type="button" class="btn-choice" data-choice="${escapeHtml(choice)}">${escapeHtml(choice)}</button>
        `).join('');
        choicesEl.querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => chooseAnswer(btn.dataset.choice, btn));
        });
        updateHud();
        window.setTimeout(speakAnswer, 220);
    }

    async function chooseAnswer(choice, btn) {
        const sessionAtAnswer = gameSession;
        const isCorrect = choice === answer;
        choicesEl.querySelectorAll('button').forEach((item) => {
            item.disabled = true;
            if (item.dataset.choice === answer) item.classList.add('active');
        });
        if (isCorrect) {
            streak += 1;
            correctCount += 1;
            feedbackEl.className = 'hangul-game-feedback text-2xl font-black text-[#46b3a5]';
            feedbackEl.textContent = streak >= 3 ? `좋아요! ${streak}번 연속 정답!` : '좋아요! 잘 들었어요.';
        } else {
            streak = 0;
            btn.classList.add('bg-red-50');
            feedbackEl.className = 'hangul-game-feedback text-2xl font-black text-orange-500';
            feedbackEl.textContent = `다시 들어 봐요. 정답은 ${answer}예요.`;
        }
        updateHud();
        await recordKoreanAttempt({
            lessonId: 'hangul-sound-game',
            lessonTitle: '한글 소리 찾기 게임',
            unitId: null,
            activityType: 'listenAndFind',
            word: answer,
            answer,
            userAnswer: choice,
            isCorrect,
            errorType: isCorrect ? null : KOREAN_ERROR_TYPES.MEANING_MATCH,
            skillTags: ['한글게임', mode === 'letter' ? '글자' : '낱말']
        });
        if (sessionAtAnswer !== gameSession) return;
        round += 1;
        nextQuestionTimer = window.setTimeout(nextQuestion, isCorrect ? 850 : 1350);
    }

    function restartGame(newMode = mode) {
        gameSession += 1;
        if (nextQuestionTimer) window.clearTimeout(nextQuestionTimer);
        mode = newMode;
        correctCount = 0;
        streak = 0;
        round = 1;
        rewardGranted = false;
        renderModeButtons();
        nextQuestion();
    }

    soundBtn.addEventListener('click', speakAnswer);
    restartBtn.addEventListener('click', () => restartGame());
    letterModeBtn.addEventListener('click', () => restartGame('letter'));
    wordModeBtn.addEventListener('click', () => restartGame('word'));
    window.startHangulSoundGame = () => {
        if (!answer || round > totalRounds) restartGame(mode);
        else {
            updateHud();
            speakAnswer();
        }
    };
}

function initializeListeningQuizActivity() {
    const categoryPrompts = {
        cat1:'받침이 없고 단모음 위주의 쉬운 한글 낱말', cat2:'받침이 있고 단모음 위주의 쉬운 한글 낱말', cat3:'받침이 없고 이중모음이 포함된 낱말', cat4:'받침이 있고 이중모음이 포함된 낱말',
        cat5:'초등학생 수준의 쉬운 단어', cat6:'초등학생 수준의 쉬운 짧은 문장', cat7:'초등학생 고학년 수준의 단어', cat8:'초등학생 고학년 수준의 문장'
    };
    const labels = { cat1:'받침없는 낱말 (ㅏ,ㅣ..)', cat2:'받침있는 낱말 (ㅏ,ㅣ..)', cat3:'받침없는 낱말 (ㅑ,ㅘ..)', cat4:'받침있는 낱말 (ㅑ,ㅘ..)', cat5:'쉬운 단어', cat6:'쉬운 문장', cat7:'어려운 단어', cat8:'어려운 문장' };
    const fallbackQuizBank = {
        cat1: ['가구', '나비', '바지', '오리', '사자', '모자', '고기', '아기'],
        cat2: ['산', '강', '밥', '문', '손', '책', '별', '꽃'],
        cat3: ['과자', '돼지', '시계', '우유', '여우', '화가', '의자', '귀여워'],
        cat4: ['왕', '광장', '병원', '연필', '왼손', '활짝', '과일', '원숭이'],
        cat5: ['나무', '학교', '친구', '바다', '하늘', '구름', '사과', '마음'],
        cat6: ['나는 학교에 가요.', '하늘이 참 맑아요.', '친구와 같이 놀아요.', '사과를 먹어요.', '나무가 커요.'],
        cat7: ['도서관', '운동장', '약속', '발표', '상상력', '관찰', '질문', '기록'],
        cat8: ['도서관에서 책을 읽어요.', '친구의 말을 잘 들어요.', '궁금한 것을 질문해요.', '생각을 글로 적어요.']
    };
    const categories = document.getElementById('listening-categories');
    categories.innerHTML = Object.entries(labels).map(([k,v]) => `<button type="button" data-cat="${k}" class="btn-outline px-3 py-2 text-sm ${k==='cat5'?'active':''}">${v}</button>`).join('');
    let currentCategory = 'cat5', total = 10, idx = 0, score = 0, quiz = [], answer = '';

    categories.querySelectorAll('button').forEach((b)=>b.addEventListener('click', ()=>{
        categories.querySelectorAll('button').forEach((x)=>x.classList.remove('active'));
        b.classList.add('active');
        currentCategory = b.dataset.cat;
    }));

    const speak = (text) => { if (!text) return; speakTextKo(text); };

    function normalizeQuizItems(items) {
        return (items || [])
            .filter((item) => item?.answer && Array.isArray(item?.choices))
            .map((item) => {
                const choices = Array.from(new Set([item.answer, ...item.choices].filter(Boolean))).slice(0, 3);
                return choices.length >= 3 ? { answer: item.answer, choices } : null;
            })
            .filter(Boolean);
    }

    function generateFallbackSet() {
        const source = fallbackQuizBank[currentCategory] || fallbackQuizBank.cat5;
        const pool = [...new Set(source)];
        return Array.from({ length: total }, (_, index) => {
            const answer = pool[index % pool.length];
            const wrongs = pool.filter((item) => item !== answer).sort(() => Math.random() - 0.5).slice(0, 2);
            return { answer, choices: [answer, ...wrongs] };
        });
    }

    async function generateSet() {
        const prompt = `${categoryPrompts[currentCategory]} 퀴즈 ${total}개를 JSON으로. 형식 {"quiz":[{"answer":"", "choices":["","",""]}]}`;
        const payload = { contents:[{role:'user',parts:[{text:prompt}]}], generationConfig:{ responseMimeType:'application/json' } };
        try {
            const res = await fetch('/.netlify/functions/generatePlan', {
                method:'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type:'gemini', payload })
            });
            if (!res.ok) throw new Error(`generatePlan ${res.status}`);
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('empty quiz response');
            const parsed = JSON.parse(text);
            const generated = normalizeQuizItems(parsed.quiz);
            return generated.length ? generated.slice(0, total) : generateFallbackSet();
        } catch (error) {
            console.warn('Listening quiz fallback:', error);
            return generateFallbackSet();
        }
    }
    function showQuestion() {
        if (idx >= total) return showResult();
        document.getElementById('listening-progress').textContent = `문제 ${idx + 1} / ${total}`;
        const q = quiz[idx]; answer = q.answer;
        const choiceRoot = document.getElementById('listening-choices');
        const shuffled = [...q.choices].sort(() => Math.random() - 0.5);
        choiceRoot.innerHTML = shuffled.map((c) => `<button type="button" class="btn-choice">${escapeHtml(c)}</button>`).join('');
        choiceRoot.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', () => {
            if (btn.textContent === answer) score++;
            idx += 1;
            setTimeout(showQuestion, 500);
        }));
        setTimeout(() => speak(answer), 400);
    }
    function showResult() {
        document.getElementById('listening-quiz').classList.add('hidden');
        document.getElementById('listening-result').classList.remove('hidden');
        document.getElementById('listening-total').textContent = total;
        document.getElementById('listening-score').textContent = score;
        const pct = (score / total) * 100;
        document.getElementById('listening-final-msg').textContent = pct === 100 ? '모든 문제를 맞혔어요! 정말 대단해요!' : (pct >= 70 ? '거의 다 맞혔네요! 조금만 더 힘내요!' : '괜찮아요! 다시 도전해볼까요?');
    }

    document.getElementById('listening-start').addEventListener('click', async () => {
        total = Math.max(1, Number(document.getElementById('listening-question-count').value) || 10);
        quiz = await generateSet();
        if (!quiz.length) {
            showModal('퀴즈를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.');
            return;
        }
        total = quiz.length;
        idx = 0; score = 0;
        document.getElementById('listening-setup').classList.add('hidden');
        document.getElementById('listening-result').classList.add('hidden');
        document.getElementById('listening-quiz').classList.remove('hidden');
        showQuestion();
    });
    document.getElementById('listening-play').addEventListener('click', () => speak(answer));
    document.getElementById('listening-back').addEventListener('click', () => {
        cancelSpeech();
        document.getElementById('listening-quiz').classList.add('hidden');
        document.getElementById('listening-result').classList.add('hidden');
        document.getElementById('listening-setup').classList.remove('hidden');
    });
    document.getElementById('listening-restart').addEventListener('click', () => {
        document.getElementById('listening-result').classList.add('hidden');
        document.getElementById('listening-setup').classList.remove('hidden');
    });
}

function renderMyKoreanTabs() {
    const tabsRoot = document.getElementById('my-korean-tabs');
    const tabEntries = Object.entries(unitMeta);
    tabsRoot.innerHTML = tabEntries.map(([key, meta]) => {
        return `
        <button type="button" class="my-korean-unit-tab ${key === activeUnitKey ? 'active' : ''}"
            style="${key === activeUnitKey ? `background:var(--mint-light); color:var(--mint-primary); border-color:var(--mint-primary);` : ''}"
            title="${meta.unit}단원 · ${meta.label}" aria-label="${meta.unit}단원 ${meta.label}"
            onclick="selectLearningUnit('${key}')">
            ${meta.unit}단원
        </button>
    `;
    }).join('');
}

function renderMyKoreanList() {
    const unit = unitMeta[activeUnitKey];
    document.getElementById('my-korean-unit-title').innerText = `${unit.unit}단원 · ${unit.label}`;
    const list = learningUnits[activeUnitKey] || [];
    const listRoot = document.getElementById('my-korean-list');
    listRoot.innerHTML = list.map((item) => {
        // 인호 요청: 한글 내부 콘텐츠도 단계 잠금 없이 모두 열어 둔다.
        const isOpen = true;
        const isDone = item.step === 0 ? currentLearningStep >= 0 : item.step <= currentLearningStep;
        const statusText = isDone ? '복습하기' : (isOpen ? '시작하기' : '잠김');
        const openAction = (activeUnitKey === 'vowel' && item.step === 0 && isOpen)
            ? `onclick="openLearningStartActivity()"`
            : (learningDetailData[item.step] && isOpen)
                ? `onclick="openLearningDetailActivity(${item.step})"`
            : '';
        return `
            <button type="button"
                class="grid-item w-full p-6 flex items-center justify-between gap-4 text-left transition-all hover:translate-x-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#46b3a566] ${isOpen ? 'cursor-pointer' : 'opacity-40 grayscale cursor-not-allowed'}"
                aria-label="${item.title} ${statusText}"
                ${isOpen ? '' : 'disabled'}
                ${openAction}>
                <div class="flex items-center gap-4">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center ${isDone ? 'bg-green-100 text-green-600' : (isOpen ? 'bg-[#46b3a51a] text-[#46b3a5]' : 'bg-gray-100 text-gray-400')}">
                        ${isDone ? '✓' : (isOpen ? '▶' : '🔒')}
                    </div>
                    <div class="text-xl font-bold text-[#2c3e50]">${item.title}</div>
                </div>
                <span aria-hidden="true" class="btn-primary shrink-0 py-2 px-6 text-base text-center ${isDone ? 'bg-gray-100 !text-gray-500 shadow-none' : (isOpen ? '' : 'hidden')}">${statusText}</span>
            </button>
        `;
    }).join('');
}

window.selectLearningUnit = function selectLearningUnit(unitKey) {
    activeUnitKey = unitKey;
    renderMyKoreanTabs();
    renderMyKoreanList();
}

window.openMyKoreanSection = function openMyKoreanSection() {
    showTopLevelSection('my-korean-section');
    document.getElementById('my-korean-profile-level').innerText = getLearningLevelLabel(currentLearningStep);
    document.getElementById('my-korean-profile-name').innerText = document.getElementById('dashboard-account-name').innerText || '이름';
    document.getElementById('current-learning-step-label').innerText = getLearningStepBadge(currentLearningStep);
    renderMyKoreanTabs();
    renderMyKoreanList();
}

window.closeMyKoreanSection = function closeMyKoreanSection() {
    goHangulDashboard();
}

let koreanAttemptCache = [];
let koreanSummaryCache = {};

function getStoredKoreanAttempts() {
    return koreanAttemptCache;
}

function setStoredKoreanAttempts(attempts) {
    koreanAttemptCache = attempts;
}

function getStoredKoreanSummary() {
    return koreanSummaryCache;
}

function setStoredKoreanSummary(summary) {
    koreanSummaryCache = summary;
}

function getChanchanLesson(lessonId) {
    return chanchanLessonById[String(lessonId)] || null;
}

function getLessonTitleForReport(lessonId) {
    const lesson = getChanchanLesson(lessonId);
    if (lesson) return lesson.title;
    return learningDetailData[lessonId]?.title?.replace(/^배움\s*\d+:\s*/, '') || `배움 ${lessonId}`;
}

function getUnitIdForLesson(lessonId) {
    const lesson = getChanchanLesson(lessonId);
    if (lesson) return lesson.unit;
    if (lessonId >= 1 && lessonId <= 7) return 1;
    if (lessonId >= 8 && lessonId <= 12) return 2;
    if (lessonId >= 13 && lessonId <= 14) return 3;
    if (lessonId >= 15 && lessonId <= 19) return 4;
    if (lessonId === 20) return 5;
    if (lessonId >= 21 && lessonId <= 25) return 6;
    if (lessonId === 26) return 7;
    if (lessonId >= 27 && lessonId <= 30) return 8;
    if (lessonId >= 31 && lessonId <= 33) return 9;
    return null;
}

function inferKoreanErrorType({ lessonId, activityType, answer, word } = {}) {
    if (activityType === 'wordPictureMatch') return KOREAN_ERROR_TYPES.MEANING_MATCH;
    if (activityType === 'nonsenseWordRead') return KOREAN_ERROR_TYPES.NONSENSE_READ;
    if (activityType === 'batchimFamily') return KOREAN_ERROR_TYPES.BATCHIM_FAMILY;
    const lesson = getChanchanLesson(lessonId);
    const focus = lesson?.focus || [];
    const target = `${answer || ''}${word || ''}`;
    const complex = ['ㅑ','ㅕ','ㅘ','ㅝ','ㅟ','ㅢ','ㅙ','ㅚ','ㅞ','ㅖ','ㅒ','ㅐ','ㅔ'];
    const batchim = ['ㅁ','ㅂ','ㅇ','ㄱ','ㄴ','ㄹ','ㄷ'];
    const consonants = ['ㄱ','ㅋ','ㄲ','ㄴ','ㄷ','ㅌ','ㄸ','ㅁ','ㅂ','ㅍ','ㅃ','ㅅ','ㅈ','ㅊ','ㅉ','ㅆ','ㅇ','ㅎ','ㄹ'];
    if (focus.some((item) => complex.includes(item)) || complex.some((item) => target.includes(item))) return KOREAN_ERROR_TYPES.COMPLEX_VOWEL;
    if (focus.some((item) => batchim.includes(item)) && Number(lessonId) >= 21) return KOREAN_ERROR_TYPES.BATCHIM;
    if (focus.some((item) => consonants.includes(item)) && Number(lessonId) >= 8 && Number(lessonId) <= 12) return KOREAN_ERROR_TYPES.CONSONANT;
    if (Number(lessonId) >= 13 && Number(lessonId) <= 20) return KOREAN_ERROR_TYPES.SYLLABLE;
    return KOREAN_ERROR_TYPES.VOWEL;
}

function getKoreanAttemptKey({ lessonId, activityType, word, answer } = {}) {
    return [currentUserId || 'local', lessonId || 'unknown', activityType || 'activity', word || answer || 'target'].join('|');
}

function getKoreanAudioReplayCount({ lessonId, activityType, word, answer } = {}) {
    const key = getKoreanAttemptKey({ lessonId, activityType, word, answer });
    return window.koreanAudioReplayCounts[key] || 0;
}

function incrementKoreanAudioReplayCount({ lessonId, activityType, word, answer } = {}) {
    const key = getKoreanAttemptKey({ lessonId, activityType, word, answer });
    window.koreanAudioReplayCounts[key] = (window.koreanAudioReplayCounts[key] || 0) + 1;
    return window.koreanAudioReplayCounts[key];
}

function nextKoreanRetryIndex({ lessonId, activityType, word, answer } = {}) {
    const key = getKoreanAttemptKey({ lessonId, activityType, word, answer });
    window.koreanRetryCounts[key] = (window.koreanRetryCounts[key] || 0) + 1;
    return window.koreanRetryCounts[key];
}

function resetKoreanRetryIndex({ lessonId, activityType, word, answer } = {}) {
    const key = getKoreanAttemptKey({ lessonId, activityType, word, answer });
    window.koreanRetryCounts[key] = 0;
}

function summarizeKoreanAttempts(studentId, attempts) {
    const studentAttempts = attempts.filter((attempt) => attempt.studentId === studentId);
    const studentName = studentAttempts.at(-1)?.studentName || currentUserName || '이름 없음';
    const correctAttempts = studentAttempts.filter((attempt) => attempt.isCorrect).length;
    const completedActivityKeys = new Set();
    const completedLessons = new Set();
    const errorCounts = {};
    const lessonErrors = {};
    let totalRetryCount = 0;
    let lastStudiedAt = null;

    studentAttempts.forEach((attempt) => {
        if (attempt.isCorrect) {
            completedActivityKeys.add(`${attempt.lessonId}:${attempt.activityType}:${attempt.word || attempt.prompt || attempt.answer || ''}`);
            completedLessons.add(String(attempt.lessonId));
        }
        if (!attempt.isCorrect && attempt.errorType) {
            errorCounts[attempt.errorType] = (errorCounts[attempt.errorType] || 0) + 1;
            lessonErrors[attempt.lessonId] = (lessonErrors[attempt.lessonId] || 0) + 1;
        }
        totalRetryCount += Math.max(0, Number(attempt.retryIndex || 1) - 1);
        if (!lastStudiedAt || attempt.createdAt > lastStudiedAt) lastStudiedAt = attempt.createdAt;
    });

    const topErrorTypes = Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => ({ type, count }));
    const recentWrongWords = studentAttempts.filter((attempt) => !attempt.isCorrect).slice(-8).reverse().map((attempt) => attempt.word || attempt.prompt || attempt.answer || attempt.userAnswer).filter(Boolean);
    const difficultLessons = Object.entries(lessonErrors).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([lessonId, count]) => ({
        lessonId,
        title: getLessonTitleForReport(lessonId),
        count
    }));
    const recommendedLessons = recommendKoreanLessons(topErrorTypes, recentWrongWords);
    return {
        studentId,
        studentName,
        completedLessonCount: completedLessons.size,
        completedActivityCount: completedActivityKeys.size,
        totalAttempts: studentAttempts.length,
        correctAttempts,
        accuracyRate: studentAttempts.length ? Math.round((correctAttempts / studentAttempts.length) * 100) : 0,
        totalRetryCount,
        topErrorTypes,
        recentWrongWords: Array.from(new Set(recentWrongWords)).slice(0, 6),
        difficultLessons,
        recommendedLessons,
        lastStudiedAt
    };
}

function recommendKoreanLessons(topErrorTypes = [], recentWrongWords = []) {
    const recommendations = [];
    const addRange = (from, to, reason) => {
        for (let step = from; step <= to; step++) {
            recommendations.push({ lessonId: step, title: getLessonTitleForReport(step), reason });
        }
    };
    topErrorTypes.forEach(({ type }) => {
        if (type === KOREAN_ERROR_TYPES.VOWEL) addRange(2, 7, '모음 다시 연습');
        if (type === KOREAN_ERROR_TYPES.CONSONANT) addRange(8, 12, '자음 다시 연습');
        if (type === KOREAN_ERROR_TYPES.COMPLEX_VOWEL) addRange(15, 20, '복잡한 모음 다시 연습');
        if (type === KOREAN_ERROR_TYPES.BATCHIM) addRange(21, 26, '대표받침 다시 연습');
        if (type === KOREAN_ERROR_TYPES.BATCHIM_FAMILY) addRange(27, 31, '받침가족 다시 읽기');
        if (type === KOREAN_ERROR_TYPES.MEANING_MATCH) {
            CHANCHAN_LESSONS.forEach((lesson) => {
                if ((lesson.words || []).some((word) => recentWrongWords.includes(word))) {
                    recommendations.push({ lessonId: lesson.id, title: lesson.title, reason: '그림-단어 연결 복습' });
                }
            });
        }
    });
    const seen = new Set();
    return recommendations.filter((item) => {
        const key = String(item.lessonId);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 5);
}

function updateKoreanProgressSummary(attempt) {
    const attempts = getStoredKoreanAttempts();
    const summary = getStoredKoreanSummary();
    summary[attempt.studentId] = summarizeKoreanAttempts(attempt.studentId, attempts);
    setStoredKoreanSummary(summary);
    return summary[attempt.studentId];
}

async function recordKoreanAttempt({
    studentId = currentUserId || 'local_student',
    studentName = currentUserName || '이름 없음',
    lessonId = currentLearningActivityStep || 'start',
    lessonTitle,
    unitId,
    activityType,
    word = '',
    prompt = '',
    answer = '',
    userAnswer = '',
    isCorrect = true,
    errorType = null,
    skillTags = [],
    retryIndex = 1,
    hintUsed = false,
    audioReplayCount = 0,
    durationMs = Date.now() - koreanActivityStartedAt,
    readCount = null
} = {}) {
    const lesson = getChanchanLesson(lessonId);
    const normalizedLessonTitle = lessonTitle || lesson?.title || getLessonTitleForReport(lessonId);
    const normalizedUnitId = unitId || lesson?.unit || getUnitIdForLesson(lessonId);
    const normalizedErrorType = isCorrect ? null : (errorType || inferKoreanErrorType({ lessonId, activityType, answer, word }));
    const attempt = {
        attemptId: (crypto?.randomUUID?.() || `attempt_${Date.now()}_${Math.random().toString(16).slice(2)}`),
        studentId,
        studentName,
        lessonId,
        lessonTitle: normalizedLessonTitle,
        unitId: normalizedUnitId,
        activityType,
        word,
        prompt,
        answer,
        userAnswer,
        isCorrect: Boolean(isCorrect),
        errorType: normalizedErrorType,
        skillTags,
        retryIndex: Number(retryIndex || 1),
        hintUsed: Boolean(hintUsed),
        audioReplayCount: Number(audioReplayCount || 0),
        durationMs: Number(durationMs || 0),
        ...(readCount !== null ? { readCount: Number(readCount) } : {}),
        createdAt: new Date().toISOString()
    };

    try {
        const attempts = getStoredKoreanAttempts();
        attempts.push(attempt);
        setStoredKoreanAttempts(attempts.slice(-1200));
        const report = updateKoreanProgressSummary(attempt);
        if (studentId && studentId !== 'local_student') {
            await Promise.all([
                setDoc(doc(db, 'korean_attempts', attempt.attemptId), attempt, { merge: true }),
                setDoc(doc(db, 'users', studentId), {
                    koreanProgressSummary: report,
                    koreanProgressUpdatedAt: attempt.createdAt
                }, { merge: true })
            ]);
        }
    } catch (error) {
        if (error?.code === 'permission-denied') {
            console.warn('Korean attempt cloud save skipped: permission denied.');
        } else {
            console.error('Korean attempt Firebase save failed:', error);
        }
    }
    return attempt;
}

window.recordKoreanAttempt = recordKoreanAttempt;
window.buildKoreanStudentReport = function buildKoreanStudentReport(studentId) {
    const summary = getStoredKoreanSummary();
    if (summary[studentId]) return summary[studentId];
    return summarizeKoreanAttempts(studentId, getStoredKoreanAttempts());
};

function getKoreanStudentReportFromData(studentId, student = {}) {
    return student.koreanProgressSummary || window.buildKoreanStudentReport(studentId);
}

const KOREAN_ERROR_TYPE_LABELS = {
    [KOREAN_ERROR_TYPES.VOWEL]: '모음',
    [KOREAN_ERROR_TYPES.CONSONANT]: '자음',
    [KOREAN_ERROR_TYPES.COMPLEX_VOWEL]: '복잡한 모음',
    [KOREAN_ERROR_TYPES.BATCHIM]: '받침',
    [KOREAN_ERROR_TYPES.BATCHIM_FAMILY]: '받침 가족',
    [KOREAN_ERROR_TYPES.SYLLABLE]: '글자 완성',
    [KOREAN_ERROR_TYPES.MEANING_MATCH]: '그림-낱말 연결',
    [KOREAN_ERROR_TYPES.NONSENSE_READ]: '무의미 낱말 읽기',
    [KOREAN_ERROR_TYPES.NO_RESPONSE]: '응답 없음'
};

function formatKoreanErrorType(type) {
    return KOREAN_ERROR_TYPE_LABELS[type] || type || '기록 없음';
}

function formatKoreanReportList(items = [], fallback = '없음') {
    if (!items || !items.length) return fallback;
    return items.map((item) => {
        if (typeof item === 'string') return formatKoreanErrorType(item);
        if (item.type) return formatKoreanErrorType(item.type);
        return item.title || item.word || item.lessonId;
    }).filter(Boolean).join(', ');
}

function renderLessonMap() {
    return CHANCHAN_LESSONS.map((lesson) => `
        <button type="button" class="grid-item p-4 text-left" onclick="renderLessonDetail('${lesson.id}')">
            <div class="text-sm font-black text-teal-500">단원 ${lesson.unit}</div>
            <div class="text-xl font-black text-[#2c3e50]">${lesson.id === 'start' ? lesson.title : `배움 ${lesson.id}: ${lesson.title}`}</div>
            <div class="text-sm text-gray-500 mt-1">${lesson.description || (lesson.focus || []).join(', ')}</div>
        </button>
    `).join('');
}

function renderLessonDetail(lessonId) {
    const lesson = getChanchanLesson(lessonId);
    if (!lesson) return '';
    return `
        <div class="learning-practice-card">
            <div class="learning-card-label practice-label">찬찬한글 활동</div>
            <div class="grid gap-4">
                ${(lesson.activities || []).map((activity) => {
                    if (activity === 'listenAndFind') return '';
                    if (activity === 'readThreeTimes') return renderReadThreeTimesActivity(lesson);
                    if (activity === 'fillOneJamo') return renderFillOneJamoActivity(lesson);
                    if (activity === 'wordPictureMatch') return renderWordPictureMatchActivity(lesson);
                    if (activity === 'nonsenseWordRead') return renderNonsenseWordReadActivity(lesson);
                    if (activity === 'writeOnCanvas') return '';
                    if (activity === 'batchimFamily') return renderBatchimFamilyActivity(lesson);
                    if (activity === 'finalAssessment') return renderFinalAssessmentActivity(lesson);
                    return '';
                }).join('')}
            </div>
        </div>
    `;
}

const LESSON21_BATCHIM_CONFIGS = {
    'ㅁ': {
        label: 'ㅁ 받침',
        intro: [
            { base: '가', result: '감' },
            { base: '나', result: '남' },
            { base: '다', result: '담' },
            { base: '라', result: '람' },
            { base: '마', result: '맘' },
            { base: '버', result: '범' },
            { base: '서', result: '섬' },
            { base: '저', result: '점' },
            { base: '터', result: '텀' },
            { base: '퍼', result: '펌' }
        ],
        practiceRows: [
            ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'],
            ['거', '너', '더', '러', '머', '버', '서', '어', '저', '처', '커', '터', '퍼', '허'],
            ['고', '노', '도', '로', '모', '보', '소', '오', '조', '초', '코', '토', '포', '호'],
            ['구', '누', '두', '루', '무', '부', '수', '우', '주', '추', '쿠', '투', '푸', '후']
        ],
        writeItems: ['감', '남', '담', '람', '맘', '범', '섬', '점', '텀', '펌', '검', '넘', '덤', '럼', '멈', '봄', '솜', '줌', '춤', '콤'],
        wordFind: [
            { word: '참외', icon: '🍈', choices: ['참외', '차외'] },
            { word: '김치', icon: '🥬', choices: ['김치', '기치'] },
            { word: '구름', icon: '☁️', choices: ['구름', '구룸'] },
            { word: '그림', icon: '🖼️', choices: ['그림', '그리'] }
        ],
        challenge: [
            { label: '1단계', words: ['곰', '검', '힘', '남', '뱀', '솜', '폼'], count: 7 },
            { label: '2단계', words: ['감기', '오줌', '주스', '아픈', '시금'], count: 5 },
            { label: '3단계', words: ['부모님', '몸무게', '심심해'], count: 3 }
        ]
    },
    'ㅂ': {
        label: 'ㅂ 받침',
        intro: [
            { base: '가', result: '갑' },
            { base: '나', result: '납' },
            { base: '다', result: '답' },
            { base: '라', result: '랍' },
            { base: '마', result: '맙' },
            { base: '버', result: '법' },
            { base: '서', result: '섭' },
            { base: '저', result: '접' },
            { base: '터', result: '텁' },
            { base: '퍼', result: '펍' }
        ],
        practiceRows: [
            ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'],
            ['거', '너', '더', '러', '머', '버', '서', '어', '저', '처', '커', '터', '퍼', '허'],
            ['고', '노', '도', '로', '모', '보', '소', '오', '조', '초', '코', '토', '포', '호'],
            ['구', '누', '두', '루', '무', '부', '수', '우', '주', '추', '쿠', '투', '푸', '후']
        ],
        writeItems: ['갑', '납', '답', '랍', '맙', '법', '섭', '접', '텁', '펍', '겁', '넙', '덥', '럽', '멉', '곱', '돕', '몹', '좁', '톱'],
        wordFind: [
            { word: '밥', icon: '🍚', choices: ['밥', '밤'] },
            { word: '입', icon: '👄', choices: ['입', '임'] },
            { word: '집', icon: '🏠', choices: ['집', '짐'] },
            { word: '컵', icon: '🥤', choices: ['컵', '컴'] }
        ],
        challenge: [
            { label: '1단계', words: ['밥', '겁', '입', '답', '법', '컵', '즙'], count: 7 },
            { label: '2단계', words: ['수업', '대답', '접다', '집밥', '눈썹'], count: 5 },
            { label: '3단계', words: ['모래톱', '구급차', '푸대접'], count: 3 }
        ]
    },
    'ㅇ': {
        label: 'ㅇ 받침',
        intro: [
            { base: '가', result: '강' }, { base: '나', result: '낭' }, { base: '다', result: '당' },
            { base: '라', result: '랑' }, { base: '마', result: '망' }, { base: '버', result: '벙' },
            { base: '서', result: '성' }, { base: '저', result: '정' }, { base: '터', result: '텅' },
            { base: '퍼', result: '펑' }
        ],
        challenge: [
            { label: '1단계', words: ['흥', '공', '방', '강', '왕', '병', '종'], count: 7 },
            { label: '2단계', words: ['방송', '풍덩', '세상', '동생', '지붕'], count: 5 },
            { label: '3단계', words: ['강낭콩', '야옹이', '경기장'], count: 3 }
        ]
    },
    'ㄱ': {
        label: 'ㄱ 받침',
        intro: [
            { base: '가', result: '각' }, { base: '나', result: '낙' }, { base: '다', result: '닥' },
            { base: '라', result: '락' }, { base: '마', result: '막' }, { base: '버', result: '벅' },
            { base: '서', result: '석' }, { base: '저', result: '적' }, { base: '터', result: '턱' },
            { base: '퍼', result: '퍽' }
        ],
        challenge: [
            { label: '1단계', words: ['국', '박', '약', '벽', '백', '떡', '학'], count: 7 },
            { label: '2단계', words: ['약국', '박수', '소식', '학교', '호박'], count: 5 },
            { label: '3단계', words: ['미역국', '약속', '행복해'], count: 3 }
        ]
    },
    'ㄴ': {
        label: 'ㄴ 받침',
        intro: [
            { base: '가', result: '간' }, { base: '나', result: '난' }, { base: '다', result: '단' },
            { base: '라', result: '란' }, { base: '마', result: '만' }, { base: '버', result: '번' },
            { base: '서', result: '선' }, { base: '저', result: '전' }, { base: '터', result: '턴' },
            { base: '퍼', result: '펀' }
        ],
        challenge: [
            { label: '1단계', words: ['판', '산', '문', '반', '천', '끈', '팬'], count: 7 },
            { label: '2단계', words: ['그만', '부분', '소년', '선반', '사촌'], count: 5 },
            { label: '3단계', words: ['천천히', '건전지', '태권도'], count: 3 }
        ]
    },
    'ㄹ': {
        label: 'ㄹ 받침',
        intro: [
            { base: '가', result: '갈' }, { base: '나', result: '날' }, { base: '다', result: '달' },
            { base: '라', result: '랄' }, { base: '마', result: '말' }, { base: '버', result: '벌' },
            { base: '서', result: '설' }, { base: '저', result: '절' }, { base: '터', result: '털' },
            { base: '퍼', result: '펄' }
        ],
        challenge: [
            { label: '1단계', words: ['물', '돌', '길', '벌', '털', '귤', '쌀'], count: 7 },
            { label: '2단계', words: ['하늘', '마을', '얼굴', '구슬', '콜라'], count: 5 },
            { label: '3단계', words: ['다슬기', '가을하늘', '솔방울'], count: 3 }
        ]
    },
    'ㄷ': {
        label: 'ㄷ 받침',
        intro: [
            { base: '가', result: '갇' }, { base: '다', result: '닫' }, { base: '마', result: '맏' },
            { base: '거', result: '걷' }, { base: '미', result: '믿' }, { base: '바', result: '받' },
            { base: '어', result: '얻' }, { base: '무', result: '묻' }, { base: '시', result: '싣' },
            { base: '도', result: '돋' }
        ],
        challenge: [
            { label: '1단계', words: ['곳', '낯', '닫', '맏', '믿', '받', '얻'], count: 7 },
            { label: '2단계', words: ['곧게', '걷다', '닫다', '돋다', '싣다'], count: 5 },
            { label: '3단계', words: ['돋보기', '이튿날', '숟가락'], count: 3 }
        ]
    }
};

const LESSON_BATCHIM_PAGE_SEQUENCES = {
    21: ['ㅁ', 'ㅂ'],
    22: ['ㅇ', 'ㄱ'],
    23: ['ㄴ', 'ㄹ'],
    24: ['ㄷ']
};

const LESSON_BATCHIM_CHARACTERS = new Set(Object.values(LESSON_BATCHIM_PAGE_SEQUENCES).flat());

function normalizeLessonBatchim(batchim) {
    return LESSON_BATCHIM_CHARACTERS.has(batchim) ? batchim : 'ㅁ';
}

function getLesson21BatchimConfig(batchim) {
    return LESSON21_BATCHIM_CONFIGS[batchim] || LESSON21_BATCHIM_CONFIGS['ㅁ'];
}

function renderLesson21SoundButton(text, className = 'lesson21-sound-button') {
    return `<button type="button" class="${className}" onclick="speakLesson13Word('${text}', this)" aria-label="${text} 소리 듣기">🔊 ${text}</button>`;
}

function renderLesson21MBatchimIntroPage(lessonId, batchim = 'ㅁ') {
    const config = getLesson21BatchimConfig(batchim);
    const rows = [config.intro.slice(0, 5), config.intro.slice(5)];
    return `
        <div class="lesson21-page lesson21-intro-page lesson21-m-intro-page" data-lesson21-m-intro="${lessonId}" data-batchim="${batchim}">
            <div class="lesson21-instruction"><strong>따라하기</strong> · ${batchim} 받침을 넣어 글자를 완성해요</div>
            <div id="lesson21-m-feedback" class="lesson21-m-feedback" role="status" aria-live="polite">
                1번 획부터 화살표 방향으로 따라 써 보세요.
            </div>
            <div class="lesson21-m-table" role="table" aria-label="${batchim} 받침을 넣어 글자 완성하기">
                ${rows.map((row, rowIndex) => `
                    <section class="lesson21-m-block" role="rowgroup" aria-label="${batchim} 받침 따라쓰기 ${rowIndex + 1}번째 줄">
                        <div class="lesson21-m-side-column">
                            <div class="lesson21-m-base-heading" role="columnheader">기본 글자</div>
                            <button type="button" class="lesson21-m-batchim-label" onclick="speakTextKo('${batchim} 받침을 써 보세요.')" aria-label="넣을 받침 ${batchim}. 눌러서 안내 듣기">
                                <span>넣을 받침</span>
                                <strong>${batchim}</strong>
                            </button>
                        </div>
                        <div class="lesson21-m-pair-grid">
                            ${row.map((item, columnIndex) => {
                                const itemIndex = rowIndex * 5 + columnIndex;
                                return `
                                    <div class="lesson21-m-pair" data-lesson21-m-index="${itemIndex}" data-base="${item.base}" data-result="${item.result}">
                                        <button type="button" class="lesson21-m-base-button" data-base="${item.base}" data-result="${item.result}" onclick="speakLesson21MIntroLetter(this)" aria-label="기본 글자 ${item.base} 소리 듣기">
                                            <span class="lesson21-m-display-letter">${item.base}</span>
                                            <span class="lesson21-m-listen-label" aria-hidden="true">눌러서 들어요</span>
                                        </button>
                                        <div class="lesson21-m-writing-cell">
                                            <canvas id="lesson21-${batchim}-trace-${itemIndex}" class="lesson21-m-trace-canvas" data-index="${itemIndex}" data-base="${item.base}" data-result="${item.result}" data-batchim="${batchim}" tabindex="0" aria-label="${item.base} 아래에 ${batchim} 받침 따라쓰기"></canvas>
                                            <span class="lesson21-m-cell-hint">1번부터 써요</span>
                                            <span class="lesson21-m-moving-batchim" aria-hidden="true"><small>+</small>${batchim}</span>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </section>
                `).join('')}
            </div>
            <div class="lesson21-tip lesson21-m-tip">번호와 화살표를 보고 1번부터 차례로 ${batchim} 받침을 써 보세요.</div>
        </div>
    `;
}

function renderLesson21IntroPage(batchim) {
    const config = getLesson21BatchimConfig(batchim);
    const rows = [config.intro.slice(0, 5), config.intro.slice(5)];
    return `
        <div class="lesson21-page lesson21-intro-page lesson21-follow-page">
            <div class="lesson21-instruction"><strong>따라하기</strong> · 받침을 넣어 발음하기</div>
            <div class="lesson21-follow-table lesson21-reference-table" role="table" aria-label="${config.label} 받침을 넣어 발음하기">
                ${rows.map((row, rowIndex) => `
                    <div class="lesson21-follow-block" role="rowgroup">
                        <div class="lesson21-follow-row lesson21-reference-base-row" role="row">
                            <span class="lesson21-reference-corner" aria-hidden="true"></span>
                            ${row.map((item) => `<button type="button" class="lesson21-follow-result lesson21-reference-base" onclick="speakLesson13Word('${item.base}', this)" aria-label="${item.base} 소리 듣기">${item.base}</button>`).join('')}
                        </div>
                        <div class="lesson21-follow-row lesson21-reference-write-row" role="row">
                            <span class="lesson21-follow-label">${batchim}</span>
                            ${row.map((item, index) => `
                                <div class="lesson21-reference-write-cell">
                                    <canvas id="lesson21-reference-${batchim}-${rowIndex}-${index}" class="trace-writing-canvas lesson21-inline-writing-canvas" data-guide="${batchim}" aria-label="${item.result}의 ${batchim} 받침 쓰기"></canvas>
                                    <button type="button" class="lesson21-reference-sound" onclick="speakLesson13Word('${item.result}', this)" aria-label="${item.result} 소리 듣기">🔊</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="lesson21-tip">파란 칸을 눌러 ${batchim} 받침을 직접 써 보세요. 완성된 글자를 누르면 소리를 들을 수 있어요.</div>
        </div>
    `;
}

function renderLesson21WritingCell(lessonId, batchim, word, index, mode) {
    const base = Array.from(word)[0];
    return `
        <div class="lesson21-write-cell ${mode === 'practice' ? 'is-practice' : ''}">
            <button type="button" class="lesson21-shadow-word" onclick="speakLesson13Word('${word}', this)" aria-label="${word} 소리 듣기">
                <span>${base}</span><span class="lesson21-shadow-batchim">${batchim}</span>
            </button>
            <canvas id="lesson21-write-${batchim}-${mode}-${index}" class="trace-writing-canvas lesson21-mini-canvas" data-guide="${batchim}" aria-label="${word}의 ${batchim} 받침 쓰기"></canvas>
            <button type="button" class="lesson21-write-done" onclick="recordLesson21BatchimWrite('${lessonId}', '${batchim}', '${word}', this)">썼어요</button>
        </div>
    `;
}

function addLesson21FinalBatchim(base, batchim) {
    const finalIndexMap = { 'ㄱ': 1, 'ㄴ': 4, 'ㄷ': 7, 'ㄹ': 8, 'ㅁ': 16, 'ㅂ': 17, 'ㅇ': 21 };
    const finalIndex = finalIndexMap[batchim];
    const code = base?.charCodeAt?.(0) - 0xAC00;
    if (!finalIndex || code < 0 || code > 11171 || code % 28 !== 0) return base;
    return String.fromCharCode(base.charCodeAt(0) + finalIndex);
}

function removeLesson21FinalBatchim(syllable, batchim) {
    const finalIndexMap = { 'ㄱ': 1, 'ㄴ': 4, 'ㄷ': 7, 'ㄹ': 8, 'ㅁ': 16, 'ㅂ': 17, 'ㅇ': 21 };
    const finalIndex = finalIndexMap[batchim];
    const code = syllable?.charCodeAt?.(0) - 0xAC00;
    if (!finalIndex || code < 0 || code > 11171 || code % 28 !== finalIndex) return syllable;
    return String.fromCharCode(syllable.charCodeAt(0) - finalIndex);
}

const LESSON21_MIXED_PRACTICE_ROWS = [
    ['가', '나', '다', '라', '마', '바', '사', '아', '자', '차', '카', '타', '파', '하'],
    ['거', '너', '더', '러', '머', '버', '서', '어', '저', '처', '커', '터', '퍼', '허'],
    ['고', '노', '도', '로', '모', '보', '소', '오', '조', '초', '코', '토', '포', '호'],
    ['구', '누', '두', '루', '무', '부', '수', '우', '주', '추', '쿠', '투', '푸', '후'],
    ['그', '느', '드', '르', '므', '브', '스', '으', '즈', '츠', '크', '트', '프', '흐'],
    ['기', '니', '디', '리', '미', '비', '시', '이', '지', '치', '키', '티', '피', '히']
];

function shuffleLesson21Items(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
}

function createLesson21MixedPracticeLayout(practiceBatchim = 'ㅁ') {
    const selectedBatchim = normalizeLessonBatchim(practiceBatchim);
    const displayedRowIndexes = shuffleLesson21Items([0, 1, 2, 3, 4, 5]).slice(0, 3).sort((a, b) => a - b);
    const rowCounts = shuffleLesson21Items([6, 7, 7]);
    let selectedByRow = null;

    for (let attempt = 0; attempt < 200 && !selectedByRow; attempt += 1) {
        const columnCounts = Array(14).fill(0);
        const candidateRows = [];
        let valid = true;
        for (let displayRowIndex = 0; displayRowIndex < 3; displayRowIndex += 1) {
            const desired = rowCounts[displayRowIndex];
            const candidates = shuffleLesson21Items(Array.from({ length: 14 }, (_, index) => index))
                .sort((a, b) => columnCounts[a] - columnCounts[b]);
            const picked = [];
            for (const columnIndex of candidates) {
                if (columnCounts[columnIndex] >= 2) continue;
                const next = [...picked, columnIndex].sort((a, b) => a - b);
                const hasFourTogether = next.some((value, index) => index >= 3
                    && value - next[index - 1] === 1
                    && next[index - 1] - next[index - 2] === 1
                    && next[index - 2] - next[index - 3] === 1);
                if (hasFourTogether) continue;
                picked.push(columnIndex);
                if (picked.length === desired) break;
            }
            if (picked.length !== desired) {
                valid = false;
                break;
            }
            picked.forEach((columnIndex) => { columnCounts[columnIndex] += 1; });
            candidateRows.push(picked.sort((a, b) => a - b));
        }
        if (valid) selectedByRow = candidateRows;
    }

    if (!selectedByRow) selectedByRow = [[0, 2, 5, 7, 10, 13], [1, 3, 5, 7, 9, 11, 13], [0, 2, 4, 6, 8, 10, 12]];
    const targetBatchims = Array(20).fill(selectedBatchim);
    const targets = new Map();
    let targetIndex = 0;
    selectedByRow.forEach((columns, displayRowIndex) => {
        const rowIndex = displayedRowIndexes[displayRowIndex];
        columns.forEach((columnIndex) => {
            targets.set(`${rowIndex}-${columnIndex}`, { batchim: targetBatchims[targetIndex], targetIndex });
            targetIndex += 1;
        });
    });
    return {
        rows: displayedRowIndexes.map((rowIndex) => ({ rowIndex, syllables: LESSON21_MIXED_PRACTICE_ROWS[rowIndex] })),
        targets
    };
}

function renderLesson21MPracticePage(lessonId, practiceBatchim = 'ㅁ') {
    const selectedBatchim = normalizeLessonBatchim(practiceBatchim);
    const layout = createLesson21MixedPracticeLayout(selectedBatchim);
    const targets = layout.targets;
    const instruction = `소리를 듣고 빈칸에 ${selectedBatchim} 받침을 써 보세요.`;
    const detail = `${selectedBatchim} 받침을 쓰는 칸 20개가 세 줄에 숨어 있어요.`;
    const boardLabel = `${selectedBatchim} 받침`;
    const progressInstruction = `색칠된 칸을 눌러 소리를 듣고, 빈칸에 ${selectedBatchim} 받침을 써 보세요.`;
    return `
        <div class="lesson21-page lesson21-follow-page lesson21-m-practice-page" data-lesson21-m-practice="${lessonId}" data-lesson21-practice-batchim="${selectedBatchim}">
            <div class="lesson21-m-practice-instruction">
                <span><strong>${instruction}</strong><small>${detail}</small></span>
                <button type="button" class="lesson21-m-shuffle-button" onclick="restartLesson21MixedPractice()" aria-label="받침 연습 칸 다시 섞기">↻ <span>다시 섞기</span></button>
            </div>
            <div class="lesson21-m-board-scroller" tabindex="0" aria-label="받침 연습표, 화면이 좁으면 좌우로 이동할 수 있습니다">
            <div class="lesson21-m-syllable-board" role="grid" aria-label="무작위 세 줄로 제시된 ${boardLabel} 연습 음절 42개">
                ${layout.rows.map(({ rowIndex, syllables: row }) => `
                    <div class="lesson21-m-syllable-row" role="row" aria-label="${['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'][rowIndex]} 계열">
                        ${row.map((base, colIndex) => {
                            const target = targets.get(`${rowIndex}-${colIndex}`);
                            const batchim = target?.batchim || selectedBatchim;
                            const result = addLesson21FinalBatchim(base, batchim);
                            if (!target) return `<button type="button" class="lesson21-m-syllable-cell is-reading" role="gridcell" aria-label="${result} 소리 듣기" onclick="speakLesson13Word('${result}', this)"><span class="lesson21-m-cell-letter">${result}</span><span class="lesson21-m-read-label">읽기</span></button>`;
                            return `<div class="lesson21-m-syllable-cell is-target ${target.targetIndex === 0 ? 'is-first-target is-selected' : ''}" role="gridcell" data-target-index="${target.targetIndex}" data-base="${base}" data-batchim="${batchim}" data-result="${result}" aria-current="${target.targetIndex === 0 ? 'true' : 'false'}">
                                <button type="button" class="lesson21-m-cell-sound" onclick="selectLesson21MixedPracticeCell(this)" aria-label="${result} 소리 듣기">
                                    <span class="lesson21-m-cell-letter">${base}</span><span class="lesson21-m-sound-mark" aria-hidden="true">🔊</span>
                                </button>
                                <canvas class="trace-writing-canvas lesson21-m-inline-canvas" data-guide="${batchim}" data-lesson21-mixed-target="${target.targetIndex}" data-base="${base}" data-batchim="${batchim}" data-result="${result}" tabindex="0" aria-label="${result}의 ${batchim} 받침 획순 따라쓰기"></canvas>
                                <span class="lesson21-m-cell-action">${batchim} 쓰기</span>
                            </div>`;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
            </div>
            <div class="lesson21-m-progress-panel" aria-live="polite">
                <div class="lesson21-m-progress-copy">
                    <span id="lesson21-m-progress-text">${progressInstruction}</span>
                    <strong id="lesson21-m-progress-count">받침 쓰기 0 / 20</strong>
                </div>
                <div class="lesson21-m-progress-track" role="progressbar" aria-label="${boardLabel} 연습 진행도" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0">
                    <span id="lesson21-m-progress-fill"></span>
                </div>
            </div>
        </div>
    `;
}

function renderLesson21FollowPage(lessonId, batchim) {
    const config = getLesson21BatchimConfig(batchim);
    const targetPositions = [1, 4, 7, 10, 13, 15, 18, 21, 24, 27, 29, 32, 35, 38, 41, 43, 46, 49, 52, 55];
    const targets = config.writeItems;
    return `
        <div class="lesson21-page lesson21-follow-page lesson21-shaded-practice-page">
            <div class="lesson21-instruction"><strong>연습하기</strong> · 음영이 있는 글씨에 ${batchim} 받침을 써 보세요.</div>
            <div class="lesson21-practice-rows lesson21-shaded-rows" aria-label="${batchim} 받침 음영 글씨 연습">
                ${config.practiceRows.map((row, rowIndex) => `
                    <div class="lesson21-practice-row" role="row">
                        ${row.map((base, colIndex) => {
                            const position = rowIndex * row.length + colIndex;
                            const targetIndex = targetPositions.indexOf(position);
                            const isTarget = targetIndex >= 0;
                            const word = isTarget ? targets[targetIndex] : base;
                            return `
                                <div class="lesson21-practice-syllable ${isTarget ? 'is-shaded' : ''}" role="cell">
                                    <button type="button" class="lesson21-practice-letter" onclick="speakLesson13Word('${isTarget ? word : base}', this)" aria-label="${isTarget ? `${word}를 듣고 ${batchim} 받침 쓰기` : `${base} 소리 듣기`}">${base}</button>
                                    ${isTarget ? `<canvas id="lesson21-shaded-${batchim}-${targetIndex}" class="trace-writing-canvas lesson21-shaded-writing-canvas" data-guide="${batchim}" aria-label="${word}의 ${batchim} 받침 쓰기"></canvas>` : '<span class="lesson21-small-slot" aria-hidden="true"></span>'}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
            <div class="lesson21-practice-note">음영 칸은 모두 <strong>20개</strong>예요. 각 칸을 눌러 소리를 듣고 받침을 써 보세요.</div>
        </div>
    `;
}

function renderLesson21PracticePage(lessonId, batchim) {
    const config = getLesson21BatchimConfig(batchim);
    return `
        <div class="lesson21-page lesson21-practice-page">
            <div class="lesson21-instruction"><strong>쓰기</strong> · 빈칸에 ${batchim} 받침을 직접 써 보세요.</div>
            <div class="lesson21-write-grid lesson21-practice-write-grid" aria-label="${batchim} 받침 20개 쓰기">
                ${config.writeItems.map((word, index) => renderLesson21WritingCell(lessonId, batchim, word, index, 'practice')).join('')}
            </div>
            <div class="lesson21-practice-note">파란 글쓰기 칸을 바로 눌러 쓰고, 다 쓴 뒤 <strong>썼어요</strong>를 눌러 기록해요.</div>
        </div>
    `;
}

const LESSON21_WORD_WRITING_ROWS = {
    'ㅁ': [
        [
            { word: '춤', syllables: [{ base: '추', result: '춤', write: true }] },
            { word: '염소', syllables: [{ base: '여', result: '염', write: true }, { base: '소' }] },
            { word: '하품', syllables: [{ base: '하' }, { base: '푸', result: '품', write: true }] },
            { word: '튀김', syllables: [{ base: '튀' }, { base: '기', result: '김', write: true }] }
        ],
        [
            { word: '냄비', syllables: [{ base: '내', result: '냄', write: true }, { base: '비' }] },
            { word: '아침', syllables: [{ base: '아' }, { base: '치', result: '침', write: true }] },
            { word: '부침개', syllables: [{ base: '부' }, { base: '치', result: '침', write: true }, { base: '개' }] }
        ]
    ],
    'ㅂ': [
        [
            { word: '탑', syllables: [{ base: '타', result: '탑', write: true }] },
            { word: '돕다', syllables: [{ base: '도', result: '돕', write: true }, { base: '다' }] },
            { word: '맵다', syllables: [{ base: '매', result: '맵', write: true }, { base: '다' }] },
            { word: '밉다', syllables: [{ base: '미', result: '밉', write: true }, { base: '다' }] }
        ],
        [
            { word: '접시', syllables: [{ base: '저', result: '접', write: true }, { base: '시' }] },
            { word: '대답', syllables: [{ base: '대' }, { base: '다', result: '답', write: true }] },
            { word: '무섭다', syllables: [{ base: '무' }, { base: '서', result: '섭', write: true }, { base: '다' }] }
        ]
    ],
    'ㅇ': [
        [
            { word: '흥', syllables: [{ base: '흐', result: '흥', write: true }] },
            { word: '지붕', syllables: [{ base: '지' }, { base: '부', result: '붕', write: true }] },
            { word: '동생', syllables: [{ base: '도', result: '동', write: true }, { base: '생' }] },
            { word: '세상', syllables: [{ base: '세' }, { base: '사', result: '상', write: true }] }
        ],
        [
            { word: '까꿍', syllables: [{ base: '까' }, { base: '꾸', result: '꿍', write: true }] },
            { word: '강', syllables: [{ base: '가', result: '강', write: true }] },
            { word: '방', syllables: [{ base: '바', result: '방', write: true }] }
        ]
    ],
    'ㄱ': [
        [
            { word: '국', syllables: [{ base: '구', result: '국', write: true }] },
            { word: '학교', syllables: [{ base: '하', result: '학', write: true }, { base: '교' }] },
            { word: '소식', syllables: [{ base: '소' }, { base: '시', result: '식', write: true }] },
            { word: '미역국', syllables: [{ base: '미' }, { base: '여', result: '역', write: true }, { base: '국' }] }
        ],
        [
            { word: '박수', syllables: [{ base: '바', result: '박', write: true }, { base: '수' }] },
            { word: '떡국', syllables: [{ base: '떠', result: '떡', write: true }, { base: '국' }] },
            { word: '약국', syllables: [{ base: '야', result: '약', write: true }, { base: '국' }] }
        ]
    ],
    'ㄴ': [
        [
            { word: '끈', syllables: [{ base: '끄', result: '끈', write: true }] },
            { word: '시원', syllables: [{ base: '시' }, { base: '워', result: '원', write: true }] },
            { word: '선반', syllables: [{ base: '서', result: '선', write: true }, { base: '반' }] },
            { word: '사촌', syllables: [{ base: '사' }, { base: '초', result: '촌', write: true }] }
        ],
        [
            { word: '화분', syllables: [{ base: '화' }, { base: '부', result: '분', write: true }] },
            { word: '언니', syllables: [{ base: '어', result: '언', write: true }, { base: '니' }] },
            { word: '태권도', syllables: [{ base: '태' }, { base: '궈', result: '권', write: true }, { base: '도' }] }
        ]
    ],
    'ㄹ': [
        [
            { word: '물', syllables: [{ base: '무', result: '물', write: true }] },
            { word: '구슬', syllables: [{ base: '구' }, { base: '스', result: '슬', write: true }] },
            { word: '얼굴', syllables: [{ base: '어', result: '얼', write: true }, { base: '굴' }] },
            { word: '콜라', syllables: [{ base: '코', result: '콜', write: true }, { base: '라' }] }
        ],
        [
            { word: '하늘', syllables: [{ base: '하' }, { base: '느', result: '늘', write: true }] },
            { word: '귤', syllables: [{ base: '규', result: '귤', write: true }] },
            { word: '마을', syllables: [{ base: '마' }, { base: '으', result: '을', write: true }] }
        ]
    ],
    'ㄷ': [
        [
            { word: '묻다', syllables: [{ base: '무', result: '묻', write: true }, { base: '다' }] },
            { word: '듣다', syllables: [{ base: '드', result: '듣', write: true }, { base: '다' }] },
            { word: '숟가락', syllables: [{ base: '수', result: '숟', write: true }, { base: '가' }, { base: '락' }] },
            { word: '싣다', syllables: [{ base: '시', result: '싣', write: true }, { base: '다' }] }
        ],
        [
            { word: '걷다', syllables: [{ base: '거', result: '걷', write: true }, { base: '다' }] },
            { word: '돋보기', syllables: [{ base: '도', result: '돋', write: true }, { base: '보' }, { base: '기' }] },
            { word: '닫다', syllables: [{ base: '다', result: '닫', write: true }, { base: '다' }] }
        ]
    ]
};

function renderLesson21BatchimWordWritingPage(lessonId, batchim = 'ㅁ') {
    const selectedBatchim = normalizeLessonBatchim(batchim);
    const rows = LESSON21_WORD_WRITING_ROWS[selectedBatchim];
    let writingIndex = 0;
    return `
        <div class="lesson21-page lesson21-b-word-writing-page" data-lesson21-b-word-writing="${lessonId}">
            <div class="lesson21-instruction"><strong>쓰기</strong> · 단어를 듣고 빈 받침 자리에 ${selectedBatchim}을 써 보세요.</div>
            <div class="lesson21-b-word-tip">처음에는 단어를 한 번에 듣고, 어려우면 받침 소리를 나누어 들어 보세요.</div>
            <div class="lesson21-b-word-rows" aria-label="찬찬한글 ${selectedBatchim} 받침 단어 쓰기">
                ${rows.map((row, rowIndex) => `
                    <div class="lesson21-b-word-row" role="group" aria-label="${selectedBatchim} 받침 단어 ${rowIndex + 1}번째 줄">
                        ${row.map((item) => `
                            <section class="lesson21-b-word-group" data-word="${item.word}" aria-label="${item.word} 쓰기">
                                <button type="button" class="lesson21-b-word-listen" onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 소리 듣기">🔊 <span>듣기</span></button>
                                <div class="lesson21-b-word-strip">
                                    ${item.syllables.map((syllable) => {
                                        if (!syllable.write) return `<div class="lesson21-b-word-syllable is-reading"><span class="lesson21-b-word-base">${syllable.base}</span><span class="lesson21-b-word-empty" aria-hidden="true"></span></div>`;
                                        const index = writingIndex++;
                                        return `<div class="lesson21-b-word-syllable is-writing" data-base="${syllable.base}" data-result="${syllable.result}">
                                            <span class="lesson21-b-word-base">${syllable.base}</span>
                                            <canvas class="trace-writing-canvas lesson21-b-word-canvas" data-guide="${selectedBatchim}" data-lesson21-compact-guide data-lesson21-b-word-target="${index}" data-word="${item.word}" data-base="${syllable.base}" data-result="${syllable.result}" data-fill-lesson="${lessonId}" data-fill-index="${index}" tabindex="0" aria-label="${item.word}의 빈 받침 자리에 ${selectedBatchim} 쓰기"></canvas>
                                            <span class="lesson21-b-word-status" aria-live="polite">${selectedBatchim} 쓰기</span>
                                        </div>`;
                                    }).join('')}
                                </div>
                            </section>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
            <div class="lesson21-b-word-progress" role="status" aria-live="polite">
                <span>주황색 점부터 차례로 ${selectedBatchim} 받침을 써 보세요.</span>
                <strong id="lesson21-b-word-progress-count">단어 쓰기 0 / 7</strong>
            </div>
        </div>
    `;
}

const LESSON21_PICTURE_WRITING_CONFIGS = {
    'ㅁ': {
        bank: ['름', '림', '김', '참'],
        items: [
            { word: '참외', icon: '🍈', parts: [{ text: '참', write: true }, { text: '외' }] },
            { word: '그림', icon: '🖼️', parts: [{ text: '그' }, { text: '림', write: true }] },
            { word: '김치', icon: '🥬', parts: [{ text: '김', write: true }, { text: '치' }] },
            { word: '구름', icon: '☁️', parts: [{ text: '구' }, { text: '름', write: true }] }
        ]
    },
    'ㅂ': {
        bank: ['첩', '집', '접', '랍'],
        items: [
            { word: '접시', icon: '🍽️', parts: [{ text: '접', write: true }, { text: '시' }] },
            { word: '수첩', icon: '📒', parts: [{ text: '수' }, { text: '첩', write: true }] },
            { word: '집게', icon: '🗜️', parts: [{ text: '집', write: true }, { text: '게' }] },
            { word: '서랍', icon: '🗄️', parts: [{ text: '서' }, { text: '랍', write: true }] }
        ]
    },
    'ㅇ': {
        bank: ['풍', '상', '멍', '망'],
        items: [
            { word: '풍선', icon: '🎈', parts: [{ text: '풍', write: true }, { text: '선' }] },
            { word: '책상', icon: '🪑', parts: [{ text: '책' }, { text: '상', write: true }] },
            { word: '멍게', icon: '🐚', parts: [{ text: '멍', write: true }, { text: '게' }] },
            { word: '희망', icon: '⭐', parts: [{ text: '희' }, { text: '망', write: true }] }
        ]
    },
    'ㄱ': {
        bank: ['족', '박', '축', '학'],
        items: [
            { word: '가족', icon: '👪', parts: [{ text: '가' }, { text: '족', write: true }] },
            { word: '호박', icon: '🎃', parts: [{ text: '호' }, { text: '박', write: true }] },
            { word: '축구', icon: '⚽', parts: [{ text: '축', write: true }, { text: '구' }] },
            { word: '학교', icon: '🏫', parts: [{ text: '학', write: true }, { text: '교' }] }
        ]
    },
    'ㄴ': {
        bank: ['분', '산', '린', '잔'],
        items: [
            { word: '분수', icon: '⛲', parts: [{ text: '분', write: true }, { text: '수' }] },
            { word: '산', icon: '⛰️', parts: [{ text: '산', write: true }] },
            { word: '기린', icon: '🦒', parts: [{ text: '기' }, { text: '린', write: true }] },
            { word: '찻잔', icon: '☕', parts: [{ text: '찻' }, { text: '잔', write: true }] }
        ]
    },
    'ㄹ': {
        bank: ['물', '슬', '굴', '콜'],
        items: [
            { word: '물', icon: '💧', parts: [{ text: '물', write: true }] },
            { word: '구슬', icon: '🔮', parts: [{ text: '구' }, { text: '슬', write: true }] },
            { word: '얼굴', icon: '🙂', parts: [{ text: '얼' }, { text: '굴', write: true }] },
            { word: '콜라', icon: '🥤', parts: [{ text: '콜', write: true }, { text: '라' }] }
        ]
    },
    'ㄷ': {
        bank: ['걷', '닫', '돋'],
        items: [
            { word: '걷다', icon: '🚶', parts: [{ text: '걷', write: true }, { text: '다' }] },
            { word: '닫다', icon: '🚪', parts: [{ text: '닫', write: true }, { text: '다' }] },
            { word: '돋보기', icon: '🔍', parts: [{ text: '돋', write: true }, { text: '보' }, { text: '기' }] }
        ]
    }
};

function renderLesson21MPictureWritingPage(lessonId, batchim = 'ㅁ') {
    const selectedBatchim = normalizeLessonBatchim(batchim);
    const config = LESSON21_PICTURE_WRITING_CONFIGS[selectedBatchim];
    const targetCount = config.items.length;
    let writingIndex = 0;
    return `
        <div class="lesson21-page lesson21-m-picture-writing-page" data-lesson21-m-picture-writing="${lessonId}" data-batchim="${selectedBatchim}">
            <div class="lesson21-instruction"><strong>단어 찾기</strong> · 보기를 보고 그림에 어울리는 단어를 써 보세요.</div>
            <div class="lesson21-m-picture-tip">그림의 이름을 듣고, <strong>하늘색 칸만</strong> 직접 써요.</div>
            <section class="lesson21-m-picture-bank" aria-label="보기 글자">
                <span class="lesson21-m-picture-bank-label">보기</span>
                <div class="lesson21-m-picture-bank-items">
                    ${config.bank.map((letter) => `<button type="button" onclick="speakLesson13Word('${letter}', this)" aria-label="${letter} 소리 듣기">${letter}</button>`).join('')}
                </div>
            </section>
            <div class="lesson21-m-picture-grid" aria-label="그림 보고 ${selectedBatchim} 받침 글씨 쓰기">
                ${config.items.map((item) => `
                    <section class="lesson21-m-picture-item" data-word="${item.word}" aria-label="${item.word} 쓰기">
                        <button type="button" class="lesson21-m-picture-image" onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 그림, 소리 듣기">
                            <span aria-hidden="true">${item.icon}</span>
                            <small>🔊 ${item.word} 듣기</small>
                        </button>
                        <div class="lesson21-m-picture-word" aria-label="${item.word}">
                            ${item.parts.map((part) => {
                                if (!part.write) return `<span class="lesson21-m-picture-printed">${part.text}</span>`;
                                const index = writingIndex++;
                                return `<span class="lesson21-m-picture-write-cell is-whole-syllable" data-letter="${part.text}">
                                    <canvas class="trace-writing-canvas lesson21-m-picture-canvas" data-guide="${part.text}" data-trace-hide-label data-lesson21-m-picture-target="${index}" data-word="${item.word}" data-letter="${part.text}" data-fill-lesson="${lessonId}" data-fill-index="${index}" tabindex="0" aria-label="하늘색 칸에 ${part.text} 전체 글자 쓰기"></canvas>
                                    <span class="lesson21-m-picture-write-status" aria-live="polite">${part.text} 쓰기</span>
                                </span>`;
                            }).join('')}
                        </div>
                    </section>
                `).join('')}
            </div>
            <div class="lesson21-m-picture-progress" role="status" aria-live="polite">
                <span>하늘색 칸은 ${targetCount}곳이에요. 보기의 글자를 찾아 천천히 써 보세요.</span>
                <strong id="lesson21-m-picture-progress-count">글씨 쓰기 0 / ${targetCount}</strong>
            </div>
        </div>
    `;
}

function renderLesson21WordFindPage(lessonId, batchim) {
    const config = getLesson21BatchimConfig(batchim);
    return `
        <div class="lesson21-page lesson21-word-find-page">
            <div class="lesson21-instruction"><strong>단어 찾기</strong> · 그림을 보고 알맞은 단어를 골라요. 그림을 누르면 두 단어를 모두 읽어 줘요.</div>
            <div class="lesson21-word-find-grid">
                ${config.wordFind.map((item, index) => `
                    <div class="lesson21-word-find-card" data-lesson21-word-card="${batchim}-${index}">
                        <button type="button" class="lesson21-word-picture" onclick="speakLesson21WordChoices('${item.word}', '${item.choices[1]}', this)" aria-label="${item.word}와 ${item.choices[1]} 소리 듣기">${item.icon}</button>
                        <div class="lesson21-word-choice-grid">
                            ${item.choices.map((choice) => `<button type="button" class="lesson21-word-choice" onclick="selectLesson21Word('${lessonId}', '${batchim}', '${item.word}', '${choice}', this)">${choice}</button>`).join('')}
                        </div>
                        <div class="lesson21-word-feedback" aria-live="polite"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function renderLesson21ChallengePage(lessonId, batchim) {
    const config = getLesson21BatchimConfig(batchim);
    return `
        <div class="lesson21-page lesson21-challenge-page">
            <div class="lesson21-instruction"><strong>도전하기</strong> · 스스로 정확하게 읽고, 읽은 낱말을 눌러 표시해요.</div>
            <div class="lesson21-challenge-list">
                ${config.challenge.map((level, levelIndex) => `
                    <div class="lesson21-challenge-row">
                        <span class="lesson21-challenge-level">${level.label}</span>
                        <div class="lesson21-challenge-words">
                            ${level.words.map((word, wordIndex) => `<button type="button" class="lesson21-challenge-word" onclick="speakLesson13Word('${word}', this)">${word}</button>`).join('')}
                        </div>
                        <button type="button" class="lesson21-challenge-done" onclick="recordLesson21ChallengeRead('${lessonId}', '${batchim}', '${level.label}', this)">${level.count}개 읽었어요</button>
                    </div>
                `).join('')}
            </div>
            <div class="lesson21-challenge-tip">단계별 낱말을 천천히 읽고, 자신 있게 읽었을 때 확인해요.</div>
        </div>
    `;
}

function renderLesson21Page(lessonId, batchim, pageIndex) {
    if (pageIndex === 0) return renderLesson21MBatchimIntroPage(lessonId, batchim);
    if (pageIndex === 1) return renderLesson21MPracticePage(lessonId, batchim);
    if (pageIndex === 2) return renderLesson21BatchimWordWritingPage(lessonId, batchim);
    if (pageIndex === 3) return renderLesson21MPictureWritingPage(lessonId, batchim);
    return renderLesson21ChallengePage(lessonId, batchim);
}

const LESSON25_LISTEN_CHOICE_QUESTIONS = [
    { choices: ['암', '앙'], answer: '암' },
    { choices: ['앋', '압'], answer: '앋' },
    { choices: ['안', '알'], answer: '알' },
    { choices: ['앙', '알'], answer: '앙' },
    { choices: ['임', '입'], answer: '입' },
    { choices: ['익', '잉'], answer: '잉' },
    { choices: ['잉', '일'], answer: '일' },
    { choices: ['임', '읻'], answer: '읻' },
    { choices: ['읍', '은'], answer: '읍' },
    { choices: ['읻', '윽'], answer: '윽' },
    { choices: ['운', '움'], answer: '움' },
    { choices: ['울', '웁'], answer: '웁' },
    { choices: ['억', '업'], answer: '억' },
    { choices: ['엉', '언'], answer: '언' },
    { choices: ['올', '옥'], answer: '옥' },
    { choices: ['온', '옫'], answer: '온' },
    { choices: ['양', '약'], answer: '약' },
    { choices: ['용', '욜'], answer: '욜' },
    { choices: ['역', '엳'], answer: '역' },
    { choices: ['윰', '윧'], answer: '윧' }
];

function renderLesson25ListenChoicePage(pageIndex = 0) {
    const startIndex = pageIndex * 10;
    const pageQuestions = LESSON25_LISTEN_CHOICE_QUESTIONS.slice(startIndex, startIndex + 10);
    return `
        <div class="lesson25-listen-page" data-lesson25-listen-page data-page-start="${startIndex}" data-page-total="${pageQuestions.length}">
            <div class="lesson25-listen-guide">
                <strong>듣고 찾기</strong>
                <span>문제 소리를 듣고 두 글자 중 알맞은 글자를 골라 ○표 해 보세요.</span>
            </div>
            <div class="lesson25-listen-progress" role="status" aria-live="polite">
                <span id="lesson25-listen-progress-text">${startIndex + 1}번부터 문제 소리를 들어 보세요.</span>
                <strong id="lesson25-listen-progress-count">푼 문제 0 / ${pageQuestions.length}</strong>
            </div>
            <div class="lesson25-question-grid" aria-label="받침 소리 듣고 알맞은 글자 고르기 ${startIndex + 1}번부터 ${startIndex + pageQuestions.length}번">
                ${pageQuestions.map((question, localIndex) => {
                    const questionIndex = startIndex + localIndex;
                    return `
                    <section class="lesson25-question-card ${localIndex === 0 ? 'is-current' : ''}" data-lesson25-question="${questionIndex}" data-answer="${question.answer}" aria-label="${questionIndex + 1}번 문제">
                        <div class="lesson25-question-head">
                            <span class="lesson25-question-number">${questionIndex + 1}</span>
                            <button type="button" class="lesson25-question-sound" onclick="playLesson25QuestionSound(${questionIndex}, this)" aria-label="${questionIndex + 1}번 문제 소리 듣기">🔊 <span>문제 소리 듣기</span></button>
                        </div>
                        <div class="lesson25-choice-pair" role="group" aria-label="${questionIndex + 1}번 글자 선택">
                            ${question.choices.map((choice) => `<button type="button" class="lesson25-choice-button" onclick="selectLesson25Answer(${questionIndex}, '${choice}', this)" aria-label="${choice} 선택"><span>${choice}</span><small aria-hidden="true">(　)</small></button>`).join('')}
                        </div>
                        <p class="lesson25-question-feedback" aria-live="polite">소리를 듣고 골라요.</p>
                    </section>
                `;}).join('')}
            </div>
        </div>
    `;
}

window.playLesson25QuestionSound = function playLesson25QuestionSound(index, button) {
    const question = LESSON25_LISTEN_CHOICE_QUESTIONS[index];
    const card = button?.closest('.lesson25-question-card');
    if (!question || !card) return;
    document.querySelectorAll('.lesson25-question-card').forEach((item) => item.classList.toggle('is-current', item === card));
    card.classList.add('is-playing');
    window.setTimeout(() => card.classList.remove('is-playing'), 850);
    speakTextKo(question.answer);
};

window.selectLesson25Answer = async function selectLesson25Answer(index, selected, button) {
    const question = LESSON25_LISTEN_CHOICE_QUESTIONS[index];
    const card = button?.closest('.lesson25-question-card');
    if (!question || !card || card.classList.contains('is-complete')) return;
    const isCorrect = selected === question.answer;
    const feedback = card.querySelector('.lesson25-question-feedback');
    card.querySelectorAll('.lesson25-choice-button').forEach((choice) => choice.classList.remove('is-try-again'));

    await recordKoreanAttempt({
        lessonId: 25,
        lessonTitle: '배움 25: 도전, 받침왕! (1)',
        unitId: getUnitIdForLesson(25),
        activityType: 'listenAndFind',
        word: question.answer,
        answer: question.answer,
        userAnswer: selected,
        isCorrect,
        retryIndex: isCorrect ? 0 : nextKoreanRetryIndex({ lessonId: 25, activityType: 'listenAndFind', answer: question.answer }),
        errorType: isCorrect ? null : KOREAN_ERROR_TYPES.BATCHIM
    });

    if (!isCorrect) {
        button.classList.add('is-try-again');
        if (feedback) feedback.textContent = '다시 소리를 듣고 골라 보세요.';
        speakTextKo('다시 들어 보아요.');
        return;
    }

    resetKoreanRetryIndex({ lessonId: 25, activityType: 'listenAndFind', answer: question.answer });
    card.classList.add('is-complete');
    card.classList.remove('is-current');
    button.classList.add('is-correct');
    button.querySelector('small').textContent = '( ○ )';
    card.querySelectorAll('.lesson25-choice-button').forEach((choice) => {
        choice.disabled = true;
        if (choice !== button) choice.classList.add('is-not-answer');
    });
    if (feedback) feedback.textContent = `맞았어요! ${question.answer}이에요.`;
    speakTextKo(`${question.answer}. 맞았어요.`);

    const page = card.closest('[data-lesson25-listen-page]');
    const completed = page.querySelectorAll('.lesson25-question-card.is-complete').length;
    const pageTotal = Number(page.dataset.pageTotal) || 10;
    const count = page.querySelector('#lesson25-listen-progress-count');
    const progressText = page.querySelector('#lesson25-listen-progress-text');
    if (count) count.textContent = `푼 문제 ${completed} / ${pageTotal}`;
    const nextCard = page.querySelector('.lesson25-question-card:not(.is-complete)');
    if (nextCard) {
        nextCard.classList.add('is-current');
        if (progressText) progressText.textContent = `${Number(nextCard.dataset.lesson25Question) + 1}번 문제 소리를 들어 보세요.`;
    } else if (progressText) {
        progressText.textContent = `참 잘했어요! ${pageTotal}문제를 모두 풀었어요.`;
    }
};

const LESSON25_READING_LINES = [
    ['으음 음', '으읍 읍'],
    ['으은 은', '으읃 읃'],
    ['으응 응', '으윽 윽'],
    ['으울 울', '잉잉 인'],
    ['알알 앙', '언언 엄'],
    ['옴옴 옹', '응응 을'],
    ['얼열 언', '암얌 양'],
    ['임임 입', '잉잉 익'],
    ['언언 얼', '입입 임'],
    ['익익 잉', '얼얼 언']
];

function renderLesson25ReadingPage() {
    return `
        <div class="lesson25-reading-page" data-lesson25-reading-page>
            <div class="lesson25-reading-guide">
                <strong>읽기</strong>
                <span>한 줄을 눌러 소리를 듣고, 같은 줄을 천천히 소리 내어 읽어 보세요.</span>
            </div>
            <div class="lesson25-reading-progress" role="status" aria-live="polite">
                <span id="lesson25-reading-progress-text">위에서부터 한 줄씩 읽어 보세요.</span>
                <strong id="lesson25-reading-progress-count">읽은 줄 0 / 20</strong>
            </div>
            <div class="lesson25-reading-table" role="table" aria-label="한 줄씩 소리 내어 읽기">
                <div class="lesson25-reading-header" role="row">
                    <span role="columnheader">문제</span><span role="columnheader">확인</span>
                    <span role="columnheader">문제</span><span role="columnheader">확인</span>
                </div>
                ${LESSON25_READING_LINES.map((pair, rowIndex) => `
                    <div class="lesson25-reading-row" role="row">
                        ${pair.map((line, sideIndex) => {
                            const lineIndex = rowIndex * 2 + sideIndex;
                            return `
                                <button type="button" class="lesson25-reading-line" onclick="playLesson25ReadingLine(${rowIndex}, ${sideIndex}, this)" aria-label="${line} 소리 듣기">
                                    <span aria-hidden="true">🔊</span><strong>${line}</strong>
                                </button>
                                <button type="button" class="lesson25-reading-check" onclick="confirmLesson25ReadingLine(${lineIndex}, this)" aria-label="${line} 읽기 확인">읽었어요</button>
                            `;
                        }).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

window.playLesson25ReadingLine = function playLesson25ReadingLine(rowIndex, sideIndex, button) {
    const line = LESSON25_READING_LINES[rowIndex]?.[sideIndex];
    if (!line || !button) return;
    document.querySelectorAll('.lesson25-reading-line').forEach((item) => item.classList.toggle('is-playing', item === button));
    speakTextKo(line, () => button.classList.remove('is-playing'), { playbackRate: 0.82 });
};

window.confirmLesson25ReadingLine = function confirmLesson25ReadingLine(lineIndex, button) {
    if (!button || button.classList.contains('is-complete')) return;
    const page = button.closest('[data-lesson25-reading-page]');
    const rowIndex = Math.floor(lineIndex / 2);
    const sideIndex = lineIndex % 2;
    const line = LESSON25_READING_LINES[rowIndex]?.[sideIndex];
    if (!page || !line) return;

    button.classList.add('is-complete');
    button.textContent = '○ 읽었어요';
    button.disabled = true;
    button.previousElementSibling?.classList.add('is-complete');
    const completed = page.querySelectorAll('.lesson25-reading-check.is-complete').length;
    const count = page.querySelector('#lesson25-reading-progress-count');
    const text = page.querySelector('#lesson25-reading-progress-text');
    if (count) count.textContent = `읽은 줄 ${completed} / 20`;
    if (text) text.textContent = completed === 20
        ? '참 잘했어요! 20줄을 모두 읽었어요.'
        : `${completed}줄을 읽었어요. 다음 줄도 천천히 읽어 보세요.`;
    recordKoreanAttempt({
        lessonId: 25,
        lessonTitle: '배움 25: 도전, 받침왕! (1)',
        unitId: getUnitIdForLesson(25),
        activityType: 'readThreeTimes',
        word: line,
        answer: line,
        userAnswer: '소리 내어 읽기 완료',
        isCorrect: true,
        errorType: null
    }).catch(() => {});
};

const LESSON25_PATH_GAME_STAGES = [
    { icon: '🏔️', label: '산 그림', choices: ['산', '상'], answer: '산' },
    { icon: '🪢', label: '줄 그림', choices: ['준', '줄'], answer: '줄' },
    { icon: '🍚', label: '밥 그림', choices: ['밤', '밥'], answer: '밥' },
    { icon: '🥛', label: '물 그림', choices: ['물', '문'], answer: '물' },
    { icon: '⭐', label: '별 그림', choices: ['별', '변'], answer: '별' },
    { icon: '✋', label: '손 그림', choices: ['손', '솔'], answer: '손' },
    { icon: '💃', label: '춤 그림', choices: ['춘', '춤'], answer: '춤' },
    { icon: '🍊', label: '귤 그림', choices: ['귤', '균'], answer: '귤' },
    { icon: '📕', label: '책 그림', choices: ['책', '챔'], answer: '책' },
    { icon: '🤴', label: '왕 그림', choices: ['왐', '왕'], answer: '왕' }
];

function renderLesson25PathGame() {
    return `
        <div class="lesson25-path-game" data-lesson25-path-game>
            <div class="lesson25-path-guide">
                <span class="lesson25-path-start">출발</span>
                <strong>그림에 알맞은 글자를 골라 길을 따라가요.</strong>
                <button type="button" class="lesson25-path-reset" onclick="resetLesson25PathGame()" aria-label="받침왕 길 찾기 다시 시작">↻ 다시 시작</button>
            </div>
            <div class="lesson25-path-progress" role="status" aria-live="polite">
                <span id="lesson25-path-message">첫 번째 그림을 보고 알맞은 글자를 골라 보세요.</span>
                <strong id="lesson25-path-count">도착까지 0 / 10</strong>
            </div>
            <div class="lesson25-path-board" aria-label="그림 글자 길 찾기 10단계">
                ${LESSON25_PATH_GAME_STAGES.map((stage, index) => `
                    <section class="lesson25-path-stage ${index === 0 ? 'is-current' : 'is-locked'}" data-path-stage="${index}" aria-label="${index + 1}단계 ${stage.label}" aria-disabled="${index === 0 ? 'false' : 'true'}">
                        <span class="lesson25-path-step">${index + 1}</span>
                        <span class="lesson25-path-token" aria-hidden="true">★</span>
                        <div class="lesson25-path-picture" role="img" aria-label="${stage.label}">${stage.icon}</div>
                        <div class="lesson25-path-choices" role="group" aria-label="${stage.label}에 알맞은 글자 선택">
                            ${stage.choices.map((choice) => `<button type="button" onclick="selectLesson25PathAnswer(${index}, '${choice}', this)" ${index === 0 ? '' : 'disabled'}>${choice}</button>`).join('')}
                        </div>
                        <p class="lesson25-path-stage-feedback">${index === 0 ? '글자를 골라요.' : '앞의 길을 먼저 통과해요.'}</p>
                    </section>
                `).join('')}
            </div>
            <div class="lesson25-path-finish" aria-live="polite"><span>🏁</span><strong>도착</strong></div>
        </div>
    `;
}

window.selectLesson25PathAnswer = function selectLesson25PathAnswer(stageIndex, selected, button) {
    const stageData = LESSON25_PATH_GAME_STAGES[stageIndex];
    const stage = button?.closest('.lesson25-path-stage');
    const game = stage?.closest('[data-lesson25-path-game]');
    if (!stageData || !stage || !game || stage.classList.contains('is-locked') || stage.classList.contains('is-complete')) return;
    const feedback = stage.querySelector('.lesson25-path-stage-feedback');
    stage.querySelectorAll('.lesson25-path-choices button').forEach((choice) => choice.classList.remove('is-try-again'));
    const isCorrect = selected === stageData.answer;

    recordKoreanAttempt({
        lessonId: 25,
        lessonTitle: '배움 25: 도전, 받침왕! (1)',
        unitId: getUnitIdForLesson(25),
        activityType: 'wordPictureMatch',
        word: stageData.answer,
        answer: stageData.answer,
        userAnswer: selected,
        isCorrect,
        retryIndex: isCorrect ? 0 : nextKoreanRetryIndex({ lessonId: 25, activityType: 'wordPictureMatch', answer: stageData.answer }),
        errorType: isCorrect ? null : KOREAN_ERROR_TYPES.MEANING_MATCH
    }).catch(() => {});

    if (!isCorrect) {
        button.classList.add('is-try-again');
        if (feedback) feedback.textContent = '그림을 다시 보고 골라 보세요.';
        speakTextKo('다시 골라 보아요.');
        return;
    }

    resetKoreanRetryIndex({ lessonId: 25, activityType: 'wordPictureMatch', answer: stageData.answer });
    stage.classList.remove('is-current');
    stage.classList.add('is-complete');
    stage.setAttribute('aria-disabled', 'false');
    stage.querySelectorAll('.lesson25-path-choices button').forEach((choice) => {
        choice.disabled = true;
        choice.classList.toggle('is-correct', choice === button);
    });
    if (feedback) feedback.textContent = `○ ${stageData.answer}, 맞았어요!`;
    speakTextKo(`${stageData.answer}. 맞았어요.`);

    const completed = game.querySelectorAll('.lesson25-path-stage.is-complete').length;
    const count = game.querySelector('#lesson25-path-count');
    const message = game.querySelector('#lesson25-path-message');
    if (count) count.textContent = `도착까지 ${completed} / ${LESSON25_PATH_GAME_STAGES.length}`;
    const nextStage = game.querySelector(`.lesson25-path-stage[data-path-stage="${stageIndex + 1}"]`);
    if (nextStage) {
        nextStage.classList.remove('is-locked');
        nextStage.classList.add('is-current');
        nextStage.setAttribute('aria-disabled', 'false');
        nextStage.querySelectorAll('.lesson25-path-choices button').forEach((choice) => { choice.disabled = false; });
        const nextFeedback = nextStage.querySelector('.lesson25-path-stage-feedback');
        if (nextFeedback) nextFeedback.textContent = '글자를 골라요.';
        if (message) message.textContent = `${stageIndex + 2}번째 그림으로 이동했어요.`;
    } else {
        game.classList.add('is-finished');
        if (message) message.textContent = '참 잘했어요! 받침왕 길을 모두 통과했어요.';
        speakTextKo('도착! 받침왕 길을 모두 통과했어요.');
    }
};

window.resetLesson25PathGame = function resetLesson25PathGame() {
    renderLearningDetail(25, 3);
};

const LESSON26_READING_GROUPS = [
    {
        id: 'batchim-mb',
        title: 'ㅁ·ㅂ 받침 단어',
        batchims: ['ㅁ', 'ㅂ'],
        pictureItems: [
            { word: '염소', icon: '🐐' }, { word: '감자', icon: '🥔' },
            { word: '구름', icon: '☁️' }, { word: '수첩', icon: '🗒️' },
            { word: '집게', icon: '🥢' }, { word: '서랍', icon: '🗄️' }
        ],
        wordRows: [
            ['김치', '봄비', '잠수'], ['감기', '소금', '잠자리'],
            ['입구', '춥다', '줍다'], ['밥집', '몸집', '종이접기']
        ]
    },
    {
        id: 'batchim-ngk',
        title: 'ㅇ·ㄱ 받침 단어',
        batchims: ['ㅇ', 'ㄱ'],
        pictureItems: [
            { word: '강가', icon: '🏞️' }, { word: '야구공', icon: '⚾' },
            { word: '늑대', icon: '🐺' }, { word: '국자', icon: '🥄' },
            { word: '축구공', icon: '⚽' }, { word: '책상', icon: '🪑' }
        ],
        wordRows: [
            ['석가탑', '박수', '악어'], ['행복', '막대기', '떡국'],
            ['사랑', '호박', '옥수수'], ['태극기', '독수리', '백조']
        ]
    },
    {
        id: 'batchim-nld',
        title: 'ㄴ·ㄹ·ㄷ 받침 단어',
        batchims: ['ㄴ', 'ㄹ', 'ㄷ'],
        pictureItems: [
            { word: '기린', icon: '🦒' }, { word: '분수', icon: '⛲' },
            { word: '고릴라', icon: '🦍' }, { word: '갈매기', icon: '🕊️' },
            { word: '돋보기', icon: '🔍' }, { word: '걷다', icon: '🚶‍♀️' }
        ],
        wordRows: [
            ['버선', '변기', '만두'], ['눈사람', '원숭이', '병원'],
            ['겨울', '마을', '솔방울'], ['뜯다', '쏟다', '받침']
        ]
    }
];

const LESSON26_JONGSEONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

function renderLesson26BatchimWord(word, batchims) {
    const targets = new Set(batchims || []);
    return Array.from(word).map((syllable) => {
        const code = syllable.charCodeAt(0);
        const offset = code >= 0xac00 && code <= 0xd7a3 ? code - 0xac00 : -1;
        const jongseongIndex = offset >= 0 ? offset % 28 : 0;
        const jongseong = LESSON26_JONGSEONG[jongseongIndex] || '';
        return targets.has(jongseong)
            ? `<canvas class="lesson26-batchim-glyph" data-syllable="${syllable}" aria-hidden="true"></canvas>`
            : syllable;
    }).join('');
}

function initializeLesson26BatchimGlyphs() {
    document.querySelectorAll('.view-section:not(.hidden) .lesson26-batchim-glyph').forEach((canvas) => {
        const syllable = canvas.dataset.syllable || '';
        const rect = canvas.getBoundingClientRect();
        if (!syllable || rect.width < 4 || rect.height < 4) return;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const width = Math.max(32, Math.round(rect.width * dpr));
        const height = Math.max(32, Math.round(rect.height * dpr));
        canvas.width = width;
        canvas.height = height;

        const style = getComputedStyle(canvas);
        const fontSize = Number.parseFloat(style.fontSize) || rect.height;
        const fontWeight = style.fontWeight || '900';
        const fontFamily = style.fontFamily || "'Noto Sans KR', sans-serif";
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, rect.width, rect.height);
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#152f49';
        ctx.fillText(syllable, rect.width / 2, rect.height * 0.51);

        const pixels = ctx.getImageData(0, 0, width, height).data;
        const rowHasInk = new Array(height).fill(false);
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (pixels[(y * width + x) * 4 + 3] > 28) {
                    rowHasInk[y] = true;
                    break;
                }
            }
        }

        let bottomInk = height - 1;
        while (bottomInk > 0 && !rowHasInk[bottomInk]) bottomInk -= 1;
        const minGap = Math.max(2, Math.round(dpr * 1.3));
        let gap = 0;
        let splitRow = Math.round(height * 0.62);
        for (let y = bottomInk; y >= Math.round(height * 0.38); y -= 1) {
            if (rowHasInk[y]) {
                gap = 0;
            } else {
                gap += 1;
                if (gap >= minGap) {
                    splitRow = y + gap;
                    break;
                }
            }
        }

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, splitRow / dpr, rect.width, rect.height - splitRow / dpr);
        ctx.clip();
        ctx.fillStyle = '#e25224';
        ctx.fillText(syllable, rect.width / 2, rect.height * 0.51);
        ctx.restore();
        canvas.dataset.ready = 'true';
    });
}

const LESSON26_NONSENSE_ROWS = [
    ['섬씨', '곰버', '무섭'], ['봄비', '서집', '구그앱'],
    ['럽스터', '소래질', '루답'], ['카럼', '경낭이', '당지'],
    ['경주', '보벅주', '수소톡'], ['빽지', '석자집', '손지'],
    ['아반', '안시리', '소플'], ['아가틸', '아르빌', '소자컬']
];

const LESSON26_FIND_GROUPS = [
    [
        { word: '염소', icon: '🐐', choices: ['염소', '영소'] },
        { word: '감자', icon: '🥔', choices: ['갑자', '감자'] },
        { word: '구름', icon: '☁️', choices: ['구름', '구릉'] },
        { word: '수첩', icon: '🗒️', choices: ['수철', '수첩'] },
        { word: '집게', icon: '🥢', choices: ['집게', '깁게'] },
        { word: '서랍', icon: '🗄️', choices: ['서랑', '서랍'] }
    ],
    [
        { word: '늑대', icon: '🐺', choices: ['늑대', '늗대'] },
        { word: '국자', icon: '🥄', choices: ['굴자', '국자'] },
        { word: '책상', icon: '🪑', choices: ['책상', '챙상'] },
        { word: '기린', icon: '🦒', choices: ['기링', '기린'] },
        { word: '분수', icon: '⛲', choices: ['분수', '불수'] },
        { word: '걷다', icon: '🚶‍♀️', choices: ['걸다', '걷다'] }
    ]
];

const LESSON26_WRITING_GROUPS = [
    [
        { word: '염소', icon: '🐐', prefix: '', open: '여', target: 'ㅁ', suffix: '소' },
        { word: '감자', icon: '🥔', prefix: '', open: '가', target: 'ㅁ', suffix: '자' },
        { word: '구름', icon: '☁️', prefix: '구', open: '르', target: 'ㅁ', suffix: '' },
        { word: '수첩', icon: '🗒️', prefix: '수', open: '처', target: 'ㅂ', suffix: '' },
        { word: '집게', icon: '🥢', prefix: '', open: '지', target: 'ㅂ', suffix: '게' },
        { word: '서랍', icon: '🗄️', prefix: '서', open: '라', target: 'ㅂ', suffix: '' }
    ],
    [
        { word: '늑대', icon: '🐺', prefix: '', open: '느', target: 'ㄱ', suffix: '대' },
        { word: '국자', icon: '🥄', prefix: '', open: '구', target: 'ㄱ', suffix: '자' },
        { word: '책상', icon: '🪑', prefix: '', open: '채', target: 'ㄱ', suffix: '상' },
        { word: '기린', icon: '🦒', prefix: '기', open: '리', target: 'ㄴ', suffix: '' },
        { word: '분수', icon: '⛲', prefix: '', open: '부', target: 'ㄴ', suffix: '수' },
        { word: '걷다', icon: '🚶‍♀️', prefix: '', open: '거', target: 'ㄷ', suffix: '다' }
    ]
];

function renderLesson26ReadingPage(groupIndex) {
    const group = LESSON26_READING_GROUPS[groupIndex];
    if (!group) return '';
    return `
        <div class="lesson26-page lesson26-reading-page">
            <div class="lesson26-guide"><strong>읽기 ${groupIndex + 1}</strong><span>그림을 누르고 소리를 들은 뒤, 단어를 큰 소리로 읽어 보세요.</span></div>
            <div class="lesson26-picture-grid">
                ${group.pictureItems.map((item) => `<button type="button" class="lesson26-picture-card" onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 소리 듣기"><span class="lesson26-picture-icon" aria-hidden="true">${item.icon}</span><span class="lesson26-picture-word">${renderLesson26BatchimWord(item.word, group.batchims)}</span><small>🔊 눌러서 들어요</small></button>`).join('')}
            </div>
            <div class="lesson26-word-board">
                <h3>한 줄씩 소리 내어 읽어요</h3>
                ${group.wordRows.map((row) => `<div class="lesson26-word-row">${row.map((word) => `<button type="button" onclick="speakLesson13Word('${word}', this)" aria-label="${word} 소리 듣기">${renderLesson26BatchimWord(word, group.batchims)}</button>`).join('')}</div>`).join('')}
            </div>
            ${renderLesson13ReadChecks(26, group.id, group.title)}
        </div>`;
}

function renderLesson26NonsensePage() {
    return `
        <div class="lesson26-page">
            <div class="lesson26-guide"><strong>읽기 4</strong><span>뜻이 없는 낱말도 받침 소리를 생각하며 천천히 읽어 보세요.</span></div>
            <div class="lesson26-nonsense-grid">
                ${LESSON26_NONSENSE_ROWS.flat().map((word) => `<button type="button" onclick="speakLesson13Word('${word}', this)" aria-label="${word} 소리 듣기">${word}<small>🔊</small></button>`).join('')}
            </div>
            ${renderLesson13ReadChecks(26, 'nonsense', '대표받침 무의미 단어')}
        </div>`;
}

function renderLesson26FindPage(groupIndex) {
    const items = LESSON26_FIND_GROUPS[groupIndex] || [];
    return `
        <div class="lesson26-page lesson26-find-page" data-lesson26-find-page="${groupIndex}">
            <div class="lesson26-guide"><strong>읽고 찾기 ${groupIndex + 1}</strong><span>그림을 눌러 이름을 듣고, 알맞은 단어를 골라 보세요.</span></div>
            <div class="lesson26-find-progress" role="status" aria-live="polite"><span>그림과 단어를 하나씩 살펴보세요.</span><strong>완성 0 / ${items.length}</strong></div>
            <div class="lesson26-find-grid">
                ${items.map((item, index) => `<article class="lesson26-find-card" data-find-index="${index}"><button type="button" class="lesson26-find-picture" onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 그림 이름 듣기">${item.icon}<small>🔊 그림 듣기</small></button><div class="lesson26-find-choices" role="group" aria-label="${item.word}에 알맞은 단어 선택">${item.choices.map((choice) => `<button type="button" onclick="selectLesson26Find(${groupIndex}, ${index}, '${choice}', this)">${choice}</button>`).join('')}</div><p>소리를 듣고 골라요.</p></article>`).join('')}
            </div>
        </div>`;
}

window.selectLesson26Find = function selectLesson26Find(groupIndex, itemIndex, selected, button) {
    const item = LESSON26_FIND_GROUPS[groupIndex]?.[itemIndex];
    const card = button?.closest('.lesson26-find-card');
    if (!item || !card || card.classList.contains('is-complete')) return;
    const isCorrect = selected === item.word;
    const feedback = card.querySelector('p');
    card.querySelectorAll('.lesson26-find-choices button').forEach((choice) => choice.classList.remove('is-try-again'));
    recordKoreanAttempt({ lessonId: 26, lessonTitle: '배움 26: 대표받침 단어 읽기', unitId: 7, activityType: 'wordPictureMatch', word: item.word, answer: item.word, userAnswer: selected, isCorrect, retryIndex: isCorrect ? 0 : nextKoreanRetryIndex({ lessonId: 26, activityType: 'wordPictureMatch', answer: item.word }), errorType: isCorrect ? null : KOREAN_ERROR_TYPES.BATCHIM }).catch(() => {});
    if (!isCorrect) {
        button.classList.add('is-try-again');
        if (feedback) feedback.textContent = '받침을 살펴보고 다시 골라 보세요.';
        speakTextKo('다시 골라 보아요.');
        return;
    }
    resetKoreanRetryIndex({ lessonId: 26, activityType: 'wordPictureMatch', answer: item.word });
    card.classList.add('is-complete');
    card.querySelectorAll('.lesson26-find-choices button').forEach((choice) => { choice.disabled = true; choice.classList.toggle('is-correct', choice === button); });
    if (feedback) feedback.textContent = `○ ${item.word}, 맞았어요!`;
    speakChar(item.word);
    const page = card.closest('[data-lesson26-find-page]');
    const done = page?.querySelectorAll('.lesson26-find-card.is-complete').length || 0;
    const progress = page?.querySelector('.lesson26-find-progress');
    if (progress) progress.innerHTML = `<span>${done === LESSON26_FIND_GROUPS[groupIndex].length ? '참 잘했어요! 모두 찾았어요.' : '맞는 단어를 잘 찾았어요.'}</span><strong>완성 ${done} / ${LESSON26_FIND_GROUPS[groupIndex].length}</strong>`;
};

function renderLesson26WritingPage(groupIndex) {
    const items = LESSON26_WRITING_GROUPS[groupIndex] || [];
    return `
        <div class="lesson26-page lesson26-writing-page">
            <div class="lesson26-guide"><strong>완성하기 ${groupIndex + 1}</strong><span>그림을 듣고 하늘색 칸에 받침이 들어간 한 글자를 모두 써 보세요.</span></div>
            <div class="lesson26-writing-grid">
                ${items.map((item, index) => {
                    const targetSyllable = Array.from(item.word).slice(Array.from(item.prefix).length, Array.from(item.word).length - Array.from(item.suffix).length)[0] || item.word;
                    return `<article class="lesson26-write-card lesson-complete-card"><button type="button" class="lesson26-write-picture" onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 소리 듣기">${item.icon}<small>🔊 ${item.word} 듣기</small></button><div class="lesson26-word-builder" aria-label="${item.word}의 ${targetSyllable} 글자 쓰기"><span>${item.prefix}</span><span class="lesson26-target-syllable"><span class="lesson26-write-canvas-slot"><span aria-hidden="true">${targetSyllable} 쓰기</span><canvas class="lesson-complete-writing-canvas" data-target="${targetSyllable}" data-word="${item.word}" data-lesson-id="26" aria-label="${item.word}의 ${targetSyllable} 글자 전체 쓰기"></canvas></span></span><span>${item.suffix}</span></div><div class="lesson26-write-actions"><button type="button" class="btn-outline" onclick="clearLesson13WordWriting(this)">다시 쓰기</button><button type="button" class="trace-clear-button" onclick="completeLesson26Writing(${groupIndex}, ${index}, this)">썼어요</button></div><p class="lesson26-write-feedback" aria-live="polite"></p></article>`;
                }).join('')}
            </div>
        </div>`;
}

window.completeLesson26Writing = async function completeLesson26Writing(groupIndex, itemIndex, button) {
    const item = LESSON26_WRITING_GROUPS[groupIndex]?.[itemIndex];
    const card = button?.closest('.lesson26-write-card');
    const canvas = card?.querySelector('canvas');
    const feedback = card?.querySelector('.lesson26-write-feedback');
    if (!item || !canvas || !card) return;
    const targetSyllable = canvas.dataset.target || item.word;
    if (canvas.dataset.hasWriting !== 'true') {
        if (feedback) feedback.textContent = `하늘색 칸에 ${targetSyllable} 글자를 모두 써 보세요.`;
        speakTextKo(`${targetSyllable} 글자를 모두 써 보세요.`);
        return;
    }
    card.classList.add('is-complete');
    button.disabled = true;
    button.textContent = '✓ 완성';
    if (feedback) feedback.textContent = `${item.word} 완성! 단어를 다시 읽어 보세요.`;
    speakChar(item.word);
    await recordKoreanAttempt({ lessonId: 26, lessonTitle: '배움 26: 대표받침 단어 읽기', unitId: 7, activityType: 'fillOneJamo', word: item.word, answer: targetSyllable, userAnswer: `${targetSyllable} 전체 글자 직접 쓰기 완료`, isCorrect: true, retryIndex: 1, errorType: null });
};

function setLesson21MFeedback(page, message) {
    const feedback = page?.querySelector('#lesson21-m-feedback');
    if (feedback) feedback.textContent = message;
}

function setLesson21MActivePair(page, index, announce = true) {
    if (!page) return;
    const pairs = Array.from(page.querySelectorAll('.lesson21-m-pair'));
    const pair = pairs.find((item) => Number(item.dataset.lesson21MIndex) === Number(index));
    if (!pair || pair.classList.contains('is-complete')) return;

    pairs.forEach((item) => {
        const isActive = item === pair;
        item.classList.toggle('is-active', isActive);
        item.querySelector('.lesson21-m-trace-canvas')?.setAttribute('aria-current', isActive ? 'step' : 'false');
    });
    page.dataset.activeIndex = String(index);
    if (announce) {
        setLesson21MFeedback(page, `이번에는 ${pair.dataset.base}에 ${page.dataset.batchim || 'ㅁ'} 받침을 넣어 볼까요?`);
    }
}

const LESSON21_M_STROKES = [
    { start: [0.24, 0.18], end: [0.24, 0.78], direction: '아래로' },
    { start: [0.24, 0.18], end: [0.76, 0.18], direction: '오른쪽으로' },
    { start: [0.76, 0.18], end: [0.76, 0.78], direction: '아래로' },
    { start: [0.24, 0.78], end: [0.76, 0.78], direction: '오른쪽으로' }
];

const LESSON21_B_STROKES = [
    { start: [0.24, 0.18], end: [0.24, 0.78], direction: '아래로' },
    { start: [0.76, 0.18], end: [0.76, 0.78], direction: '아래로' },
    { start: [0.24, 0.49], end: [0.76, 0.49], direction: '오른쪽으로' },
    { start: [0.24, 0.78], end: [0.76, 0.78], direction: '오른쪽으로' }
];

const LESSON_BATCHIM_INTRO_STROKES = {
    'ㅁ': LESSON21_M_STROKES,
    'ㅂ': LESSON21_B_STROKES,
    'ㅇ': [{
        start: [0.5, 0.16],
        end: [0.5, 0.16],
        points: [[0.5, 0.16], [0.68, 0.2], [0.79, 0.34], [0.82, 0.5], [0.78, 0.68], [0.65, 0.8], [0.5, 0.84], [0.35, 0.8], [0.22, 0.68], [0.18, 0.5], [0.21, 0.34], [0.32, 0.2], [0.5, 0.16]],
        direction: '동그랗게'
    }],
    'ㄱ': [{
        start: [0.22, 0.22],
        end: [0.78, 0.8],
        points: [[0.22, 0.22], [0.78, 0.22], [0.78, 0.8]],
        direction: '오른쪽으로 쓰고 아래로 꺽어서'
    }],
    'ㄴ': [{
        start: [0.24, 0.18],
        end: [0.78, 0.78],
        points: [[0.24, 0.18], [0.24, 0.78], [0.78, 0.78]],
        direction: '아래로 쓰고 오른쪽으로 꺽어서'
    }],
    'ㄹ': [
        { start: [0.24, 0.2], end: [0.76, 0.2], direction: '오른쪽으로' },
        { start: [0.76, 0.2], end: [0.76, 0.46], direction: '아래로' },
        { start: [0.76, 0.46], end: [0.34, 0.46], direction: '왼쪽으로' },
        { start: [0.34, 0.46], end: [0.34, 0.76], direction: '아래로' },
        { start: [0.34, 0.76], end: [0.78, 0.76], direction: '오른쪽으로' }
    ],
    'ㄷ': [
        { start: [0.28, 0.22], end: [0.74, 0.22], direction: '오른쪽으로' },
        { start: [0.28, 0.22], end: [0.28, 0.78], direction: '아래로' },
        { start: [0.28, 0.78], end: [0.74, 0.78], direction: '오른쪽으로' }
    ]
};

function getLesson21IntroStrokes(canvas) {
    return LESSON_BATCHIM_INTRO_STROKES[normalizeLessonBatchim(canvas?.dataset?.batchim)] || LESSON21_M_STROKES;
}

function getLesson21IntroStrokePoints(stroke) {
    return stroke.points || [stroke.start, stroke.end];
}

function drawLesson21MStrokeArrow(ctx, stroke, width, height) {
    const points = getLesson21IntroStrokePoints(stroke);
    const scaledPoints = points.map(([x, y]) => [x * width, y * height]);
    const [endX, endY] = scaledPoints[scaledPoints.length - 1];
    const [previousX, previousY] = scaledPoints[scaledPoints.length - 2];
    const angle = Math.atan2(endY - previousY, endX - previousX);
    const arrowSize = Math.max(7, Math.min(width, height) * 0.075);

    ctx.beginPath();
    scaledPoints.forEach(([x, y], index) => {
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrowSize * Math.cos(angle - Math.PI / 6), endY - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(endX, endY);
    ctx.lineTo(endX - arrowSize * Math.cos(angle + Math.PI / 6), endY - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.stroke();
}

function drawLesson21MTraceCanvas(canvas) {
    const ctx = canvas.getContext('2d');
    const { width, height } = resizeCanvasForDisplay(canvas, ctx);
    if (width < 2 || height < 2) return;
    const strokes = getLesson21IntroStrokes(canvas);
    const isBieup = canvas.dataset.batchim === 'ㅂ';

    const guide = {
        left: width * 0.24,
        right: width * 0.76,
        top: height * 0.18,
        bottom: height * 0.78
    };
    canvas._lesson21MGuide = guide;
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = canvas.dataset.completed === 'true' ? '#7dd3c7' : (isBieup ? '#dda36b' : '#f7cfa8');
    ctx.lineWidth = isBieup
        ? Math.max(5, Math.min(width, height) * 0.055)
        : Math.max(2, Math.min(width, height) * 0.025);
    ctx.setLineDash(isBieup ? [] : [7, 7]);
    ctx.lineJoin = 'round';
    strokes.forEach((stroke) => {
        const points = getLesson21IntroStrokePoints(stroke);
        ctx.beginPath();
        points.forEach(([x, y], index) => {
            if (index === 0) ctx.moveTo(x * width, y * height);
            else ctx.lineTo(x * width, y * height);
        });
        ctx.stroke();
    });
    ctx.setLineDash([]);

    if (canvas.dataset.completed !== 'true') {
        const strokeIndex = Math.min(strokes.length - 1, canvas._lesson21MStrokeIndex || 0);
        const stroke = strokes[strokeIndex];
        const startX = stroke.start[0] * width;
        const startY = stroke.start[1] * height;
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = Math.max(4, Math.min(width, height) * 0.045);
        ctx.setLineDash([9, 7]);
        drawLesson21MStrokeArrow(ctx, stroke, width, height);
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.arc(startX, startY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = `700 ${Math.max(13, Math.min(width, height) * 0.13)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const numberX = Math.max(12, Math.min(width - 12, startX - 15));
        const numberY = Math.max(13, Math.min(height - 13, startY - 10));
        ctx.fillText(String(strokeIndex + 1), numberX, numberY);
    }
    ctx.restore();

    const paths = canvas._lesson21MPaths || [];
    ctx.save();
    ctx.strokeStyle = '#159f91';
    ctx.lineWidth = Math.max(7, Math.min(width, height) * 0.065);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    paths.forEach((path) => {
        if (!path.length) return;
        ctx.beginPath();
        path.forEach((point, pointIndex) => {
            const x = point.x * width;
            const y = point.y * height;
            if (pointIndex === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    });
    ctx.restore();
}

function getLesson21MCanvasPoint(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
        y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)))
    };
}

function getLesson21MStrokeDistance(point, target, width, height) {
    return Math.hypot((point.x - target[0]) * width, (point.y - target[1]) * height);
}

function getLesson21MPathDistance(point, strokePoints, width, height) {
    let minimum = Number.POSITIVE_INFINITY;
    for (let index = 1; index < strokePoints.length; index += 1) {
        const start = { x: strokePoints[index - 1][0] * width, y: strokePoints[index - 1][1] * height };
        const end = { x: strokePoints[index][0] * width, y: strokePoints[index][1] * height };
        const current = { x: point.x * width, y: point.y * height };
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const lengthSquared = dx * dx + dy * dy;
        const ratio = lengthSquared
            ? Math.max(0, Math.min(1, ((current.x - start.x) * dx + (current.y - start.y) * dy) / lengthSquared))
            : 0;
        const projected = { x: start.x + ratio * dx, y: start.y + ratio * dy };
        minimum = Math.min(minimum, Math.hypot(current.x - projected.x, current.y - projected.y));
    }
    return minimum;
}

function isLesson21MStrokeStart(canvas, point) {
    const stroke = getLesson21IntroStrokes(canvas)[canvas._lesson21MStrokeIndex || 0];
    if (!stroke) return false;
    const rect = canvas.getBoundingClientRect();
    const tolerance = Math.max(26, Math.min(rect.width, rect.height) * 0.22);
    return getLesson21MStrokeDistance(point, stroke.start, rect.width, rect.height) <= tolerance;
}

function isLesson21MCurrentStrokeComplete(canvas, path) {
    const stroke = getLesson21IntroStrokes(canvas)[canvas._lesson21MStrokeIndex || 0];
    if (!stroke || !path || path.length < 2) return false;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const tolerance = Math.max(22, Math.min(width, height) * 0.18);
    const startDistance = getLesson21MStrokeDistance(path[0], stroke.start, width, height);
    const endDistance = getLesson21MStrokeDistance(path[path.length - 1], stroke.end, width, height);
    const strokePoints = getLesson21IntroStrokePoints(stroke);
    const targetLength = strokePoints.slice(1).reduce((total, point, index) => {
        const previous = strokePoints[index];
        return total + Math.hypot(
            (point[0] - previous[0]) * width,
            (point[1] - previous[1]) * height
        );
    }, 0);
    let pathLength = 0;
    let nearStrokePoints = 0;
    const isBentStroke = strokePoints.length > 2;
    const isVertical = !isBentStroke && stroke.start[0] === stroke.end[0];

    path.forEach((point, index) => {
        if (index > 0) {
            const previous = path[index - 1];
            pathLength += Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height);
        }
        if (isBentStroke) {
            if (getLesson21MPathDistance(point, strokePoints, width, height) <= tolerance) nearStrokePoints += 1;
        } else {
            const axisDistance = isVertical
                ? Math.abs(point.x - stroke.start[0]) * width
                : Math.abs(point.y - stroke.start[1]) * height;
            if (axisDistance <= tolerance) nearStrokePoints += 1;
        }
    });

    let nextWaypointIndex = 1;
    path.forEach((point) => {
        if (nextWaypointIndex >= strokePoints.length - 1) return;
        if (getLesson21MStrokeDistance(point, strokePoints[nextWaypointIndex], width, height) <= tolerance) {
            nextWaypointIndex += 1;
        }
    });
    const passedEveryCorner = nextWaypointIndex >= strokePoints.length - 1;

    return startDistance <= tolerance
        && endDistance <= tolerance
        && pathLength >= targetLength * 0.62
        && nearStrokePoints / path.length >= 0.7
        && passedEveryCorner;
}

function isLesson21MTraceComplete(canvas) {
    const paths = canvas._lesson21MPaths || [];
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const bounds = { left: 0.24, right: 0.76, top: 0.18, bottom: 0.78 };
    const tolerance = 0.17;
    const sideBins = [new Set(), new Set(), new Set(), new Set()];
    let pathLength = 0;

    const addBin = (sideIndex, position) => {
        const clamped = Math.max(0, Math.min(0.999, position));
        sideBins[sideIndex].add(Math.floor(clamped * 3));
    };

    paths.forEach((path) => {
        path.forEach((point, pointIndex) => {
            if (pointIndex > 0) {
                const previous = path[pointIndex - 1];
                pathLength += Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height);
            }
            if (Math.abs(point.y - bounds.top) <= tolerance && point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance) {
                addBin(0, (point.x - bounds.left) / (bounds.right - bounds.left));
            }
            if (Math.abs(point.x - bounds.right) <= tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance) {
                addBin(1, (point.y - bounds.top) / (bounds.bottom - bounds.top));
            }
            if (Math.abs(point.y - bounds.bottom) <= tolerance && point.x >= bounds.left - tolerance && point.x <= bounds.right + tolerance) {
                addBin(2, (point.x - bounds.left) / (bounds.right - bounds.left));
            }
            if (Math.abs(point.x - bounds.left) <= tolerance && point.y >= bounds.top - tolerance && point.y <= bounds.bottom + tolerance) {
                addBin(3, (point.y - bounds.top) / (bounds.bottom - bounds.top));
            }
        });
    });

    const coveredBins = sideBins.reduce((total, bins) => total + bins.size, 0);
    const guidePerimeter = 2 * ((bounds.right - bounds.left) * width + (bounds.bottom - bounds.top) * height);
    const tracedEverySide = sideBins.every((bins) => bins.size >= 2 && bins.has(1));
    return tracedEverySide && coveredBins >= 9 && pathLength >= guidePerimeter * 0.5;
}

async function recordLesson21MIntroCompletion(lessonId, base, result, batchim = 'ㅁ') {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: lesson?.title || 'ㅁ, ㅂ 받침',
        unitId: lesson?.unit || getUnitIdForLesson(lessonId),
        activityType: 'fillOneJamo',
        word: result,
        answer: batchim,
        userAnswer: `${base}에 ${batchim} 받침 쓰기 완료`,
        isCorrect: true,
        errorType: null
    });
}

function completeLesson21MTrace(canvas) {
    if (!canvas || canvas.dataset.completed === 'true') return;
    const page = canvas.closest('.lesson21-m-intro-page');
    const pair = canvas.closest('.lesson21-m-pair');
    const baseButton = pair?.querySelector('.lesson21-m-base-button');
    const displayLetter = pair?.querySelector('.lesson21-m-display-letter');
    if (!page || !pair || !baseButton || !displayLetter) return;

    const itemIndex = Number(canvas.dataset.index);
    const base = canvas.dataset.base;
    const result = canvas.dataset.result;
    const batchim = canvas.dataset.batchim || page.dataset.batchim || 'ㅁ';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const mergeDuration = reduceMotion ? 80 : (itemIndex === 0 ? 1100 : 900);

    if (batchim === 'ㅂ') {
        canvas._lesson21MPaths = getLesson21IntroStrokes(canvas).map((stroke) => (
            getLesson21IntroStrokePoints(stroke).map(([x, y]) => ({ x, y }))
        ));
    }
    canvas.dataset.completed = 'true';
    pair.classList.remove('is-active');
    pair.classList.add('is-merging');
    if (itemIndex === 0) pair.classList.add('is-first-merge');
    baseButton.classList.add('is-merging');
    setLesson21MFeedback(page, `잘했어요! ${base}에 ${batchim} 받침을 넣으면 ${result}이 돼요.`);
    drawLesson21MTraceCanvas(canvas);

    window.setTimeout(() => {
        displayLetter.textContent = result;
        baseButton.dataset.completed = 'true';
        baseButton.setAttribute('aria-label', `완성 글자 ${result}. 눌러서 소리 듣기`);
        pair.classList.remove('is-merging');
        pair.classList.add('is-complete');
        baseButton.classList.remove('is-merging');
        baseButton.classList.add('is-complete', 'is-complete-pulse');
        window.setTimeout(() => baseButton.classList.remove('is-complete-pulse'), reduceMotion ? 100 : 650);

        if (itemIndex === 0) speakTextKo(`${base}에 ${batchim} 받침을 넣으면 ${result}이 돼요. ${result}!`);
        else speakTextKo(result);
        recordLesson21MIntroCompletion(page.dataset.lesson21MIntro, base, result, batchim).catch(() => {});

        const pairs = Array.from(page.querySelectorAll('.lesson21-m-pair'));
        const remaining = pairs.filter((item) => !item.classList.contains('is-complete'));
        if (!remaining.length) {
            setLesson21MFeedback(page, `참 잘했어요! ${batchim} 받침 글자를 모두 완성했어요.`);
            return;
        }

        const nextPair = pairs.slice(itemIndex + 1).find((item) => !item.classList.contains('is-complete')) || remaining[0];
        const nextIndex = Number(nextPair.dataset.lesson21MIndex);
        setLesson21MActivePair(page, nextIndex, false);
        window.setTimeout(() => {
            if (page.dataset.activeIndex === String(nextIndex) && !nextPair.classList.contains('is-complete')) {
                setLesson21MFeedback(page, `이번에는 ${nextPair.dataset.base}에 ${batchim} 받침을 넣어 볼까요?`);
            }
        }, reduceMotion ? 100 : 1500);
    }, mergeDuration);
}

function initializeLesson21MBatchimIntroCanvases() {
    const page = document.querySelector('.lesson21-m-intro-page');
    if (!page || page.dataset.initialized === 'true') return;
    page.dataset.initialized = 'true';

    const canvases = Array.from(page.querySelectorAll('.lesson21-m-trace-canvas'));
    canvases.forEach((canvas) => {
        canvas._lesson21MPaths = [];
        canvas._lesson21MActivePath = null;
        canvas._lesson21MStrokeIndex = 0;
        drawLesson21MTraceCanvas(canvas);

        const activate = () => {
            if (canvas.dataset.completed !== 'true') setLesson21MActivePair(page, Number(canvas.dataset.index));
        };
        canvas.addEventListener('focus', activate);
        canvas.addEventListener('pointerdown', (event) => {
            if (canvas.dataset.completed === 'true') return;
            event.preventDefault();
            activate();
            const startPoint = getLesson21MCanvasPoint(canvas, event);
            const strokeIndex = canvas._lesson21MStrokeIndex || 0;
            if (!isLesson21MStrokeStart(canvas, startPoint)) {
                const pair = canvas.closest('.lesson21-m-pair');
                pair?.classList.add('needs-guidance');
                setLesson21MFeedback(page, `${strokeIndex + 1}번 주황색 점에서 시작해 보세요.`);
                window.setTimeout(() => pair?.classList.remove('needs-guidance'), 800);
                return;
            }
            canvas.setPointerCapture?.(event.pointerId);
            canvas._lesson21MActivePath = [startPoint];
            canvas._lesson21MPaths.push(canvas._lesson21MActivePath);
            const stroke = getLesson21IntroStrokes(canvas)[strokeIndex];
            setLesson21MFeedback(page, `좋아요! ${strokeIndex + 1}번 획을 ${stroke.direction} 천천히 써 보세요.`);
        });
        canvas.addEventListener('pointermove', (event) => {
            if (!canvas._lesson21MActivePath || canvas.dataset.completed === 'true') return;
            event.preventDefault();
            const point = getLesson21MCanvasPoint(canvas, event);
            const previous = canvas._lesson21MActivePath[canvas._lesson21MActivePath.length - 1];
            if (Math.hypot(point.x - previous.x, point.y - previous.y) < 0.005) return;
            canvas._lesson21MActivePath.push(point);
            drawLesson21MTraceCanvas(canvas);
        });

        const finishPath = (event) => {
            if (!canvas._lesson21MActivePath || canvas.dataset.completed === 'true') return;
            event?.preventDefault?.();
            const finishedPath = canvas._lesson21MActivePath;
            canvas._lesson21MActivePath = null;
            const strokeIndex = canvas._lesson21MStrokeIndex || 0;
            if (isLesson21MCurrentStrokeComplete(canvas, finishedPath)) {
                canvas._lesson21MStrokeIndex = strokeIndex + 1;
                const strokes = getLesson21IntroStrokes(canvas);
                if (canvas._lesson21MStrokeIndex >= strokes.length) {
                    completeLesson21MTrace(canvas);
                } else {
                    const nextStroke = strokes[canvas._lesson21MStrokeIndex];
                    const hint = canvas.closest('.lesson21-m-pair')?.querySelector('.lesson21-m-cell-hint');
                    if (hint) hint.textContent = `${canvas._lesson21MStrokeIndex + 1}번 획을 써요`;
                    setLesson21MFeedback(page, `잘했어요! 이제 ${canvas._lesson21MStrokeIndex + 1}번 획을 ${nextStroke.direction} 써 보세요.`);
                    drawLesson21MTraceCanvas(canvas);
                }
            } else {
                canvas._lesson21MPaths.pop();
                const pair = canvas.closest('.lesson21-m-pair');
                pair?.classList.add('needs-guidance');
                const stroke = getLesson21IntroStrokes(canvas)[strokeIndex];
                setLesson21MFeedback(page, `${strokeIndex + 1}번 획을 주황색 화살표 방향으로 다시 써 보세요.`);
                window.setTimeout(() => pair?.classList.remove('needs-guidance'), 800);
                drawLesson21MTraceCanvas(canvas);
            }
        };
        canvas.addEventListener('pointerup', finishPath);
        canvas.addEventListener('pointercancel', finishPath);

        if ('ResizeObserver' in window) {
            const observer = new ResizeObserver(() => drawLesson21MTraceCanvas(canvas));
            observer.observe(canvas);
            canvas._lesson21MResizeObserver = observer;
        }
    });

    const firstPair = page.querySelector('.lesson21-m-pair');
    if (firstPair) setLesson21MActivePair(page, Number(firstPair.dataset.lesson21MIndex), false);
}

function setLesson21MPracticeFeedback(page, message) {
    const feedback = page?.querySelector('#lesson21-m-practice-feedback');
    if (feedback) feedback.textContent = message;
}

const lesson21MPracticeCompleted = new Set();

function setLesson21MPracticeCompletedDrawing(canvas) {
    canvas._lesson21MStrokeIndex = LESSON21_M_STROKES.length;
    canvas._lesson21MPaths = LESSON21_M_STROKES.map((stroke) => [
        { x: stroke.start[0], y: stroke.start[1] },
        { x: stroke.end[0], y: stroke.end[1] }
    ]);
    canvas.dataset.completed = 'true';
    drawLesson21MTraceCanvas(canvas);
}

function updateLesson21MPracticeProgress(page) {
    if (!page) return;
    const completed = page.querySelectorAll('.lesson21-m-syllable-cell.is-target.is-complete').length;
    const remaining = 20 - completed;
    const practiceBatchim = normalizeLessonBatchim(page.dataset.lesson21PracticeBatchim);
    const completionLabel = `${practiceBatchim} 받침`;
    const text = page.querySelector('#lesson21-m-progress-text');
    const count = page.querySelector('#lesson21-m-progress-count');
    const fill = page.querySelector('#lesson21-m-progress-fill');
    const track = page.querySelector('.lesson21-m-progress-track');
    if (count) count.textContent = `받침 쓰기 ${completed} / 20`;
    if (fill) fill.style.width = `${completed * 5}%`;
    track?.setAttribute('aria-valuenow', String(completed));
    if (text) {
        if (completed === 0) text.textContent = `색칠된 칸을 눌러 소리를 듣고, 빈칸에 ${practiceBatchim} 받침을 써 보세요.`;
        else if (completed === 20) text.textContent = `참 잘했어요! ${completionLabel} 글자 20개를 모두 완성했어요.`;
        else text.textContent = `${completed}개를 완성했어요. ${remaining}개가 남았어요.`;
    }
}

window.restartLesson21MixedPractice = function restartLesson21MixedPractice() {
    renderLearningDetail(currentLearningActivityStep, currentLearningDetailSectionIndex);
};

window.selectLesson21MixedPracticeCell = function selectLesson21MixedPracticeCell(button) {
    const page = button.closest('.lesson21-m-practice-page');
    const cell = button.closest('.lesson21-m-syllable-cell.is-target');
    if (!page || !cell) return;
    page.querySelectorAll('.lesson21-m-syllable-cell.is-target').forEach((item) => {
        const selected = item === cell;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-current', selected ? 'true' : 'false');
    });
    cell.classList.remove('is-first-target');
    cell.querySelector('.lesson21-m-first-hint')?.remove();
    speakLesson13Word(cell.dataset.result, button);
};

function completeLesson21MixedPracticeCanvas(canvas) {
    if (!canvas || canvas.dataset.lesson21MixedCompleted === 'true') return;
    const page = canvas.closest('.lesson21-m-practice-page');
    const cell = canvas.closest('.lesson21-m-syllable-cell.is-target');
    if (!page || !cell) return;
    canvas.dataset.lesson21MixedCompleted = 'true';
    cell.classList.add('is-complete', 'is-selected');
    cell.classList.remove('is-first-target');
    cell.querySelector('.lesson21-m-first-hint')?.remove();
    page.querySelectorAll('.lesson21-m-syllable-cell.is-target').forEach((item) => {
        const selected = item === cell;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-current', selected ? 'true' : 'false');
    });
    const letter = cell.querySelector('.lesson21-m-cell-letter');
    const action = cell.querySelector('.lesson21-m-cell-action');
    if (letter) letter.textContent = cell.dataset.result;
    if (action) action.textContent = '✓ 완성';
    cell.querySelector('.lesson21-m-cell-sound')?.setAttribute('aria-label', `${cell.dataset.result} 완성, 소리 듣기`);
    updateLesson21MPracticeProgress(page);
    speakTextKo(cell.dataset.result);
    recordLesson21MIntroCompletion(page.dataset.lesson21MPractice, cell.dataset.base, cell.dataset.result, cell.dataset.batchim).catch(() => {});

    const next = page.querySelector('.lesson21-m-syllable-cell.is-target:not(.is-complete)');
    if (next) {
        window.setTimeout(() => next.classList.add('is-next'), 350);
    }
}

function completeLesson21BWordCanvas(canvas) {
    if (!canvas || canvas.dataset.lesson21BWordCompleted === 'true') return;
    const page = canvas.closest('.lesson21-b-word-writing-page');
    const syllable = canvas.closest('.lesson21-b-word-syllable.is-writing');
    const group = canvas.closest('.lesson21-b-word-group');
    if (!page || !syllable || !group) return;

    canvas.dataset.lesson21BWordCompleted = 'true';
    syllable.classList.add('is-complete');
    const status = syllable.querySelector('.lesson21-b-word-status');
    if (status) status.textContent = '✓ 완성';
    group.classList.add('is-complete');
    const listenLabel = group.querySelector('.lesson21-b-word-listen span');
    if (listenLabel) listenLabel.textContent = group.dataset.word;

    const completed = page.querySelectorAll('.lesson21-b-word-canvas[data-lesson21-b-word-completed="true"]').length;
    const progress = page.querySelector('#lesson21-b-word-progress-count');
    if (progress) progress.textContent = `단어 쓰기 ${completed} / 7`;
    speakTextKo(group.dataset.word);
}

function completeLesson21MPictureCanvas(canvas) {
    if (!canvas || canvas.dataset.lesson21MPictureCompleted === 'true') return;
    const page = canvas.closest('.lesson21-m-picture-writing-page');
    const item = canvas.closest('.lesson21-m-picture-item');
    const cell = canvas.closest('.lesson21-m-picture-write-cell');
    if (!page || !item || !cell) return;

    canvas.dataset.lesson21MPictureCompleted = 'true';
    cell.classList.add('is-complete');
    const status = cell.querySelector('.lesson21-m-picture-write-status');
    if (status) status.textContent = `✓ ${canvas.dataset.letter} 완성`;
    item.classList.add('is-complete');

    const completed = page.querySelectorAll('.lesson21-m-picture-canvas[data-lesson21-m-picture-completed="true"]').length;
    const total = page.querySelectorAll('.lesson21-m-picture-canvas').length;
    const progress = page.querySelector('#lesson21-m-picture-progress-count');
    if (progress) progress.textContent = `글씨 쓰기 ${completed} / ${total}`;
    speakTextKo(item.dataset.word);
}

window.resetLesson21MPracticeCanvas = function resetLesson21MPracticeCanvas() {
    const page = document.querySelector('.lesson21-m-practice-page');
    const panel = page?.querySelector('#lesson21-m-focus-panel');
    const canvas = page?.querySelector('#lesson21-m-practice-canvas');
    if (!page || !panel || !canvas || !panel.dataset.base) return;
    if (panel.classList.contains('is-merging')) return;
    canvas._lesson21MPaths = [];
    canvas._lesson21MActivePath = null;
    canvas._lesson21MStrokeIndex = 0;
    canvas.dataset.completed = 'false';
    panel.classList.remove('is-complete', 'is-merging', 'needs-guidance');
    const result = panel.querySelector('#lesson21-m-focus-result');
    if (result) result.textContent = '?';
    panel.querySelector('#lesson21-m-result-listen')?.classList.add('hidden');
    setLesson21MPracticeFeedback(page, '1번 획부터 화살표 방향으로 따라 써 보세요.');
    drawLesson21MTraceCanvas(canvas);
};

window.selectLesson21MPracticeTarget = function selectLesson21MPracticeTarget(button) {
    const page = button.closest('.lesson21-m-practice-page');
    const panel = page?.querySelector('#lesson21-m-focus-panel');
    const canvas = page?.querySelector('#lesson21-m-practice-canvas');
    if (!page || !panel || !canvas) return;
    if (panel.classList.contains('is-merging')) return;
    const base = button.dataset.base;
    const result = button.dataset.result;
    const isComplete = button.classList.contains('is-complete');

    page.querySelectorAll('.lesson21-m-syllable-cell.is-target').forEach((cell) => {
        const isSelected = cell === button;
        cell.classList.toggle('is-selected', isSelected);
        cell.classList.remove('is-next', 'is-first-target');
        cell.setAttribute('aria-current', isSelected ? 'true' : 'false');
        cell.querySelector('.lesson21-m-first-hint')?.remove();
    });
    page.classList.add('has-selection');
    panel.classList.remove('hidden');
    panel.dataset.base = base;
    panel.dataset.result = result;
    panel.dataset.targetIndex = button.dataset.targetIndex;
    canvas.dataset.base = base;
    canvas.dataset.result = result;
    canvas.dataset.index = button.dataset.targetIndex;
    panel.querySelector('#lesson21-m-focus-base').textContent = base;
    panel.querySelector('#lesson21-m-base-listen span').textContent = `${base} 듣기`;
    panel.querySelector('#lesson21-m-base-listen').dataset.text = base;
    panel.querySelector('#lesson21-m-result-listen span').textContent = `${result} 다시 듣기`;
    panel.querySelector('#lesson21-m-result-listen').dataset.text = result;

    if (isComplete) {
        panel.classList.add('is-complete');
        panel.querySelector('#lesson21-m-focus-result').textContent = result;
        panel.querySelector('#lesson21-m-result-listen').classList.remove('hidden');
        setLesson21MPracticeCompletedDrawing(canvas);
        const batchim = normalizeLessonBatchim(page.dataset.lesson21PracticeBatchim);
        setLesson21MPracticeFeedback(page, `${base}에 ${batchim} 받침을 넣으면 ${result}이 돼요. 완성 글자를 눌러 다시 들어 보세요.`);
    } else {
        window.resetLesson21MPracticeCanvas();
    }
    speakLesson13Word(isComplete ? result : base, button);
    panel.scrollIntoView?.({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
};

window.speakLesson21MPracticeBase = function speakLesson21MPracticeBase(button) {
    speakLesson13Word(button.dataset.text || 'ㅁ', button);
};

window.speakLesson21MPracticeResult = function speakLesson21MPracticeResult(button) {
    speakLesson13Word(button.dataset.text || 'ㅁ', button);
};

function completeLesson21MPracticeTrace(canvas) {
    if (!canvas || canvas.dataset.completed === 'true') return;
    const page = canvas.closest('.lesson21-m-practice-page');
    const panel = canvas.closest('.lesson21-m-focus-panel');
    if (!page || !panel) return;
    const base = panel.dataset.base;
    const result = panel.dataset.result;
    const target = page.querySelector(`.lesson21-m-syllable-cell.is-target[data-target-index="${panel.dataset.targetIndex}"]`);
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduceMotion ? 80 : 1000;

    canvas.dataset.completed = 'true';
    panel.classList.add('is-merging');
    const batchim = normalizeLessonBatchim(page.dataset.lesson21PracticeBatchim);
    setLesson21MPracticeFeedback(page, `잘했어요! ${base}와 ${batchim}이 만나 ${result}이 돼요.`);
    drawLesson21MTraceCanvas(canvas);

    window.setTimeout(() => {
        panel.classList.remove('is-merging');
        panel.classList.add('is-complete');
        panel.querySelector('#lesson21-m-focus-result').textContent = result;
        panel.querySelector('#lesson21-m-result-listen').classList.remove('hidden');
        if (target && !target.classList.contains('is-complete')) {
            lesson21MPracticeCompleted.add(result);
            target.classList.add('is-complete');
            target.querySelector('.lesson21-m-cell-letter').textContent = result;
            target.querySelector('.lesson21-m-cell-action').textContent = '✓ 완성';
            target.setAttribute('aria-label', `${base}에서 ${result} 완성. 눌러서 다시 연습하기`);
            updateLesson21MPracticeProgress(page);
            const next = page.querySelector('.lesson21-m-syllable-cell.is-target:not(.is-complete)');
            next?.classList.add('is-next');
        }
        speakTextKo(result);
        recordLesson21MIntroCompletion(page.dataset.lesson21MPractice, base, result, batchim).catch(() => {});
    }, duration);
}

function initializeLesson21MPracticePage() {
    const page = document.querySelector('.lesson21-m-practice-page');
    if (!page || page.dataset.initialized === 'true') return;
    page.dataset.initialized = 'true';
    updateLesson21MPracticeProgress(page);
}

window.speakLesson21MIntroLetter = function speakLesson21MIntroLetter(button) {
    const text = button.dataset.completed === 'true' ? button.dataset.result : button.dataset.base;
    speakLesson13Word(text, button);
};

window.recordLesson21BatchimWrite = async function recordLesson21BatchimWrite(lessonId, batchim, word, btn) {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: lesson?.title || 'ㅁ, ㅂ 받침',
        unitId: lesson?.unit || getUnitIdForLesson(lessonId),
        activityType: 'fillOneJamo',
        word,
        answer: batchim,
        userAnswer: `${batchim} 직접 쓰기 완료`,
        isCorrect: true,
        errorType: null
    });
    btn.textContent = '쓰기 완료';
    btn.classList.add('is-complete');
};

window.speakLesson21WordChoices = function speakLesson21WordChoices(answer, distractor, btn) {
    const card = btn.closest('.lesson21-word-find-card');
    card?.classList.add('is-speaking');
    speakTextKo(`${answer}. ${distractor}.`);
    window.setTimeout(() => card?.classList.remove('is-speaking'), 900);
};

window.selectLesson21Word = async function selectLesson21Word(lessonId, batchim, answer, userAnswer, btn) {
    const lesson = getChanchanLesson(lessonId);
    const isCorrect = answer === userAnswer;
    const card = btn.closest('.lesson21-word-find-card');
    const feedback = card?.querySelector('.lesson21-word-feedback');
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: lesson?.title || 'ㅁ, ㅂ 받침',
        unitId: lesson?.unit || getUnitIdForLesson(lessonId),
        activityType: 'wordPictureMatch',
        word: answer,
        answer,
        userAnswer,
        isCorrect,
        errorType: isCorrect ? null : KOREAN_ERROR_TYPES.MEANING_MATCH
    });
    card?.querySelectorAll('.lesson21-word-choice').forEach((choice) => choice.classList.remove('is-selected', 'is-wrong'));
    btn.classList.add(isCorrect ? 'is-selected' : 'is-wrong');
    if (feedback) {
        feedback.textContent = isCorrect ? `맞아요! ${answer}예요.` : '다시 그림을 보고 골라요.';
        feedback.className = `lesson21-word-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;
    }
    speakTextKo(isCorrect ? answer : '다시 골라 보아요.');
};

window.recordLesson21ChallengeRead = async function recordLesson21ChallengeRead(lessonId, batchim, level, btn) {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: lesson?.title || 'ㅁ, ㅂ 받침',
        unitId: lesson?.unit || getUnitIdForLesson(lessonId),
        activityType: 'finalAssessment',
        word: `${batchim}-${level}`,
        answer: level,
        userAnswer: `${level} 정확히 읽기 완료`,
        isCorrect: true,
        errorType: null
    });
    btn.textContent = '잘 읽었어요';
    btn.classList.add('is-complete');
};

function renderListenAndFindActivity(lesson) {
    const choices = lesson.letters || lesson.focus || lesson.words || [];
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">듣기</span> 듣고 고르기</div>
        <div class="choice-grid ${choices.length > 4 ? 'choice-grid-wide' : ''}">
            ${choices.map((item) => `<button type="button" class="choice-chip-button" onclick="speakChar('${item}'); recordKoreanAttempt({ lessonId:'${lesson.id}', lessonTitle:'${lesson.title}', unitId:${lesson.unit}, activityType:'listenAndFind', word:'${item}', answer:'${item}', userAnswer:'${item}', isCorrect:true, audioReplayCount:1 })">${item}</button>`).join('')}
        </div>
    </div>`;
}

function renderReadThreeTimesActivity(lesson) {
    const words = (lesson.words || lesson.letters || lesson.focus || []).slice(0, 6);
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">읽기</span> 3번 읽기</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${words.map((word) => `<div class="border-2 border-green-100 rounded-2xl p-3 bg-white">
                <button type="button" class="word-chip !text-3xl !py-3 !px-5" onclick="speakChar('${word}')">${word}</button>
                <div class="grid grid-cols-3 gap-2 mt-3">
                    ${[1,2,3].map((count) => `<button type="button" class="btn-outline py-2 text-sm" onclick="recordReadThreeTimes('${lesson.id}','${word}',${count},this)">${count}번 읽었어요</button>`).join('')}
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

function renderFillOneJamoActivity(lesson) {
    const items = lesson.fillItems || [];
    if (!items.length) return '';
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">완성</span> 빈칸 완성</div>
        <div class="fill-writing-grid">
            ${items.map((item, index) => `<div class="fill-writing-row border-2 border-orange-100 rounded-2xl p-3 bg-white">
                <button type="button" class="btn-outline py-2 px-4" onclick="speakChar('${item.word}')">🔊 ${item.word}</button>
                <div>
                    <canvas id="fill-trace-${lesson.id}-${index}" class="trace-writing-canvas fill-trace-canvas" data-guide="${item.answer}" data-fill-word="${item.word}" data-fill-prefix="${item.prompt.replace('□', '')}" data-fill-lesson="${lesson.id}" data-fill-index="${index}"></canvas>
                    <span id="fill-feedback-${lesson.id}-${index}" class="block text-sm font-black text-gray-500 mt-2">${item.hint || ''}</span>
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

function renderWordPictureMatchActivity(lesson) {
    const items = lesson.pictureItems || [];
    if (!items.length) return '';
    const words = items.map((item) => item.word);
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">그림</span> 그림-단어 연결</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${items.map((item) => `<div class="border-2 border-teal-100 rounded-2xl p-4 bg-white text-center">
                <div class="text-5xl mb-3">${item.icon}</div>
                <div class="grid grid-cols-2 gap-2">
                    ${[item.word, ...words.filter((word) => word !== item.word).slice(0, 3)].sort(() => Math.random() - 0.5).map((word) => `<button type="button" class="btn-outline py-2" onclick="selectWordPicture('${lesson.id}','${item.word}','${word}',this)">${word}</button>`).join('')}
                </div>
            </div>`).join('')}
        </div>
    </div>`;
}

function renderNonsenseWordReadActivity(lesson) {
    const words = lesson.nonsenseWords || [];
    if (!words.length) return '';
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">읽기</span> 무의미 단어 읽기</div>
        <div class="word-chip-wrap">
            ${words.map((word) => `<button type="button" class="word-chip !text-3xl" onclick="markNonsenseRead('${lesson.id}','${word}',this)">${word}<span class="block text-xs mt-2 text-orange-500">읽었어요</span></button>`).join('')}
        </div>
    </div>`;
}

function renderWriteOnCanvasActivity(lesson) {
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">쓰기</span> 쓰기 완료 기록</div>
        <button type="button" class="trace-clear-button" onclick="recordWriteOnCanvas('${lesson.id}', this)">다 썼어요</button>
    </div>`;
}

function renderBatchimFamilyActivity(lesson) {
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">받침</span> 받침가족 읽기</div>
        <div class="text-sm font-bold text-stone-600 mb-3">${lesson.rule || '소리는 비슷하지만 글자는 달라요. 다시 읽어 봐요.'}</div>
        <div class="word-chip-wrap">
            ${(lesson.words || []).map((word) => `<button type="button" class="word-chip !text-3xl" onclick="recordBatchimFamilyRead('${lesson.id}','${word}',true,this)">${word}</button>`).join('')}
        </div>
    </div>`;
}

function renderFinalAssessmentActivity(lesson) {
    return `<div class="practice-step-box">
        <div class="practice-step-title"><span class="practice-step-number">평가</span> 최종 평가 간단 기록</div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            ${(lesson.assessmentAreas || []).map((area) => `<button type="button" class="btn-outline py-3" onclick="recordFinalAssessmentArea('${lesson.id}','${area}',this)">${area}</button>`).join('')}
        </div>
    </div>`;
}

const LESSON13_READING_GROUPS = [
    {
        id: 'a',
        title: 'ㅏ 단어',
        prompt: '그림을 눌러 소리를 듣고, ㅏ가 들어간 단어를 읽어요.',
        pictureItems: [
            { word: '아이', icon: '👧' },
            { word: '아버지', icon: '👨‍👧' },
            { word: '가수', icon: '🎤' },
            { word: '가지', icon: '🍆' },
            { word: '나무', icon: '🌳' },
            { word: '마차', icon: '🐴' }
        ],
        wordRows: [
            ['아기', '아파트', '아주머니'],
            ['가시', '기사', '소아'],
            ['나라', '자라', '까치'],
            ['라마', '타조', '자리']
        ]
    },
    {
        id: 'i',
        title: 'ㅣ 단어',
        prompt: '그림을 눌러 소리를 듣고, ㅣ가 들어간 단어를 읽어요.',
        pictureItems: [
            { word: '기타', icon: '🎸' },
            { word: '고기', icon: '🥩' },
            { word: '다리', icon: '🦵' },
            { word: '나비', icon: '🦋' },
            { word: '파리', icon: '🪰' },
            { word: '허리', icon: '🧍' }
        ],
        wordRows: [
            ['오리', '느끼', '바구니'],
            ['코끼리', '라디오', '어머니'],
            ['기초', '소리', '고리'],
            ['부리', '무리', '뿌리']
        ]
    }
];

const LESSON14_READING_GROUPS = [
    {
        id: 'eu-o',
        title: 'ㅡ·ㅗ 단어',
        prompt: '그림을 눌러 소리를 듣고, ㅡ와 ㅗ가 들어간 단어를 읽어요.',
        pictureItems: [
            { word: '버스', icon: '🚌' },
            { word: '치즈', icon: '🧀' },
            { word: '모기', icon: '🦟' },
            { word: '주스', icon: '🧃' },
            { word: '스키', icon: '⛷️' },
            { word: '피아노', icon: '🎹' }
        ],
        wordRows: [
            ['카드', '지도', '모두', '도시'],
            ['그루', '토지', '부모', '꼬리']
        ]
    },
    {
        id: 'o-eo',
        title: 'ㅗ·ㅓ 단어',
        prompt: '그림을 눌러 소리를 듣고, ㅗ와 ㅓ가 들어간 단어를 읽어요.',
        pictureItems: [
            { word: '포도', icon: '🍇' },
            { word: '소파', icon: '🛋️' },
            { word: '꼬마', icon: '🧒' },
            { word: '소나무', icon: '🌲' },
            { word: '거미', icon: '🕷️' },
            { word: '저고리', icon: '👘' }
        ],
        wordRows: [
            ['파도', '도로', '기도', '수저'],
            ['머리', '꼬마', '보라', '거리']
        ]
    }
];

const PICTURE_WORD_LESSON_CONFIGS = {
    13: { groups: LESSON13_READING_GROUPS },
    14: { groups: LESSON14_READING_GROUPS }
};

const LESSON20_READING_GROUPS = [
    {
        id: 'complex-basic',
        title: '복잡한 모음 단어',
        prompt: '그림을 눌러 소리를 듣고, 그림 단어를 소리 내어 읽어요.',
        pictureItems: [
            { word: '해', icon: '☀️' },
            { word: '여우', icon: '🦊' },
            { word: '야구', icon: '⚾' },
            { word: '우표', icon: '📮' },
            { word: '요리사', icon: '🧑‍🍳' },
            { word: '우유', icon: '🥛' }
        ],
        wordRows: [
            ['새', '야채', '여자', '비녀'],
            ['소녀', '가야', '가요', '고요'],
            ['유도', '유리', '뉴스', '튜브']
        ]
    },
    {
        id: 'complex-expanded',
        title: '복잡한 모음 단어 더 읽기',
        prompt: '그림을 눌러 소리를 듣고, 복잡한 모음 단어를 읽어요.',
        pictureItems: [
            { word: '의사', icon: '🧑‍⚕️' },
            { word: '의자', icon: '🪑' },
            { word: '바위', icon: '🪨' },
            { word: '거위', icon: '🪿' },
            { word: '과자', icon: '🍪' },
            { word: '교과서', icon: '📘' }
        ],
        wordRows: [
            ['추위', '더위', '위치', '토의'],
            ['주의', '회의', '사과', '효과'],
            ['좌우', '화로', '왜가리', '돼지']
        ]
    }
];

const LESSON20_READ_FIND_ITEMS = [
    { word: '여우', icon: '🦊', choices: ['야우', '여우'] },
    { word: '해', icon: '☀️', choices: ['해', '애'] },
    { word: '야구', icon: '⚾', choices: ['야구', '여구'] },
    { word: '우유', icon: '🥛', choices: ['우구', '우유'] },
    { word: '요리사', icon: '🧑‍🍳', choices: ['요리사', '여리사'] },
    { word: '비녀', icon: '💇', choices: ['바녀', '비녀'] },
    { word: '소녀', icon: '👧', choices: ['서녀', '소녀'] },
    { word: '돼지', icon: '🐷', choices: ['돼지', '데지'] },
    { word: '튜브', icon: '🛟', choices: ['튜브', '투브'] },
    { word: '사과', icon: '🍎', choices: ['사과', '서과'] },
    { word: '의사', icon: '🧑‍⚕️', choices: ['의사', '의서'] },
    { word: '바위', icon: '🪨', choices: ['버위', '바위'] },
    { word: '과자', icon: '🍪', choices: ['과자', '과지'] },
    { word: '거위', icon: '🪿', choices: ['거우', '거위'] },
    { word: '더위', icon: '🥵', choices: ['더우', '더위'] },
    { word: '교과서', icon: '📘', choices: ['교과서', '교과스'] },
    { word: '야채', icon: '🥕', choices: ['야처', '야채'] },
    { word: '의자', icon: '🪑', choices: ['의자', '으자'] },
    { word: '추위', icon: '🥶', choices: ['추위', '추이'] },
    { word: '우표', icon: '📮', choices: ['오표', '우표'] }
];

const COMPLEX_VOWEL_MEDIALS = new Set(['ㅐ', 'ㅔ', 'ㅑ', 'ㅕ', 'ㅒ', 'ㅖ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ']);
const COMPLEX_VOWEL_MEDIAL_INDEXES = new Set([1, 3, 5, 7, 9, 10, 11, 14, 15, 16, 19]);
function getSyllableMedial(char) {
    const code = char?.charCodeAt?.(0) - 0xac00;
    if (!Number.isInteger(code) || code < 0 || code > 11171) return '';
    return ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'][Math.floor(code / 28) % 21];
}
function renderComplexVowelWord(word) {
    return [...word].map((char) => {
        const medial = getSyllableMedial(char);
        const highlighted = COMPLEX_VOWEL_MEDIALS.has(medial) || COMPLEX_VOWEL_MEDIAL_INDEXES.has(Math.floor((char.charCodeAt(0) - 0xac00) / 28) % 21);
        return `<span class="complex-word-syllable ${highlighted ? 'is-complex' : ''}">${char}</span>`;
    }).join('');
}

const LESSON12_FINAL_CHECK_ITEMS = [
    { target: '아', choices: ['아', '허', '우', '루'] },
    { target: '러', choices: ['호', '러', '로', '후'] },
    { target: '흐', choices: ['이', '흐', '호', '으'] },
    { target: '리', choices: ['오', '리', '희', '어'] }
];

const LESSON13_COMPLETION_WRITING_SETS = [
    {
        title: '쓰기 1 · 완성해 보기',
        prompt: '그림을 보고 빠진 모음이나 자음을 떠올리며 단어를 완성해요.',
        items: [
            { word: '아이', icon: '👧', tiles: [{ syllable: '아', initial: 'ㅇ', vowel: 'ㅏ', givenSlot: 'initial' }, { syllable: '이', initial: 'ㅇ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '나무', icon: '🌳', tiles: [{ syllable: '나', initial: 'ㄴ', vowel: 'ㅏ', givenSlot: 'vowel' }, { syllable: '무', initial: 'ㅁ', vowel: 'ㅜ', givenSlot: 'initial' }] },
            { word: '다리', icon: '🦵', tiles: [{ syllable: '다', initial: 'ㄷ', vowel: 'ㅏ', givenSlot: 'initial' }, { syllable: '리', initial: 'ㄹ', vowel: 'ㅣ', givenSlot: 'vowel' }] },
            { word: '가지', icon: '🍆', tiles: [{ syllable: '가', initial: 'ㄱ', vowel: 'ㅏ', givenSlot: 'vowel' }, { syllable: '지', initial: 'ㅈ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '파리', icon: '🪰', tiles: [{ syllable: '파', initial: 'ㅍ', vowel: 'ㅏ', givenSlot: 'initial' }, { syllable: '리', initial: 'ㄹ', vowel: 'ㅣ', givenSlot: 'vowel' }] },
            { word: '나비', icon: '🦋', tiles: [{ syllable: '나', initial: 'ㄴ', vowel: 'ㅏ', givenSlot: 'initial' }, { syllable: '비', initial: 'ㅂ', vowel: 'ㅣ', givenSlot: 'initial' }] }
        ]
    },
    {
        title: '쓰기 2 · 완성해 보기',
        prompt: '그림 단어를 듣고 빈칸에 알맞은 글자를 완성해요.',
        items: [
            { word: '가수', icon: '🎤', tiles: [{ syllable: '가', initial: 'ㄱ', vowel: 'ㅏ', givenSlot: 'vowel' }, { syllable: '수', initial: 'ㅅ', vowel: 'ㅜ', givenSlot: 'initial' }] },
            { word: '허리', icon: '👕', tiles: [{ syllable: '허', initial: 'ㅎ', vowel: 'ㅓ', givenSlot: 'initial' }, { syllable: '리', initial: 'ㄹ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '기타', icon: '🎸', tiles: [{ syllable: '기', initial: 'ㄱ', vowel: 'ㅣ', givenSlot: 'vowel' }, { syllable: '타', initial: 'ㅌ', vowel: 'ㅏ', givenSlot: 'vowel' }] },
            { word: '바구니', icon: '🧺', tiles: [{ syllable: '바', initial: 'ㅂ', vowel: 'ㅏ', givenSlot: 'initial' }, { syllable: '구', initial: 'ㄱ', vowel: 'ㅜ', givenSlot: 'vowel' }, { syllable: '니', initial: 'ㄴ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '코끼리', icon: '🐘', tiles: [{ syllable: '코', initial: 'ㅋ', vowel: 'ㅗ', givenSlot: 'vowel' }, { syllable: '끼', initial: 'ㄲ', vowel: 'ㅣ', givenSlot: 'initial' }, { syllable: '리', initial: 'ㄹ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '아버지', icon: '👨‍👧', tiles: [{ syllable: '아', initial: 'ㅇ', vowel: 'ㅏ', givenSlot: 'vowel' }, { syllable: '버', initial: 'ㅂ', vowel: 'ㅓ', givenSlot: 'initial' }, { syllable: '지', initial: 'ㅈ', vowel: 'ㅣ', givenSlot: 'initial' }] }
        ]
    }
];

const LESSON14_COMPLETION_WRITING_SETS = [
    {
        title: '쓰기 1 · 완성해 보기',
        prompt: '그림을 보고 빠진 자음이나 모음을 떠올리며 ㅡ, ㅗ 단어를 완성해요.',
        items: [
            { word: '버스', icon: '🚌', tiles: [{ syllable: '버', initial: 'ㅂ', vowel: 'ㅓ', givenSlot: 'initial' }, { syllable: '스', initial: 'ㅅ', vowel: 'ㅡ', givenSlot: 'vowel' }] },
            { word: '치즈', icon: '🧀', tiles: [{ syllable: '치', initial: 'ㅊ', vowel: 'ㅣ', givenSlot: 'initial' }, { syllable: '즈', initial: 'ㅈ', vowel: 'ㅡ', givenSlot: 'vowel' }] },
            { word: '모기', icon: '🦟', tiles: [{ syllable: '모', initial: 'ㅁ', vowel: 'ㅗ', givenSlot: 'vowel' }, { syllable: '기', initial: 'ㄱ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '주스', icon: '🧃', tiles: [{ syllable: '주', initial: 'ㅈ', vowel: 'ㅜ', givenSlot: 'initial' }, { syllable: '스', initial: 'ㅅ', vowel: 'ㅡ', givenSlot: 'vowel' }] },
            { word: '스키', icon: '⛷️', tiles: [{ syllable: '스', initial: 'ㅅ', vowel: 'ㅡ', givenSlot: 'vowel' }, { syllable: '키', initial: 'ㅋ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '피아노', icon: '🎹', tiles: [{ syllable: '피', initial: 'ㅍ', vowel: 'ㅣ', givenSlot: 'initial' }, { syllable: '아', initial: 'ㅇ', vowel: 'ㅏ', givenSlot: 'vowel' }, { syllable: '노', initial: 'ㄴ', vowel: 'ㅗ', givenSlot: 'initial' }] }
        ]
    },
    {
        title: '쓰기 2 · 완성해 보기',
        prompt: '그림 단어를 듣고 빈칸에 알맞은 글자를 완성해요.',
        items: [
            { word: '포도', icon: '🍇', tiles: [{ syllable: '포', initial: 'ㅍ', vowel: 'ㅗ', givenSlot: 'initial' }, { syllable: '도', initial: 'ㄷ', vowel: 'ㅗ', givenSlot: 'vowel' }] },
            { word: '소파', icon: '🛋️', tiles: [{ syllable: '소', initial: 'ㅅ', vowel: 'ㅗ', givenSlot: 'vowel' }, { syllable: '파', initial: 'ㅍ', vowel: 'ㅏ', givenSlot: 'initial' }] },
            { word: '꼬마', icon: '🧒', tiles: [{ syllable: '꼬', initial: 'ㄲ', vowel: 'ㅗ', givenSlot: 'vowel' }, { syllable: '마', initial: 'ㅁ', vowel: 'ㅏ', givenSlot: 'initial' }] },
            { word: '소나무', icon: '🌲', tiles: [{ syllable: '소', initial: 'ㅅ', vowel: 'ㅗ', givenSlot: 'vowel' }, { syllable: '나', initial: 'ㄴ', vowel: 'ㅏ', givenSlot: 'initial' }, { syllable: '무', initial: 'ㅁ', vowel: 'ㅜ', givenSlot: 'initial' }] },
            { word: '거미', icon: '🕷️', tiles: [{ syllable: '거', initial: 'ㄱ', vowel: 'ㅓ', givenSlot: 'initial' }, { syllable: '미', initial: 'ㅁ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '저고리', icon: '👘', tiles: [{ syllable: '저', initial: 'ㅈ', vowel: 'ㅓ', givenSlot: 'initial' }, { syllable: '고', initial: 'ㄱ', vowel: 'ㅗ', givenSlot: 'vowel' }, { syllable: '리', initial: 'ㄹ', vowel: 'ㅣ', givenSlot: 'initial' }] }
        ]
    }
];

const LESSON20_COMPLETION_WRITING_SETS = [
    {
        title: '쓰기 1 · 완성해 보기',
        prompt: '그림을 보고 빠진 모음이나 자음을 떠올리며 단어를 완성해요.',
        items: [
            { word: '야구', icon: '⚾', tiles: [{ syllable: '야', initial: 'ㅇ', vowel: 'ㅑ', givenSlot: 'initial' }, { syllable: '구', initial: 'ㄱ', vowel: 'ㅜ', givenSlot: 'vowel' }] },
            { word: '의사', icon: '🧑‍⚕️', tiles: [{ syllable: '의', initial: 'ㅇ', vowel: 'ㅢ', givenSlot: 'initial' }, { syllable: '사', initial: 'ㅅ', vowel: 'ㅏ', givenSlot: 'vowel' }] },
            { word: '여우', icon: '🦊', tiles: [{ syllable: '여', initial: 'ㅇ', vowel: 'ㅕ', givenSlot: 'initial' }, { syllable: '우', initial: 'ㅇ', vowel: 'ㅜ', givenSlot: 'initial' }] },
            { word: '과자', icon: '🍪', tiles: [{ syllable: '과', initial: 'ㄱ', vowel: 'ㅘ', givenSlot: 'initial' }, { syllable: '자', initial: 'ㅈ', vowel: 'ㅏ', givenSlot: 'initial' }] },
            { word: '비녀', icon: '💇', tiles: [{ syllable: '비', initial: 'ㅂ', vowel: 'ㅣ', givenSlot: 'initial' }, { syllable: '녀', initial: 'ㄴ', vowel: 'ㅕ', givenSlot: 'initial' }] },
            { word: '야채', icon: '🥕', tiles: [{ syllable: '야', initial: 'ㅇ', vowel: 'ㅑ', givenSlot: 'initial' }, { syllable: '채', initial: 'ㅊ', vowel: 'ㅐ', givenSlot: 'initial' }] }
        ]
    },
    {
        title: '쓰기 2 · 완성해 보기',
        prompt: '그림 단어를 듣고 빈칸에 알맞은 글자를 완성해요.',
        items: [
            { word: '돼지', icon: '🐷', tiles: [{ syllable: '돼', initial: 'ㄷ', vowel: 'ㅙ', givenSlot: 'initial' }, { syllable: '지', initial: 'ㅈ', vowel: 'ㅣ', givenSlot: 'initial' }] },
            { word: '거위', icon: '🪿', tiles: [{ syllable: '거', initial: 'ㄱ', vowel: 'ㅓ', givenSlot: 'vowel' }, { syllable: '위', initial: 'ㅇ', vowel: 'ㅟ', givenSlot: 'initial' }] },
            { word: '더위', icon: '🥵', tiles: [{ syllable: '더', initial: 'ㄷ', vowel: 'ㅓ', givenSlot: 'vowel' }, { syllable: '위', initial: 'ㅇ', vowel: 'ㅟ', givenSlot: 'initial' }] },
            { word: '튜브', icon: '🛟', tiles: [{ syllable: '튜', initial: 'ㅌ', vowel: 'ㅠ', givenSlot: 'initial' }, { syllable: '브', initial: 'ㅂ', vowel: 'ㅡ', givenSlot: 'vowel' }] },
            { word: '추위', icon: '🥶', tiles: [{ syllable: '추', initial: 'ㅊ', vowel: 'ㅠ', givenSlot: 'initial' }, { syllable: '위', initial: 'ㅇ', vowel: 'ㅟ', givenSlot: 'vowel' }] },
            { word: '우표', icon: '📮', tiles: [{ syllable: '우', initial: 'ㅇ', vowel: 'ㅜ', givenSlot: 'initial' }, { syllable: '표', initial: 'ㅍ', vowel: 'ㅛ', givenSlot: 'initial' }] }
        ]
    }
];

const LESSON_COMPLETION_WRITING_SETS_BY_ID = {
    13: LESSON13_COMPLETION_WRITING_SETS,
    14: LESSON14_COMPLETION_WRITING_SETS,
    20: LESSON20_COMPLETION_WRITING_SETS
};

const LESSON13_BOARD_WORDS = [
    '출발', '다리', '가디', '아파트', '나비', '소리', '까치', '기타',
    '가우', '니라', '가시', '마차', '부리', '파리', '가수', '라디오',
    '니타', '아기', '아버지', '기차', '부리', '나무', '나버', '아이',
    '어머니', '바구니', '우리', '자라', '허리', '뿌리', '더리', '가지', '도착'
];

const LESSON14_BOARD_WORDS = [
    '출발', '치즈', '호기', '버스', '주스', '스키', '거리', '포도', '오리',
    '피아노', '고모', '사이즈', '부모', '카드', '거미', '소나무', '포크', '지도',
    '소파', '꼬마', '퍼도', '저고리', '도자기', '수저', '소나기', '모자', '서포',
    '모두', '토지', '스포', '이모', '도로', '고모', '보자기', '도착'
];

const LESSON20_BOARD_WORDS = [
    '출발', '의자', '사과', '보녀', '가요', '바위', '가야', '추위', '더위', '주의',
    '위치', '터치', '효과', '투표', '요리사', '돼지', '의사', '화로', '토의', '위로',
    '왜가리', '과자', '거위', '바퀴', '야구', '소녀', '해', '여우', '야채', '오후', '새', '도착'
];

const LESSON26_BOARD_WORDS = [
    '출발', '염소', '봄비', '카럼', '수첩', '김치', '집게', '입구', '서랍', '섬씨',
    '감자', '감기', '소금', '잠수', '잠자리', '줍다', '종이접기', '늑대', '국자', '분수',
    '기린', '갈매기', '고릴라', '만두', '솔방울', '걷다', '돋보기', '변기', '겨울', '마을',
    '독수리', '행복', '책상', '도착'
];

const LESSON_BOARD_WORDS_BY_ID = {
    13: LESSON13_BOARD_WORDS,
    14: LESSON14_BOARD_WORDS,
    20: LESSON20_BOARD_WORDS,
    26: LESSON26_BOARD_WORDS
};

window.lesson13ReadChecks = window.lesson13ReadChecks || {};
window.pictureWordMatchBatch = window.pictureWordMatchBatch || {};

function renderLesson13ReadChecks(lessonId, groupId, label) {
    const checkKey = `${lessonId}-${groupId}`;
    const checkedCount = Number(window.lesson13ReadChecks[checkKey] || 0);
    return `
        <div class="lesson13-read-check" data-read-group="${checkKey}">
            <div class="text-xl font-black text-[#2c3e50]">몇 번 읽었나요?</div>
            <div class="text-base font-bold text-stone-600 mt-1">한 번 읽을 때마다 숫자를 눌러요.</div>
            <div class="lesson13-read-check-buttons">
                ${[1, 2, 3].map((count) => `
                    <button type="button"
                        class="lesson13-read-check-button ${count <= checkedCount ? 'active' : ''}"
                        data-read-round="${count}"
                        aria-pressed="${count <= checkedCount ? 'true' : 'false'}"
                        onclick="recordLesson13ReadRound(${lessonId}, '${checkKey}', '${label}', ${count}, this)">
                        ${count}번 읽었어요
                    </button>
                `).join('')}
            </div>
            <div class="lesson13-read-feedback mt-3 text-center text-lg font-black text-green-600">
                ${checkedCount >= 3 ? '3번 읽기 완료! 읽기 별을 받았어요.' : ''}
            </div>
        </div>
    `;
}

function renderLesson13PictureReading(lessonId, groupIndex) {
    const group = PICTURE_WORD_LESSON_CONFIGS[lessonId]?.groups?.[groupIndex];
    if (!group) return '';
    return `
        <div class="learning-practice-card lesson13-reading-shell">
            <div class="learning-card-label practice-label">읽기 ${groupIndex + 1} · ${group.title}</div>
            <div class="lesson13-instruction">🔊 ${group.prompt}</div>
            <div class="lesson13-picture-grid">
                ${group.pictureItems.map((item, index) => `
                    <button type="button" class="lesson13-picture-card"
                        style="--card-index:${index}"
                        onclick="speakLesson13Word('${item.word}', this)"
                        aria-label="${item.word} 소리 듣기">
                        <span class="picture" aria-hidden="true">${item.icon}</span>
                        <span>
                            <span class="word">${item.word}</span>
                            <span class="listen-label">🔊 눌러서 듣기</span>
                        </span>
                    </button>
                `).join('')}
            </div>
            <div class="border-2 border-green-100 rounded-2xl p-4 bg-green-50">
                <div class="text-xl font-black text-[#2c3e50] mb-3">한 줄씩 소리 내어 읽어요</div>
                ${group.wordRows.map((row) => `
                    <div class="lesson13-word-line-grid mb-2">
                        ${row.map((word) => `<button type="button" class="lesson13-word-chip" onclick="speakLesson13Word('${word}', this)">🔊 ${word}</button>`).join('')}
                    </div>
                `).join('')}
            </div>
            ${renderLesson13ReadChecks(lessonId, group.id, group.title)}
        </div>
    `;
}

function getPictureWordLessonItems(lessonId) {
    return (PICTURE_WORD_LESSON_CONFIGS[lessonId]?.groups || [])
        .flatMap((group) => group.pictureItems);
}

function renderLesson13ReadingReview(lessonId) {
    const allItems = getPictureWordLessonItems(lessonId);
    const batchCount = Math.max(1, Math.ceil(allItems.length / 4));
    const batchIndex = Number(window.pictureWordMatchBatch[lessonId] || 0) % batchCount;
    const batchItems = allItems.slice(batchIndex * 4, batchIndex * 4 + 4);
    const allWords = allItems.map((item) => item.word);
    return `
        <div class="learning-practice-card lesson13-reading-shell">
            <div class="learning-card-label practice-label">그림 · 그림-단어 연결</div>
            <div class="lesson13-instruction">그림을 보고 알맞은 단어를 골라요. 단어도 소리 내어 읽어요.</div>
            <div class="text-center text-lg font-black text-teal-600">${batchIndex + 1} / ${batchCount}</div>
            <div class="lesson13-match-grid">
                ${batchItems.map((item, itemIndex) => {
                    const distractors = allWords.filter((word) => word !== item.word)
                        .slice((batchIndex * 4 + itemIndex) % Math.max(1, allWords.length - 1))
                        .concat(allWords.filter((word) => word !== item.word))
                        .slice(0, 3);
                    const candidates = [item.word, ...distractors];
                    const shift = (itemIndex + lessonId) % candidates.length;
                    const choices = candidates.map((_, index) => candidates[(index + shift) % candidates.length]);
                    return `
                        <div class="lesson13-match-card">
                            <div class="lesson13-match-picture" aria-label="${item.word} 그림">${item.icon}</div>
                            <div class="lesson13-match-choices">
                                ${choices.map((word) => `
                                    <button type="button" class="lesson13-match-choice"
                                        onclick="selectWordPicture('${lessonId}', '${item.word}', '${word}', this)">
                                        ${word}
                                    </button>
                                `).join('')}
                            </div>
                            <div class="picture-match-feedback mt-3 min-h-[1.5rem] text-base font-black text-teal-600"></div>
                        </div>
                    `;
                }).join('')}
            </div>
            <button type="button" class="trace-clear-button" onclick="showNextPictureWordMatchBatch(${lessonId})">다른 그림 보기</button>
        </div>
    `;
}

function renderLesson13Writing(lessonId) {
    const words = getPictureWordLessonItems(lessonId).map((item) => item.word);
    const canvasId = `lesson${lessonId}-picture-word-canvas`;
    return `
        <div class="learning-practice-card lesson13-reading-shell">
            <div class="learning-card-label practice-label">쓰기 · 그림 단어 따라 쓰기</div>
            <div class="lesson13-instruction">앞에서 들은 그림 단어를 떠올리며, 주황색 획순을 따라 태블릿에 직접 써요.</div>
            <div class="trace-canvas-wrap">
                <div class="trace-canvas-title">✍️ ${words.join(' ')}</div>
                <canvas id="${canvasId}"
                    class="trace-writing-canvas make-letter-grid"
                    data-grid-cols="3"
                    data-guide="${words.join('/')}"
                    style="height:760px"></canvas>
                <div class="trace-canvas-help">천천히 획순을 따라 쓰고, 어려우면 단어를 다시 눌러 들어요.</div>
            </div>
            <button type="button" class="trace-clear-button" onclick="resetTraceWritingCanvas('${canvasId}')">다시 쓰기</button>
        </div>
    `;
}

function renderLesson12FinalCheck() {
    return `
        <div class="learning-practice-card lesson13-reading-shell">
            <div class="learning-card-label practice-label">확인하기 3 · 4</div>
            <div class="lesson13-instruction">소리를 듣고 알맞은 글자를 골라요. 고른 뒤에는 글자를 눌러 다시 읽어 봐요.</div>
            <div class="lesson12-confirm-grid">
                ${LESSON12_FINAL_CHECK_ITEMS.map((item, index) => `
                    <div class="lesson12-confirm-row">
                        <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="text-lg font-black text-[#2c3e50]">문제 ${index + 1}</div>
                            <button type="button" class="listen-quiz-play-btn !text-base !px-5 !py-3"
                                onclick="playLesson12FinalCheckSound(${index})">🔊 소리 듣기</button>
                        </div>
                        <div id="lesson12-final-feedback-${index}" class="min-h-[1.5rem] mt-2 text-base font-black text-orange-500">소리를 듣고 골라요.</div>
                        <div class="lesson12-confirm-choices">
                            ${item.choices.map((choice) => `
                                <button type="button" class="lesson12-confirm-choice"
                                    onclick="selectLesson12FinalCheck(${index}, '${choice}', this)">${choice}</button>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function getLessonCompletionTileLayout(tile) {
    return ['ㅗ', 'ㅜ', 'ㅡ', 'ㅛ', 'ㅠ'].includes(tile.vowel) ? 'horizontal' : 'vertical';
}

function renderLessonCompletionPart({ lessonId, setIndex, itemIndex, tileIndex, tile, slot }) {
    const isGiven = tile.givenSlot === slot;
    const value = slot === 'initial' ? tile.initial : tile.vowel;
    if (isGiven) {
        return `<div class="lesson-syllable-part given" aria-label="${tile.syllable} ${slot === 'initial' ? '초성' : '모음'} 힌트">${value}</div>`;
    }
    const canvasId = `lesson13-write-${lessonId}-${setIndex}-${itemIndex}-${tileIndex}-${slot}`;
    return `
        <div class="lesson-syllable-part write" aria-label="${tile.syllable} ${slot === 'initial' ? '초성' : '모음'} 쓰기">
            <span class="lesson-syllable-write-placeholder">쓰기</span>
            <canvas id="${canvasId}"
                class="lesson-complete-writing-canvas"
                data-word="${tile.syllable}"
                data-target="${value}"
                data-slot="${slot}"
                data-lesson-id="${lessonId}"></canvas>
        </div>
    `;
}

function renderLessonCompletionTile(lessonId, setIndex, itemIndex, tile, tileIndex) {
    const layout = getLessonCompletionTileLayout(tile);
    return `
        <div class="lesson-complete-tile ${layout}" aria-label="${tile.syllable} 완성 칸">
            ${renderLessonCompletionPart({ lessonId, setIndex, itemIndex, tileIndex, tile, slot: 'initial' })}
            ${renderLessonCompletionPart({ lessonId, setIndex, itemIndex, tileIndex, tile, slot: 'vowel' })}
        </div>
    `;
}

function getLessonCompletionWritingSets(lessonId) {
    return LESSON_COMPLETION_WRITING_SETS_BY_ID[Number(lessonId)] || [];
}

function renderLesson13CompletionWriting(lessonId, setIndex) {
    const set = getLessonCompletionWritingSets(lessonId)[setIndex];
    if (!set) return '';
    return `
        <div class="learning-practice-card lesson13-reading-shell">
            <div class="learning-card-label practice-label">${set.title}</div>
            <div class="lesson13-instruction">🔊 ${set.prompt}</div>
            <div class="lesson-complete-grid">
                ${set.items.map((item, itemIndex) => {
                    const globalIndex = setIndex * 10 + itemIndex;
                    const isThreeSyllable = item.tiles.length >= 3;
                    return `
                        <div class="lesson-complete-card ${isThreeSyllable ? 'three-syllable-card' : ''}">
                            <button type="button" class="lesson-complete-picture" onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 소리 듣기">${item.icon}</button>
                            <div>
                                <div class="lesson-complete-word ${isThreeSyllable ? 'three-syllable' : ''}" aria-label="${item.word} 완성 카드">
                                    ${item.tiles.map((tile, tileIndex) => renderLessonCompletionTile(lessonId, setIndex, itemIndex, tile, tileIndex)).join('')}
                                </div>
                                <div class="lesson-complete-actions">
                                    <button type="button" class="btn-outline py-2 px-4" onclick="speakChar('${item.word}')">🔊 ${item.word}</button>
                                    <button type="button" class="btn-outline py-2 px-4" onclick="clearLesson13WordWriting(this)">다시 쓰기</button>
                                    <button type="button" class="trace-clear-button !mt-0 !py-2 !px-4"
                                        onclick="completeLesson13WordWriting(${lessonId}, ${setIndex}, ${itemIndex}, this)">완성했어요</button>
                                </div>
                                <div id="lesson13-complete-feedback-${globalIndex}" class="lesson-complete-feedback"></div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function renderLesson13WordGame(lessonId) {
    const boardWords = getLessonBoardWords(lessonId);
    return `
        <div class="learning-practice-card lesson13-reading-shell">
            <div class="learning-card-label practice-label">놀이 · 단어 놀이 해보기</div>
            <div class="lesson13-instruction">가위바위보에서 이긴 쪽의 말을 한 칸 움직여요. 도착한 칸의 단어를 큰 소리로 읽어요.</div>
            <div class="lesson-final-stack lesson13-game-panel" data-board-game="${lessonId}">
                <div class="border-2 border-orange-100 rounded-2xl p-4 bg-orange-50 text-base font-bold text-stone-700 leading-relaxed">
                    이긴 친구가 1칸 움직여요. 도착한 칸의 단어를 읽고, 먼저 도착한 친구가 이겨요.
                </div>
                <div class="lesson13-game-controls">
                    <div class="lesson13-player-card">
                        <div class="lesson13-player-name">파랑 말</div>
                        <div id="lesson13-player-pos-${lessonId}-0" class="lesson13-player-position">출발</div>
                        <button type="button" class="lesson13-move-button" onclick="moveLesson13BoardToken(${lessonId}, 0)">이겼어요 · 1칸 이동</button>
                    </div>
                    <div class="lesson13-player-card player-two">
                        <div class="lesson13-player-name">주황 말</div>
                        <div id="lesson13-player-pos-${lessonId}-1" class="lesson13-player-position">출발</div>
                        <button type="button" class="lesson13-move-button" onclick="moveLesson13BoardToken(${lessonId}, 1)">이겼어요 · 1칸 이동</button>
                    </div>
                </div>
                <div class="lesson13-game-action-row">
                    <div id="lesson13-current-word-${lessonId}" class="lesson13-game-word-bubble">출발에서 준비해요.</div>
                    <button type="button" class="btn-outline py-2 px-4" onclick="readCurrentLesson13BoardWord(${lessonId})">도착 단어 듣기</button>
                    <button type="button" class="btn-outline py-2 px-4" onclick="resetLesson13BoardGame(${lessonId})">처음으로</button>
                </div>
                <div class="lesson13-board-path" data-board-lesson="${lessonId}">
                    ${boardWords.map((word, index) => {
                        const isStart = index === 0;
                        const isFinish = index === boardWords.length - 1;
                        const className = isStart ? 'start' : (isFinish ? 'finish' : 'read');
                        const handler = isStart || isFinish ? '' : `onclick="markLesson13BoardWordRead(${lessonId}, '${word}', this)"`;
                        return `<button type="button" class="lesson13-board-cell ${className}" data-board-index="${index}" ${handler}>${word}<span class="lesson13-board-token-layer"></span></button>`;
                    }).join('')}
                </div>
                <div id="lesson13-board-feedback" class="text-center text-lg font-black text-green-600 min-h-[1.6rem]"></div>
            </div>
        </div>
    `;
}

const LESSON_LINE_MATCH_CONFIGS = {
    15: {
        title: 'ㅐ·ㅔ 단어 선긋기',
        prompt: '단어를 누른 다음 알맞은 그림을 눌러 선으로 이어요.',
        items: [
            { key: '개', word: '개', icon: '🐶' },
            { key: '게', word: '게', icon: '🦀' },
            { key: '해', word: '해', icon: '☀️' },
            { key: '배', word: '배', icon: '🍐' }
        ]
    },
    16: {
        title: 'ㅖ·ㅒ 단어 선긋기',
        prompt: '단어를 누른 다음 알맞은 그림을 눌러 선으로 이어요.',
        items: [
            { key: '얘기', word: '얘기', icon: '💬' },
            { key: '시계', word: '시계', icon: '🕒' },
            { key: '예의', word: '예의', icon: '🙇' }
        ]
    },
    17: {
        title: 'ㅘ·ㅝ 단어 선긋기',
        prompt: '단어를 누른 다음 알맞은 그림을 눌러 선으로 이어요.',
        items: [
            { key: '과자', word: '과자', icon: '🍪' },
            { key: '화가', word: '화가', icon: '🎨' },
            { key: '원', word: '원', icon: '⭕' }
        ]
    },
    18: {
        title: 'ㅟ·ㅢ 단어 선긋기',
        prompt: '단어를 누른 다음 알맞은 그림을 눌러 선으로 이어요.',
        items: [
            { key: '귀', word: '귀', icon: '👂' },
            { key: '의사', word: '의사', icon: '🧑‍⚕️' },
            { key: '의자', word: '의자', icon: '🪑' }
        ]
    },
    19: {
        title: 'ㅞ·ㅙ·ㅚ 단어 선긋기',
        prompt: '단어를 누른 다음 알맞은 그림을 눌러 선으로 이어요.',
        items: [
            { key: '왜', word: '왜', icon: '❓' },
            { key: '뇌', word: '뇌', icon: '🧠' },
            { key: '돼지', word: '돼지', icon: '🐷' },
            { key: '쇠', word: '쇠', icon: '🔩' },
            { key: '외투', word: '외투', icon: '🧥' }
        ]
    }
};

window.lessonLineMatchState = window.lessonLineMatchState || {};

function getLessonLineMatchState(lessonId, config) {
    const stateKey = String(lessonId);
    const itemKeys = config.items.map((item) => item.key);
    const state = window.lessonLineMatchState[stateKey] || { pendingKey: '', matches: {}, pictureOrder: [] };
    state.matches = state.matches || {};
    state.pictureOrder = state.pictureOrder || [];
    const hasCurrentOrder = state.pictureOrder?.length === itemKeys.length
        && state.pictureOrder.every((key) => itemKeys.includes(key));

    if (!hasCurrentOrder) {
        state.pictureOrder = [...itemKeys];
        for (let index = state.pictureOrder.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [state.pictureOrder[index], state.pictureOrder[swapIndex]] = [state.pictureOrder[swapIndex], state.pictureOrder[index]];
        }
        if (state.pictureOrder.length > 1 && state.pictureOrder.every((key, index) => key === itemKeys[index])) {
            state.pictureOrder.push(state.pictureOrder.shift());
        }
    }

    window.lessonLineMatchState[stateKey] = state;
    return state;
}

function renderLessonLineMatch(lessonId) {
    const config = LESSON_LINE_MATCH_CONFIGS[Number(lessonId)];
    if (!config) return '';
    const state = getLessonLineMatchState(lessonId, config);
    const pictureItems = state.pictureOrder.map((key) => config.items.find((item) => item.key === key)).filter(Boolean);
    return `
        <div class="learning-practice-card lesson-line-match-shell">
            <div class="learning-card-label practice-label">선긋기 · ${config.title}</div>
            <div class="lesson13-instruction">왼쪽 단어 하나와 알맞은 오른쪽 그림 하나를 찾아 선으로 이어요.</div>
            <div class="lesson-line-match-status" id="lesson-line-match-status-${lessonId}">단어를 먼저 골라요.</div>
            <div class="lesson-line-match-board" data-line-match-board="${lessonId}">
                <svg class="lesson-line-match-svg" aria-hidden="true">
                    ${config.items.map((item) => `<line class="lesson-line-match-line" data-line-key="${item.key}" x1="0" y1="0" x2="0" y2="0"></line>`).join('')}
                </svg>
                <div class="lesson-line-match-column words">
                    <div class="lesson-line-match-heading">단어</div>
                    ${config.items.map((item) => `
                        <button type="button" class="lesson-line-match-word${state.matches[item.key] ? ' is-matched' : ''}" data-line-word-key="${item.key}"
                            onclick="selectLessonLineMatch(${lessonId}, 'word', '${item.key}', this)">${item.word}</button>
                    `).join('')}
                </div>
                <div class="lesson-line-match-column pictures">
                    <div class="lesson-line-match-heading">그림</div>
                    ${pictureItems.map((item) => `
                        <button type="button" class="lesson-line-match-picture${state.matches[item.key] ? ' is-matched' : ''}" data-line-picture-key="${item.key}"
                            onclick="selectLessonLineMatch(${lessonId}, 'picture', '${item.key}', this)"
                            aria-label="${item.word} 그림">${item.icon}</button>
                    `).join('')}
                </div>
            </div>
            <div class="lesson-line-match-help">연결한 단어를 다시 눌러 소리 내어 읽어 보세요.</div>
        </div>
    `;
}

function getLessonLineMatchBoard(lessonId) {
    return document.querySelector(`[data-line-match-board="${lessonId}"]`);
}

function drawLessonLineMatchLine(lessonId, key) {
    const board = getLessonLineMatchBoard(lessonId);
    if (!board) return;
    const wordButton = board.querySelector(`[data-line-word-key="${key}"]`);
    const pictureButton = board.querySelector(`[data-line-picture-key="${key}"]`);
    const line = board.querySelector(`[data-line-key="${key}"]`);
    if (!wordButton || !pictureButton || !line) return;
    const boardRect = board.getBoundingClientRect();
    const wordRect = wordButton.getBoundingClientRect();
    const pictureRect = pictureButton.getBoundingClientRect();
    line.setAttribute('x1', String(wordRect.right - boardRect.left - 9));
    line.setAttribute('y1', String(wordRect.top + wordRect.height / 2 - boardRect.top));
    line.setAttribute('x2', String(pictureRect.left - boardRect.left + 9));
    line.setAttribute('y2', String(pictureRect.top + pictureRect.height / 2 - boardRect.top));
    line.style.visibility = 'visible';
}

window.selectLessonLineMatch = async function(lessonId, side, key, button) {
    const config = LESSON_LINE_MATCH_CONFIGS[Number(lessonId)];
    const item = config?.items.find((candidate) => candidate.key === key);
    if (!item) return;
    const state = getLessonLineMatchState(lessonId, config);
    const board = getLessonLineMatchBoard(lessonId);
    const status = document.getElementById(`lesson-line-match-status-${lessonId}`);
    if (side === 'word') {
        if (state.matches[key]) {
            speakLesson13Word(item.word, button);
            return;
        }
        state.pendingKey = key;
        board?.querySelectorAll('.lesson-line-match-word').forEach((el) => el.classList.toggle('is-selected', el === button));
        board?.querySelectorAll('.lesson-line-match-picture').forEach((el) => el.classList.remove('is-target'));
        speakLesson13Word(item.word, button);
        if (status) status.textContent = `${item.word}를 골랐어요. 알맞은 그림을 눌러요.`;
        return;
    }
    if (!state.pendingKey) {
        if (status) status.textContent = '먼저 왼쪽 단어를 골라요.';
        return;
    }
    if (state.matches[key]) {
        if (status) status.textContent = '이미 연결한 그림이에요. 다른 그림을 골라요.';
        speakTextKo('이미 연결한 그림이에요');
        return;
    }
    const isCorrect = state.pendingKey === key;
    if (!isCorrect) {
        button.classList.add('is-wrong');
        window.setTimeout(() => button.classList.remove('is-wrong'), 450);
        speakTextKo('다시 찾아보세요');
        if (status) status.textContent = '아직 아니에요. 단어를 다시 보고 골라요.';
        return;
    }
    state.matches[key] = true;
    const wordButton = board?.querySelector(`[data-line-word-key="${key}"]`);
    wordButton?.classList.remove('is-selected');
    wordButton?.classList.add('is-matched');
    button.classList.remove('is-target');
    button.classList.add('is-matched');
    drawLessonLineMatchLine(lessonId, key);
    state.pendingKey = '';
    const matchedCount = Object.keys(state.matches).length;
    if (status) status.textContent = matchedCount === config.items.length ? '모두 잘 이었어요! 단어를 소리 내어 읽어 보세요.' : `${item.word}를 잘 이었어요. 다음 단어를 골라요.`;
    speakLesson13Word(item.word, button);
    await recordKoreanAttempt({ lessonId, lessonTitle: getLessonTitleForReport(lessonId), unitId: getUnitIdForLesson(lessonId), activityType: 'lineMatch', word: item.word, answer: item.word, userAnswer: item.word, isCorrect: true, errorType: null });
};

function redrawLessonLineMatchLines() {
    Object.keys(window.lessonLineMatchState || {}).forEach((lessonId) => {
        const state = window.lessonLineMatchState[lessonId];
        Object.keys(state.matches || {}).forEach((key) => drawLessonLineMatchLine(lessonId, key));
    });
}
if (!window.lessonLineMatchResizeBound) {
    window.addEventListener('resize', redrawLessonLineMatchLines);
    window.lessonLineMatchResizeBound = true;
}

function renderLesson20ReadingGroup(group, groupIndex) {
    return `
        <div class="learning-practice-card lesson13-reading-shell lesson20-reading-group">
            <div class="learning-card-label practice-label">읽기 ${groupIndex + 1} · ${group.title}</div>
            <div class="lesson13-instruction">🔊 ${group.prompt}</div>
            <div class="lesson13-picture-grid">
                ${group.pictureItems.map((item, index) => `
                    <button type="button" class="lesson13-picture-card" style="--card-index:${index}"
                        onclick="speakLesson13Word('${item.word}', this)" aria-label="${item.word} 소리 듣기">
                        <span class="picture" aria-hidden="true">${item.icon}</span>
                        <span><span class="word">${item.word}</span><span class="listen-label">🔊 눌러서 듣기</span></span>
                    </button>
                `).join('')}
            </div>
            <div class="border-2 border-green-100 rounded-2xl p-4 bg-green-50">
                <div class="text-xl font-black text-[#2c3e50] mb-3">한 줄씩 소리 내어 읽어요</div>
                ${group.wordRows.map((row) => `
                    <div class="lesson13-word-line-grid mb-2">
                        ${row.map((word) => `<button type="button" class="lesson13-word-chip" onclick="speakLesson13Word('${word}', this)">🔊 ${word}</button>`).join('')}
                    </div>
                `).join('')}
            </div>
            ${renderLesson13ReadChecks(20, `lesson20-${group.id}`, group.title)}
        </div>
    `;
}

function renderLesson20ReadingPage() {
    return `<div class="lesson20-reading-page">${LESSON20_READING_GROUPS.map(renderLesson20ReadingGroup).join('')}</div>`;
}

function renderLesson20NonsensePage() {
    const words = getChanchanLesson(20)?.nonsenseWords || [];
    return `
        <div class="learning-practice-card lesson13-reading-shell lesson20-nonsense-shell">
            <div class="learning-card-label practice-label">읽기 3 · 복잡한 모음 무의미 단어</div>
            <div class="lesson13-instruction">단어를 눌러 소리를 듣고, 복잡한 모음 부분의 색을 살펴보며 읽어요.</div>
            <div class="lesson20-nonsense-grid">
                ${words.map((word, index) => `
                    <button type="button" class="lesson20-nonsense-word" style="--card-index:${index}"
                        onclick="speakLesson20Nonsense('${word}', this)" aria-label="${word} 소리 듣기">
                        ${renderComplexVowelWord(word)}
                        <span class="lesson20-nonsense-listen">🔊 눌러서 듣기</span>
                    </button>
                `).join('')}
            </div>
            <div class="lesson20-color-guide"><span class="complex-word-syllable is-complex">복잡한 모음</span> 부분을 눈여겨보며 세 번 읽어요.</div>
        </div>
    `;
}

window.speakLesson20Nonsense = function(word, button) {
    speakLesson13Word(word, button);
    markNonsenseRead(20, word, button).catch(() => {});
};

function renderLesson20ReadFind() {
    return `
        <div class="learning-practice-card lesson13-reading-shell lesson20-read-find-shell">
            <div class="learning-card-label practice-label">확인하기 1·2 · 읽고 찾기</div>
            <div class="lesson13-instruction">그림을 누르면 두 단어를 모두 읽어 줘요. 그림에 알맞은 단어를 골라요.</div>
            <div class="lesson20-read-find-grid">
                ${LESSON20_READ_FIND_ITEMS.map((item, index) => `
                    <div class="lesson20-read-find-card" data-read-find-index="${index}">
                        <button type="button" class="lesson20-read-find-picture" onclick="speakLesson20ReadFindChoices(${index}, this)" aria-label="${item.word} 그림과 두 단어 듣기">
                            <span aria-hidden="true">${item.icon}</span><small>그림 누르면 두 단어 듣기</small>
                        </button>
                        <div class="lesson20-read-find-choices">
                            ${item.choices.map((choice) => `<button type="button" class="lesson20-read-find-choice" onclick="selectLesson20ReadFind(${index}, '${choice}', this)">${choice}</button>`).join('')}
                        </div>
                        <div class="picture-match-feedback lesson20-read-find-feedback"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

window.speakLesson20ReadFindChoices = function(index, button) {
    const item = LESSON20_READ_FIND_ITEMS[index];
    if (!item) return;
    button.classList.remove('is-speaking');
    void button.offsetWidth;
    button.classList.add('is-speaking');
    window.setTimeout(() => button.classList.remove('is-speaking'), 900);
    speakTextKo(`${item.choices[0]}, ${item.choices[1]}`);
};

window.selectLesson20ReadFind = async function(index, userAnswer, button) {
    const item = LESSON20_READ_FIND_ITEMS[index];
    if (!item) return;
    const isCorrect = item.word === userAnswer;
    const card = button.closest('.lesson20-read-find-card');
    const feedback = card?.querySelector('.lesson20-read-find-feedback');
    card?.querySelectorAll('.lesson20-read-find-choice').forEach((choice) => choice.classList.remove('is-correct', 'is-wrong'));
    button.classList.add(isCorrect ? 'is-correct' : 'is-wrong');
    if (feedback) {
        feedback.textContent = isCorrect ? `맞았어요! ${item.word}예요.` : '다시 그림을 보고 한 번 더 골라요.';
        feedback.className = `picture-match-feedback lesson20-read-find-feedback ${isCorrect ? 'is-correct' : 'is-wrong'}`;
    }
    speakTextKo(isCorrect ? `맞았어요. ${item.word}` : '다시 골라 보세요');
    const lesson = getChanchanLesson(20);
    await recordKoreanAttempt({ lessonId: 20, lessonTitle: lesson?.title, unitId: lesson?.unit, activityType: 'wordPictureMatch', word: item.word, answer: item.word, userAnswer, isCorrect, errorType: isCorrect ? null : KOREAN_ERROR_TYPES.MEANING_MATCH });
};

function renderLesson20CompletionWriting() {
    return `<div class="lesson20-completion-page">${LESSON20_COMPLETION_WRITING_SETS.map((_, index) => renderLesson13CompletionWriting(20, index)).join('')}</div>`;
}

const MAKE_LETTER_ACTIVITY_CONFIGS = {
    8: {
        vowels: ['ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
        rows: [
            { consonant: 'ㄱ', letters: ['거', '고', '구', '그', '기'] },
            { consonant: 'ㅋ', letters: ['커', '코', '쿠', '크', '키'] },
            { consonant: 'ㄲ', letters: ['꺼', '꼬', '꾸', '끄', '끼'] }
        ]
    },
    9: {
        vowels: ['ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
        rows: [
            { consonant: 'ㄴ', letters: ['너', '노', '누', '느', '니'] },
            { consonant: 'ㄷ', letters: ['더', '도', '두', '드', '디'] },
            { consonant: 'ㅌ', letters: ['터', '토', '투', '트', '티'] },
            { consonant: 'ㄸ', letters: ['떠', '또', '뚜', '뜨', '띠'] }
        ]
    },
    10: {
        vowels: ['ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
        rows: [
            { consonant: 'ㅁ', letters: ['머', '모', '무', '므', '미'] },
            { consonant: 'ㅂ', letters: ['버', '보', '부', '브', '비'] },
            { consonant: 'ㅍ', letters: ['퍼', '포', '푸', '프', '피'] },
            { consonant: 'ㅃ', letters: ['뻐', '뽀', '뿌', '쁘', '삐'] }
        ]
    },
    11: {
        vowels: ['ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
        rows: [
            { consonant: 'ㅅ', letters: ['서', '소', '수', '스', '시'] },
            { consonant: 'ㅈ', letters: ['저', '조', '주', '즈', '지'] },
            { consonant: 'ㅊ', letters: ['처', '초', '추', '츠', '치'] },
            { consonant: 'ㅉ', letters: ['쩌', '쪼', '쭈', '쯔', '찌'] },
            { consonant: 'ㅆ', letters: ['써', '쏘', '쑤', '쓰', '씨'] }
        ]
    },
    12: {
        vowels: ['ㅓ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅣ'],
        rows: [
            { consonant: 'ㅇ', letters: ['어', '오', '우', '으', '이'] },
            { consonant: 'ㅎ', letters: ['허', '호', '후', '흐', '히'] },
            { consonant: 'ㄹ', letters: ['러', '로', '루', '르', '리'] }
        ]
    },
    15: {
        groups: [
            { vowel: 'ㅐ', consonants: ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅂ', 'ㅎ', 'ㅅ'], letters: ['개', '내', '대', '매', '배', '해', '새'] },
            { vowel: 'ㅔ', consonants: ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅂ', 'ㅎ', 'ㅅ'], letters: ['게', '네', '데', '메', '베', '헤', '세'] }
        ]
    },
    16: {
        groups: [
            { vowel: 'ㅖ', consonants: ['ㄱ', 'ㄴ', 'ㅅ', 'ㅇ', 'ㅍ', 'ㅎ'], letters: ['계', '녜', '셰', '예', '폐', '혜'] },
            { vowel: 'ㅒ', consonants: ['ㄱ', 'ㄴ', 'ㅅ', 'ㅇ'], letters: ['걔', '냬', '섀', '얘'] }
        ]
    },
    17: {
        groups: [
            { vowel: 'ㅘ', consonants: ['ㄱ', 'ㄴ', 'ㅇ', 'ㅂ', 'ㅎ'], letters: ['과', '놔', '와', '봐', '화'] },
            { vowel: 'ㅝ', consonants: ['ㄱ', 'ㄴ', 'ㅇ', 'ㅁ', 'ㅎ'], letters: ['궈', '눠', '워', '뭐', '훠'] }
        ]
    },
    18: {
        groups: [
            { vowel: 'ㅟ', consonants: ['ㄱ', 'ㄷ', 'ㅇ', 'ㅌ', 'ㅎ'], letters: ['귀', '뒤', '위', '튀', '휘'] },
            { vowel: 'ㅢ', consonants: ['ㄴ', 'ㅇ', 'ㅌ', 'ㅎ'], letters: ['늬', '의', '틔', '희'] }
        ]
    },
    19: {
        groups: [
            { vowel: 'ㅞ', consonants: ['ㄱ', 'ㄷ', 'ㅅ', 'ㅇ', 'ㅎ'], letters: ['궤', '뒈', '쉐', '웨', '훼'] },
            { vowel: 'ㅙ', consonants: ['ㄷ', 'ㅇ', 'ㅌ', 'ㅅ'], letters: ['돼', '왜', '퇘', '쇄'] },
            { vowel: 'ㅚ', consonants: ['ㄴ', 'ㅇ', 'ㅅ', 'ㅎ'], letters: ['뇌', '외', '쇠', '회'] }
        ]
    }
};

function renderMakeLettersActivity(step) {
    const config = MAKE_LETTER_ACTIVITY_CONFIGS[Number(step)];
    if (!config) return '';
    const matrixLetters = (config.rows || []).flatMap((row) => row.letters);
    const groupLetters = (config.groups || []).flatMap((group) => group.letters);
    const guideLetters = matrixLetters.length ? matrixLetters : groupLetters;
    const canvasId = `lesson${step}-make-letter-canvas`;
    const canvasHeight = Math.max(520, Math.ceil(guideLetters.length / 5) * 150);
    const matrixHtml = config.rows ? `
        <div class="make-letter-guide-grid" aria-label="배움 ${step} 글자 만들기 표">
            <div class="make-letter-cell header"></div>
            ${config.vowels.map((vowel) => `<button type="button" class="make-letter-cell header" onclick="speakChar('${vowel}')">${vowel}</button>`).join('')}
            ${config.rows.map((row) => `
                <button type="button" class="make-letter-cell row-head" onclick="speakChar('${row.consonant}')">${row.consonant}</button>
                ${row.letters.map((letter) => `<button type="button" class="make-letter-cell result" onclick="speakChar('${letter}')">${letter}</button>`).join('')}
            `).join('')}
        </div>
    ` : '';
    const groupsHtml = config.groups ? `
        <div class="make-letter-group-grid" aria-label="배움 ${step} 글자 만들기 표">
            ${config.groups.map((group) => `
                <div class="make-letter-group">
                    <button type="button" class="make-letter-group-title" onclick="speakChar('${group.vowel}')">${group.vowel}</button>
                    ${group.letters.map((letter, index) => `
                        <button type="button" class="make-letter-pair" onclick="speakChar('${letter}')">
                            <span class="consonant">${group.consonants[index]}</span>
                            <span class="result">${letter}</span>
                        </button>
                    `).join('')}
                </div>
            `).join('')}
        </div>
    ` : '';
    return `
        <div class="learning-practice-card">
            <div class="learning-card-label practice-label">글자 만들기</div>
            <div class="make-letter-board">
                <div class="border-2 border-green-100 rounded-2xl p-4 bg-white text-lg font-bold text-stone-700 leading-relaxed">
                    자음과 모음을 붙여 글자를 만들어요. 만든 글자를 눌러 소리를 듣고, 아래 칸에 직접 따라 써요.
                </div>
                ${matrixHtml}
                ${groupsHtml}
                <div class="trace-canvas-wrap">
                    <div class="trace-canvas-title">✍️ ${guideLetters.join(' ')}</div>
                    <canvas id="${canvasId}" class="trace-writing-canvas make-letter-grid" data-grid-cols="5" data-guide="${guideLetters.join('/')}" style="height:${canvasHeight}px"></canvas>
                    <div class="trace-canvas-help">표에서 글자를 눌러 소리를 듣고, 주황색 획순을 따라 직접 써요.</div>
                </div>
                <button type="button" class="trace-clear-button" onclick="resetTraceWritingCanvas('${canvasId}')">다시 쓰기</button>
            </div>
        </div>
    `;
}

const LESSON_MOUTH_ACTIVITY_CONFIGS = {
    15: {
        title: '입 모양을 보고 소리의 차이를 알아봐요',
        guideText: '소리를 들으며 입이 벌어지는 모습을 살펴보세요.',
        sequenceText: 'ㅣ → ㅔ → ㅐ 순서로 입이 점점 크게 벌어져요.',
        items: [
            { char: 'ㅣ', label: '입을 작게 벌려요', description: 'ㅣ: 입을 작게 벌려요.', mouthShape: { width: 66, height: 11, jawDrop: 0, teethHeight: 4, tongueHeight: 4 } },
            { char: 'ㅔ', label: '입을 조금 더 벌려요', description: 'ㅔ: 입을 조금 더 벌려요.', mouthShape: { width: 60, height: 28, jawDrop: 7, teethHeight: 7, tongueHeight: 10 } },
            { char: 'ㅐ', label: '입을 가장 크게 벌려요', description: 'ㅐ: 입을 가장 크게 벌려요.', mouthShape: { width: 64, height: 42, jawDrop: 14, teethHeight: 8, tongueHeight: 13 } }
        ],
        quizChoices: ['ㅔ', 'ㅐ'],
        quizTitle: 'ㅔ와 ㅐ 소리 구별',
        quizPrompt: '이제 ㅔ와 ㅐ 소리를 듣고 알맞은 글자를 골라 보세요.',
        defaultFollow: 'ㅣ',
        activityType: 'aeEVowelDiscrimination'
    },
    16: {
        title: '입모양을 보고 ㅖ와 ㅒ 소리를 알아봐요',
        guideText: '소리를 들으며 입이 벌어지는 모습을 살펴보세요.',
        sequenceText: 'ㅣ → ㅖ → ㅒ 순서로 입이 점점 크게 벌어져요.',
        items: [
            { char: 'ㅣ', label: '입을 작게 벌려요', description: 'ㅣ는 입을 작게 벌려요.', mouthShape: { width: 66, height: 11, jawDrop: 0, teethHeight: 4, tongueHeight: 4 } },
            { char: 'ㅖ', label: '입을 조금 더 벌려요', description: 'ㅖ는 ㅣ보다 입을 조금 더 벌려요.', mouthShape: { width: 60, height: 28, jawDrop: 7, teethHeight: 7, tongueHeight: 10 } },
            { char: 'ㅒ', label: '입을 가장 크게 벌려요', description: 'ㅒ는 입을 가장 크게 벌려요.', mouthShape: { width: 64, height: 42, jawDrop: 14, teethHeight: 8, tongueHeight: 13 } }
        ],
        quizChoices: ['ㅖ', 'ㅒ'],
        quizTitle: 'ㅖ와 ㅒ 소리 구별',
        quizPrompt: '이제 ㅖ와 ㅒ 소리를 듣고 알맞은 글자를 골라 보세요.',
        defaultFollow: 'ㅖ',
        activityType: 'yeYaeVowelDiscrimination'
    }
};
const LESSON_MOUTH_AUDIO_SOURCES = {
    'ㅣ': [],
    'ㅐ': [],
    'ㅔ': [],
    'ㅖ': [],
    'ㅒ': []
};
const LESSON_MOUTH_FALLBACK_TEXTS = {
    'ㅣ': { normal: '이', slow: '이' },
    'ㅐ': { normal: '개', slow: '개' },
    'ㅔ': { normal: '게', slow: '게' },
    'ㅖ': { normal: '시계', slow: '시계' },
    'ㅒ': { normal: '얘기', slow: '얘기' }
};
const LESSON_MOUTH_AUDIO_PROFILES = {
    'ㅣ': { normalText: '이', slowText: '이이', normalRate: 1, slowRate: 0.72, normalDuration: 700, slowDuration: 1000 },
    'ㅔ': { normalText: '에에', slowText: '에에에', normalRate: 0.92, slowRate: 0.65, normalDuration: 850, slowDuration: 1200 },
    'ㅐ': { normalText: '애애애', slowText: '애애애애', normalRate: 0.86, slowRate: 0.58, normalDuration: 1000, slowDuration: 1400 },
    'ㅖ': { normalText: '시계', slowText: '시계', normalRate: 0.9, slowRate: 0.64, normalDuration: 850, slowDuration: 1200 },
    'ㅒ': { normalText: '얘기', slowText: '얘기', normalRate: 0.9, slowRate: 0.64, normalDuration: 900, slowDuration: 1250 }
};
const LESSON_MOUTH_SHAPE_PRESETS = {
    'ㅣ': { width: 66, height: 11, jawDrop: 0, teethHeight: 4, tongueHeight: 4 },
    'ㅔ': { width: 60, height: 28, jawDrop: 7, teethHeight: 7, tongueHeight: 10 },
    'ㅐ': { width: 64, height: 42, jawDrop: 14, teethHeight: 8, tongueHeight: 13 },
    'ㅖ': { width: 60, height: 28, jawDrop: 7, teethHeight: 7, tongueHeight: 10 },
    'ㅒ': { width: 64, height: 42, jawDrop: 14, teethHeight: 8, tongueHeight: 13 }
};
window.lessonMouthFollowChar = window.lessonMouthFollowChar || { 15: 'ㅣ', 16: 'ㅖ' };
window.lessonMouthQuizTarget = window.lessonMouthQuizTarget || {};
window.lessonMouthQuizPlayed = window.lessonMouthQuizPlayed || {};
window.lessonMouthPlaybackState = window.lessonMouthPlaybackState || {
    sequenceTimers: [],
    activeTimer: null,
    currentAudio: null
};

function getLessonMouthShape(item) {
    return {
        ...(LESSON_MOUTH_SHAPE_PRESETS[item.char] || LESSON_MOUTH_SHAPE_PRESETS['ㅣ']),
        ...(item.mouthShape || {})
    };
}

function getLessonMouthStyle(item) {
    const shape = getLessonMouthShape(item);
    return [
        `--mouth-width:${shape.width}px`,
        `--mouth-height:${shape.height}px`,
        '--mouth-closed-width:44px',
        '--mouth-closed-height:7px',
        `--jaw-drop:${shape.jawDrop}px`,
        `--teeth-height:${shape.teethHeight}px`,
        `--tongue-height:${shape.tongueHeight}px`
    ].join(';');
}

function renderLessonMouthFace(item) {
    return `
        <div class="mouth-face">
            <span class="mouth-nose"></span>
            <div class="mouth-jaw">
                <div class="mouth-lips">
                    <span class="mouth-teeth"></span>
                    <span class="mouth-tongue"></span>
                </div>
            </div>
        </div>
    `;
}

function renderLessonMouthIntro(step) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return '';
    return `
        <div class="learning-main-card mouth-learning-card">
            <div class="learning-card-label">📖 이해하기</div>
            <div class="text-xl font-black text-[#2c3e50] mb-2">${config.title}</div>
            <div class="text-base font-bold text-stone-600 mb-4">${config.guideText || '소리를 듣고 입모양을 함께 살펴보세요.'}</div>
            <div class="mouth-flow-grid">
                ${config.items.map((item) => `
                    <div class="mouth-sound-card" data-mouth-step="${step}" data-mouth-char="${item.char}" style="${getLessonMouthStyle(item)}">
                        <div class="mouth-letter">${item.char}</div>
                        <div class="mouth-visual" aria-hidden="true">${renderLessonMouthFace(item)}</div>
                        <div class="text-lg font-black text-[#2c3e50]">${item.label}</div>
                        <div class="text-sm font-bold text-gray-500 mt-1">${item.description}</div>
                        <div class="mouth-listen-row">
                            <button type="button" class="mouth-listen-button" onclick="playLessonMouthSound(${step}, '${item.char}', false)">🔊 ${item.char} 듣기</button>
                            <button type="button" class="mouth-listen-button slow" onclick="playLessonMouthSound(${step}, '${item.char}', true)">천천히</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="mouth-growth-note"><span>${config.sequenceText || '입이 점점 크게 벌어져요.'}</span></div>
            <div class="mouth-sequence-controls">
                <button type="button" class="mouth-sequence-button" onclick="playLessonMouthSequence(${step}, false)">연속해서 보기</button>
            </div>
        </div>
    `;
}

function renderLessonMouthSoundQuiz(step) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return '';
    window.lessonMouthQuizTarget[step] = config.quizChoices[Math.floor(Math.random() * config.quizChoices.length)];
    window.lessonMouthQuizPlayed[step] = false;
    const hintItems = config.items.filter((item) => config.quizChoices.includes(item.char));
    const hintGuide = step === 15
        ? 'ㅔ보다 입 안 공간과 아래턱이 더 크게 보이면 ㅐ예요.'
        : '두 입 모양을 비교하며 입 안 공간과 아래턱의 차이를 살펴보세요.';
    return `
        <div class="learning-practice-card">
            <div class="learning-card-label practice-label">듣고 구별하기</div>
            <div class="lesson15-quiz-box">
                <div class="practice-step-title"><span class="practice-step-number">1</span> ${config.quizTitle}</div>
                <div class="text-lg font-black text-[#2c3e50]">${config.quizPrompt}</div>
                <div class="text-center mt-4">
                    <button type="button" class="listen-quiz-play-btn" onclick="playLessonMouthQuizSound(${step})">🔊 문제 소리 듣기</button>
                </div>
                <div id="lesson-mouth-quiz-feedback-${step}" class="text-center text-orange-500 font-black mt-3 min-h-[1.6rem]">
                    소리를 듣고 알맞은 글자를 골라요.
                </div>
                <div class="mouth-quiz-hint" aria-label="입 모양 힌트">
                    <div class="mouth-quiz-hint-title">👄 입 모양 힌트</div>
                    <div class="mouth-quiz-hint-guide">${hintGuide}</div>
                    <div class="mouth-quiz-hint-grid">
                        ${hintItems.map((item) => `
                            <div class="mouth-quiz-hint-card" data-mouth-step="${step}" data-mouth-char="${item.char}" style="${getLessonMouthStyle(item)}">
                                <div class="mouth-quiz-hint-visual mouth-visual" aria-hidden="true">${renderLessonMouthFace(item)}</div>
                                <div class="mouth-quiz-hint-description">${item.label}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="lesson15-choice-row">
                    ${config.quizChoices.map((char) => `<button type="button" class="lesson15-choice-btn" onclick="selectLessonMouthSoundAnswer(${step}, this, '${char}')">${char}</button>`).join('')}
                </div>
                <button type="button" class="trace-clear-button mt-4" onclick="nextLessonMouthSoundQuiz(${step})">다음 문제</button>
            </div>
        </div>
    `;
}

const renderLesson15MouthIntro = () => renderLessonMouthIntro(15);
const renderLesson15SoundQuiz = () => renderLessonMouthSoundQuiz(15);

window.recordReadThreeTimes = async function(lessonId, word, readCount, btn) {
    await recordKoreanAttempt({ lessonId, lessonTitle: getLessonTitleForReport(lessonId), unitId: getUnitIdForLesson(lessonId), activityType: 'readThreeTimes', word, isCorrect: true, readCount, retryIndex: 1 });
    btn.classList.add('active');
    if (readCount >= 3) btn.textContent = '읽기 별 1개 획득';
};

window.speakLesson13Word = function speakLesson13Word(word, button) {
    speakChar(word);
    if (!button) return;
    button.classList.remove('is-speaking');
    void button.offsetWidth;
    button.classList.add('is-speaking');
    window.setTimeout(() => button.classList.remove('is-speaking'), 700);
};

window.recordLesson13ReadRound = async function recordLesson13ReadRound(lessonId, groupId, label, readCount, button) {
    window.lesson13ReadChecks[groupId] = Math.max(Number(window.lesson13ReadChecks[groupId] || 0), readCount);
    const container = button.closest('[data-read-group]');
    if (container) {
        container.querySelectorAll('[data-read-round]').forEach((roundButton) => {
            const isChecked = Number(roundButton.dataset.readRound) <= window.lesson13ReadChecks[groupId];
            roundButton.classList.toggle('active', isChecked);
            roundButton.setAttribute('aria-pressed', isChecked ? 'true' : 'false');
        });
        const feedback = container.querySelector('.lesson13-read-feedback');
        if (feedback) {
            feedback.textContent = window.lesson13ReadChecks[groupId] >= 3
                ? '3번 읽기 완료! 읽기 별을 받았어요.'
                : `${window.lesson13ReadChecks[groupId]}번 읽었어요. 잘했어요!`;
        }
    }
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: getLessonTitleForReport(lessonId),
        unitId: 3,
        activityType: 'readThreeTimes',
        word: label,
        isCorrect: true,
        readCount,
        retryIndex: 1
    });
};

window.playLesson12FinalCheckSound = function playLesson12FinalCheckSound(index) {
    const item = LESSON12_FINAL_CHECK_ITEMS[index];
    if (!item) return;
    speakChar(item.target);
};

window.selectLesson12FinalCheck = async function selectLesson12FinalCheck(index, userAnswer, button) {
    const item = LESSON12_FINAL_CHECK_ITEMS[index];
    if (!item) return;
    const isCorrect = item.target === userAnswer;
    const row = button.closest('.lesson12-confirm-row');
    if (row) {
        row.querySelectorAll('.lesson12-confirm-choice').forEach((choiceButton) => {
            choiceButton.classList.remove('correct', 'wrong');
        });
    }
    button.classList.add(isCorrect ? 'correct' : 'wrong');
    const feedback = document.getElementById(`lesson12-final-feedback-${index}`);
    if (feedback) {
        feedback.className = `min-h-[1.5rem] mt-2 text-base font-black ${isCorrect ? 'text-green-600' : 'text-orange-500'}`;
        feedback.textContent = isCorrect ? `${item.target} 맞았어요. 한 번 더 읽어 봐요.` : '다시 듣고 알맞은 글자를 골라요.';
    }
    speakTextKo(isCorrect ? `좋아요. ${item.target}.` : '다시 들어 보아요.');
    await recordKoreanAttempt({
        lessonId: 12,
        lessonTitle: getLessonTitleForReport(12),
        unitId: getUnitIdForLesson(12),
        activityType: 'listenAndFind',
        word: item.target,
        answer: item.target,
        userAnswer,
        isCorrect,
        errorType: isCorrect ? null : KOREAN_ERROR_TYPES.CONSONANT,
        retryIndex: nextKoreanRetryIndex({
            lessonId: 12,
            activityType: 'listenAndFind',
            word: item.target,
            answer: item.target
        })
    });
    if (isCorrect) {
        resetKoreanRetryIndex({ lessonId: 12, activityType: 'listenAndFind', word: item.target, answer: item.target });
    }
};

window.completeLesson13WordWriting = async function completeLesson13WordWriting(lessonId, setIndex, itemIndex, button) {
    const item = getLessonCompletionWritingSets(lessonId)[setIndex]?.items?.[itemIndex];
    if (!item) return;
    const globalIndex = setIndex * 10 + itemIndex;
    const feedback = document.getElementById(`lesson13-complete-feedback-${globalIndex}`);
    button.textContent = '완성 완료';
    button.classList.add('active');
    if (feedback) feedback.textContent = `${item.word} 완성했어요. 소리 내어 한 번 더 읽어요.`;
    speakTextKo(`${item.word}. 잘했어요.`);
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: getLessonTitleForReport(lessonId),
        unitId: getUnitIdForLesson(lessonId),
        activityType: 'fillOneJamo',
        word: item.word,
        prompt: '그림 보고 단어 완성',
        answer: item.word,
        userAnswer: '완성 쓰기 완료',
        isCorrect: true,
        errorType: null,
        retryIndex: 1
    });
};

window.markLesson13BoardWordRead = async function markLesson13BoardWordRead(lessonId, word, button) {
    button.classList.add('active');
    const feedback = document.getElementById('lesson13-board-feedback');
    if (feedback) feedback.textContent = `${word} 읽기 완료!`;
    speakChar(word);
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: getLessonTitleForReport(lessonId),
        unitId: getUnitIdForLesson(lessonId),
        activityType: 'readThreeTimes',
        word,
        isCorrect: true,
        readCount: 1,
        retryIndex: 1
    });
};

window.lesson13BoardGameState = window.lesson13BoardGameState || {};

function getLesson13BoardGameState(lessonId) {
    const key = String(lessonId);
    if (!window.lesson13BoardGameState[key]) {
        window.lesson13BoardGameState[key] = { positions: [0, 0], lastPlayer: 0 };
    }
    return window.lesson13BoardGameState[key];
}

function getLessonBoardWords(lessonId) {
    return LESSON_BOARD_WORDS_BY_ID[Number(lessonId)] || LESSON13_BOARD_WORDS;
}

function getLesson13BoardWord(lessonId, index) {
    const words = getLessonBoardWords(lessonId);
    return words[Math.max(0, Math.min(index, words.length - 1))] || '출발';
}

function updateLesson13BoardGame(lessonId) {
    const state = getLesson13BoardGameState(lessonId);
    const board = document.querySelector(`[data-board-lesson="${lessonId}"]`);
    if (!board) return;
    board.querySelectorAll('.lesson13-board-cell').forEach((cell) => {
        cell.classList.remove('current-one', 'current-two');
        const layer = cell.querySelector('.lesson13-board-token-layer');
        if (layer) layer.innerHTML = '';
    });
    state.positions.forEach((position, playerIndex) => {
        const cell = board.querySelector(`[data-board-index="${position}"]`);
        if (!cell) return;
        cell.classList.add(playerIndex === 0 ? 'current-one' : 'current-two');
        const layer = cell.querySelector('.lesson13-board-token-layer');
        if (!layer) return;
        const token = document.createElement('span');
        token.className = `lesson13-board-token ${playerIndex === 0 ? 'player-one' : 'player-two'}`;
        token.textContent = playerIndex === 0 ? '파' : '주';
        layer.appendChild(token);
    });
    state.positions.forEach((position, playerIndex) => {
        const label = document.getElementById(`lesson13-player-pos-${lessonId}-${playerIndex}`);
        if (label) label.textContent = getLesson13BoardWord(lessonId, position);
    });
    const currentWord = getLesson13BoardWord(lessonId, state.positions[state.lastPlayer] || 0);
    const bubble = document.getElementById(`lesson13-current-word-${lessonId}`);
    if (bubble) {
        bubble.textContent = currentWord === '출발'
            ? '출발에서 준비해요.'
            : currentWord === '도착'
                ? '도착! 놀이를 마쳤어요.'
                : `도착 단어: ${currentWord}`;
    }
}

async function recordLesson13BoardMove(lessonId, playerIndex, word, isFinish) {
    if (!word || word === '출발') return;
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: getLessonTitleForReport(lessonId),
        unitId: getUnitIdForLesson(lessonId),
        activityType: 'readThreeTimes',
        word,
        isCorrect: true,
        readCount: isFinish ? null : 1,
        retryIndex: 1
    });
}

window.moveLesson13BoardToken = async function moveLesson13BoardToken(lessonId, playerIndex) {
    const state = getLesson13BoardGameState(lessonId);
    const lastIndex = getLessonBoardWords(lessonId).length - 1;
    state.lastPlayer = playerIndex;
    state.positions[playerIndex] = Math.min(lastIndex, Number(state.positions[playerIndex] || 0) + 1);
    const word = getLesson13BoardWord(lessonId, state.positions[playerIndex]);
    updateLesson13BoardGame(lessonId);
    const feedback = document.getElementById('lesson13-board-feedback');
    if (word === '도착') {
        if (feedback) feedback.textContent = `${playerIndex === 0 ? '파랑' : '주황'} 말 도착! 놀이를 마쳤어요.`;
        speakTextKo(`${playerIndex === 0 ? '파랑' : '주황'} 말 도착!`);
    } else {
        if (feedback) feedback.textContent = `${playerIndex === 0 ? '파랑' : '주황'} 말이 ${word} 칸에 도착했어요. 크게 읽어요!`;
        speakChar(word);
    }
    await recordLesson13BoardMove(lessonId, playerIndex, word, word === '도착');
};

window.readCurrentLesson13BoardWord = function readCurrentLesson13BoardWord(lessonId) {
    const state = getLesson13BoardGameState(lessonId);
    const word = getLesson13BoardWord(lessonId, state.positions[state.lastPlayer] || 0);
    if (word === '출발') {
        speakTextKo('출발에서 준비해요.');
        return;
    }
    if (word === '도착') {
        speakTextKo('도착했어요.');
        return;
    }
    speakChar(word);
};

window.resetLesson13BoardGame = function resetLesson13BoardGame(lessonId) {
    window.lesson13BoardGameState[String(lessonId)] = { positions: [0, 0], lastPlayer: 0 };
    updateLesson13BoardGame(lessonId);
    const feedback = document.getElementById('lesson13-board-feedback');
    if (feedback) feedback.textContent = '출발! 가위바위보를 하고 이긴 쪽 말을 움직여요.';
};

function initializeLesson13BoardGames() {
    document.querySelectorAll('[data-board-game]').forEach((game) => {
        const lessonId = Number(game.dataset.boardGame);
        updateLesson13BoardGame(lessonId);
    });
}

function resizeLessonCompletionCanvas(canvas, { preserve = true } = {}) {
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const nextWidth = Math.max(1, Math.floor(rect.width * dpr));
    const nextHeight = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
        let snapshot = null;
        if (preserve && canvas.width > 1 && canvas.height > 1) {
            snapshot = document.createElement('canvas');
            snapshot.width = canvas.width;
            snapshot.height = canvas.height;
            snapshot.getContext('2d').drawImage(canvas, 0, 0);
        }
        canvas.width = nextWidth;
        canvas.height = nextHeight;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (snapshot) {
            ctx.drawImage(snapshot, 0, 0, snapshot.width / dpr, snapshot.height / dpr);
        }
    } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return ctx;
}

function initializeLessonCompletionCanvas(canvas) {
    if (!canvas || canvas.dataset.ready === 'true') return;
    let ctx = resizeLessonCompletionCanvas(canvas);
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let activePointerId = null;

    const point = (ev) => {
        const rect = canvas.getBoundingClientRect();
        const source = ev.touches?.[0] || ev.changedTouches?.[0] || ev;
        return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };
    const start = (ev) => {
        if (canvas.dataset.lesson21MixedTarget !== undefined) {
            const page = canvas.closest('.lesson21-m-practice-page');
            const currentCell = canvas.closest('.lesson21-m-syllable-cell.is-target');
            page?.querySelectorAll('.lesson21-m-syllable-cell.is-target').forEach((item) => {
                const selected = item === currentCell;
                item.classList.toggle('is-selected', selected);
                item.setAttribute('aria-current', selected ? 'true' : 'false');
            });
            currentCell?.classList.remove('is-first-target', 'is-next');
            currentCell?.querySelector('.lesson21-m-first-hint')?.remove();
        }
        if (ev.pointerId !== undefined) {
            activePointerId = ev.pointerId;
            try { canvas.setPointerCapture(ev.pointerId); } catch {}
        }
        if (ev.cancelable) ev.preventDefault();
        ctx = resizeLessonCompletionCanvas(canvas, { preserve: true });
        const p = point(ev);
        drawing = true;
        lastX = p.x;
        lastY = p.y;
        canvas.dataset.hasWriting = 'true';
        const target = canvas.dataset.target || canvas.dataset.word || '';
        if (target && (window.lastSpokenChar !== target || Date.now() - window.lastSpokenTime > 1200)) {
            window.speakChar(target);
            window.lastSpokenChar = target;
            window.lastSpokenTime = Date.now();
        }
    };
    const move = (ev) => {
        if (!drawing) return;
        if (activePointerId !== null && ev.pointerId !== undefined && ev.pointerId !== activePointerId) return;
        if (ev.cancelable) ev.preventDefault();
        const p = point(ev);
        ctx.strokeStyle = 'rgba(17, 24, 39, 0.82)';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        lastX = p.x;
        lastY = p.y;
    };
    const stop = () => {
        drawing = false;
        activePointerId = null;
    };
    if (window.PointerEvent) {
        canvas.addEventListener('pointerdown', start);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
        canvas.addEventListener('pointerleave', stop);
    } else {
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('mouseout', stop);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', stop);
        canvas.addEventListener('touchcancel', stop);
    }
    canvas.dataset.ready = 'true';
}

function initializeLessonCompletionCanvases() {
    document.querySelectorAll('.view-section:not(.hidden) .lesson-complete-writing-canvas').forEach((canvas) => {
        initializeLessonCompletionCanvas(canvas);
    });
}

window.clearLesson13WordWriting = function clearLesson13WordWriting(button) {
    const card = button.closest('.lesson-complete-card');
    card?.querySelectorAll('.lesson-complete-writing-canvas').forEach((canvas) => {
        const ctx = resizeLessonCompletionCanvas(canvas, { preserve: false });
        ctx.clearRect(0, 0, canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
        delete canvas.dataset.hasWriting;
    });
};

window.showNextPictureWordMatchBatch = function showNextPictureWordMatchBatch(lessonId) {
    const batchCount = Math.max(1, Math.ceil(getPictureWordLessonItems(lessonId).length / 4));
    window.pictureWordMatchBatch[lessonId] = (Number(window.pictureWordMatchBatch[lessonId] || 0) + 1) % batchCount;
    renderLearningDetail(lessonId, 2);
};

window.submitFillOneJamo = async function(lessonId, index) {
    const lesson = getChanchanLesson(lessonId);
    const item = lesson?.fillItems?.[index];
    if (!item) return;
    const feedback = document.getElementById(`fill-feedback-${lessonId}-${index}`);
    await recordKoreanAttempt({
        lessonId,
        lessonTitle: lesson.title,
        unitId: lesson.unit,
        activityType: 'fillOneJamo',
        word: item.word,
        prompt: item.prompt,
        answer: item.answer,
        userAnswer: `${item.answer} 직접 쓰기 완료`,
        isCorrect: true,
        retryIndex: 1,
        hintUsed: false,
        errorType: null
    });
    if (feedback) {
        feedback.className = 'text-sm font-black text-green-600';
        feedback.textContent = `${item.answer} 쓰기 완료로 기록했어요.`;
    }
    resetKoreanRetryIndex({ lessonId, activityType: 'fillOneJamo', word: item.word, answer: item.answer });
};

window.selectWordPicture = async function(lessonId, answer, userAnswer, btn) {
    const lesson = getChanchanLesson(lessonId);
    const isCorrect = answer === userAnswer;
    await recordKoreanAttempt({ lessonId, lessonTitle: lesson?.title, unitId: lesson?.unit, activityType: 'wordPictureMatch', word: answer, answer, userAnswer, isCorrect, errorType: isCorrect ? null : KOREAN_ERROR_TYPES.MEANING_MATCH });
    btn.classList.add(isCorrect ? 'active' : 'wrong');
    const feedback = btn.closest('.lesson13-match-card')?.querySelector('.picture-match-feedback');
    if (feedback) {
        feedback.textContent = isCorrect
            ? `좋아요! ${answer}라고 읽어요.`
            : '그림을 다시 보고 한 번 더 골라요.';
        feedback.className = `picture-match-feedback mt-3 min-h-[1.5rem] text-base font-black ${isCorrect ? 'text-green-600' : 'text-orange-500'}`;
    }
    speakTextKo(isCorrect ? `좋아요. ${answer}라고 읽어요.` : '그림을 다시 보고 단어를 읽어 봐요.');
};

window.markNonsenseRead = async function(lessonId, word, btn) {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({ lessonId, lessonTitle: lesson?.title, unitId: lesson?.unit, activityType: 'nonsenseWordRead', word, isCorrect: true, errorType: null });
    btn.classList.add('active');
};

window.recordWriteOnCanvas = async function(lessonId, btn) {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({ lessonId, lessonTitle: lesson?.title || getLessonTitleForReport(lessonId), unitId: lesson?.unit || getUnitIdForLesson(lessonId), activityType: 'writeOnCanvas', isCorrect: true, errorType: null });
    btn.textContent = '쓰기 완료';
};

window.recordBatchimFamilyRead = async function(lessonId, word, isCorrect, btn) {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({ lessonId, lessonTitle: lesson?.title, unitId: lesson?.unit, activityType: 'batchimFamily', word, answer: word, userAnswer: word, isCorrect, errorType: isCorrect ? null : KOREAN_ERROR_TYPES.BATCHIM_FAMILY });
    btn.classList.add('active');
};

window.recordFinalAssessmentArea = async function(lessonId, area, btn) {
    const lesson = getChanchanLesson(lessonId);
    await recordKoreanAttempt({ lessonId, lessonTitle: lesson?.title, unitId: lesson?.unit, activityType: 'finalAssessment', word: area, isCorrect: true });
    btn.classList.add('active');
};

function getLessonMouthAudioProfile(char) {
    return LESSON_MOUTH_AUDIO_PROFILES[char] || null;
}

function getLessonMouthAudioText(char, slow = false) {
    const profile = getLessonMouthAudioProfile(char);
    return profile?.[slow ? 'slowText' : 'normalText']
        || LESSON_MOUTH_FALLBACK_TEXTS[char]?.[slow ? 'slow' : 'normal']
        || spokenLabelForChar(char);
}

function getLessonMouthDuration(char, slow = false, reducedMotion = false) {
    const profile = getLessonMouthAudioProfile(char);
    const baseDuration = profile?.[slow ? 'slowDuration' : 'normalDuration'] || (slow ? 1350 : 850);
    return reducedMotion ? Math.round(baseDuration * 0.84) : baseDuration;
}

function playLessonMouthAudioFallback(char, slow = false) {
    playLessonMouthNativeFallback(getLessonMouthAudioText(char, slow), slow, char);
}

function playLessonMouthOnlineFallback(text, slow = false, char = '') {
    const profile = getLessonMouthAudioProfile(char);
    const playbackRate = profile?.[slow ? 'slowRate' : 'normalRate'] || (slow ? 0.82 : 1);
    speakTextKo(text, null, { playbackRate });
}

function playLessonMouthNativeFallback(text, slow = false, char = '') {
    playLessonMouthOnlineFallback(text, slow, char);
}

function getLessonMouthPlaybackState() {
    window.lessonMouthPlaybackState = window.lessonMouthPlaybackState || {
        sequenceTimers: [],
        activeTimer: null,
        currentAudio: null
    };
    return window.lessonMouthPlaybackState;
}

function isReducedMouthMotion() {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function clearLessonMouthSequenceTimers() {
    const state = getLessonMouthPlaybackState();
    state.sequenceTimers.forEach((timer) => window.clearTimeout(timer));
    state.sequenceTimers = [];
}

function clearLessonMouthActiveTimer() {
    const state = getLessonMouthPlaybackState();
    if (state.activeTimer) {
        window.clearTimeout(state.activeTimer);
        state.activeTimer = null;
    }
}

function stopLessonMouthAudio() {
    const state = getLessonMouthPlaybackState();
    if (state.currentAudio) {
        try {
            state.currentAudio.pause();
            state.currentAudio.currentTime = 0;
        } catch {}
        state.currentAudio = null;
    }
    if (globalTtsAudio) {
        try {
            globalTtsAudio.pause();
            globalTtsAudio.currentTime = 0;
        } catch {}
    }
    if (typeof speechSynthesis !== 'undefined') {
        try { speechSynthesis.cancel(); } catch {}
    }
}

function resetLessonMouthCards(step) {
    const selector = step
        ? `.mouth-sound-card[data-mouth-step="${step}"], .mouth-quiz-hint-card[data-mouth-step="${step}"]`
        : '.mouth-sound-card, .mouth-quiz-hint-card';
    document.querySelectorAll(selector).forEach((card) => {
        card.classList.remove('is-playing', 'is-active', 'is-reduced-motion');
    });
}

function stopLessonMouthPlayback(step, options = {}) {
    if (!options.keepSequence) clearLessonMouthSequenceTimers();
    clearLessonMouthActiveTimer();
    stopLessonMouthAudio();
    resetLessonMouthCards(step);
}

function activateLessonMouthCard(step, char, slow = false, options = {}) {
    const state = getLessonMouthPlaybackState();
    const reducedMotion = isReducedMouthMotion();
    const duration = getLessonMouthDuration(char, slow, reducedMotion);
    const revealCard = options.revealCard !== false;
    const cards = Array.from(document.querySelectorAll(`.mouth-sound-card[data-mouth-step="${step}"], .mouth-quiz-hint-card[data-mouth-step="${step}"]`));
    cards.forEach((card) => {
        const isTarget = card.dataset.mouthChar === char;
        const isQuizHint = card.classList.contains('mouth-quiz-hint-card');
        const shouldPlay = revealCard ? isTarget : isQuizHint;
        card.classList.toggle('is-playing', shouldPlay);
        card.classList.toggle('is-active', revealCard && isTarget);
        card.classList.toggle('is-reduced-motion', shouldPlay && reducedMotion);
        card.style.setProperty('--mouth-duration', `${duration}ms`);
    });
    state.activeTimer = window.setTimeout(() => {
        resetLessonMouthCards(step);
        state.activeTimer = null;
    }, duration + 250);
}

window.playLessonMouthSequence = function(step, slow = false, options = {}) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return;
    stopLessonMouthPlayback(step);
    const state = getLessonMouthPlaybackState();
    const reducedMotion = isReducedMouthMotion();
    let sequenceOffset = 0;
    config.items.forEach((item, index) => {
        const timer = window.setTimeout(() => {
            window.playLessonMouthSound(step, item.char, slow, {
                fromSequence: true,
                skipRecord: true,
                auto: Boolean(options.auto)
            });
        }, sequenceOffset);
        state.sequenceTimers.push(timer);
        sequenceOffset += getLessonMouthDuration(item.char, slow, reducedMotion) + (reducedMotion ? 90 : 120);
    });
};

window.playLessonMouthSound = async function(step, char, slow = false, options = {}) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return;
    const fromSequence = Boolean(options.fromSequence);
    stopLessonMouthPlayback(step, { keepSequence: fromSequence });
    activateLessonMouthCard(step, char, slow, { revealCard: options.revealCard !== false });
    window.lessonMouthFollowChar = window.lessonMouthFollowChar || {};
    window.lessonMouthFollowChar[step] = char;
    if (!options.skipRecord) {
        const recordMouthListen = async () => {
            const audioReplayCount = incrementKoreanAudioReplayCount({
                lessonId: step,
                activityType: slow ? 'mouthSoundSlowListen' : 'mouthSoundListen',
                answer: char
            });
            await recordKoreanAttempt({
                lessonId: step,
                lessonTitle: getLessonTitleForReport(step),
                unitId: getUnitIdForLesson(step),
                activityType: slow ? 'mouthSoundSlowListen' : 'mouthSoundListen',
                word: char,
                answer: char,
                userAnswer: char,
                isCorrect: true,
                errorType: null,
                audioReplayCount
            });
        };
        recordMouthListen().catch(() => {});
    }

    const sources = LESSON_MOUTH_AUDIO_SOURCES[char] || [];
    const state = getLessonMouthPlaybackState();
    let played = false;
    const trySource = (index) => {
        if (index >= sources.length) {
            if (!played) playLessonMouthAudioFallback(char, slow);
            return;
        }
        const audio = new Audio(sources[index]);
        audio.playbackRate = slow ? 0.68 : 1;
        state.currentAudio = audio;
        audio.onended = () => {
            if (state.currentAudio === audio) state.currentAudio = null;
        };
        audio.onerror = () => {
            if (state.currentAudio === audio) state.currentAudio = null;
            trySource(index + 1);
        };
        audio.play().then(() => {
            played = true;
        }).catch(() => {
            if (state.currentAudio === audio) state.currentAudio = null;
            trySource(index + 1);
        });
    };
    trySource(0);
};

window.completeLessonMouthRepeat = async function(step, btn) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    const target = window.lessonMouthFollowChar?.[step] || config?.defaultFollow || 'ㅐ';
    await recordKoreanAttempt({
        lessonId: step,
        lessonTitle: getLessonTitleForReport(step),
        unitId: getUnitIdForLesson(step),
        activityType: 'repeatAfterListen',
        word: target,
        answer: target,
        userAnswer: '따라 했어요',
        isCorrect: true,
        errorType: null
    });
    btn.classList.add('active');
    const feedback = document.getElementById(`lesson-mouth-repeat-feedback-${step}`);
    if (feedback) feedback.textContent = `${target} 소리를 따라 말한 것으로 기록했어요.`;
};

window.playLessonMouthQuizSound = function(step) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return;
    const currentAnswer = window.lessonMouthQuizTarget?.[step] || config.defaultFollow;
    const hasPlayed = Boolean(window.lessonMouthQuizPlayed?.[step]);
    const choices = hasPlayed
        ? config.quizChoices.filter((char) => char !== currentAnswer)
        : config.quizChoices;
    const answer = choices[Math.floor(Math.random() * choices.length)] || currentAnswer;
    window.lessonMouthQuizTarget[step] = answer;
    window.lessonMouthQuizPlayed[step] = true;
    window.playLessonMouthSound(step, answer, false, { revealCard: false });
};

window.nextLessonMouthSoundQuiz = function(step) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return;
    stopLessonMouthPlayback(step);
    window.lessonMouthQuizTarget[step] = config.quizChoices[Math.floor(Math.random() * config.quizChoices.length)];
    window.lessonMouthQuizPlayed[step] = false;
    document.querySelectorAll('.lesson15-choice-btn').forEach(btn => btn.classList.remove('correct', 'wrong'));
    const feedback = document.getElementById(`lesson-mouth-quiz-feedback-${step}`);
    if (feedback) {
        feedback.className = 'text-center text-orange-500 font-black mt-3 min-h-[1.6rem]';
        feedback.textContent = '소리를 듣고 알맞은 글자를 골라요.';
    }
};

window.selectLessonMouthSoundAnswer = async function(step, btn, userAnswer) {
    const config = LESSON_MOUTH_ACTIVITY_CONFIGS[step];
    if (!config) return;
    const answer = window.lessonMouthQuizTarget?.[step] || config.defaultFollow;
    const isCorrect = userAnswer === answer;
    const retryIndex = nextKoreanRetryIndex({ lessonId: step, activityType: config.activityType, word: answer, answer });
    await recordKoreanAttempt({
        lessonId: step,
        lessonTitle: getLessonTitleForReport(step),
        unitId: getUnitIdForLesson(step),
        activityType: config.activityType,
        word: answer,
        prompt: `소리를 듣고 ${config.quizChoices.join('/')} 고르기`,
        answer,
        userAnswer,
        isCorrect,
        errorType: isCorrect ? null : KOREAN_ERROR_TYPES.COMPLEX_VOWEL,
        retryIndex,
        hintUsed: !isCorrect,
        audioReplayCount: getKoreanAudioReplayCount({ lessonId: step, activityType: 'mouthSoundListen', answer })
    });
    document.querySelectorAll('.lesson15-choice-btn').forEach(choice => choice.classList.remove('correct', 'wrong'));
    btn.classList.add(isCorrect ? 'correct' : 'wrong');
    const feedback = document.getElementById(`lesson-mouth-quiz-feedback-${step}`);
    if (feedback) {
        feedback.className = `text-center font-black mt-3 min-h-[1.6rem] ${isCorrect ? 'text-green-600' : 'text-red-500'}`;
        feedback.textContent = isCorrect ? `좋아요! 이 소리는 ${answer}예요.` : '다시 들어 보고 입모양도 떠올려 보세요.';
    }
    if (isCorrect) resetKoreanRetryIndex({ lessonId: step, activityType: config.activityType, word: answer, answer });
};

window.playLesson15MouthSound = (char, slow = false) => window.playLessonMouthSound(15, char, slow);
window.completeLesson15Repeat = (btn) => window.completeLessonMouthRepeat(15, btn);
window.playLesson15QuizSound = () => window.playLessonMouthQuizSound(15);
window.nextLesson15SoundQuiz = () => window.nextLessonMouthSoundQuiz(15);
window.selectLesson15SoundAnswer = (btn, userAnswer) => window.selectLessonMouthSoundAnswer(15, btn, userAnswer);

// ② 듣고 알맞은 글자 선택 (소리 듣기 퀴즈 게임)
window.playChoiceQuizSound = function() {
    if (window.currentChoiceQuizTarget) {
        incrementKoreanAudioReplayCount({
            lessonId: currentLearningActivityStep,
            activityType: 'listenAndFind',
            answer: window.currentChoiceQuizTarget
        });
        speakTextKo(spokenLabelForChar(window.currentChoiceQuizTarget));
    }
};

window.selectChoiceBtn = function(btn, word) {
    // 이미 맞춘 글자는 터치 무시
    if (window.completedChoices && window.completedChoices.includes(word)) {
        return;
    }

    const grid = btn.closest('.choice-grid-wide') || btn.closest('.choice-grid-three') || btn.closest('.choice-grid');
    if (grid) {
        // 오답(.wrong) 및 선택 스타일만 일괄 초기화하고, 맞춘 정답(.correct)은 그대로 둡니다!
        grid.querySelectorAll('.choice-chip-button').forEach(b => {
            b.classList.remove('selected', 'wrong');
        });
    }
    btn.classList.add('selected');

    const feedbackEl = document.getElementById('choice-feedback-area');
    const answerWord = window.currentChoiceQuizTarget;
    const attemptContext = {
        lessonId: currentLearningActivityStep,
        lessonTitle: getLessonTitleForReport(currentLearningActivityStep),
        unitId: getUnitIdForLesson(currentLearningActivityStep),
        activityType: 'listenAndFind',
        word: answerWord,
        prompt: '소리를 듣고 알맞은 글자 선택',
        answer: answerWord,
        userAnswer: word,
        audioReplayCount: getKoreanAudioReplayCount({
            lessonId: currentLearningActivityStep,
            activityType: 'listenAndFind',
            answer: answerWord
        }),
        durationMs: Date.now() - koreanActivityStartedAt
    };

    if (word === answerWord) {
        // 정답!
        const retryIndex = nextKoreanRetryIndex({
            lessonId: currentLearningActivityStep,
            activityType: 'listenAndFind',
            answer: answerWord
        });
        recordKoreanAttempt({
            ...attemptContext,
            isCorrect: true,
            errorType: null,
            retryIndex
        });
        resetKoreanRetryIndex({
            lessonId: currentLearningActivityStep,
            activityType: 'listenAndFind',
            answer: answerWord
        });
        btn.classList.remove('selected');
        btn.classList.add('correct');
        if (window.completedChoices) {
            window.completedChoices.push(word);
        }
        if (window.uncompletedChoices) {
            window.uncompletedChoices = window.uncompletedChoices.filter(x => x !== word);
        }

        playClickSound(); // 명랑한 효과음 재생

        if (window.uncompletedChoices && window.uncompletedChoices.length === 0) {
            // 전체 완료!
            window.currentChoiceQuizTarget = null;
            if (feedbackEl) {
                feedbackEl.className = "text-base font-black text-center mt-2 mb-4 min-h-[1.4rem] text-green-600 animate-bounce";
                feedbackEl.textContent = "🏆 대단해요! 모든 글자를 전부 맞췄어요! 🏆";
            }
            setTimeout(() => { speakTextKo("대단해요! 모든 글자를 전부 맞췄어요!"); }, 300);
        } else {
            // 아직 남음
            // 새 정답 단어 설정
            window.currentChoiceQuizTarget = window.uncompletedChoices[Math.floor(Math.random() * window.uncompletedChoices.length)];
            if (feedbackEl) {
                feedbackEl.className = "text-base font-black text-center mt-2 mb-4 min-h-[1.4rem] text-green-600";
                feedbackEl.textContent = "🎉 정답! 다음 글자 소리를 들으려면 [소리 듣기]를 눌러주세요!";
            }
            setTimeout(() => { speakTextKo("정답! 다음 소리를 들으려면 소리 듣기 버튼을 눌러주세요."); }, 300);
        }
    } else {
        // 오답!
        const retryIndex = nextKoreanRetryIndex({
            lessonId: currentLearningActivityStep,
            activityType: 'listenAndFind',
            answer: answerWord
        });
        recordKoreanAttempt({
            ...attemptContext,
            isCorrect: false,
            retryIndex,
            errorType: inferKoreanErrorType({ lessonId: currentLearningActivityStep, activityType: 'listenAndFind', answer: answerWord, word })
        });
        btn.classList.add('wrong');
        if (feedbackEl) {
            feedbackEl.className = "text-base font-black text-center mt-2 mb-4 min-h-[1.4rem] text-red-500";
            feedbackEl.textContent = "😢 다시 들어 보아요.";
        }
        // "다시 들어 보아요." 음성 연동
        setTimeout(() => { speakTextKo("다시 들어 보아요."); }, 300);

        // 오답 빨간 표시는 1초 뒤에 자동으로 지워서 다음 입력을 편안하게 돕습니다!
        setTimeout(() => {
            btn.classList.remove('selected', 'wrong');
        }, 1000);
    }
};

const learningStartTTSMessage = `한글은 자음과 모음으로 만들어져 있습니다. 모음의 모(母)는 한문으로 엄마를 뜻하고, 자음에서 자(子)는 남자, 여자 할 때 나오는 자로 아들과 딸을 의미합니다. 아래 그림과 글자를 비교하면서 자음과 모음 찾기 활동을 합니다. 그림을 보면서 엄마는 어디에 있나요? 그럼 글자에서 엄마를 뜻하는 모음은 어디에 있나요? 그리고 아기를 뜻하는 자음은 어디에 있나요? 이렇게 찾고 구별하도록 하는 활동입니다.`;

window.openLearningStartActivity = function openLearningStartActivity() {
    showTopLevelSection('learning-start-section');
    goToUnderstandingStep(1);
}

window.closeLearningStartActivity = function closeLearningStartActivity() {
    openMyKoreanSection();
}

const lesson27FamilyState = {
    heard: new Set(),
    playbackToken: 0,
    movementTimer: null,
    activeKey: null,
    activeAnimation: null,
    pendingAudioResolve: null,
    resizeObserver: null
};

const LESSON27_HAND_GEOMETRY = {
    upperFingerTip: { xRatio: 0.10, yRatio: 0.96 },
    lowerTargets: {
        first: { xRatio: 0.37, yRatio: 0.55 },
        final: { xRatio: 0.03, yRatio: 0.63 }
    }
};

function renderLesson27HandMotion() {
    return `
        <span class="lesson27-hand-stage">
            <img class="lesson27-hand-lower" src="lesson27_hand_lower.png?v=20260721-v9" alt="" draggable="false">
            <span class="lesson27-sound-anchor lesson27-sound-anchor-first" aria-hidden="true"></span>
            <span class="lesson27-sound-anchor lesson27-sound-anchor-final" aria-hidden="true"></span>
            <svg class="lesson27-hand-motion-lines" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
                <path d="M94 10C70 2 36 5 6 16" />
                <path d="M92 25C65 16 34 19 5 29" />
            </svg>
            <span class="lesson27-hand-contact" aria-hidden="true"></span>
            <img class="lesson27-hand-upper" src="lesson27_hand_upper.png?v=20260721-v9" alt="" draggable="false">
        </span>
    `;
}

function renderLesson27BatchimFamilyIntro() {
    return `
        <section class="lesson27-family-page" data-lesson27-family-page>
            <header class="lesson27-family-header">
                <span class="lesson27-family-number">배움 27</span>
                <div>
                    <h2>ㅂ 받침가족</h2>
                    <p>이름은 달라도, 받침 소리는 같아요!</p>
                </div>
            </header>

            <div class="lesson27-family-explanation">
                <strong>쉽게 알아봐요</strong>
                <p>ㅂ과 ㅍ은 이름은 다르지만, 받침에서는 모두 <b>[ㅂ]</b>으로 소리 나요.</p>
                <p class="lesson27-family-helper">비읍, 피읖의 끝부분은 모두 ‘읍’처럼 들려요.</p>
            </div>

            <div class="lesson27-family-step">
                <span>이해하기</span>
                <strong>비읍과 피읖은 받침에서 모두 [ㅂ] 소리가 나요.</strong>
            </div>

            <div class="lesson27-family-cards">
                ${[
                    { key: 'bieup', letter: 'ㅂ', first: '비', name: '비읍' },
                    { key: 'pieup', letter: 'ㅍ', first: '피', name: '피읖' }
                ].map((item) => `
                    <article class="lesson27-family-card state-idle" data-family-card="${item.key}" data-animation-state="idle">
                        <span class="lesson27-card-check" aria-hidden="true">확인했어요</span>
                        <span class="lesson27-family-letter">${item.letter}</span>
                        <span class="lesson27-name-stack" aria-label="${item.name}">
                            <span class="lesson27-first-block">${item.first}</span>
                            <span class="lesson27-ending-block">읍</span>
                        </span>
                        <span class="lesson27-hand-scene" aria-hidden="true">
                            <span class="lesson27-hand-track">${renderLesson27HandMotion()}</span>
                            <span class="lesson27-stage-caption">손동작과 소리를 살펴보세요.</span>
                        </span>
                        <span class="lesson27-card-copy">
                            <strong>${item.name}</strong>
                            <span>받침 소리 <b>[ㅂ]</b></span>
                            <button type="button" class="lesson27-play-button" data-family-play="${item.key}"
                                aria-label="${item.name} 손동작과 소리 보기"
                                aria-pressed="false" onclick="playLesson27FamilyCard('${item.key}')">
                                <span aria-hidden="true">▶</span> <span class="lesson27-play-label">손동작과 소리 보기</span>
                            </button>
                        </span>
                    </article>
                `).join('')}
            </div>

            <div class="lesson27-sound-compare" aria-label="받침 소리 비교">
                <span><b>ㅂ 받침</b><i>→</i><strong>[ㅂ]</strong></span>
                <span><b>ㅍ 받침</b><i>→</i><strong>[ㅂ]</strong></span>
                <em>모양과 이름은 다르지만,<br>받침 소리는 같아요.</em>
            </div>

            <div id="lesson27-family-summary" class="lesson27-family-summary" role="status" aria-live="polite">
                ㅂ과 ㅍ의 손동작과 소리를 차례로 확인해 보세요.
            </div>
        </section>
    `;
}

function syncLesson27FamilyPage() {
    const page = document.querySelector('[data-lesson27-family-page]');
    if (!page) return;
    page.querySelectorAll('[data-family-card]').forEach((card) => {
        const isHeard = lesson27FamilyState.heard.has(card.dataset.familyCard);
        card.classList.toggle('is-heard', isHeard);
        const playButton = card.querySelector('[data-family-play]');
        if (playButton) {
            playButton.setAttribute('aria-pressed', String(isHeard));
            if (!card.classList.contains('is-playing')) {
                playButton.disabled = false;
                playButton.querySelector('.lesson27-play-label').textContent = isHeard ? '한 번 더 보기' : '손동작과 소리 보기';
            }
        }
    });
    const isComplete = lesson27FamilyState.heard.size === 2;
    const summary = document.getElementById('lesson27-family-summary');
    if (summary) {
        summary.classList.toggle('is-complete', isComplete);
        summary.innerHTML = isComplete
            ? '<strong>잘했어요!<br>ㅂ과 ㅍ은 받침에서 모두 [ㅂ] 소리가 나요.</strong><span>그래서 비읍과 피읖의 끝부분은 모두 ‘읍’처럼 들려요.</span>'
            : lesson27FamilyState.heard.size === 1
                ? '좋아요! 이제 다른 글자의 손동작과 소리도 확인해 보세요.'
                : 'ㅂ과 ㅍ의 손동작과 소리를 차례로 확인해 보세요.';
    }
    const nextBtn = document.getElementById('learning-detail-next-btn');
    if (nextBtn && Number(window.currentLearningActivityStep) === 27 && Number(window.currentLearningDetailSectionIndex) === 0) {
        nextBtn.disabled = !isComplete;
        nextBtn.setAttribute('aria-disabled', String(!isComplete));
        nextBtn.title = isComplete ? '다음 활동으로 이동' : 'ㅂ과 ㅍ 카드를 모두 들어 보세요.';
    }
}

function setLesson27CardAnimationState(card, state, config) {
    const stateClasses = ['state-idle', 'state-first-sound', 'state-hand-moving', 'state-final-sound', 'state-completed'];
    card.classList.remove(...stateClasses);
    const stateClass = state.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    card.classList.add(`state-${stateClass}`);
    const hasCompleted = state === 'completed' && lesson27FamilyState.heard.has(config.key);
    card.classList.toggle('is-playing', state !== 'idle' && !hasCompleted);
    card.dataset.animationState = state;
    const captions = {
        idle: '손동작과 소리를 살펴보세요.',
        firstSound: `${config.first} 소리를 들어요.`,
        handMoving: '위 손이 아래 손을 향해 내려와요.',
        finalSound: '손이 닿을 때 끝부분 ‘읍’을 들어요.',
        completed: config.key === 'pieup'
            ? '‘피읖’의 끝부분도 ‘읍’처럼 들려요.'
            : '‘비’ 다음에 끝부분 ‘읍’을 들어요.'
    };
    const caption = card.querySelector('.lesson27-stage-caption');
    if (caption) caption.textContent = captions[state];
    const playButton = card.querySelector('[data-family-play]');
    if (playButton) {
        playButton.disabled = state !== 'idle' && !hasCompleted;
        playButton.querySelector('.lesson27-play-label').textContent = state !== 'idle' && !hasCompleted
            ? '손동작을 보고 있어요'
            : lesson27FamilyState.heard.has(config.key) ? '한 번 더 보기' : '손동작과 소리 보기';
    }
}

function waitForLesson27HandMovement(card, playbackToken, onComplete) {
    const hand = card.querySelector('.lesson27-hand-upper');
    if (!hand) {
        onComplete();
        return;
    }
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let finished = false;
    const finish = () => {
        if (finished || playbackToken !== lesson27FamilyState.playbackToken) return;
        finished = true;
        window.clearTimeout(lesson27FamilyState.movementTimer);
        onComplete();
    };
    if (!reducedMotion) hand.addEventListener('transitionend', finish, { once: true });
    lesson27FamilyState.movementTimer = window.setTimeout(finish, reducedMotion ? 180 : 820);
}

function waitForLesson27ContactHold(playbackToken, onComplete) {
    window.clearTimeout(lesson27FamilyState.movementTimer);
    lesson27FamilyState.movementTimer = window.setTimeout(() => {
        if (playbackToken === lesson27FamilyState.playbackToken) onComplete();
    }, 560);
}

function waitForLesson27HandReturn(card, playbackToken, onComplete) {
    const hand = card.querySelector('.lesson27-hand-upper');
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let finished = false;
    const finish = () => {
        if (finished || playbackToken !== lesson27FamilyState.playbackToken) return;
        finished = true;
        window.clearTimeout(lesson27FamilyState.movementTimer);
        onComplete();
    };
    if (hand && !reducedMotion) hand.addEventListener('transitionend', finish, { once: true });
    lesson27FamilyState.movementTimer = window.setTimeout(finish, reducedMotion ? 180 : 680);
}

window.playLesson27FamilyCardLegacy = function playLesson27FamilyCardLegacy(kind) {
    const card = document.querySelector(`[data-family-card="${kind}"]`);
    if (!card) return;
    const config = kind === 'pieup'
        ? { key: 'pieup', name: '피읖', first: '피', ending: '읍' }
        : { key: 'bieup', name: '비읍', first: '비', ending: '읍' };
    lesson27FamilyState.playbackToken += 1;
    const playbackToken = lesson27FamilyState.playbackToken;
    lesson27FamilyState.activeKey = kind;
    window.clearTimeout(lesson27FamilyState.movementTimer);
    document.querySelectorAll('[data-family-card]').forEach((item) => {
        if (item === card) return;
        const itemKey = item.dataset.familyCard;
        const itemConfig = itemKey === 'pieup'
            ? { key: 'pieup', name: '피읖', first: '피' }
            : { key: 'bieup', name: '비읍', first: '비' };
        setLesson27CardAnimationState(item, lesson27FamilyState.heard.has(itemKey) ? 'completed' : 'idle', itemConfig);
    });
    const firstListen = !lesson27FamilyState.heard.has(kind);
    const isCurrent = () => playbackToken === lesson27FamilyState.playbackToken;
    const speakStep = (text, next) => speakTextKo(text, () => {
        if (isCurrent()) next();
    }, { playbackRate: 0.78 });

    setLesson27CardAnimationState(card, 'firstSound', config);
    speakStep(config.first, () => {
        setLesson27CardAnimationState(card, 'handMoving', config);
        waitForLesson27HandMovement(card, playbackToken, () => {
            setLesson27CardAnimationState(card, 'finalSound', config);
            speakStep(config.ending, () => {
                waitForLesson27ContactHold(playbackToken, () => {
                    speakStep(config.name, () => {
                        setLesson27CardAnimationState(card, 'completed', config);
                        waitForLesson27HandReturn(card, playbackToken, () => {
                            lesson27FamilyState.heard.add(kind);
                            lesson27FamilyState.activeKey = null;
                            setLesson27CardAnimationState(card, 'completed', config);
                            syncLesson27FamilyPage();
                            if (firstListen) {
                                recordKoreanAttempt({
                                    lessonId: 27,
                                    lessonTitle: '배움 27: ㅂ 받침가족',
                                    unitId: 8,
                                    activityType: 'batchimFamily',
                                    word: config.name,
                                    answer: '[ㅂ]',
                                    userAnswer: `${config.name} 손동작과 받침 소리 확인 완료`,
                                    isCorrect: true,
                                    errorType: null
                                }).catch(() => {});
                            }
                        });
                    });
                });
            });
        });
    });
};

function positionLesson27HandAnchors(card) {
    const stage = card?.querySelector('.lesson27-hand-stage');
    const lowerHand = card?.querySelector('.lesson27-hand-lower');
    const firstAnchor = card?.querySelector('.lesson27-sound-anchor-first');
    const finalAnchor = card?.querySelector('.lesson27-sound-anchor-final');
    if (!stage || !lowerHand || !firstAnchor || !finalAnchor) return;
    const stageRect = stage.getBoundingClientRect();
    const lowerRect = lowerHand.getBoundingClientRect();
    const placeAnchor = (anchor, target) => {
        anchor.style.left = `${lowerRect.left - stageRect.left + lowerRect.width * target.xRatio}px`;
        anchor.style.top = `${lowerRect.top - stageRect.top + lowerRect.height * target.yRatio}px`;
    };
    placeAnchor(firstAnchor, LESSON27_HAND_GEOMETRY.lowerTargets.first);
    placeAnchor(finalAnchor, LESSON27_HAND_GEOMETRY.lowerTargets.final);
    const contact = card.querySelector('.lesson27-hand-contact');
    if (contact) {
        contact.style.left = `${finalAnchor.offsetLeft}px`;
        contact.style.top = `${finalAnchor.offsetTop}px`;
    }
    const motionLines = card.querySelector('.lesson27-hand-motion-lines');
    if (motionLines) {
        const left = Math.min(firstAnchor.offsetLeft, finalAnchor.offsetLeft);
        const width = Math.abs(firstAnchor.offsetLeft - finalAnchor.offsetLeft);
        motionLines.style.left = `${left}px`;
        motionLines.style.top = `${Math.min(firstAnchor.offsetTop, finalAnchor.offsetTop) - 28}px`;
        motionLines.style.width = `${Math.max(42, width)}px`;
    }
}

function calculateLesson27FingerTransforms(card) {
    positionLesson27HandAnchors(card);
    const hand = card.querySelector('.lesson27-hand-upper');
    const firstAnchor = card.querySelector('.lesson27-sound-anchor-first');
    const finalAnchor = card.querySelector('.lesson27-sound-anchor-final');
    if (!hand || !firstAnchor || !finalAnchor) return null;
    const fingerX = hand.offsetLeft + hand.offsetWidth * LESSON27_HAND_GEOMETRY.upperFingerTip.xRatio;
    const fingerY = hand.offsetTop + hand.offsetHeight * LESSON27_HAND_GEOMETRY.upperFingerTip.yRatio;
    const pointFor = (anchor, lift = 0, rotation = 0) => ({
        x: anchor.offsetLeft - fingerX,
        y: anchor.offsetTop - fingerY - lift,
        rotation
    });
    const first = pointFor(firstAnchor, 0, -1);
    const final = pointFor(finalAnchor, 0, 0);
    return {
        start: { x: first.x + 18, y: first.y - 54, rotation: -2 },
        first,
        middle: {
            x: first.x + (final.x - first.x) * 0.52,
            y: first.y + (final.y - first.y) * 0.52 - 7,
            rotation: 1
        },
        final
    };
}

function lesson27Transform(point, extraY = 0) {
    return `translate3d(${point.x}px, ${point.y + extraY}px, 0) rotate(${point.rotation}deg)`;
}

function cancelLesson27FamilyPlayback() {
    lesson27FamilyState.playbackToken += 1;
    lesson27FamilyState.activeAnimation?.cancel();
    lesson27FamilyState.activeAnimation = null;
    window.clearTimeout(lesson27FamilyState.movementTimer);
    if (lesson27FamilyState.pendingAudioResolve) {
        const resolve = lesson27FamilyState.pendingAudioResolve;
        lesson27FamilyState.pendingAudioResolve = null;
        resolve();
    }
    window.cancelSpeech?.();
}

async function animateLesson27UpperHand(hand, keyframes, options, playbackToken) {
    if (playbackToken !== lesson27FamilyState.playbackToken) throw new Error('lesson27-playback-cancelled');
    const finalTransform = keyframes[keyframes.length - 1].transform;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        hand.style.transform = finalTransform;
        return;
    }
    lesson27FamilyState.activeAnimation?.cancel();
    const animation = hand.animate(keyframes, { fill: 'forwards', ...options });
    lesson27FamilyState.activeAnimation = animation;
    try {
        await animation.finished;
    } catch (error) {
        if (playbackToken !== lesson27FamilyState.playbackToken) throw new Error('lesson27-playback-cancelled');
        throw error;
    }
    if (playbackToken !== lesson27FamilyState.playbackToken) throw new Error('lesson27-playback-cancelled');
    hand.style.transform = finalTransform;
    animation.cancel();
    if (lesson27FamilyState.activeAnimation === animation) lesson27FamilyState.activeAnimation = null;
}

function speakLesson27Step(text, playbackToken) {
    return new Promise((resolve) => {
        if (playbackToken !== lesson27FamilyState.playbackToken) return resolve();
        let settled = false;
        const finish = () => {
            if (settled) return;
            settled = true;
            if (lesson27FamilyState.pendingAudioResolve === finish) lesson27FamilyState.pendingAudioResolve = null;
            resolve();
        };
        lesson27FamilyState.pendingAudioResolve = finish;
        speakTextKo(text, finish, { playbackRate: 0.78 });
    });
}

function initializeLesson27HandMotionCards() {
    lesson27FamilyState.resizeObserver?.disconnect();
    const cards = [...document.querySelectorAll('[data-family-card]')];
    const positionAll = () => cards.forEach((card) => {
        positionLesson27HandAnchors(card);
        if (!card.classList.contains('is-playing')) {
            const hand = card.querySelector('.lesson27-hand-upper');
            const points = calculateLesson27FingerTransforms(card);
            if (hand && points) hand.style.transform = lesson27Transform(points.start);
        }
    });
    cards.forEach((card) => card.querySelectorAll('.lesson27-hand-lower,.lesson27-hand-upper').forEach((image) => {
        if (!image.complete) image.addEventListener('load', positionAll, { once: true });
    }));
    if (window.ResizeObserver) {
        lesson27FamilyState.resizeObserver = new ResizeObserver(positionAll);
        cards.forEach((card) => lesson27FamilyState.resizeObserver.observe(card.querySelector('.lesson27-hand-stage')));
    }
    requestAnimationFrame(positionAll);
}

window.playLesson27FamilyCard = async function playLesson27FamilyCard(kind) {
    const card = document.querySelector(`[data-family-card="${kind}"]`);
    if (!card) return;
    const config = kind === 'pieup'
        ? { key: 'pieup', name: '피읖', first: '피', ending: '읍' }
        : { key: 'bieup', name: '비읍', first: '비', ending: '읍' };
    cancelLesson27FamilyPlayback();
    const playbackToken = lesson27FamilyState.playbackToken;
    lesson27FamilyState.activeKey = kind;
    document.querySelectorAll('[data-family-card]').forEach((item) => {
        if (item === card) return;
        const itemKey = item.dataset.familyCard;
        const itemConfig = itemKey === 'pieup'
            ? { key: 'pieup', name: '피읖', first: '피' }
            : { key: 'bieup', name: '비읍', first: '비' };
        setLesson27CardAnimationState(item, lesson27FamilyState.heard.has(itemKey) ? 'completed' : 'idle', itemConfig);
        const otherHand = item.querySelector('.lesson27-hand-upper');
        const otherPoints = calculateLesson27FingerTransforms(item);
        if (otherHand && otherPoints) otherHand.style.transform = lesson27Transform(otherPoints.start);
    });
    const firstListen = !lesson27FamilyState.heard.has(kind);
    const hand = card.querySelector('.lesson27-hand-upper');
    const points = calculateLesson27FingerTransforms(card);
    if (!hand || !points) return;
    hand.style.transform = lesson27Transform(points.start);

    try {
        setLesson27CardAnimationState(card, 'firstSound', config);
        await animateLesson27UpperHand(hand, [
            { transform: lesson27Transform(points.start) },
            { transform: lesson27Transform(points.first) }
        ], { duration: 420, easing: 'cubic-bezier(.22,.72,.28,1)' }, playbackToken);
        await Promise.all([
            animateLesson27UpperHand(hand, [
                { transform: lesson27Transform(points.first) },
                { transform: lesson27Transform(points.first, 3), offset: 0.45 },
                { transform: lesson27Transform(points.first) }
            ], { duration: 230, easing: 'ease-in-out' }, playbackToken),
            speakLesson27Step(config.first, playbackToken)
        ]);

        setLesson27CardAnimationState(card, 'handMoving', config);
        await animateLesson27UpperHand(hand, [
            { transform: lesson27Transform(points.first), offset: 0 },
            { transform: lesson27Transform(points.middle), offset: 0.52 },
            { transform: lesson27Transform(points.final), offset: 1 }
        ], { duration: 720, easing: 'cubic-bezier(.42,0,.3,1)' }, playbackToken);

        setLesson27CardAnimationState(card, 'finalSound', config);
        await Promise.all([
            animateLesson27UpperHand(hand, [
                { transform: lesson27Transform(points.final) },
                { transform: lesson27Transform(points.final, 3), offset: 0.42 },
                { transform: lesson27Transform(points.final) }
            ], { duration: 280, easing: 'ease-in-out' }, playbackToken),
            speakLesson27Step(config.ending, playbackToken)
        ]);
        await speakLesson27Step(config.name, playbackToken);

        setLesson27CardAnimationState(card, 'handMoving', config);
        await animateLesson27UpperHand(hand, [
            { transform: lesson27Transform(points.final) },
            { transform: lesson27Transform(points.start) }
        ], { duration: 500, easing: 'cubic-bezier(.4,0,.6,1)' }, playbackToken);

        lesson27FamilyState.heard.add(kind);
        lesson27FamilyState.activeKey = null;
        setLesson27CardAnimationState(card, 'completed', config);
        syncLesson27FamilyPage();
        if (firstListen) {
            recordKoreanAttempt({
                lessonId: 27,
                lessonTitle: '배움 27: ㅂ 받침가족',
                unitId: 8,
                activityType: 'batchimFamily',
                word: config.name,
                answer: '[ㅂ]',
                userAnswer: `${config.name} 손동작과 받침 소리 확인 완료`,
                isCorrect: true,
                errorType: null
            }).catch(() => {});
        }
    } catch (error) {
        if (error?.message !== 'lesson27-playback-cancelled') console.error(error);
    }
};

function renderLearningDetail(step, sectionIndex = 0) {
    window.stopVowelOriginSequence?.();
    const detail = learningDetailData[step];
    if (!detail) return;
    const numericStep = Number(step);
    const hasMakeLettersActivity = Boolean(MAKE_LETTER_ACTIVITY_CONFIGS[numericStep]);
    const isPictureWordLesson = Boolean(PICTURE_WORD_LESSON_CONFIGS[numericStep]);
    const isComplexLineLesson = numericStep >= 15 && numericStep <= 19;
    const isCustomLesson20 = numericStep === 20;
    const isCustomLesson25 = numericStep === 25;
    const isCustomLesson26 = numericStep === 26;
    const isCustomLesson27 = numericStep === 27;
    const batchimPageSequence = LESSON_BATCHIM_PAGE_SEQUENCES[numericStep] || [];
    const isCustomBatchimLesson = batchimPageSequence.length > 0;
    const visibleActivitySteps = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33];
    const practiceFlow = learningPracticeFlows[step];
    const isActivityFlow = visibleActivitySteps.includes(numericStep) && practiceFlow;

    let totalSections = isPictureWordLesson ? 4 : (hasMakeLettersActivity ? 4 : (isActivityFlow ? 3 : detail.sections.length));
    if (numericStep === 12) totalSections = 5;
    if (numericStep === 13) totalSections = 7;
    if (numericStep === 14) totalSections = 7;
    if (isComplexLineLesson) totalSections = 4;
    if (isCustomLesson20) totalSections = 5;
    if (isCustomLesson25) totalSections = 4;
    if (isCustomLesson26) totalSections = 9;
    if (isCustomBatchimLesson) totalSections = batchimPageSequence.length * 5;
    const safeIndex = Math.max(0, Math.min(sectionIndex, totalSections - 1));
    currentLearningDetailSectionIndex = safeIndex;
    window.currentLearningActivityStep = numericStep;
    window.currentLearningDetailSectionIndex = safeIndex;
    const learningDetailSectionEl = document.getElementById('learning-detail-section');
    if (learningDetailSectionEl) {
        learningDetailSectionEl.dataset.currentStep = String(numericStep);
        learningDetailSectionEl.dataset.currentSection = String(safeIndex);
    }
    const section = detail.sections[Math.min(safeIndex, detail.sections.length - 1)];

    document.getElementById('learning-detail-title').innerText = detail.title;
    const subtitleText = step === 7 && safeIndex === 0
        ? '아, 야, 어, 여, 오, 요, 우, 유, 으, 이를 순서대로 읽어요.'
        : detail.subtitle;
    document.getElementById('learning-detail-subtitle').innerText = `${subtitleText} (${safeIndex + 1}/${totalSections})`;

    const activityCards = section.cards || [];
    const introCards = activityCards.filter((card) => !/쓰기|따라 쓰|빈칸|고르기|활동/.test(card));

    if (isActivityFlow) {
        // 선택형 소리 퀴즈용 목표 단어 및 셔플 선택지 생성 (화면 진입 시 1회만 고정)
        if (!window.lastChoiceStepSec || window.lastChoiceStepSec !== `${step}`) {
            window.lastChoiceStepSec = `${step}`;
            window.currentShuffledChoices = [...practiceFlow.choices].sort(() => Math.random() - 0.5);
            window.uncompletedChoices = [...practiceFlow.choices];
            window.currentChoiceQuizTarget = window.uncompletedChoices[Math.floor(Math.random() * window.uncompletedChoices.length)];
            window.completedChoices = [];
        }

        let sectionTitle = section.title;
        if (step === 7 && safeIndex === 0) {
            sectionTitle = '';
        } else if (step === 7 && safeIndex === 1) {
            sectionTitle = '기본 모음 전체 따라 쓰기';
        } else if (step === 7 && safeIndex === 2) {
            sectionTitle = detail.sections[1].title;
        } else if (isCustomLesson20) {
            sectionTitle = ['읽기 1·2 · 그림과 단어', '읽기 3 · 무의미 단어', '확인하기 1·2 · 읽고 찾기', '쓰기 1·2 · 완성해 보기', '놀이 · 단어 놀이 해보기'][safeIndex];
        } else if (isCustomBatchimLesson) {
            const batchim = batchimPageSequence[Math.floor(safeIndex / 5)];
            const localIndex = safeIndex % 5;
            sectionTitle = [`${batchim} 받침 · 따라하기`, `${batchim} 받침 · 연습하기`, `${batchim} 받침 · 단어 쓰기`, `${batchim} 받침 · 그림 보고 쓰기`, `${batchim} 받침 · 도전하기`][localIndex];
        } else if (isCustomLesson25 && safeIndex < 2) {
            sectionTitle = `들은 낱말에 ○표 하기 ${safeIndex + 1} · ${safeIndex * 10 + 1}~${safeIndex * 10 + 10}번`;
        } else if (isCustomLesson25 && safeIndex === 2) {
            sectionTitle = '한 줄씩 소리 내어 읽기';
        } else if (isCustomLesson25 && safeIndex === 3) {
            sectionTitle = '도전하기 · 그림 글자 길 찾기';
        } else if (isCustomLesson26) {
            sectionTitle = [
                '읽기 1 · ㅁ·ㅂ 받침 단어',
                '읽기 2 · ㅇ·ㄱ 받침 단어',
                '읽기 3 · ㄴ·ㄹ·ㄷ 받침 단어',
                '읽기 4 · 대표받침 무의미 단어',
                '읽고 찾기 1',
                '읽고 찾기 2',
                '완성해 보기 1',
                '완성해 보기 2',
                '단어 놀이 해보기'
            ][safeIndex];
        } else if (isCustomLesson27 && safeIndex === 0) {
            sectionTitle = '';
        } else if (isComplexLineLesson && safeIndex === 3) {
            sectionTitle = '선긋기 · 그림과 단어 연결';
        } else if (isPictureWordLesson) {
            const pictureLessonTitles = getLessonCompletionWritingSets(numericStep).length
                ? [
                    PICTURE_WORD_LESSON_CONFIGS[numericStep].groups[0].title,
                    PICTURE_WORD_LESSON_CONFIGS[numericStep].groups[1].title,
                    '그림-단어 연결',
                    '그림 단어 따라 쓰기',
                    '쓰기 1 · 완성해 보기',
                    '쓰기 2 · 완성해 보기',
                    '단어 놀이'
                ]
                : [
                    PICTURE_WORD_LESSON_CONFIGS[numericStep].groups[0].title,
                    PICTURE_WORD_LESSON_CONFIGS[numericStep].groups[1].title,
                    '그림-단어 연결',
                    '그림 단어 따라 쓰기'
                ];
            sectionTitle = pictureLessonTitles[safeIndex];
        } else if (hasMakeLettersActivity && safeIndex === 3) {
            sectionTitle = '글자 만들기';
        } else if (numericStep === 12 && safeIndex === 4) {
            sectionTitle = '확인하기 3 · 4';
        }
        const sectionHeadingHtml = sectionTitle
            ? `<div class="activity-section-title mb-4">
                    <span class="text-xl font-bold text-stone-700">${sectionTitle}</span>
                </div>`
            : '';
        const isVowelOriginIntro = (step === 1 || step === 4) && safeIndex === 0;
        const vowelOriginTypes = step === 4 ? ['ground', 'person'] : ['ground', 'person', 'sun'];
        const introHtml = isVowelOriginIntro
            ? renderVowelOriginExplanations(vowelOriginTypes)
            : step === 7 && safeIndex === 0
            ? `<div class="border-2 border-stone-200 rounded-2xl p-4 bg-white text-lg text-stone-700 leading-relaxed">
                    <div>아, 야, 어, 여, 오, 요, 우, 유, 으, 이를 순서대로 읽어요.</div>
                    <div class="mt-2">같은 글자 배열을 따라 쓰며 소리 내어 읽어요.</div>
                </div>`
            : (introCards.length ? introCards : activityCards.slice(0, 2)).map((card) => renderCardContent(card)).join('');
        const renderLearningChipText = (word) => word === '●' ? '<span class="small-dot-char">●</span>' : word;
        const vowelOriginTypeByWord = { 'ㅡ': 'ground', 'ㅣ': 'person', '●': 'sun' };
        const wordChipWrapClass = step === 7 && safeIndex === 0 ? 'word-chip-wrap review-word-chip-wrap' : 'word-chip-wrap';
        const wordChipClass = step === 7 && safeIndex === 0 ? 'word-chip review-word-chip' : 'word-chip';
        let contentHtml = '';
        if (isCustomBatchimLesson) {
            const batchim = batchimPageSequence[Math.floor(safeIndex / 5)];
            contentHtml = renderLesson21Page(numericStep, batchim, safeIndex % 5);
        } else if (isCustomLesson25 && safeIndex < 2) {
            contentHtml = renderLesson25ListenChoicePage(safeIndex);
        } else if (isCustomLesson25 && safeIndex === 2) {
            contentHtml = renderLesson25ReadingPage();
        } else if (isCustomLesson25 && safeIndex === 3) {
            contentHtml = renderLesson25PathGame();
        } else if (isCustomLesson26 && safeIndex < 3) {
            contentHtml = renderLesson26ReadingPage(safeIndex);
        } else if (isCustomLesson26 && safeIndex === 3) {
            contentHtml = renderLesson26NonsensePage();
        } else if (isCustomLesson26 && safeIndex >= 4 && safeIndex <= 5) {
            contentHtml = renderLesson26FindPage(safeIndex - 4);
        } else if (isCustomLesson26 && safeIndex >= 6 && safeIndex <= 7) {
            contentHtml = renderLesson26WritingPage(safeIndex - 6);
        } else if (isCustomLesson26 && safeIndex === 8) {
            contentHtml = renderLesson13WordGame(26);
        } else if (isCustomLesson27 && safeIndex === 0) {
            contentHtml = renderLesson27BatchimFamilyIntro();
        } else if (isCustomLesson20 && safeIndex === 0) {
            contentHtml = renderLesson20ReadingPage();
        } else if (isCustomLesson20 && safeIndex === 1) {
            contentHtml = renderLesson20NonsensePage();
        } else if (isCustomLesson20 && safeIndex === 2) {
            contentHtml = renderLesson20ReadFind();
        } else if (isCustomLesson20 && safeIndex === 3) {
            contentHtml = renderLesson20CompletionWriting();
        } else if (isCustomLesson20 && safeIndex === 4) {
            contentHtml = renderLesson13WordGame(numericStep);
        } else if (isComplexLineLesson && safeIndex === 3) {
            contentHtml = renderLessonLineMatch(numericStep);
        } else if (isPictureWordLesson && safeIndex === 0) {
            contentHtml = renderLesson13PictureReading(numericStep, 0);
        } else if (isPictureWordLesson && safeIndex === 1) {
            contentHtml = renderLesson13PictureReading(numericStep, 1);
        } else if (isPictureWordLesson && safeIndex === 2) {
            contentHtml = renderLesson13ReadingReview(numericStep);
        } else if (isPictureWordLesson && safeIndex === 3) {
            contentHtml = renderLesson13Writing(numericStep);
        } else if (getLessonCompletionWritingSets(numericStep).length && safeIndex === 4) {
            contentHtml = renderLesson13CompletionWriting(numericStep, 0);
        } else if (getLessonCompletionWritingSets(numericStep).length && safeIndex === 5) {
            contentHtml = renderLesson13CompletionWriting(numericStep, 1);
        } else if (getLessonCompletionWritingSets(numericStep).length && safeIndex === 6) {
            contentHtml = renderLesson13WordGame(numericStep);
        } else if (hasMakeLettersActivity && safeIndex === 3) {
            contentHtml = renderMakeLettersActivity(numericStep);
        } else if (numericStep === 12 && safeIndex === 4) {
            contentHtml = renderLesson12FinalCheck();
        } else if ((step === 15 || step === 16) && safeIndex === 0) {
            contentHtml = renderLessonMouthIntro(step);
        } else if ((step === 15 || step === 16) && safeIndex === 1) {
            contentHtml = renderLessonMouthSoundQuiz(step);
        } else if (safeIndex === 0) {
            contentHtml = `
                <div class="learning-main-card">
                    ${step === 7 ? '' : `
                        <div class="learning-card-label">📖 이해하기</div>
                        ${isVowelOriginIntro ? renderVowelOriginScene(vowelOriginTypes) : ''}
                        <div class="grid gap-3">
                            ${introHtml}
                        </div>
                    `}
                    <div class="${step === 7 ? '' : 'mt-4'}">
                    <div class="learning-card-label">📖 ${isVowelOriginIntro ? '배울 글자' : '배움 글자'}</div>
                    <div class="${wordChipWrapClass}">
                        ${(step === 4 ? ['ㅡ', 'ㅣ'] : practiceFlow.choices).map((word) => {
                            const originType = isVowelOriginIntro ? vowelOriginTypeByWord[word] : '';
                            const originClass = originType ? ` origin-learning-chip origin-${originType}-chip` : '';
                            const originAction = originType
                                ? `playVowelOriginCard('${originType}', { speak: true })`
                                : `speakChar('${word}')`;
                            const ariaLabel = originType ? `${word} 모양이 만들어지는 모습 다시 보기` : `${word} 소리 듣기`;
                            return `<button type="button" class="${wordChipClass}${originClass}" onclick="${originAction}" aria-label="${ariaLabel}">${renderLearningChipText(word)}</button>`;
                        }).join('')}
                    </div>
                    </div>
                </div>
            `;
        } else if (safeIndex === 1) {
            contentHtml = step === 7 ? `
                <div class="learning-write-card" style="margin-top:0;">
                    <div class="practice-step-title mb-3"><span class="practice-step-number">2</span> 쓰기</div>
                    <div class="trace-canvas-wrap">
                        <div class="trace-canvas-title">✍️ 아 야 어 여 오 / 요 우 유 으 이</div>
                        <canvas id="trace-writing-canvas" class="trace-writing-canvas double-row" data-guide="${practiceFlow.choices.join('/')}"></canvas>
                        <div class="trace-canvas-help">찬찬한글 예시처럼 순서대로 읽고, 획순을 따라 써요.</div>
                    </div>
                    <button type="button" class="trace-clear-button mt-3" onclick="resetTraceWritingCanvas()">다시 쓰기</button>
                </div>
            ` : `
                <div class="learning-practice-card">
                    <div class="learning-card-label practice-label">문제 활동</div>
                    <div class="grid gap-3">
                        <div class="practice-step-box">
                            <div class="practice-step-title"><span class="practice-step-number">1</span> 듣기</div>
                            <div class="${practiceFlow.choices.length > 4 ? 'choice-grid-wide' : practiceFlow.choices.length === 3 ? 'choice-grid-three' : 'choice-grid'}">
                                ${practiceFlow.choices.map((word) => `<button type="button" class="listen-chip-button" onclick="speakChar('${word}')">${renderLearningChipText(word)}</button>`).join('')}
                            </div>
                        </div>
                        <div class="practice-step-box">
                            <div class="practice-step-title">
                                <span><span class="practice-step-number">2</span> 듣고 알맞은 글자 선택</span>
                            </div>
                            <div class="text-center mt-4 mb-2">
                                <button type="button" class="listen-quiz-play-btn" onclick="playChoiceQuizSound()">🔊 소리 듣기</button>
                            </div>
                            <div id="choice-feedback-area" class="text-base font-black text-center mt-2 mb-4 min-h-[1.4rem] text-orange-500">
                                소리 듣기 버튼을 누르고 알맞은 글자를 골라요!
                            </div>
                            <div class="${window.currentShuffledChoices.length > 4 ? 'choice-grid-wide' : window.currentShuffledChoices.length === 3 ? 'choice-grid-three' : 'choice-grid'}">
                                ${window.currentShuffledChoices.map((word) => {
                                    const isDone = window.completedChoices && window.completedChoices.includes(word);
                                    return `<button type="button" class="choice-chip-button ${isDone ? 'correct' : ''}" onclick="selectChoiceBtn(this, '${word}')">${word}</button>`;
                                }).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            contentHtml = step === 7 ? `
                <div class="learning-practice-card">
                    <div class="learning-card-label practice-label">읽기 · 듣고 찾기</div>
                    <div class="grid gap-3">
                        <div class="practice-step-box">
                            <div class="practice-step-title"><span class="practice-step-number">3</span> 단어 읽기</div>
                            <div class="word-chip-wrap">
                                ${['아이', '여우', '오이', '우유'].map((word) => `<button type="button" class="word-chip" onclick="speakChar('${word}')" aria-label="${word} 소리 듣기">${word}</button>`).join('')}
                            </div>
                        </div>
                        <div class="practice-step-box">
                            <div class="practice-step-title"><span class="practice-step-number">4</span> 단어 쓰기</div>
                            <div class="trace-canvas-wrap">
                                <div class="trace-canvas-title">✍️ 아이 여우 오이 우유</div>
                                <canvas id="trace-writing-canvas" class="trace-writing-canvas word-grid" data-guide="아이/여우/오이/우유"></canvas>
                                <div class="trace-canvas-help">단어를 누르면 소리를 듣고, 획순에 맞게 따라 써요.</div>
                            </div>
                            <button type="button" class="trace-clear-button mt-3" onclick="resetTraceWritingCanvas()">다시 쓰기</button>
                        </div>
                    </div>
                </div>
            ` : `
                <div class="learning-write-card" style="margin-top:0;">
                    <div class="practice-step-title mb-3"><span class="practice-step-number">3</span> 쓰기</div>
                    <div class="trace-canvas-wrap">
                        <div class="trace-canvas-title">✍️ 획순 따라쓰기</div>
                        <canvas id="trace-writing-canvas" class="trace-writing-canvas ${step === 7 ? 'double-row' : ''}" data-guide="${practiceFlow.choices.join('/')}"></canvas>
                        <div class="trace-canvas-help">주황색 번호와 화살표 순서대로 천천히 따라 써요.</div>
                    </div>
                    <button type="button" class="trace-clear-button mt-3" onclick="resetTraceWritingCanvas()">다시 쓰기</button>
                </div>
            `;
        }

        const chanchanLesson = getChanchanLesson(step);
        const chanchanActivityHtml = safeIndex === 0 && !isPictureWordLesson && !isCustomLesson20 && !isCustomLesson25 && !isCustomLesson26 && !isCustomLesson27 && !isCustomBatchimLesson && chanchanLesson && (chanchanLesson.activities || []).some((activity) =>
            ['readThreeTimes', 'fillOneJamo', 'wordPictureMatch', 'nonsenseWordRead', 'batchimFamily', 'finalAssessment'].includes(activity)
        ) ? `<div class="mt-4">${renderLessonDetail(step)}</div>` : '';

        document.getElementById('learning-detail-content').innerHTML = `
            <div class="learning-pane p-5">
                ${sectionHeadingHtml}
                <div class="learning-activity-layout" style="grid-template-columns: 1fr;">
                    ${contentHtml}
                    ${chanchanActivityHtml}
                </div>
            </div>
        `;
    } else {
        document.getElementById('learning-detail-content').innerHTML = `
            <div class="learning-pane">
                <div class="activity-section-title">
                    <span class="activity-badge">${section.label}</span>
                    <span class="text-xl font-bold text-stone-700">${section.title}</span>
                </div>
                <div class="grid gap-3">
                    ${section.cards.map((card) => `
                        <div class="border-2 border-stone-300 rounded-lg p-4 bg-white text-lg text-stone-700">${card}</div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const nextBtn = document.getElementById('learning-detail-next-btn');
    const completeBtn = document.getElementById('learning-detail-complete-btn');
    const isLast = safeIndex === totalSections - 1;
    nextBtn.classList.toggle('hidden', isLast);
    completeBtn.classList.toggle('hidden', !isLast);
    nextBtn.disabled = false;
    nextBtn.removeAttribute('aria-disabled');
    nextBtn.removeAttribute('title');
    requestAnimationFrame(() => {
        setupLearningDetailCompletionGuide();
        initializeLesson21MBatchimIntroCanvases();
        initializeLesson21MPracticePage();
        initializeVisibleTraceWritingCanvases();
        initializeLessonCompletionCanvases();
        initializeLesson26BatchimGlyphs();
        initializeLesson13BoardGames();
        redrawLessonLineMatchLines();
        if (isCustomLesson27 && safeIndex === 0) {
            initializeLesson27HandMotionCards();
            syncLesson27FamilyPage();
        }
        document.querySelectorAll('.combine-card').forEach((card, cardIndex) => {
            if (!card.dataset.combineAutoplayed) {
                card.dataset.combineAutoplayed = 'true';
                window.restartCombineAnim(card, { speak: false, startDelay: cardIndex * 4.7 });
            }
        });
        if ((numericStep === 15 || numericStep === 16) && safeIndex === 0) {
            window.setTimeout(() => window.playLessonMouthSequence?.(numericStep, false, { auto: true }), 250);
        }
        if ((numericStep === 1 || numericStep === 4) && safeIndex === 0) {
            window.setTimeout(() => window.playVowelOriginSequence?.(), 250);
        }
    });
}

window.openLearningDetailActivity = function openLearningDetailActivity(step) {
    if (!learningDetailData[step]) {
        showModal('아직 준비 중인 배움이에요.');
        return;
    }
    // 모든 한글 배움 단계는 바로 진입 가능하게 둔다.
    currentLearningActivityStep = step;
    currentLearningDetailSectionIndex = 0;
    if (Number(step) === 27) {
        lesson27FamilyState.heard.clear();
        cancelLesson27FamilyPlayback();
        lesson27FamilyState.activeKey = null;
    }
    window.currentLearningActivityStep = step;
    window.currentLearningDetailSectionIndex = 0;
    showTopLevelSection('learning-detail-section');
    renderLearningDetail(step, 0);
}

window.goToNextLearningDetailSection = function goToNextLearningDetailSection() {
    const learningDetailSectionEl = document.getElementById('learning-detail-section');
    const domStep = Number(learningDetailSectionEl?.dataset.currentStep);
    const domIndex = Number(learningDetailSectionEl?.dataset.currentSection);
    const activeStep = Number.isFinite(domStep) && domStep > 0
        ? domStep
        : (currentLearningActivityStep || window.currentLearningActivityStep);
    const windowIndex = Number(window.currentLearningDetailSectionIndex);
    const activeIndex = Number.isFinite(domIndex)
        ? domIndex
        : Number.isFinite(windowIndex)
            ? windowIndex
            : currentLearningDetailSectionIndex;
    if (!activeStep || !learningDetailData[activeStep]) return;
    if (activeStep === 27 && activeIndex === 0 && lesson27FamilyState.heard.size < 2) {
        syncLesson27FamilyPage();
        return;
    }
    renderLearningDetail(activeStep, activeIndex + 1);
}

window.closeLearningDetailActivity = function closeLearningDetailActivity() {
    currentLearningActivityStep = null;
    currentLearningDetailSectionIndex = 0;
    window.currentLearningActivityStep = null;
    window.currentLearningDetailSectionIndex = 0;
    openMyKoreanSection();
}

const traceInitials = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const traceMedials = ['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅗ','ㅘ','ㅙ','ㅚ','ㅛ','ㅜ','ㅝ','ㅞ','ㅟ','ㅠ','ㅡ','ㅢ','ㅣ'];
const traceFinals = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
const traceVerticalVowels = new Set(['ㅏ','ㅐ','ㅑ','ㅒ','ㅓ','ㅔ','ㅕ','ㅖ','ㅣ']);
const traceCompositeJamo = {
    'ㄲ': ['ㄱ', 'ㄱ'],
    'ㄸ': ['ㄷ', 'ㄷ'],
    'ㅃ': ['ㅂ', 'ㅂ'],
    'ㅆ': ['ㅅ', 'ㅅ'],
    'ㅉ': ['ㅈ', 'ㅈ'],
    'ㅘ': ['ㅗ', 'ㅏ'],
    'ㅙ': ['ㅗ', 'ㅐ'],
    'ㅚ': ['ㅗ', 'ㅣ'],
    'ㅝ': ['ㅜ', 'ㅓ'],
    'ㅞ': ['ㅜ', 'ㅔ'],
    'ㅟ': ['ㅜ', 'ㅣ'],
    'ㅢ': ['ㅡ', 'ㅣ'],
    'ㄳ': ['ㄱ', 'ㅅ'],
    'ㄵ': ['ㄴ', 'ㅈ'],
    'ㄶ': ['ㄴ', 'ㅎ'],
    'ㄺ': ['ㄹ', 'ㄱ'],
    'ㄻ': ['ㄹ', 'ㅁ'],
    'ㄼ': ['ㄹ', 'ㅂ'],
    'ㄽ': ['ㄹ', 'ㅅ'],
    'ㄾ': ['ㄹ', 'ㅌ'],
    'ㄿ': ['ㄹ', 'ㅍ'],
    'ㅀ': ['ㄹ', 'ㅎ'],
    'ㅄ': ['ㅂ', 'ㅅ']
};
const traceTopToBottomStroke = (x, top, bottom) => ({ points: [[x, top], [x, bottom]] });
const traceLeftToRightStroke = (y, left, right) => ({ points: [[left, y], [right, y]] });
const traceStrokeMap = {
    'ㆍ': [{ points: [[0.5, 0.5], [0.5, 0.5]], dot: true }],
    '●': [{ points: [[0.5, 0.5], [0.5, 0.5]], dot: true }],
    'ㅣ': [{ points: [[0.5, 0.18], [0.5, 0.82]] }],
    'ㅡ': [{ points: [[0.2, 0.55], [0.8, 0.55]] }],
    'ㅏ': [{ points: [[0.45, 0.18], [0.45, 0.82]] }, { points: [[0.45, 0.5], [0.78, 0.5]] }],
    'ㅓ': [traceLeftToRightStroke(0.5, 0.28, 0.62), { points: [[0.62, 0.18], [0.62, 0.82]] }],
    'ㅑ': [{ points: [[0.42, 0.16], [0.42, 0.84]] }, { points: [[0.42, 0.4], [0.78, 0.4]] }, { points: [[0.42, 0.62], [0.78, 0.62]] }],
    'ㅕ': [traceLeftToRightStroke(0.4, 0.28, 0.66), traceLeftToRightStroke(0.62, 0.28, 0.66), { points: [[0.66, 0.16], [0.66, 0.84]] }],
    'ㅗ': [traceTopToBottomStroke(0.5, 0.24, 0.54), { points: [[0.22, 0.64], [0.78, 0.64]] }],
    'ㅜ': [{ points: [[0.22, 0.36], [0.78, 0.36]] }, { points: [[0.5, 0.46], [0.5, 0.76]] }],
    'ㅛ': [traceTopToBottomStroke(0.4, 0.22, 0.5), traceTopToBottomStroke(0.6, 0.22, 0.5), { points: [[0.22, 0.64], [0.78, 0.64]] }],
    'ㅠ': [{ points: [[0.22, 0.36], [0.78, 0.36]] }, { points: [[0.4, 0.48], [0.4, 0.78]] }, { points: [[0.6, 0.48], [0.6, 0.78]] }],
    'ㅐ': [{ points: [[0.36, 0.18], [0.36, 0.82]] }, { points: [[0.36, 0.5], [0.58, 0.5]] }, { points: [[0.7, 0.18], [0.7, 0.82]] }],
    'ㅔ': [{ points: [[0.62, 0.5], [0.32, 0.5]] }, { points: [[0.62, 0.18], [0.62, 0.82]] }, { points: [[0.78, 0.18], [0.78, 0.82]] }],
    'ㅒ': [{ points: [[0.34, 0.16], [0.34, 0.84]] }, { points: [[0.34, 0.4], [0.56, 0.4]] }, { points: [[0.34, 0.62], [0.56, 0.62]] }, { points: [[0.72, 0.16], [0.72, 0.84]] }],
    'ㅖ': [{ points: [[0.58, 0.4], [0.28, 0.4]] }, { points: [[0.58, 0.62], [0.28, 0.62]] }, { points: [[0.58, 0.16], [0.58, 0.84]] }, { points: [[0.78, 0.16], [0.78, 0.84]] }],
    'ㄱ': [{ points: [[0.22, 0.24], [0.78, 0.24], [0.78, 0.78]] }],
    'ㄴ': [{ points: [[0.24, 0.2], [0.24, 0.76], [0.78, 0.76]] }],
    'ㄷ': [{ points: [[0.28, 0.24], [0.74, 0.24]] }, { points: [[0.28, 0.24], [0.28, 0.76]] }, { points: [[0.28, 0.76], [0.74, 0.76]] }],
    'ㅌ': [{ points: [[0.28, 0.22], [0.74, 0.22]] }, { points: [[0.28, 0.22], [0.28, 0.78]] }, { points: [[0.28, 0.5], [0.68, 0.5]] }, { points: [[0.28, 0.78], [0.74, 0.78]] }],
    'ㅁ': [{ points: [[0.28, 0.24], [0.28, 0.76]] }, { points: [[0.28, 0.24], [0.74, 0.24]] }, { points: [[0.74, 0.24], [0.74, 0.76]] }, { points: [[0.28, 0.76], [0.74, 0.76]] }],
    'ㅂ': [{ points: [[0.3, 0.2], [0.3, 0.78]] }, { points: [[0.72, 0.2], [0.72, 0.78]] }, { points: [[0.3, 0.5], [0.72, 0.5]] }, { points: [[0.28, 0.78], [0.74, 0.78]] }],
    'ㅍ': [{ points: [[0.32, 0.22], [0.32, 0.78]] }, { points: [[0.26, 0.22], [0.76, 0.22]] }, { points: [[0.7, 0.22], [0.7, 0.78]] }, { points: [[0.26, 0.78], [0.76, 0.78]] }],
    'ㅅ': [{ points: [[0.5, 0.22], [0.28, 0.78]] }, { points: [[0.5, 0.22], [0.76, 0.78]] }],
    'ㅈ': [{ points: [[0.24, 0.24], [0.78, 0.24]] }, { points: [[0.5, 0.28], [0.28, 0.78]] }, { points: [[0.5, 0.28], [0.76, 0.78]] }],
    'ㅊ': [{ points: [[0.5, 0.16], [0.5, 0.3]] }, { points: [[0.24, 0.34], [0.78, 0.34]] }, { points: [[0.5, 0.38], [0.28, 0.8]] }, { points: [[0.5, 0.38], [0.76, 0.8]] }],
    'ㅋ': [{ points: [[0.22, 0.22], [0.78, 0.22]] }, { points: [[0.78, 0.22], [0.78, 0.78]] }, { points: [[0.44, 0.5], [0.78, 0.5]] }],
    'ㅇ': [{ circle: [0.5, 0.52, 0.25, 0.3] }],
    'ㅎ': [{ points: [[0.5, 0.14], [0.5, 0.28]] }, { points: [[0.28, 0.34], [0.72, 0.34]] }, { circle: [0.5, 0.62, 0.24, 0.24] }],
    'ㄹ': [
        { points: [[0.26, 0.22], [0.72, 0.22]] },
        { points: [[0.72, 0.22], [0.72, 0.46]] },
        { points: [[0.72, 0.46], [0.34, 0.46]] },
        { points: [[0.34, 0.46], [0.34, 0.72]] },
        { points: [[0.34, 0.72], [0.76, 0.72]] }
    ]
};

function decomposeTraceSyllable(char) {
    const code = char.charCodeAt(0) - 0xAC00;
    if (code < 0 || code > 11171) return null;
    const initialIndex = Math.floor(code / 588);
    const medialIndex = Math.floor((code % 588) / 28);
    const finalIndex = code % 28;
    return {
        initial: traceInitials[initialIndex],
        medial: traceMedials[medialIndex],
        final: traceFinals[finalIndex]
    };
}

function traceSubBox(box, x, y, w, h) {
    return {
        x: box.x + box.w * x,
        y: box.y + box.h * y,
        w: box.w * w,
        h: box.h * h
    };
}

function drawTraceNumber(ctx, x, y, number, scale) {
    const r = Math.max(10, scale * 0.085);
    ctx.save();
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${Math.max(10, r * 0.95)}px 'Outfit', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number), x, y + 0.5);
    ctx.restore();
}

function drawTraceArrowHead(ctx, fromX, fromY, toX, toY, scale) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const size = Math.max(10, scale * 0.11);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - Math.cos(angle - Math.PI / 6) * size, toY - Math.sin(angle - Math.PI / 6) * size);
    ctx.lineTo(toX - Math.cos(angle + Math.PI / 6) * size, toY - Math.sin(angle + Math.PI / 6) * size);
    ctx.closePath();
    ctx.fillStyle = '#f97316';
    ctx.fill();
}

function drawTraceStroke(ctx, stroke, box, number, options = {}) {
    const scale = Math.min(box.w, box.h);
    const tx = (p) => ({ x: box.x + p[0] * box.w, y: box.y + p[1] * box.h });
    const alpha = options.alpha ?? 1;
    const color = options.color || '#f97316';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(11, scale * (options.completed ? 0.075 : 0.105));

    if (stroke.dot) {
        const p = tx(stroke.points[0]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(10, scale * 0.1), 0, Math.PI * 2);
        ctx.fill();
        if (!options.completed) drawTraceNumber(ctx, p.x, p.y, number, scale);
        ctx.restore();
        return;
    }

    if (stroke.circle) {
        const [cx, cy, rx, ry] = stroke.circle;
        const x = box.x + cx * box.w;
        const y = box.y + cy * box.h;
        const radiusX = rx * box.w;
        const radiusY = ry * box.h;
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle - Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(x, y, radiusX, radiusY, 0, startAngle, endAngle, true);
        ctx.stroke();
        if (!options.completed) {
            const arrowAngle = startAngle - Math.PI * 0.18;
            const fromAngle = arrowAngle + 0.22;
            drawTraceArrowHead(
                ctx,
                x + Math.cos(fromAngle) * radiusX,
                y + Math.sin(fromAngle) * radiusY,
                x + Math.cos(arrowAngle) * radiusX,
                y + Math.sin(arrowAngle) * radiusY,
                scale
            );
            drawTraceNumber(ctx, x - radiusX * 0.8, y - radiusY * 0.9, number, scale);
        }
        ctx.restore();
        return;
    }

    const points = stroke.points.map(tx);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    const prev = points[Math.max(0, points.length - 2)];
    const last = points[points.length - 1];
    if (!options.completed) drawTraceArrowHead(ctx, prev.x, prev.y, last.x, last.y, scale);
    if (!options.completed) drawTraceNumber(ctx, points[0].x, points[0].y, number, scale);
    ctx.restore();
}

function drawSingleTraceChar(ctx, char, box) {
    if (traceCompositeJamo[char]) {
        const parts = traceCompositeJamo[char];
        parts.forEach((part, idx) => {
            const child = traceSubBox(box, idx / parts.length, 0, 1 / parts.length, 1);
            drawSingleTraceChar(ctx, part, child);
        });
        return;
    }

    const syllable = decomposeTraceSyllable(char);
    if (syllable) {
        const hasFinal = Boolean(syllable.final);
        const top = hasFinal ? traceSubBox(box, 0.08, 0.05, 0.84, 0.62) : traceSubBox(box, 0.08, 0.08, 0.84, 0.82);
        if (traceVerticalVowels.has(syllable.medial)) {
            drawSingleTraceChar(ctx, syllable.initial, traceSubBox(top, 0.0, 0.02, 0.48, 0.96));
            drawSingleTraceChar(ctx, syllable.medial, traceSubBox(top, 0.48, 0.0, 0.52, 1));
        } else {
            drawSingleTraceChar(ctx, syllable.initial, traceSubBox(top, 0.18, 0.0, 0.64, 0.52));
            drawSingleTraceChar(ctx, syllable.medial, traceSubBox(top, 0.0, 0.45, 1, 0.55));
        }
        if (hasFinal) {
            drawSingleTraceChar(ctx, syllable.final, traceSubBox(box, 0.16, 0.68, 0.68, 0.28));
        }
        return;
    }

    const strokes = traceStrokeMap[char];
    if (!strokes) {
        ctx.save();
        ctx.fillStyle = '#c2410c';
        ctx.font = `900 ${Math.max(24, Math.min(box.w, box.h) * 0.5)}px 'Noto Sans KR', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, box.x + box.w / 2, box.y + box.h / 2);
        ctx.restore();
        return;
    }
    strokes.forEach((stroke, idx) => drawTraceStroke(ctx, stroke, box, idx + 1));
}

function collectSingleTraceChar(char, box, out) {
    if (traceCompositeJamo[char]) {
        const parts = traceCompositeJamo[char];
        parts.forEach((part, idx) => {
            collectSingleTraceChar(part, traceSubBox(box, idx / parts.length, 0, 1 / parts.length, 1), out);
        });
        return;
    }

    const syllable = decomposeTraceSyllable(char);
    if (syllable) {
        const hasFinal = Boolean(syllable.final);
        const top = hasFinal ? traceSubBox(box, 0.08, 0.05, 0.84, 0.62) : traceSubBox(box, 0.08, 0.08, 0.84, 0.82);
        if (traceVerticalVowels.has(syllable.medial)) {
            collectSingleTraceChar(syllable.initial, traceSubBox(top, 0.0, 0.02, 0.48, 0.96), out);
            collectSingleTraceChar(syllable.medial, traceSubBox(top, 0.48, 0.0, 0.52, 1), out);
        } else {
            collectSingleTraceChar(syllable.initial, traceSubBox(top, 0.18, 0.0, 0.64, 0.52), out);
            collectSingleTraceChar(syllable.medial, traceSubBox(top, 0.0, 0.45, 1, 0.55), out);
        }
        if (hasFinal) collectSingleTraceChar(syllable.final, traceSubBox(box, 0.16, 0.68, 0.68, 0.28), out);
        return;
    }

    const strokes = traceStrokeMap[char] || [];
    strokes.forEach((stroke) => out.push({ stroke, box }));
}

function collectTraceStrokeOrder(text, bx, by, boxW, boxH) {
    const chars = Array.from(text || '');
    const out = [];
    if (chars.length <= 1) {
        collectSingleTraceChar(chars[0] || text, { x: bx + boxW * 0.18, y: by + boxH * 0.16, w: boxW * 0.64, h: boxH * 0.7 }, out);
        return out;
    }

    const gap = boxW * 0.03;
    const charW = (boxW * 0.82 - gap * (chars.length - 1)) / chars.length;
    chars.forEach((char, idx) => {
        collectSingleTraceChar(char, {
            x: bx + boxW * 0.09 + idx * (charW + gap),
            y: by + boxH * 0.18,
            w: charW,
            h: boxH * 0.68
        }, out);
    });
    return out;
}

function drawTraceStrokeOrder(ctx, text, bx, by, boxW, boxH, completedCount = 0, hideLabel = false) {
    if (!hideLabel) {
        const labelSize = Math.max(22, Math.min(boxW, boxH) * 0.18);
        ctx.save();
        ctx.fillStyle = '#c2410c';
        ctx.font = `900 ${labelSize}px 'Noto Sans KR', sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text, bx + 12, by + 10);
        ctx.restore();
    }

    const guideY = hideLabel ? by - boxH * 0.04 : by;
    const guideH = hideLabel ? boxH * 1.08 : boxH;
    const strokes = collectTraceStrokeOrder(text, bx, guideY, boxW, guideH);
    strokes.forEach((item, idx) => {
        if (idx < completedCount) {
            drawTraceStroke(ctx, item.stroke, item.box, idx + 1, { completed: true, alpha: 0.45, color: '#fb923c' });
        } else if (idx === completedCount) {
            drawTraceStroke(ctx, item.stroke, item.box, idx + 1);
        }
    });
    return strokes;
}

function getTraceWritingCanvas(target) {
    if (target instanceof HTMLCanvasElement) return target;
    if (typeof target === 'string') return document.getElementById(target);
    const active = Array.from(document.querySelectorAll('.view-section:not(.hidden) .trace-writing-canvas'))
        .find((canvas) => canvas.offsetParent !== null);
    return active || document.getElementById('trace-writing-canvas') || document.querySelector('.trace-writing-canvas');
}

function getTraceGridLayout(canvas, chars) {
    const isMakeLetterGrid = canvas?.classList?.contains('make-letter-grid');
    const isSentenceLines = canvas?.dataset?.traceSentenceLines !== undefined;
    const isDoubleRow = chars.length === 10;
    const isWordDoubleRow = chars.length === 4 && chars.some((char) => Array.from(char).length > 1);
    const configuredCols = Number(canvas?.dataset?.gridCols || 0);
    const cols = isSentenceLines
        ? 1
        : (isMakeLetterGrid ? (configuredCols || 5) : (isDoubleRow ? 5 : (isWordDoubleRow ? 2 : chars.length)));
    const rows = isSentenceLines
        ? Math.max(1, chars.length)
        : (isMakeLetterGrid ? Math.ceil(chars.length / cols) : (isDoubleRow || isWordDoubleRow ? 2 : 1));
    return { cols, rows };
}

function drawTraceWritingGuide(target) {
    const canvas = getTraceWritingCanvas(target);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = resizeCanvasForDisplay(canvas, ctx);
    const W = size.width;
    const H = size.height;

    // 배경 지우기
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    // 연습 글자 목록 (choices.join('/') 형식)
    const raw = canvas.dataset.guide || '';
    const chars = raw.split('/').map(c => c.trim()).filter(c => c.length > 0);
    if (chars.length === 0) return;
    const fillWord = canvas.dataset.fillWord || '';
    const fillPrefix = canvas.dataset.fillPrefix || '';

    if (canvas.dataset.lesson21MixedTarget !== undefined || canvas.dataset.lesson21CompactGuide !== undefined) {
        const char = chars[0];
        const completedCount = canvas._traceCompleted?.[0] || 0;
        ctx.fillStyle = '#fffdf9';
        ctx.fillRect(0, 0, W, H);
        const isBieupGuide = char === 'ㅂ';
        if (isBieupGuide) {
            const left = W * 0.356;
            const right = W * 0.658;
            const top = H * 0.248;
            const middle = H * 0.5;
            const bottom = H * 0.735;
            ctx.save();
            ctx.strokeStyle = '#dda36b';
            ctx.lineWidth = Math.max(6, H * 0.075);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(left, top);
            ctx.lineTo(left, bottom);
            ctx.moveTo(right, top);
            ctx.lineTo(right, bottom);
            ctx.moveTo(left, middle);
            ctx.lineTo(right, middle);
            ctx.moveTo(left, bottom);
            ctx.lineTo(right, bottom);
            ctx.stroke();
            ctx.restore();
        } else {
            ctx.save();
            ctx.fillStyle = '#f1cfad';
            ctx.font = `900 ${Math.max(30, H * 0.72)}px 'Noto Sans KR', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(char, W / 2, H * 0.54);
            ctx.restore();
        }

        const strokes = [];
        collectSingleTraceChar(char, { x: W * 0.14, y: H * 0.08, w: W * 0.72, h: H * 0.84 }, strokes);
        strokes.forEach((item, strokeIndex) => {
            const points = item.stroke.points?.map((point) => tracePointForStroke(item, point)) || [];
            if (points.length < 2) return;
            if (isBieupGuide && strokeIndex > completedCount) return;
            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = strokeIndex < completedCount
                ? '#59b9a8'
                : (strokeIndex === completedCount ? '#f28a3c' : (isBieupGuide ? '#d98c45' : '#e8b67f'));
            ctx.lineWidth = strokeIndex === completedCount ? 3 : (isBieupGuide ? 2.5 : 1.8);
            ctx.setLineDash(strokeIndex > completedCount ? (isBieupGuide ? [5, 3] : [3, 3]) : []);
            ctx.beginPath();
            ctx.moveTo(points[0].x, points[0].y);
            points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
            ctx.stroke();
            ctx.restore();
        });
        const current = strokes[completedCount];
        if (current) {
            current.lesson21Compact = true;
            current.lesson21Easy = canvas.dataset.lesson21EasyGuide !== undefined;
            const start = traceStrokeStartPoint(current);
            ctx.save();
            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = "800 7px sans-serif";
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(completedCount + 1), start.x, start.y + .5);
            ctx.restore();
        }
        canvas._traceCells = [{ index: 0, char, bx: 0, by: 0, boxW: W, boxH: H, strokes }];
        return;
    }

    if (fillWord) {
        ctx.fillStyle = '#fef9f0';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#fdba74';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(0, 0, W, H);

        ctx.strokeStyle = '#fed7aa';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(6, H / 3);
        ctx.lineTo(W - 6, H / 3);
        ctx.moveTo(6, (H / 3) * 2);
        ctx.lineTo(W - 6, (H / 3) * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.save();
        ctx.fillStyle = '#c2410c';
        ctx.font = `900 ${Math.max(36, Math.min(W, H) * 0.34)}px 'Noto Sans KR', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(fillPrefix || fillWord, W / 2, H * 0.34);
        ctx.restore();

        const completedMap = canvas._traceCompleted || {};
        const answerBoxW = W * 0.44;
        const answerBoxH = H * 0.34;
        const bx = W * 0.28;
        const by = H * 0.52;
        const strokes = collectTraceStrokeOrder(raw, bx, by, answerBoxW, answerBoxH);
        strokes.forEach((item, idx) => {
            if (idx < (completedMap[0] || 0)) {
                drawTraceStroke(ctx, item.stroke, item.box, idx + 1, { completed: true, alpha: 0.45, color: '#fb923c' });
            } else if (idx === (completedMap[0] || 0)) {
                drawTraceStroke(ctx, item.stroke, item.box, idx + 1);
            }
        });
        canvas._traceCells = [{ index: 0, char: raw, bx: 0, by: 0, boxW: W, boxH: H, strokes }];
        return;
    }

    // 10글자 복습은 5칸씩 2줄, 4개 단어 쓰기는 2칸씩 2줄로 배치
    const { cols, rows } = getTraceGridLayout(canvas, chars);
    const boxW = W / cols;
    const boxH = H / rows;
    const completedMap = canvas._traceCompleted || {};
    const cells = [];

    chars.forEach((char, i) => {
        const row = rows > 1 ? Math.floor(i / cols) : 0;
        const col = rows > 1 ? (i % cols) : i;
        const bx = col * boxW;
        const by = row * boxH;

        // 박스 배경 (교대 색상 바둑판식 배열)
        ctx.fillStyle = (row + col) % 2 === 0 ? '#fef9f0' : '#fdf6e8';
        ctx.fillRect(bx, by, boxW, boxH);

        // 박스 구분선
        ctx.strokeStyle = '#fdba74';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.strokeRect(bx, by, boxW, boxH);

        // 가로 안내선 (상하 1/3)
        ctx.strokeStyle = '#fed7aa';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(bx + 6, by + boxH / 3);
        ctx.lineTo(bx + boxW - 6, by + boxH / 3);
        ctx.moveTo(bx + 6, by + (boxH / 3) * 2);
        ctx.lineTo(bx + boxW - 6, by + (boxH / 3) * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const strokes = drawTraceStrokeOrder(
            ctx,
            char,
            bx,
            by,
            boxW,
            boxH,
            completedMap[i] || 0,
            canvas.dataset.traceHideLabel !== undefined
        );
        cells.push({ index: i, char, bx, by, boxW, boxH, strokes });
    });
    canvas._traceCells = cells;
}

function drawSavedTracePaths(ctx, paths) {
    paths.forEach((path) => {
        if (!path || path.length < 2) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(44, 62, 80, 0.72)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(path[0].x, path[0].y);
        path.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.restore();
    });
}

function tracePointInBox(p, box) {
    return p.x >= box.bx && p.x <= box.bx + box.boxW && p.y >= box.by && p.y <= box.by + box.boxH;
}

function tracePointForStroke(strokeItem, point) {
    return {
        x: strokeItem.box.x + point[0] * strokeItem.box.w,
        y: strokeItem.box.y + point[1] * strokeItem.box.h
    };
}

function traceStrokeStartPoint(strokeItem) {
    const stroke = strokeItem.stroke;
    if (stroke.dot) return tracePointForStroke(strokeItem, stroke.points[0]);
    if (stroke.circle) {
        const [cx, cy, rx, ry] = stroke.circle;
        return { x: strokeItem.box.x + cx * strokeItem.box.w, y: strokeItem.box.y + (cy - ry) * strokeItem.box.h };
    }
    return tracePointForStroke(strokeItem, stroke.points[0]);
}

function traceStrokeEndPoint(strokeItem) {
    const stroke = strokeItem.stroke;
    if (stroke.dot) return tracePointForStroke(strokeItem, stroke.points[0]);
    if (stroke.circle) {
        const [cx, cy, rx, ry] = stroke.circle;
        return { x: strokeItem.box.x + cx * strokeItem.box.w, y: strokeItem.box.y + (cy - ry) * strokeItem.box.h };
    }
    return tracePointForStroke(strokeItem, stroke.points[stroke.points.length - 1]);
}

function traceDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function tracePathLength(path) {
    let total = 0;
    for (let i = 1; i < path.length; i += 1) total += traceDistance(path[i - 1], path[i]);
    return total;
}

function traceIsNearCurrentStrokeStart(point, strokeItem) {
    const scale = Math.min(strokeItem.box.w, strokeItem.box.h);
    const tolerance = strokeItem.lesson21Easy
        ? Math.max(18, scale * 0.4)
        : strokeItem.lesson21Compact ? Math.max(10, scale * 0.28) : Math.max(36, scale * 0.34);
    return traceDistance(point, traceStrokeStartPoint(strokeItem)) <= tolerance;
}

function traceDidCompleteStroke(path, strokeItem) {
    const scale = Math.min(strokeItem.box.w, strokeItem.box.h);
    if (!path || path.length < 2) return false;
    if (strokeItem.stroke.dot) return tracePathLength(path) >= Math.max(8, scale * 0.06);
    if (strokeItem.stroke.circle) return tracePathLength(path) >= scale * 0.6;
    const last = path[path.length - 1];
    const minimumLength = strokeItem.lesson21Easy
        ? scale * 0.28
        : strokeItem.lesson21Compact ? scale * 0.42 : scale * 0.14;
    const endTolerance = strokeItem.lesson21Easy
        ? Math.max(18, scale * 0.42)
        : strokeItem.lesson21Compact ? Math.max(11, scale * 0.3) : Math.max(40, scale * 0.38);
    const guidePoints = strokeItem.stroke.points || [];
    const cornerTolerance = strokeItem.lesson21Easy
        ? Math.max(18, scale * 0.38)
        : strokeItem.lesson21Compact ? Math.max(11, scale * 0.28) : Math.max(32, scale * 0.3);
    const passedCorners = guidePoints.slice(1, -1).every((guidePoint) => {
        const corner = tracePointForStroke(strokeItem, guidePoint);
        return path.some((point) => traceDistance(point, corner) <= cornerTolerance);
    });
    return tracePathLength(path) >= minimumLength
        && traceDistance(last, traceStrokeEndPoint(strokeItem)) <= endTolerance
        && passedCorners;
}

function initializeTraceWritingCanvas(target) {
    const canvas = getTraceWritingCanvas(target);
    if (!canvas || canvas.dataset.ready === 'true') return;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let viewWidth = 0;
    let activeTrace = null;
    let activePath = [];
    let activePointerId = null;
    const refreshGuide = () => {
        const size = resizeCanvasForDisplay(canvas, ctx);
        viewWidth = size.width;
        canvas._traceCompleted = canvas._traceCompleted || {};
        canvas._tracePaths = canvas._tracePaths || [];
        drawTraceWritingGuide(canvas);
        drawSavedTracePaths(ctx, canvas._tracePaths);
    };
    const point = (ev) => {
        const rect = canvas.getBoundingClientRect();
        const source = ev.touches?.[0] || ev.changedTouches?.[0] || ev;
        return { x: source.clientX - rect.left, y: source.clientY - rect.top };
    };
    const start = (ev) => {
        if (ev.pointerId !== undefined) {
            activePointerId = ev.pointerId;
            try { canvas.setPointerCapture(ev.pointerId); } catch {}
        }
        if (ev.cancelable) ev.preventDefault();
        const p = point(ev);
        lastX = p.x;
        lastY = p.y;
        drawing = false;
        activeTrace = null;
        activePath = [];

        // 터치/클릭한 칸에 해당하는 글자 발음 들려주기
        const raw = canvas.dataset.guide || '';
        const chars = raw.split('/').map(c => c.trim()).filter(c => c.length > 0);
        if (chars.length > 0) {
            const rect = canvas.getBoundingClientRect();
            const clientX = ev.touches?.length ? ev.touches[0].clientX : ev.clientX;
            const clientY = ev.touches?.length ? ev.touches[0].clientY : ev.clientY;
            const relativeX = clientX - rect.left;
            const relativeY = clientY - rect.top;

            const { cols, rows } = getTraceGridLayout(canvas, chars);
            const colWidth = rect.width / cols;
            const rowHeight = rect.height / rows;

            const colIndex = Math.floor(relativeX / colWidth);
            const rowIndex = Math.floor(relativeY / rowHeight);
            const charIndex = rowIndex * cols + colIndex;

            if (charIndex >= 0 && charIndex < chars.length) {
                const cell = (canvas._traceCells || []).find((item) => item.index === charIndex && tracePointInBox(p, item));
                const completed = canvas._traceCompleted || {};
                const nextStrokeIndex = completed[charIndex] || 0;
                const nextStroke = cell?.strokes?.[nextStrokeIndex];
                if (nextStroke && (canvas.dataset.lesson21MixedTarget !== undefined || canvas.dataset.lesson21CompactGuide !== undefined)) nextStroke.lesson21Compact = true;
                if (nextStroke && canvas.dataset.lesson21EasyGuide !== undefined) nextStroke.lesson21Easy = true;
                if (!nextStroke || !traceIsNearCurrentStrokeStart(p, nextStroke)) {
                    activePointerId = null;
                    return;
                }

                drawing = true;
                activeTrace = { cellIndex: charIndex, strokeIndex: nextStrokeIndex, stroke: nextStroke };
                activePath = [p];

                const targetChar = chars[charIndex];
                const promptKey = canvas.dataset.spokenText || canvas.dataset.guide || targetChar;
                const speakOnce = canvas.dataset.traceSpeakOnce !== undefined;
                const shouldSpeak = speakOnce
                    ? canvas.dataset.traceSpokenPrompt !== promptKey
                    : (window.lastSpokenChar !== targetChar || (Date.now() - window.lastSpokenTime > 1200));
                if (shouldSpeak) {
                    window.speakChar(speakOnce ? promptKey : targetChar);
                    window.lastSpokenChar = targetChar;
                    window.lastSpokenTime = Date.now();
                    if (speakOnce) canvas.dataset.traceSpokenPrompt = promptKey;
                }
            }
        }
    };
    const move = (ev) => {
        if (activePointerId !== null && ev.pointerId !== undefined && ev.pointerId !== activePointerId) return;
        if (!drawing) return;
        if (ev.cancelable) ev.preventDefault();
        const p = point(ev);
        ctx.strokeStyle = 'rgba(44, 62, 80, 0.72)';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        lastX = p.x;
        lastY = p.y;
        activePath.push(p);
    };
    const stop = () => {
        if (!drawing) return;
        drawing = false;
        if (activeTrace && traceDidCompleteStroke(activePath, activeTrace.stroke)) {
            canvas._tracePaths = canvas._tracePaths || [];
            canvas._traceCompleted = canvas._traceCompleted || {};
            canvas._tracePaths.push(activePath);
            canvas._traceCompleted[activeTrace.cellIndex] = activeTrace.strokeIndex + 1;
            const completedCell = (canvas._traceCells || []).find((item) => item.index === activeTrace.cellIndex);
            const completedCount = canvas._traceCompleted[activeTrace.cellIndex] || 0;
            if (canvas.dataset.lesson21MixedTarget && completedCell?.strokes?.length && completedCount >= completedCell.strokes.length) {
                completeLesson21MixedPracticeCanvas(canvas);
            }
            if (canvas.dataset.lesson21BWordTarget !== undefined && completedCell?.strokes?.length && completedCount >= completedCell.strokes.length) {
                completeLesson21BWordCanvas(canvas);
            }
            if (canvas.dataset.lesson21MPictureTarget !== undefined && completedCell?.strokes?.length && completedCount >= completedCell.strokes.length) {
                completeLesson21MPictureCanvas(canvas);
            }
            if (canvas.dataset.fillLesson && !canvas.dataset.fillRecorded) {
                const cell = completedCell;
                if (cell?.strokes?.length && completedCount >= cell.strokes.length) {
                    canvas.dataset.fillRecorded = 'true';
                    window.submitFillOneJamo(canvas.dataset.fillLesson, Number(canvas.dataset.fillIndex || 0));
                }
            }
        }
        activeTrace = null;
        activePath = [];
        activePointerId = null;
        refreshGuide();
        if (isTraceWritingComplete(canvas)) showLearningDetailNavigationGuide();
    };
    if (window.PointerEvent) {
        canvas.addEventListener('pointerdown', start);
        canvas.addEventListener('pointermove', move);
        canvas.addEventListener('pointerup', stop);
        canvas.addEventListener('pointercancel', stop);
        canvas.addEventListener('pointerleave', stop);
    } else {
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', stop);
        canvas.addEventListener('mouseout', stop);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', stop);
        canvas.addEventListener('touchcancel', stop);
    }
    canvas.dataset.ready = 'true';
    refreshGuide();
    window.addEventListener('resize', () => {
        if (document.getElementById('trace-writing-canvas') === canvas) refreshGuide();
    });
}

function initializeVisibleTraceWritingCanvases() {
    document.querySelectorAll('.view-section:not(.hidden) .trace-writing-canvas').forEach((canvas) => {
        initializeTraceWritingCanvas(canvas);
    });
}

window.resetTraceWritingCanvas = function resetTraceWritingCanvas(target) {
    const canvas = getTraceWritingCanvas(target);
    if (canvas) {
        canvas._traceCompleted = {};
        canvas._tracePaths = [];
        delete canvas.dataset.rewarded;
        delete canvas.dataset.fillRecorded;
    }
    drawTraceWritingGuide(canvas);
}


window.goToUnderstandingStep = function goToUnderstandingStep(step) {
    currentUnderstandingStep = step === 2 ? 2 : 1;
    const understandingOnePane = document.getElementById('understanding-1-pane');
    understandingOnePane.classList.toggle('hidden', currentUnderstandingStep !== 1);
    document.getElementById('understanding-2-pane').classList.toggle('hidden', currentUnderstandingStep !== 2);
    const nextBtn = document.getElementById('learning-next-btn');
    const completeBtn = document.getElementById('learning-complete-btn');
    if (currentUnderstandingStep === 2) {
        nextBtn.classList.add('hidden');
        completeBtn.disabled = false;
        completeBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } else {
        nextBtn.classList.remove('hidden');
        completeBtn.disabled = true;
        completeBtn.classList.add('opacity-50', 'cursor-not-allowed');
        understandingOnePane.classList.remove('pose-sequence-playing');
        requestAnimationFrame(() => {
            void understandingOnePane.offsetWidth;
            understandingOnePane.classList.add('pose-sequence-playing');
        });
    }
}

window.playLearningStartTTS = function playLearningStartTTS() {
    speakTextKo(learningStartTTSMessage);
}

window.completeLearningStartActivity = async function completeLearningStartActivity() {
    if (currentUnderstandingStep !== 2) {
        showModal('이해하기 2까지 완료한 뒤 눌러주세요.');
        return;
    }
    currentLearningStep = Math.max(currentLearningStep, 0);
    document.getElementById('dashboard-level-label').innerText = `${currentLearningStep + 1}단계`;
    document.getElementById('my-korean-profile-level').innerText = getLearningLevelLabel(currentLearningStep);
    document.getElementById('current-learning-step-label').innerText = getLearningStepBadge(currentLearningStep);
    updateTodayKoreanPreview();
    renderMyKoreanList();

    if (currentUserId) {
        try {
            await setDoc(doc(db, 'users', currentUserId), { currentLearningStep }, { merge: true });
        } catch (error) {
            console.error('Learning progress save error:', error);
        }
    }
    await recordKoreanAttempt({
        lessonId: 'start',
        lessonTitle: '배움 시작: 모음과 자음',
        unitId: 1,
        activityType: 'jamoSort',
        isCorrect: true,
        errorType: null,
        durationMs: Date.now() - koreanActivityStartedAt
    });
    openLearningDetailActivity(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.completeLearningDetailActivity = async function completeLearningDetailActivity() {
    if (!currentLearningActivityStep || !learningDetailData[currentLearningActivityStep]) {
        showModal('완료할 배움을 먼저 열어주세요.');
        return;
    }
    const completedStep = Number(currentLearningActivityStep);
    const nextStep = completedStep + 1;
    currentLearningStep = Math.max(currentLearningStep, completedStep);
    document.getElementById('dashboard-level-label').innerText = `${currentLearningStep + 1}단계`;
    document.getElementById('my-korean-profile-level').innerText = getLearningLevelLabel(currentLearningStep);
    document.getElementById('current-learning-step-label').innerText = getLearningStepBadge(currentLearningStep);
    updateTodayKoreanPreview();
    renderMyKoreanList();

    if (currentUserId) {
        try {
            await setDoc(doc(db, 'users', currentUserId), { currentLearningStep }, { merge: true });
        } catch (error) {
            console.error('Learning detail save error:', error);
        }
    }
    await recordKoreanAttempt({
        lessonId: completedStep,
        lessonTitle: getLessonTitleForReport(completedStep),
        unitId: getUnitIdForLesson(completedStep),
        activityType: 'writeOnCanvas',
        isCorrect: true,
        errorType: null,
        durationMs: Date.now() - koreanActivityStartedAt
    });

    if (learningDetailData[nextStep]) {
        openLearningDetailActivity(nextStep);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
    }

    showModal(`${completedStep}단계 배움을 모두 마쳤어요!`);
    showDashboardOnly();
    currentLearningActivityStep = null;
    currentLearningDetailSectionIndex = 0;
    window.currentLearningActivityStep = null;
    window.currentLearningDetailSectionIndex = 0;
}

window.openTodayKoreanActivity = function openTodayKoreanActivity() {
    const nextStep = currentLearningStep + 1;
    if (currentLearningStep >= 33) {
        showModal('한글 배움을 모두 마쳤어요!');
        return;
    }
    if (nextStep <= 0) {
        openLearningStartActivity();
        return;
    }
    if (learningDetailData[nextStep]) {
        openLearningDetailActivity(nextStep);
        return;
    }
    showModal(`오늘의 한글은 배움 ${nextStep} 활동 준비 중이에요.`);
}

window.handleLogout = async function handleLogout() {
    try {
        await signOut(auth);
        document.getElementById('info-drawer')?.classList.remove('open');
        document.getElementById('drawer-overlay')?.classList.remove('open', 'visible');
        document.getElementById('teacher-manage-btn')?.classList.add('hidden');
        document.getElementById('rpg-teacher-manage-btn')?.classList.add('hidden');
        document.getElementById('rpg-student-shop-btn')?.classList.remove('hidden');
        setRpgHudVisible(false);
        showTopLevelSection('login-section');
        document.getElementById('main-container').style.maxWidth = '1000px';
        inputPassword = '';
        document.getElementById('password-display').innerText = '';
        switchLoginView('student');
    } catch (error) {
        console.error('Logout error:', error);
        showModal('로그아웃 중 오류가 발생했어요.');
    }
}

window.checkStudentLogin = async function checkStudentLogin() {
    const normalizedCode = normalizeDigits(inputPassword.trim());
    if (!normalizedCode || !/^\d+$/.test(normalizedCode)) {
        showModal("유효한 로그인 번호를 입력해주세요.");
        return;
    }

    const codeAsInt = parseInt(normalizedCode, 10);
    const email = `${codeAsInt}@abc.com`;
    const password = `${codeAsInt}qwerty`;

    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error('Student login error:', error);
        showModal("로그인 번호가 올바르지 않거나 해당 학생을 찾을 수 없어요.<br>다시 한 번 해봐요!");
        inputPassword = "";
        document.getElementById('password-display').innerText = "";
    }
}

window.checkTeacherLogin = async function checkTeacherLogin() {
    const email = document.getElementById('teacher-email').value.trim();
    const pw = document.getElementById('teacher-pw').value;
    if (!email || !pw) {
        showModal("이메일과 비밀번호를 써주세요.");
        return;
    }

    try {
        const credential = await signInWithEmailAndPassword(auth, email, pw);
        const profile = await ensureTeacherProfile(credential.user);
        updateAccountName(profile.name || credential.user.displayName || '선생님');
    } catch (error) {
        console.error('Teacher login error:', error);
        if (error.message === 'teacher-account-required') {
            showModal('교사 계정만 로그인할 수 있어요.');
            return;
        }
        showModal('이메일 또는 비밀번호가 올바르지 않아요.');
    }
}

window.checkTeacherGoogleLogin = async function checkTeacherGoogleLogin() {
    const provider = new GoogleAuthProvider();
    try {
        const credential = await signInWithPopup(auth, provider);
        const profile = await ensureTeacherProfile(credential.user);
        updateAccountName(profile.name || credential.user.displayName || '선생님');
    } catch (error) {
        console.error('Teacher google login error:', error);
        if (error.message === 'teacher-account-required') {
            showModal('교사 계정만 로그인할 수 있어요.');
            return;
        }
        showModal('Google 로그인 중 오류가 발생했어요. 다시 시도해주세요.');
    }
}

const TEST_LOGIN_ACCOUNTS = {
    student: {
        email: '9001@abc.com',
        password: '9001qwerty',
        name: '학생 테스트',
        role: 'student',
        userCode: 9001
    },
    teacher: {
        email: 'teacher9001@abc.com',
        password: 'teacher9001qwerty',
        name: '교사 테스트',
        role: 'teacher',
        userCode: null
    }
};

function isTeacherTestAccount() {
    return auth.currentUser?.email === TEST_LOGIN_ACCOUNTS.teacher.email || currentUserName === TEST_LOGIN_ACCOUNTS.teacher.name;
}

function getTeacherTestKoreanReport() {
    return {
        studentId: 'teacher_test_korean_student',
        studentName: '김토도',
        completedLessonCount: 8,
        completedActivityCount: 23,
        totalAttempts: 32,
        correctAttempts: 24,
        accuracyRate: 75,
        totalRetryCount: 6,
        topErrorTypes: [
            { type: KOREAN_ERROR_TYPES.VOWEL, count: 3 },
            { type: KOREAN_ERROR_TYPES.BATCHIM, count: 2 },
            { type: KOREAN_ERROR_TYPES.MEANING_MATCH, count: 1 }
        ],
        recentWrongWords: ['나무', '곰', '돼지'],
        difficultLessons: [
            { lessonId: 13, title: 'ㅏ, ㅣ 단어 공부하기', count: 3 },
            { lessonId: 21, title: 'ㅁ, ㅂ 받침', count: 2 }
        ],
        recommendedLessons: [
            { lessonId: 13, title: '배움 13: ㅏ, ㅣ 단어 공부하기', reason: '최근 오답 단어 복습' },
            { lessonId: 21, title: '배움 21: ㅁ, ㅂ 받침', reason: '받침 다시 연습' }
        ],
        lastStudiedAt: new Date().toISOString()
    };
}

function renderTeacherTestKoreanReportRow(tbody) {
    const sid = 'teacher_test_korean_student';
    const report = getTeacherTestKoreanReport();
    window.teacherKoreanReports = window.teacherKoreanReports || {};
    window.teacherKoreanReports[sid] = report;

    const maxUnlockedStep = 4;
    const m = window.koreanExperienceMultipliers || {
        max1: { s1: 1.0 },
        max2: { s1: 0.5, s2: 1.0 },
        max3: { s1: 0.33, s2: 0.66, s3: 1.0 },
        max4: { s1: 0.25, s2: 0.5, s3: 0.75, s4: 1.0 }
    };
    let mapping = m[`max${maxUnlockedStep}`] || { s1: 1.0, s2: 1.0, s3: 1.0, s4: 1.0 };
    const rate1 = Math.round((mapping.s1 ?? 0.25) * 100);
    const rate2 = Math.round((mapping.s2 ?? 0.5) * 100);
    const rate3 = Math.round((mapping.s3 ?? 0.75) * 100);
    const rate4 = Math.round((mapping.s4 ?? 1.0) * 100);
    const multiplierText = `단계별 배율: 1단계 ${rate1}% · 2단계 ${rate2}% · 3단계 ${rate3}% · 4단계 ${rate4}%`;

    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-50 hover:bg-gray-50 transition-colors';
    tr.innerHTML = `
        <td class="py-4 px-4 font-bold text-gray-700">
            <div>${escapeHtml(report.studentName)}<span class="ml-2 text-xs text-teal-500">샘플</span></div>
            <div class="text-[10px] text-teal-600 font-bold mt-1">${escapeHtml(multiplierText)}</div>
        </td>
        <td class="py-4 px-4 text-teal-600 font-bold">9001</td>
        <td class="py-4 px-4">
            <div class="flex gap-2">
                <button type="button" class="toggle-btn active">1단계</button>
                <button type="button" class="toggle-btn active">2단계</button>
                <button type="button" class="toggle-btn active">3단계</button>
                <button type="button" class="toggle-btn active">4단계</button>
            </div>
        </td>
        <td class="py-4 px-4">
            <div class="text-sm font-bold text-[#2c3e50]">완료 ${report.completedLessonCount}개 · 정답률 ${report.accuracyRate}%</div>
            <div class="text-xs text-gray-500 mt-1">어려운 유형: ${formatKoreanReportList(report.topErrorTypes, '아직 없음')}</div>
            <button type="button" class="btn-outline px-3 py-1 text-xs mt-2" onclick="openKoreanStudentReport('${escapeInlineJsString(sid)}')">상세 보기</button>
        </td>
    `;
    tbody.appendChild(tr);
}

function buildTestUserProfile(user, account) {
    return {
        uid: user.uid,
        name: account.name,
        email: account.email,
        userCode: account.userCode,
        role: account.role,
        coins: 0,
        balance: 0,
        portfolio: {},
        drawingPortfolio: { missions: {}, free: [] },
        dictationPortfolio: { missions: {}, aiWords: [] },
        aeduTokens: 0,
        aeduExperience: 0,
        aeduLevel: 1,
        currentLearningStep: 33,
        currentDrawingStep: 5,
        currentDictationStep: 5,
        unlockedLevels: [1, 2, 3, 4],
        warningTokens: 0,
        testAccount: true,
        updatedAt: serverTimestamp(),
        ...(account.role === 'student' ? { createdBy: 'test-login-button' } : {})
    };
}

async function signInOrCreateTestAccount(account) {
    let credential;
    try {
        credential = await signInWithEmailAndPassword(auth, account.email, account.password);
    } catch (error) {
        const canCreate = error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential';
        if (!canCreate) throw error;

        try {
            credential = await createUserWithEmailAndPassword(auth, account.email, account.password);
        } catch (createError) {
            if (createError.code === 'auth/email-already-in-use') {
                throw new Error('test-account-password-mismatch');
            }
            throw createError;
        }
    }

    const profile = buildTestUserProfile(credential.user, account);
    await setDoc(doc(db, 'users', credential.user.uid), profile, { merge: true });
    return { credential, profile };
}

window.testLoginStudent = async function testLoginStudent() {
    try {
        inputPassword = '';
        const display = document.getElementById('password-display');
        if (display) display.innerText = '';
        const { profile } = await signInOrCreateTestAccount(TEST_LOGIN_ACCOUNTS.student);
        updateAccountName(profile.name);
    } catch (error) {
        console.error('Test student login error:', error);
        showModal('학생 테스트 계정을 준비하거나 로그인하는 중 오류가 발생했습니다.');
    }
}

window.testLoginTeacher = async function testLoginTeacher() {
    try {
        const { credential, profile } = await signInOrCreateTestAccount(TEST_LOGIN_ACCOUNTS.teacher);
        await ensureTeacherProfile(credential.user, profile.name);
        updateAccountName(profile.name);
    } catch (error) {
        console.error('Test teacher login error:', error);
        if (error.message === 'test-account-password-mismatch') {
            showModal('교사 테스트 계정은 이미 있지만 비밀번호가 달라요. 다른 테스트 계정으로 다시 만들어야 합니다.');
            return;
        }
        showModal('교사 테스트 계정을 준비하거나 로그인하는 중 오류가 발생했습니다.');
    }
}

window.showModal = function showModal(msg, options = {}) {
    const message = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const icon = document.getElementById('modal-icon');
    lastModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    message.innerHTML = sanitizeModalHtml(msg);
    const modal = document.getElementById('result-modal');
    modal.dataset.plainClose = options.plainClose ? 'true' : '';
    confirmBtn.classList.toggle('hidden', Boolean(options.hideConfirm));
    icon?.classList.toggle('hidden', Boolean(options.hideIcon));
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    window.requestAnimationFrame(() => {
        const firstAction = modal.querySelector('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled])');
        if (firstAction instanceof HTMLElement) firstAction.focus();
    });
}

window.handleModalConfirm = function handleModalConfirm() {
    const modal = document.getElementById('result-modal');
    const plainClose = modal?.dataset?.plainClose === 'true';
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        modal.dataset.plainClose = '';
        document.getElementById('modal-confirm-btn')?.classList.remove('hidden');
        document.getElementById('modal-icon')?.classList.remove('hidden');
    }
    if (lastModalTrigger?.isConnected) lastModalTrigger.focus();
    lastModalTrigger = null;
    if (plainClose) return;
    const startVisible = !document.getElementById('start-screen')?.classList.contains('hidden');
    const loginVisible = !document.getElementById('login-section')?.classList.contains('hidden');
    if ((startVisible || loginVisible) && loginSuccess && !openPendingActivityRoute()) {
        openDashboard();
    }
}

// Inline onclick이 모듈 로딩/레이어 문제로 먹지 않는 상황을 대비한 모달 닫기 보강.
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.handleModalConfirm();
    });
}
const resultModal = document.getElementById('result-modal');
if (resultModal) {
    resultModal.addEventListener('click', (event) => {
        if (event.target === resultModal) window.handleModalConfirm();
    });
}
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !document.getElementById('result-modal')?.classList.contains('hidden')) {
        window.handleModalConfirm();
    }
});

window.closeStudentSignupModal = function closeStudentSignupModal() {
    document.getElementById('student-signup-modal').classList.add('hidden');
}

window.openStudentSignupModal = function openStudentSignupModal() {
    document.getElementById('student-signup-name').value = '';
    document.getElementById('student-signup-modal').classList.remove('hidden');
}

window.openTeacherSignupModal = function openTeacherSignupModal() {
    document.getElementById('teacher-signup-modal').classList.remove('hidden');
}

window.closeTeacherSignupModal = function closeTeacherSignupModal() {
    document.getElementById('teacher-signup-modal').classList.add('hidden');
}

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
            let nextCode = 1;
            if (counterDoc.exists() && counterDoc.data().lastUserCode) {
                nextCode = counterDoc.data().lastUserCode + 1;
            }
            transaction.set(counterRef, { lastUserCode: nextCode }, { merge: true });
            return nextCode;
        });

        const email = `${newCode}@abc.com`;
        const password = `${newCode}qwerty`;
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);

        await setDoc(doc(db, 'users', userCredential.user.uid), {
            uid: userCredential.user.uid,
            name,
            email,
            userCode: newCode,
            role: 'student',
            coins: 0,
            balance: 0,
            portfolio: {},
            drawingPortfolio: { missions: {}, free: [] },
            dictationPortfolio: { missions: {}, aiWords: [] },
            aeduTokens: 0,
            aeduExperience: 0,
            aeduLevel: 1,
            currentLearningStep: -1,
            currentDrawingStep: -1,
            currentDictationStep: -1,
            warningTokens: 0,
            createdAt: serverTimestamp()
        }, { merge: true });

        await signOut(auth);
        closeStudentSignupModal();
        showModal(`계정이 만들어졌어요!<br><strong>${escapeHtml(name)}</strong> 학생의 로그인 번호는 <strong class="text-teal-600">${newCode}</strong> 입니다.`);
        inputPassword = '';
        document.getElementById('password-display').innerText = '';
    } catch (error) {
        console.error('Student sign-up error:', error);
        showModal('회원가입 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
    }
}

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
            portfolio: {},
            drawingPortfolio: { missions: {}, free: [] },
            dictationPortfolio: { missions: {}, aiWords: [] },
            aeduTokens: 0,
            aeduExperience: 0,
            aeduLevel: 1,
            currentDrawingStep: 5,
            currentDictationStep: 5,
            warningTokens: 0,
            createdAt: serverTimestamp()
        }, { merge: true });

        await signOut(auth);
        closeTeacherSignupModal();
        showModal(`환영합니다, ${escapeHtml(name)} 선생님!<br>이제 로그인해서 사용해보세요.`);
    } catch (error) {
        console.error('Teacher sign-up error:', error);
        if (error.code === 'auth/email-already-in-use') {
            showModal('이미 사용 중인 이메일입니다. 다른 이메일을 사용해주세요.');
            return;
        }
        if (error.code === 'auth/weak-password') {
            showModal('비밀번호는 6자 이상이어야 해요.');
            return;
        }
        showModal('선생님 회원가입 중 오류가 발생했어요.');
    }
}


document.getElementById('student-signup-modal').addEventListener('click', (e) => {
    if (e.target.id === 'student-signup-modal') {
        closeStudentSignupModal();
    }
});

document.getElementById('teacher-signup-modal').addEventListener('click', (e) => {
    if (e.target.id === 'teacher-signup-modal') {
        closeTeacherSignupModal();
    }
});

// --- Teacher Class Management Logic ---
let teacherClassStudents = new Map();
let teacherClassStudentUnsubscribers = [];
let activeClassManagementTab = 'points';

function stopTeacherClassStudentSubscriptions() {
    teacherClassStudentUnsubscribers.forEach((unsubscribe) => { try { unsubscribe(); } catch {} });
    teacherClassStudentUnsubscribers = [];
}

function setKoreanMultiplierInputs() {
    const m = window.koreanExperienceMultipliers || {};
    const values = {
        'exp-mult-m1-s1': m.max1?.s1 ?? 1,
        'exp-mult-m2-s1': m.max2?.s1 ?? 0.5, 'exp-mult-m2-s2': m.max2?.s2 ?? 1,
        'exp-mult-m3-s1': m.max3?.s1 ?? 0.33, 'exp-mult-m3-s2': m.max3?.s2 ?? 0.66, 'exp-mult-m3-s3': m.max3?.s3 ?? 1,
        'exp-mult-m4-s1': m.max4?.s1 ?? 0.25, 'exp-mult-m4-s2': m.max4?.s2 ?? 0.5, 'exp-mult-m4-s3': m.max4?.s3 ?? 0.75, 'exp-mult-m4-s4': m.max4?.s4 ?? 1
    };
    Object.entries(values).forEach(([id, value]) => { const input = document.getElementById(id); if (input) input.value = value; });
}

window.selectClassManagementTab = function selectClassManagementTab(tab = 'points') {
    const allowed = new Set(['points', 'multipliers', 'progress', 'activity']);
    activeClassManagementTab = allowed.has(tab) ? tab : 'points';
    document.querySelectorAll('.class-management-panel').forEach((panel) => panel.classList.toggle('hidden', panel.id !== `class-management-${activeClassManagementTab}-panel`));
    document.querySelectorAll('.class-management-tab-btn').forEach((button) => {
        const active = button.dataset.classTab === activeClassManagementTab;
        button.classList.toggle('btn-primary', active);
        button.classList.toggle('btn-outline', !active);
        button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderTeacherClassManagement();
}

window.openClassManagement = async function() {
    if (currentUserRole !== 'teacher' || !currentUserId) return showModal('교사 계정으로 로그인해 주세요.');
    document.getElementById('class-management-modal').classList.remove('hidden');
    closeTeacherStudentAddPanel();
    selectClassManagementTab('points');
    await loadKoreanExperienceMultipliers(currentUserId, currentUserId);
    setKoreanMultiplierInputs();
    await loadStudents();
}

window.closeClassManagement = function() {
    stopTeacherClassStudentSubscriptions();
    closeTeacherStudentAddPanel();
    document.getElementById('class-management-modal').classList.add('hidden');
}

function classStudentEntries() {
    return Array.from(teacherClassStudents.entries()).sort(([, a], [, b]) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
}

function classEmptyRow(columns, message = '학급에 등록된 학생이 없어요.') {
    return `<tr><td colspan="${columns}" class="text-center py-10 text-gray-400 font-bold">${escapeHtml(message)}</td></tr>`;
}

function renderTeacherClassPointRows() {
    const tbody = document.getElementById('student-list-tbody');
    if (!tbody) return;
    const entries = classStudentEntries();
    tbody.innerHTML = entries.length ? entries.map(([sid, student]) => {
        const money = asNumber(student.balance ?? student.coins ?? student.aeduTokens, 0);
        const warning = Math.max(0, asNumber(student.warningTokens, 0));
        return `<tr class="border-b border-gray-100 align-top">
            <td class="py-4 px-3 font-black text-[#2c3e50]">${escapeHtml(student.name || '이름 없음')}</td>
            <td class="py-4 px-3 text-teal-600 font-black">${escapeHtml(student.userCode || student.code || '-')}</td>
            <td class="py-4 px-3 text-amber-600 font-black">${formatAiedueShopCurrency(money)}</td>
            <td class="py-4 px-3 text-red-500 font-black">${warning}개</td>
            <td class="py-4 px-3"><div class="space-y-2 min-w-[330px]">
                <div class="flex flex-wrap gap-1 items-center"><span class="w-16 text-xs font-black">돈</span><input id="wallet-money-${escapeHtml(sid)}" type="number" min="1" class="w-24 px-2 py-1 border rounded-xl text-xs" placeholder="금액"><button type="button" class="btn-primary px-2 py-1 text-xs" onclick="adjustStudentKoreanWallet('${escapeInlineJsString(sid)}','money',1)">지급</button><button type="button" class="btn-outline px-2 py-1 text-xs" onclick="adjustStudentKoreanWallet('${escapeInlineJsString(sid)}','money',-1)">차감</button></div>
                <div class="flex flex-wrap gap-1 items-center"><span class="w-16 text-xs font-black">주의토큰</span><input id="wallet-warning-${escapeHtml(sid)}" type="number" min="1" class="w-24 px-2 py-1 border rounded-xl text-xs" placeholder="개수"><button type="button" class="btn-primary px-2 py-1 text-xs" onclick="adjustStudentKoreanWallet('${escapeInlineJsString(sid)}','warning',1)">지급</button><button type="button" class="btn-outline px-2 py-1 text-xs" onclick="adjustStudentKoreanWallet('${escapeInlineJsString(sid)}','warning',-1)">차감</button></div>
            </div></td>
        </tr>`;
    }).join('') : classEmptyRow(5);
}

function renderTeacherClassProgressRows() {
    const tbody = document.getElementById('student-progress-tbody');
    if (!tbody) return;
    const entries = classStudentEntries();
    tbody.innerHTML = entries.length ? entries.map(([sid, student]) => {
        const unlocked = normalizeUnlockedLevels(student.unlockedLevels, 'student');
        const toggles = [1, 2, 3, 4].map((level) => {
            const active = unlocked.includes(level);
            return `<button type="button" class="toggle-btn ${active ? 'active' : ''}" onclick="toggleLevelLock('${escapeInlineJsString(sid)}',${level},${active})">${level}단계</button>`;
        }).join('');
        return `<tr class="border-b border-gray-100 align-top">
            <td class="py-4 px-3"><div class="font-black text-[#2c3e50]">${escapeHtml(student.name || '이름 없음')}</div><div class="text-xs text-teal-600 font-bold">${escapeHtml(student.userCode || student.code || '-')}</div></td>
            <td class="py-4 px-3"><div class="flex flex-wrap gap-2"><button type="button" class="btn-outline px-3 py-2 text-xs" onclick="openStudentProgressDetail('${escapeInlineJsString(sid)}','drawing')">그리기</button><button type="button" class="btn-outline px-3 py-2 text-xs" onclick="openStudentProgressDetail('${escapeInlineJsString(sid)}','hangul')">한글 해득</button><button type="button" class="btn-outline px-3 py-2 text-xs" onclick="openStudentProgressDetail('${escapeInlineJsString(sid)}','dictation')">교과 맞춤쓰기</button><button type="button" class="btn-outline px-3 py-2 text-xs" onclick="openStudentProgressDetail('${escapeInlineJsString(sid)}','literacy')">문해력</button></div></td>
            <td class="py-4 px-3"><div class="flex flex-wrap gap-2">${toggles}</div></td>
        </tr>`;
    }).join('') : classEmptyRow(3);
}

function formatClassActivityTime(value) {
    const millis = Number(value?.toMillis?.() ?? value?.seconds * 1000 ?? value ?? 0);
    return millis ? new Date(millis).toLocaleString('ko-KR') : '시간 정보 없음';
}

function renderTeacherClassActivity() {
    const root = document.getElementById('student-activity-list');
    if (!root) return;
    const entries = classStudentEntries();
    root.innerHTML = entries.length ? entries.map(([, student]) => {
        const logs = Array.isArray(student.koreanActivityLog) ? student.koreanActivityLog.slice(0, 30) : [];
        const logHtml = logs.length ? logs.map((log) => `<li class="border-l-4 ${log.type === 'teacher-wallet' ? 'border-amber-400' : 'border-teal-400'} bg-gray-50 rounded-r-2xl px-4 py-3"><div class="text-sm font-bold text-[#2c3e50]">${escapeHtml(log.message || '활동이 기록되었습니다.')}</div><div class="text-[11px] text-gray-400 mt-1">${escapeHtml(formatClassActivityTime(log.createdAtMs || log.createdAt))}</div></li>`).join('') : '<li class="text-sm text-gray-400 font-bold py-4">새로 지급되는 경험치와 교사 지급·차감부터 여기에 기록됩니다.</li>';
        return `<article class="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm"><div class="flex flex-wrap items-center justify-between gap-2 mb-3"><div><h4 class="text-xl font-black text-[#2c3e50]">${escapeHtml(student.name || '이름 없음')}</h4><p class="text-xs text-teal-600 font-bold">${escapeHtml(student.userCode || student.code || '-')}</p></div><div class="text-xs font-black text-gray-500">Lv.${Math.max(1, asNumber(student.aeduLevel, 1))} · 경험치 ${asNumber(student.aeduExperience, 0).toFixed(1)}%</div></div><ol class="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">${logHtml}</ol></article>`;
    }).join('') : '<p class="text-center py-10 text-gray-400 font-bold">학급에 등록된 학생이 없어요.</p>';
}

function renderTeacherClassManagement() {
    renderTeacherClassPointRows();
    renderTeacherClassProgressRows();
    renderTeacherClassActivity();
}

function startTeacherClassStudentSubscriptions() {
    stopTeacherClassStudentSubscriptions();
    for (const [sid] of teacherClassStudents) {
        const unsubscribe = onSnapshot(doc(db, 'users', sid), (snap) => {
            if (!snap.exists()) return;
            teacherClassStudents.set(sid, { id: sid, ...snap.data() });
            renderTeacherClassManagement();
        }, (error) => console.warn('학생 실시간 현황 구독 실패', sid, error));
        teacherClassStudentUnsubscribers.push(unsubscribe);
    }
}

window.loadStudents = async function() {
    const pointBody = document.getElementById('student-list-tbody');
    if (pointBody) pointBody.innerHTML = classEmptyRow(5, '목록을 불러오는 중입니다.');
    try {
        const students = await getAiedueKoreanClassStudents();
        teacherClassStudents = new Map(students.map((student) => [student.id, student]));
        if (students.length) {
            await setDoc(doc(db, 'classes', currentUserId), { teacherId: currentUserId, students: students.map((student) => student.id), updatedAt: serverTimestamp() }, { merge: true });
        }
        renderTeacherClassManagement();
        startTeacherClassStudentSubscriptions();
    } catch (error) {
        console.error('Load students error:', error);
        teacherClassStudents = new Map();
        renderTeacherClassManagement();
        if (pointBody) pointBody.innerHTML = classEmptyRow(5, '목록을 불러오지 못했습니다.');
    }
}

window.adjustStudentKoreanWallet = async function(sid, kind, direction) {
    try {
        const inputId = kind === 'warning' ? `wallet-warning-${sid}` : `wallet-money-${sid}`;
        const rawAmount = Math.floor(Math.abs(asNumber(document.getElementById(inputId)?.value, 0)));
        if (!rawAmount) return showModal('지급/차감할 숫자를 입력해주세요.');
        const requestedDelta = rawAmount * (direction < 0 ? -1 : 1);
        const userRef = doc(db, 'users', sid);
        const transferRef = doc(collection(db, 'transferLog'));
        const result = await runTransaction(db, async (transaction) => {
            const snap = await transaction.get(userRef);
            if (!snap.exists()) throw new Error('학생 정보를 찾지 못했습니다.');
            const data = snap.data();
            const studentName = data.name || '학생';
            const teacherName = currentUserProfileSnapshot?.name || currentUserName || '선생님';
            const currentValue = kind === 'warning'
                ? Math.max(0, asNumber(data.warningTokens, 0))
                : Math.max(0, asNumber(data.balance ?? data.coins ?? data.aeduTokens, 0));
            const nextValue = Math.max(0, currentValue + requestedDelta);
            const appliedDelta = nextValue - currentValue;
            if (!appliedDelta) throw new Error('더 이상 차감할 수 없습니다.');
            const itemName = kind === 'warning' ? '주의토큰' : '돈';
            const action = appliedDelta > 0 ? '지급했다.' : '차감했다.';
            const unit = kind === 'warning' ? '개' : '점';
            const activity = {
                id: `teacher_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
                type: 'teacher-wallet',
                source: 'class-management',
                kind,
                delta: appliedDelta,
                createdAtMs: Date.now(),
                message: `교사 ${teacherName}가 ${studentName}에게 ${itemName} ${Math.abs(appliedDelta).toLocaleString()}${unit}을 ${action}`
            };
            const logs = [activity, ...(Array.isArray(data.koreanActivityLog) ? data.koreanActivityLog : [])].slice(0, 200);
            const update = kind === 'warning'
                ? { warningTokens: nextValue }
                : { balance: nextValue, coins: nextValue, aeduTokens: nextValue };
            transaction.set(userRef, { ...update, koreanActivityLog: logs, updatedAt: serverTimestamp() }, { merge: true });
            transaction.set(transferRef, {
                type: 'balanceChange',
                senderId: currentUserId,
                teacherId: currentUserId,
                teacherName,
                targetUserId: sid,
                studentId: sid,
                studentName,
                kind,
                delta: appliedDelta,
                previousBalance: currentValue,
                nextBalance: nextValue,
                reason: activity.message,
                source: 'aiedue-korean-class-management',
                createdAt: serverTimestamp()
            });
            return { appliedDelta, itemName, unit };
        });
        const input = document.getElementById(inputId); if (input) input.value = '';
        showModal(`${result.itemName} ${Math.abs(result.appliedDelta).toLocaleString()}${result.unit} ${result.appliedDelta < 0 ? '차감' : '지급'} 완료`);
    } catch (err) {
        console.error('student wallet adjust failed', err);
        showModal(`학생 돈/주의토큰 변경 실패: ${escapeHtml(err.message || err)}`);
    }
}

window.openTeacherStudentAddPanel = function openTeacherStudentAddPanel() {
    const panel = document.getElementById('teacher-student-add-panel');
    const input = document.getElementById('teacher-student-search-input');
    const results = document.getElementById('teacher-student-search-results');
    panel?.classList.remove('hidden');
    if (input) input.value = '';
    if (results) results.innerHTML = '<p class="text-sm text-gray-500 font-bold">이름을 검색한 뒤 학생을 선택하세요.</p>';
    window.setTimeout(() => input?.focus(), 0);
}

window.closeTeacherStudentAddPanel = function closeTeacherStudentAddPanel() {
    document.getElementById('teacher-student-add-panel')?.classList.add('hidden');
    const input = document.getElementById('teacher-student-search-input');
    if (input) input.value = '';
}

window.searchStudentsForTeacher = async function searchStudentsForTeacher() {
    const panel = document.getElementById('teacher-student-add-panel');
    const input = document.getElementById('teacher-student-search-input');
    const results = document.getElementById('teacher-student-search-results');
    if (!panel || panel.classList.contains('hidden') || !results) return;
    const name = String(input?.value || '').trim();
    if (!name) return showModal('검색할 학생 이름을 입력해주세요.');
    results.innerHTML = '<p class="text-sm text-gray-500 font-bold">학생을 검색하는 중입니다.</p>';
    try {
        const snap = await getDocs(query(collection(db, 'users'), where('name', '==', name), queryLimit(20)));
        const candidates = snap.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => String(item.role || 'student').toLowerCase() === 'student');
        results.innerHTML = candidates.length ? candidates.map((student) => {
            const alreadyAdded = teacherClassStudents.has(student.id);
            const anotherTeacher = Boolean(student.teacherId && student.teacherId !== currentUserId);
            const disabled = alreadyAdded || anotherTeacher;
            const state = alreadyAdded ? '이미 우리 반 학생' : (anotherTeacher ? '다른 학급 소속' : '선택 가능');
            return `<div class="bg-white border rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"><div><div class="font-black text-[#2c3e50]">${escapeHtml(student.name || '이름 없음')}</div><div class="text-xs text-gray-500">로그인 번호 ${escapeHtml(student.userCode || student.code || '-')} · ${state}</div></div><button type="button" class="${disabled ? 'btn-outline opacity-50' : 'btn-primary'} px-4 py-2 text-sm" ${disabled ? 'disabled' : ''} onclick="addStudentByTeacher('${escapeInlineJsString(student.id)}')">학생 선택</button></div>`;
        }).join('') : '<p class="text-sm text-red-500 font-bold">해당 이름으로 가입한 학생을 찾지 못했습니다.</p>';
    } catch (error) {
        console.error('student name search failed', error);
        results.innerHTML = '<p class="text-sm text-red-500 font-bold">학생 검색에 실패했습니다.</p>';
    }
}

window.addStudentByTeacher = async function(sid) {
    if (!sid) return showModal('검색 결과에서 추가할 학생을 선택해주세요.');
    try {
        const classRef = doc(db, 'classes', currentUserId);
        const studentRef = doc(db, 'users', sid);
        const student = await runTransaction(db, async (transaction) => {
            const [classSnap, studentSnap] = await Promise.all([transaction.get(classRef), transaction.get(studentRef)]);
            if (!studentSnap.exists()) throw new Error('학생 정보를 찾지 못했습니다.');
            const data = studentSnap.data();
            if (String(data.role || 'student').toLowerCase() !== 'student') throw new Error('학생 계정만 추가할 수 있습니다.');
            if (data.teacherId && data.teacherId !== currentUserId) throw new Error('이미 다른 교사의 학급에 소속된 학생입니다.');
            const students = Array.from(new Set([...(Array.isArray(classSnap.data()?.students) ? classSnap.data().students : []), sid]));
            transaction.set(classRef, { teacherId: currentUserId, students, updatedAt: serverTimestamp() }, { merge: true });
            transaction.set(studentRef, { teacherId: currentUserId, classId: currentUserId, updatedAt: serverTimestamp() }, { merge: true });
            return data;
        });
        closeTeacherStudentAddPanel();
        showModal(`${escapeHtml(student.name || '학생')} 학생을 우리 반에 추가했습니다.`);
        await loadStudents();
    } catch (error) {
        console.error('Add student error:', error);
        showModal(`학생 추가 실패: ${escapeHtml(error.message || error)}`);
    }
}

function buildTeacherLiteracyProgressBody(student) {
    const portfolio = student?.literacyPortfolio || {};
    const stats = portfolio.stats || {};
    const dan = Math.max(1, Math.floor(asNumber(portfolio.dan ?? student?.literacyDan, 1)));
    const difficulties = [
        { key: 'easy', label: 'EASY' },
        { key: 'normal', label: 'NORMAL' },
        { key: 'hard', label: 'HARD' },
        { key: 'expert', label: 'EXPERT' }
    ];
    const types = [
        { key: 'multipleChoice', label: '객관식' },
        { key: 'shortAnswer', label: '단답형' },
        { key: 'essay', label: '서술형' }
    ];
    const rows = difficulties.map((difficulty) => {
        const cells = types.map((type) => {
            const stat = stats[`${difficulty.key}-${type.key}`] || {};
            const attempts = Math.max(0, Math.floor(asNumber(stat.attempts, 0)));
            const corrects = Math.max(0, Math.floor(asNumber(stat.corrects, 0)));
            const accuracy = attempts ? Math.max(0, Math.min(100, Math.round((corrects / attempts) * 100))) : 0;
            return `<td class="p-3 text-center"><div class="text-xl font-black text-blue-700">${accuracy}%</div><div class="text-[11px] font-bold text-gray-500 mt-1">${attempts ? `정답 ${corrects} / ${attempts}회` : '기록 없음'}</div></td>`;
        }).join('');
        return `<tr class="border-t border-gray-100"><th scope="row" class="p-3 text-left font-black text-[#2c3e50] bg-gray-50">${difficulty.label}</th>${cells}</tr>`;
    }).join('');
    const history = Array.isArray(portfolio.history) ? portfolio.history.slice(0, 12) : [];
    const historyHtml = history.length ? history.map((record) => `<div class="p-3 rounded-2xl bg-amber-50"><div class="font-black">${escapeHtml(record.question || '문해력 활동')}</div><div class="text-sm text-gray-600 mt-1">${record.isCorrect === true ? '정답' : (record.isCorrect === false ? '오답' : '완료')}${record.score != null ? ` · ${escapeHtml(record.score)}점` : ''}${record.difficulty ? ` · ${escapeHtml(String(record.difficulty).toUpperCase())}` : ''}</div></div>`).join('') : '<p class="text-gray-400 font-bold">아직 문해력 기록이 없습니다.</p>';
    return `<div class="p-4 rounded-3xl bg-blue-50 text-center mb-4"><div class="text-sm font-black text-blue-600">현재 문해력 단</div><div class="text-4xl font-black text-[#2c3e50] mt-1">${dan}단</div></div><div class="overflow-x-auto rounded-2xl border border-blue-100 mb-4"><table class="w-full min-w-[620px] bg-white text-sm"><thead class="bg-blue-50 text-blue-800"><tr><th class="p-3 text-left">난이도</th>${types.map((type) => `<th class="p-3 text-center">${type.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><div><h4 class="font-black text-gray-700 mb-2">최근 문해력 기록</h4><div class="grid grid-cols-1 md:grid-cols-2 gap-3">${historyHtml}</div></div>`;
}

window.openStudentProgressDetail = function openStudentProgressDetail(sid, type) {
    const student = teacherClassStudents.get(sid);
    if (!student) return showModal('학생 정보를 찾지 못했습니다.');
    let title = '';
    let body = '';
    if (type === 'drawing') {
        title = '그리기 · 도형별 정확도';
        const stats = student.drawingPortfolio?.shapeStats || {};
        const shapes = Array.isArray(drawingShapeLibrary) ? drawingShapeLibrary : [];
        body = shapes.map((shape) => {
            const stat = stats[shape.key] || {};
            const accuracy = Math.max(0, Math.min(100, asNumber(stat.accuracy, 0)));
            return `<div class="p-3 rounded-2xl bg-purple-50"><div class="flex justify-between gap-3"><span class="font-black">${escapeHtml(shape.label || shape.key)}</span><span class="font-black text-purple-600">${accuracy}%</span></div><div class="text-xs text-gray-500 mt-1">시도 ${asNumber(stat.attempts, 0)}회 · 최고 ${asNumber(stat.bestAccuracy, 0)}%</div></div>`;
        }).join('') || '<p class="text-gray-400 font-bold">아직 도형 정확도 기록이 없습니다.</p>';
    } else if (type === 'hangul') {
        title = '한글 해득 · 현재 진도';
        const completedStep = Math.max(-1, Math.floor(asNumber(student.currentLearningStep, -1)));
        const nextStep = Math.min(35, completedStep + 2);
        body = `<div class="p-6 rounded-3xl bg-green-50 text-center"><div class="text-sm font-black text-green-600">현재 할 차례</div><div class="text-3xl font-black text-[#2c3e50] mt-2">배움 ${nextStep} 활동 차례</div><div class="text-sm text-gray-500 mt-2">완료한 배움 ${Math.max(0, completedStep + 1)}개</div></div>`;
    } else if (type === 'dictation') {
        title = '교과 맞춤쓰기 · 나의 기록';
        const records = Object.entries(student.dictationPortfolio?.missions || {}).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 30);
        body = records.length ? records.map(([step, record]) => `<div class="p-3 rounded-2xl bg-blue-50"><div class="font-black">${escapeHtml(record?.title || `${step}단계`)}</div><div class="text-sm text-gray-600 mt-1">${record?.score != null ? `점수 ${escapeHtml(record.score)}` : (record?.correct ? '정답' : '완료')} ${record?.answer ? `· 답 ${escapeHtml(record.answer)}` : ''}</div></div>`).join('') : '<p class="text-gray-400 font-bold">아직 교과 맞춤쓰기 기록이 없습니다.</p>';
    } else {
        title = '문해력 · 난이도/유형별 진도';
        body = buildTeacherLiteracyProgressBody(student);
    }
    const bodyClass = type === 'literacy' ? '' : 'grid grid-cols-1 md:grid-cols-2 gap-3';
    showModal(`<div class="text-left"><h3 class="text-2xl font-black text-[#2c3e50] mb-1">${escapeHtml(student.name || '학생')}</h3><p class="font-black text-teal-600 mb-4">${escapeHtml(title)}</p><div class="${bodyClass} max-h-[65vh] overflow-y-auto custom-scrollbar pr-1">${body}</div></div>`);
}

window.toggleLevelLock = async function(sid, level, currentActive) {
    try {
        const userRef = doc(db, 'users', sid);
        if (currentActive) {
            await updateDoc(userRef, { unlockedLevels: arrayRemove(level) });
        } else {
            await updateDoc(userRef, { unlockedLevels: arrayUnion(level) });
        }
        await loadStudents();
    } catch (err) {
        console.error('Toggle level lock error:', err);
    }
}

window.openKoreanStudentReport = function openKoreanStudentReport(sid) {
    const report = window.teacherKoreanReports?.[sid] || window.buildKoreanStudentReport(sid);
    const errorRows = (report.topErrorTypes || []).map((item) => `<tr><td class="py-2 px-3">${escapeHtml(formatKoreanErrorType(item.type))}</td><td class="py-2 px-3 font-black">${Number(item.count || 0)}</td></tr>`).join('') || '<tr><td class="py-2 px-3 text-gray-400" colspan="2">아직 기록이 없어요.</td></tr>';
    const lessonRows = (report.difficultLessons || []).map((item) => `<tr><td class="py-2 px-3">${escapeHtml(item.title)}</td><td class="py-2 px-3 font-black">${Number(item.count || 0)}</td></tr>`).join('') || '<tr><td class="py-2 px-3 text-gray-400" colspan="2">아직 기록이 없어요.</td></tr>';
    showModal(`
        <div class="text-left">
            <h3 class="text-2xl font-black text-[#2c3e50] mb-4">에이두 한글 리포트: ${escapeHtml(report.studentName || '학생')}</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <div class="p-4 bg-green-50 rounded-2xl"><div class="text-xs text-green-600 font-black">완료 배움</div><div class="text-2xl font-black">${report.completedLessonCount || 0}개</div></div>
                <div class="p-4 bg-blue-50 rounded-2xl"><div class="text-xs text-blue-600 font-black">정답률</div><div class="text-2xl font-black">${report.accuracyRate || 0}%</div></div>
                <div class="p-4 bg-orange-50 rounded-2xl"><div class="text-xs text-orange-600 font-black">재시도</div><div class="text-2xl font-black">${report.totalRetryCount || 0}회</div></div>
                <div class="p-4 bg-purple-50 rounded-2xl"><div class="text-xs text-purple-600 font-black">활동 기록</div><div class="text-2xl font-black">${report.totalAttempts || 0}개</div></div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="border rounded-2xl p-4">
                    <div class="font-black mb-2">어려운 유형</div>
                    <table class="w-full text-sm">${errorRows}</table>
                </div>
                <div class="border rounded-2xl p-4">
                    <div class="font-black mb-2">어려운 배움</div>
                    <table class="w-full text-sm">${lessonRows}</table>
                </div>
            </div>
            <div class="mt-4 p-4 bg-gray-50 rounded-2xl">
                <div class="font-black">최근 오답 단어</div>
                <div class="text-gray-600 mt-1">${escapeHtml(formatKoreanReportList(report.recentWrongWords, '아직 없음'))}</div>
            </div>
            <div class="mt-4 p-4 bg-teal-50 rounded-2xl">
                <div class="font-black">추천 복습 배움</div>
                <div class="text-teal-700 mt-1">${escapeHtml(formatKoreanReportList(report.recommendedLessons, '아직 없음'))}</div>
            </div>
        </div>
    `);
}

initializeEmbeddedActivities();

document.getElementById('class-management-modal').addEventListener('click', (e) => {
    if (e.target.id === 'class-management-modal') closeClassManagement();
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        stopAiedueSchoolProfileSync();
        loginSuccess = false;
        currentUserId = null;
        setRpgHudVisible(false);
        return;
    }

    try {
        currentUserId = user.uid;
        startAiedueSchoolProfileSync(user.uid);
        let userRef = doc(db, 'users', user.uid);
        let userSnap = await getDoc(userRef);

        // 만약 구글 로그인 직후라 문서가 아직 없다면, 선생님으로 간주하고 생성 대기 또는 직접 생성
        if (!userSnap.exists()) {
            // 구글 로그인의 경우 이메일이 존재함. 이를 통해 선생님 계정을 자동 생성하거나 확인
            if (user.providerData.some(p => p.providerId === 'google.com')) {
                await ensureTeacherProfile(user);
                userSnap = await getDoc(userRef);
            } else {
                // 일반 로그인의 경우 문서가 없으면 오류
                showModal('사용자 정보를 찾을 수 없습니다. 다시 시도해주세요.');
                return;
            }
        }

        const userData = userSnap.data();
        updateAccountName(userData.name || user.displayName || '이름 없음');

        // 선생님인 경우 마지막 한글 배움 단계까지 열어 둔다.
        if ((userData.role || '').toLowerCase() === 'teacher' && Number(userData.currentLearningStep) !== 33) {
            await setDoc(doc(db, 'users', user.uid), { currentLearningStep: 33 }, { merge: true });
            userData.currentLearningStep = 33;
        }

        const teacherId = userData.teacherId || null;
        const classId = userData.classId || userData.classCode || null;
        await loadKoreanExperienceMultipliers(teacherId, classId);

        updateDashboardExperience(userData);
        const recoveredLiteracyPromotion = advanceLiteracyDanIfReady();
        if (recoveredLiteracyPromotion) {
            await setDoc(userRef, {
                literacyPortfolio,
                literacyDan: literacyPortfolio.dan,
                updatedAt: serverTimestamp()
            }, { merge: true });
            updateLiteracyDanBadges();
            showLiteracyPromotionNotice(recoveredLiteracyPromotion);
        }
        loginSuccess = true;
        setRpgHudVisible(true);

        // 이미 대시보드/활동 화면이라면 패스, 아니라면 요청된 활동 또는 대시보드 열기
        const visibleActivityRoute = getVisibleActivityRoute();
        if (visibleActivityRoute) {
            const route = activityRoutes[visibleActivityRoute];
            if (route && !unlockedLevels.includes(route.level)) {
                pendingActivityRoute = null;
                showDashboardOnly();
                showModal(`${route.label}은 선생님이 아직 열어주지 않았어요.`);
            } else {
                hydrateActivityRouteSection(visibleActivityRoute);
                if (pendingActivityRoute === visibleActivityRoute) pendingActivityRoute = null;
            }
        } else if (document.getElementById('dashboard-section').classList.contains('hidden')) {
            if (document.getElementById('result-modal').classList.contains('hidden')) {
                if (!openPendingActivityRoute()) openDashboard();
            } else {
                // 모달이 떠있다면 확인 버튼 클릭 시 요청된 활동 또는 대시보드로 이동하도록 설정되어 있음
            }
        } else {
            openPendingActivityRoute();
        }
    } catch (error) {
        console.error('Auth state handling error:', error);
        if (error.message !== 'teacher-account-required') {
            showModal('로그인 정보를 불러오는 중 오류가 발생했어요.');
        }
    }
});
// --- Dashboard UI Enhancements ---
let currentLevelIndex = 0;
const totalLevels = 4;

window.updateDashboardSlider = function() {
    const swiper = document.getElementById('level-swiper');
    if (!swiper) return;
    const cardWidth = 260;
    const gap = 30;
    const offset = -currentLevelIndex * (cardWidth + gap);
    swiper.style.transform = `translateX(${offset}px)`;

    // 버튼 투명도 조절
    const prevBtn = document.querySelector('button[onclick="prevLevel()"]');
    const nextBtn = document.querySelector('button[onclick="nextLevel()"]');
    if (prevBtn) prevBtn.style.opacity = currentLevelIndex === 0 ? '0.3' : '1';
    if (nextBtn) nextBtn.style.opacity = currentLevelIndex >= totalLevels - 1 ? '0.3' : '1';
};

window.toggleInfoDrawer = function() {
    ensureInfoDrawerPortal();
    const drawer = document.getElementById('info-drawer');
    const overlay = document.getElementById('drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.toggle('open');
        overlay.classList.toggle('visible');
    }
};

window.nextLevel = function() {
    if (currentLevelIndex < totalLevels - 1) {
        currentLevelIndex++;
        updateDashboardSlider();
    }
};

window.prevLevel = function() {
    if (currentLevelIndex > 0) {
        currentLevelIndex--;
        updateDashboardSlider();
        const swiper = document.getElementById('level-swiper');
        swiper.classList.remove('slide-right');
        swiper.classList.add('slide-left');
    }
};

// Settings Modal
window.openSettingsModal = function() {
    const name = document.getElementById('dashboard-account-name').innerText;
    document.getElementById('settings-name-input').value = name;
    document.getElementById('settings-mute-toggle').innerText = isMuted ? '켜기' : '끄기';
    document.getElementById('settings-modal').classList.remove('hidden');
};

window.closeSettingsModal = function() {
    document.getElementById('settings-modal').classList.add('hidden');
};

window.saveSettings = async function() {
    const newName = document.getElementById('settings-name-input').value.trim();
    if (!newName) return;

    updateAccountName(newName);
    const headerName = document.getElementById('dashboard-account-name-header');
    if (headerName) headerName.innerText = newName;
    if (currentUserId) {
        try {
            await updateDoc(doc(db, 'users', currentUserId), { name: newName });
        } catch (e) { console.error("Save settings error:", e); }
    }
    closeSettingsModal();
    showModal("설정이 저장되었습니다! ✨");
};

// Icon Modal
const userIcons = ['🐻', '🐱', '🐶', '🦊', '🐰', '🐯', '🦁', '🐸', '🐨', '🐼', '🐮', '🐷', '🦒', '🦓', '🐘', '🦄'];
window.openIconModal = function() {
    const grid = document.getElementById('icon-grid');
    grid.innerHTML = userIcons.map(icon => `
        <div class="w-20 h-20 bg-gray-50 hover:bg-yellow-100 rounded-2xl flex items-center justify-center text-4xl cursor-pointer transition-all border-2 border-transparent hover:border-yellow-400"
             onclick="selectIcon('${icon}')">
            ${icon}
        </div>
    `).join('');
    document.getElementById('icon-modal').classList.remove('hidden');
};

window.closeIconModal = function() {
    document.getElementById('icon-modal').classList.add('hidden');
};

window.selectIcon = async function(icon) {
    document.getElementById('user-icon-btn').innerText = icon;
    const headerIcon = document.getElementById('dashboard-user-icon-header');
    if (headerIcon) headerIcon.innerText = icon;
    const name = document.getElementById('dashboard-account-name')?.innerText || '이름 없음';
    const coins = document.getElementById('dashboard-coins')?.innerText || 0;
    updateSyncedActivityHeaders({ name, coins, icon });
    if (currentUserId) {
        try {
            await updateDoc(doc(db, 'users', currentUserId), { icon: icon });
        } catch (e) { console.error("Save icon error:", e); }
    }
    closeIconModal();
};

function enhanceInteractiveSemantics(root = document) {
    const clickableElements = [
        ...(root instanceof Element && root.matches('[onclick]') ? [root] : []),
        ...(root.querySelectorAll?.('[onclick]') || [])
    ];
    clickableElements.forEach((element) => {
        if (element.matches('button, a[href], input, select, textarea, summary')) return;
        if (!element.hasAttribute('role')) element.setAttribute('role', 'button');
        if (!element.hasAttribute('tabindex')) element.tabIndex = 0;
    });
    const formControls = [
        ...(root instanceof Element && root.matches('input, textarea, select') ? [root] : []),
        ...(root.querySelectorAll?.('input, textarea, select') || [])
    ];
    formControls.forEach((control) => {
        const explicitLabel = control.id && document.querySelector(`label[for="${CSS.escape(control.id)}"]`);
        if (!control.hasAttribute('aria-labelledby') && !explicitLabel && !control.hasAttribute('aria-label')) {
            const fallbackLabel = control.getAttribute('placeholder') || control.getAttribute('title');
            if (fallbackLabel) control.setAttribute('aria-label', fallbackLabel);
        }
    });
    root.querySelectorAll?.('[id$="-modal"], #result-modal').forEach((modal) => {
        if (!modal.hasAttribute('role')) modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        if (!modal.hasAttribute('aria-label') && !modal.hasAttribute('aria-labelledby')) {
            modal.setAttribute('aria-label', '대화상자');
        }
    });
}

enhanceInteractiveSemantics();

document.addEventListener('keydown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[role="button"]') : null;
    if (!target || target.matches('button, a[href]')) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    target.click();
});

const accessibilityObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
            if (node instanceof Element) enhanceInteractiveSemantics(node);
        });
    });
});
accessibilityObserver.observe(document.body, { childList: true, subtree: true });
