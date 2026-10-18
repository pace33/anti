import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {groups,pastSources,pastQuestions,rubric,officialSource} from '../research-prep/simple-data.mjs';
const read=p=>readFileSync(new URL('../research-prep/'+p,import.meta.url),'utf8');
const data=JSON.parse(read('content.json'));
test('all 90 questions map to exactly one of 8 simple categories',()=>{
 assert.equal(groups.length,8);
 for(const q of data.questions)assert.equal(groups.filter(g=>g.categories.includes(q.category)).length,1,q.id);
 for(const g of groups)assert(data.questions.some(q=>g.categories.includes(q.category)),g.id);
});
test('previous interview themes have sources, reconstructed practice wording and valid related groups',()=>{
 assert.equal(pastQuestions.length,10);assert.equal(pastSources.length,2);
 for(const q of pastQuestions){assert(pastSources.some(s=>s.id===q.source));assert(groups.some(g=>g.id===q.group));for(const k of ['theme','question','focus'])assert(q[k]?.trim());}
 const app=read('simple.mjs');for(const t of ['정확한 문항 원문은 공개되지','새로 만든 연습 질문','작년 문항','발표 40%만의 세부 배점표는 아닙니다'])assert((app+read('simple-data.mjs')).includes(t),t);
});
test('official branch scoring totals 100 and remains distinct from 60/40 final weighting',()=>{
 assert.deepEqual(rubric.lesson.items.map(x=>x.score),[30,15,15,40]);
 assert.deepEqual(rubric.software.items.map(x=>x.score),[30,20,20,30]);
 for(const r of Object.values(rubric))assert.equal(r.items.reduce((s,x)=>s+x.score,0),100);
 assert(officialSource.startsWith('https://www.gbe.kr/'));
});
test('simple entry has three navigation choices and retains advanced tools and existing local state',()=>{
 const html=read('index.html'),app=read('simple.mjs');assert.equal([...html.matchAll(/<nav[\s\S]*?<\/nav>/g)][0][0].match(/<a /g).length,3);
 assert(html.includes('full.html'));assert(html.includes('simple.mjs?v='));assert(!html.includes('class="sidebar"'));
 assert(read('full.html').includes('app.mjs?v='));assert(app.includes('aiedue-korean-research-prep-v1'));
 assert(!app.includes('localStorage.clear'));assert(app.includes('JSON.stringify(state)'));
});
