import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNotice } from './data-server/korean-notices.mjs';

const notice = JSON.parse(readFileSync(new URL('../docs/korean-privacy-notice.json', import.meta.url), 'utf8'));

test('privacy notice contains only the privacy guide and two one-page HWPX forms', () => {
    assert.ok(!JSON.stringify(notice).includes('체크리스트'));
    assert.equal(notice.attachments.length, 2);
    for (const attachment of notice.attachments) {
        assert.ok(attachment.name.endsWith('.hwpx'));
        assert.match(attachment.url, /^https:\/\/aiedue\.ddns\.net\/db-cloud\/cloud_[a-f0-9]+\/download$/);
    }
    assert.match(notice.attachments[0].name, /동의서/);
    assert.match(notice.attachments[1].name, /신청서/);
    assert.ok(notice.content.includes('각각 1쪽'));
    assert.ok(notice.content.includes('HWPX'));
    assert.ok(notice.content.includes('y5496694@gmail.com'));
    assert.ok(notice.content.includes('3. 양식 다운로드'));
    assert.ok(!notice.content.includes('4. 한글 파일'));
    assert.deepEqual(validateNotice(notice).attachments, notice.attachments);
});
