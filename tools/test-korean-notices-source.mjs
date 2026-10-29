import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createKoreanNotices } from './data-server/korean-notices.mjs';

const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
test('public entry points preserve the requested button order and share the same board', () => {
    const html = read('index.html');
    const signup = html.indexOf('onclick="openStudentSignupModal()"');
    const notice = html.indexOf('id="login-notices-button"');
    const trial = html.indexOf('onclick="testLoginStudent()"');
    assert.ok(signup < notice && notice < trial);
    const dashboard = html.indexOf('id="dashboard-notices-button"');
    const intro = html.indexOf('id="dashboard-intro-button"');
    assert.ok(dashboard < intro);
    assert.match(html, /src="korean-notices\.mjs\?v=public-notices-v1"/);
    assert.match(read('korean-notices.css'), /\[hidden\]\s*\{\s*display:\s*none !important/);
    assert.match(read('korean-notices.mjs'), /textContent = notice\.content/);
    assert.match(read('korean-notices.mjs'), /textContent = notice\.title/);
    assert.match(read('korean-notices.mjs'), /onAuthStateChanged\(auth/);
});

test('trusted publication CLI survives restarts, is idempotent and never restores a deleted post', t => {
    const dir = mkdtempSync(resolve(tmpdir(), 'korean-notice-publish-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
    const service = createKoreanNotices({ dataDir: dir, adminUids: ['owner'] }); service.close();
    const core = new DatabaseSync(resolve(dir, 'aiedue.sqlite'));
    core.exec('CREATE TABLE korean_v2_documents(path TEXT PRIMARY KEY, data_json TEXT)');
    core.prepare('INSERT INTO korean_v2_documents VALUES(?,?)').run('users/owner', JSON.stringify({ name: 'QA 관리자' })); core.close();
    const source = resolve(dir, 'notice.json'); writeFileSync(source, JSON.stringify({ title: '첫 공지', content: '격리 테스트 문서' }));
    const cli = new URL('data-server/publish-korean-notice.mjs', import.meta.url);
    const publish = (uid = 'owner') => spawnSync(process.execPath, [fileURLToPath(cli), dir, source, uid, 'initial-checklist', '에이두'], { encoding: 'utf8' });
    const first = publish(); assert.equal(first.status, 0, first.stderr); const id = JSON.parse(first.stdout).id;
    const again = publish(); assert.equal(again.status, 0, again.stderr); assert.equal(JSON.parse(again.stdout).skipped, true);
    let db = new DatabaseSync(resolve(dir, 'korean-notices.sqlite'));
    assert.equal(db.prepare('SELECT count(*) AS n FROM notices').get().n, 1);
    assert.equal(db.prepare('SELECT author_name FROM notices WHERE id=?').get(id).author_name, '에이두');
    const unchangedCore = new DatabaseSync(resolve(dir, 'aiedue.sqlite'), { readOnly: true });
    assert.equal(JSON.parse(unchangedCore.prepare('SELECT data_json FROM korean_v2_documents WHERE path=?').get('users/owner').data_json).name, 'QA 관리자'); unchangedCore.close();
    db.prepare('DELETE FROM notices WHERE id=?').run(id); db.close();
    assert.equal(JSON.parse(publish().stdout).skipped, true);
    db = new DatabaseSync(resolve(dir, 'korean-notices.sqlite')); assert.equal(db.prepare('SELECT count(*) AS n FROM notices').get().n, 0); db.close();
    assert.notEqual(publish('student').status, 0);
});
