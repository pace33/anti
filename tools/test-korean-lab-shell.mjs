import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [app, appCss, html, labCss, shapeCss, timeQuizEntry, literacyGame, literacyCss, shapeGame, wordCardGame] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('app.css', root), 'utf8'),
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('korean-lab-shell.css', root), 'utf8'),
    readFile(new URL('shape-zoo.css', root), 'utf8'),
    readFile(new URL('korean-lab-time-quiz.js', root), 'utf8'),
    readFile(new URL('literacy-adventure-game.js', root), 'utf8').catch(() => ''),
    readFile(new URL('literacy-adventure.css', root), 'utf8').catch(() => ''),
    readFile(new URL('shape-zoo-game.js', root), 'utf8'),
    readFile(new URL('word-card-table-game.js', root), 'utf8')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

function directChildrenOfDivAt(source, start) {
    const tags = /<\/?([a-z][\w-]*)(?:\s[^<>]*?)?>/gi;
    const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
    tags.lastIndex = start;
    let depth = 0;
    let started = false;
    const children = [];
    for (let match; (match = tags.exec(source));) {
        const raw = match[0];
        const tag = match[1].toLowerCase();
        const closing = raw.startsWith('</');
        if (!started) {
            assert.equal(tag, 'div', '활동 그리드 시작 태그가 div가 아님');
            started = true;
            depth = 1;
            continue;
        }
        if (closing) {
            depth -= 1;
            if (depth === 0) return children;
            continue;
        }
        if (depth === 1) children.push(raw);
        if (!voidTags.has(tag) && !raw.endsWith('/>')) depth += 1;
    }
    assert.fail('활동 그리드 닫는 태그 없음');
}

test('시간 퀴즈는 에이두 한글 내부의 독립 연구실 기능이다', () => {
    const open = section(app, 'window.openAiedueLabTimeQuiz =', 'function renderAiedueKoreanShopItems');
    assert.equal(open.includes('math/index.html'), false);
    assert.ok(open.includes('openKoreanLabTimeQuiz'));
    assert.ok(html.includes('id="korean-lab-time-quiz-section"'));
    assert.ok(html.includes('korean-lab-time-quiz.js'));
    assert.equal(html.includes('korean-lab-time-quiz.js') && html.includes('math/math'), false);
});

test('시간 퀴즈 시계판은 전체 눈금을 표시하고 태블릿에서 네 보기와 조작부가 잘리지 않는다', () => {
    assert.ok(html.includes('class="kltq-hour-scale"'));
    assert.ok(html.includes('class="kltq-minute-scale"'));
    assert.equal(html.includes('class="kltq-number n12"'), false);
    assert.match(timeQuizEntry, /for \(let hour = 1; hour <= 12; hour \+= 1\)/);
    assert.match(timeQuizEntry, /for \(let minute = 0; minute < 60; minute \+= 5\)/);
    assert.ok(timeQuizEntry.includes("'kltq-hour-number'"));
    assert.ok(timeQuizEntry.includes("'kltq-minute-number'"));
    const tabletTimeQuiz = section(labCss, '@media (min-width: 761px) and (max-width: 1280px)', '@media (max-width: 760px)');
    assert.ok(tabletTimeQuiz.includes('height: min(900px, calc(100dvh - 16px)) !important'));
    assert.ok(tabletTimeQuiz.includes('padding: 14px 18px 16px'));
    assert.ok(tabletTimeQuiz.includes('margin-bottom: 64px'));
    assert.ok(tabletTimeQuiz.includes('.kltq-answer-card'));
    assert.ok(tabletTimeQuiz.includes('overflow-y: auto'));
    assert.ok(tabletTimeQuiz.includes('.kltq-options button'));
    assert.ok(tabletTimeQuiz.includes('min-height: 48px'));
    const shortTabletTimeQuiz = section(labCss, '@media (min-width: 761px) and (max-width: 1280px) and (max-height: 600px)', '@media (max-width: 760px)');
    assert.ok(shortTabletTimeQuiz.includes('padding: 8px 14px'));
    assert.ok(shortTabletTimeQuiz.includes('margin-bottom: 72px'));
    assert.ok(shortTabletTimeQuiz.includes('min-height: 44px'));
    assert.equal(shortTabletTimeQuiz.includes('min-height: 38px'), false);
});

test('연구실 게임은 에이두 한글 공통 둥근 카드 셸을 쓴다', () => {
    for (const id of [
        'korean-lab-time-quiz-section',
        'shape-zoo-game-section',
        'word-card-table-game-section',
        'dictation-asteroid-game-section',
        'literacy-adventure-game-section'
    ]) assert.match(html, new RegExp(`id="${id}"[^>]*class="[^"]*aiedue-lab-game-shell`));
    assert.ok(html.includes('href="korean-lab-shell.css'));
    assert.match(html, /<script\b[^>]*type="module"[^>]*src="app\.js\?v=[^"]+"/);
    assert.ok(labCss.includes('width: min(95vw, 1200px) !important'));
    assert.ok(labCss.includes('border: 12px solid #fff !important'));
    assert.ok(labCss.includes('border-radius: 50px !important'));
    assert.ok(labCss.includes('body.aiedue-lab-game-open .aiedue-rpg-hud'));
});

test('대시보드는 큰 화면의 네 단계와 모바일 두 열 배치, 하단 정보 바를 유지한다', async () => {
    assert.ok(app.includes("document.body.classList.toggle('dashboard-view-active', sectionId === 'dashboard-section')"));
    assert.ok(app.includes("hud.classList.remove('rpg-collapsed')"));
    assert.ok(appCss.includes('body.dashboard-view-active .aiedue-rpg-hud'));
    assert.ok(appCss.includes('position: fixed !important'));
    assert.ok(appCss.includes('bottom: max(18px, env(safe-area-inset-bottom)) !important'));
    assert.ok(appCss.includes('left: max(18px, env(safe-area-inset-left)) !important'));
    assert.ok(appCss.includes('body.dashboard-view-active #dashboard-section .dashboard-quick-actions'));
    const tablet = section(appCss, '@media (max-width: 992px)', '@media (max-width: 576px)');
    const refreshCss = await readFile(new URL('classroom-refresh.css', root), 'utf8');
    const mobile = section(refreshCss, '@media (max-width: 760px)', '@media (prefers-reduced-motion: reduce)');
    assert.ok(tablet.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
    assert.ok(mobile.includes('grid-template-columns: repeat(2, minmax(0, 1fr))'));
});

test('놀이 화면은 뷰포트 중앙에 오고 왼쪽 위 한글 로고가 복귀 버튼이다', () => {
    assert.ok(labCss.includes('top: 50% !important'));
    assert.ok(labCss.includes('transform: translate(-50%, -50%) !important'));
    assert.ok(labCss.includes('.aiedue-lab-logo-home img'));
    const logoHome = section(labCss, '.aiedue-lab-home {', '#dictation-asteroid-game-section');
    assert.ok(logoHome.includes('border: 0 !important'));
    assert.ok(logoHome.includes('background: transparent !important'));
    assert.ok(logoHome.includes('box-shadow: none !important'));
    assert.ok(logoHome.includes('width: 148px'));
    assert.ok(labCss.includes('@media (max-width: 860px)'));
    assert.ok(labCss.includes('.aiedue-lab-logo-home img { width: 126px'));
    assert.ok(labCss.includes('@media (max-width: 520px)'));
    assert.ok(labCss.includes('.aiedue-lab-logo-home img { width: 104px'));
    assert.match(shapeCss, /\.zoo-back\.aiedue-lab-logo-home\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    assert.match(shapeCss, /@media \(max-width:\s*860px\)[\s\S]*?\.zoo-back\.aiedue-lab-logo-home img\s*\{\s*width:\s*126px;/);
    assert.match(shapeCss, /@media \(max-width:\s*520px\)[\s\S]*?\.zoo-back\.aiedue-lab-logo-home img\s*\{\s*width:\s*104px;/);
    assert.match(labCss, /\.zoo-header,[\s\S]*?\.literacy-adventure-header\s*\{[^}]*z-index:\s*30[^}]*width:\s*100%/s);
    assert.match(labCss, /\.aiedue-lab-brand\s*\{[^}]*justify-content:\s*flex-start/s);
    assert.match(labCss, /#word-card-table-game-section \.wct-overlay\s*\{\s*top:\s*146px\s*!important/s);
    assert.match(labCss, /@media \(max-width:\s*860px\)[\s\S]*#word-card-table-game-section \.wct-overlay\s*\{\s*top:\s*121px\s*!important/s);
    assert.match(labCss, /@media \(max-width:\s*520px\)[\s\S]*#word-card-table-game-section \.wct-overlay\s*\{\s*top:\s*104px\s*!important/s);
    assert.match(appCss, /\.dictation-asteroid-game\s*\{[^}]*align-items:\s*stretch/s);
    assert.match(appCss, /\.dictation-writing-heading button\s*\{[^}]*white-space:\s*nowrap/s);
    assert.match(appCss, /@media \(min-width:\s*851px\)\s*\{\s*\.dictation-asteroid-writing \.dictation-writing-canvas\s*\{\s*min-height:\s*160px/s);
    assert.match(appCss, /@media \(min-width:\s*851px\) and \(max-height:\s*800px\)[\s\S]*\.dictation-asteroid-writing \.dictation-writing-canvas\s*\{\s*min-height:\s*110px/s);
    for (const source of [shapeGame, wordCardGame]) {
        assert.ok(!source.includes('ui.header.inert = true'));
    }
    assert.ok(shapeGame.includes('ui.main.inert = true'));
    assert.ok(wordCardGame.includes('ui.main.inert = true'));
    for (const source of [html, shapeGame, wordCardGame]) {
        assert.ok(source.includes('aiedue-lab-logo-home'));
        assert.match(source, /aiedue-lab-logo-home[^>]*[\s\S]*?<img src="aiedu_hangul_logo\.webp"/);
    }
    assert.equal(html.includes('class="aiedue-lab-brand"><img'), false);
    assert.equal(shapeGame.includes('class="zoo-brand aiedue-lab-brand"><img'), false);
    assert.equal(wordCardGame.includes('class="wct-brand aiedue-lab-brand"><img'), false);
});

test('홈에는 네 단계 카드만 있고 단계별 게임 카드를 노출하지 않는다', () => {
    const dashboard = section(html, 'id="dashboard-section"', 'id="drawing-activities-section"');
    for (const step of [1, 2, 3, 4]) assert.ok(dashboard.includes(`id="card-level-${step}"`));
    assert.doesNotMatch(dashboard, /id="dashboard-lab-/);
    assert.doesNotMatch(dashboard, /\bdashboard-lab-card\b/);
});

test('각 단계 게임은 오른쪽 위 헤더에 있고 3·4단계 카메라는 게임 왼쪽에 있다', () => {
    const contracts = [
        ['drawing-activities-section', 'dictation-activities-section', 'stage-1-game-shape', 'openAiedueLabShapeZoo()', '도형 동물원', false],
        ['hangul-activities-section', 'my-drawing-section', 'stage-2-game-asteroid', 'openAiedueLabDictationGame()', '낱말 우주 방어대', false],
        ['dictation-activities-section', 'literacy-activities-section', 'stage-3-game-word-card', 'openAiedueLabWordCardGame()', '단어 카드 한 판', true],
        ['literacy-activities-section', 'literacy-workspace-section', 'stage-4-game-literacy', 'openLiteracyAdventureGame()', '문해력 탐정단', true]
    ];
    for (const [start, end, id, opener, title, hasCamera] of contracts) {
        const stage = section(html, `id="${start}"`, `id="${end}"`);
        const actionsStart = stage.indexOf('<div class="stage-header-actions">');
        assert.ok(actionsStart >= 0, `${start} 오른쪽 위 액션 묶음 없음`);
        const directChildren = directChildrenOfDivAt(stage, actionsStart);
        const gameIndex = directChildren.findIndex((child) => child.includes(`id="${id}"`));
        assert.equal(gameIndex, hasCamera ? 2 : 1, `${id}가 헤더 오른쪽 끝에 있지 않음`);
        assert.ok(directChildren[gameIndex]?.includes('stage-header-game-button'), `${id}가 상단 게임 버튼 스타일을 쓰지 않음`);
        if (hasCamera) {
            assert.ok(directChildren[1]?.includes('lesson-photo-button'), `${start} 카메라가 게임 바로 왼쪽에 있지 않음`);
        } else {
            assert.equal(stage.includes('lesson-photo-button'), false, `${start}에는 카메라 버튼이 없어야 함`);
        }
        assert.equal((stage.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${id}가 중복 배치됨`);
        assert.ok(stage.includes(opener), `${opener} 없음`);
        assert.ok(stage.includes(title), `${title} 없음`);
    }
    const literacy = section(html, 'id="literacy-activities-section"', 'id="literacy-workspace-section"');
    assert.doesNotMatch(literacy, /openAiedueLabTimeQuiz\(\)/);
    assert.equal((html.match(/data-stage-game-entry=/g) || []).length, 4);
    assert.ok(appCss.includes('.stage-header-actions'));
    assert.ok(appCss.includes('.stage-header-game-button'));
    assert.ok(appCss.includes('.stage-header-actions > [onclick="toggleInfoDrawer()"] { display: none !important; }'));
});

test('4단계 탐정단은 일반 문해력 상태·공용 은행 저장과 분리된 facade를 사용한다', () => {
    assert.ok(html.includes('id="literacy-adventure-game-section"'));
    assert.ok(html.includes('id="literacy-adventure-answer"'));
    assert.ok(html.includes('literacy-adventure-game.js'));
    assert.ok(html.includes('literacy-adventure.css'));
    assert.ok(app.includes("'literacy-adventure-game-section'"));
    assert.ok(app.includes('window.aiedueLiteracyAdventureData'));
    assert.ok(app.includes('const plan = getLiteracyDanPlan()'));
    const facade = section(app, 'window.aiedueLiteracyAdventureData = Object.freeze({', 'const AIEDUE_LITERACY_FALLBACK_TOPICS');
    assert.ok(facade.includes('await createLiteracyMissionQuestion(plan.difficulty, plan.type, { detective: true })'));
    assert.ok(facade.includes('activeLiteracyDetectiveQuestion'));
    assert.equal(facade.includes('activeLiteracyQuestion ='), false);
    assert.equal(facade.includes('showLiteracyResult('), false);
    assert.equal(facade.includes('persistLiteracyAttemptAtomic'), false);
    assert.ok(app.includes("question.type === 'multipleChoice'"));
    assert.ok(app.includes("question.type === 'shortAnswer'"));
    assert.ok(app.includes("question.type === 'essay'"));
    assert.ok(app.includes('persistLiteracyAttemptAtomic'));
    assert.ok(literacyGame.includes("gameId: 'literacy-detective'"));
    assert.ok(labCss.includes('#literacy-adventure-game-section.aiedue-lab-game-shell'));
    assert.match(literacyCss, /z-index:\s*30/);
    assert.ok(literacyGame.includes("round.type === 'multipleChoice'"));
    assert.ok(literacyGame.includes('facade.createRound()'));
    assert.ok(literacyGame.includes('window.aiedueLiteracyAdventureData.submitAnswer'));
    assert.equal(literacyGame.includes('aiedueKoreanLabTimeQuizData'), false);
});

test('4단계 문해력 탐정단은 왼쪽 추리 지문과 오른쪽 유형별 답변으로 사건을 해결한다', () => {
    assert.ok(html.includes('🔎 문해력 탐정단'));
    assert.ok(html.includes('사건 추리 지문'));
    assert.ok(html.includes('추리해서 답해 보세요'));
    assert.ok(html.includes('assets/aiedue-literacy-detective.webp'));
    assert.ok(html.includes('에이두 탐정의 수사 팁'));
    assert.equal(html.includes('문해력 편집국'), false);
    assert.ok(html.includes('id="literacy-adventure-difficulty"'));
    assert.ok(html.includes('id="literacy-adventure-type"'));
    assert.ok(html.includes('id="literacy-adventure-response-guide"'));
    assert.match(html, /id="literacy-adventure-options"[^>]*role="group"[^>]*aria-labelledby="literacy-adventure-question"/);
    assert.match(html, /id="literacy-adventure-input"[^>]*aria-labelledby="literacy-adventure-question"[^>]*aria-describedby="literacy-adventure-response-guide"/);
    assert.equal(html.includes('단서 선택'), false);
    assert.equal(html.includes('id="literacy-adventure-clue"'), false);
    assert.equal(html.includes('id="literacy-adventure-next"'), false);
    assert.ok(literacyGame.includes('renderPassage'));
    assert.equal(literacyGame.includes('chooseEvidence'), false);
    assert.equal(literacyGame.includes('selectedEvidence'), false);
    assert.ok(literacyGame.includes("button.addEventListener('click', () => chooseOption(index, button))"));
    assert.ok(literacyGame.includes("$('literacy-adventure-submit')?.addEventListener('click', submit)"));
    assert.ok(literacyGame.includes('const hasAnswer ='));
    assert.ok(literacyGame.includes("$('literacy-adventure-game-section')?.classList.toggle('has-response', hasAnswer)"));
    assert.ok(literacyGame.includes('function setWorkspaceDisabled(disabled)'));
    assert.match(literacyGame, /input\.disabled\s*=\s*false/);
    assert.match(literacyGame, /async function submit\(\)[\s\S]*?state\.busy\s*=\s*true;[\s\S]*?setWorkspaceDisabled\(true\)/);
    assert.match(literacyGame, /catch \(error\)[\s\S]*?setWorkspaceDisabled\(false\)/);
    assert.ok(literacyGame.includes("restart.textContent = '사건 기록을 받는 중…'"));
    assert.ok(literacyGame.includes("answerPanel?.setAttribute('aria-busy', 'true')"));
    assert.ok(literacyGame.includes('start.disabled = state.busy'));
    assert.equal(literacyGame.includes('showLiteracyAdventureGameSection'), false);
    assert.ok(literacyGame.includes('facade.createRound()'));
    assert.ok(literacyGame.includes('window.aiedueLiteracyAdventureData.submitAnswer(value)'));
    assert.match(literacyCss, /\.literacy-case-paragraph/);
    assert.match(literacyCss, /#literacy-adventure-response-guide/);
    assert.match(literacyCss, /\.literacy-detective-guide/);
    assert.match(literacyCss, /\.case-solved/);
    assert.match(literacyCss, /#literacy-adventure-feedback\.published/);
    assert.match(literacyCss, /\.literacy-adventure-answer\s*\{[^}]*scroll-margin-top:\s*184px/);

    const ordinaryPrompt = section(app, 'function generateLiteracyPrompt', 'function generateLiteracyDetectivePrompt');
    const detectivePrompt = section(app, 'function generateLiteracyDetectivePrompt', 'function parseAiQuestionResponse');
    assert.ok(ordinaryPrompt.includes('흥미롭고 유익한 읽기 지문'));
    assert.ok(ordinaryPrompt.includes('설명문/논설문 요소'));
    assert.equal(ordinaryPrompt.includes('추리형 독해 사건'), false);
    assert.equal(ordinaryPrompt.includes('두 가지 이상의 단서'), false);
    assert.ok(detectivePrompt.includes('추리형 독해 사건'));
    assert.ok(detectivePrompt.includes('두 가지 이상의 단서'));
    assert.ok(detectivePrompt.includes('지문에 직접 적힌 문장을 그대로 찾기만'));
    assert.ok(detectivePrompt.includes('객관식(4지선다형)'));
    assert.ok(detectivePrompt.includes('단답형'));
    assert.ok(detectivePrompt.includes('서술형'));
});

test('게임을 닫으면 홈이 아니라 해당 단계 내부 카드로 복원한다', () => {
    for (const [stage, sectionId] of Object.entries({
        1: 'drawing-activities-section', 2: 'hangul-activities-section',
        3: 'dictation-activities-section', 4: 'literacy-activities-section'
    })) {
        assert.ok(html.includes(`data-stage-game-entry="${stage}"`));
        assert.ok(app.includes(`'${stage}': '${sectionId}'`));
    }
    assert.ok(app.includes("target?.dataset?.stageGameEntry"));
    assert.ok(app.includes("showAiedueTopLevelSection(context?.sectionId || 'dashboard-section')"));
    assert.ok(app.includes("window.closeLiteracyAdventureGame"));
    assert.ok(app.includes('window.restoreAiedueLabReturnFocus'));
});

test('연구실 시간 퀴즈 보상은 한글 데이터 facade를 사용하고 수학 facade를 사용하지 않는다', () => {
    assert.ok(app.includes('window.aiedueKoreanLabTimeQuizData'));
    assert.equal(app.includes('window.aiedueKoreanLabTimeQuizData = window.aiedueMathData'), false);
    const commit = section(app, 'async function commitKoreanLabTimeQuizAttempt', 'window.aiedueAsteroidPersistence');
    assert.ok(commit.includes("'timeQuizAttemptReceipts'"));
    assert.ok(commit.includes('runTransaction(db'));
    assert.ok(commit.includes('receiptSnapshot.exists()'));
});

test('시간 퀴즈는 같은 문제의 저장 재시도에 같은 영수증 ID를 사용한다', () => {
    assert.match(timeQuizEntry, /function nextQuestion\(\)[\s\S]*state\.attemptId = createKoreanLabAttemptId\(\)/);
    assert.match(timeQuizEntry, /const attemptId = state\.attemptId;/);
});
