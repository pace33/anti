import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { buildStageTutorial } from '../stage-tutorial-core.mjs';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
function source(start,end){const a=app.indexOf(start);assert.ok(a>=0,`missing ${start}`);const b=app.indexOf(end,a+start.length);assert.ok(b>a,`missing ${end}`);return app.slice(a,b);}
function fixture(){
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,innerHTML:'',attrs:{},classList:{toggle(){}},setAttribute(k,v){this.attrs[k]=v;}});return nodes.get(id);};
 const context={window:{},document:{getElementById:node},dictationPortfolio:{koreanBank:{words:['나무'],syllableStats:{나:{attempts:3}}}},
 literacyPortfolio:{stats:{'easy-multipleChoice':{attempts:2,corrects:1}},history:[{solvedAt:'2026-01-01',difficulty:'easy',type:'multipleChoice',isCorrect:false,passage:'지문',question:'질문',userAnswer:'오답'}]},
 escapeHtml:s=>String(s).replaceAll('<','&lt;'),renderCurricularWordBankStats:()=>'<p>기존 단어 통계</p>',renderCurricularSyllableBankStats:()=>'<p>기존 음절 통계</p>',
 requireStageAccess:()=>true,renderMyDictationSection(){},showTopLevelSection(){},showModal(value){context.modal=value;}};
 vm.createContext(context);return {context,node};
}
test('전체 앱은 브라우저와 같은 ES-module 문법으로 초기화할 수 있다',()=>{
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:app,encoding:'utf8'});
 assert.equal(parsed.status,0,parsed.stderr);
});
test('4단계 기록 탭 클릭은 모달 sanitizer의 최소 허용 목록을 통과한다',()=>{
 const c={};vm.createContext(c);vm.runInContext(app.slice(app.indexOf('const SAFE_MODAL_ACTIONS = '),app.indexOf('function sanitizeModalHtml(')),c);
 assert.equal(c.isSafeModalAction("setMyLiteracyRecordTab('bank')"),true);
 assert.equal(c.isSafeModalAction("setMyLiteracyRecordTab('records')"),true);
 assert.equal(c.isSafeModalAction("setMyLiteracyRecordTab('bank');alert(1)"),false);
 assert.equal(c.isSafeModalAction("unknownAction('bank')"),false);
});

test('3·4단계 대시보드 단어 은행 카드를 기록 안으로 이동한다',()=>{
 for(const [start,end] of [['dictation-activities-section','literacy-activities-section'],['literacy-activities-section','learning-start-section']]){
  const section=html.slice(html.indexOf(`id="${start}"`),html.indexOf(`id="${end}"`));
  assert.doesNotMatch(section,/onclick="openDictationBankModal\(\)"/);
 }
});
test('3단계 기록에 독립적인 기록·단어 은행 탭과 패널이 있다',()=>{
 for(const id of ['my-dictation-tab-records','my-dictation-tab-bank','my-dictation-records-panel','my-dictation-bank-panel'])assert.ok(html.includes(`id="${id}"`),id);
 assert.match(html,/setMyDictationRecordTab\('bank'\)/);
});
test('공유되는 것은 기존 은행 렌더러뿐이며 단어·음절 통계를 모두 유지한다',()=>{
 const f=fixture();vm.runInContext(source('function renderDictationBankContent()', 'window.openDictationBankModal'),f.context);
 const text=f.context.renderDictationBankContent();
 assert.match(text,/단어 은행 1개/);assert.match(text,/음절 은행 1개/);
 assert.match(text,/기존 단어 통계/);assert.match(text,/기존 음절 통계/);
 assert.match(text,/10회/);assert.match(text,/80%/);
});
test('3단계 은행 탭은 오답·완료·미션 DOM을 보존하고 되돌아갈 수 있다',()=>{
 const f=fixture();f.context.renderDictationBankContent=()=>'<p>단어·음절</p>';
 vm.runInContext(source('window.setMyDictationRecordTab =','window.openMyDictationFromDashboard'),f.context);
 const records=f.node('my-dictation-records-panel');records.innerHTML='오답·완료·미션';
 f.context.window.setMyDictationRecordTab('bank');assert.equal(records.hidden,true);
 assert.equal(f.node('my-dictation-bank-panel').hidden,false);assert.match(f.node('my-dictation-bank-panel').innerHTML,/단어·음절/);
 assert.equal(f.node('my-dictation-tab-bank').attrs['aria-selected'],'true');
 f.context.window.setMyDictationRecordTab('records');assert.equal(records.hidden,false);assert.equal(f.node('my-dictation-bank-panel').hidden,true);assert.equal(records.innerHTML,'오답·완료·미션');
});
test('4단계 기록은 기존 유형별 통계·지문·풀이 이력과 독립 탭을 유지한다',()=>{
 const f=fixture();f.context.renderDictationBankContent=()=>'<p>단어·음절</p>';
 vm.runInContext(source('window.openMyLiteracyRecord =','window.closeEmbeddedActivity'),f.context);
 f.context.window.openMyLiteracyRecord();
 assert.match(f.context.modal,/유형\/난이도별 통계/);assert.match(f.context.modal,/입력한 답안: 오답/);assert.match(f.context.modal,/지문: 지문/);
 for(const id of ['my-literacy-tab-records','my-literacy-tab-bank','my-literacy-records-panel','my-literacy-bank-panel'])assert.ok(f.context.modal.includes(`id="${id}"`),id);
 assert.doesNotMatch(f.context.modal,/교과 맞춤쓰기 오답 은행/);
 f.node('my-literacy-records-panel').innerHTML='문해력 통계·풀이 이력';
 f.context.window.setMyLiteracyRecordTab('bank');assert.equal(f.node('my-literacy-records-panel').hidden,true);assert.equal(f.node('my-literacy-bank-panel').hidden,false);
 f.context.window.setMyLiteracyRecordTab('records');assert.equal(f.node('my-literacy-records-panel').hidden,false);assert.equal(f.node('my-literacy-bank-panel').hidden,true);assert.equal(f.node('my-literacy-records-panel').innerHTML,'문해력 통계·풀이 이력');
});
for(const role of ['student','teacher'])for(const level of [3,4])test(`${role} ${level}단계 처음 해봐요는 해당 기록에서 은행 탭을 직접 누른다`,()=>{
 const steps=buildStageTutorial(level,role),prefix=level===3?'my-dictation':'my-literacy',view=level===3?'dictation-record':'literacy-record';
 const entry=steps.find(s=>s.id===`stage-${level}-record`),bank=steps.find(s=>s.id===`stage-${level}-bank-tab`),look=steps.find(s=>s.id===`stage-${level}-bank-view`),back=steps.find(s=>s.id===`stage-${level}-record-return-tab`);
 assert.ok(entry&&bank&&look&&back);assert.ok(steps.indexOf(entry)<steps.indexOf(bank));assert.equal(bank.view,view);assert.equal(bank.press,`#${prefix}-tab-bank`);assert.deepEqual(look.targets,[`#${prefix}-bank-panel`]);assert.equal(back.press,`#${prefix}-tab-records`);
 assert.equal(steps.some(s=>s.destination==='bank'),false);assert.match(look.text,/음절/);
});
