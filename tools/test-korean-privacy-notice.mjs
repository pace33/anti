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
    assert.ok(notice.content.includes('양식 다운로드 및 제출'));
    assert.ok(notice.content.includes('6. 권리행사와 양식 제출'));
    assert.ok(!notice.content.includes('4. 한글 파일'));
    assert.deepEqual(validateNotice(notice).attachments, notice.attachments);
});

test('policy distinguishes self-hosted learning records from Firebase authentication and external AI', () => {
    const policy = readFileSync(new URL('../docs/korean-privacy-policy.md', import.meta.url), 'utf8');
    for (const text of [policy, notice.content]) {
        for (const required of ['SQLite', '교사가 직접 관리', '인증 계정과 에이두의 학습 데이터 저장소는 구분', 'Google 로그인만으로', '자체 AntiAI 서버', '로컬 AntiAI', '운영 원칙', '같은 탈퇴 처리 시점', 'Firebase Authentication', 'Google 계정 자체를 삭제한다는 뜻은 아닙니다', '양식 없이 이메일', 'y5496694@gmail.com']) {
            assert.ok(text.includes(required), `Missing privacy boundary: ${required}`);
        }
        assert.ok(text.includes('약관이나 개인정보 처리 조건이 적용되지 않는 것은 아닙니다'));
        assert.ok(text.includes('모든 이름·얼굴·문서 속 정보나 위험 내용을 빠짐없이 탐지·제거한다는 보장이 아닙니다'));
        assert.ok(text.includes('물리적으로 모두 사라진다고 보장하는 것은 아닙니다'));
    }
});
