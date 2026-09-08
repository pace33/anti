import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    ASTEROID_WORDS,
    createAsteroidGameState,
    getAsteroidFallDuration,
    resolveAsteroidDeadline
} from '../dictation-asteroid-core.mjs';

const [html, app, css, game] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../app.css', import.meta.url), 'utf8'),
    readFile(new URL('../dictation-asteroid-game.js', import.meta.url), 'utf8')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

test('연구실 허브에서 낱말 우주 방어 게임을 연다', () => {
    const lab = section(app, 'window.openAiedueLab =', 'window.openAiedueLabTimeQuiz');
    assert.ok(lab.includes('낱말 우주 방어대'));
    assert.ok(lab.includes('openAiedueLabDictationGame()'));
    const safeActions = section(app, 'const SAFE_MODAL_ACTIONS = new Set([', ']);');
    assert.ok(safeActions.includes("'openAiedueLabDictationGame'"));
    assert.ok(app.includes('window.setupAsteroidTraceCanvas'));
    assert.ok(app.includes("'dictation-asteroid-game-section'"));
    assert.ok(app.includes("window.showAiedueTopLevelSection = showTopLevelSection"));
    assert.ok(app.includes("!['start-screen', 'login-section', 'dictation-asteroid-game-section'].includes(sectionId)"));
});

test('게임 화면에는 소행성·방어선·에이두 우주선·2단계 따라쓰기판이 있다', () => {
    const screen = section(html, 'id="dictation-asteroid-game-section"', '<!-- [에이두 도서관');
    for (const marker of [
        'id="dictation-asteroid-field"',
        'id="dictation-asteroid"',
        'id="dictation-defense-line"',
        'id="dictation-aiedue-pilot"',
        'id="dictation-asteroid-writing-canvas"',
        '2단계 방식',
        '획순 따라쓰기'
    ]) assert.ok(screen.includes(marker), `게임 화면 마커 없음: ${marker}`);
    assert.ok(html.includes('dictation-asteroid-game.js'));
    assert.ok(css.includes('.dictation-asteroid-field'));
    assert.ok(css.includes('.dictation-asteroid-missile'));
});

test('따라쓰기 완료 이벤트가 미사일 격추로 연결된다', () => {
    assert.ok(game.includes("addEventListener('tracewritingcomplete'"));
    assert.ok(game.includes('launchMissile'));
    assert.ok(game.includes('destroyAsteroid'));
    assert.ok(game.includes('window.setupAsteroidTraceCanvas'));
    assert.ok(game.includes('requestAnimationFrame'));
});

test('공용 화면 전환·백그라운드 일시정지·TTS 종료를 안전하게 처리한다', () => {
    assert.ok(game.includes("window.showAiedueTopLevelSection?.('dictation-asteroid-game-section')"));
    assert.ok(game.includes('window.stopAsteroidDictationGame'));
    assert.ok(game.includes('window.cancelSpeech?.()'));
    assert.ok(game.includes('pendingResolution.remaining'));
    assert.ok(game.includes('scheduleResolution(pendingResolution.callback, pendingResolution.remaining)'));
    assert.ok(app.includes('window.stopAsteroidDictationGame?.()'));
});

test('낱말 목록과 게임 상태는 안전한 초기값을 가진다', () => {
    assert.ok(ASTEROID_WORDS.length >= 12);
    assert.ok(ASTEROID_WORDS.every((word) => /^[가-힣]{2,4}$/.test(word)));
    const state = createAsteroidGameState();
    assert.deepEqual(state, { score: 0, streak: 0, lives: 3, wave: 1, status: 'ready' });
});

test('연속 격추에 따라 낙하 시간이 줄지만 최소 시간이 보장된다', () => {
    assert.equal(getAsteroidFallDuration(0), 15000);
    assert.ok(getAsteroidFallDuration(8) < getAsteroidFallDuration(2));
    assert.equal(getAsteroidFallDuration(999), 6500);
});

test('방어선 통과 시 생명과 연속 기록이 감소하고 0이면 종료된다', () => {
    const continuing = resolveAsteroidDeadline({ score: 4, streak: 3, lives: 3, wave: 5, status: 'playing' });
    assert.deepEqual(continuing, { score: 4, streak: 0, lives: 2, wave: 6, status: 'playing' });
    const ended = resolveAsteroidDeadline({ score: 2, streak: 1, lives: 1, wave: 3, status: 'playing' });
    assert.deepEqual(ended, { score: 2, streak: 0, lives: 0, wave: 3, status: 'gameover' });
});
