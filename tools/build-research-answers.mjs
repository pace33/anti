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
 version:'program-draft-v1',
 register:'spoken-honorific-v1',
 status:'프로그램 기반 답변 초안 · 존댓말 구어체 · 보고서 대조 전',
 scope:'현재 에이두 한글의 기능·설계에 근거한 연습 답변입니다. 연구 당시 적용 기능·대상·기간·검증 방법·성과는 제출 보고서 확인 후 보강합니다. 제안과 조건부 설명을 실제 실행 성과로 인용하지 마세요.',
 basis:['README.md','docs/curricular-writing-checkpoints.md','docs/shared-word-card-troubleshooting.md','app.js','research-prep/content.json의 기존 질문·준비 근거'],
 privateData:'출품 보고서·학생 원자료·개인 메모는 포함하지 않습니다.'
};
const markdown='# 에이두 한글 · 면접 예상 질문 90개 상세 답변 초안\n\n'
+'상태: '+data.answerDraft.status+'\n\n'+data.answerDraft.scope+'\n\n'
+'각 문항의 답변은 구술 연습용입니다. 첫 문단으로 핵심을 답하고, 필요하면 기능·수업 설명과 한계까지 이어 말하세요. 90문항은 예상 질문이며 실제 기출 원문이 아닙니다.\n\n'
+data.questions.map(q=>`## ${q.id}. ${q.title}\n\n유형: ${q.category}\n\n### 답변 초안\n\n${q.sample}\n\n### 보고서로 보강할 내용\n\n${q.reportNeeds}\n\n### 이어서 나올 질문\n\n${q.follow}\n\n### 준비할 근거\n\n${q.evidence}\n\n### 주의\n\n${q.caution}`).join('\n\n---\n\n')+'\n';
const outputs=[['content.json',JSON.stringify(data,null,2)+'\n'],['answer-drafts.md',markdown]];
for(const [name,text] of outputs){
 const path=new URL(name,root);
 if(process.argv.includes('--check'))assert.equal(readFileSync(path,'utf8').replace(/\r\n/g,'\n'),text,name+' is out of sync with authored answers');
 else writeFileSync(path,text,'utf8');
}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'build',questions:data.questions.length,paragraphs:data.questions.reduce((n,q)=>n+q.sample.split('\n\n').length,0),minCharacters:Math.min(...data.questions.map(q=>q.sample.length)),maxCharacters:Math.max(...data.questions.map(q=>q.sample.length)),totalCharacters:data.questions.reduce((n,q)=>n+q.sample.length,0),outputs:outputs.map(([name])=>name)}));
