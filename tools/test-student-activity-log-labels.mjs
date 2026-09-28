import assert from 'node:assert/strict';

const LITERACY_DIFFICULTY_LABELS = Object.freeze({
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
  expert: '도전'
});
const LITERACY_TYPE_LABELS = Object.freeze({
  multipleChoice: '객관식',
  shortAnswer: '단답형',
  essay: '서술형'
});
function getLiteracyDifficultyLabel(difficulty) {
  const key = String(difficulty || '').trim();
  return LITERACY_DIFFICULTY_LABELS[key] || key || '문해력';
}
function getLiteracyTypeLabel(type) {
  const key = String(type || '').trim();
  return LITERACY_TYPE_LABELS[key] || key || '활동';
}
function formatLiteracyActivityLabel(difficulty, type) {
  return `문해력 ${getLiteracyDifficultyLabel(difficulty)} ${getLiteracyTypeLabel(type)}`;
}
function humanizeLiteracyActivityText(text = '') {
  return String(text || '')
    .replace(/문해력\s+(easy|normal|hard|expert)\s+(multipleChoice|shortAnswer|essay)\s+활동/gi, (_match, difficulty, type) => `${formatLiteracyActivityLabel(String(difficulty).toLowerCase(), type)} 활동`)
    .replace(/\b(easy|normal|hard|expert)[-\s]+(multipleChoice|shortAnswer|essay)\b/gi, (_match, difficulty, type) => `${getLiteracyDifficultyLabel(String(difficulty).toLowerCase())} ${getLiteracyTypeLabel(type)}`);
}
function getActivityLogTimestampMs(log = {}) {
  const candidates = [log.createdAtMs, log.clientCreatedAtMs, log.solvedAt, log.createdAt, log.clientCreatedAt, log.timestamp, log.time, log.date, log.updatedAt];
  for (const value of candidates) {
    if (value == null || value === '') continue;
    if (typeof value?.toMillis === 'function') {
      const millis = value.toMillis();
      if (Number.isFinite(millis) && millis > 0) return millis;
    }
    if (Number.isFinite(Number(value?.seconds)) && Number(value.seconds) > 0) {
      const millis = Number(value.seconds) * 1000;
      if (Number.isFinite(millis) && millis > 0) return millis;
    }
    if (typeof value === 'number' || /^\d+$/.test(String(value).trim())) {
      const raw = Number(value);
      if (Number.isFinite(raw) && raw > 0) return raw < 100000000000 ? raw * 1000 : raw;
    }
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const idMatch = String(log.id || '').match(/(?:^|_)(\d{12,})(?:_|$)/);
  if (idMatch) {
    const fromId = Number(idMatch[1]);
    if (Number.isFinite(fromId) && fromId > 0) return fromId;
  }
  return 0;
}

assert.equal(formatLiteracyActivityLabel('easy', 'multipleChoice'), '문해력 쉬움 객관식');
assert.equal(humanizeLiteracyActivityText('김학생이 문해력 easy multipleChoice 활동을 했다.'), '김학생이 문해력 쉬움 객관식 활동을 했다.');
assert.equal(humanizeLiteracyActivityText('easy-multipleChoice'), '쉬움 객관식');
assert.equal(getActivityLogTimestampMs({ createdAt: { seconds: 1700000000 } }), 1700000000000);
assert.equal(getActivityLogTimestampMs({ solvedAt: '2026-09-28T12:34:00.000Z' }), Date.parse('2026-09-28T12:34:00.000Z'));
assert.equal(getActivityLogTimestampMs({ id: 'experience_1790559820595_abcd' }), 1790559820595);
console.log('student activity log label/time tests passed');
