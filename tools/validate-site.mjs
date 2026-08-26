import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const fail = (message) => {
    throw new Error(message);
};
const assert = (condition, message) => {
    if (!condition) fail(message);
};

const requiredFiles = [
    'index.html',
    'app.js',
    'app.css',
    'style.css',
    'firebase-config.js',
    'drawing.html',
    'hangul.html',
    'dictation.html',
    'literacy.html',
    'aiedu_bgm.mp3',
    'aiedu_click.mp3',
    'aiedu_korean_logo.webp',
    'aiedu_korean_nature_bg.webp',
    'aiedu_korean_dashboard_nature_bg.webp',
    'baby_giyeok.webp',
    'mom_ah.webp'
];

requiredFiles.forEach((path) => assert(existsSync(resolve(root, path)), `필수 파일이 없습니다: ${path}`));

const index = read('index.html');
const app = read('app.js');
const appCss = read('app.css');
const styleCss = read('style.css');
const excludedFolder = `aiedue-${'ma'}${'th'}-backup`;
const excludedEntry = `${'ma'}${'th'}.html`;
const excludedBrand = `에이두 ${'수'}${'학'}`;
assert(!existsSync(resolve(root, excludedFolder)), '분리 제외 자료 폴더가 저장소 루트에 남아 있습니다.');
assert(!existsSync(resolve(root, excludedEntry)), '분리 제외 자료 진입 파일이 저장소 루트에 남아 있습니다.');

assert(/<script\s+type=["']module["']\s+src=["']app\.js(?:\?[^"']*)?["']\s*>/i.test(index), 'index.html이 app.js 모듈을 불러오지 않습니다.');
assert(/<link\s+rel=["']stylesheet["']\s+href=["']app\.css(?:\?[^"']*)?["']/i.test(index), 'index.html이 app.css를 불러오지 않습니다.');
assert(![excludedEntry, excludedBrand, excludedFolder].some((marker) => index.includes(marker)), '에이두 한글 루트 화면에 분리 제외 자료 링크/표시가 남아 있습니다.');
assert(!/<script\s+type=["']module["']\s*>/i.test(index), 'index.html에 인라인 모듈 스크립트가 다시 들어왔습니다.');
assert(/id=["']result-modal["'][^>]*z-\[1300\]/i.test(index), '상세 결과 모달이 학급 관리 모달보다 위에 표시되지 않습니다.');
assert(app.includes('from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";'), 'app.js must use Firebase Firestore directly.');
assert(app.includes('from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";'), 'app.js must use Firebase Storage directly.');
assert(app.includes("const AIEDUE_CRAFT_URL = 'https://aiedue.ddns.net/Aiedue_Craft.html';"), '에이두 크래프트가 운영 서버 주소를 사용하지 않습니다.');
assert(!app.includes('aiedue.netlify.app'), '폐기된 Netlify 크래프트 주소가 남아 있습니다.');
assert(!app.includes('from "./korean-data-adapter.js'), 'app.js must not route data through the self-hosted adapter.');
[
    'aiedueKoreanDrawingsV2',
    'persistDrawingRecord',
    'getSharedLiteracyQuestionId',
    'upsertWrongToSharedBank',
    'sanitizeModalHtml',
    'enhanceInteractiveSemantics'
].forEach((marker) => assert(app.includes(marker), `app.js 필수 기능이 없습니다: ${marker}`));

[
    'saveDrawingRecordToFirebase',
    'addWrongToSharedBank',
    'updateSharedBankWrong'
].forEach((marker) => assert(!app.includes(marker), `app.js에 제거된 저장 함수가 남아 있습니다: ${marker}`));

assert(index.includes('<small>웹 카메라 화면에서 바로 찍어요</small>'), '사진 촬영 단어 은행 안내 문구가 올바르지 않습니다.');
assert(index.includes('id="student-test-login-guide"') && index.includes('번호 입력이 없으면 학생 테스트 버튼을 눌러 주세요.'), '학생 테스트 로그인 안내 문구가 버튼 위에 없습니다.');
assert(app.includes("classList.toggle('hidden', Boolean(inputPassword))") && app.includes('function renderStudentLoginNumber()'), '로그인 번호 입력 여부에 따라 학생 테스트 안내가 전환되지 않습니다.');
assert(appCss.includes('.student-test-login-wrap') && appCss.includes('.student-test-login-guide'), '학생 테스트 안내 문구의 버튼 위 배치 스타일이 없습니다.');
const curriculumPhotoCopy = '공부하고 싶은 내용을 사진 찍고 함께 공부해요.';
assert(index.includes(curriculumPhotoCopy) && app.includes(curriculumPhotoCopy), '교과 맞춤쓰기 사진 학습 안내 문구가 올바르지 않습니다.');
assert(!index.includes('쓰기 공부하고 싶은 내용을 사진 찍고, 에이두와 같이 공부해요.') && !app.includes('쓰기 공부하고 싶은 내용을 사진 찍고, 에이두와 같이 공부해요.'), '이전 교과 맞춤쓰기 안내 문구가 남아 있습니다.');
assert(index.includes('id="word-bank-camera-modal"'), '오늘의 노트 사진 팝업이 없습니다.');
assert(index.includes('id="word-bank-camera-capture-btn"') && index.includes('onclick="captureWordBankCameraPhoto()"'), '팝업 카메라 촬영 버튼이 올바르지 않습니다.');
assert(index.includes('md:grid-cols-3 gap-6 w-full mb-4'), '교과 맞춤쓰기/문해력 하단 카드 3칸 레이아웃이 없습니다.');
assert(!index.includes('[연장]') && !app.includes('[연장]'), '그림 미션에 제거된 연장 표기가 남아 있습니다.');
assert(index.indexOf('id="drawing-new-template-btn"') < index.indexOf('id="drawing-eraser-btn"'), '새로운 그림 버튼이 지우개 버튼 위에 있지 않습니다.');
assert(app.includes("drawingMissionPool.filter((template) => template.key !== previousTemplate)"), '새로운 그림이 현재 도안을 제외하지 않습니다.');
const oldBankLabel = `국어 ${'은'}행`;
assert(!index.includes(oldBankLabel) && !app.includes(oldBankLabel), '이전 은행 용어가 남아 있습니다.');
assert(app.includes('openDictationBankCamera = function openDictationBankCamera(options = {})') && app.includes('word-bank-camera-modal'), '오늘의 노트 사진이 팝업 카메라를 열지 않습니다.');
assert(app.includes("setWordBankCameraStatus('로딩중~', true)") && app.includes("setWordBankCameraStatus('OCR+AI 분석중~~', true)"), '사진 촬영 단계별 로딩 문구가 없습니다.');
assert(app.includes('사람 이름, 학생 이름, 교사 이름'), '단어 선별 프롬프트에서 이름 제외 규칙이 없습니다.');
assert(index.includes('class="rpg-profile-portrait" onclick="toggleRpgHudPanel(this)" aria-label="메뉴 펼치기"'), '곰 얼굴이 메뉴 펼치기 기능과 연결되지 않았습니다.');
assert(index.includes('onclick="openDashboard()" aria-label="홈으로 이동"') && index.includes('<span>홈</span>'), '상태창 홈 버튼이 올바르지 않습니다.');
assert(app.includes('window.toggleRpgHudPanel = function toggleRpgHudPanel(button)') && app.includes("hud.classList.toggle('rpg-collapsed')"), '상태창 접기·펼치기 로직이 없습니다.');
assert(index.includes('class="rpg-profile-copy" onclick="toggleInfoDrawer()"'), '하단 프로필 정보 영역이 회원 정보창을 열지 않습니다.');
assert(index.includes('id="drawing-workspace-back-btn"') && index.includes('aria-label="그리기 활동을 닫고 이전 화면으로 이동"'), '그리기 활동의 뒤로 가기 버튼이 없습니다.');
assert(index.indexOf('id="drawing-workspace-back-btn"') < index.indexOf('id="drawing-canvas"'), '그리기 뒤로 가기 버튼이 왼쪽 도구 영역에 배치되지 않았습니다.');
assert(app.includes("backButton.classList.remove('hidden')"), '도형 미션에서 뒤로 가기 버튼이 표시되지 않습니다.');
assert(appCss.includes('.drawing-tool-sidebar') && appCss.includes('margin-top: auto !important;') && appCss.includes('min-height: 52px;'), '그리기 뒤로 가기 버튼이 연두색 도구 영역 하단에 배치되지 않았습니다.');
assert(app.includes("if (!control.classList.contains('learning-activity-reviewed'))"), '활동 완료 표시가 같은 class를 반복 기록해 화면을 멈출 수 있습니다.');
assert(app.includes('new MutationObserver(scheduleCheck)') && !app.includes('new MutationObserver(check)'), '활동 완료 감시가 프레임당 한 번으로 제한되지 않았습니다.');
assert(app.includes('let audioUnlockElement = null;') && app.includes('audioUnlockElement.play()'), '애니메이션 음성용 오디오 잠금 해제 장치가 없습니다.');
assert(!app.includes('globalTtsAudio.src = "data:audio/wav;base64'), '오디오 잠금 해제가 실제 TTS 재생 객체와 다시 충돌합니다.');
assert(appCss.includes('background-color: #dafae9 !important;') && appCss.includes('border-color: #54c7a2 !important;'), '눌러 본 활동 버튼의 완료 음영이 밝은 민트색이 아닙니다.');

const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert(start >= 0 && end > start, `검증 구간을 찾지 못했습니다: ${startMarker}`);
    return source.slice(start, end);
};
const mouthQuizNext = section(app, 'window.nextLessonMouthSoundQuiz = function(step)', 'window.selectLessonMouthSoundAnswer = async function');
assert(mouthQuizNext.includes('window.playLessonMouthQuizSound(step);'), '입 모양 퀴즈의 다음 문제가 자동으로 소리와 애니메이션을 재생하지 않습니다.');
assert(!mouthQuizNext.includes('window.lessonMouthQuizPlayed[step] = false'), '입 모양 퀴즈의 다음 문제가 직전 소리를 다시 고를 수 있습니다.');
assert(app.includes('onclick="playLessonMouthCard(event, ${step}, \'${item.char}\')"') && app.includes('window.playLessonMouthCard = function playLessonMouthCard'), '입 모양 카드 전체에 소리 재생 기능이 연결되지 않았습니다.');
assert(app.includes("event.target?.closest?.('button')") && app.includes("event.key !== 'Enter' && event.key !== ' '"), '입 모양 카드의 중복 클릭 방지 또는 키보드 재생 처리가 없습니다.');
const combinationRenderer = section(app, 'function renderCardContent(card)', 'function renderVowelOriginScene');
assert(combinationRenderer.includes('const comboData = JSON.stringify([combos[index]])') && combinationRenderer.includes('return `<div class="combine-card-list">${cards}</div>`'), '글자 결합 예시가 한 줄씩 독립된 영역으로 분리되지 않습니다.');
assert(appCss.includes('.combine-card-list') && appCss.includes('flex-direction: column;'), '글자 결합 카드가 한 줄씩 세로 배치되지 않습니다.');
assert(app.includes("if (/소리|듣기|🔊/.test(label)) return '여기를 눌러 보세요.';"), '소리 듣기 활동의 안내 문구가 간단한 표현으로 변경되지 않았습니다.');
assert(!app.includes('소리 듣기 버튼을 눌러 보세요.'), '이전 소리 듣기 안내 문구가 남아 있습니다.');
assert(app.includes('function learningDetailHasAnswerChoices(root)') && app.includes('if (learningDetailHasAnswerChoices(root)) return [];'), '정답 선택형 학습에서 안내 말풍선이 차단되지 않습니다.');
assert(app.includes("root.querySelector('[class*=\"choice\"], [role=\"radiogroup\"], input[type=\"radio\"]')"), '선택지 영역을 공통 판별하는 안내 차단 조건이 없습니다.');
assert(app.includes('learningDetailActivityGuideTarget || learningDetailActivityGuideTimer') && app.includes("window.matchMedia?.('(pointer: coarse)').matches ? 2200 : 4200"), '태블릿에서 안내 타이머가 반복 초기화되거나 지나치게 늦게 표시될 수 있습니다.');
assert(app.includes("if (sectionId !== 'learning-detail-section')") && app.includes('resetLearningDetailNavigationGuide();'), '학습 화면을 벗어날 때 안내 말풍선이 정리되지 않습니다.');
assert(app.includes('!target.isConnected || !section || section.classList.contains(\'hidden\') || !section.contains(target)'), '화면 전환 후 지연된 안내 말풍선이 다시 표시될 수 있습니다.');
assert(index.includes('class="my-korean-logo-link pointer-events-auto cursor-pointer"') && index.includes('class="my-korean-profile-banner pointer-events-auto'), '나의 한글 상단 영역의 로고 또는 프로필 구분 클래스가 없습니다.');
assert(appCss.includes('grid-template-columns:180px minmax(0,1fr)') && appCss.includes('.my-korean-unit-bar {position:static;'), 'PC 나의 한글 상단 로고와 단원 메뉴가 독립된 그리드 영역으로 배치되지 않습니다.');
assert(appCss.includes('.my-korean-profile-banner {display:none !important;}') && appCss.includes('overflow:hidden;'), '단원 메뉴가 비어 있는 오른쪽 공간을 모두 사용하지 못합니다.');
assert(appCss.includes('.my-korean-unit-tab {flex:1 1 0;') && appCss.includes('flex-wrap:wrap;overflow:visible;'), '단원 탭이 PC와 모바일에서 스크롤 없이 배치되지 않습니다.');
assert(appCss.includes('#my-korean-section .stitched {margin-top:calc(10rem - 1cm) !important;}'), '단원 메뉴와 내용 사이의 간격이 1cm 줄어들지 않았습니다.');
assert(app.includes("'ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ'") && app.includes("horizontalVowels.includes(tile.vowel) ? 'horizontal' : 'vertical'"), '복합 모음 쓰기 칸이 초성 아래에 배치되지 않습니다.');
assert(app.includes("completeEmbeddedWriting('word', { autoAdvance: true })") && app.includes("completeEmbeddedWriting('sentence', { autoAdvance: true })"), '2단계 낱말·문장 쓰기가 완료 후 자동 전환되지 않습니다.');
assert(app.includes('canvas.dataset.promptVersion = String(Number(canvas.dataset.promptVersion || 0) + 1)') && app.includes('if (targetCanvas.dataset.promptVersion === promptVersion)'), '자동 전환과 비동기 저장의 문제 구분 처리가 없습니다.');
assert(app.includes('function getUnit9WordWritingGuide(word)') && app.includes("letters.length === 1 ? `${word}/${word}` : letters.join('/')"), '겹받침 낱말 쓰기가 글자 수에 맞게 칸을 나누지 않습니다.');
assert(app.includes('data-guide="${getUnit9WordWritingGuide(word)}"') && !app.includes('data-guide="${word}/${word}"'), '두 글자 이상인 겹받침 낱말이 한 칸에 통째로 반복됩니다.');
assert(app.includes("([가-힣ㄱ-ㅎㅏ-ㅣ●ㆍ])\\s*\\+\\s*([가-힣ㄱ-ㅎㅏ-ㅣ●ㆍ])\\s*[→=]\\s*([가-힣ㄱ-ㅎㅏ-ㅣ●ㆍ])"), '글자 결합 결과 뒤의 조사가 결과 글자에 포함될 수 있습니다.');
assert(!app.includes("return hasListenChoiceQuiz ? [quizListenButton] : controls"), '선택형 문제에서 소리 듣기 안내가 다시 표시될 수 있습니다.');
const modalSafety = section(app, 'const SAFE_MODAL_ACTIONS', 'function sanitizeModalHtml');
const modalSafetyApi = new Function(`${modalSafety}\nreturn { isSafeModalAction };`)();
assert(modalSafetyApi.isSafeModalAction('enterAiedueCraftAsTeacher()'), '교사 상점의 크래프트 접속 동작이 팝업 안전 처리 과정에서 제거됩니다.');
const teacherLiteracyProgress = section(app, 'function buildTeacherLiteracyProgressBody', 'window.openStudentProgressDetail');
['easy', 'normal', 'hard', 'expert', 'multipleChoice', 'shortAnswer', 'essay', '현재 문해력 단'].forEach((marker) => {
    assert(teacherLiteracyProgress.includes(marker), `교사용 문해력 진도 표에 필수 항목이 없습니다: ${marker}`);
});
const occurrenceCount = (source, marker) => source.split(marker).length - 1;
const teacherLiteracyProgressApi = new Function('asNumber', 'escapeHtml', `${teacherLiteracyProgress}\nreturn buildTeacherLiteracyProgressBody;`)(
    (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback,
    (value) => String(value)
);
const teacherLiteracyProgressHtml = teacherLiteracyProgressApi({
    literacyDan: 2,
    literacyPortfolio: {
        dan: 5,
        stats: {
            'easy-multipleChoice': { attempts: 4, corrects: 3, wrongs: 1 },
            'expert-essay': { attempts: 2, corrects: 1, wrongs: 1 }
        },
        history: []
    }
});
assert(teacherLiteracyProgressHtml.includes('5단'), '교사용 문해력 진도 표에 현재 단이 표시되지 않습니다.');
assert(teacherLiteracyProgressHtml.includes('75%') && teacherLiteracyProgressHtml.includes('50%'), '교사용 문해력 진도 표의 정답률 계산이 올바르지 않습니다.');
assert(occurrenceCount(teacherLiteracyProgressHtml, 'text-xl font-black text-blue-700') === 12, '교사용 문해력 진도 표가 4개 난이도 × 3개 유형을 모두 표시하지 않습니다.');
const drawingHelpers = section(app, 'function normalizeDrawingPortfolioForPersistence', 'function applyCommittedDrawingState');
const drawingSharedRecord = section(app, 'function buildSharedDrawingGalleryRecord', 'async function persistDrawingRecord');
const drawingPersist = section(app, 'async function persistDrawingRecord', 'function normalizeFirebaseDrawingDoc');
const drawingGalleryLoad = section(app, 'async function loadFriendsDrawingsFromFirebase', 'window.saveCurrentDrawing');
const drawingSave = section(app, 'window.saveCurrentDrawing', 'function showAiedueAutoToast');
const drawingComplete = section(app, 'window.completeTodayDrawingMission', 'window.openFriendsDrawingGallery');
const literacyId = section(app, 'const SHARED_LITERACY_COLLECTION', 'function writeWrongToSharedBankTransaction');
const sharedBankWrites = section(app, 'function writeWrongToSharedBankTransaction', 'async function getSharedBankProblems');
const sharedBankLoad = section(app, 'async function getSharedBankProblems', 'window.openLiteracyLimitBreak');
const limitBreakFlow = section(app, 'window.openLiteracyLimitBreak', 'window.openTodayLiteracyMission');
const literacyPrompt = section(app, 'function generateLiteracyPrompt', 'function parseAiQuestionResponse');
const literacyAttemptMerge = section(app, 'function createLiteracyAttemptPayload', 'async function persistLiteracyAttemptAtomic');
const literacyScoreHelper = section(app, 'function normalizeLiteracyScore', 'function createLiteracyAttemptPayload');
const literacyAtomicPersist = section(app, 'async function persistLiteracyAttemptAtomic', 'function applyCommittedLiteracyAttempt');
const literacyResult = section(app, 'async function showLiteracyResult', 'window.claimLiteracyWrongReviewReward');
const literacyReviewClaim = section(app, 'window.claimLiteracyWrongReviewReward', 'window.openMyLiteracyRecord');

assert(drawingPersist.includes('runTransaction'), '그림 저장이 Firestore 트랜잭션을 사용하지 않습니다.');
assert(drawingPersist.includes('transaction.get(recordRef)') && drawingPersist.indexOf('transaction.get(recordRef)') < drawingPersist.indexOf('transaction.get(userRef)'), '친구들 그림과 사용자 문서를 쓰기 전에 모두 읽지 않습니다.');
assert(drawingPersist.includes('transaction.get(userRef)'), '그림 저장이 서버의 최신 사용자 문서를 먼저 읽지 않습니다.');
assert(drawingPersist.includes('transaction.set(recordRef'), '친구들 그림 문서가 트랜잭션에 없습니다.');
assert(drawingPersist.includes('transaction.set(userRef'), '사용자 그림 문서가 트랜잭션에 없습니다.');
assert(drawingPersist.includes('item?.drawingId !== recordRef.id'), '사용자 포트폴리오에서 동일 drawingId 중복을 제거하지 않습니다.');
assert(drawingPersist.includes('newDrawingReward') && drawingPersist.includes('isNewRecord'), '동시 저장 시 보상 중복 방지 계산이 없습니다.');
assert(drawingPersist.includes('const shouldGrantExperience = isNewRecord && (!missionStepKey || !existingMission);'), '동일 미션 재완료 시 경험치/레벨업 중복 보상이 차단되지 않습니다.');
assert(drawingPersist.includes('mergeDrawingShapeStats(serverPortfolio.shapeStats'), '서버 최신 도형 통계 병합이 없습니다.');
assert(drawingPersist.includes('compressDrawingImage(record.image, 120)') && drawingPersist.includes('fitDrawingPortfolioToFirestore({'), '사용자 그림 문서에 소형 썸네일/용량 예산이 적용되지 않습니다.');
assert(drawingPersist.includes('buildSharedDrawingGalleryRecord('), '친구들 그림이 공개 필드 전용 payload를 사용하지 않습니다.');
assert(drawingGalleryLoad.includes('query(collectionRef, queryLimit(80))'), '친구들 그림이 로그인 사용자의 공유 작품 전체를 조회하지 않습니다.');
assert(drawingGalleryLoad.indexOf('query(collectionRef, queryLimit(80))') < drawingGalleryLoad.indexOf("where('userId', '==', currentUserId)"), '친구들 그림 전체 조회보다 본인 fallback이 먼저 실행됩니다.');
assert(drawingPersist.includes('const serverClassId = String(userData.teacherId') && /buildSharedDrawingGalleryRecord\([\s\S]*?serverClassId\s*\)/.test(drawingPersist), '친구들 그림 학급 키가 트랜잭션에서 읽은 최신 사용자 문서를 사용하지 않습니다.');
['email', 'shapeAccuracy', 'coins', 'balance', 'aeduTokens', 'warningTokens', 'userCode', 'role', 'teacherId', 'classCode', 'className'].forEach((field) => {
    assert(!drawingSharedRecord.includes(`${field}:`), `친구들 그림 공유 payload에 개인/불필요 필드가 포함됐습니다: ${field}`);
});
assert(drawingSharedRecord.includes('if (classId) sharedRecord.classId = classId;'), '친구들 그림의 최소 학급 구분 키가 없습니다.');
assert(drawingPersist.includes('transaction.set(recordRef, firebaseRecord);') && !drawingPersist.includes('transaction.set(recordRef, firebaseRecord, { merge: true })'), '기존 친구들 그림의 비공개 필드를 제거하는 전체 교체 저장이 아닙니다.');
assert(occurrenceCount(drawingSave, 'persistDrawingRecord(') === 1, '저장하기가 공통 그림 저장 함수를 정확히 한 번 호출하지 않습니다.');
assert(occurrenceCount(drawingComplete, 'persistDrawingRecord(') === 1, '완료하기가 공통 그림 저장 함수를 정확히 한 번 호출하지 않습니다.');
assert(!drawingSave.includes('addDrawingRecordToPortfolioGallery('), '저장하기에 중복 포트폴리오 저장이 남아 있습니다.');
assert(!drawingComplete.includes('addDrawingRecordToPortfolioGallery('), '완료하기에 중복 포트폴리오 저장이 남아 있습니다.');
assert(drawingComplete.includes('drawingPersisted = true;') && drawingComplete.includes('completionSnapshot'), '완료 실패 시 진행/보상 복구 장치가 없습니다.');
assert(!drawingComplete.includes('applyAieduePointReward(') && !drawingComplete.includes('applyAiedueExperienceReward('), '완료 보상이 트랜잭션 전에 로컬 확정됩니다.');
assert(literacyId.includes("'sharedLiteracyWrongBankV2'") && !literacyId.includes("'sharedLiteracyWrongBank'"), '앱이 비정규 V1 컬렉션 대신 검증된 V2 공용 오답 컬렉션을 사용하지 않습니다.');
assert(literacyId.includes("digest('SHA-256'") && literacyId.includes('SHARED_LITERACY_DOC_ID'), '공용 오답 문서 ID가 SHA-256/Firestore 원본 ID 표식을 사용하지 않습니다.');
assert(!literacyId.includes('questionData?.id'), 'AI가 제공한 일반 id 필드가 공용 오답 문서 ID로 사용됩니다.');
assert(sharedBankLoad.includes('{ ...doc.data(), id: doc.id }') && sharedBankLoad.includes('Object.defineProperty(question, SHARED_LITERACY_DOC_ID'), '실제 Firestore 문서 ID가 우선 보존되지 않습니다.');
assert(literacyId.includes("['passage', 'question', 'difficulty', 'type', 'answer', 'sampleAnswer', 'explanation']"), '공용 오답 저장의 공개 필드 허용목록이 없습니다.');
assert(literacyId.includes('function buildSharedLiteracyPublicQuestion'), '공용 오답 문서 공개 필드 정규화 함수가 없습니다.');
assert(sharedBankWrites.includes('...buildSharedLiteracyPublicQuestion(questionData)') && !sharedBankWrites.includes('...questionData'), '신규 공용 오답 저장이 공개 필드 허용목록을 사용하지 않습니다.');
['userAnswer', 'userId', 'pendingReviewRewardId', 'reviewRewardClaimed'].forEach((field) => {
    assert(!sharedBankWrites.includes(field), `공용 오답 저장에 개인/임시 필드가 포함됐습니다: ${field}`);
});
assert(sharedBankWrites.includes('transaction.update(docRef') && sharedBankWrites.includes('transaction.delete(docRef)'), '공용 카운터 갱신/졸업 처리가 트랜잭션 쓰기가 아닙니다.');
assert(sharedBankWrites.includes('return false;'), '독립 공용 은행 저장 함수가 실패 여부를 호출자에게 반환하지 않습니다.');
assert(sharedBankLoad.includes('queryLimit(200)'), '한계돌파 공용 오답 조회 개수 제한이 없습니다.');
assert(!sharedBankLoad.includes('currentUserId') && !sharedBankLoad.includes("where('userId'"), '한계돌파 조회가 현재 학생이 아닌 다른 학생의 오답을 제외합니다.');
assert(limitBreakFlow.includes('setupLiteracyWorkspace(randomQuestion, true)'), '다른 학생의 공용 오답이 한계돌파 풀이 화면으로 전달되지 않습니다.');
const essaySubmit = section(app, 'window.submitLiteracyEssayAnswer', 'function cloneLiteracyValue');
assert(essaySubmit.indexOf('userLiteracyAnswerChecked = true;') < essaySubmit.indexOf('callKoreanAiGenerate'), '서술형 AI 채점 요청 전에 중복 제출 잠금이 설정되지 않습니다.');
assert(essaySubmit.includes('await showLiteracyResult') && essaySubmit.includes('userLiteracyAnswerChecked = false;'), '서술형 결과 저장 대기 또는 채점 실패 시 제출 잠금 해제가 없습니다.');
assert(essaySubmit.includes('학생에게 제공된 핵심어') && essaySubmit.includes('답이 짧다는 이유만으로 감점하지 마세요'), '서술형 채점이 공개 핵심어 및 easy/normal 한 문장 기준을 사용하지 않습니다.');
assert(literacyPrompt.includes('학생이 쉬운 낱말을 사용한 한 문장') && literacyPrompt.includes('학생이 근거 하나를 담은 한 문장'), 'easy/normal 서술형이 한 문장 저난도 답변으로 제한되지 않습니다.');
assert(literacyPrompt.includes('"keywords": ["핵심어1"') && literacyPrompt.includes('모든 난이도에서 학생에게 미리 보여 줄 핵심어'), '모든 서술형 난이도에서 핵심어 생성을 요구하지 않습니다.');
assert(index.includes('id="literacy-keywords-container"'), '서술형 핵심어 표시 영역이 없습니다.');
assert(literacyAttemptMerge.includes('serverData.literacyPortfolio ?? fallback.literacyPortfolio') && literacyAttemptMerge.includes('advanceLiteracyDanIfReady(portfolio)'), '사용자 최신 문해력 기록에 이번 답안 변화량을 병합하지 않습니다.');
assert(literacyAttemptMerge.includes('serverData.coins') && literacyAttemptMerge.includes('serverData.aeduExperience'), '트랜잭션에서 최신 서버 보상 상태를 기준으로 계산하지 않습니다.');
const literacyScoreApi = new Function(`${literacyScoreHelper}\nreturn { normalizeLiteracyScore };`)();
assert(literacyScoreApi.normalizeLiteracyScore(null) === null && literacyScoreApi.normalizeLiteracyScore(undefined) === null && literacyScoreApi.normalizeLiteracyScore('') === null, '점수 없는 객관식/단답형이 AI 0점으로 변환됩니다.');
assert(literacyScoreApi.normalizeLiteracyScore(0) === 0 && literacyScoreApi.normalizeLiteracyScore('85') === 85, '실제 AI 채점 점수가 보존되지 않습니다.');
assert(literacyAtomicPersist.includes('runTransaction') && literacyAtomicPersist.includes('writeWrongToSharedBankTransaction') && literacyAtomicPersist.includes('writeCorrectToSharedBankTransaction'), '공용 오답 카운터가 사용자 기록과 같은 트랜잭션에서 처리되지 않습니다.');
assert(literacyAtomicPersist.includes('transaction.get(userRef)') && literacyAtomicPersist.indexOf('transaction.get(userRef)') < literacyAtomicPersist.indexOf('transaction.set(userRef'), '최신 사용자 문서를 모든 쓰기 전에 읽지 않습니다.');
assert(literacyAtomicPersist.includes('const sharedSnap = sharedRef ? await transaction.get(sharedRef) : null;') && literacyAtomicPersist.indexOf('transaction.get(sharedRef)') < literacyAtomicPersist.indexOf('transaction.get(userRef)'), '공용 문서와 사용자 문서를 쓰기 전에 함께 읽지 않습니다.');
assert(literacyAtomicPersist.includes('transaction.set(userRef') && !literacyAtomicPersist.includes('activeLiteracyQuestion') && !literacyAtomicPersist.includes('isLiteracyLimitBreakMode'), '원자적 저장이 사용자 문서에 없거나 재시도 중 변경 가능한 전역 상태를 참조합니다.');
assert(!literacyResult.includes('applyAieduePointReward(') && !literacyResult.includes('applyAiedueExperienceReward('), '트랜잭션 전에 로컬 보상 상태를 확정합니다.');
assert(literacyResult.includes('attempt = createLiteracyAttemptPayload') && literacyResult.includes('await persistLiteracyAttemptAtomic(attempt)') && literacyResult.includes('userLiteracyAnswerChecked = false;'), '불변 답안 payload 원자 저장 또는 안전한 재시도 잠금 해제가 없습니다.');
assert(literacyResult.includes('score: normalizeLiteracyScore(details.score)'), '0점 또는 무점수 값이 결과 화면 payload에서 손실됩니다.');
assert(literacyResult.includes("console.error('문해력 결과 저장 후 화면 갱신 실패'") && literacyResult.includes('결과 저장은 완료했지만 화면 갱신 중 오류'), '커밋 후 UI 오류를 저장 실패와 분리하지 않습니다.');
assert(literacyAtomicPersist.includes("'literacyAttemptReceipts'") && literacyAtomicPersist.includes("'literacyReviewReceipts'"), '답안/복습 보상의 영구 중복 방지 영수증이 없습니다.');
assert(literacyAtomicPersist.includes('transaction.get(receiptRef)') && literacyAtomicPersist.includes('transaction.set(receiptRef'), '답안/복습 영수증을 보상과 같은 트랜잭션에서 읽고 쓰지 않습니다.');
assert(literacyAtomicPersist.includes('isCorrect: attempt.isCorrect') && literacyAtomicPersist.includes('userAnswerText: attempt.userAnswerText') && literacyAtomicPersist.includes('canonicalAttempt'), '답안 영수증이 최초 채점 결과를 보존하거나 중복 응답에 반환하지 않습니다.');
assert(!literacyAtomicPersist.includes('literacyProcessedAttemptIds') && !literacyAtomicPersist.includes('literacyProcessedReviewRewardIds'), '최근 100개 배열 기반 중복 방지가 남아 있습니다.');
assert(literacyResult.includes('const renderedAttempt = committed.canonicalAttempt || attempt;') && literacyResult.includes('const claimId = `review-${renderedAttempt.attemptId}`;'), '중복 답안 화면/복습 보상이 최초 저장된 답안 결과를 사용하지 않습니다.');
assert(literacyReviewClaim.includes('await persistLiteracyReviewRewardAtomic') && literacyReviewClaim.includes('reviewRewardClaimed = false'), '복습 경험치 저장 대기 또는 실패 후 재시도 복구가 없습니다.');
assert(!literacyReviewClaim.includes('persistLiteracyData()') && !literacyReviewClaim.includes('applyAiedueExperienceReward('), '복습 경험치가 최신 서버값 트랜잭션 밖에서 저장됩니다.');

const drawingHelperApi = new Function(`${drawingHelpers}\nreturn { fitDrawingPortfolioToFirestore, mergeDrawingShapeStats };`)();
const oversizedPortfolio = {
    missions: Object.fromEntries(Array.from({ length: 5 }, (_, index) => [String(index + 1), { drawingId: `drawing-${index}`, image: 'm'.repeat(600), savedAt: `2026-01-0${index + 1}` }])),
    free: Array.from({ length: 10 }, (_, index) => ({ drawingId: `drawing-${index}`, image: 'f'.repeat(600), savedAt: `2026-02-${String(index + 1).padStart(2, '0')}` })),
    unlockedTemplates: ['circle'],
    rewardedMilestones: ['drawing-5x-1'],
    shapeStats: {},
    unpaidCooldownUntil: 0
};
const fittedPortfolio = drawingHelperApi.fitDrawingPortfolioToFirestore(oversizedPortfolio, 2200);
assert(JSON.stringify(fittedPortfolio).length <= 2200, '사용자 그림 포트폴리오가 지정한 직렬화 용량 예산을 넘습니다.');
assert(Object.keys(fittedPortfolio.missions).length === 5, '용량 축소 중 미션 진행 메타데이터가 삭제됐습니다.');
assert(fittedPortfolio.free.length >= 1 && new Set(fittedPortfolio.free.map((item) => item.drawingId)).size === fittedPortfolio.free.length, '용량 축소 중 최신 그림 또는 drawingId 유일성이 깨졌습니다.');
const mergedShapeStats = drawingHelperApi.mergeDrawingShapeStats(
    { circle: { attempts: 2, accuracySum: 100, bestAccuracy: 60, pointsHit: 4, pointsTotal: 10, instanceCount: 2 } },
    { byShape: { circle: { accuracySum: 80, instanceCount: 1, hit: 8, total: 10 } } },
    '2026-01-01T00:00:00.000Z'
);
assert(mergedShapeStats.circle.attempts === 3 && mergedShapeStats.circle.accuracySum === 180 && mergedShapeStats.circle.accuracy === 60 && mergedShapeStats.circle.bestAccuracy === 80, '서버 도형 통계 변화량 병합 결과가 올바르지 않습니다.');

const literacyIdApi = new Function(`${literacyId}\nreturn { SHARED_LITERACY_DOC_ID, getSharedLiteracyQuestionId, buildSharedLiteracyPublicQuestion };`)();
const generatedId = await literacyIdApi.getSharedLiteracyQuestionId({ id: 'ai-controlled-id', passage: '가', question: '나' });
assert(/^q2_[0-9a-f]{64}$/.test(generatedId), 'AI 일반 id가 SHA-256 문서 ID 생성을 우회했습니다.');
const loadedQuestion = { id: 'stored-field-id', passage: '가', question: '나' };
loadedQuestion[literacyIdApi.SHARED_LITERACY_DOC_ID] = 'actual-firestore-id';
assert(await literacyIdApi.getSharedLiteracyQuestionId(loadedQuestion) === 'actual-firestore-id', '실제 Firestore 문서 ID 표식이 재사용되지 않습니다.');
const normalizedLegacyQuestion = literacyIdApi.buildSharedLiteracyPublicQuestion({
    passage: '기존 지문', question: '기존 질문', difficulty: 'easy', type: 'essay',
    literacyDan: 3, pendingReviewRewardId: 'private', id: 'legacy-id'
}, { sampleAnswer: '모범 답안', explanation: '해설' });
assert(normalizedLegacyQuestion.sampleAnswer === '모범 답안' && normalizedLegacyQuestion.explanation === '해설', '기존 공용 오답 문서 정규화 때 누락된 공개 필드가 보충되지 않습니다.');
assert(!('literacyDan' in normalizedLegacyQuestion) && !('pendingReviewRewardId' in normalizedLegacyQuestion) && !('id' in normalizedLegacyQuestion), '기존 공용 오답 문서 정규화 뒤 비공개/임시 필드가 남습니다.');
assert(Array.isArray(normalizedLegacyQuestion.keywords) && normalizedLegacyQuestion.keywords.length > 0, '기존 서술형 문제의 예시답안에서 핵심어를 보충하지 못합니다.');

[
    'anti-db/db-api',
    'korean-db/db-api',
    'school-firestore-adapter',
    'localStorage',
    'sessionStorage'
].forEach((marker) => assert(!app.includes(marker), `app.js에 사용 중단한 저장 경로가 있습니다: ${marker}`));

['.skip-link', ':focus-visible', 'prefers-reduced-motion', 'forced-colors'].forEach((marker) => {
    assert(appCss.includes(marker), `app.css 접근성 스타일이 없습니다: ${marker}`);
});

const localReferencePattern = /\b(?:src|href)=["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const checkedReferences = new Set();
for (const [sourcePath, source] of [['index.html', index], ['app.css', appCss], ['style.css', styleCss]]) {
    for (const match of source.matchAll(localReferencePattern)) {
        const raw = (match[1] || match[2] || '').trim();
        if (!raw || /^(?:[a-z]+:|\/\/|#|data:)/i.test(raw)) continue;
        const withoutSuffix = raw.split(/[?#]/, 1)[0];
        const target = resolve(root, dirname(sourcePath), withoutSuffix);
        const targetRelative = relative(root, target);
        assert(targetRelative === '' || (!targetRelative.startsWith('..') && !isAbsolute(targetRelative)), `저장소 밖을 가리키는 참조입니다: ${raw}`);
        assert(existsSync(target) && statSync(target).isFile(), `${sourcePath}의 참조 파일이 없습니다: ${raw}`);
        checkedReferences.add(targetRelative);
    }
}

const forbiddenNames = [
    /^aidu$/,
    /평가문장/i,
    /^pptx_output/i,
    /^out_utf8\.txt$/i,
    /^all_slides\.txt$/i,
    /^mattress_comparison\.html$/i,
    /^school-firestore-adapter\.js$/i
];

readdirSync(root).forEach((name) => {
    assert(!forbiddenNames.some((pattern) => pattern.test(name)), `배포 루트에 제외 대상이 있습니다: ${name}`);
});

const oldRasterReferences = [...checkedReferences].filter((path) => ['.png', '.jpg', '.jpeg'].includes(extname(path).toLowerCase()));
assert(oldRasterReferences.length === 0, `최적화되지 않은 로컬 래스터 참조가 있습니다: ${oldRasterReferences.join(', ')}`);

console.log(`사이트 검증 완료: 필수 파일 ${requiredFiles.length}개, 로컬 참조 ${checkedReferences.size}개`);
