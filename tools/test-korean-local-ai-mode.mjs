import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('function getKoreanAiProcessingMode(');
const end=source.indexOf('\nasync function analyzeDictationImageWithAi',start);
assert.ok(start>0&&end>start);
const code=source.slice(start,end);
function context(search=''){
 const calls=[];
 const result={text:'contract fixture, not inference'};
 const sandbox={window:{location:{search}},URLSearchParams,AIEDUE_KOREAN_FAST_VISION_MODEL:'Gemini 3.8 Flash (Low)',AIEDUE_KOREAN_FAST_TEXT_MODEL:'Gemini 3.8 Flash (Low)',getAiTextFromResponse:value=>value.text,createAiError:()=>new Error('contract error'),fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>result}},fetchStoryResource:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return{ok:true,json:async()=>result}}};
 vm.createContext(sandbox);vm.runInContext(code,sandbox);return{sandbox,calls};
}
test('ordinary site retains automatic processing',async()=>{const{sandbox,calls}=context();await sandbox.callKoreanAiGenerate('학교',{profile:'korean-word-explanation'});assert.equal(calls[0].body.processingMode,'auto');assert.equal(calls[0].url,'/korean-ai/generate');});
test('explicit local URL makes the real shared text/photo function local-only',async()=>{const{sandbox,calls}=context('?ai=local');await sandbox.callKoreanAiGenerate('사진',{imageBase64:'contract-fixture',imageMime:'image/png',profile:'korean-note-photo'});assert.equal(calls[0].body.processingMode,'local-only');assert.equal(calls[0].body.profile,'korean-note-photo');assert.equal(calls[0].body.imageBase64,'contract-fixture');});
test('local URL cannot be silently downgraded by caller options',()=>{const{sandbox}=context('?ai=local');assert.equal(sandbox.getKoreanAiProcessingMode({processingMode:'auto'}),'local-only');});
test('explicit function mode can request local without changing the global default',async()=>{const{sandbox,calls}=context();await sandbox.callKoreanAiGenerate('학교',{processingMode:'local-only'});assert.equal(calls[0].body.processingMode,'local-only');assert.equal(sandbox.getKoreanAiProcessingMode(),'auto');});
test('both generation and iterative editing carry the same explicit processing contract',()=>{assert.match(source,/JSON\.stringify\(\{ prompt, aspectRatio, processingMode: getKoreanAiProcessingMode\(\) \}\)/);assert.match(source,/JSON\.stringify\(\{ prompt, aspectRatio, count: 1, processingMode: getKoreanAiProcessingMode\(\) \}\)/);});
