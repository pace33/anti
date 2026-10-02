import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {makeServer,joinSettings} from './server.mjs';
import {createGameConfig,avatarNativeSettings} from './game-config.mjs';

test('persistent per-account avatars and allowlisted maps; caller cannot set arbitrary native assets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'robl-config-'));const stateFile=path.join(dir,'state.json');
 try{const c=createGameConfig({stateFile});c.setAvatar('student1','space');c.setAvatar('teacher1','rose');c.setMap('crossroads');const d=createGameConfig({stateFile});assert.equal(d.avatar('student1').id,'space');assert.equal(d.avatar('teacher1').id,'rose');assert.equal(d.avatar('other').id,'classic');assert.equal(d.map().id,'crossroads');assert.throws(()=>d.setMap('../../private.env'));assert.throws(()=>d.setAvatar('student1','http://evil'));const j=joinSettings(new URL('http://x/game/join.ashx?websocketUrl=webrtc://100000001&avatar=flame'),'http://x',{name:'aiedue22',userId:100,avatarId:'space'});assert.equal(j.AyaWasmTorsoColor,avatarNativeSettings('space').AyaWasmTorsoColor);assert.equal(j.AyaWasmAvatarAssets,'');}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('only server-verified teacher can switch maps; busy/occupied games require confirmation; recovery retains previous map',async()=>{
 let allowResolve;let rejectSwitch=false;let calls=[];
 const server=makeServer({requireAuth:true,publicOrigin:'http://class.example/robl',hostKey:'host',relay:true,verifyAccount:async token=>({uid:token,name:token==='teacher'?'teacher9001':'aiedue22',userId:token==='teacher'?101:102,role:token==='teacher'?'teacher':'student',expires:Date.now()+600000}),switchMap:async m=>{calls.push(m.id);if(rejectSwitch)throw Error('native failure');await new Promise(r=>allowResolve=r);}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;const pub={'Host':'class.example','x-robl-public':'1'};
 const get=async(p,cookie)=>{const r=await fetch(base+p,{headers:{...pub,Cookie:cookie||''}});return [r.status,await r.json()]};
 const post=async(p,b,cookie,headers=pub)=>{const r=await fetch(base+p,{method:'POST',headers:{...headers,Cookie:cookie||'','Content-Type':'application/json'},body:JSON.stringify(b)});return [r.status,await r.json(),r.headers]};
 const login=async token=>{const [,l]=await post('/launch',{},'',{...pub,Authorization:'Bearer '+token});const [,a,h]=await post('/session',{ticket:new URL(l.launchUrl).hash.slice(8)});return h.get('set-cookie').split(';')[0];};
 try{const student=await login('student'),teacher=await login('teacher');assert.equal((await get('/maps'))[0],401);assert.equal((await post('/maps/select',{id:'crossroads',role:'teacher'},student))[0],403);assert.equal((await post('/maps/select',{id:'../../private.env'},teacher))[0],400);assert.equal((await post('/avatar',{id:'space',uid:'teacher'},student))[0],200);assert.equal((await get('/avatar',student))[1].selected.id,'space');assert.equal((await get('/avatar',teacher))[1].selected.id,'classic');assert.equal((await get('/host-config',teacher))[0],403);const [sc,sv]=await post('/maps/select',{id:'crossroads'},teacher);assert.equal(sc,202);assert.equal(sv.switching,true);assert.equal((await post('/maps/select',{id:'rocket-arena'},teacher))[0],409);assert.equal((await get('/health'))[1].ready,false);allowResolve();await new Promise(r=>setTimeout(r,30));assert.equal((await get('/maps',teacher))[1].selectedId,'crossroads');rejectSwitch=true;assert.equal((await post('/maps/select',{id:'park'},teacher))[0],202);await new Promise(r=>setTimeout(r,30));const state=(await get('/maps',teacher))[1];assert.equal(state.selectedId,'crossroads');assert.match(state.error,/이전 맵/);assert.deepEqual(calls,['crossroads','park','crossroads']);}
 finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('occupied map switch rejects missing confirmation and disconnects guests only after teacher confirmation',async()=>{
 const s=makeServer({requireAuth:true,publicOrigin:'http://class.example/robl',hostKey:'host',relay:true,verifyAccount:async token=>({uid:token,name:token==='teacher'?'teacher9001':'aiedue22',userId:token==='teacher'?101:102,role:token==='teacher'?'teacher':'student',expires:Date.now()+600000}),switchMap:async()=>{}});
 s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port,base=`http://127.0.0.1:${port}`,pub={Host:'class.example','x-robl-public':'1'};
 const post=async(p,b={},headers=pub)=>{const r=await fetch(base+p,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(b)});return {r,v:await r.json()};};
 const login=async token=>{const {v:l}=await post('/launch',{}, {...pub,Authorization:'Bearer '+token});const {r}=await post('/session',{ticket:new URL(l.launchUrl).hash.slice(8)});return {...pub,Cookie:r.headers.get('set-cookie').split(';')[0]};};
 let host,guest;
 try{const teacher=await login('teacher'),student=await login('student');const {v:hc}=await post('/game-host/create',{}, {'x-aya-host-key':'host'});host=new WebSocket(`ws://127.0.0.1:${port}${hc.websocketUrl}`);await once(host,'open');await post('/host-ready',{mapId:'park'},{'x-aya-host-key':'host'});const {v:gc}=await post('/game-host/join',{connectCode:'100000001'},student);guest=new WebSocket(`ws://127.0.0.1:${port}${gc.websocketUrl}`,{headers:student});await once(guest,'open');assert.equal((await fetch(base+'/host-avatar/102',{headers:student})).status,403);const av=await fetch(base+'/host-avatar/102');assert.equal(av.status,200);assert.equal((await av.json()).torso.length,3);const denied=await post('/maps/select',{id:'crossroads'},teacher);assert.equal(denied.r.status,409);assert.equal(denied.v.needsConfirmation,true);assert.equal(guest.readyState,1);const closed=once(guest,'close');assert.equal((await post('/maps/select',{id:'crossroads',confirmRestart:true},teacher)).r.status,202);const [code]=await closed;assert.equal(code,1012);}
 finally{host?.terminate();guest?.terminate();s.closeAllConnections();await new Promise(r=>s.close(r));}
});
