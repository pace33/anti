import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [app, html, labCss, timeQuizEntry, literacyGame, literacyCss] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('korean-lab-shell.css', root), 'utf8'),
    readFile(new URL('korean-lab-time-quiz.js', root), 'utf8'),
    readFile(new URL('literacy-adventure-game.js', root), 'utf8').catch(() => ''),
    readFile(new URL('literacy-adventure.css', root), 'utf8').catch(() => '')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
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

test('홈에는 네 단계 카드만 있고 단계별 게임 카드를 노출하지 않는다', () => {
    const dashboard = section(html, 'id="dashboard-section"', 'id="drawing-activities-section"');
    for (const step of [1, 2, 3, 4]) assert.ok(dashboard.includes(`id="card-level-${step}"`));
    assert.doesNotMatch(dashboard, /id="dashboard-lab-/);
    assert.doesNotMatch(dashboard, /\bdashboard-lab-card\b/);
});

test('각 게임은 해당 단계 내부 2~3열 활동 영역에 배치된다', () => {
    const contracts = [
        ['drawing-activities-section', 'dictation-activities-section', 'stage-1-game-shape', 'openAiedueLabShapeZoo()', '도형 동물원'],
        ['hangul-activities-section', 'my-drawing-section', 'stage-2-game-asteroid', 'openAiedueLabDictationGame()', '낱말 우주 방어대'],
        ['dictation-activities-section', 'literacy-activities-section', 'stage-3-game-word-card', 'openAiedueLabWordCardGame()', '단어 카드 한 판'],
        ['literacy-activities-section', 'literacy-workspace-section', 'stage-4-game-literacy', 'openLiteracyAdventureGame()', '문해력 탐험대']
    ];
    for (const [start, end, id, opener, title] of contracts) {
        const stage = section(html, `id="${start}"`, `id="${end}"`);
        assert.ok(stage.includes('stage-game-grid'), `${start} 게임 그리드 없음`);
        assert.ok(stage.includes(`id="${id}"`), `${id} 없음`);
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
