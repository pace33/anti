import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=process.env.ROBL_QA_OUTPUT||path.join(root,'qa-output');fs.mkdirSync(output,{recursive:true});process.chdir(output);
const local=process.env.ROBL_LOCAL==='1',base=local?'http://127.0.0.1:3187/robl':'https://aiedue.ddns.net/robl';
let server,browser;const report={environment:local?'local original-byte browser test':'production account browser test',errors:[],failedResponses:[]};
async function launch(role){
 let token;
 if(local)token=role;else{
  token=process.env[role==='teacher'?'ROBL_QA_TEACHER_TOKEN':'ROBL_QA_STUDENT_TOKEN'];
  assert(token,'provide real short-lived account tokens via private environment variables');
 }
 const q=await fetch(base+'/launch',{method:'POST',headers:{Authorization:'Bearer '+token}});assert(q.ok,'account launch failed');return (await q.json()).launchUrl;
}
const meshKey='nvt-c750d1a605c0d9a7eb76',mapKey='nvt-16f25d03cf7508275778',texKey='nvt-f0822c24587274c25b4a',faceKey='nvt-3ca6c80cb85f7139291d',modelKey='nvt-92d6a32e7b3ee4f6e70b';
async function open(page,key,q,kind){
 await page.locator('#nvt-query').fill(q);await page.locator('#nvt-kind').selectOption(kind);await page.locator('#nvt-search').click();
 const button=page.locator(`[data-nvt-key="${key}"]`);await button.waitFor({timeout:30000});await button.click();
 await page.waitForFunction(k=>window.novetusPreview?.key===k,key,{timeout:45000});
 return page.evaluate(()=>window.novetusPreview);
}
try{
 if(local){const {makeServer}=await import('../server.mjs');fs.mkdirSync('novetus-local-qa-state',{recursive:true});server=makeServer({root:path.resolve('../anti-robl-maps/tools/aya-server'),requireAuth:true,publicOrigin:base,gameStateFile:path.resolve('novetus-local-qa-state/state.json'),verifyAccount:async role=>({uid:'qa-'+role,userId:role==='teacher'?101:102,name:role==='teacher'?'teacher':'aiedue102',role,expires:Date.now()+3600000})});await new Promise(r=>server.listen(3187,'127.0.0.1',r));}
 browser=await chromium.launch({executablePath:process.env.ROBL_QA_CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({extraHTTPHeaders:local?{'x-robl-public':'1'}:{},viewport:{width:1280,height:850}}),p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('dialog',d=>d.accept());
 p.on('response',r=>{if(r.url().includes('/robl/')&&r.status()>=400)report.failedResponses.push({path:new URL(r.url()).pathname,status:r.status()});});
 await p.goto(await launch('teacher'));await p.waitForFunction(()=>document.querySelector('#teacher-controls')?.hidden===false);await p.goto(base+'/editor?mode=map');await p.waitForFunction(()=>window.editorReady,{},{timeout:30000});
 assert.equal(await p.locator('#nvt-results button').count(),40);
 report.map=await open(p,mapKey,'Lava Rush','map');assert.equal(report.map.parts,118);await p.locator('#nvt-use').click();await p.waitForFunction(()=>window.editorState.count===118);report.mapImported=true;
 await p.locator('#title').fill('Novetus 원본 확인 맵');await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('저장 완료'));
 const id=await p.locator('#saved').inputValue();report.mapId=id;
 await p.reload();await p.waitForFunction(()=>window.editorReady);await p.locator('#saved').selectOption(id);await p.locator('#open').click();await p.waitForFunction(()=>window.editorState.count===118);report.mapReopened=true;await p.screenshot({path:local?'novetus-map-local.png':'novetus-map-live.png'});
 report.mesh=await open(p,meshKey,'Shaggy.mesh','mesh');assert.equal(report.mesh.triangles,892);await p.screenshot({path:local?'novetus-mesh-local.png':'novetus-mesh-live.png'});await p.locator('#nvt-use').click();await p.waitForFunction(()=>window.editorState.count===119);await p.waitForFunction(()=>window.novetusMeshLoads>0);report.meshInserted=true;
 await open(p,texKey,'textures/Shaggy.png','image');assert(await p.locator('#nvt-image').evaluate(e=>e.naturalWidth>0));await p.locator('#nvt-use').click();report.meshTextureApplied=true;
 await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('저장 완료'));await p.reload();await p.waitForFunction(()=>window.editorReady);await p.locator('#saved').selectOption(id);await p.locator('#open').click();await p.waitForFunction(()=>window.editorState.count===119);await p.waitForFunction(()=>window.novetusMeshLoads>0);
 const saved=await (await p.request.get(base+'/creator/map?id='+id)).json();assert.equal(saved.scene.objects.at(-1).mesh.asset,meshKey);assert.equal(saved.scene.objects.at(-1).mesh.texture,texKey);assert.equal(saved.scene.provenance.key,mapKey);report.meshTextureReopened=true;
 await p.locator('[data-add="box"]').click();await open(p,faceKey,'textures/face.png','image');await p.locator('#nvt-use').click();await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('저장 완료'));
 const saved2=await (await p.request.get(base+'/creator/map?id='+id)).json();assert.equal(saved2.scene.objects.at(-1).texture,faceKey);report.faceApplied=true;
 report.model=await open(p,modelKey,'fonts/Rocket.rbxm','model');assert.equal(report.model.parts,1);await p.locator('#nvt-use').click();await p.waitForFunction(()=>window.editorState.count===121);report.modelInserted=true;
 await p.locator('#save').click();await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('저장 완료'));
 await p.reload();await p.waitForFunction(()=>window.editorReady);await p.locator('#saved').selectOption(id);await p.locator('#open').click();await p.waitForFunction(()=>window.editorState.count===121);await p.waitForFunction(()=>window.novetusMeshLoads>0);report.modelReopened=true;
 await p.screenshot({path:local?'novetus-assets-local.png':'novetus-assets-live.png'});
 const student=await browser.newContext({extraHTTPHeaders:local?{'x-robl-public':'1'}:{},viewport:{width:390,height:844}}),s=await student.newPage();s.on('pageerror',e=>report.errors.push(e.message));await s.goto(await launch('student'));await s.waitForFunction(()=>document.querySelectorAll('[data-avatar]').length===6);await s.goto(base+'/editor?mode=avatar');await s.waitForFunction(()=>window.editorReady);await open(s,meshKey,'Shaggy.mesh','mesh');assert(await s.locator('#nvt-use').isHidden());assert.equal((await s.request.post(base+'/creator/map',{data:{scene:{}}})).status(),403);assert(await s.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));report.studentPreview=true;report.studentEditDenied=true;report.mobileOverflow=false;
 for(const q of ['/assets/novetus','/assets/novetus/open?key='+meshKey,'/Asset/?id='+meshKey,'/editor-novetus.js']){const r=await fetch(base+q,{headers:local?{Host:'127.0.0.1:3187','x-robl-public':'1'}:{}});assert.equal(r.status,401);}report.unauthDenied=true;
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.failedResponses,[]);
 fs.writeFileSync(local?'novetus-local-report.json':'novetus-live-report.json',JSON.stringify(report,null,2));console.log('NOVETUS BROWSER PASS',JSON.stringify(report));
}catch(e){report.error=e.message;fs.writeFileSync(local?'novetus-local-failure.json':'novetus-live-failure.json',JSON.stringify(report,null,2));for(const c of browser?.contexts()||[])for(const p of c.pages())await p.screenshot({path:local?'novetus-local-failure.png':'novetus-live-failure.png'}).catch(()=>{});throw e;}
finally{await browser?.close();if(server)await new Promise(r=>server.close(r));}
