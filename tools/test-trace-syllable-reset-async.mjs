import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function slice(start,end) { const a=source.indexOf(start),b=source.indexOf(end,a); assert(a>=0&&b>a);return source.slice(a,b); }
function deferred() {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function harness() {
 const canvas={id:'letter-word-writing-canvas',dataset:{traceSyllableReset:'',promptVersion:'5'},_traceCompleted:{0:3,1:3},_tracePaths:[],_traceCells:[{index:0},{index:1}],getContext:()=>({})};
 const feedback={textContent:''};
 const button={disabled:false,setAttribute(){},removeAttribute(){}};
 let record=deferred(), awards=0, advances=0;
 const timers=[];
 const context={window:{},console:{warn(){}},document:{getElementById:id=>id.endsWith('feedback')?feedback:canvas},
  stageTutorial:null,currentLearningActivityStep:null,getUnitIdForLesson:()=>null,
  isTraceWritingComplete:c=>c._traceCompleted[0]===3&&c._traceCompleted[1]===3,
  recordKoreanAttempt:()=>record.promise,awardKoreanPracticeExperience:async()=>{awards++;return {grantedExperience:5}},asNumber:Number,
  getTraceWritingCanvas:()=>canvas,tracePointInBox:()=>false,drawTraceWritingGuide(){},drawSavedTracePaths(){},
  wordGradeButton:button,sentenceGradeButton:button,practiceCompletionPending:{word:new Set(),sentence:new Set()},
  embeddedPracticeState:{word:{text:'나무',level:'low'}},wordExamplesByLevel:{low:['나무','바다']},sentenceExamplesByLevel:{low:['나는 가요']},
  pickDifferentPracticeItem:()=> '바다',setEmbeddedPractice(){advances++;canvas.dataset.promptVersion=String(Number(canvas.dataset.promptVersion)+1)},
  waitForNextWritingPrompt:()=>{const d=deferred();timers.push(d);return d.promise},
  advanceAfterSuccessfulWriting:async(_,next)=>next()};
 vm.createContext(context);
 vm.runInContext(slice('    async function gradeCompletedWriting(', '    const letterGradeButton ='),context);
 vm.runInContext(slice('window.resetTraceWritingSyllable =', 'function drawSavedTracePaths('),context);
 vm.runInContext(slice('    async function completeEmbeddedWriting(', "    wordGradeButton.addEventListener('click'"),context);
 const grade=()=>context.gradeCompletedWriting({targetCanvas:canvas,button,feedback,reward:5,attempt:{lessonId:'word',lessonTitle:'word',word:'나무'}});
 return {context,canvas,feedback,grade,reset:()=>context.window.resetTraceWritingSyllable(canvas,1),get record(){return record},setRecord:()=>record=deferred(),get awards(){return awards},get advances(){return advances},timers};
}

test('a syllable retry during successful save settles pending without a duplicate reward',async()=>{
 const h=harness();const grading=h.grade();assert.equal(h.canvas.dataset.rewarded,'pending');
 h.reset();h.record.resolve();assert.equal(await grading,true);
 assert.equal(h.canvas.dataset.rewarded,'true');assert.equal(h.awards,1);
 h.canvas._traceCompleted[1]=3;assert.equal(await h.grade(),false);assert.equal(h.awards,1);
});
test('a failed save after syllable retry releases the guard and permits a genuine retry',async()=>{
 const h=harness();const grading=h.grade();h.reset();h.record.reject(new Error('offline'));
 assert.equal(await grading,false);assert.equal(h.canvas.dataset.rewarded,undefined);assert.equal(h.awards,0);
 h.setRecord();h.canvas._traceCompleted[1]=3;const retry=h.grade();h.record.resolve();
 assert.equal(await retry,true);assert.equal(h.awards,1);assert.equal(h.canvas.dataset.rewarded,'true');
});
test('old queued advance is cancelled even when the reset syllable is rewritten before 900ms',async()=>{
 const h=harness();const old=h.context.completeEmbeddedWriting('word',{autoAdvance:true});
 h.reset();h.canvas._traceCompleted[1]=3;
 const next=h.context.completeEmbeddedWriting('word',{autoAdvance:true});
 assert.equal(h.timers.length,2,'retry generation can schedule its own completion while old generation is pending');
 h.timers[0].resolve();await old;assert.equal(h.advances,0);
 h.timers[1].resolve();await next;assert.equal(h.advances,1);
 h.record.resolve();
});
test('switching to a different prompt never receives the old completion transition',async()=>{
 const h=harness();const old=h.context.completeEmbeddedWriting('word',{autoAdvance:true});
 h.canvas.dataset.promptVersion='6';h.timers[0].resolve();await old;assert.equal(h.advances,0);h.record.resolve();
});
