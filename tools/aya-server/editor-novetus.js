import * as THREE from 'three';
const $=s=>document.querySelector(s);
export function geometryFromMesh(m){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(m.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(m.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(m.uvs,2));g.setIndex(m.indices);g.computeBoundingBox();g.computeBoundingSphere();return g;}
const meshRequests=new Map();
export async function hydrateNovetusMesh(shell,o,{api,texture,status}){
 if(!o.mesh)return;
 try{
  if(!meshRequests.has(o.mesh.asset)){const p=api('/assets/novetus/open?key='+o.mesh.asset).then(v=>{if(v.kind!=='mesh')throw Error('메시 형식이 아닙니다.');return v.mesh;}).catch(e=>{meshRequests.delete(o.mesh.asset);throw e;});meshRequests.set(o.mesh.asset,p);if(meshRequests.size>32)meshRequests.delete(meshRequests.keys().next().value);}
  const m=await meshRequests.get(o.mesh.asset);if(!shell.parent)return;
  const child=new THREE.Mesh(geometryFromMesh(m),new THREE.MeshStandardMaterial({color:o.color,roughness:.8,map:o.mesh.texture?texture(o.mesh.texture):null,side:THREE.DoubleSide}));
  child.scale.set(...o.mesh.scale.map((s,i)=>s/o.size[i]));child.position.set(...o.mesh.offset.map((s,i)=>s/o.size[i]));child.userData.id=o.id;
  shell.material.visible=false;shell.add(child);shell.userData.loadedMesh=o.mesh.asset;window.novetusMeshLoads=(window.novetusMeshLoads||0)+1;
 }catch(e){if(shell.parent){shell.material.wireframe=true;status.textContent='원본 메시를 표시하지 못한 부품: '+o.id+' · '+e.message;}}
}
export async function mountNovetusLibrary({api,me,status,previewScene,previewMesh,restore,useAsset}){
 let offset=0,selection=null,generation=0,searchGeneration=0;
 const guard=fn=>async()=>{try{await fn();}catch(e){status.textContent=e.message;$('#nvt-report').textContent=e.message;}};
 async function search(){const gen=++searchGeneration;const v=await api('/assets/novetus?q='+encodeURIComponent($('#nvt-query').value)+'&kind='+$('#nvt-kind').value+'&offset='+offset);if(gen!==searchGeneration)return;
  $('#nvt-count').textContent=`원본 ${v.total}개 · ${v.offset+1}~${Math.min(v.offset+40,v.total)} · 40개씩 표시`;
  $('#nvt-prev').disabled=offset===0;$('#nvt-next').disabled=offset+40>=v.total;$('#nvt-results').replaceChildren();
  for(const e of v.entries){const card=document.createElement('div');card.className='nvt-card';const b=document.createElement('button');b.textContent='열기 · '+e.name;b.dataset.nvtKey=e.key;b.dataset.nvtPath=e.path;b.onclick=guard(()=>open(e));const label=document.createElement('small');label.textContent=e.kind+' · '+e.path+' · '+Math.ceil(e.size/1024)+'KB';card.append(b,label);$('#nvt-results').append(card);}
 }
 async function open(e){const gen=++generation;selection=null;$('#nvt-preview').hidden=false;$('#nvt-name').textContent=e.path;$('#nvt-use').hidden=true;$('#nvt-image').hidden=true;$('#nvt-audio').pause();$('#nvt-audio').hidden=true;$('#nvt-image').removeAttribute('src');$('#nvt-audio').removeAttribute('src');$('#nvt-report').textContent='원본 파일 읽는 중…';$('#nvt-original').href=e.sourceUrl;status.textContent='선택한 원본을 읽고 있어요.';
  let v;try{v=await api('/assets/novetus/open?key='+e.key);}catch(err){if(gen===generation)throw err;return;}if(gen!==generation)return;selection=v;
  if(v.kind==='image'){$('#nvt-image').src=v.url;$('#nvt-image').hidden=false;await new Promise((resolve,reject)=>{const im=$('#nvt-image');if(im.complete&&im.naturalWidth){resolve();return;}im.onload=resolve;im.onerror=()=>reject(Error('원본 이미지 표시 실패'));});if(gen!==generation)return;}
  if(v.kind==='audio'){$('#nvt-audio').src=v.url;$('#nvt-audio').hidden=false;}
  if(v.kind==='scene')previewScene(v.scene);
  if(v.kind==='mesh')previewMesh(v.mesh);
  const desc=v.kind==='scene'?`3D 부품 ${v.scene.objects.length}개 · 스크립트 ${v.report.scriptsRemoved}개 제외\n메시 ${v.report.meshesPreserved}개 · 텍스처 ${v.report.texturesPreserved}개 유지\n범위 제한 제외 ${v.report.partsSkipped}개 · 미등록 메시 ${v.report.meshesMissing}개\n${v.report.notice}`:v.kind==='mesh'?`${v.mesh.version} · 원본 삼각형 ${v.mesh.triangles}개`:v.kind==='inspector'?JSON.stringify({classes:v.classes,keyframes:v.keyframes,bytes:v.bytes,scriptsExcluded:v.scriptsRemoved,text:v.text},null,2):'원본 '+v.kind+' 파일';
  $('#nvt-report').textContent=desc+'\n\n'+v.notice;$('#nvt-use').hidden=me.role!=='teacher'||!['scene','mesh','image'].includes(v.kind);$('#nvt-use').textContent=v.kind==='scene'?(e.kind==='map'?'이 맵을 편집용으로 열기':'이 모델을 맵에 추가'):v.kind==='mesh'?'이 메시를 맵에 추가':'선택 부품에 원본 이미지 적용';status.textContent='원본 파일 열기 완료 · '+e.name;window.novetusPreview={key:e.key,kind:v.kind,triangles:v.mesh?.triangles,parts:v.scene?.objects.length};
 }
 $('#nvt-search').onclick=guard(async()=>{offset=0;await search();});$('#nvt-query').onkeydown=e=>{if(e.key==='Enter')$('#nvt-search').click();};$('#nvt-kind').onchange=()=>$('#nvt-search').click();$('#nvt-prev').onclick=guard(async()=>{offset=Math.max(0,offset-40);await search();});$('#nvt-next').onclick=guard(async()=>{offset+=40;await search();});
 $('#nvt-back').onclick=()=>{generation++;selection=null;$('#nvt-audio').pause();$('#nvt-preview').hidden=true;restore();status.textContent='편집 화면으로 돌아왔어요.';};
 $('#nvt-use').onclick=guard(async()=>{if(!selection||me.role!=='teacher')return;await useAsset(selection);status.textContent='원본 자료를 편집 화면에 불러왔어요. 맵 저장을 눌러 계정에 보관하세요.';});
 await search();
}
