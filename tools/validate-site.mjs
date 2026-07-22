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

assert(/<script\s+type=["']module["']\s+src=["']app\.js(?:\?[^"']*)?["']\s*>/i.test(index), 'index.html이 app.js 모듈을 불러오지 않습니다.');
assert(/<link\s+rel=["']stylesheet["']\s+href=["']app\.css(?:\?[^"']*)?["']/i.test(index), 'index.html이 app.css를 불러오지 않습니다.');
assert(!/<script\s+type=["']module["']\s*>/i.test(index), 'index.html에 인라인 모듈 스크립트가 다시 들어왔습니다.');
assert(/id=["']result-modal["'][^>]*z-\[1300\]/i.test(index), '상세 결과 모달이 학급 관리 모달보다 위에 표시되지 않습니다.');
assert(app.includes('from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";'), 'app.js must use Firebase Firestore directly.');
assert(app.includes('from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";'), 'app.js must use Firebase Storage directly.');
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

assert(index.includes('<small>단어 은행에 단어를 모아봐요</small>'), '사진 촬영 단어 은행 안내 문구가 올바르지 않습니다.');
assert(index.includes('class="rpg-profile-portrait" onclick="openIconModal()" aria-label="프로필 아이콘 변경"'), '하단 프로필 아이콘이 아이콘 변경창을 열지 않습니다.');
assert(index.includes('class="rpg-profile-copy" onclick="toggleInfoDrawer()"'), '하단 프로필 정보 영역이 회원 정보창을 열지 않습니다.');

const section = (source, startMarker, endMarker) => {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    assert(start >= 0 && end > start, `검증 구간을 찾지 못했습니다: ${startMarker}`);
    return source.slice(start, end);
};
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
const drawingSave = section(app, 'window.saveCurrentDrawing', 'function showAiedueAutoToast');
const drawingComplete = section(app, 'window.completeTodayDrawingMission', 'window.openFriendsDrawingGallery');
const literacyId = section(app, 'const SHARED_LITERACY_COLLECTION', 'function writeWrongToSharedBankTransaction');
const sharedBankWrites = section(app, 'function writeWrongToSharedBankTransaction', 'async function getSharedBankProblems');
const sharedBankLoad = section(app, 'async function getSharedBankProblems', 'window.openLiteracyLimitBreak');
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
