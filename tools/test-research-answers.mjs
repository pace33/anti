import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {answerMarkup} from '../research-prep/answer-view.mjs';
import {pastQuestions,pastAnswerIds} from '../research-prep/simple-data.mjs';
import foundation from './research-answers/foundation.mjs';
import technology from './research-answers/technology.mjs';
import application from './research-answers/application.mjs';
const root=new URL('../research-prep/',import.meta.url),read=p=>readFileSync(new URL(p,root),'utf8');
const data=JSON.parse(read('content.json')),authored={...foundation,...technology,...application};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const q=id=>data.questions.find(x=>x.id===id).sample;
test('90 individually authored submitted-report answers, 270 oral paragraphs and evidence boundaries',()=>{
 assert.equal(Object.keys(authored).length,90);assert.equal(new Set(data.questions.map(q=>q.sample)).size,90);
 for(const x of data.questions){assert.deepEqual([x.sample,x.reportNeeds],authored[x.id],x.id);assert(x.sample.length>=300,x.id);assert.equal(x.sample.split('\n\n').length,3,x.id);assert(x.reportNeeds.length>20,x.id);assert(!/\[답변 작성 틀\]|\[학생 [A-Z]\]|보고서 \[쪽\]/.test(x.sample),x.id);}
 assert.equal(data.answerDraft.version,'submitted-report-v1');assert(data.answerDraft.scope.includes('106점 만점'));assert(data.answerDraft.scope.includes('원본 보고서는 수정하지 않았습니다'));
});
test('shared rendering escapes all oral answers and report evidence notes',()=>{
 for(const x of data.questions){const html=answerMarkup(x,esc);assert.equal((html.match(/<p>/g)||[]).length,4);assert(html.includes(esc(x.sample.split('\n\n')[0])));assert(html.includes(esc(x.reportNeeds)));assert(html.includes('제출본 근거·해석 범위'));}
 const html=answerMarkup({sample:'<img src=x onerror=alert(1)>\n\nSecond',reportNeeds:'<script>bad()</script>'},esc);assert(!html.includes('<img'));assert(!html.includes('<script>'));assert(html.includes('&lt;img'));assert(html.includes('&lt;script&gt;'));
});
test('10 historical themes use new practice answers, not alleged historical answers',()=>{
 assert.equal(Object.keys(pastAnswerIds).length,10);for(const x of pastQuestions)assert(data.questions.some(y=>y.id===pastAnswerIds[x.theme]));assert(read('simple.mjs').includes('후기 참가자의 실제 답변이 아닙니다'));
});
test('same current answers are used by question, historical and mock views with synchronized caches',()=>{
 const simple=read('simple.mjs'),full=read('app.mjs');for(const app of [simple,full]){assert(app.includes('answerMarkup(q,esc)')||app.includes('answerMarkup(data.questions.find'));assert(app.includes('q.sample,q.reportNeeds'));assert(app.includes('content.json?v=real-screen1'));assert(app.includes('aiedue-korean-research-prep-v1'));assert(!app.includes('localStorage.clear'));}
 assert(full.includes('${revealed?`${answerMarkup(q,esc)}'));for(const page of ['index.html','full.html'])assert(read(page).includes('answers.css?v=real-screen1'));
});
test('download includes all submitted-report answers without private notes',()=>{
 const md=read('answer-drafts.md');assert.equal((md.match(/^## Q\d{2}\./gm)||[]).length,90);assert.equal((md.match(/^### 제출본 근거·해석 범위/gm)||[]).length,90);for(const x of data.questions){assert(md.includes(x.sample));assert(md.includes(x.reportNeeds));}assert(md.includes('제출 연구보고서 대조 완료'));assert(!md.includes('이전 답변 메모'));
});
test('answers are direct honorific speech, not report-preparation instructions or unintentional foreign text',()=>{
 assert.equal(data.answerDraft.register,'spoken-honorific-v1');for(const x of data.questions){assert(/(?:요|습니다|겠습니다)[.!?]/.test(x.sample),x.id);assert(!/보고서(?:를|가)\s*(?:받|오)|최종 답변에서는|답변(?:을|의)\s*(?:작성|보강|구성)|자료로 바꾸겠습니다/.test(x.sample),x.id);assert(!/[\u3040-\u30ff]/.test(x.sample),x.id);assert(!/한다\.|있다\.|것이다\./.test(x.sample),x.id);}
});
test('research findings are distinct from product features, safeguards and future validation',()=>{
 assert(q('Q01').includes('4명'));assert(q('Q01').includes('2026년 6월 1일부터 7월 30일'));assert(q('Q01').includes('106점 만점'));assert(q('Q01').includes('78점에서 93.5점'));
 for(const id of ['Q15','Q16','Q22','Q24'])assert(/없|않|추가|필요/.test(q(id)),id);
 assert(q('Q76').includes('2026년 6~7월'));assert(/후속|현재/.test(q('Q76')));assert(q('Q71').includes('38점에서 77점'));assert(q('Q71').includes('노력 요함'));assert(q('Q71').includes('새로 도달한 영역은 없'));
 assert(q('Q83').includes('동의서'));assert(/확인|별도/.test(q('Q83')));assert(q('Q69').includes('S2'));assert(q('Q69').includes('도움'));
});
test('12 presentation scenes are report-grounded and share the speaker-script source',()=>{
 const d=JSON.parse(readFileSync(new URL('./research-presentation.json',import.meta.url),'utf8'));assert.equal(d.slides.length,12);assert.equal(d.appendices.length,3);assert.equal(d.slides.reduce((n,s)=>n+s.seconds,0),600);for(let i=0;i<12;i++){assert.equal(data.slides[i].say,d.slides[i].say);assert(read('presentation-script.md').includes(d.slides[i].say));}for(const asset of ['presentation-10min.pptx','presentation-10min.pdf'])assert(readFileSync(new URL(asset,root)).length>10000);
});
