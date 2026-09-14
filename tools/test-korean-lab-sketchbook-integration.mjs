import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [app, html, css, koreanLabTime] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.css', import.meta.url), 'utf8'),
    readFile(new URL('../korean-lab-time-quiz-core.mjs', import.meta.url), 'utf8')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

test('홈 오른쪽 빠른 메뉴는 역할 버튼을 연구실 왼쪽에 두고 노트 촬영과 도서관은 두지 않는다', () => {
    const dashboard = section(html, 'id="dashboard-section"', 'id="drawing-activities-section"');
    const quickActions = section(dashboard, 'class="dashboard-quick-actions', '</div>');
    const teacherButton = quickActions.indexOf('id="dashboard-teacher-class-button"');
    const studentButton = quickActions.indexOf('id="dashboard-student-shop-button"');
    const labButton = quickActions.indexOf('openAiedueLab()');
    assert.ok(teacherButton >= 0);
    assert.ok(studentButton >= 0);
    assert.ok(teacherButton < labButton);
    assert.ok(studentButton < labButton);
    assert.ok(quickActions.includes('onclick="openClassManagement()"'));
    assert.ok(quickActions.includes('onclick="openAiedueKoreanShop()"'));
    assert.ok(quickActions.includes('dashboard-teacher-class-button hidden'));
    assert.ok(quickActions.includes('dashboard-student-shop-button hidden'));
    assert.ok(quickActions.includes('openAiedueLab()'));
    assert.ok(quickActions.includes('에이두 연구실'));
    assert.equal(quickActions.includes('triggerLessonPhotoCapture()'), false);
    assert.equal(quickActions.includes('openAiedueLibrary()'), false);
});

test('로그인 역할에 따라 홈의 학급 관리와 상점 버튼을 서로 바꾸고 로그아웃 때 모두 숨긴다', () => {
    const update = section(app, 'function updateDashboardExperience', '// Profile UI Upgrade');
    const sync = section(app, 'function startAiedueSchoolProfileSync', 'const topLevelSectionIds');
    const logout = section(app, 'window.handleLogout =', 'window.checkStudentLogin =');
    assert.ok(update.includes("dashboardTeacherClassButton?.classList.remove('hidden')"));
    assert.ok(update.includes("dashboardStudentShopButton?.classList.add('hidden')"));
    assert.ok(update.includes("dashboardTeacherClassButton?.classList.add('hidden')"));
    assert.ok(update.includes("dashboardStudentShopButton?.classList.remove('hidden')"));
    assert.ok(logout.includes("getElementById('dashboard-teacher-class-button')?.classList.add('hidden')"));
    assert.ok(logout.includes("getElementById('dashboard-student-shop-button')?.classList.add('hidden')"));
    assert.ok(sync.includes("auth.currentUser?.uid !== uid || currentUserId !== uid || lastSyncedProfileUid !== uid"));
    assert.ok(css.includes('width: min(52vw, 360px)'));
    assert.ok(css.includes('@media (max-width: 480px)'));
    assert.ok(css.includes('padding-top: 180px'));
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
    assert.ok(app.includes('https://aiedue.netlify.app/pokemon-defense/play.html'));
    const safeActions = section(app, 'const SAFE_MODAL_ACTIONS = new Set([', ']);');
    assert.ok(safeActions.includes("'openAieduePorandy'"));
    assert.ok(css.includes('.aiedu-porandy-shop-card'));
});

test('교사 학급 관리에는 상점 물품 관리 탭과 CRUD·배부 도구가 내장된다', () => {
    const classModal = section(html, 'id="class-management-modal"', '<!-- [에이두 한글 내장 클라우드 섹션] -->');
    assert.ok(classModal.includes('data-class-tab="shop"'));
    assert.ok(classModal.includes('onclick="selectClassManagementTab(\'shop\')"'));
    assert.ok(classModal.includes('id="class-management-shop-panel"'));
    assert.ok(classModal.includes('id="class-management-shop-content"'));
    assert.ok(classModal.includes('max-h-[94vh] overflow-hidden flex flex-col'));
    assert.ok(classModal.includes('min-h-0 flex-1 max-h-[68vh] overflow-y-auto'));

    const manager = section(app, 'function renderAiedueKoreanTeacherShopManager', 'function renderAiedueKoreanTeacherShop(items');
    assert.ok(manager.includes('물품 추가'));
    assert.ok(manager.includes('학생별 배부'));
    assert.ok(manager.includes('전체 학생에게 모두 배부'));
    assert.ok(manager.includes('editAiedueKoreanShopItem'));
    assert.ok(manager.includes('deleteAiedueKoreanShopItem'));
    assert.ok(manager.includes('safeImageSource(item.imageUrl)'));
});

test('학급 상점 탭은 교사 물품을 로드하고 저장·삭제 후 같은 탭으로 복귀한다', () => {
    const panel = section(app, 'async function renderAiedueKoreanClassShopPanel', 'window.openAiedueKoreanShop =');
    assert.ok(panel.includes("currentUserRole !== 'teacher'"));
    assert.ok(panel.includes("loadAiedueKoreanTeacherShopItems(teacherId, { updateCache: false })"));
    assert.ok(panel.includes('if (!requestIsCurrent()) return;'));
    assert.ok(panel.indexOf('if (!requestIsCurrent()) return;') < panel.indexOf('aiedueKoreanShopItemsCache.clear()'));
    assert.ok(panel.includes('renderAiedueKoreanTeacherShopManager(items, { embedded: true })'));

    const selectTab = section(app, 'window.selectClassManagementTab =', 'window.openClassManagement =');
    assert.ok(selectTab.includes("'shop'"));
    assert.ok(selectTab.includes("activeClassManagementTab === 'shop'"));
    assert.ok(selectTab.includes('renderAiedueKoreanClassShopPanel()'));

    const mutations = section(app, 'function isAiedueKoreanClassShopOpen', 'async function assignAiedueKoreanShopItemToStudent');
    assert.ok(mutations.includes("activeClassManagementTab === 'shop'"));
    assert.equal((mutations.match(/refreshAiedueKoreanTeacherShopSurface\(\)/g) || []).length >= 3, true);
});

test('연구실은 선택형 허브로 한글 내부 시간 퀴즈를 연다', () => {
    const lab = section(app, 'window.openAiedueLab =', 'function renderAiedueKoreanShopItems');
    assert.ok(lab.includes('활동은 계속 추가됩니다'));
    assert.ok(lab.includes('시간 퀴즈'));
    assert.equal(lab.includes('음절 슬로우 리더'), false);
    assert.equal(lab.includes('window.openSyllableSlowReader?.()'), false);
    assert.ok(lab.includes('window.openKoreanLabTimeQuiz?.()'));
    assert.equal(lab.includes('math/index.html'), false);
    const safeActions = section(app, 'const SAFE_MODAL_ACTIONS = new Set([', ']);');
    assert.ok(safeActions.includes("'openAiedueLabTimeQuiz'"));
    assert.equal(safeActions.includes("'openAiedueLabSyllableReader'"), false);
    assert.ok(html.includes('id="korean-lab-time-quiz-section"'));
    assert.ok(html.includes('src="korean-lab-time-quiz.js'));
});

test('한글 연구실 시간 퀴즈는 난이도별 경험치와 한글 100 EXP 레벨업·1000포인트 보상을 쓴다', () => {
    assert.ok(koreanLabTime.includes('easy: 1'));
    assert.ok(koreanLabTime.includes('middle: 3'));
    assert.ok(koreanLabTime.includes('hard: 5'));
    assert.ok(koreanLabTime.includes("'very-hard': 10"));
    assert.ok(app.includes('while (newExp >= 100)'));
    assert.ok(app.includes('const AIEDUE_LEVEL_UP_POINT_REWARD = 1000'));
    assert.ok(app.includes('window.aiedueKoreanLabTimeQuizData'));
    assert.equal(app.includes('window.aiedueKoreanLabTimeQuizData = window.aiedueMathData'), false);
});

test('AI 스케치북은 캔버스 원본을 편집하고 생성 직후 내 그림과 친구들 그림에 함께 저장한다', () => {
    const autoSave = section(app, 'function isCurrentAiSketchbookRevision', 'window.generateAiSketchbookImage =');
    const generate = section(app, 'window.generateAiSketchbookImage =', 'function buildDrawingRecord');
    const configure = section(app, 'function configureDrawingWorkspace', 'window.openMyDrawingFromDashboard');
    const complete = section(app, 'window.completeTodayDrawingMission =', 'window.openFriendsDrawingGallery');
    assert.ok(generate.includes('captureDrawingBlob()'));
    assert.ok(generate.includes('createSettingsImageEditSession(sourceBlob'));
    assert.ok(generate.includes("createSettingsImageEditTurn(session, prompt, '4:3'"));
    assert.ok(generate.includes('waitForStoryImageJob'));
    assert.ok(generate.includes('downloadStoryImage'));
    assert.ok(generate.includes('drawAiSketchbookBlob'));
    assert.ok(generate.includes('const startedUserId = String(currentUserId'));
    assert.ok(generate.includes('isCurrentAiSketchbookOperation(revision, controller, startedUserId)'));
    assert.ok(generate.includes('if (!rendered || !isCurrentAiSketchbookOperation'));
    assert.ok(generate.includes("kind: 'sketchbook'"));
    assert.ok(generate.includes('await persistGeneratedAiSketchbookRecord(record, revision, startedUserId)'));
    assert.ok(generate.includes('if (drawingAiSketchbookGenerated && drawingAiSketchbookPendingRecord)'));
    assert.ok(generate.includes('closeSettingsImageEditSession(session)'));
    assert.ok(autoSave.includes('await persistDrawingRecord(record, {'));
    assert.ok(autoSave.includes('localStateGuard: () => isCurrentAiSketchbookRevision(revision)'));
    assert.ok(autoSave.includes('drawingAiSketchbookSaved = true'));
    assert.ok(autoSave.includes('drawingAiSketchbookPendingRecord = null'));
    assert.ok(autoSave.includes('저장 다시 시도'));
    assert.ok(app.includes('function drawAiSketchbookBlob(blob, isCurrent = () => true)'));
    assert.ok(app.includes('if (!isCurrent())'));
    assert.ok(configure.includes("document.getElementById('drawing-complete-mission-btn').classList.toggle('hidden', !missionCompletionMode)"));
    assert.ok(configure.includes('const missionCompletionMode = Boolean(missionStep) || aiQuiz || isShapeMission || isInfiniteDrawing'));
    assert.ok(complete.includes('if (isDrawingEvaluating || drawingAiSketchbookActive) return'));
    assert.equal(complete.includes('drawingAiSketchbookGenerated'), false);
    assert.ok(app.includes("collection(db, FIREBASE_DRAWING_COLLECTION)"));
});

test('이전 AI 저장 완료는 새 스케치북 세션의 상태나 모달을 덮지 않는다', async () => {
    const persistence = section(app, 'function isCurrentAiSketchbookRevision', 'window.generateAiSketchbookImage =');
    const createHarness = (persistDrawingRecord) => new Function('persistDrawingRecord', `
        let currentUserId = 'user-a';
        const auth = { currentUser: { uid: 'user-a' } };
        let drawingAiSketchbookActive = true;
        let drawingAiSketchbookRevision = 7;
        let drawingAiSketchbookBusy = false;
        let drawingAiSketchbookSaving = false;
        let drawingAiSketchbookPendingRecord = null;
        let drawingAiSketchbookSaved = false;
        let controlUpdates = 0;
        let dashboardUpdates = 0;
        let modalCount = 0;
        const console = { error() {} };
        const updateAiSketchbookControls = () => { controlUpdates += 1; };
        const updateDrawingDashboardPreview = () => { dashboardUpdates += 1; };
        const showModal = () => { modalCount += 1; };
        const escapeHtml = (value) => String(value);
        ${persistence}
        return {
            save: (record) => persistGeneratedAiSketchbookRecord(record, 7, 'user-a'),
            replaceSession() {
                drawingAiSketchbookRevision = 8;
                drawingAiSketchbookBusy = false;
                drawingAiSketchbookSaving = false;
                drawingAiSketchbookPendingRecord = null;
                drawingAiSketchbookSaved = false;
            },
            switchAccount() {
                currentUserId = 'user-b';
                auth.currentUser.uid = 'user-b';
            },
            state: () => ({ drawingAiSketchbookBusy, drawingAiSketchbookSaving, drawingAiSketchbookPendingRecord, drawingAiSketchbookSaved, controlUpdates, dashboardUpdates, modalCount })
        };
    `)(persistDrawingRecord);

    let resolveSave;
    const successHarness = createHarness(() => new Promise((resolve) => { resolveSave = resolve; }));
    const staleSuccess = successHarness.save({ image: 'data:image/png;base64,test' });
    successHarness.replaceSession();
    resolveSave();
    assert.equal(await staleSuccess, true);
    assert.deepEqual(successHarness.state(), {
        drawingAiSketchbookBusy: false,
        drawingAiSketchbookSaving: false,
        drawingAiSketchbookPendingRecord: null,
        drawingAiSketchbookSaved: false,
        controlUpdates: 1,
        dashboardUpdates: 0,
        modalCount: 0
    });

    let rejectSave;
    const failureHarness = createHarness(() => new Promise((resolve, reject) => { rejectSave = reject; }));
    const staleFailure = failureHarness.save({ image: 'data:image/png;base64,test' });
    failureHarness.replaceSession();
    rejectSave(new Error('late failure'));
    assert.equal(await staleFailure, false);
    assert.equal(failureHarness.state().modalCount, 0);
    assert.equal(failureHarness.state().drawingAiSketchbookSaved, false);

    let resolveAccountSave;
    const accountHarness = createHarness(() => new Promise((resolve) => { resolveAccountSave = resolve; }));
    const staleAccountSuccess = accountHarness.save({ image: 'data:image/png;base64,test', userId: 'user-a' });
    accountHarness.switchAccount();
    resolveAccountSave();
    assert.equal(await staleAccountSuccess, true);
    assert.equal(accountHarness.state().drawingAiSketchbookSaved, false);
    assert.equal(accountHarness.state().dashboardUpdates, 0);
    assert.equal(accountHarness.state().modalCount, 0);
});

test('그림 저장은 생성·트랜잭션·완료 롤백 전 과정에서 시작 계정 UID를 고정한다', () => {
    const persistence = section(app, 'async function persistDrawingRecord', 'function normalizeFirebaseDrawingDoc');
    const save = section(app, 'window.saveCurrentDrawing', 'function showAiedueAutoToast');
    const complete = section(app, 'window.completeTodayDrawingMission', 'window.openFriendsDrawingGallery');
    const authFlow = app.slice(app.indexOf('onAuthStateChanged(auth'));
    const generate = section(app, 'window.generateAiSketchbookImage =', 'function buildDrawingRecord');

    assert.ok(persistence.includes("const expectedUserId = String(operation.expectedUserId || currentUserId || '')"));
    assert.ok(persistence.includes('if (!isCurrentDrawingUser(expectedUserId)) throw new Error'));
    assert.ok(persistence.includes('const startedUserId = expectedUserId'));
    assert.ok(persistence.includes('const startedState = Object.freeze({'));
    assert.ok(persistence.includes('asNumber(userData.aeduExperience, startedState.aeduExperience)'));
    assert.ok(persistence.includes('asNumber(userData.balance, startedState.balance)'));
    assert.ok(persistence.includes('asNumber(userData.aeduTokens, startedState.aeduTokens)'));
    assert.equal(persistence.includes('asNumber(userData.aeduExperience, currentUserAeduExperience)'), false);
    assert.equal(persistence.includes('userData.name || currentUserName'), false);
    assert.ok(generate.includes('persistGeneratedAiSketchbookRecord(record, revision, startedUserId)'));
    assert.ok(generate.includes("error?.name !== 'AbortError' && isCurrentAiSketchbookOperation"));
    assert.ok(save.includes('expectedUserId: startedUserId'));
    assert.ok(save.includes('if (!isCurrentDrawingUser(startedUserId)) return'));
    assert.ok(complete.includes('expectedUserId: startedUserId'));
    assert.ok(complete.indexOf('if (!isCurrentDrawingUser(startedUserId)) return;') < complete.indexOf('currentUserCoins = completionSnapshot.currentUserCoins'));
    assert.ok(complete.includes('if (isCurrentDrawingUser(startedUserId)) setDrawingEvaluationState(false)'));
    assert.ok(complete.includes('const openIfCompletionUserIsCurrent'));
    assert.ok(complete.includes('if (isCurrentDrawingUser(startedUserId)) openActivity()'));
    assert.ok(authFlow.includes('resetAiSketchbookForIdentityChange()'));
    assert.ok(authFlow.includes('setDrawingEvaluationState(false)'));
});

test('그리기 지우개는 투명 합성과 함께 판정용 획 좌표도 같은 범위에서 제거한다', () => {
    const eraseHelper = section(app, 'function eraseDrawingTracePointsAlongSegment', 'function invalidateAiSketchbookResultAfterCanvasChange');
    const canvasInput = section(app, 'function initializeDrawingCanvas', 'function renderDrawingBrushSizeButtons');
    const erase = new Function('points', `
        let drawingUserTracePoints = points;
        ${eraseHelper}
        eraseDrawingTracePointsAlongSegment(0, 0, 10, 0, 2);
        return drawingUserTracePoints;
    `);
    assert.deepEqual(erase([{ x: 5, y: 1 }, { x: 5, y: 3 }, { x: 13, y: 0 }]), [{ x: 5, y: 3 }, { x: 13, y: 0 }]);
    assert.ok(canvasInput.includes("ctx.globalCompositeOperation = drawingEraserMode ? 'destination-out' : 'source-over'"));
    assert.ok(canvasInput.includes('eraseDrawingTracePointsAlongSegment(lastX, lastY, p.x, p.y, eraserWidth / 2)'));
    assert.ok(canvasInput.includes('if (!drawingEraserMode) rememberPoint(p)'));
    assert.ok(css.includes('#drawing-canvas'));
    assert.ok(css.includes('background-image:'));
});

test('AntiAI 상태 조회의 일시적 시간 초과와 게이트웨이 오류는 생성 작업을 즉시 폐기하지 않는다', async () => {
    const polling = section(app, 'async function waitForStoryImageJob', 'async function downloadStoryImage');
    assert.ok(polling.includes('let consecutiveStatusFailures = 0'));
    assert.ok(polling.includes('consecutiveStatusFailures >= 5'));
    assert.ok(polling.includes('transientNetworkFailure'));
    assert.ok(polling.includes('시간이 초과'));
    assert.ok(polling.includes('[408, 425, 429]'));
    assert.ok(polling.includes('response.status >= 500 && response.status < 600'));
    assert.ok(polling.includes("response.headers.get('Retry-After')"));
    assert.ok(polling.includes('continue;'));

    const makePoller = (fetchImpl, delayImpl = async () => {}) => new Function(
        'normalizeImageJobStatusUrl',
        'fetchStoryResource',
        'waitForStoryDelay',
        `${polling}; return waitForStoryImageJob;`
    )(
        (url) => url,
        fetchImpl,
        delayImpl
    );
    const completed = {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({ status: 'completed', result: { images: [{ url: '/api/image-jobs/test/images/0' }] } })
    };

    let networkAttempts = 0;
    const afterTimeout = await makePoller(async () => {
        networkAttempts += 1;
        if (networkAttempts === 1) throw new Error('AntiAI 요청 시간이 초과되었습니다. 실패한 항목만 다시 시도해 주세요.');
        return completed;
    })({ id: 'test', token: 'token' });
    assert.equal(networkAttempts, 2);
    assert.equal(afterTimeout.url, '/api/image-jobs/test/images/0');

    let gatewayAttempts = 0;
    const afterGatewayError = await makePoller(async () => {
        gatewayAttempts += 1;
        if (gatewayAttempts === 1) return {
            ok: false,
            status: 507,
            headers: { get: () => null },
            json: async () => ({ error: 'temporary upstream failure' })
        };
        return completed;
    })({ id: 'test', token: 'token' });
    assert.equal(gatewayAttempts, 2);
    assert.equal(afterGatewayError.url, '/api/image-jobs/test/images/0');

    let consecutiveFailures = 0;
    await assert.rejects(makePoller(async () => {
        consecutiveFailures += 1;
        return {
            ok: false,
            status: 503,
            headers: { get: () => null },
            json: async () => ({ error: 'temporary upstream failure' })
        };
    })({ id: 'test', token: 'token' }), /temporary upstream failure/);
    assert.equal(consecutiveFailures, 5);

    let resetAttempts = 0;
    const afterCounterReset = await makePoller(async () => {
        resetAttempts += 1;
        if (resetAttempts === 1 || (resetAttempts >= 3 && resetAttempts <= 6)) return {
            ok: false,
            status: 502,
            headers: { get: () => null },
            json: async () => ({ error: 'temporary upstream failure' })
        };
        if (resetAttempts === 2) return {
            ok: true,
            status: 200,
            headers: { get: () => null },
            json: async () => ({ status: 'running' })
        };
        return completed;
    })({ id: 'test', token: 'token' });
    assert.equal(resetAttempts, 7);
    assert.equal(afterCounterReset.url, '/api/image-jobs/test/images/0');

    let permanentAttempts = 0;
    await assert.rejects(makePoller(async () => {
        permanentAttempts += 1;
        throw new Error('permanent parse failure');
    })({ id: 'test', token: 'token' }), /permanent parse failure/);
    assert.equal(permanentAttempts, 1);

    await assert.rejects(makePoller(async () => {
        throw new DOMException('cancelled', 'AbortError');
    })({ id: 'test', token: 'token' }), { name: 'AbortError' });

    await assert.rejects(makePoller(async () => {
        throw new TypeError('Failed to fetch');
    }, async () => {
        throw new DOMException('cancelled while waiting', 'AbortError');
    })({ id: 'test', token: 'token' }), { name: 'AbortError' });
});
