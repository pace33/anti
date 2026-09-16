import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeStudentNames, provisionStudentRows, summarizeProvisionRows, rosterMarkup, shopMarkup, buildNewStudentProfile } from '../classroom-tools-core.mjs';
import { createClassroomService } from '../classroom-service.js';

function fixture({ bootstrap = false } = {}) {
    const documents = new Map([['metadata/counters', { lastUserCode: 50 }], ['classes/teacher', { students: ['existing'] }]]);
    const identities = new Map();
    const primary = { uid: 'teacher' };
    const authFailures = new Map(), profileFailures = new Map(), events = [];
    let actor = { id: 'teacher', role: 'teacher' }, failCommit = false, authCalls = 0;
    const snapshot = path => ({ id: path.split('/').at(-1), exists: () => documents.has(path), data: () => structuredClone(documents.get(path)) });
    const api = {
        db: {}, doc: (_, ...parts) => parts.join('/'), collection: (_, path) => path,
        query: (...args) => args, where: (...args) => args,
        getDoc: async path => snapshot(path), getDocs: async () => ({ docs: [] }),
        serverTimestamp: () => 'now', current: () => actor,
        async runTransaction(_, fn) {
            const writes = [];
            const result = await fn({ get: async path => snapshot(path), set: (path, data, options) => writes.push({ path, data, options }) });
            if (failCommit && writes.some(w => w.path.startsWith('users/'))) { failCommit = false; throw new Error('connection lost'); }
            writes.forEach(w => documents.set(w.path, w.options?.merge ? { ...documents.get(w.path), ...w.data } : w.data));
            return result;
        },
        initializeApp: (_, name) => { assert.equal(name, 'classroom-student-signup'); return { name }; },
        getAuth: app => { assert.notEqual(app.name, '[DEFAULT]'); return { app, currentUser: null }; },
        setPersistence: async () => {}, inMemoryPersistence: 'memory',
        async createUserWithEmailAndPassword(auth, email) {
            authCalls++; events.push(`create:${email}`);
            if (authFailures.has(email)) { const error = authFailures.get(email); authFailures.delete(email); throw error; }
            if (identities.has(email)) throw Object.assign(new Error('collision'), { code: 'auth/email-already-in-use' });
            const user = { uid: `uid-${email}`, email, getIdToken: async () => `token:${email}` };
            identities.set(email, user); auth.currentUser = user; return { user };
        },
        async signInWithEmailAndPassword(auth, email) {
            events.push(`signin:${email}`);
            const user = identities.get(email);
            if (!user) throw Object.assign(new Error('missing'), { code: 'auth/user-not-found' });
            auth.currentUser = user; return { user };
        },
        signOut: async auth => { auth.currentUser = null; },
        notify: () => {}, safeImage: x => x
    };
    if (bootstrap) api.bootstrapStudentProfile = async ({ token, profile }) => {
        events.push(`profile:${profile.email}`);
        assert.equal(token, `token:${profile.email}`);
        if (profileFailures.has(profile.email)) { const error = profileFailures.get(profile.email); profileFailures.delete(profile.email); throw error; }
        documents.set(`users/${profile.uid}`, structuredClone(profile));
    };
    return {
        service: createClassroomService(api), documents, identities, primary, events,
        get authCalls() { return authCalls; },
        fail: () => { failCommit = true; },
        failAuth: (email, code = 'auth/too-many-requests') => authFailures.set(email, Object.assign(new Error('auth failed'), { code })),
        failProfile: email => profileFailures.set(email, new Error('profile rejected')),
        changeActor: value => { actor = value; }
    };
}

test('validates all names before signup and accepts distinct students with the same name', () => {
    assert.deepEqual(normalizeStudentNames([' 민수 ', '민수']), ['민수', '민수']);
    for (const names of [[], ['  '], ['가'.repeat(31)], Array(41).fill('학생')]) assert.throws(() => normalizeStudentNames(names));
});

test('bulk signup keeps teacher identity, uses unique login numbers, enrolls atomically', async () => {
    const f = fixture(), rows = [{ name: '민수' }, { name: '민수' }];
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.deepEqual(rows.map(r => [r.code, r.status]), [[51, 'complete'], [52, 'complete']]);
    assert.equal(f.primary.uid, 'teacher');
    assert.deepEqual(f.documents.get('classes/teacher').students, ['existing', ...rows.map(r => r.uid)]);
    const profile = f.documents.get(`users/${rows[0].uid}`);
    assert.equal(profile.teacherId, 'teacher'); assert.equal(profile.classId, 'teacher');
    assert.equal(profile.email, '51@abc.com'); assert.equal(profile.currentLearningStep, -1);
});

test('progress callback failures do not stop independent rows', async () => {
    const f = fixture(), rows = [{ name: '가' }, { name: '나' }];
    await provisionStudentRows(rows, f.service.studentService('teacher'), () => { throw new Error('storage full'); });
    assert.deepEqual(rows.map(row => row.status), ['complete', 'complete']);
});

test('partial commit failure retries the same Auth identity without duplicate enrollment', async () => {
    const f = fixture(), rows = [{ name: '가' }, { name: '나' }]; f.fail();
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.equal(rows[0].status, 'failed'); assert.equal(rows[1].status, 'complete');
    assert.equal(f.documents.has(`users/${rows[0].uid}`), false);
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.equal(f.authCalls, 2); assert.equal(rows[0].status, 'complete');
    assert.equal(new Set(f.documents.get('classes/teacher').students).size, 3);
});

test('a stale login counter never adopts an existing account', async () => {
    const f = fixture(); f.identities.set('51@abc.com', { uid: 'other-student' });
    const rows = [{ name: '새 학생' }];
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.equal(rows[0].status, 'failed'); assert.equal(rows[0].code, null); assert.equal(rows[0].uid, undefined);
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.equal(rows[0].code, 52); assert.equal(rows[0].status, 'complete');
});

test('authenticated bootstrap uses the secondary student token, then teacher enrollment, and retries profile only', async () => {
    const f = fixture({ bootstrap: true }), rows = [{ name: '가' }, { name: '나' }];
    f.failProfile('51@abc.com');
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.deepEqual(rows.map(row => [row.status, row.failureType]), [['failed', 'profile'], ['complete', '']]);
    assert.equal(rows[0].uid, 'uid-51@abc.com');
    assert.equal(rows[0].profileCreated, undefined);
    assert.equal(rows[1].profileCreated, true);
    assert.equal(f.primary.uid, 'teacher');
    assert.deepEqual(f.documents.get('classes/teacher').students, ['existing', rows[1].uid]);

    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.equal(rows[0].status, 'complete');
    assert.equal(rows[0].profileCreated, true);
    assert.equal(f.authCalls, 2, 'profile retry must retain both Auth accounts');
    assert.deepEqual(f.documents.get('classes/teacher').students, ['existing', rows[1].uid, rows[0].uid]);
    assert.equal(f.documents.get(`users/${rows[0].uid}`).teacherId, 'teacher');
    assert.ok(f.events.includes('signin:51@abc.com'));
});

test('duplicate, Auth, and profile failures are categorized without stopping later rows', async () => {
    const f = fixture({ bootstrap: true });
    f.identities.set('51@abc.com', { uid: 'occupied' });
    f.failAuth('52@abc.com');
    f.failProfile('53@abc.com');
    const rows = ['중복', '인증 실패', '프로필 실패', '성공'].map(name => ({ name }));
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.deepEqual(rows.map(row => row.status), ['failed', 'failed', 'failed', 'complete']);
    assert.deepEqual(rows.map(row => row.failureType), ['duplicate', 'auth', 'profile', '']);
    assert.deepEqual(rows.map(row => row.code), [null, 52, 53, 54]);
    assert.deepEqual(summarizeProvisionRows(rows), { complete: 1, failed: 3, pending: 0, total: 4 });
    assert.equal(f.documents.get(`users/${rows[3].uid}`).name, '성공');
    assert.ok(f.documents.get('classes/teacher').students.includes(rows[3].uid));
});

test('role and account changes fail every row independently before allocation', async () => {
    const f = fixture(); f.changeActor({ id: 'teacher', role: 'student' });
    const rows = [{ name: '가' }, { name: '나' }];
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    assert.deepEqual(rows.map(row => [row.status, row.failureType]), [['failed', 'auth'], ['failed', 'auth']]);
    assert.equal(f.authCalls, 0);
    f.changeActor({ id: 'other', role: 'teacher' });
    const more = [{ name: '다' }];
    await provisionStudentRows(more, f.service.studentService('teacher'));
    assert.deepEqual(more.map(row => row.failureType), ['auth']);
});

test('idempotent save preserves progress and rejects a different owner', async () => {
    const f = fixture(), rows = [{ name: '가' }];
    await provisionStudentRows(rows, f.service.studentService('teacher'));
    const path = `users/${rows[0].uid}`;
    f.documents.get(path).aeduLevel = 7;
    await f.service.studentService('teacher').saveAndEnroll(rows[0]);
    assert.equal(f.documents.get(path).aeduLevel, 7);
    f.documents.get(path).teacherId = 'other';
    await assert.rejects(f.service.studentService('teacher').saveAndEnroll(rows[0]));
});

test('print content escapes student names and product descriptions and has exactly three cells per row', () => {
    const roster = rosterMarkup([{ name: '<script>alert(1)</script>', userCode: '0012' }]);
    assert.ok(roster.includes('0012')); assert.ok(!roster.includes('<script>'));
    const items = Array.from({ length: 7 }, (_, i) => ({ name: `물품 ${i}`, description: '<img onerror=bad>', price: 1200, imageUrl: 'safe.png' }));
    const shop = shopMarkup(items, x => x);
    assert.equal((shop.match(/<tr>/g) || []).length, 3);
    assert.equal((shop.match(/<td/g) || []).length, 9);
    assert.ok(shop.includes('&lt;img onerror=bad&gt;')); assert.ok(shop.includes('1,200점'));
});

test('student initialization matches individual signup and leaves diagnostic placement unset', () => {
    const profile = buildNewStudentProfile({ uid: 'one', name: '학생', code: 42, timestamp: 'now' });
    assert.equal(profile.role, 'student'); assert.equal(profile.currentDictationStep, -1);
    assert.equal(profile.assignedLevel, undefined); assert.equal(profile.diagnosticStatus, undefined);
});
