import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {aiErrorMessage,aiErrorCode,createAiError} from '../ai-error-utils.mjs';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function section(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a);return source.slice(a,b);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject};}
function harness(options={}){
 const elements=new Map(),timers=[],starts=[],messages=[],opened=[];let saved=0,rewards=0;
 function element(id){if(!elements.has(id)){const classes=new Set(['hidden']);elements.set(id,{id,innerHTML:'',innerText:'',value:'',src:'',disabled:false,classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle(c,on){if(on)classes.add(c);else classes.delete(c)}},setAttribute(){},querySelector(){return {innerText:''}}});}return elements.get(id);}
 const context={aiErrorMessage,aiErrorCode,createAiError,window:{},console:{warn(){},error(){},info(){}},document:{getElementById:element,body:{classList:{add(){},remove(){}}}},
 wordBankCameraDiagnostic:null,wordBankCameraBusy:false,currentUserId:'qa-photo',
 pendingWordBankCameraReward:null,pendingWordBankCameraAfterSave:null,pendingCurricularWritingRoundStart:null,wordBankCameraRevision:0,
 activeWordBankCameraStream:null,activeDictationSession:null,activeDictationItem:null,activeDictationImageAnalysis:'',
 dictationPortfolio:{koreanBank:{words:[]},captures:[],curricularWriting:{}},
 setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},
 setWordBankCameraStatus:message=>messages.push(message),stopWordBankCamera(){},
 aieduLoading:{start:()=>1,finish(){}},normalizeDictationPhotoFile:async file=>({file,dataUrl:'data:image/jpeg;base64,AA=='}),
 readImageFileAsDataUrl:async()=> 'data:image/jpeg;base64,AA==',runDictationOcr:async()=> '학교 나무',
 analyzeDictationImageWithAi:async()=> '학교 나무',extractDictationWordsWithAi:async()=>({words:options.extractedWords??['학교','나무'],visibleCandidates:options.visibleCandidates??['학교','나무','사진','분석']}),
 cleanKoreanWord:w=>w,isLikelyKoreanNounBankWord:w=>Boolean(w),mergeKoreanBank({words}){context.dictationPortfolio.koreanBank.words=words;},
 prepareCurricularWritingRound(words){return context.dictationPortfolio.curricularWriting={activeRoundId:'photo-round',photoCapturedAt:'now',activeWords:words,photoWords:words,reviewWords:[]};},
 sanitizeDictationCaptureRecord:record=>record,persistDictationData:async()=>{saved++;},updateDictationDashboardPreview(){},
 renderWordBankCameraResult(){},awardLessonPhotoPoints:async()=>{rewards++;},showAiedueAutoToast(){}};
 context.window.startWordBankCamera=()=>{};context.window.goDictationDashboard=()=>{};
 context.window.startCurricularTraceStep=round=>{starts.push(round);element('dictation-workspace-section').classList.remove('hidden');};
 vm.createContext(context);
 vm.runInContext(section('function setWordBankCameraDiagnostic(', 'function stopWordBankCamera('),context);
 vm.runInContext(section('function resetWordBankCameraModal(', 'window.startWordBankCamera ='),context);
 vm.runInContext(section('window.openDictationBankCamera =', 'function renderWordBankCameraResult('),context);
 vm.runInContext(section('async function processWordBankCameraPhoto(', 'window.captureWordBankCameraPhoto ='),context);
 vm.runInContext(section('window.retryWordBankCamera =', 'async function runDictationOcr('),context);
 vm.runInContext(section('window.triggerLessonPhotoCapture =', 'window.handleLessonPhotoCapture ='),context);
 const originalOpen=context.window.openDictationBankCamera;
 context.window.openDictationBankCamera=options=>{opened.push(options);return originalOpen(options);};
 return{context,element,starts,messages,opened,timers,get saved(){return saved},get rewards(){return rewards},flush(){const pending=timers.splice(0);pending.forEach(t=>t.fn());}};
}

test('photo rounds keep only final AI words, never raw OCR/analysis metadata candidates', async () => {
 const h=harness();h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 await h.context.processWordBankCameraPhoto({}, 'data:image/jpeg;base64,PHOTO');
 assert.deepEqual([...h.context.dictationPortfolio.captures[0].words],['학교','나무']);
 assert.deepEqual([...h.context.pendingCurricularWritingRoundStart.words],['학교','나무']);
});

test('a genuinely selected photo word stays legal; empty final selection never saves raw candidates', async () => {
 const selected=harness({extractedWords:['사진']});selected.context.window.openDictationBankCamera({afterSave:'curricular-writing'});selected.flush();
 await selected.context.processWordBankCameraPhoto({}, 'data:image/jpeg;base64,PHOTO');
 assert.deepEqual([...selected.context.dictationPortfolio.captures[0].words],['사진']);
 const empty=harness({extractedWords:[]});empty.context.window.openDictationBankCamera({afterSave:'curricular-writing'});empty.flush();
 await empty.context.processWordBankCameraPhoto({}, 'data:image/jpeg;base64,PHOTO');
 assert.equal(empty.saved,0);assert.equal(empty.context.pendingCurricularWritingRoundStart,null);
 assert.ok(empty.messages.some(message=>message.startsWith('AI 생성에 실패했습니다. 오류 코드: AI-')));
});

test('extraction prompt removes OCR/AI section labels without banning legitimate photo words', async () => {
 const prompts=[];
 const context={dictationPortfolio:{koreanBank:{words:[]}},splitDictationCandidateWords:text=>text.match(/[가-힣]+/g)||[],
  cleanKoreanWord:word=>word,isLikelyKoreanNounBankWord:()=>true,AIEDUE_KOREAN_FAST_TEXT_MODEL:'test',
  callKoreanAiGenerate:async prompt=>{prompts.push(prompt);return '{"words":["사진"]}'},parseAiJsonObject:raw=>JSON.parse(raw)};
 vm.createContext(context);vm.runInContext(section('async function extractDictationWordsWithAi(', 'const SHARED_WORD_CARD_COLLECTION'),context);
 const result=await context.extractDictationWordsWithAi('[OCR]\n학교 나무\n\n[AI 사진 분석]\n바다');
 assert.deepEqual([...result.visibleCandidates],['학교','나무','바다']);
 assert.ok(prompts[0].includes('화면 후보 단어: 학교, 나무, 바다'));
 assert.ok(!prompts[0].includes('[AI 사진 분석]'));
 assert.deepEqual([...result.words],['사진']);
});

test('stage 3 writing controls reserve scroll space above the HUD without moving the HUD', () => {
 const css=readFileSync(new URL('../app.css',import.meta.url),'utf8');
 const marker='/* Stage 3 writing: keep controls reachable above the profile HUD. */';
 const start=css.indexOf(marker);assert(start>=0);const block=css.slice(start,css.indexOf('.class-timetable-frame',start));
 assert.match(block,/body\.rpg-hud-active #dictation-workspace-section/);
 assert.match(block,/padding-bottom: calc\(190px \+ env/);
 assert.match(block,/scroll-padding-bottom: 190px/);
 assert.match(block,/#dictation-workspace-section > \.learning-pane/);
 assert.match(block,/#dictation-question-panel/);
 assert.ok(!block.includes('display: none'));
});

test('stage 3 photo header selects curricular writing, other-stage photo header remains bank-only', () => {
 const h=harness();h.element('dictation-activities-section').classList.remove('hidden');
 h.context.window.triggerLessonPhotoCapture();assert.equal(h.context.pendingWordBankCameraAfterSave,'curricular-writing');
 h.element('dictation-activities-section').classList.add('hidden');h.context.window.triggerLessonPhotoCapture();
 assert.equal(h.context.pendingWordBankCameraAfterSave,null);
});
test('retaking a curricular photo preserves the writing destination but discards the old round',()=>{
 const h=harness();h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});
 h.context.pendingCurricularWritingRoundStart={ready:true,words:['옛날']};h.context.window.retryWordBankCamera();
 assert.equal(h.context.pendingWordBankCameraAfterSave,'curricular-writing');assert.equal(h.context.pendingCurricularWritingRoundStart,null);
});
test('extraction after retake saves once and immediately starts a photo-backed writing round',async()=>{
 const h=harness();h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.context.window.retryWordBankCamera();h.flush();
 await h.context.processWordBankCameraPhoto({name:'note.jpg'});
 assert.equal(h.saved,1);assert(h.timers.some(t=>t.delay===0),'no 1.4 second confirmation delay');h.flush();
 assert.equal(h.starts.length,1);assert.deepEqual(Array.from(h.starts[0].words),['학교','나무']);
 assert.equal(h.element('word-bank-camera-modal').classList.contains('hidden'),true);
 h.context.window.closeWordBankCameraModal();assert.equal(h.starts.length,1,'closing again cannot restart');
});
test('bank-only extraction saves without opening curricular writing',async()=>{
 const h=harness();h.context.window.openDictationBankCamera();h.flush();await h.context.processWordBankCameraPhoto({});h.flush();
 assert.equal(h.saved,1);assert.equal(h.starts.length,0);
});
test('a cancelled or replaced extraction cannot resurrect its old round',async()=>{
 const h=harness(),d=deferred();h.context.normalizeDictationPhotoFile=()=>d.promise;
 h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();const old=h.context.processWordBankCameraPhoto({});
 h.context.window.closeWordBankCameraModal();h.context.window.openDictationBankCamera();h.flush();
 d.resolve({file:{},dataUrl:'data:image/jpeg;base64,AA=='});await old;h.flush();
 assert.equal(h.saved,0);assert.equal(h.starts.length,0);assert.equal(h.context.pendingCurricularWritingRoundStart,null);
});
test('save failure shows a recoverable error and never marks an unsaved round ready',async()=>{
 const h=harness();h.context.persistDictationData=async()=>{throw new Error('저장 연결 실패')};
 h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();await h.context.processWordBankCameraPhoto({});
 h.context.window.closeWordBankCameraModal();h.flush();assert.equal(h.starts.length,0);assert.equal(h.context.pendingCurricularWritingRoundStart,null);
 assert(h.messages.includes('AI 생성에 실패했습니다. 오류 코드: AI-1008'));
});

test('saved round survives a transition exception; error remains outside popup and retry does not save again', async()=>{
 const h=harness();h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 await h.context.processWordBankCameraPhoto({});
 h.context.window.startCurricularTraceStep=()=>{throw new Error('private render failure')};
 await h.context.window.closeWordBankCameraModal();
 assert.equal(h.context.pendingCurricularWritingRoundStart?.ready,true);
 assert.equal(h.element('word-bank-camera-error').innerText,'AI 생성에 실패했습니다. 오류 코드: AI-1105');
 assert.equal(h.element('word-bank-camera-error').classList.contains('hidden'),false);
 h.context.window.startCurricularTraceStep=round=>{h.starts.push(round);h.element('dictation-workspace-section').classList.remove('hidden');};
 await h.context.window.resumeWordBankCameraRound();
 assert.equal(h.starts.length,1);assert.equal(h.saved,1);
 assert.equal(h.context.pendingCurricularWritingRoundStart,null);
});

test('silent transition failure is not reported as complete and an account change cannot resume another owner',async()=>{
 const h=harness();h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 await h.context.processWordBankCameraPhoto({});h.context.window.startCurricularTraceStep=()=>{};
 await h.context.window.closeWordBankCameraModal();assert.equal(h.context.wordBankCameraDiagnostic.code,'AI-1105');
 h.context.currentUserId='other';assert.equal(h.context.window.resumeWordBankCameraRound(),false);
 assert.equal(h.context.pendingCurricularWritingRoundStart,null);assert.equal(h.starts.length,0);
 assert.equal(h.context.wordBankCameraDiagnostic.code,'AI-1106');
});

test('account change while analyzing never saves the photo to the new account',async()=>{
 const h=harness(),d=deferred();h.context.analyzeDictationImageWithAi=()=>d.promise;
 h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 const task=h.context.processWordBankCameraPhoto({});await new Promise(r=>setImmediate(r));
 h.context.currentUserId='other';d.resolve('학교');await task;h.flush();
 assert.equal(h.saved,0);assert.equal(h.starts.length,0);
});

test('overload code survives and remains visible on menu after popup closes; diagnostic contains no input',async()=>{
 const h=harness();h.context.analyzeDictationImageWithAi=async()=>{throw createAiError({error:'private provider trace'},429)};
 h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 await h.context.processWordBankCameraPhoto({name:'private-photo.jpg'});
 await h.context.window.closeWordBankCameraModal();
 assert.equal(h.element('word-bank-camera-error').innerText,'AI 생성에 실패했습니다. 오류 코드: AI-1003');
 const d=h.context.window.getWordBankCameraDiagnostics();assert.equal(d.stage,'analysis');assert.equal(d.code,'AI-1003');
 assert(!JSON.stringify(d).includes('private'));assert.equal(h.saved,0);assert.equal(h.starts.length,0);
});

test('closing during analysis leaves interruption code and stale response cannot save',async()=>{
 const h=harness(),d=deferred();h.context.analyzeDictationImageWithAi=()=>d.promise;
 h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 const task=h.context.processWordBankCameraPhoto({});await new Promise(r=>setImmediate(r));
 await h.context.window.closeWordBankCameraModal();d.resolve('학교');await task;h.flush();
 assert.equal(h.element('word-bank-camera-error').innerText,'AI 생성에 실패했습니다. 오류 코드: AI-1106');
 assert.equal(h.saved,0);assert.equal(h.starts.length,0);
});

test('capture rejects null encoding and ignores a late blob from a closed popup',async()=>{
 const h=harness();h.context.getDictationPhotoSize=()=>({width:100,height:100});h.context.DICTATION_PHOTO_JPEG_QUALITY=.8;
 h.context.File=class{};let callback;
 Object.assign(h.element('word-bank-camera-video'),{videoWidth:100,videoHeight:100,readyState:4});
 Object.assign(h.element('word-bank-camera-canvas'),{getContext:()=>({drawImage(){}}),toDataURL:()=> 'data:image/jpeg;base64,PHOTO',toBlob:fn=>{callback=fn}});
 vm.runInContext(section('window.captureWordBankCameraPhoto =','window.retryWordBankCamera ='),h.context);
 h.context.window.openDictationBankCamera({afterSave:'curricular-writing'});h.flush();
 h.context.window.captureWordBankCameraPhoto();callback(null);
 assert.equal(h.element('word-bank-camera-error').innerText,'AI 생성에 실패했습니다. 오류 코드: AI-1102');
 h.context.window.captureWordBankCameraPhoto();await h.context.window.closeWordBankCameraModal();callback({});h.flush();
 assert.equal(h.saved,0);assert.equal(h.starts.length,0);
});
