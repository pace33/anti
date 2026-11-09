import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateNotice } from './data-server/korean-notices.mjs';
const notice=JSON.parse(readFileSync(new URL('../docs/korean-privacy-notice.json',import.meta.url),'utf8'));
test('privacy guide preserves both existing one-page HWPX forms and submission channel',()=>{
 assert.ok(!JSON.stringify(notice).includes('체크리스트'));assert.equal(notice.attachments.length,2);
 for(const a of notice.attachments){assert.ok(a.name.endsWith('.hwpx'));assert.match(a.url,/^https:\/\/aiedue\.ddns\.net\/db-cloud\/cloud_[a-f0-9]+\/download$/);}
 assert.match(notice.attachments[0].name,/동의서/);assert.match(notice.attachments[1].name,/신청서/);
 for(const x of ['각각 1쪽','HWPX','y5496694@gmail.com','양식 다운로드 및 제출','6. 권리행사와 양식 제출'])assert.ok(notice.content.includes(x));
 assert.ok(!notice.content.includes('4. 한글 파일'));assert.deepEqual(validateNotice(notice).attachments,notice.attachments);
});
test('policy separates self-hosted data, authentication, external AI and deletion limits',()=>{
 const policy=readFileSync(new URL('../docs/korean-privacy-policy.md',import.meta.url),'utf8');
 for(const text of [policy,notice.content]){
  for(const x of ['SQLite','교사가 직접 관리','인증 계정과 에이두의 학습 데이터 저장소는 구분','Google 로그인만으로','자체 AntiAI 서버','로컬 AntiAI','입력 문장을 점검','같은 탈퇴 처리 시점','Firebase Authentication','Google 계정 자체를 삭제한다는 뜻은 아닙니다','양식 없이 이메일','y5496694@gmail.com','약관·개인정보 처리 조건이 적용되지 않는 것은 아닙니다','사진·첨부파일의 얼굴','자동으로 모두 판별·제거한다고 보장하지 않습니다','물리적으로 모두 사라진다고 보장하는 것은 아닙니다'])assert.ok(text.includes(x),x);
  assert.match(text,/5\. 보유기간과 삭제·탈퇴/);
 }
});
test('hybrid routing disclosure names candidates, short budgets and unfinished hardware',()=>{
 for(const x of ['Qwen-Image 2.1','Gemma4 12B Q4','BC-250','Vulkan','RX 6600 8GB','최대 1초','최대 1.5초','Antigravity CLI','Gemini Flash','RAM 128GB·VRAM 32GB','아직 완성·검증된 운영 환경은 아니며','OpenAI/Codex','모든 추론을 로컬에서만 수행한다는 뜻은 아닙니다','차단된 내용을 다른 모델로 보내 우회하지 않습니다'])assert.ok(notice.content.includes(x),x);
});
