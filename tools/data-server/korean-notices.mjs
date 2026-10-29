import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const MAX_BODY = 96 * 1024;
const STAFF_ROLES = new Set(['admin', 'operator']);
const attachmentPattern = /^https:\/\/aiedue\.ddns\.net\/db-cloud\/cloud_[a-f0-9]+(?:\/download)?$/;
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function text(value, max, required = false) {
    if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, '제목과 본문의 길이를 확인해 주세요.');
    return value.trim();
}
export function validateNotice(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '올바른 공지 내용이 필요합니다.');
    const allowed = new Set(['title', 'content', 'attachmentUrl', 'attachmentName', 'attachments', 'revision']);
    if (Object.keys(body).some(key => !allowed.has(key))) fail(400, '허용하지 않는 공지 항목입니다.');
    const result = { title: text(body.title, 120, true), content: text(body.content, 30000, true), attachmentUrl: text(body.attachmentUrl ?? '', 512), attachmentName: text(body.attachmentName ?? '', 180) };
    if (result.attachmentUrl && !attachmentPattern.test(result.attachmentUrl)) fail(400, '에이두 데이터서버 공유 링크만 첨부할 수 있습니다.');
    const items = body.attachments ?? (result.attachmentUrl ? [{ url: result.attachmentUrl, name: result.attachmentName }] : []);
    if (!Array.isArray(items) || items.length > 3) fail(400, '첨부파일은 최대 3개까지 등록할 수 있습니다.');
    result.attachments = items.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['url', 'name'].includes(key))) fail(400, '첨부파일 형식을 확인해 주세요.');
        const url = text(item.url, 512, true), name = text(item.name ?? '', 180);
        if (!attachmentPattern.test(url)) fail(400, '에이두 데이터서버 공유 링크만 첨부할 수 있습니다.');
        return { url, name };
    });
    result.attachmentUrl = result.attachments[0]?.url || '';
    result.attachmentName = result.attachments[0]?.name || '';
    return result;
}
function output(row, full = true) {
    const value = { id: row.id, title: row.title, authorName: row.author_name, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision };
    if (full) Object.assign(value, { content: row.content, attachmentUrl: row.attachment_url, attachmentName: row.attachment_name,
        attachments: row.attachments_json ? JSON.parse(row.attachments_json) : (row.attachment_url ? [{ url: row.attachment_url, name: row.attachment_name }] : []) });
    return value;
}
async function readBody(req) {
    const chunks = []; let length = 0;
    for await (const chunk of req) { length += chunk.length; if (length > MAX_BODY) fail(413, '공지 내용이 너무 깁니다.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, '공지 내용을 읽을 수 없습니다.'); }
}
function reply(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); return true; }

export function createKoreanNotices({ dataDir, db: suppliedDb, adminUids = process.env.KOREAN_NOTICE_ADMIN_UIDS || '' } = {}) {
    if (!suppliedDb) mkdirSync(resolve(dataDir || './data'), { recursive: true });
    const db = suppliedDb || new DatabaseSync(resolve(dataDir || './data', 'korean-notices.sqlite'));
    db.exec(`PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS notices (
            id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
            author_uid TEXT NOT NULL, author_name TEXT NOT NULL,
            attachment_url TEXT NOT NULL DEFAULT '', attachment_name TEXT NOT NULL DEFAULT '', attachments_json TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS notices_created ON notices(created_at DESC, id DESC);
        CREATE TABLE IF NOT EXISTS notice_staff (uid TEXT PRIMARY KEY, role TEXT NOT NULL CHECK(role IN ('admin','operator')));`);
    if (!db.prepare('PRAGMA table_info(notices)').all().some(column => column.name === 'attachments_json')) db.exec('ALTER TABLE notices ADD COLUMN attachments_json TEXT');
    for (const uid of (Array.isArray(adminUids) ? adminUids : adminUids.split(',')).map(x => String(x).trim()).filter(Boolean)) {
        db.prepare("INSERT INTO notice_staff(uid,role) VALUES(?,'admin') ON CONFLICT(uid) DO NOTHING").run(uid);
    }
    function staffRole(actor) {
        if (!actor?.uid || actor.role === 'anonymous') return '';
        if (actor.claims?.admin === true || actor.role === 'admin') return 'admin';
        const claim = String(actor.claims?.role || actor.claims?.userRole || '');
        if (actor.claims?.operator === true || STAFF_ROLES.has(claim)) return claim === 'admin' ? 'admin' : 'operator';
        return db.prepare('SELECT role FROM notice_staff WHERE uid=?').get(actor.uid)?.role || '';
    }
    async function handle(req, res, actor, sub, url) {
        if (sub !== '/notices' && !sub.startsWith('/notices/')) return false;
        try {
            const suffix = sub.slice('/notices'.length).replace(/^\//, '');
            const role = staffRole(actor);
            if (req.method === 'GET' && suffix === 'access') return reply(res, 200, { canManage: Boolean(role), role });
            if (req.method === 'GET' && !suffix) {
                const limit = Math.min(50, Math.max(1, Math.floor(Number(url.searchParams.get('limit')) || 30)));
                const cursor = url.searchParams.get('before') || '';
                let rows;
                if (cursor) {
                    const prior = db.prepare('SELECT created_at,id FROM notices WHERE id=?').get(cursor);
                    if (!prior) fail(400, '목록을 새로 불러와 주세요.');
                    rows = db.prepare('SELECT * FROM notices WHERE created_at < ? OR (created_at=? AND id < ?) ORDER BY created_at DESC,id DESC LIMIT ?').all(prior.created_at, prior.created_at, prior.id, limit + 1);
                } else rows = db.prepare('SELECT * FROM notices ORDER BY created_at DESC,id DESC LIMIT ?').all(limit + 1);
                const more = rows.length > limit; rows = rows.slice(0, limit);
                return reply(res, 200, { notices: rows.map(row => output(row, false)), nextCursor: more ? rows.at(-1).id : null });
            }
            if (suffix && !/^notice_[a-f0-9-]{36}$/.test(suffix)) fail(404, '공지를 찾을 수 없습니다.');
            if (req.method === 'GET' && suffix) {
                const row = db.prepare('SELECT * FROM notices WHERE id=?').get(suffix);
                if (!row) fail(404, '삭제되었거나 없는 공지입니다.');
                return reply(res, 200, { notice: output(row) });
            }
            if (!actor?.uid || actor.role === 'anonymous') fail(401, '로그인이 필요합니다.');
            if (!role) fail(403, '운영자와 관리자만 공지를 작성할 수 있습니다.');
            if (req.method === 'POST' && !suffix) {
                const body = validateNotice(await readBody(req));
                const now = new Date().toISOString(); const id = 'notice_' + randomUUID();
                const author = String(actor.profile?.name || '운영자').slice(0, 100);
                db.prepare('INSERT INTO notices(id,title,content,author_uid,author_name,attachment_url,attachment_name,attachments_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
                    .run(id, body.title, body.content, actor.uid, author, body.attachmentUrl, body.attachmentName, JSON.stringify(body.attachments), now, now);
                return reply(res, 201, { notice: output(db.prepare('SELECT * FROM notices WHERE id=?').get(id)) });
            }
            if (req.method === 'PATCH' && suffix) {
                const raw = await readBody(req); const body = validateNotice(raw);
                if (!Number.isSafeInteger(raw.revision) || raw.revision < 1) fail(400, '공지 버전이 필요합니다.');
                const row = db.prepare('SELECT * FROM notices WHERE id=?').get(suffix);
                if (!row) fail(404, '삭제되었거나 없는 공지입니다.');
                const result = db.prepare('UPDATE notices SET title=?,content=?,attachment_url=?,attachment_name=?,attachments_json=?,updated_at=?,revision=revision+1 WHERE id=? AND revision=?')
                    .run(body.title, body.content, body.attachmentUrl, body.attachmentName, JSON.stringify(body.attachments), new Date().toISOString(), suffix, raw.revision);
                if (!result.changes) fail(409, '다른 관리자가 수정했습니다. 목록에서 다시 열어 주세요.');
                return reply(res, 200, { notice: output(db.prepare('SELECT * FROM notices WHERE id=?').get(suffix)) });
            }
            if (req.method === 'DELETE' && suffix) {
                const revision = Number(url.searchParams.get('revision'));
                if (!Number.isSafeInteger(revision) || revision < 1) fail(400, '공지 버전이 필요합니다.');
                const result = db.prepare('DELETE FROM notices WHERE id=? AND revision=?').run(suffix, revision);
                if (!result.changes) fail(409, '공지가 변경되었거나 이미 삭제되었습니다. 목록을 새로 불러와 주세요.');
                return reply(res, 200, { ok: true });
            }
            fail(405, '지원하지 않는 요청입니다.');
        } catch (error) { return reply(res, error.status || 500, { error: error.status ? error.message : '공지를 처리하지 못했습니다.' }); }
    }
    return { handle, close() { if (!suppliedDb) db.close(); } };
}
