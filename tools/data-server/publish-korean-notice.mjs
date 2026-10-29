#!/usr/bin/env node
// Trusted data-server administration CLI. This is not a public HTTP endpoint.
// Publishes an authorized initial document once; a deleted notice is not restored.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createKoreanNotices, validateNotice } from './korean-notices.mjs';

const [dataDir, sourceFile, uid, seedKey, authorName] = process.argv.slice(2);
if (!dataDir || !sourceFile || !uid || !seedKey || !/^[a-z0-9-]{1,100}$/.test(seedKey)) {
    console.error('Usage: node publish-korean-notice.mjs DATA_DIR NOTICE_JSON ADMIN_UID UNIQUE_SEED_KEY [DISPLAY_NAME]');
    process.exit(2);
}
const body = validateNotice(JSON.parse(readFileSync(sourceFile, 'utf8')));
const db = new DatabaseSync(resolve(dataDir, 'korean-notices.sqlite'));
const service = createKoreanNotices({ db, adminUids: [] });
try {
    if (!db.prepare("SELECT uid FROM notice_staff WHERE uid=? AND role IN ('admin','operator')").get(uid)) throw new Error('UID is not a registered notice administrator/operator');
    const core = new DatabaseSync(resolve(dataDir, 'aiedue.sqlite'), { readOnly: true });
    let profile;
    try {
        const row = core.prepare('SELECT data_json FROM korean_v2_documents WHERE path=?').get('users/' + uid);
        if (!row) throw new Error('Administrator Firebase profile was not found');
        profile = JSON.parse(row.data_json);
        // A server-local operator may publish under the authorized service alias.
        // This does not change the account profile or permit HTTP author spoofing.
        if (authorName !== undefined) {
            if (!authorName.trim() || authorName.length > 100) throw new Error('Invalid display name');
            profile = { ...profile, name: authorName.trim() };
        }
    } finally { core.close(); }
    db.exec('CREATE TABLE IF NOT EXISTS notice_publication_keys (seed_key TEXT PRIMARY KEY, notice_id TEXT NOT NULL)');
    db.exec('BEGIN IMMEDIATE');
    try {
        const existing = db.prepare('SELECT notice_id FROM notice_publication_keys WHERE seed_key=?').get(seedKey);
        if (existing) {
            db.exec('COMMIT'); console.log(JSON.stringify({ skipped: true, id: existing.notice_id, reason: 'Already published; no duplicate or restoration' }));
        } else {
            const req = Readable.from([Buffer.from(JSON.stringify(body))]); req.method = 'POST';
            let status = 0, response;
            const res = { writeHead(code) { status = code; }, end(value) { response = JSON.parse(value); } };
            await service.handle(req, res, { uid, role: 'teacher', claims: {}, profile }, '/notices', new URL('http://localhost/notices'));
            if (status !== 201) throw new Error(JSON.stringify({ status, response }));
            db.prepare('INSERT INTO notice_publication_keys(seed_key,notice_id) VALUES(?,?)').run(seedKey, response.notice.id);
            db.exec('COMMIT'); console.log(JSON.stringify({ published: true, id: response.notice.id, title: response.notice.title }));
        }
    } catch (error) { db.exec('ROLLBACK'); throw error; }
} finally { service.close(); db.close(); }
