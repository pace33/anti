import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { STAGE_TUTORIALS } from '../stage-tutorial-core.mjs';
import { buildStageTutorial, isTutorialAnswer, isTutorialWord, TUTORIAL_PASSAGE, tracePoints, nearPoint } from '../stage-tutorial-core.mjs';
import { createTeacherTutorialController } from '../teacher-tutorial-core.mjs';

for (const role of ['teacher', 'student']) for (const level of [1,2,3,4]) {
    test(`${role} stage ${level} walks each real screen and waits for every practice`, async () => {
        const steps = buildStageTutorial(level, role), views = []; let completed = 0;
        const controller = createTeacherTutorialController({ session: () => 'u', open() {}, render() {}, close() {},
            prepare: step => views.push(step.view), activate() {}, complete() { completed++; } }, steps);
        await controller.start();
        assert.equal(controller.state().step.id, `stage-${level}-enter`);
        for (let i=0; i<steps.length; i++) {
            assert.equal(controller.state().index, i);
            if (steps[i].click) {
                await controller.next(); assert.equal(controller.state().index, i);
                await controller.activate('wrong'); assert.equal(controller.state().index, i);
                await controller.activate(steps[i].click);
            } else await controller.next();
        }
        assert.equal(completed, 1); assert.equal(controller.state().active, false);
        assert.equal(views.length, steps.length);
        assert.ok(steps.filter(step => step.practice).length >= 2);
        assert.equal(new Set(steps.map(step=>step.id)).size, steps.length);
        assert.ok(steps.every(step => step.text && !step.text.includes('undefined')));
        assert.notDeepEqual(steps.map(step=>step.text), buildStageTutorial(level, role === 'teacher' ? 'student' : 'teacher').map(step=>step.text));
    });
}
test('practice checks preserve incorrect answers for retry and accept Korean composition', () => {
    assert.equal(isTutorialAnswer('sound', '고'), false);
    assert.equal(isTutorialAnswer('sound', '가'), true);
    assert.equal(isTutorialAnswer('collect', '책'), false);
    assert.equal(isTutorialAnswer('literal', '우산'), true);
    assert.equal(isTutorialAnswer('infer', '눈이 와서'), false);
    assert.equal(isTutorialAnswer('infer', '비가 와서'), true);
    assert.equal(isTutorialAnswer('evidence', TUTORIAL_PASSAGE[1]), false);
    assert.equal(isTutorialAnswer('evidence', TUTORIAL_PASSAGE[0]), true);
    assert.equal(isTutorialWord(' 과사 '), false);
    assert.equal(isTutorialWord(' 사과 '.normalize('NFD')), true);
    assert.equal(isTutorialWord(''), false);
    assert.ok(nearPoint(tracePoints('trace-line')[0], [60,100]));
    assert.equal(nearPoint(tracePoints('trace-line')[0], [300,100]), false);
    assert.deepEqual(tracePoints('trace-letter'), [[80,50],[280,50],[280,155]]);
});
test('losing stage access during a pending navigation cancels the tutorial', async () => {
    let session='u', resolve, closed=0;
    const controller=createTeacherTutorialController({session:()=>session,open(){},render(){},close(){closed++;},prepare:()=>new Promise(r=>resolve=r)},buildStageTutorial(3,'student'));
    const pending=controller.start(); session=null; resolve(); await pending;
    assert.equal(controller.state().active,false); assert.equal(closed,1);
});
test('stage preview adapter has no reward, record, camera or AI generation writes', () => {
    const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
    const adapter=app.slice(app.indexOf('function stageTutorialSession()'));
    assert.doesNotMatch(adapter, /\b(setDoc|addDoc|updateDoc|commitKorean|completeTodayDrawingMission|openTodayDictationActivity|openTodayLiteracyMission|getUserMedia|generateAiSketchbookImage)\s*\(/);
    assert.match(adapter,/requireStageAccess\(level/);
    assert.match(adapter,/unlockedLevels.includes\(level\)/);
});
test('actual launch adapter rejects locked stages and restores the screen and HUD', async () => {
    const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
    const source=app.slice(app.indexOf('function stageTutorialSession()'));
    const calls=[]; let installed=0, actions;
    const hud={classList:{contains:()=>true,toggle:(key,value)=>calls.push([key,value])},querySelector:()=>({setAttribute(){}})};
    const context={currentUserId:'u',currentUserRole:'student',loginSuccess:true,auth:{currentUser:{uid:'u'}},unlockedLevels:[1],STAGE_TUTORIALS,
        stageTutorial:null,teacherTutorial:null,studentOnboardingAutoTimer:null,
        document:{getElementById:()=>hud,querySelector:()=>({scrollIntoView(){}})},
        requestAnimationFrame:fn=>fn(),cancelSpeech(){},speakTextKo:()=>true,
        showDashboardOnly:()=>calls.push('dashboard'),showTopLevelSection:id=>calls.push(id),hydrateActivityRouteSection(){},
        requireStageAccess:level=>context.currentUserRole==='teacher'||context.unlockedLevels.includes(level),
        installStageTutorial:adapter=>{installed++;actions=adapter;return{start(){},destroy(){}};},
        window:{clearTimeout(){},closeAiedueKoreanModal:()=>calls.push('close-modal'),openDictationBankModal:()=>calls.push('bank')}
    };
    vm.createContext(context);vm.runInContext(source,context);
    context.window.openStageTutorial(3);assert.equal(installed,0);
    context.window.openStageTutorial(1);assert.equal(installed,1);
    const snapshot=actions.capture();
    await actions.prepare({view:'hub',targets:[]});assert.equal(calls.at(-1),'drawing-activities-section');
    context.unlockedLevels=[];assert.equal(actions.session(),null);
    await assert.rejects(actions.prepare({view:'hub',targets:[]}),/권한/);
    actions.restore(snapshot,{completed:false});assert.ok(calls.includes('dashboard'));
    context.currentUserRole='teacher';context.window.openStageTutorial(3);assert.equal(installed,2);
    await actions.prepare({view:'bank',targets:[]});assert.equal(calls.at(-1),'bank');
    actions.restore(actions.capture(),{completed:true});assert.ok(calls.includes('close-modal'));assert.ok(calls.includes('dictation-activities-section'));
});
