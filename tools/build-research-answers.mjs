import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import foundation from './research-answers/foundation.mjs';
import technology from './research-answers/technology.mjs';
import application from './research-answers/application.mjs';

const parts=[foundation,technology,application];
const ids=parts.flatMap(x=>Object.keys(x));
assert.equal(ids.length,90);
assert.equal(new Set(ids).size,90,'Duplicate authored answer ID');
const answers=Object.assign({},...parts);
const root=new URL('../research-prep/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('content.json',root),'utf8'));
assert.deepEqual([...ids].sort(),data.questions.map(q=>q.id).sort());
for(const q of data.questions){
 const [sample,reportNeeds]=answers[q.id];
 assert(sample.split('\n\n').length===3,q.id+' must have three oral paragraphs');
 assert(sample.length>=250,q.id+' needs a substantive answer');
 assert(reportNeeds.length>=20,q.id+' needs report-specific follow-up');
 assert(!sample.includes('[답변 작성 틀]'),q.id);
 q.sample=sample;
 q.reportNeeds=reportNeeds;
}
data.answerDraft={
 version:'submitted-report-v1',
 register:'spoken-honorific-v1',
 status:'제출 연구보고서 대조 완료 · 존댓말 구술 답변',
 scope:'제출 한글 보고서의 대상 4명·2026.6.1.~7.30. 적용·한글 또박또박 106점 만점 결과와 수업 사례를 대조했습니다. 비교집단·유지·전이·AI 정확도·동의 증빙 등 보고서에 없는 내용은 미확인 또는 후속 과제로 구분합니다. 원본 보고서는 수정하지 않았습니다.',
 basis:['README.md','docs/curricular-writing-checkpoints.md','docs/shared-word-card-troubleshooting.md','app.js','research-prep/content.json의 기존 질문·준비 근거'],
 privateData:'출품 보고서·학생 원자료·개인 메모는 포함하지 않습니다.'
};
const presentation=JSON.parse(readFileSync(new URL('./research-presentation.json',import.meta.url),'utf8'));
data.slides=presentation.slides.map(s=>({...s,show:s.message,prepare:['제출본 근거: '+s.source,'배정 시간에 맞춰 그림과 결과를 짚으며 설명'],avoid:'원본 근거와 현재 제품·후속 계획을 구분합니다.'}));
const markdown='# 에이두 한글 · 면접 예상 질문 90개 제출보고서 기반 답변\n\n'
+'상태: '+data.answerDraft.status+'\n\n'+data.answerDraft.scope+'\n\n'
+'각 문항의 답변은 구술 연습용입니다. 첫 문단으로 핵심을 답하고, 필요하면 기능·수업 설명과 한계까지 이어 말하세요. 90문항은 예상 질문이며 실제 기출 원문이 아닙니다.\n\n'
+data.questions.map(q=>`## ${q.id}. ${q.title}\n\n유형: ${q.category}\n\n### 구술 답변\n\n${q.sample}\n\n### 제출본 근거·해석 범위\n\n${q.reportNeeds}\n\n### 이어서 나올 질문\n\n${q.follow}\n\n### 준비할 근거\n\n${q.evidence}\n\n### 주의\n\n${q.caution}`).join('\n\n---\n\n')+'\n';
const outputs=[['content.json',JSON.stringify(data,null,2)+'\n'],['answer-drafts.md',markdown]];
for(const [name,text] of outputs){
 const path=new URL(name,root);
 if(process.argv.includes('--check'))assert.equal(readFileSync(path,'utf8').replace(/\r\n/g,'\n'),text,name+' is out of sync with authored answers');
 else writeFileSync(path,text,'utf8');
}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'build',questions:data.questions.length,paragraphs:data.questions.reduce((n,q)=>n+q.sample.split('\n\n').length,0),minCharacters:Math.min(...data.questions.map(q=>q.sample.length)),maxCharacters:Math.max(...data.questions.map(q=>q.sample.length)),totalCharacters:data.questions.reduce((n,q)=>n+q.sample.length,0),outputs:outputs.map(([name])=>name)}));
