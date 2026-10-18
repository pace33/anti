import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerMarkup} from '../research-prep/answer-view.mjs';
import {pastQuestions,pastAnswerIds} from '../research-prep/simple-data.mjs';
import foundation from './research-answers/foundation.mjs';
import technology from './research-answers/technology.mjs';
import application from './research-answers/application.mjs';
const root=new URL('../research-prep/',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const data=JSON.parse(read('content.json'));
const authored={...foundation,...technology,...application};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('90 individually authored answers, 270 oral paragraphs and specific report follow-ups',()=>{
 assert.equal(Object.keys(authored).length,90);
 assert.equal(new Set(data.questions.map(q=>q.sample)).size,90);
 for(const q of data.questions){
  assert.deepEqual([q.sample,q.reportNeeds],authored[q.id],q.id);
  assert(q.sample.length>=300,q.id);
  assert.equal(q.sample.split('\n\n').length,3,q.id);
  assert(q.reportNeeds.length>20,q.id);
  assert(!q.sample.includes('[답변 작성 틀]'),q.id);
  assert(!/\[학생 [A-Z]\]|보고서 \[쪽\]/.test(q.sample),q.id);
 }
 assert.equal(data.answerDraft.version,'program-draft-v1');
 assert(data.answerDraft.scope.includes('보고서 확인 후'));
 assert(data.answerDraft.scope.includes('실제 실행 성과로 인용하지'));
});
test('rendered answers have visible paragraphs, report hints and escaped text',()=>{
 for(const q of data.questions){
  const html=answerMarkup(q,esc);
  assert.equal((html.match(/<p>/g)||[]).length,4,q.id);
  assert(html.includes(esc(q.sample.split('\n\n')[0])),q.id);
  assert(html.includes(esc(q.reportNeeds)),q.id);
 }
 const html=answerMarkup({sample:'<img src=x onerror=alert(1)>\n\nSecond',reportNeeds:'<script>bad()</script>'},esc);
 assert(!html.includes('<img'));assert(!html.includes('<script>'));
 assert(html.includes('&lt;img'));assert(html.includes('&lt;script&gt;'));
});
test('10 historical themes map to prepared drafts, not alleged historical answers',()=>{
 assert.equal(Object.keys(pastAnswerIds).length,10);
 for(const q of pastQuestions)assert(data.questions.some(x=>x.id===pastAnswerIds[q.theme]),q.theme);
 assert(read('simple.mjs').includes('후기 참가자의 실제 답변이 아닙니다'));
});
test('same answers appear in simple, full and mock-interview views with searchable text',()=>{
 const simple=read('simple.mjs'),full=read('app.mjs');
 assert(simple.includes('answerMarkup(q,esc)'));
 assert(full.includes('answerMarkup(q,esc)'));
 assert(full.includes('${revealed?`${answerMarkup(q,esc)}'));
 for(const app of [simple,full]){
  assert(app.includes('q.sample,q.reportNeeds'));
  assert(app.includes('content.json?v=spoken1'));
 }
 for(const page of ['index.html','full.html'])assert(read(page).includes('answers.css?v=spoken1'));
});
test('Markdown download contains all 90 answers and no private local notes',()=>{
 const md=read('answer-drafts.md');
 assert.equal((md.match(/^## Q\d{2}\./gm)||[]).length,90);
 assert.equal((md.match(/^### 보고서로 보강할 내용/gm)||[]).length,90);
 for(const q of data.questions){assert(md.includes(q.sample),q.id);assert(md.includes(q.reportNeeds),q.id);}
 assert(md.includes('프로그램 기반 답변 초안'));
 assert(!md.includes('이전 답변 메모'));
});
test('all answers use spoken honorific phrasing without authoring instructions',()=>{
 assert.equal(data.answerDraft.register,'spoken-honorific-v1');
 for(const q of data.questions){
  assert(/(?:해요|예요|거죠|잖아요|거든요|고요|겠죠|니까요)[.!?]/.test(q.sample),q.id+' needs actual spoken phrasing');
  assert(!/보고서(?:를|가)\s*(?:받|오)|최종 답변에서는|답변(?:을|의)\s*(?:작성|보강|구성)|자료로 바꾸겠습니다/.test(q.sample),q.id+' contains authoring instructions');
  assert(!/한다\.|있다\.|것이다\./.test(q.sample),q.id+' contains report-style narration');
 }
});
test('high-risk claims distinguish product behavior, evaluation and historic scope',()=>{
 const q=id=>data.questions.find(x=>x.id===id).sample;
 assert(q('Q34').includes('정답을 AI에 알려'));
 assert(q('Q36').includes('Firebase는 인증'));
 assert(q('Q36').includes('자체 서버'));
 assert(q('Q57').includes('강제 종료'));
 assert(q('Q76').includes('연구기간과 출품 시점'));
 assert(q('Q76').includes('연구에 쓴 것, 그때 있었지만 쓰지 않은 것, 이후에 추가한 것'));
 assert(q('Q15').includes('하나의 효과라고 단정하기는 어렵습니다'));
 assert(q('Q15').includes('비교 조건과 반복 측정'));
 assert(q('Q60').includes('글자만 있는 네 개'));
});
