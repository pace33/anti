import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [app, html, css, math, mathQuality, mathServices] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.css', import.meta.url), 'utf8'),
    readFile(new URL('../math/math.js', import.meta.url), 'utf8'),
    readFile(new URL('../math/math-quality-core.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../math/math-services.js', import.meta.url), 'utf8')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

test('홈 오른쪽 빠른 메뉴에는 연구실만 있고 노트 촬영과 도서관은 없다', () => {
    const dashboard = section(html, 'id="dashboard-section"', 'id="drawing-activities-section"');
    const quickActions = section(dashboard, 'class="dashboard-quick-actions', '</div>');
    assert.ok(quickActions.includes('openAiedueLab()'));
    assert.ok(quickActions.includes('에이두 연구실'));
    assert.equal(quickActions.includes('triggerLessonPhotoCapture()'), false);
    assert.equal(quickActions.includes('openAiedueLibrary()'), false);
});

test('노트 촬영은 3·4단계에만 유지되고 도서관은 4단계 두 번째 줄에 있다', () => {
    const dictation = section(html, 'id="dictation-activities-section"', 'id="literacy-activities-section"');
    const literacy = section(html, 'id="literacy-activities-section"', 'id="literacy-workspace-section"');
    assert.ok(dictation.includes('triggerLessonPhotoCapture()'));
    assert.ok(literacy.includes('triggerLessonPhotoCapture()'));
    assert.equal((html.match(/triggerLessonPhotoCapture\(\)/g) || []).length, 2);
    assert.ok(literacy.includes('openAiedueLibrary()'));
    assert.ok(literacy.indexOf('openDictationBankModal()') < literacy.indexOf('openAiedueLibrary()'));
    assert.ok(html.includes('id="lesson-photo-input"'));
});

test('1단계 스케치북은 AI 스케치북이고 전용 생성 UI가 있다', () => {
    const drawing = section(html, 'id="drawing-activities-section"', 'id="drawing-workspace-section"');
    assert.ok(drawing.includes('AI 스케치북'));
    assert.equal(drawing.includes('>스케치북<'), false);
    assert.ok(html.includes('id="drawing-ai-generate-btn"'));
    assert.ok(html.includes('onclick="generateAiSketchbookImage()"'));
    assert.ok(app.includes("title: 'AI 스케치북'"));
});

test('상점 고정 앱으로 크래프트와 포랜디가 모두 노출된다', () => {
    const shop = section(app, 'function renderAiedueKoreanShopItems', 'function renderAiedueKoreanTeacherShop');
    assert.ok(shop.includes('에이두 크래프트'));
    assert.ok(shop.includes('renderAieduePorandyShopCard()'));
    assert.ok(app.includes('에이두 포랜디'));
    assert.ok(app.includes('/school/pokemon-defense/'));
    const safeActions = section(app, 'const SAFE_MODAL_ACTIONS = new Set([', ']);');
    assert.ok(safeActions.includes("'openAieduePorandy'"));
    assert.ok(css.includes('.aiedu-porandy-shop-card'));
});

test('연구실은 선택형 허브로 시간 퀴즈를 연다', () => {
    const lab = section(app, 'window.openAiedueLab =', 'function renderAiedueKoreanShopItems');
    assert.ok(lab.includes('활동은 계속 추가됩니다'));
    assert.ok(lab.includes('시간 퀴즈'));
    assert.ok(lab.includes("window.location.href = 'math/index.html?activity=time-quiz&from=korean-lab'"));
    const safeActions = section(app, 'const SAFE_MODAL_ACTIONS = new Set([', ']);');
    assert.ok(safeActions.includes("'openAiedueLabTimeQuiz'"));
    assert.ok(math.includes("const MATH_LAUNCH_ACTIVITY = new URLSearchParams(window.location.search).get('activity')"));
    assert.ok(math.includes('openTimeQuiz()'));
});

test('시간 퀴즈는 난이도별 경험치·100 EXP 레벨업·1000포인트 보상을 유지한다', () => {
    assert.ok(mathQuality.includes('easy: 1'));
    assert.ok(mathQuality.includes('middle: 3'));
    assert.ok(mathQuality.includes('hard: 5'));
    assert.ok(mathQuality.includes("'very-hard': 10"));
    assert.ok(math.includes('const MATH_LEVEL_EXP_REQUIRED = 100'));
    assert.ok(math.includes('const MATH_LEVEL_UP_COINS = 1000'));
    assert.ok(math.includes('attemptId: isCorrect'));
    assert.ok(mathServices.includes('const attemptRef = doc(db, MATH_ATTEMPT_COLLECTION, attempt.attemptId)'));
    assert.ok(mathServices.includes('const existingAttempt = await transaction.get(attemptRef)'));
    assert.ok(mathServices.includes('if (existingAttempt.exists())'));
    assert.ok(mathServices.includes('duplicate: true'));
});

test('AI 스케치북은 캔버스 원본으로 편집 세션을 만들고 결과만 완료 게시한다', () => {
    const generate = section(app, 'window.generateAiSketchbookImage =', 'function buildDrawingRecord');
    const complete = section(app, 'window.completeTodayDrawingMission =', 'window.openFriendsDrawingGallery');
    assert.ok(generate.includes('captureDrawingBlob()'));
    assert.ok(generate.includes('createSettingsImageEditSession(sourceBlob'));
    assert.ok(generate.includes("createSettingsImageEditTurn(session, prompt, '4:3'"));
    assert.ok(generate.includes('waitForStoryImageJob'));
    assert.ok(generate.includes('downloadStoryImage'));
    assert.ok(generate.includes('drawAiSketchbookBlob'));
    assert.ok(generate.includes('drawingAiSketchbookController === controller && drawingAiSketchbookActive && !controller.signal.aborted'));
    assert.ok(generate.includes('if (!rendered || drawingAiSketchbookController !== controller'));
    assert.ok(generate.includes('closeSettingsImageEditSession(session)'));
    assert.ok(app.includes('function drawAiSketchbookBlob(blob, isCurrent = () => true)'));
    assert.ok(app.includes('if (!isCurrent())'));
    assert.ok(complete.indexOf('if (isDrawingEvaluating) return') < complete.indexOf('!drawingAiSketchbookGenerated'));
    assert.ok(complete.indexOf('!drawingAiSketchbookGenerated') < complete.indexOf('persistDrawingRecord'));
    assert.ok(complete.includes('persistDrawingRecord(completedRecord'));
    assert.ok(complete.indexOf('drawingPersisted = true') < complete.indexOf('drawingAiSketchbookGenerated = false'));
    assert.ok(app.includes("collection(db, FIREBASE_DRAWING_COLLECTION)"));
});
