import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {listNovetus,novetusEntry,novetusReference,parseLegacyMesh,createNovetusDelivery,sniffAsset} from './novetus.mjs';import {normalizeScene,compileScene} from './creator.mjs';import {makeServer} from './server.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const meshKey='nvt-c750d1a605c0d9a7eb76',imageKey='nvt-f0822c24587274c25b4a';
test('pinned original catalog is searchable and supports native numeric/path aliases without arbitrary URLs',()=>{
 assert.equal(listNovetus({kind:'map'}).total,348);assert.equal(listNovetus({q:null}).total,6257);assert.equal(listNovetus({kind:'mesh',q:'Shaggy.mesh'}).entries[0].key,meshKey);
 for(const ref of [meshKey,'rbxasset://fonts/Shaggy.mesh',novetusEntry(meshKey).id])assert.equal(novetusReference(ref,'mesh').key,meshKey);
 for(const ref of ['../secret','file:///etc/passwd','https://example.com/file.mesh','nvt-bad'])assert.equal(novetusReference(ref),null);
 assert.equal(novetusReference(meshKey,'image'),null);assert.equal(listNovetus({offset:40}).entries.length,40);
});
test('legacy mesh readers parse actual wire formats and reject corrupt/oversized data',()=>{
 // Deliberately constructed tiny format fixtures; originals are exercised by the live suite.
 const s=Buffer.from('version 1.00\n1\n[0,0,0][0,1,0][0,0,0][1,0,0][0,1,0][1,0,0][0,1,0][0,1,0][0,1,0]');assert.equal(parseLegacyMesh(s).triangles,1);
 const h=Buffer.from('version 2.00\n'),b=Buffer.alloc(12+3*40+12);b.writeUInt16LE(12);b[2]=40;b[3]=12;b.writeUInt32LE(3,4);b.writeUInt32LE(1,8);for(let i=0;i<3;i++){b.writeFloatLE(i,12+i*40);b.writeFloatLE(1,12+i*40+16);b.writeUInt32LE(i,12+3*40+i*4);}assert.equal(parseLegacyMesh(Buffer.concat([h,b])).triangles,1);
 assert.throws(()=>parseLegacyMesh(Buffer.from('version 3.00\n')),/3.00/);assert.throws(()=>parseLegacyMesh(Buffer.from('version 1.00\n9999999\n')),/제한/);assert.throws(()=>parseLegacyMesh(Buffer.concat([h,b.subarray(0,25)])),/헤더/);
});
test('original mesh/texture references survive normalization, native compilation and XML import; foreign scripts do not',()=>{
 const scene=normalizeScene({title:'원본 테스트',provenance:{key:'nvt-16f25d03cf7508275778'},objects:[{id:'spawn',kind:'spawn',position:[0,1,0],size:[6,1,6],rotation:[0,0,0],color:'#aabbcc'},{id:'hair',kind:'box',position:[0,4,0],size:[2,2,2],rotation:[0,0,0],color:'#ffffff',mesh:{asset:meshKey,scale:[1,1,1],offset:[0,0,0],texture:imageKey}}]});
 const xml=compileScene(scene,'made-test',root);assert(xml.includes('class="SpecialMesh"'));assert(xml.includes('rbxassetid://'+novetusEntry(meshKey).id));assert(xml.includes('rbxassetid://'+novetusEntry(imageKey).id));assert(!xml.includes('rbxassetid://nvt-'));assert.equal(scene.provenance.repo,'Novetus/Novetus-Map-Pack');
 assert.throws(()=>normalizeScene({...scene,objects:[scene.objects[0],{...scene.objects[1],mesh:{asset:'https://evil/mesh'}}]}),/메시/);
 const data='<roblox version="4"><Item class="Part"><Properties><Vector3 name="size"><X>2</X><Y>2</Y><Z>2</Z></Vector3><int name="BrickColor">192</int></Properties><Item class="SpecialMesh"><Properties><Content name="MeshId"><url>rbxasset://fonts/Shaggy.mesh</url></Content><Content name="TextureId"><url>rbxasset://textures/Shaggy.png</url></Content></Properties></Item><Item class="Script"><Properties><ProtectedString name="Source">error("foreign code")</ProtectedString></Properties></Item></Item></roblox>';
 const raw=execFileSync(process.platform==='win32'?'python':'python3',[path.join(root,'import-legacy-map.py')],{input:JSON.stringify({data:Buffer.from(data).toString('base64')}),encoding:'utf8'}),v=JSON.parse(raw);
 assert.equal(v.report.scriptsRemoved,1);assert.equal(v.scene.objects[0].color,'#694028');assert.equal(v.report.meshesPreserved,1);assert.equal(v.scene.objects[0].mesh.asset,meshKey);assert.equal(v.scene.objects[0].mesh.texture,imageKey);assert.equal(v.scene.objects.length,2);
});
test('upstream delivery cannot select arbitrary URLs and rejects bytes inconsistent with pinned git object',async()=>{
 let url;const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nvt-'));const d=createNovetusDelivery({dir,fetcher:async u=>{url=u;return new Response('not the original');}});
 try{await assert.rejects(()=>d.get('unknown'));await assert.rejects(()=>d.get(meshKey),/무결성/);assert(url.startsWith('https://raw.githubusercontent.com/Novetus/novetus-assetdelivery/'));assert(url.endsWith('/fonts/Shaggy.mesh'));}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('private catalog and original bytes are account gated; student preview does not grant teacher editing',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nvt-api-'));const student={uid:'nvt-student',userId:42,name:'aiedue42',role:'student',isTeacher:false};
 const server=makeServer({root,token:'secret',requireAuth:true,publicOrigin:'http://class.test/robl',verifyAccount:async()=>({...student,expires:Date.now()+600000}),gameStateFile:path.join(dir,'state.json')});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const pub={Host:'class.test','x-robl-public':'1'};
 try{
  for(const p of ['/assets/novetus','/assets/novetus/open?key='+meshKey,'/Asset/?id='+meshKey,'/editor-novetus.js'])assert.equal((await fetch(base+p,{headers:pub})).status,401);
  const r=await fetch(base+'/launch',{method:'POST',headers:{...pub,authorization:'Bearer good'}}),v=await r.json();const target=new URL(v.launchUrl);const exchange=await fetch(base+'/session',{method:'POST',headers:{...pub,'Content-Type':'application/json'},body:JSON.stringify({ticket:target.hash.slice(8)})}),cookie=exchange.headers.get('set-cookie').split(';')[0];
  const list=await fetch(base+'/assets/novetus?kind=mesh&q=Shaggy.mesh',{headers:{...pub,cookie}});assert.equal(list.status,200);assert.equal((await list.json()).entries[0].key,meshKey);
  assert.equal((await fetch(base+'/assets/novetus/open?key=invalid',{headers:{...pub,cookie}})).status,404);
  assert.equal((await fetch(base+'/creator/map',{method:'POST',headers:{...pub,cookie,'content-type':'application/json'},body:'{"scene":{}}'})).status,403);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
