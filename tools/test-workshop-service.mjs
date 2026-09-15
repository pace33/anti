import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkshopService} from '../workshop-service.mjs';

function setup() {
    let identity={id:'teacher-a',role:'teacher'}, counter=0;
    const values=new Map([['classes/teacher-a',{students:['student-a','student-b']}],['users/student-a',{name:'가온',role:'student',teacherId:'teacher-a'}],['users/student-b',{name:'다른 반',role:'student',teacherId:'teacher-b'}]]);
    const reference=(parent,...parts)=>{const path=[parent.path,...parts].filter(Boolean).join('/');return {path,id:path.split('/').at(-1)};};
    const snapshot=ref=>({id:ref.id,exists:()=>values.has(ref.path),data:()=>structuredClone(values.get(ref.path))});
    const api={db:{},current:()=>identity,doc:(parent,...parts)=>reference(parent,...(parts.length?parts:[`entry-${++counter}`])),collection:reference,query:r=>r,where:()=>({}),getDoc:async ref=>snapshot(ref),getDocs:async ref=>({docs:[...values.keys()].filter(path=>path.startsWith(ref.path+'/')&&path.split('/').length===ref.path.split('/').length+1).map(path=>snapshot({path,id:path.split('/').at(-1)}))}),setDoc:async(ref,data,options)=>values.set(ref.path,options?.merge?{...values.get(ref.path),...structuredClone(data)}:structuredClone(data))};
    return {api,values,service:createWorkshopService(api,'teacher-a'),identity:value=>identity=value};
}
test('only the current teacher roster is exposed and entries persist under that teacher',async()=>{
    const {service,values}=setup();
    assert.deepEqual((await service.load()).students.map(s=>s.id),['student-a']);
    const saved=await service.save('worksheet',{title:'읽기',problems:[{text:'나무'}]},'student-a','2026-09-15');
    assert.ok(values.has(`users/teacher-a/workshopEntries/${saved.id}`));
    assert.equal((await service.load()).entries[0].payload.title,'읽기');
    await service.save('worksheet',{title:'수정'},'student-a','2026-09-15',saved.id);
    assert.equal((await service.load()).entries.length,1);
    await service.remove(saved.id);
    assert.equal((await service.load()).entries.length,0);
    assert.ok(values.get(`users/teacher-a/workshopEntries/${saved.id}`).deletedAt);
});
test('another class, malformed IDs and record type changes cannot be saved',async()=>{
    const {service}=setup();
    await assert.rejects(service.save('student',{name:'새 학생'},'','2026-09-15'));
    await assert.rejects(service.save('mission',{},'student-b','2026-09-15'));
    await assert.rejects(service.save('mission',{},'','2026-09-15','../other'));
    await assert.rejects(service.save('mission',{},'','invalid'));
    const saved=await service.save('mission',{},'student-a','2026-09-15');
    await assert.rejects(service.save('behavior',{},'student-a','2026-09-15',saved.id));
});
test('student sessions and closed sessions cannot read or save',async()=>{
    const state=setup();
    state.identity({id:'student-a',role:'student'});
    await assert.rejects(state.service.load());
    await assert.rejects(state.service.save('note',{},'','2026-09-15'));
    state.identity({id:'teacher-a',role:'teacher'});
    state.service.close();
    await assert.rejects(state.service.load());
});
test('switching accounts during a request cannot complete a write or return the previous roster',async()=>{
    const state=setup(),original=state.api.getDocs;
    state.api.getDocs=async ref=>{const result=await original(ref);state.identity({id:'teacher-b',role:'teacher'});return result;};
    await assert.rejects(state.service.save('note',{},'','2026-09-15'));
    assert.equal([...state.values.keys()].some(path=>path.includes('/workshopEntries/')),false);
});
