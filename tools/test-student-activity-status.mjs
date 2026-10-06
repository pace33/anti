import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildActivityStatusSnapshot, formatActivityStatusChange } from '../student-activity-status.mjs';

const before = { aeduLevel: 1, aeduExperience: 95, balance: 2000, warningTokens: 2 };
const after = { aeduLevel: 2, aeduExperience: 5, balance: 3000, warningTokens: 1 };

test('level-up: show awarded XP, new level/percentage, money and remaining warnings', () => {
  const log = { ...buildActivityStatusSnapshot(before, after), grantedExperience: 10 };
  const text = formatActivityStatusChange(log);
  assert.match(text, /경험치 \+10\.0% → Lv\.2 5\.0%/);
  assert.match(text, /Lv\.1 95\.0%에서/);
  assert.match(text, /돈 \+1,000점 → 3,000점 \(2,000점에서\)/);
  assert.match(text, /주의토큰 -1개 → 1개 \(2개에서\)/);
  assert.deepEqual(JSON.parse(JSON.stringify(log)), log);
});
test('multiple level-ups and zero-warning floor are not mistaken for XP loss', () => {
  const log = buildActivityStatusSnapshot(before, { ...after, aeduLevel: 4, aeduExperience: 15, balance: 5000, warningTokens: 0 });
  assert.match(formatActivityStatusChange(log), /경험치 \+220\.0% → Lv\.4 15\.0%/);
  assert.match(formatActivityStatusChange(log), /주의토큰 -2개 → 0개/);
});
test('teacher warning addition and clamped money deduction show actual deltas and totals', () => {
  assert.equal(formatActivityStatusChange(buildActivityStatusSnapshot({ warningTokens: 1 }, { warningTokens: 3 })), '주의토큰 +2개 → 3개 (1개에서)');
  assert.equal(formatActivityStatusChange(buildActivityStatusSnapshot({ balance: 50 }, { balance: 0 })), '돈 -50점 → 0점 (50점에서)');
});
test('fractional XP and money aliases round-trip without drifting', () => {
  assert.equal(formatActivityStatusChange(buildActivityStatusSnapshot({ aeduLevel: 3, aeduExperience: 20.1 }, { aeduLevel: 3, aeduExperience: 20.43 })), '경험치 +0.3% → Lv.3 20.4% (Lv.3 20.1%에서)');
  assert.match(formatActivityStatusChange(buildActivityStatusSnapshot({ coins: 10 }, { aeduTokens: 30 })), /돈 \+20점 → 30점/);
});
test('legacy logs, absent/null/invalid values and unchanged amounts do not invent historical totals', () => {
  for (const log of [{ message: '기존 기록', grantedExperience: 5 }, {}, { experienceBefore: null, experienceAfter: 30 }, { balanceBefore: '', balanceAfter: 300 }, { balanceBefore: NaN, balanceAfter: 50 }]) {
    assert.equal(formatActivityStatusChange(log), '');
  }
  assert.equal(formatActivityStatusChange(buildActivityStatusSnapshot(before, before)), '');
  assert.deepEqual(buildActivityStatusSnapshot({}, {}), { statusSnapshotVersion: 1 });
});

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const a = source.indexOf(start); const b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
test('every existing XP and teacher-wallet producer captures event-time before/after values', () => {
  for (const [start, end] of [
    ['function applyAiedueExperienceReward', 'const AIEDUE_ASTEROID_LEADERBOARD_COLLECTION'],
    ['async function commitKoreanLabTimeQuizAttempt', 'window.aiedueAsteroidPersistence'],
    ['async function persistDrawingRecord', 'function normalizeFirebaseDrawingDoc'],
    ['function mergeLiteracyAttemptWithServer', 'async function persistLiteracyAttemptAtomic'],
    ['async function persistLiteracyReviewRewardAtomic', 'function applyCommittedLiteracyAttempt'],
    ['window.adjustStudentKoreanWallet =', 'window.openTeacherStudentAddPanel']
  ]) assert.match(section(start, end), /buildActivityStatusSnapshot\(/, start);
});
test('actual class-activity renderer appends snapshots but preserves old messages', () => {
  const sandbox = { humanizeLiteracyActivityText: x => String(x), formatActivityStatusChange };
  vm.runInNewContext(section('function getClassActivityMessage', 'function renderTeacherClassActivity') + '\nglobalThis.message = getClassActivityMessage;', sandbox);
  assert.equal(sandbox.message({ message: '기존 활동입니다.' }), '기존 활동입니다.');
  assert.match(sandbox.message({ message: '경험치를 받았다.', ...buildActivityStatusSnapshot(before, after) }), /경험치 \+10\.0% → Lv\.2 5\.0%/);
  assert.match(sandbox.message({ source: '퀴즈', ...buildActivityStatusSnapshot({ balance: 0 }, { balance: 100 }) }), /퀴즈 활동이 기록되었습니다\..*돈 \+100점 → 100점/s);
});

test('actual teacher transaction persists matching before/after and applied (not requested) delta', async () => {
  let profile = { name: '테스트', balance: 50, coins: 50, aeduTokens: 50, warningTokens: 1, koreanActivityLog: [] };
  const input = { value: '100' }; const notices = []; const writes = [];
  const sandbox = { window: {}, document: { getElementById: () => input }, db: {},
    currentUserId: 'teacher', currentUserName: '교사', currentUserProfileSnapshot: {},
    buildActivityStatusSnapshot, asNumber: (x, d) => Number.isFinite(Number(x)) ? Number(x) : d,
    doc: (...args) => ({ id: 'doc', args }), collection: (...args) => ({ args }),
    serverTimestamp: () => 'time', showModal: x => notices.push(x), escapeHtml: x => x, console,
    runTransaction: async (_db, callback) => callback({
      get: async () => ({ exists: () => true, data: () => profile }),
      set: (ref, data) => { writes.push({ ref, data }); if (data.koreanActivityLog) profile = { ...profile, ...data }; }
    }) };
  vm.runInNewContext(section('window.adjustStudentKoreanWallet =', 'window.openTeacherStudentAddPanel'), sandbox);
  await sandbox.window.adjustStudentKoreanWallet('student', 'money', -1);
  assert.equal(profile.balance, 0);
  assert.equal(profile.koreanActivityLog[0].delta, -50);
  assert.equal(profile.koreanActivityLog[0].balanceBefore, 50);
  assert.equal(profile.koreanActivityLog[0].balanceAfter, 0);
  assert.match(formatActivityStatusChange(profile.koreanActivityLog[0]), /돈 -50점 → 0점/);
  assert.equal(writes[1].data.nextBalance, 0);
  input.value = '2';
  await sandbox.window.adjustStudentKoreanWallet('student', 'warning', 1);
  assert.equal(profile.warningTokens, 3);
  assert.equal(profile.koreanActivityLog[0].warningTokensBefore, 1);
  assert.equal(profile.koreanActivityLog[0].warningTokensAfter, 3);
});
