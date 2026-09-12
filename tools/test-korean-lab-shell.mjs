import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [app, html, labCss, timeQuizEntry] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('korean-lab-shell.css', root), 'utf8'),
    readFile(new URL('korean-lab-time-quiz.js', root), 'utf8')
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

test('연구실 네 게임은 에이두 한글 공통 둥근 카드 셸을 쓴다', () => {
    for (const id of [
        'korean-lab-time-quiz-section',
        'shape-zoo-game-section',
        'word-card-table-game-section',
        'dictation-asteroid-game-section'
    ]) {
        assert.match(html, new RegExp(`id="${id}"[^>]*class="[^"]*aiedue-lab-game-shell`));
    }
    assert.ok(html.includes('href="korean-lab-shell.css'));
    assert.match(html, /<script\b[^>]*type="module"[^>]*src="app\.js\?v=[^"]+"/);
    assert.ok(html.includes('korean-lab-shell.css?v=20260912-lab-stage-v2'));
    assert.ok(html.includes('korean-lab-time-quiz.js?v=20260912-lab-stage-v2'));
    assert.ok(timeQuizEntry.includes("./korean-lab-time-quiz-core.mjs?v=20260909-3"));
    assert.ok(labCss.includes('width: min(95vw, 1200px) !important'));
    assert.ok(labCss.includes('border: 12px solid #fff !important'));
    assert.ok(labCss.includes('border-radius: 50px !important'));
    assert.ok(labCss.includes('height: min(750px, calc(100dvh - 124px))'));
    assert.ok(labCss.includes('body.aiedue-lab-game-open .aiedue-rpg-hud'));
    assert.ok(labCss.includes('bottom: max(12px, env(safe-area-inset-bottom)) !important'));
    assert.ok(labCss.includes('top: auto !important'));
    for (const id of ['shape-zoo-game-section', 'word-card-table-game-section', 'dictation-asteroid-game-section']) {
        assert.ok(labCss.includes(`#${id}.aiedue-lab-game-shell`));
    }
    assert.ok(labCss.includes('overflow-y: auto !important'));
});

test('로그인한 사용자의 내 정보 HUD는 연구실 게임에서도 숨기지 않는다', () => {
    const navigation = section(app, 'function showTopLevelSection', 'window.showAiedueTopLevelSection');
    assert.equal(navigation.includes('&& !isShapeZoo'), false);
    assert.equal(navigation.includes('&& !isWordCardGame'), false);
    assert.equal(navigation.includes("'dictation-asteroid-game-section'].includes"), false);
    const hud = section(app, 'function setRpgHudVisible', 'function removeDeprecatedRpgWordBankActions');
    assert.equal(hud.includes("word-card-table-open"), false);
});

test('연구실 시간 퀴즈 보상은 한글 데이터 facade를 사용하고 수학 facade를 사용하지 않는다', () => {
    assert.ok(app.includes('window.aiedueKoreanLabTimeQuizData'));
    assert.equal(app.includes('window.aiedueKoreanLabTimeQuizData = window.aiedueMathData'), false);
    const commit = section(app, 'async function commitKoreanLabTimeQuizAttempt', 'window.aiedueAsteroidPersistence');
    assert.ok(commit.includes("'timeQuizAttemptReceipts'"));
    assert.ok(commit.includes('runTransaction(db'));
    assert.ok(commit.includes('receiptSnapshot.exists()'));
    assert.ok(commit.includes('duplicate: true'));
    assert.ok(commit.includes('const experienceTotal = normalizedLevel.aeduExperience + reward'));
    assert.equal(commit.includes('calculateStageExperienceMultiplier'), false);
});

test('시간 퀴즈는 같은 문제의 저장 재시도에 같은 영수증 ID를 사용한다', () => {
    assert.match(timeQuizEntry, /function nextQuestion\(\)[\s\S]*state\.attemptId = createKoreanLabAttemptId\(\)/);
    assert.match(timeQuizEntry, /const attemptId = state\.attemptId;/);
    const checkAnswer = timeQuizEntry.slice(timeQuizEntry.indexOf('async function checkAnswer'), timeQuizEntry.indexOf('window.openKoreanLabTimeQuiz'));
    assert.doesNotMatch(checkAnswer, /const attemptId = createKoreanLabAttemptId\(\)/);
});

test('각 단계 카드 아래에 해당 연구소 게임이 배치되고 공통 한글 브랜드를 쓴다', () => {
    for (const [step, opener, title] of [
        [1, 'openAiedueLabShapeZoo()', '도형 동물원'],
        [2, 'openAiedueLabDictationGame()', '낱말 우주 방어대'],
        [3, 'openAiedueLabWordCardGame()', '단어 카드 한 판'],
        [4, 'openAiedueLabTimeQuiz()', '시간 퀴즈']
    ]) {
        const columnStart = html.indexOf(`id="card-level-${step}"`);
        const columnEnd = html.indexOf('</div>', columnStart);
        const column = html.slice(columnStart, columnEnd);
        assert.ok(column.includes(opener), `${step}단계 연구소 진입점 없음`);
        assert.ok(column.includes(title), `${step}단계 연구소 제목 없음`);
    }
    assert.equal((html.match(/class="dashboard-stage-column"/g) || []).length, 4);
    assert.equal((html.match(/class="dashboard-lab-card"/g) || []).length, 4);
    assert.ok(labCss.includes('.aiedue-lab-brand > img'));
});

test('연구소 게임을 닫으면 해당 단계 카드로 키보드 포커스를 복원한다', () => {
    for (const id of ['dashboard-lab-shape', 'dashboard-lab-asteroid', 'dashboard-lab-word-card', 'dashboard-lab-time']) {
        assert.ok(html.includes(`id="${id}"`), `포커스 대상 없음: ${id}`);
        assert.ok(app.includes(`'${id}'`), `포커스 기억 연결 없음: ${id}`);
    }
    assert.ok(app.includes('window.restoreAiedueLabReturnFocus'));
    assert.ok(app.includes('const currentTarget = target?.isConnected ? target : document.getElementById(fallbackId)'));
    assert.ok(app.includes('currentTarget?.focus?.()'));
    assert.ok(app.includes('document.activeElement === document.body) focusTarget()'));
});
