import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const [app, shapeZoo, asteroid, wordCard, literacy] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('shape-zoo-game.js', root), 'utf8'),
    readFile(new URL('dictation-asteroid-game.js', root), 'utf8'),
    readFile(new URL('word-card-table-game.js', root), 'utf8'),
    readFile(new URL('literacy-adventure-game.js', root), 'utf8')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

const reportSource = section(app, 'const KOREAN_STAGE_GAMES', 'function getStoredKoreanAttempts');
const context = { escapeHtml: (value) => String(value) };
vm.createContext(context);
vm.runInContext(`${reportSource}\nthis.normalizeStats = normalizeKoreanStageGameStats; this.renderReport = renderKoreanStageGameReport;`, context);

const summarySource = section(app, 'function summarizeKoreanAttempts', 'function recommendKoreanLessons');
const gameMetadataSource = section(app, 'const KOREAN_STAGE_GAMES', 'function normalizeKoreanStageGameStats');
const summaryContext = {
    currentUserName: '학생',
    recommendKoreanLessons: () => [],
    getLessonTitleForReport: (id) => String(id),
    Math, Number, Object, Set, String, Array
};
vm.createContext(summaryContext);
vm.runInContext(`${gameMetadataSource}\n${summarySource}\nthis.summarize = summarizeKoreanAttempts;`, summaryContext);

test('네 단계 게임의 누적 성공률을 정확히 계산한다', () => {
    const stats = context.normalizeStats({
        'shape-zoo': { successes: 8, attempts: 10, plays: 2 },
        'dictation-asteroid': { successes: 15, attempts: 20, plays: 1 },
        'word-card-table': { successes: 7, attempts: 10, plays: 2 },
        'literacy-detective': { successes: 3, attempts: 5, plays: 5 }
    });
    assert.equal(stats['shape-zoo'].successRate, 80);
    assert.equal(stats['dictation-asteroid'].successRate, 75);
    assert.equal(stats['word-card-table'].successRate, 70);
    assert.equal(stats['literacy-detective'].successRate, 60);
});

test('기록이 없거나 잘못된 누계는 안전하게 정규화한다', () => {
    const stats = context.normalizeStats({ 'shape-zoo': { successes: 8, attempts: 3, plays: -2 } });
    assert.equal(stats['shape-zoo'].successes, 3);
    assert.equal(stats['shape-zoo'].successRate, 100);
    assert.equal(stats['shape-zoo'].plays, 0);
    assert.equal(stats['word-card-table'].successRate, null);
    const html = context.renderReport({ koreanStageGameStats: {} }, 3);
    assert.match(html, /3단계 게임/);
    assert.match(html, /단어 카드 한 판/);
    assert.match(html, /기록 없음/);
});

test('같은 실행 ID의 여러 라운드는 성공·시도만 더하고 게임 판수는 한 번만 센다', () => {
    const attempts = [
        { studentId: 's1', attemptSource: 'stage-game', gameId: 'shape-zoo', runId: 'run-a', successCount: 1, attemptCount: 1, createdAt: '2026-09-14T01:00:00Z' },
        { studentId: 's1', attemptSource: 'stage-game', gameId: 'shape-zoo', runId: 'run-a', successCount: 0, attemptCount: 1, createdAt: '2026-09-14T01:01:00Z' },
        { studentId: 's1', attemptSource: 'stage-game', gameId: 'shape-zoo', runId: 'run-b', successCount: 1, attemptCount: 1, createdAt: '2026-09-14T02:00:00Z' }
    ];
    const result = summaryContext.summarize('s1', attempts).gameStats['shape-zoo'];
    assert.equal(result.successes, 2);
    assert.equal(result.attempts, 3);
    assert.equal(result.plays, 2);
});

test('같은 게임 실행의 판정들은 runId를 공유하되 서로 다른 attemptId를 사용한다', async () => {
    const recorderSource = section(app, 'window.recordKoreanStageGameResult', 'window.buildKoreanStudentReport');
    const captured = [];
    let sequence = 0;
    const recorderContext = {
        window: {},
        auth: { currentUser: { uid: 'student-1' } },
        currentUserId: 'student-1',
        KOREAN_STAGE_GAMES: { 'shape-zoo': { stage: 1, title: '도형 동물원' } },
        crypto: { randomUUID: () => `attempt-${++sequence}` },
        persistKoreanStageGameResult: (payload) => {
            captured.push(payload);
            return Promise.resolve(payload);
        },
        Math, Number, String, Promise
    };
    vm.createContext(recorderContext);
    vm.runInContext(recorderSource, recorderContext);
    await recorderContext.window.recordKoreanStageGameResult({ gameId: 'shape-zoo', successCount: 1, runId: 'shared-run' });
    await recorderContext.window.recordKoreanStageGameResult({ gameId: 'shape-zoo', successCount: 0, runId: 'shared-run' });
    assert.equal(captured[0].runId, 'shared-run');
    assert.equal(captured[1].runId, 'shared-run');
    assert.notEqual(captured[0].attemptId, captured[1].attemptId);
});

test('교사 단계별 진도 행과 네 상세 리포트에 게임 성공률이 연결된다', () => {
    const rows = section(app, 'function renderTeacherClassProgressRows', 'function formatClassActivityTime');
    const details = section(app, 'window.openStudentProgressDetail', 'window.toggleLevelLock');
    assert.match(rows, /aria-label="단계별 게임 성공률"/);
    assert.match(rows, /getKoreanStageGameReport\(student, stage\)/);
    assert.match(details, /renderKoreanStageGameReport\(student, stage\)/);
    assert.match(details, /type === 'drawing'[\s\S]*?stage = 1/);
    assert.match(details, /type === 'hangul'[\s\S]*?stage = 2/);
    assert.match(details, /type === 'dictation'[\s\S]*?stage = 3/);
    assert.match(details, /let stage = 4/);
});

test('네 게임의 실제 판정 지점이 단계별 게임 기록 API를 호출한다', () => {
    const shapeSubmit = shapeZoo.slice(shapeZoo.indexOf('function submit('), shapeZoo.indexOf('function react('));
    const shapeReact = shapeZoo.slice(shapeZoo.indexOf('function react('), shapeZoo.indexOf('function tick('));
    const wordPlay = wordCard.slice(wordCard.indexOf('function play('), wordCard.indexOf('function reveal('));
    const wordReveal = wordCard.slice(wordCard.indexOf('function reveal('), wordCard.indexOf('function tick('));
    assert.match(shapeSubmit, /gameId: 'shape-zoo'[\s\S]*successCount: verdict\.passed \? 1 : 0[\s\S]*runId: gameRunId/);
    assert.doesNotMatch(shapeReact, /recordKoreanStageGameResult/);
    assert.match(asteroid, /gameId: 'dictation-asteroid'[\s\S]*successCount: state\.score[\s\S]*attemptCount: state\.score \+ state\.missed[\s\S]*runId/);
    assert.match(wordPlay, /gameId: 'word-card-table'[\s\S]*successCount: result\.correct \? 1 : 0[\s\S]*runId: gameRunId/);
    assert.doesNotMatch(wordReveal, /recordKoreanStageGameResult/);
    assert.match(literacy, /gameId: 'literacy-detective'[\s\S]*successCount: result\.isCorrect \? 1 : 0[\s\S]*runId: state\.runId/);
});

test('게임 기록은 일반 배움 지표와 숙련도에서 분리되고 저장 실패를 안전하게 재시도한다', () => {
    assert.match(app, /const learningAttempts = studentAttempts\.filter\(\(attempt\) => attempt\.attemptSource !== 'stage-game' && !attempt\.gameId\)/);
    assert.match(app, /if \(rawAttempt\.attemptSource === 'stage-game' \|\| rawAttempt\.gameId\) return;/);
    assert.match(app, /renderKoreanRecordDashboard[\s\S]*attempt\.attemptSource !== 'stage-game' && !attempt\.gameId/);
    assert.match(app, /const koreanStageGameOutbox = new Map\(\)/);
    assert.match(app, /scheduleKoreanStageGameOutboxFlush/);
    const enqueueSource = section(app, 'function enqueueKoreanStageGameResult', 'function removeKoreanStageGameResult');
    assert.doesNotMatch(enqueueSource, /delete\(/);
    assert.match(app, /cloudErrorCode === 'permission-denied'[\s\S]*removeKoreanStageGameResult/);
    assert.match(app, /getKoreanStageGameOutbox\(\)\.some\(\(item\) => item\.studentId === activeStudentId\)/);
    assert.match(app, /enqueueKoreanStageGameResult\(payload\)[\s\S]*recordKoreanAttempt/);
    assert.match(app, /window\.addEventListener\('online',[\s\S]*flushKoreanStageGameOutbox/);
    assert.match(app, /attemptReceiptSnapshot = attemptReceiptRef \? await transaction\.get\(attemptReceiptRef\)/);
    assert.match(app, /runReceiptSnapshot = runReceiptRef \? await transaction\.get\(runReceiptRef\)/);
    assert.match(app, /const duplicateAttempt = Boolean\(attemptReceiptSnapshot\?\.exists\?\.\(\)\)/);
    assert.match(app, /transaction\.set\(attemptReceiptRef, attempt\)/);
    assert.match(app, /transaction\.set\(runReceiptRef,/);
    assert.match(app, /const isNewPlay = !attempt\.runId[\s\S]*?!runReceiptSnapshot\?\.exists\?\.\(\)/);
});
