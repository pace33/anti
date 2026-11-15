import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('async function createLiteracyMissionQuestion(');
const end=source.indexOf('\nwindow.startTodayLiteracyMission',start);
const code=source.slice(start,end);
test('all question types and diversity retries use Antigravity while retaining profile and timeout',async()=>{
 for(const detective of [false,true]) for(const type of ['multipleChoice','shortAnswer','essay']){
  const calls=[];
  const c=vm.createContext({
   AIEDUE_KOREAN_FAST_TEXT_MODEL:'Gemini 3.8 Flash (Low)',
   buildLiteracyGenerationContext:()=>({primaryWords:['학교','나무','책'],frame:'fixture'}),
   generateLiteracyPrompt:()=> 'fixture prompt',generateLiteracyDetectivePrompt:()=> 'fixture detective',
   callKoreanAiGenerate:async(prompt,options)=>{calls.push(options);return JSON.stringify({passage:'학교 이야기',question:'무엇인가요?'});},
   parseAiQuestionResponse:JSON.parse,countLiteracyBankWordCoverage:()=>0,getLiteracyDanPlan:()=>({dan:1})
  });
  vm.runInContext(code,c);
  const result=await c.createLiteracyMissionQuestion('easy',type,{detective});
  assert.equal(result.type,type);assert.equal(calls.length,2);
  for(const options of calls){assert.equal(options.model,'Gemini 3.8 Flash (Low)');assert.equal(options.processingMode,'gemini-only');assert.equal(options.profile,'korean-literacy-generate-'+type);assert.equal(options.requestTimeoutMs,150000);}
 }
});
