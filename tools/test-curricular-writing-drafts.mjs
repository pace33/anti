import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildCurricularDraft, normalizeCurricularDrafts, upsertCurricularDraft, resumeCurricularDraft } from '../curricular-writing-drafts.mjs';
const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const sample = (extra = {}) => ({ kind: 'trace', mode: 'curricular', startedAt: '2026-10-06T01:00:00.000Z', currentIndex: 0,
    items: [{ word: '학교', sentence: '학교', answer: '학교', canvasGuide: '학교', strokes: [[{x:.2,y:.3},{x:.4,y:.6}]], traceComplete: false }], ...extra });
test('unfinished trace survives a JSON round-trip with actual ink and is not a grade', () => {
    const draft = buildCurricularDraft(sample(), '2026-10-06T02:00:00.000Z');
    assert.equal(draft.status, 'in-progress'); assert.equal(draft.checkedCount, 0);
    const resumed = resumeCurricularDraft(JSON.parse(JSON.stringify(draft)));
    assert.deepEqual(resumed.items[0].strokes, sample().items[0].strokes);
    assert.equal(resumed.items[0].aiGraded, false); assert.equal(resumed.graded, null); assert.equal(resumed.autoSaved, false);
    assert.equal(draft.correctCount, undefined); assert.equal(draft.wrongCount, undefined);
});
test('checked mission retains original text, position and retry semantics, without grading in progress', () => {
    const draft = buildCurricularDraft(sample({ kind:'mission', difficulty:3, currentIndex:1, items:[
        {word:'학교',answer:'학교에 갑니다.',aiGraded:true,aiResult:{correct:true,score:1,written:'학교에 갑니다.'}},
        {word:'공원',answer:'공원에 갑니다.',retryMode:true,firstAiResult:{correct:false,score:0,written:'공운'},aiGrading:true} ] }));
    const resumed = resumeCurricularDraft(draft);
    assert.equal(draft.checkedCount, 1); assert.equal(resumed.currentIndex, 1);
    assert.equal(resumed.items[0].aiResult.score, 1); assert.equal(resumed.items[1].retryMode, true);
    assert.equal(resumed.items[1].firstAiResult.written, '공운'); assert.equal(resumed.items[1].aiGrading, undefined);
});
test('transition uses one ID and finished/tutorial/photo-only sessions are excluded', () => {
    const a = buildCurricularDraft(sample());
    const b = buildCurricularDraft(sample({kind:'mission',draftId:a.id}), '2099-01-01');
    assert.equal(upsertCurricularDraft([a], b).length, 1);
    assert.equal(upsertCurricularDraft([a], b)[0].session.kind, 'mission');
    for (const extra of [{tutorial:true},{autoSaved:true},{kind:'bank-camera'},{mode:'other'}]) assert.equal(buildCurricularDraft(sample(extra)), null);
});
test('five recent distinct records, bounded points, sanitized IDs and no hidden credential/image fields', () => {
    const records = Array.from({length:8}, (_,i)=>buildCurricularDraft(sample({draftId:'round'+i}), '2026-10-0'+(i+1)));
    assert.equal(normalizeCurricularDrafts(records).length,5); assert.equal(normalizeCurricularDrafts(records)[0].id,'round7');
    const paths = Array.from({length:200},()=>Array.from({length:100},(_,i)=>({x:i/100,y:i/100})));
    const draft = buildCurricularDraft(sample({draftId:"round');evil()",token:'secret',photo:'data:image/x',items:[{word:'학교',strokes:paths}]}));
    assert.equal(draft.id,'roundevil'); assert(draft.session.items[0].strokes.flat().length<=1200);
    assert(!JSON.stringify(draft).includes('secret')); assert(!JSON.stringify(draft).includes('data:image'));
});
function harness() {
    let remote = { balance:87, coins:4, dictationStep:9, dictationPortfolio:{missions:{keep:{id:'keep'}},wrongBank:[{sentence:'보존'}],curricularWriting:{totalRounds:7,stepStats:{step1:{attempts:6}},history:[{id:'keep'}],drafts:[]}}};
    const writes = [], status = {textContent:''};
    const context = { currentUserId:'student-a', activeDictationSession:sample(), dictationPortfolio:{curricularWriting:{}},
        buildCurricularDraft,normalizeCurricularDrafts,upsertCurricularDraft,resumeCurricularDraft,
        db:{}, doc:(_,...p)=>p.join('/'), serverTimestamp:()=>({timestamp:true}),
        document:{getElementById:()=>status,addEventListener(){}},window:{addEventListener(){}},clearTimeout,setTimeout,console:{error(){}},
        runTransaction: async (_db, work) => work({get:async()=>({exists:()=>true,data:()=>structuredClone(remote)}),set:(ref,patch)=>{writes.push({ref,patch});remote={...remote,...patch};}}) };
    vm.createContext(context);
    const from = source.indexOf('// Account checkpoints do not change');
    const to = source.indexOf('function renderCurricularDraftList()',from);
    vm.runInContext(source.slice(from,to)+'\ncurricularDraftSessionOwner=currentUserId;',context);
    return { context,writes,status,remote:()=>remote };
}
test('real application checkpoint transaction only patches the own portfolio and preserves banks/statistics/wallet', async () => {
    const h=harness(); await h.context.checkpointCurricularWritingSession();
    assert.equal(h.writes.length,1); assert.equal(h.writes[0].ref,'users/student-a');
    assert.equal(h.writes[0].patch.balance,undefined); assert.equal(h.remote().balance,87); assert.equal(h.remote().dictationStep,9);
    assert.equal(h.remote().dictationPortfolio.curricularWriting.totalRounds,7);
    assert.equal(h.remote().dictationPortfolio.curricularWriting.stepStats.step1.attempts,6);
    assert.equal(h.remote().dictationPortfolio.wrongBank[0].sentence,'보존');
    assert.equal(h.remote().dictationPortfolio.curricularWriting.drafts.length,1);
    assert.match(h.status.textContent,/중간 기록 저장됨/);
});
test('save queue followed by removal cannot resurrect a completed draft', async () => {
    const h=harness(), id=buildCurricularDraft(sample()).id;
    const save=h.context.checkpointCurricularWritingSession();
    const remove=h.context.queueCurricularDraftWrite('student-a',null,id);
    await Promise.all([save,remove]); assert.equal(h.remote().dictationPortfolio.curricularWriting.drafts.length,0);
    assert.equal(h.remote().dictationPortfolio.missions.keep.id,'keep');
});
test('account change blocks stale ink from being saved to another user', async () => {
    const h=harness(); h.context.currentUserId='student-b';
    await h.context.checkpointCurricularWritingSession(); assert.equal(h.writes.length,0);
});
test('failed write gives honest visible feedback and the next retry recovers', async () => {
    const h=harness(), good=h.context.runTransaction;
    h.context.runTransaction=async()=>{throw new Error('offline')};
    await assert.rejects(h.context.checkpointCurricularWritingSession());
    assert.match(h.status.textContent,/저장하지 못/); assert.equal(h.writes.length,0);
    h.context.runTransaction=good; await h.context.checkpointCurricularWritingSession(); assert.equal(h.writes.length,1);
});
