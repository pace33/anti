import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=new URL('../research-prep/',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
const data=JSON.parse(read('content.json'));
test('research preparation keeps all 7 documents and all 90 complete unique questions',()=>{
 assert.equal(data.documents.length,7);assert.equal(data.questions.length,90);
 assert.equal(new Set(data.questions.map(q=>q.id)).size,90);
 for(const q of data.questions)for(const key of ['id','title','category','core','evidence','follow','caution','connection','sample'])assert(q[key]?.trim(),q.id+' '+key);
 for(let i=0;i<7;i++)assert(data.documents[i].text.length>1000);
});
test('10 minute presentation is exactly 600 seconds with 12 report-grounded scenes',()=>{
 assert.equal(data.slides.length,12);assert.equal(data.slides.reduce((n,s)=>n+s.seconds,0),600);
 assert.equal(data.baseline,'발표 10분 + 질의응답 10분');
 for(const s of data.slides)for(const k of ['title','message','show','say','avoid'])assert(s[k]?.trim());
});
test('46 unique checks and 10 evidence notes connect to the actual Hangul product',()=>{
 assert.equal(data.checks.length,46);assert.equal(new Set(data.checks.map(c=>c.id)).size,46);
 assert.equal(data.evidence.length,10);assert.equal(data.features.length,6);
 for(const f of data.features)assert(existsSync(new URL('../'+f.path,root)),f.path);
});
test('local-only scoped notes, export/import boundaries and no fabricated findings disclaimer',()=>{
 const app=read('app.mjs'),html=read('index.html');
 assert(app.includes('aiedue-korean-research-prep-v1'));assert(!app.includes('localStorage.clear'));
 assert(app.includes('cleanState'));assert(app.includes('raw.version!==1'));
 assert(html.includes('계정·기기 간 자동 동기화는 하지 않습니다'));
 assert(html.includes('noindex,nofollow'));
 assert(app.includes('제출 연구보고서(제20회 교육용SW·AI분과)를 대조했습니다'));
 assert(app.includes('현재 앱의 모든 기능을 연구에 사용했다고 소급하지 마세요'));
 for(const s of ['실제 기출 원문','AI가 답변을 자동 평가하지 않습니다'])assert(app.includes(s));
});
test('all source document wiki links have valid targets; downloadable archive retains all sections',()=>{
 const titles=new Set(data.documents.map(d=>d.title));
 for(const d of data.documents)for(const m of d.text.matchAll(/\[\[([^\]]+)\]\]/g))assert(titles.has(m[1]),m[1]);
 const md=read('research-library.md').replaceAll('\r\n','\n');for(const d of data.documents)assert(md.includes(d.text.replaceAll('\r\n','\n')),d.title);
});
