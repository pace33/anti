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

test('대시보드는 좁은 화면에서도 1~4단계를 한 줄로 유지하고 내 정보 배너를 왼쪽 아래에 둔다', () => {
    assert.ok(app.includes("document.body.classList.toggle('dashboard-view-active', sectionId === 'dashboard-section')"));
    assert.ok(app.includes("hud.classList.toggle('rpg-collapsed', !dashboardViewActive)"));
    assert.ok(appCss.includes('body.dashboard-view-active .aiedue-rpg-hud'));
    assert.ok(appCss.includes('bottom: max(18px, env(safe-area-inset-bottom)) !important'));
    assert.ok(appCss.includes('left: max(18px, calc((100vw - 1100px) / 2 + 18px)) !important'));
    const tablet = section(appCss, '@media (max-width: 992px)', '@media (max-width: 576px)');
    const mobile = section(appCss, '@media (max-width: 576px)', '/* Hermes drawing UX refinements */');
    assert.ok(tablet.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
    assert.ok(mobile.includes('grid-template-columns: repeat(4, minmax(0, 1fr))'));
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
    assert.match(labCss, /\.zoo-header,[\s\S]*?\.literacy-adventure-header\s*\{[^}]*z-index:\s*30/s);
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

test('각 게임은 해당 단계의 두 번째 활동 줄 두 번째 칸에 배치된다', () => {
    const contracts = [
        ['drawing-activities-section', 'dictation-activities-section', 'stage-1-game-shape', 'openAiedueLabShapeZoo()', '도형 동물원', 'openMyDrawingFromDashboard()', 'openFriendsDrawingGallery()'],
        ['hangul-activities-section', 'my-drawing-section', 'stage-2-game-asteroid', 'openAiedueLabDictationGame()', '낱말 우주 방어대', 'openLetterWritingActivity()', 'openReadingPracticeActivity()'],
        ['dictation-activities-section', 'literacy-activities-section', 'stage-3-game-word-card', 'openAiedueLabWordCardGame()', '단어 카드 한 판', 'openDictationPracticeActivity()', "openSharedWordCardRepository('dictation')"],
        ['literacy-activities-section', 'literacy-workspace-section', 'stage-4-game-literacy', 'openLiteracyAdventureGame()', '문해력 탐험대', 'openLiteracyLimitBreak()', "openSharedWordCardRepository('literacy')"]
    ];
    for (const [start, end, id, opener, title, secondRowFirst, secondRowThird] of contracts) {
        const stage = section(html, `id="${start}"`, `id="${end}"`);
        const firstIndex = stage.indexOf(secondRowFirst);
        const gameIndex = stage.indexOf(`id="${id}"`);
        const thirdIndex = stage.indexOf(secondRowThird);
        assert.ok(firstIndex >= 0, `${start} 두 번째 활동 줄 첫 카드 없음`);
        const secondGridStart = stage.lastIndexOf('<div class="grid grid-cols-1', firstIndex);
        assert.ok(secondGridStart >= 0, `${start} 두 번째 활동 그리드 없음`);
        const directChildren = directChildrenOfDivAt(stage, secondGridStart);
        assert.ok(gameIndex > firstIndex && gameIndex < thirdIndex, `${id}가 두 번째 활동 줄 두 번째 칸에 있지 않음`);
        assert.ok(directChildren[0]?.includes(secondRowFirst), `${start} 두 번째 활동 줄 첫 직접 자식이 바뀜`);
        assert.ok(directChildren[1]?.includes(`id="${id}"`), `${id}가 두 번째 직접 자식이 아님`);
        assert.ok(directChildren[2]?.includes(secondRowThird), `${start} 두 번째 활동 줄 세 번째 직접 자식이 바뀜`);
        assert.ok(stage.includes(opener), `${opener} 없음`);
        assert.ok(stage.includes(title), `${title} 없음`);
    }
    const literacy = section(html, 'id="literacy-activities-section"', 'id="literacy-workspace-section"');
    assert.doesNotMatch(literacy, /openAiedueLabTimeQuiz\(\)/);
    assert.equal((html.match(/data-stage-game-entry=/g) || []).length, 4);
});

test('4단계 게임은 기존 문해력 생성·채점·원자 저장 facade를 사용한다', () => {
    assert.ok(html.includes('id="literacy-adventure-game-section"'));
    assert.ok(html.includes('id="literacy-adventure-answer"'));
    assert.ok(html.includes('literacy-adventure-game.js'));
    assert.ok(html.includes('literacy-adventure.css'));
    assert.ok(app.includes("'literacy-adventure-game-section'"));
    assert.ok(app.includes('window.aiedueLiteracyAdventureData'));
    assert.ok(app.includes('const plan = getLiteracyDanPlan()'));
    assert.ok(app.includes('await createLiteracyMissionQuestion(plan.difficulty, plan.type)'));
    assert.ok(app.includes("question.type === 'multipleChoice'"));
    assert.ok(app.includes("question.type === 'shortAnswer'"));
    assert.ok(app.includes("question.type === 'essay'"));
    assert.ok(app.includes('const saved = await showLiteracyResult(isCorrect, {'));
    assert.ok(app.includes("if (!saved) throw new Error('결과를 저장하지 못했어요."));
    assert.ok(app.includes('persistLiteracyAttemptAtomic'));
    assert.ok(labCss.includes('#literacy-adventure-game-section.aiedue-lab-game-shell'));
    assert.ok(literacyCss.includes('z-index:30'));
    assert.ok(literacyGame.includes("round.type === 'multipleChoice'"));
    assert.ok(literacyGame.includes('facade.createRound()'));
    assert.ok(literacyGame.includes('window.aiedueLiteracyAdventureData.submitAnswer'));
    assert.equal(literacyGame.includes('aiedueKoreanLabTimeQuizData'), false);
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
