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
test('inquiry response reflects the requested correction without a full-local transition pledge',()=>{
 assert.equal(read('korean-ai-operation-explanation.md'),'# 에이두 한글 AI 기능 및 운영 구조 소명문\n\n'+read('korean-ai-operation-explanation.source.txt'));
 const inquiry=read('korean-ai-operation-explanation.source.txt');
 assert.ok(!inquiry.includes('완전한 로컬'));
 assert.ok(!inquiry.includes('모든 AI 요청을 로컬'));
 assert.ok(inquiry.includes('기존 설명에 Gemini 모델을 명시한 것은 응답의 처리 기반을 안내하기 위한 것이었습니다.'));
});
test('both existing one-page HWPX forms and submission channel are preserved',()=>{
 assert.ok(!JSON.stringify(notice).includes('체크리스트'));assert.equal(notice.attachments.length,2);
 for(const a of notice.attachments){assert.ok(a.name.endsWith('.hwpx'));assert.match(a.url,/^https:\/\/aiedue\.ddns\.net\/db-cloud\/cloud_[a-f0-9]+\/download$/);}
 assert.match(notice.attachments[0].name,/동의서/);assert.match(notice.attachments[1].name,/신청서/);
 for(const x of ['각각 1쪽','HWPX','y5496694@gmail.com','양식 다운로드 및 제출'])assert.ok(notice.content.includes(x));
 assert.deepEqual(validateNotice(notice).attachments,notice.attachments);
});
test('concise AI policy preserves external processing disclosure, filter limits and rights',()=>{
 for(const x of ['SQLite','Firebase Authentication','학습 기록의 저장소로 사용하지 않습니다','외부 AI 서비스(Google)','작업에 필요한 입력을 전달합니다','계정 비밀번호와 인증 토큰은 AI 입력에 포함하지 않습니다','모든 정보를 제거할 수는 없으므로','해당 제공자의 약관 및 개인정보 처리조건','보관·모델 개선 활용 여부','제9항','제11항','Google 계정 자체를 탈퇴시키거나 삭제하는 절차는 아닙니다','최대 180일','양식을 이용하기 어려운 경우','비밀번호·주민등록번호는 보내지 마세요'])assert.ok(published.includes(x),x);
 const aiSection=published.split('## 5. ')[1].split('## 6. ')[0];
 for(const x of ['Qwen','Gemma','Antigravity CLI','Fallback','대부분의 응답','Gemini API','2026년 12월','전환할 예정'])assert.ok(!aiSection.includes(x),x);
 assert.ok(aiSection.includes('로컬에서 완료된 요청의 AI 입력은 외부 AI 서비스로 전달하지 않습니다.'));
 assert.ok(!published.includes('2026년 12월 중'));
});
