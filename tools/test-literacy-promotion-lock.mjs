import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { buildTeacherProgressPatch, createTeacherProgressControls } from '../teacher-progress-controls.mjs';
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const block = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function harness() {
    const ctx = { asNumber:(v,f=0)=>Number.isFinite(Number(v))?Number(v):f, literacyPortfolio:{dan:1,stats:{},history:[]}, currentUserProfileSnapshot:{}, Math, console };
    vm.createContext(ctx);
    vm.runInContext(block('function normalizeLiteracyPortfolio(', '\nasync function persistLiteracyData(') + '\n' + block('function getLiteracyStatFromPortfolio(', '\nfunction getLiteracyStat(') + '\n' + block('function getLiteracyDanPlan(', '\nfunction showLiteracyPromotionNotice('), ctx);
    return ctx;
}
const mastered = () => Object.fromEntries(['easy','normal','hard','expert'].flatMap(d=>['multipleChoice','shortAnswer','essay'].map(t=>[`${d}-${t}`,{attempts:20,corrects:20,wrongs:0}])));
test('teacher setting selects 1–12, preserves all stats/history/wallet and writes only control fields',()=>{
    const before={literacyPortfolio:{dan:9,stats:mastered(),history:[{question:'keep'}]},balance:123};
    for(const dan of [1,4,12]) for(const promotionLocked of [true,false]) {
        const patch=buildTeacherProgressPatch(before,'literacy-set',{dan,promotionLocked});
        assert.deepEqual(patch,{literacyDan:dan,'literacyPortfolio.dan':dan,'literacyPortfolio.promotionLocked':promotionLocked});
        assert.equal(before.literacyPortfolio.dan,9);
    }
    for(const dan of [0,13,1.5,'',NaN,Infinity]) assert.throws(()=>buildTeacherProgressPatch(before,'literacy-set',{dan,promotionLocked:true}));
    for(const promotionLocked of ['true',1,null,undefined]) assert.throws(()=>buildTeacherProgressPatch(before,'literacy-set',{dan:1,promotionLocked}));
});
test('normalization preserves a strict boolean lock; legacy profiles stay unlocked',()=>{
    const h=harness();
    assert.equal(h.normalizeLiteracyPortfolio({dan:1,promotionLocked:true}).promotionLocked,true);
    assert.equal(h.normalizeLiteracyPortfolio({dan:1}).promotionLocked,false);
    assert.equal(h.normalizeLiteracyPortfolio({dan:1,promotionLocked:'false'}).promotionLocked,false);
});
test('every locked dan stays fixed even with 100% mastery in all buckets',()=>{
    const h=harness();
    for(let dan=1;dan<=12;dan++) {
        const p=h.normalizeLiteracyPortfolio({dan,promotionLocked:true,stats:mastered(),history:[]});
        assert.equal(h.advanceLiteracyDanIfReady(p),null);
        assert.equal(p.dan,dan);
        assert.equal(p.stats['easy-multipleChoice'].attempts,20);
        for(let i=0;i<30;i++) {
            h.literacyPortfolio=p;
            const plan=h.getLiteracyDanPlan();
            assert.equal(plan.dan,dan);
            assert.equal(plan.difficulty,['easy','normal','hard','expert'][Math.floor((dan-1)/3)]);
            assert.equal(plan.types.length,(dan-1)%3+1);
        }
    }
});
test('unlock resumes original promotion rules without resetting accuracy',()=>{
    const h=harness(),p=h.normalizeLiteracyPortfolio({dan:1,promotionLocked:false,stats:mastered()});
    assert.equal(h.advanceLiteracyDanIfReady(p).nextDan,12);
    const beginner=h.normalizeLiteracyPortfolio({dan:1,stats:{'easy-multipleChoice':{attempts:9,corrects:9,wrongs:0}}});
    assert.equal(h.advanceLiteracyDanIfReady(beginner),null);
    beginner.stats['easy-multipleChoice'].attempts=10;
    beginner.stats['easy-multipleChoice'].corrects=10;
    assert.equal(h.advanceLiteracyDanIfReady(beginner).nextDan,2);
});
test('latest transaction server lock wins over an unlocked stale client while attempts/rewards continue',()=>{
    const h=harness();
    Object.assign(h,{cloneLiteracyValue:structuredClone,currentUserName:'검증',normalizeAiedueLevelExperience:()=>({aeduExperience:0,aeduLevel:1}),AIEDUE_LEVEL_UP_POINT_REWARD:100,formatLiteracyActivityLabel:()=> '문해력 쉬움 객관식',buildActivityStatusSnapshot:()=>({})});
    vm.runInContext(block('function buildLiteracyServerState(', '\nasync function persistLiteracyAttemptAtomic('),h);
    const p={dan:1,promotionLocked:true,stats:mastered(),history:[]};
    const server={literacyPortfolio:p,balance:100,aeduTokens:100,warningTokens:0};
    const attempt={attemptId:'locked-test',difficulty:'easy',type:'multipleChoice',question:{passage:'지문',question:'질문'},isCorrect:true,pointReward:5,experienceReward:1,baseExperience:1,stageMultiplier:1,solvedAt:'2026-11-23T00:00:00.000Z',fallback:{literacyPortfolio:{dan:8,promotionLocked:false},balance:0,warningTokens:0},userAnswerText:'답',score:null};
    const out=h.mergeLiteracyAttemptWithServer(server,attempt);
    assert.equal(out.literacyDan,1);assert.equal(out.promotion,null);assert.equal(out.literacyPortfolio.promotionLocked,true);
    assert.equal(out.literacyPortfolio.stats['easy-multipleChoice'].attempts,21);
    assert.equal(out.literacyPortfolio.stats['easy-multipleChoice'].corrects,21);
    assert.equal(out.literacyPortfolio.history.length,1);assert.equal(out.balance,105);assert.equal(out.aeduExperience,1);
});
test('question launch and detective bank are constrained by the latest locked plan; recovery is transactional',()=>{
    assert.match(source,/refreshLiteracyProgressForMission/);
    const detective=block('async function pickLiteracyDetectiveLimitBreakQuestion(', '\nasync function readDetectiveCooldown(');
    assert.match(detective,/promotionLocked/);assert.match(detective,/plan\.types\.includes/);
    const launch=block('window.startTodayLiteracyMission = ', '\nfunction literacyPassingAccuracy(');
    assert.match(launch,/await refreshLiteracyProgressForMission\(/);
    assert.match(launch,/promotionLocked/);
    const recovery=block('async function recoverLiteracyPromotionAtomic(', '\nfunction showLiteracyPromotionNotice(');
    assert.match(recovery,/runTransaction/);assert.match(recovery,/transaction\.get/);
});
test('actual popup handler saves selected dan and lock, blocks duplicate save and preserves student history',async()=>{
    let click,html='',finish;
    const student={name:'학생',literacyPortfolio:{dan:3,stats:mastered(),history:[{question:'keep'}]}};
    const target={dataset:{progressAction:'literacy-set'},isConnected:true};
    const elements={'result-modal':{contains:()=>true},'teacher-literacy-dan':{value:'7'},'teacher-literacy-promotion-lock':{checked:true}};
    const calls=[],alerts=[];
    const controls=createTeacherProgressControls({
        document:{addEventListener:(type,fn)=>{click=fn;},getElementById:id=>elements[id]},
        window:{confirm:()=>{throw new Error('non-destructive adjustment must not confirm deletion');},alert:e=>alerts.push(e)},
        escapeHtml:String,getStudent:()=>student,showModal:s=>{html=s;},
        mutate:async(sid,action,args)=>{calls.push({sid,action,args});await new Promise(r=>{finish=r;});student.literacyPortfolio.dan=Number(args.dan);student.literacyPortfolio.promotionLocked=args.promotionLocked;}
    });
    controls.adjustment('student');assert.equal((html.match(/<option /g)||[]).length,12);
    const event={target:{closest:()=>target}},first=click(event);
    await click(event);assert.equal(calls.length,1);assert.equal(target.disabled,true);
    finish();await first;
    assert.equal(calls[0].sid,'student');assert.equal(calls[0].action,'literacy-set');assert.equal(calls[0].args.dan,'7');assert.equal(calls[0].args.promotionLocked,true);
    assert.match(html,/저장했습니다/);assert.match(html,/value="7" selected/);assert.match(html,/type="checkbox" checked/);
    assert.deepEqual(student.literacyPortfolio.history,[{question:'keep'}]);assert.deepEqual(alerts,[]);assert.equal(target.disabled,false);
});
test('login recovery reads current server lock instead of promoting stale local mastery',async()=>{
    const h=harness(),writes=[];h.currentUserId='student';h.cloneLiteracyValue=structuredClone;
    h.doc=()=>({path:'users/student'});h.serverTimestamp=()=>0;
    h.runTransaction=async(db,fn)=>fn({get:async()=>({exists:()=>true,data:()=>({literacyPortfolio:{dan:1,promotionLocked:true,stats:mastered()}})}),update:(ref,data)=>writes.push(data)});h.db={};
    h.literacyPortfolio={dan:9,promotionLocked:false,stats:mastered()};
    const result=await h.recoverLiteracyPromotionAtomic('student');
    assert.equal(result.portfolio.dan,1);assert.equal(result.portfolio.promotionLocked,true);assert.equal(result.promotion,null);assert.deepEqual(writes,[]);
});
test('latest mission refresh rejects an account switch while the read is in flight',async()=>{
    const h=harness();let resolve;h.currentUserId='first';h.db={};h.doc=()=>({});h.updateLiteracyDanBadges=()=>{};
    h.getDoc=()=>new Promise(r=>{resolve=r;});
    vm.runInContext(block('async function refreshLiteracyProgressForMission(', '\nwindow.openTodayLiteracyMission ='),h);
    const refresh=h.refreshLiteracyProgressForMission();h.currentUserId='second';
    resolve({exists:()=>true,data:()=>({literacyPortfolio:{dan:8,promotionLocked:true}})});
    await assert.rejects(refresh,/로그인 정보를 확인/);assert.equal(h.literacyPortfolio.dan,1);
});
