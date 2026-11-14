// Contract fixtures below test state isolation only; live model accuracy is measured separately.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('function normalizeCurricularAiText('),source.indexOf('window.confirmCurricularCanvasItem'));
async function run(search='?handwriting=gemma',options={}){
 const calls=[],writes=[],modals=[];const button={disabled:false,innerText:''},status={innerText:''};
 const item={answer:'학교',word:'학교',difficulty:2};
 const c={window:{location:{search}},URLSearchParams,currentUserId:'isolated-qa',activeDictationSession:{difficulty:2,items:[item]},activeDictationImageAnalysis:'',
 document:{getElementById:id=>id.startsWith('curricular-writing-canvas')?{toDataURL:()=> 'data:image/png;base64,cXVhbGl0eS1jb250cmFjdA=='}:id.startsWith('curricular-confirm-btn')?button:status},
 hasCurricularCanvasInk:()=>options.ink!==false,aieduLoading:{start:()=>1,finish:async()=>{}},gradingFeedback:{close(){},show(){writes.push('grading-comic')}},
 atob:x=>Buffer.from(x,'base64').toString('binary'),Blob,recognizeHandwritingOnDevice:async()=>{calls.push({local:true});return {written:'학교',confidence:1};},
 callKoreanAiGenerate:async(prompt,opts)=>{calls.push({prompt,opts});if(options.fail)throw Error('controlled contract failure');if(options.stale)c.activeDictationSession={items:[]};return JSON.stringify(options.result||{written:'학고',correct:true,confidence:1,analysis:'contract fixture, not inference'});},
 parseAiJsonObject:JSON.parse,cleanKoreanSentence:String,cleanKoreanWord:String,recordCurricularWritingResultSyllables:async()=>writes.push('grade'),startCurricularRetryMode:()=>writes.push('retry'),checkpointCurricularWritingSession:async()=>writes.push('checkpoint'),updateCurricularWritingActionButtons(){},showModal:x=>modals.push(x),aiErrorMessage:()=> 'AI 생성에 실패했습니다. 오류 코드: AI-1099',getCurricularItemScore:r=>r.score,formatCurricularScore:String,console:{error(){}},showAiedueAutoToast(){}};
 vm.createContext(c);vm.runInContext(code,c);await c.gradeCurricularCanvasItemWithAi(0);return {calls,writes,modals,item,status,button};
}
test('Gemma trial sends real image, explicit local-only model and no expected text',async()=>{const r=await run();assert.equal(r.calls.length,1);assert.equal(r.calls[0].opts.model,'desktop-gemma');assert.equal(r.calls[0].opts.processingMode,'local-only');assert.equal(r.calls[0].opts.profile,'korean-handwriting-grade');assert.equal(r.calls[0].opts.imageMime,'image/png');assert.ok(r.calls[0].opts.imageBase64);assert.ok(!r.calls[0].prompt.includes('학교'));assert.ok(r.calls[0].prompt.includes('일반 한글'));});
test('trial preserves actual observed typo, cannot grade, award points, checkpoint, retry or mark complete',async()=>{const r=await run();assert.deepEqual(r.writes,[]);assert.equal(r.item.aiGraded,undefined);assert.equal(r.item.traceComplete,undefined);assert.equal(r.item.aiPreviewResult.written,'학고');assert.ok(r.status.innerText.includes('학고'));assert.ok(r.status.innerText.includes('반영하지 않아요'));assert.equal(r.button.disabled,false);});
test('correct-looking, extra-letter and uncertain trial outputs remain non-authoritative',async()=>{for(const written of ['학교','학교ㅋ','']){const r=await run('?handwriting=gemma',{result:{written,correct:Boolean(written),confidence:.99,analysis:'contract fixture'}});assert.deepEqual(r.writes,[]);assert.equal(r.item.aiPreviewResult.written,written);}});
test('failure, empty ink and stale trial cannot write or publish late preview',async()=>{for(const opt of [{fail:true},{ink:false},{stale:true}]){const r=await run('?handwriting=gemma',opt);assert.deepEqual(r.writes,[]);assert.equal(r.item.aiPreviewResult,undefined);assert.equal(r.button.disabled,false);}});
test('default and unrecognized URL use on-device OCR, not Gemma',async()=>{for(const search of ['', '?handwriting=anything']){const r=await run(search);assert.deepEqual(r.calls,[{local:true}]);assert.ok(r.writes.includes('grade'));assert.ok(r.writes.includes('checkpoint'));assert.equal(r.item.aiPreviewResult,undefined);}});
