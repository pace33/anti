import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    ASTEROID_GAME_DURATION_SECONDS,
    ASTEROID_WORDS,
    createAsteroidGameState,
    createAsteroidWordQueue,
    getAsteroidFallDuration,
    isAsteroidGameExpired,
    resolveAsteroidDeadline,
    resolveAsteroidHit
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
    assert.ok(app.includes('window.setupAsteroidTraceCanvas'));
    assert.ok(app.includes("'dictation-asteroid-game-section'"));
});

test('화면은 60초·한 글자 쓰기·다음 두 글자·연출·명예의 전당을 제공한다', () => {
    const screen = section(html, 'id="dictation-asteroid-game-section"', '<!-- [에이두 도서관');
    for (const marker of [
        'id="dictation-asteroid-field"', 'id="dictation-asteroid"', 'id="dictation-defense-line"',
        'id="dictation-aiedue-pilot"', 'id="dictation-asteroid-writing-canvas"', 'data-guide="가"',
        'id="dictation-game-time">60', 'id="dictation-next-word"', 'id="dictation-after-next-word"',
        'id="dictation-bgm-toggle"', 'id="dictation-score-pop"', 'id="dictation-explosion"',
        'id="dictation-leaderboard-list"', 'id="dictation-result-reward"', 'id="dictation-save-status"'
    ]) assert.ok(screen.includes(marker), `게임 화면 마커 없음: ${marker}`);
    assert.equal((screen.match(/id="dictation-explosion"[\s\S]*?<\/div>/)?.[0].match(/<i>/g) || []).length, 12);
    assert.ok(html.includes('dictation-asteroid-game.js?v=20260908-dictation-asteroid-v3'));
    assert.ok(game.includes("./dictation-asteroid-core.mjs?v=20260908-dictation-asteroid-v3"));
});

test('모든 낱말은 한글 한 음절이며 사용자 예시가 포함된다', () => {
    assert.equal(ASTEROID_GAME_DURATION_SECONDS, 60);
    assert.ok(ASTEROID_WORDS.length >= 50);
    assert.ok(ASTEROID_WORDS.every((word) => /^[가-힣]$/.test(word)));
    for (const word of ['가', '나', '다', '라', '와']) assert.ok(ASTEROID_WORDS.includes(word));
    assert.deepEqual(createAsteroidGameState(), { score: 0, streak: 0, maxStreak: 0, missed: 0, wave: 1, status: 'ready' });
});

test('현재·다음·다다음 큐는 연속 중복 없이 전진한다', () => {
    const samples = [0, .1, .2, .3, .4];
    let index = 0;
    const queue = createAsteroidWordQueue(['가', '나', '다'], () => samples[index++ % samples.length]);
    const first = queue.snapshot();
    assert.match(first.current, /^[가-힣]$/);
    assert.notEqual(first.current, first.next);
    assert.notEqual(first.next, first.afterNext);
    const advanced = queue.advance();
    assert.equal(advanced.current, first.next);
    assert.equal(advanced.next, first.afterNext);
    assert.notEqual(advanced.next, advanced.afterNext);
    assert.throws(() => createAsteroidWordQueue(['가']), /at least two/);
});

test('60초 마감 시각과 그 이후 완료 입력은 다음 화면 프레임 전에도 만료된다', () => {
    assert.equal(isAsteroidGameExpired(60_000, 59_999.99), false);
    assert.equal(isAsteroidGameExpired(60_000, 60_000), true);
    assert.equal(isAsteroidGameExpired(60_000, 60_001), true);
    assert.ok(game.includes('if (isAsteroidGameExpired(gameDeadline, now))'));
});

test('격추는 점수·현재/최고 연속을 올리고 놓침은 종료 없이 놓친 수만 올린다', () => {
    assert.deepEqual(resolveAsteroidHit({ score: 4, streak: 3, maxStreak: 7, missed: 2, wave: 5 }), {
        score: 5, streak: 4, maxStreak: 7, missed: 2, wave: 6, status: 'playing'
    });
    assert.deepEqual(resolveAsteroidDeadline({ score: 4, streak: 3, maxStreak: 6, missed: 2, wave: 5 }), {
        score: 4, streak: 0, maxStreak: 6, missed: 3, wave: 6, status: 'playing'
    });
    assert.equal(getAsteroidFallDuration(0), 10500);
    assert.ok(getAsteroidFallDuration(20) < getAsteroidFallDuration(2));
    assert.equal(getAsteroidFallDuration(999), 4200);
});

test('한 글자 완료가 미사일·폭발·점수와 다음 큐로 이어진다', () => {
    assert.ok(game.includes("addEventListener('tracewritingcomplete', launchMissile)"));
    for (const marker of ['launchMissile', 'destroyAsteroid', "resolveAsteroidHit(state)", "wordQueue.advance()", "'is-firing'", "'is-destroyed'", "'is-active'", "'is-visible'"]) {
        assert.ok(game.includes(marker), `컨트롤러 마커 없음: ${marker}`);
    }
    assert.ok(css.includes('@keyframes dictation-ship-float'));
    assert.ok(css.includes('@keyframes dictation-missile-trail'));
    assert.ok(css.includes('@keyframes dictation-particle-burst'));
    assert.match(css, /\.dictation-spaceship-dome img[^{]*\{[^}]*object-position:\s*50% 42%/s);
});

test('Web Audio BGM은 시작 클릭 이후 재생되고 종료 시 정리된다', () => {
    assert.ok(game.includes('window.AudioContext || window.webkitAudioContext'));
    assert.ok(game.includes('startBgm();'));
    assert.ok(game.includes('window.setInterval(playBgmBeat, 240)'));
    assert.ok(game.includes("stopBgm({ close: true })"));
    assert.ok(game.includes("elements.bgmToggle.addEventListener('click', toggleBgm)"));
});

test('전체시간 종료가 결과 저장·XP·명예의 전당 갱신으로 연결된다', () => {
    assert.ok(game.includes('gameDeadline = performance.now() + gameRemaining'));
    assert.ok(game.includes('if (!updateTotalClock(now)) return finishGame()'));
    assert.ok(game.includes('persistence.commitRun(completedRunId, score)'));
    assert.ok(game.includes('result.xpAwarded'));
    assert.ok(game.includes('refreshLeaderboard'));
    assert.ok(game.includes('bestDestroyed'));
    assert.ok(html.includes('id="dictation-save-retry"'));
    assert.ok(game.includes('saveRunResult(completedRun.runId, completedRun.score, lifecycleGeneration)'));
});

test('백그라운드 일시정지와 이탈 시 타이머·음성·오디오를 정리한다', () => {
    assert.ok(game.includes("document.addEventListener('visibilitychange'"));
    assert.ok(game.includes('pendingResolution.remaining'));
    assert.ok(game.includes('gameRemaining = Math.max(0, gameDeadline - now)'));
    assert.ok(game.includes('gameDeadline = now + gameRemaining'));
    assert.ok(game.includes('window.stopAsteroidDictationGame'));
    assert.ok(game.includes('window.cancelSpeech?.()'));
    assert.ok(app.includes('window.stopAsteroidDictationGame?.()'));
});

test('모바일 폭과 reduced motion 보호 규칙이 있다', () => {
    assert.ok(css.includes('@media (max-width: 520px)'));
    assert.ok(css.includes('grid-template-rows: 300px'));
    assert.ok(css.includes('min-height: 230px'));
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
});
