import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createKoreanNotices, validateNotice } from './data-server/korean-notices.mjs';

const anonymous = { uid: '', role: 'anonymous' };
const admin = { uid: 'owner', role: 'teacher', profile: { name: '관리자' }, claims: {} };
const operator = { uid: 'operator', role: 'teacher', claims: { operator: true }, profile: { name: '운영자' } };
const student = { uid: 'student', role: 'student', profile: { role: 'admin', isAdmin: true, name: '학생' }, claims: {} };
const teacher = { uid: 'teacher', role: 'teacher', claims: {}, profile: { name: '선생님' } };
const body = { title: '개인정보 안내', content: '공급자가 확인한 자료입니다.\n두 번째 줄', attachmentUrl: 'https://aiedue.ddns.net/db-cloud/cloud_123abc/download', attachmentName: '체크리스트.hwp' };
async function fixture(t) {
    const db = new DatabaseSync(':memory:');
    const notices = createKoreanNotices({ db, adminUids: ['owner'] });
    const actors = { admin, operator, student, teacher };
    const server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        const actor = actors[req.headers.authorization] || anonymous;
        if (!await notices.handle(req, res, actor, url.pathname, url)) { res.writeHead(404); res.end(); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); });
    async function request(path = '', method = 'GET', data, actor) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/notices${path}`, { method, headers: { ...(actor ? { Authorization: actor } : {}), 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
        return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
    }
    return { db, request };
}

test('anonymous sees empty list and cannot manage; forged profile flags do not grant access', async t => {
    const { request } = await fixture(t);
    const list = await request(); assert.equal(list.status, 200); assert.deepEqual(list.data.notices, []); assert.equal(list.cache, 'no-store');
    for (const actor of [undefined, 'student', 'teacher']) assert.equal((await request('/access', 'GET', undefined, actor)).data.canManage, false);
    for (const actor of ['admin', 'operator']) assert.equal((await request('/access', 'GET', undefined, actor)).data.canManage, true);
});

test('only server-authorized admins/operators can create, edit and delete', async t => {
    const { request } = await fixture(t);
    assert.equal((await request('', 'POST', body)).status, 401);
    for (const actor of ['student', 'teacher']) assert.equal((await request('', 'POST', body, actor)).status, 403);
    const create = await request('', 'POST', body, 'admin'); assert.equal(create.status, 201);
    const n = create.data.notice; assert.equal(n.authorName, '관리자'); assert.equal(n.content, body.content);
    assert.ok(!('authorUid' in n));
    const publicRead = await request('/' + n.id); assert.equal(publicRead.status, 200); assert.equal(publicRead.data.notice.title, body.title);
    assert.equal((await request('/' + n.id, 'PATCH', { ...body, revision: 1 }, 'student')).status, 403);
    assert.equal((await request('/' + n.id + '?revision=1', 'DELETE', undefined, 'teacher')).status, 403);
    const edit = await request('/' + n.id, 'PATCH', { ...body, title: '수정한 공지', revision: 1 }, 'operator'); assert.equal(edit.status, 200); assert.equal(edit.data.notice.revision, 2);
    assert.equal((await request('/' + n.id, 'PATCH', { ...body, revision: 1 }, 'admin')).status, 409);
    assert.equal((await request('/' + n.id + '?revision=1', 'DELETE', undefined, 'admin')).status, 409);
    assert.equal((await request('/' + n.id + '?revision=2', 'DELETE', undefined, 'admin')).status, 200);
    assert.equal((await request('/' + n.id)).status, 404);
});

test('strict validation rejects spoofed authors, executable links and oversized text', async t => {
    const { request } = await fixture(t);
    for (const value of [{ ...body, authorName: '가짜 운영자' }, { ...body, attachmentUrl: 'javascript:alert(1)' }, { ...body, attachmentUrl: 'https://aiedue.ddns.net.evil/db-cloud/cloud_abc' }, { ...body, title: ' ' }, { ...body, content: '가'.repeat(30001) }, null]) {
        assert.equal((await request('', 'POST', value, 'admin')).status, 400);
    }
    const xss = await request('', 'POST', { title: '<img src=x onerror=alert(1)>', content: '<script>alert(1)</script>' }, 'admin');
    assert.equal(xss.status, 201); assert.equal(xss.data.notice.title, '<img src=x onerror=alert(1)>'); // UI must render as text.
    assert.throws(() => validateNotice({ ...body, attachmentName: {} }));
    assert.equal((await request('/invalid/path')).status, 404);
});

test('three validated attachments survive read/edit and unsafe attachment arrays fail', async t => {
    const { request, db } = await fixture(t);
    const attachments = [1, 2, 3].map(index => ({ url: `https://aiedue.ddns.net/db-cloud/cloud_abc${index}/download`, name: `양식${index}.hwp` }));
    const created = await request('', 'POST', { title: '양식', content: '본문', attachments }, 'admin');
    assert.equal(created.status, 201);
    const id = created.data.notice.id;
    assert.deepEqual((await request('/' + id)).data.notice.attachments, attachments);
    assert.equal(created.data.notice.attachmentUrl, attachments[0].url);
    for (const items of [[...attachments, attachments[0]], [{ url: 'javascript:alert(1)' }], [{ url: attachments[0].url, authorName: '위조' }], [null], 'bad']) {
        assert.equal((await request('', 'POST', { title: '거부', content: '본문', attachments: items }, 'admin')).status, 400);
    }
    const edited = await request('/' + id, 'PATCH', { title: '수정', content: '본문', attachments: [], revision: 1 }, 'admin');
    assert.equal(edited.status, 200); assert.deepEqual(edited.data.notice.attachments, []);
    db.prepare('UPDATE notices SET attachments_json=NULL,attachment_url=?,attachment_name=? WHERE id=?').run(attachments[0].url, attachments[0].name, id);
    assert.deepEqual((await request('/' + id)).data.notice.attachments, [attachments[0]]);
});

test('pagination retains all announcements without overlap; list omits bodies', async t => {
    const { request, db } = await fixture(t);
    for (let i = 0; i < 7; i++) await request('', 'POST', { title: '공지 ' + i, content: '본문 ' + i }, 'admin');
    // Same timestamps must not lose or repeat rows across a cursor.
    db.prepare("UPDATE notices SET created_at='2026-10-29T00:00:00.000Z'").run();
    const seen = []; let cursor = '';
    do {
        const page = await request('?limit=2' + (cursor ? '&before=' + cursor : ''));
        assert.equal(page.status, 200); for (const item of page.data.notices) assert.ok(!('content' in item));
        seen.push(...page.data.notices.map(n => n.id)); cursor = page.data.nextCursor;
    } while (cursor);
    assert.equal(seen.length, 7); assert.equal(new Set(seen).size, 7);
    assert.equal((await request('?before=missing')).status, 400);
});
