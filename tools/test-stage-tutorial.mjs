import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildStageTutorial, STAGE_TUTORIALS, STAGE_TUTORIAL_QUESTION } from '../stage-tutorial-core.mjs';
import { createTeacherTutorialController } from '../teacher-tutorial-core.mjs';

for (const role of ['teacher', 'student']) for (const level of [1,2,3,4]) {
    test(`${role} stage ${level}: every button gate, back navigation and completion`, async () => {
        const steps=buildStageTutorial(level,role), opened=[], activated=[];let completed=0;
        const controller=createTeacherTutorialController({session:()=> 'u',open(){},render(){},close(){},prepare:s=>opened.push(s.view),activate:a=>activated.push(a),complete(){completed++;}},steps);
        await controller.start();
        for(let i=0;i<steps.length;i++){
            assert.equal(controller.state().index,i);
            if(i>0){await controller.previous();assert.equal(controller.state().index,i-1);if(steps[i-1].click)await controller.activate(steps[i-1].click);else await controller.next();}
            if(steps[i].click){await controller.next();assert.equal(controller.state().index,i);await controller.activate('unrelated');assert.equal(controller.state().index,i);await controller.activate(steps[i].click);}
            else await controller.next();
        }
        assert.equal(completed,1);assert.equal(controller.state().active,false);
        assert.ok(activated.length>5);assert.equal(new Set(steps.map(s=>s.id)).size,steps.length);
        assert.ok(steps.some(s=>s.interact));assert.ok(steps.every(s=>!s.practice));
        assert.match(steps[0].text,new RegExp(`${level}단계 버튼을 눌러 주세요\\.$`));
        assert.doesNotMatch(steps[0].text,/밝은 단계 카드/);
        assert.notDeepEqual(steps.map(s=>s.text),buildStageTutorial(level,role==='teacher'?'student':'teacher').map(s=>s.text));
        for(const step of steps.filter(s=>s.destination)) assert.equal(steps[steps.indexOf(step)+1].view,step.destination);
    });
}

test('losing access during asynchronous navigation stops the tutorial',async()=>{
    let uid='u',resolve,closed=0;
    const c=createTeacherTutorialController({session:()=>uid,open(){},render(){},close(){closed++;},prepare:()=>new Promise(r=>resolve=r)},buildStageTutorial(3,'student'));
    const pending=c.start();uid=null;resolve();await pending;assert.equal(c.state().active,false);assert.equal(closed,1);
});

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const adapterSource=app.slice(app.indexOf('function stageTutorialSession()'));
function fixture(role='student',level=1){
    const calls=[];let actions,step,installed=0;
    const fakeNode={classList:{contains:()=>true,toggle:(...args)=>calls.push(args),remove(){},add(){}},querySelector(){return fakeNode;},setAttribute(){},scrollIntoView(){},click(){calls.push('actual-click');}};
    const context={currentUserId:'u',currentUserRole:role,loginSuccess:true,auth:{currentUser:{uid:'u'}},unlockedLevels:[level],STAGE_TUTORIALS,STAGE_TUTORIAL_QUESTION,
        stageTutorial:null,teacherTutorial:null,studentOnboardingAutoTimer:null,currentLearningStep:0,drawingEraserMode:false,
        activeDictationSession:{original:true},activeDictationItem:{original:true},activeLiteracyQuestion:{original:true},userLiteracyAnswerChecked:false,isLiteracyLimitBreakMode:false,activeReadingCategory:'basic',readingSlowMode:false,
        CURRICULAR_TRACE_CANVAS_MARKER:'trace',CURRICULAR_AI_CANVAS_GRADING_MARKER:'mission',
        document:{getElementById:()=>fakeNode,querySelector:()=>fakeNode,body:{classList:fakeNode.classList}},
        requestAnimationFrame:fn=>fn(),cancelSpeech(){},clearReadingSpeechState(){},speakTextKo:()=>true,
        showDashboardOnly:()=>calls.push('dashboard'),showTopLevelSection:id=>calls.push(id),hydrateActivityRouteSection(){},resetWordBankCameraModal(){},
        setupLiteracyWorkspace:q=>calls.push(['literacy',q]),configureDictationWorkspace:s=>calls.push(['dictation',s]),
        requireStageAccess:n=>context.currentUserRole==='teacher'||context.unlockedLevels.includes(n),
        installStageTutorial:a=>{installed++;actions=a;return{start(){},destroy(){},state:()=>({active:true,step})};},
        window:{clearTimeout(){},closeAiedueKoreanModal:()=>calls.push('close-modal'),openDictationBankModal:()=>calls.push('bank'),openCurrentDrawingMission:()=>calls.push('actual-drawing'),openTodayDrawingActivity:()=>calls.push('actual-shape'),openSketchbookActivity:()=>calls.push('actual-sketch')}
    };
    vm.createContext(context);vm.runInContext(adapterSource,context);context.window.openStageTutorial(level);
    return{context,calls,get actions(){return actions;},get installed(){return installed;},setStep(s){step=s;}};
}

test('adapter initializes real drawing screens once, dispatches buttons and restores HUD',async()=>{
    const f=fixture(),snapshot=f.actions.capture(),steps=buildStageTutorial(1,'student');
    const entry=steps.find(s=>s.destination==='drawing');f.setStep(entry);await f.actions.activate(entry.click);
    await f.actions.prepare(steps.find(s=>s.view==='drawing'));
    assert.equal(f.calls.filter(c=>c==='actual-drawing').length,1);
    const eraser=steps.find(s=>s.press==='#drawing-eraser-btn');f.setStep(eraser);await f.actions.activate(eraser.click);assert.ok(f.calls.includes('actual-click'));
    f.actions.restore(snapshot,{completed:true});assert.ok(f.calls.includes('drawing-activities-section'));assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='rpg-collapsed'&&c[1]));
    await assert.rejects(f.actions.prepare(entry),/권한/);
});

test('locked stages cannot launch, teacher can explore all four',()=>{
    const f=fixture();f.context.window.openStageTutorial(4);assert.equal(f.installed,1);
    f.context.currentUserRole='teacher';f.context.window.openStageTutorial(4);assert.equal(f.installed,2);
});

test('real curricular renderer receives isolated handwriting sessions; originals restored',async()=>{
    const f=fixture('student',3),original=f.context.activeDictationSession;
    await f.actions.prepare({id:'trace',view:'trace',targets:[]});
    await f.actions.prepare({id:'dictate',view:'dictate',targets:[]});
    const sessions=f.calls.filter(c=>Array.isArray(c)&&c[0]==='dictation').map(c=>c[1]);
    assert.deepEqual(sessions.map(s=>s.kind),['trace','mission']);assert.ok(sessions.every(s=>s.tutorial&&s.items[0].word==='나무'));
    assert.equal(f.context.activeDictationSession,original);f.actions.restore(f.actions.capture(),{completed:false});assert.equal(f.context.activeDictationSession,original);
});

test('real literacy renderer gets labelled practice data and never calls generation',async()=>{
    const f=fixture('student',4);await f.actions.prepare({id:'read',view:'literacy',targets:[]});
    const question=f.calls.find(c=>Array.isArray(c)&&c[0]==='literacy')[1];
    assert.equal(question.tutorial,true);assert.equal(question.options.length,4);assert.equal(question.options[question.answerIndex],'화분에 물을 주었어요.');
});

test('tutorial answer feedback does not persist results and permits retry',async()=>{
    const start=app.indexOf('async function showLiteracyResult('),end=app.indexOf('\n    const answeredQuestion',start);
    const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{classList:{remove(){}}});return nodes.get(id);};
    const context={activeLiteracyQuestion:{...STAGE_TUTORIAL_QUESTION},userLiteracyAnswerChecked:true,setLiteracyCompanionState(){},document:{getElementById:get}};
    vm.createContext(context);vm.runInContext(app.slice(start,end)+'\n}',context);
    await context.showLiteracyResult(false,{userAnswerText:'오답',correctAnswerText:'정답'});assert.equal(context.userLiteracyAnswerChecked,false);assert.match(get('literacy-feedback-title').textContent,/다시/);
    await context.showLiteracyResult(true,{userAnswerText:'정답',correctAnswerText:'정답'});assert.match(get('literacy-feedback-title').textContent,/정답/);
});

test('automatic letter completion during tutorial stops before record/reward writes',async()=>{
    const start=app.indexOf('    async function gradeCompletedWriting('),end=app.indexOf('\n        if (!isTraceWritingComplete',start);
    const context={stageTutorial:{state:()=>({active:true})},isTraceWritingComplete:()=>true};vm.createContext(context);
    vm.runInContext(app.slice(start,end)+'\n}',context);const feedback={};
    assert.equal(await context.gradeCompletedWriting({targetCanvas:{},feedback}),false);assert.match(feedback.textContent,/기록을 저장하지/);
});

test('tutorial adapter excludes uploads, purchases, grading and persistent mutations',()=>{
    assert.doesNotMatch(adapterSource,/\b(setDoc|addDoc|updateDoc|completeTodayDrawingMission|openTodayDictationActivity|openTodayLiteracyMission|getUserMedia|generateAiSketchbookImage|confirmWordBankCameraResult)\s*\(/);
    const source=readFileSync(new URL('../stage-tutorial.js',import.meta.url),'utf8');
    assert.doesNotMatch(source,/mountExercise|stage-tour-practice/);
    assert.match(source,/if \(state\?\.busy\) return/);assert.match(source,/inertNodes\.clear/);
});
