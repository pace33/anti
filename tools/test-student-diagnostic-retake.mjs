import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { DIAGNOSTIC_CONTENT_VERSION, getUnlockedLevelsForPlacement } from '../student-onboarding-diagnostic-core.mjs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function section(start, end) {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from);
    assert(from >= 0 && to > from);
    return source.slice(from, to);
}
const entrySource = section('window.openRoleTutorial =', 'function openRoleOnboardingGuide');
const saveSource = section('async function persistStudentPlacement()', 'window.retryStudentPlacementSave');

test('manual tutorial replay starts an assessment for an already assessed student', () => {
    let options;
    const context = { window: {}, document: { activeElement: null }, loginSuccess: true, currentUserId: 'student', currentUserRole: 'student',
        currentUserProfileSnapshot: { assignedLevel: 2, diagnosticStatus: 'complete', diagnosticVersion: DIAGNOSTIC_CONTENT_VERSION },
        openStudentOnboarding: value => { options = value; }, openRoleOnboardingGuide: () => assert.fail('Student replay must reach assessment') };
    vm.runInNewContext(entrySource, context);
    context.window.openRoleTutorial();
    assert.equal(options.force, true);
    options = undefined;
    context.loginSuccess = false;
    context.window.openRoleTutorial();
    assert.equal(options, undefined);
});

test('teacher tutorial retains its teacher guide', () => {
    let role;
    const context = { window: {}, document: { activeElement: null }, loginSuccess: true, currentUserId: 'teacher', currentUserRole: 'teacher',
        openRoleOnboardingGuide: value => { role = value; }, openStudentOnboarding: () => assert.fail('Teacher must not receive student assessment') };
    vm.runInNewContext(entrySource, context);
    context.window.openRoleTutorial();
    assert.equal(role, 'teacher');
});

function saveHarness(retake) {
    let profile = { role: 'student', assignedLevel: 2, unlockedLevels: [1, 2], diagnosticStatus: 'complete', diagnosticVersion: DIAGNOSTIC_CONTENT_VERSION, coins: 750, teacherId: 'teacher' };
    let writes = 0;
    let closed = false;
    const context = {
        studentOnboardingUid: 'student', currentUserId: 'student', currentUserRole: 'student', auth: { currentUser: { uid: 'student' } },
        studentOnboardingState: { assignedLevel: 4, scores: { 4: 3 }, answeredQuestionIds: ['literacy-easy-1', 'literacy-easy-2', 'literacy-easy-3'] },
        studentOnboardingRetake: retake, studentOnboardingPersisting: false, currentUserProfileSnapshot: profile,
        DIAGNOSTIC_CONTENT_VERSION, getUnlockedLevelsForPlacement, db: {}, document: { getElementById: () => ({ classList: { add() {}, remove() {} } }) },
        console: { error() {} }, renderStudentOnboardingDialogue() {}, serverTimestamp: () => 'server-time', doc: () => 'users/student',
        deriveStageAccessFromProfile: value => value.unlockedLevels,
        runTransaction: async (_, callback) => callback({ get: async () => ({ exists: () => true, data: () => profile }),
            set: (_, payload, options) => { assert.equal(options.merge, true); profile = { ...profile, ...payload }; writes++; } }),
        getDoc: async () => ({ exists: () => true, data: () => profile }),
        updateDashboardExperience() {}, closeStudentOnboarding: () => { closed = true; }, showDashboardOnly() {}, showAiedueAutoToast() {}
    };
    vm.runInNewContext(saveSource, context);
    return { context, profile: () => profile, writes: () => writes, closed: () => closed };
}

test('retake replaces the old placement and scores while preserving classroom and balance', async () => {
    const h = saveHarness(true);
    await h.context.persistStudentPlacement();
    assert.equal(h.writes(), 1);
    assert.equal(h.profile().assignedLevel, 4);
    assert.deepEqual(Array.from(h.profile().unlockedLevels), [1, 2, 3, 4]);
    assert.equal(h.profile().diagnosticScores[4], 3);
    assert.equal(h.profile().teacherId, 'teacher');
    assert.equal(h.profile().coins, 750);
    assert.equal(h.closed(), true);
});

test('automatic initial assessment still preserves an existing placement', async () => {
    const h = saveHarness(false);
    await h.context.persistStudentPlacement();
    assert.equal(h.writes(), 0);
    assert.equal(h.profile().assignedLevel, 2);
});

test('failed retake keeps its answers and can retry saving', async () => {
    const h = saveHarness(true);
    const transaction = h.context.runTransaction;
    h.context.runTransaction = async () => { throw new Error('offline'); };
    await h.context.persistStudentPlacement();
    assert.equal(h.closed(), false);
    assert.equal(h.context.studentOnboardingPersisting, false);
    assert.equal(h.context.studentOnboardingState.assignedLevel, 4);
    assert.equal(h.profile().assignedLevel, 2);
    h.context.runTransaction = transaction;
    await h.context.persistStudentPlacement();
    assert.equal(h.profile().assignedLevel, 4);
    assert.equal(h.closed(), true);
});
