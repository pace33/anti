import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const appUrl = new URL('../app.js', import.meta.url);
const source = await readFile(appUrl, 'utf8');
const between = (start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert.ok(from >= 0 && to > from, `missing source section: ${start}`);
    return source.slice(from, to);
};

const facadeSection = between(
    "const AIEDUE_ASTEROID_LEADERBOARD_COLLECTION",
    'function getVisibleActivityExperienceTarget'
);
const commitSection = between('async function commitAsteroidRun', 'async function loadAsteroidLeaderboard');
const loadSection = between('async function loadAsteroidLeaderboard', 'window.aiedueAsteroidPersistence');

// Public contract is deliberately tiny and immutable.
assert.match(source, /window\.aiedueAsteroidPersistence\s*=\s*Object\.freeze\(\{\s*getCurrentPlayer:\s*getCurrentAsteroidPlayer,\s*commitRun:\s*commitAsteroidRun,\s*loadLeaderboard:\s*loadAsteroidLeaderboard\s*\}\);/s);
assert.match(commitSection, /async function commitAsteroidRun\(runId, destroyedCount\)/);
assert.match(commitSection, /AIEDUE_ASTEROID_RUN_ID_PATTERN\.test\(safeRunId\)/);
assert.match(commitSection, /!Number\.isInteger\(destroyedCount\)[\s\S]*destroyedCount < 0[\s\S]*destroyedCount > 60/);
assert.match(commitSection, /if \(!player\) return Object\.freeze\(\{ saved: false \}\)/);

// Persistence uses only the already-imported adapter surface, never direct Firestore APIs.
assert.doesNotMatch(facadeSection, /firebase\.firestore|firebase\.database|https:\/\/.*firestore|fetch\s*\(/i);
for (const adapterName of ['doc', 'collection', 'query', 'getDocs', 'orderBy', 'queryLimit', 'runTransaction', 'serverTimestamp']) {
    assert.match(source.slice(0, source.indexOf('from "./korean-data-adapter.js')), new RegExp(`\\b${adapterName}\\b`));
}

// One transaction reads user, receipt and leaderboard before any write.
assert.equal((commitSection.match(/runTransaction\s*\(/g) || []).length, 1);
const readRefs = [...commitSection.matchAll(/transaction\.get\((\w+)\)/g)].map((match) => match[1]);
assert.deepEqual(readRefs, ['userRef', 'receiptRef', 'leaderboardRef']);
const firstWrite = commitSection.indexOf('transaction.set(');
assert.ok(firstWrite > commitSection.indexOf('transaction.get(leaderboardRef)'), 'all reads must precede writes');
assert.deepEqual(
    [...commitSection.matchAll(/transaction\.set\((\w+)/g)].map((match) => match[1]),
    ['userRef', 'receiptRef', 'leaderboardRef']
);
assert.match(commitSection, /if \(receiptSnapshot\.exists\(\)\)[\s\S]*asteroidCanonicalResult\(receipt, true\)/);
assert.ok(commitSection.indexOf('if (receiptSnapshot.exists())') < firstWrite, 'duplicate exits before awarding/writing');
assert.match(commitSection, /xpAwarded:\s*destroyedCount/);
assert.match(commitSection, /experienceTotal\s*=\s*normalizedLevel\.aeduExperience \+ destroyedCount/);
assert.match(commitSection, /levelUps\s*=\s*Math\.floor\(experienceTotal \/ 100\)/);
assert.match(commitSection, /levelUpPoints\s*=\s*levelUps \* AIEDUE_LEVEL_UP_POINT_REWARD/);
assert.match(commitSection, /warningTokensReduced\s*=\s*Math\.min\(warningTokensBefore, levelUps\)/);
assert.match(commitSection, /isNewBest \? now : previous\.bestAchievedAt/);
assert.match(commitSection, /syncAsteroidProfileState\(transactionResult\.profile\)/);
assert.match(commitSection, /auth\.currentUser\?\.uid === player\.uid/);

// Hall of Fame query is deterministic and bounded at the persistence boundary.
assert.match(loadSection, /collection\(db, AIEDUE_ASTEROID_LEADERBOARD_COLLECTION\)/);
assert.match(loadSection, /orderBy\('bestDestroyed', 'desc'\)/);
assert.match(loadSection, /queryLimit\(100\)/);
assert.match(loadSection, /normalizeAsteroidLeaderboardRow\(entry\.data\(\) \|\| \{\}, entry\.id\)/);
assert.match(loadSection, /right\.bestDestroyed - left\.bestDestroyed/);
assert.match(loadSection, /timestampMillis\(left\.bestAchievedAt\) - timestampMillis\(right\.bestAchievedAt\)/);
assert.match(loadSection, /rows\.slice\(0, 10\)/);

// Execute the real pure row normalizer and prove it allowlists/normalizes public data.
const pureStart = facadeSection.indexOf("const AIEDUE_ASTEROID_RUN_ID_PATTERN");
const pureEnd = facadeSection.indexOf('function getCurrentAsteroidPlayer');
const pureSource = `${facadeSection.slice(pureStart, pureEnd)}\nglobalThis.normalizeRow = normalizeAsteroidLeaderboardRow;`;
const sandbox = {};
vm.runInNewContext(pureSource, sandbox);
const normalized = sandbox.normalizeRow({
    uid: 'u1', name: 'Pilot', icon: '🚀', bestDestroyed: 999, lastDestroyed: -1,
    totalDestroyed: 45, gamesPlayed: 3, bestRunId: '123e4567-e89b-12d3-a456-426614174000',
    bestAchievedAt: 10, updatedAt: 20, email: 'private@example.com', balance: 9999
});
assert.deepEqual(Object.keys(normalized), [
    'uid', 'name', 'icon', 'bestDestroyed', 'lastDestroyed', 'totalDestroyed',
    'gamesPlayed', 'bestRunId', 'bestAchievedAt', 'updatedAt'
]);
assert.equal(normalized.bestDestroyed, 60);
assert.equal(normalized.lastDestroyed, 0);
assert.equal('email' in normalized, false);
assert.equal('balance' in normalized, false);

console.log('asteroid persistence tests: ok (facade, validation, transaction, receipt, XP policy, allowlist, query)');
