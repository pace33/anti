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

[
    'aiedueKoreanDrawings',
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
const occurrenceCount = (source, marker) => source.split(marker).length - 1;
const drawingHelpers = section(app, 'function normalizeDrawingPortfolioForPersistence', 'function applyCommittedDrawingState');
const drawingPersist = section(app, 'async function persistDrawingRecord', 'function normalizeFirebaseDrawingDoc');
const drawingSave = section(app, 'window.saveCurrentDrawing', 'function showAiedueAutoToast');
const drawingComplete = section(app, 'window.completeTodayDrawingMission', 'window.openFriendsDrawingGallery');
const literacyId = section(app, 'const SHARED_LITERACY_DOC_ID', 'async function upsertWrongToSharedBank');
const wrongUpsert = section(app, 'async function upsertWrongToSharedBank', 'async function updateSharedBankCorrect');
const correctUpdate = section(app, 'async function updateSharedBankCorrect', 'async function getSharedBankProblems');
const sharedBankLoad = section(app, 'async function getSharedBankProblems', 'window.openLiteracyLimitBreak');
const literacyResult = section(app, 'async function showLiteracyResult', 'window.claimLiteracyWrongReviewReward');

assert(drawingPersist.includes('runTransaction'), '그림 저장이 Firestore 트랜잭션을 사용하지 않습니다.');
assert(drawingPersist.includes('transaction.get(userRef)'), '그림 저장이 서버의 최신 사용자 문서를 먼저 읽지 않습니다.');
assert(drawingPersist.includes('transaction.set(recordRef'), '친구들 그림 문서가 트랜잭션에 없습니다.');
assert(drawingPersist.includes('transaction.set(userRef'), '사용자 그림 문서가 트랜잭션에 없습니다.');
assert(drawingPersist.includes('item?.drawingId !== recordRef.id'), '사용자 포트폴리오에서 동일 drawingId 중복을 제거하지 않습니다.');
assert(drawingPersist.includes('newDrawingReward') && drawingPersist.includes('isNewRecord'), '동시 저장 시 보상 중복 방지 계산이 없습니다.');
assert(drawingPersist.includes('const shouldGrantExperience = isNewRecord && (!missionStepKey || !existingMission);'), '동일 미션 재완료 시 경험치/레벨업 중복 보상이 차단되지 않습니다.');
assert(drawingPersist.includes('mergeDrawingShapeStats(serverPortfolio.shapeStats'), '서버 최신 도형 통계 병합이 없습니다.');
assert(drawingPersist.includes('compressDrawingImage(record.image, 120)') && drawingPersist.includes('fitDrawingPortfolioToFirestore({'), '사용자 그림 문서에 소형 썸네일/용량 예산이 적용되지 않습니다.');
assert(occurrenceCount(drawingSave, 'persistDrawingRecord(') === 1, '저장하기가 공통 그림 저장 함수를 정확히 한 번 호출하지 않습니다.');
assert(occurrenceCount(drawingComplete, 'persistDrawingRecord(') === 1, '완료하기가 공통 그림 저장 함수를 정확히 한 번 호출하지 않습니다.');
assert(!drawingSave.includes('addDrawingRecordToPortfolioGallery('), '저장하기에 중복 포트폴리오 저장이 남아 있습니다.');
assert(!drawingComplete.includes('addDrawingRecordToPortfolioGallery('), '완료하기에 중복 포트폴리오 저장이 남아 있습니다.');
assert(drawingComplete.includes('drawingPersisted = true;') && drawingComplete.includes('completionSnapshot'), '완료 실패 시 진행/보상 복구 장치가 없습니다.');
assert(!drawingComplete.includes('applyAieduePointReward(') && !drawingComplete.includes('applyAiedueExperienceReward('), '완료 보상이 트랜잭션 전에 로컬 확정됩니다.');
assert(literacyId.includes("digest('SHA-256'") && literacyId.includes('SHARED_LITERACY_DOC_ID'), '공용 오답 문서 ID가 SHA-256/Firestore 원본 ID 표식을 사용하지 않습니다.');
assert(!literacyId.includes('questionData?.id'), 'AI가 제공한 일반 id 필드가 공용 오답 문서 ID로 사용됩니다.');
assert(sharedBankLoad.includes('{ ...doc.data(), id: doc.id }') && sharedBankLoad.includes('Object.defineProperty(question, SHARED_LITERACY_DOC_ID'), '실제 Firestore 문서 ID가 우선 보존되지 않습니다.');
assert(wrongUpsert.includes("['passage', 'question', 'difficulty', 'type', 'answer', 'sampleAnswer', 'explanation']"), '공용 오답 저장의 공개 필드 허용목록이 없습니다.');
assert(!wrongUpsert.includes('...questionData'), '공용 오답 저장이 질문 객체 전체를 펼쳐 씁니다.');
['userAnswer', 'userId', 'pendingReviewRewardId', 'reviewRewardClaimed'].forEach((field) => {
    assert(!wrongUpsert.includes(field), `공용 오답 저장에 개인/임시 필드가 포함됐습니다: ${field}`);
});
assert(correctUpdate.includes('runTransaction') && correctUpdate.includes('transaction.get(docRef)') && correctUpdate.includes('transaction.delete(docRef)'), '한계돌파 정답 횟수/졸업 판정이 트랜잭션이 아닙니다.');
const sharedWrongIndex = literacyResult.indexOf('await upsertWrongToSharedBank');
assert(sharedWrongIndex >= 0 && sharedWrongIndex < literacyResult.indexOf('literacyPortfolio.stats') && sharedWrongIndex < literacyResult.indexOf('literacyPortfolio.history'), '공용 오답 저장이 개인 통계/기록보다 먼저 실행되지 않습니다.');

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

const literacyIdApi = new Function(`${literacyId}\nreturn { SHARED_LITERACY_DOC_ID, getSharedLiteracyQuestionId };`)();
const generatedId = await literacyIdApi.getSharedLiteracyQuestionId({ id: 'ai-controlled-id', passage: '가', question: '나' });
assert(/^q2_[0-9a-f]{64}$/.test(generatedId), 'AI 일반 id가 SHA-256 문서 ID 생성을 우회했습니다.');
const loadedQuestion = { id: 'stored-field-id', passage: '가', question: '나' };
loadedQuestion[literacyIdApi.SHARED_LITERACY_DOC_ID] = 'actual-firestore-id';
assert(await literacyIdApi.getSharedLiteracyQuestionId(loadedQuestion) === 'actual-firestore-id', '실제 Firestore 문서 ID 표식이 재사용되지 않습니다.');

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
