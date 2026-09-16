import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createTeacherTutorialController, TEACHER_TUTORIAL_STEPS } from '../teacher-tutorial-core.mjs';

function harness(overrides = {}) {
    let uid = 'teacher-a';
    const prepared = [], activated = [], closed = [], completed = [];
    const controller = createTeacherTutorialController({
        session: () => uid, open() {}, render() {}, close: value => closed.push(value),
        prepare: async step => { prepared.push(step.id); },
        activate: async action => { activated.push(action); },
        complete: async id => { completed.push(id); }, ...overrides
    });
    return { controller, prepared, activated, closed, completed, setUid: value => { uid = value; } };
}
async function reach(controller, id) {
    for (let tries = 0; tries < TEACHER_TUTORIAL_STEPS.length; tries++) {
        const { step } = controller.state();
        if (step.id === id) return;
        if (step.click) await controller.activate(step.click);
        else await controller.next();
    }
    assert.fail(`Could not reach ${id}`);
}

test('all 22 teacher lines run in order and completion saves only at the final exit', async () => {
    const h = harness(); await h.controller.start();
    await reach(h.controller, 'goodbye');
    assert.equal(h.prepared.length, 22);
    assert.deepEqual(h.prepared, TEACHER_TUTORIAL_STEPS.map(step => step.id));
    assert.deepEqual(h.activated, ['class', 'new-students']);
    assert.deepEqual(h.completed, []);
    await h.controller.next();
    assert.deepEqual(h.completed, ['teacher-a']);
    assert.deepEqual(h.closed, [{ completed: true }]);
});

test('class and new-student steps require their specific highlighted button', async () => {
    const h = harness(); await h.controller.start(); await reach(h.controller, 'open-class');
    await h.controller.next(); await h.controller.activate('new-students');
    assert.equal(h.controller.state().step.id, 'open-class');
    await h.controller.activate('class');
    assert.equal(h.controller.state().step.id, 'add-students');
    await h.controller.next();
    assert.equal(h.controller.state().step.id, 'add-students');
    await h.controller.activate('new-students');
    assert.equal(h.controller.state().step.id, 'student-dialog');
});

test('a slow action cannot be double-clicked or advance after cancellation', async () => {
    let resolve;
    const h = harness({ activate: () => new Promise(done => { resolve = done; }) });
    await h.controller.start(); await reach(h.controller, 'open-class');
    const pending = h.controller.activate('class');
    await h.controller.activate('class');
    assert.equal(h.controller.state().step.id, 'open-class');
    h.controller.stop(); resolve(); await pending;
    assert.equal(h.controller.state().active, false);
    assert.equal(h.controller.state().step.id, 'open-class');
    assert.deepEqual(h.completed, []);
});

test('account changes abort pending steps and cannot save another teacher completion', async () => {
    let resolve;
    const h = harness({ activate: () => new Promise(done => { resolve = done; }) });
    await h.controller.start(); await reach(h.controller, 'open-class');
    const pending = h.controller.activate('class'); h.setUid('teacher-b'); resolve(); await pending;
    assert.equal(h.controller.state().active, false);
    assert.deepEqual(h.completed, []);
});

test('failed screen preparation remains retryable and cannot be skipped', async () => {
    let fail = true;
    const h = harness({ prepare: async step => { if (step.id === 'introduce' && fail) throw new Error('offline'); } });
    await h.controller.start(); await h.controller.next();
    assert.equal(h.controller.state().error, 'offline');
    await h.controller.next(); assert.equal(h.controller.state().step.id, 'introduce');
    fail = false; await h.controller.retry(); assert.equal(h.controller.state().error, '');
    await h.controller.next(); assert.equal(h.controller.state().step.id, 'experience');
});

test('failed final save leaves the guide open and allows a retry', async () => {
    let fail = true, saves = 0;
    const h = harness({ complete: async () => { if (fail) throw new Error('save failed'); saves++; } });
    await h.controller.start(); await reach(h.controller, 'goodbye'); await h.controller.next();
    assert.equal(h.controller.state().active, true);
    fail = false; await h.controller.retry(); await h.controller.next();
    assert.equal(saves, 1); assert.equal(h.controller.state().active, false);
});

test('previous and replay restore the proper screen and restart from the greeting', async () => {
    const h = harness(); await h.controller.start(); await reach(h.controller, 'money-dialog');
    await h.controller.previous(); assert.equal(h.controller.state().step.view, 'shop');
    h.controller.stop(); await h.controller.start(); assert.equal(h.controller.state().step.id, 'hello');
});

test('unauthenticated sessions cannot start a guide', async () => {
    const h = harness(); h.setUid(null); await h.controller.start(); assert.equal(h.controller.state().active, false);
});

test('skip saves completion and closes the guide from any step', async () => {
    const h = harness(); await h.controller.start(); await h.controller.next();
    await h.controller.skip();
    assert.deepEqual(h.completed, ['teacher-a']);
    assert.deepEqual(h.closed, [{ completed: true }]);
    assert.equal(h.controller.state().active, false);
});

test('teacher copy uses respectful wording and the guide exposes a skip control', () => {
    assert.equal(TEACHER_TUTORIAL_STEPS[0].text, '안녕하세요, 선생님. 늘 아이들을 정성껏 지도해 주셔서 감사합니다.');
    assert.equal(TEACHER_TUTORIAL_STEPS[1].text, '저는 선생님의 수업 준비 부담을 덜어 드리고, 아이들의 한글 학습을 돕는 에이두입니다.');
    const tutorialUi = readFileSync(new URL('../teacher-tutorial.js', import.meta.url), 'utf8');
    assert.match(tutorialUi, /class="teacher-tour-skip">안내 건너뛰기<\/button>/);
    assert.match(tutorialUi, /controller\.skip\(\)/);
});

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const adapterSource = app.slice(app.indexOf('function createTeacherTutorialActions()'), app.indexOf('teacherTutorial = installTeacherTutorial('));
test('real adapter opens read-only dialogs, switches tabs, and restores the collapsed HUD', async () => {
    const calls = [], dialogs = [];
    const classList = { hidden: true, contains() { return this.hidden; } };
    const hud = { classList: { contains: () => true, toggle: (_, value) => calls.push(['collapsed', value]) }, querySelector: () => ({ setAttribute() {} }) };
    const context = {
        loginSuccess: true, currentUserRole: 'teacher', currentUserId: 't', auth: { currentUser: { uid: 't' } },
        teacherTutorial: { state: () => ({ active: true }) }, showDashboardOnly: () => calls.push('dashboard'),
        document: { getElementById: id => id === 'class-management-modal' ? { classList } : hud, querySelector: () => null },
        window: {
            openClassManagement: async () => { classList.hidden = false; calls.push('class'); },
            closeClassManagement: () => { classList.hidden = true; calls.push('close-class'); },
            selectClassManagementTab: async tab => calls.push(tab),
            openNewClassStudents: () => { const d = { open: true, close() { this.open = false; } }; dialogs.push(d); return d; },
            openClassCurrency: () => { const d = { open: true, close() { this.open = false; } }; dialogs.push(d); return d; }
        }
    };
    vm.createContext(context); vm.runInContext(adapterSource, context);
    const actions = context.createTeacherTutorialActions(), snapshot = actions.capture();
    for (const id of ['rewards', 'student-dialog', 'points', 'progress', 'shop', 'money-dialog', 'explore']) {
        await actions.prepare(TEACHER_TUTORIAL_STEPS.find(step => step.id === id), 't');
    }
    assert.deepEqual(calls, ['dashboard', ['collapsed', false], 'class', 'points', 'progress', 'shop', 'close-class', 'dashboard']);
    assert.ok(dialogs.every(dialog => !dialog.open));
    actions.restore(snapshot); assert.deepEqual(calls.at(-2), ['collapsed', true]);
});
