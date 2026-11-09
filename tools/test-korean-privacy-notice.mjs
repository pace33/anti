import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNotice} from './data-server/korean-notices.mjs';
const read=name=>readFileSync(new URL('../docs/'+name,import.meta.url),'utf8').replace(/^\uFEFF/,'').replaceAll('\r\n','\n').trim();
const source=read('korean-privacy-policy.source.txt');
const published=read('korean-privacy-policy.md');
const notice=JSON.parse(read('korean-privacy-notice.json'));
const formatted=source.replaceAll('이 경로의모델','이 경로의 모델').replaceAll('mailto\\:','mailto:').replace(/^(\d+\. .+)$/gm,'## $1');
const plain=formatted.replaceAll('## ','').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>label===url||url.startsWith('mailto:')?label:label+' ('+url+')');
test('official policy preserves user source with only disclosed formatting corrections',()=>{
 assert.equal(published,'# 에이두 한글 개인정보 처리방침\n\n'+formatted);
 assert.equal((published.match(/^## \d+\./gm)||[]).length,16);
 assert.ok(notice.content.startsWith('에이두 한글 개인정보 처리방침\n\n'+plain+'\n\n양식 다운로드 및 제출'));
});
test('official inquiry response is archived verbatim, not sent or endorsed as a provider ruling',()=>{
 assert.equal(read('korean-ai-operation-explanation.md'),'# 에이두 한글 AI 기능 및 운영 구조 소명문\n\n'+read('korean-ai-operation-explanation.source.txt'));
});
test('both existing one-page HWPX forms and submission channel are preserved',()=>{
 assert.ok(!JSON.stringify(notice).includes('체크리스트'));assert.equal(notice.attachments.length,2);
 for(const a of notice.attachments){assert.ok(a.name.endsWith('.hwpx'));assert.match(a.url,/^https:\/\/aiedue\.ddns\.net\/db-cloud\/cloud_[a-f0-9]+\/download$/);}
 assert.match(notice.attachments[0].name,/동의서/);assert.match(notice.attachments[1].name,/신청서/);
 for(const x of ['각각 1쪽','HWPX','y5496694@gmail.com','양식 다운로드 및 제출'])assert.ok(notice.content.includes(x));
 assert.deepEqual(validateNotice(notice).attachments,notice.attachments);
});
test('official policy distinguishes authentication, external AI, plans and deletion boundaries',()=>{
 for(const x of ['SQLite','Firebase Authentication','학습 기록의 저장소로 사용하지 않습니다','기본적으로 로컬 모델을 먼저','Antigravity CLI','해당 서비스의 약관 및 개인정보 처리조건이 적용됩니다','감지하지 못하는 정보','Google 계정 자체를 탈퇴시키거나 삭제하는 절차는 아닙니다','최대 180일','2026년 12월 중','현재는 전환을 준비 중','양식을 이용하기 어려운 경우','비밀번호·주민등록번호는 보내지 마세요'])assert.ok(published.includes(x),x);
});
