import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [app, adapter] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../korean-data-adapter.js', import.meta.url), 'utf8')
]);

const section = (start, end) => {
    const from = app.indexOf(start);
    const to = app.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, `missing source section: ${start}`);
    return app.slice(from, to);
};

const studentSignup = section('window.createStudentAccount =', 'window.createTeacherAccount =');
const teacherSignup = section('window.createTeacherAccount =', '// --- Teacher Class Management Logic ---');
const teacherBootstrap = section('async function ensureTeacherProfile', 'function renderStudentLoginNumber');
const authObserver = section('onAuthStateChanged(auth', '// --- Dashboard UI Enhancements ---');

assert.doesNotMatch(studentSignup, /metadata['"],\s*['"]counters|runTransaction\s*\(/);
assert.match(studentSignup, /createStudentAuthAccount\(\)/);
assert.match(studentSignup, /createSignupProfile\(db,[\s\S]*role:\s*'student'[\s\S]*userCode:/);
assert.match(teacherSignup, /createSignupProfile\(db,\s*\{\s*name,\s*email,\s*role:\s*'teacher'/);
assert.doesNotMatch(teacherSignup, /setDoc\(doc\(db,\s*['"]users['"]/);
assert.match(teacherBootstrap, /createSignupProfile\(db,[\s\S]*name:\s*signupName/);
assert.match(teacherBootstrap, /teacher-profile-missing/);
assert.doesNotMatch(teacherBootstrap, /user\.displayName\s*\|\|\s*['"]선생님['"]/);
assert.match(authObserver, /await waitForSignupProfileTask\(user\)/);
assert.ok(authObserver.indexOf('await waitForSignupProfileTask(user)') < authObserver.indexOf('await getDoc(userRef)'));

assert.match(adapter, /url \+= ['"]\/signup\/profile['"]/);
assert.match(adapter, /if \(!headers\.authorization\)/);
assert.match(adapter, /export async function createSignupProfile/);

console.log('Korean signup flow static checks passed');