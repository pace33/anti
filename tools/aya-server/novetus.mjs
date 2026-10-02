import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'novetus-catalog.json'),'utf8')).entries;
const byKey=new Map(catalog.map(e=>[e.key,e]));
const byId=new Map(catalog.map(e=>[e.id,e]));
const byPath=new Map(catalog.filter(e=>e.repo.endsWith('novetus-assetdelivery')).map(e=>[e.path.toLowerCase(),e]));
export const rightsNotice='원본 저장소의 파일입니다. 맵은 소유자별 권리, 에셋은 혼합 라이선스입니다. 미리보기와 공개·학급 배포 권한은 별개이며 원본 출처를 유지합니다.';
export function novetusEntry(key){return byKey.get(String(key||''))||null;}
export function novetusReference(value,kind){
 let s=String(value||'');if(s.length>300||/[\x00-\x1f]/.test(s)||s.includes('..'))return null;
 if(byKey.has(s)){const e=byKey.get(s);return !kind||e.kind===kind||(kind==='image'&&e.kind==='asset')?e:null;}
 s=s.replace(/^rbxasset:\/\//i,'').replace(/^rbxassetid:\/\//i,'');
 const id=s.match(/^(?:https?:\/\/(?:www\.)?roblox\.com\/(?:asset\/?|asset\.ashx)\?id=)?(\d+)$/i)?.[1];
 const found=id?(byId.get(id)||byPath.get('textures/'+id+'.png')||byPath.get('fonts/'+id+'.mesh')||byPath.get('assets/'+id)):byPath.get(s.toLowerCase());
 return found&&(!kind||found.kind===kind||(kind==='image'&&found.kind==='asset'))?found:null;
}
export function listNovetus({q='',kind='',offset=0}={}){
 q=String(q||'').slice(0,120).toLowerCase();const hits=catalog.filter(e=>(!kind||e.kind===kind)&&(!q||e.path.toLowerCase().includes(q)||e.key===q));
 offset=Math.max(0,Math.min(10000,Number(offset)||0));
 return {total:hits.length,offset,entries:hits.slice(offset,offset+40).map(e=>({...e,name:e.path.split('/').at(-1),sourceUrl:'https://github.com/'+e.repo+'/blob/'+e.revision+'/'+e.path.split('/').map(encodeURIComponent).join('/')})),notice:rightsNotice};
}
export function sniffAsset(b){
 if(b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return {kind:'image',mime:'image/png',ext:'.png'};
 if(b[0]===255&&b[1]===216&&b[2]===255)return {kind:'image',mime:'image/jpeg',ext:'.jpg'};
 if(b.subarray(0,2).toString()==='BM')return {kind:'image',mime:'image/bmp',ext:'.bmp'};
 if(b.subarray(0,7).toString()==='version')return {kind:'mesh',mime:'application/octet-stream',ext:'.mesh'};
 if(b.subarray(0,4).toString()==='OggS')return {kind:'audio',mime:'audio/ogg',ext:'.ogg'};
 if(b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WAVE')return {kind:'audio',mime:'audio/wav',ext:'.wav'};
 if(b.subarray(0,3).toString()==='ID3'||(b[0]===255&&(b[1]&224)===224))return {kind:'audio',mime:'audio/mpeg',ext:'.mp3'};
 return {kind:'other',mime:'application/octet-stream',ext:'.bin'};
}
export function parseLegacyMesh(b){
 const lineEnd=b.indexOf(10);if(lineEnd<0||lineEnd>30)throw Error('메시 버전 헤더를 읽지 못했습니다.');
 const version=b.subarray(0,lineEnd).toString().trim();let positions=[],normals=[],uvs=[],indices=[];
 if(version==='version 1.00'||version==='version 1.01'){
  const text=b.toString('utf8'),count=Number(text.split('\n')[1].trim());if(!Number.isInteger(count)||count<1||count>30000)throw Error('메시 삼각형 수 제한(30,000)을 넘었습니다.');
  const tuples=[...text.slice(text.indexOf('\n',lineEnd+1)+1).matchAll(/\[([^\]]+)\]/g)];if(tuples.length!==count*9)throw Error('메시 정점 데이터가 맞지 않습니다.');
  for(let i=0;i<tuples.length;i+=3){const v=tuples.slice(i,i+3).map(t=>t[1].split(',').map(Number));if(v.some(a=>a.length!==3||a.some(n=>!Number.isFinite(n)||Math.abs(n)>100000)))throw Error('잘못된 메시 좌표입니다.');positions.push(...v[0]);normals.push(...v[1]);uvs.push(v[2][0],1-v[2][1]);indices.push(indices.length);}
 }else if(version==='version 2.00'){
  const start=lineEnd+1;if(b.length<start+12)throw Error('잘린 메시 헤더입니다.');
  const h=b.readUInt16LE(start),vsize=b[start+2],fsize=b[start+3],nv=b.readUInt32LE(start+4),nf=b.readUInt32LE(start+8);
  if(h!==12||![36,40].includes(vsize)||fsize!==12||nv>90000||nf>30000||nv<1||nf<1||start+h+nv*vsize+nf*fsize>b.length)throw Error('지원 범위를 벗어난 메시 헤더입니다.');
  let p=start+h;for(let i=0;i<nv;i++,p+=vsize){const floats=Array.from({length:8},(_,j)=>b.readFloatLE(p+j*4));if(floats.some(n=>!Number.isFinite(n)||Math.abs(n)>100000))throw Error('잘못된 메시 좌표입니다.');positions.push(...floats.slice(0,3));normals.push(...floats.slice(3,6));uvs.push(floats[6],1-floats[7]);}
  for(let i=0;i<nf*3;i++,p+=4){const n=b.readUInt32LE(p);if(n>=nv)throw Error('잘못된 메시 인덱스입니다.');indices.push(n);}
 }else throw Error(version+' 메시 미리보기는 아직 지원하지 않습니다. 원본 파일은 열 수 있습니다.');
 return {version,positions,normals,uvs,indices,triangles:indices.length/3};
}
export function createNovetusDelivery({dir,fetcher=fetch}={}){
 const pending=new Map();let running=0;
 const cache=new Map();
 async function get(key){
  const e=novetusEntry(key);if(!e)throw Error('목록에 없는 원본 파일입니다.');
  if(e.size>16*1024*1024)throw Error('원본 파일이 16MB 제한을 넘습니다. 원본 링크에서 열어 주세요.');
  if(!dir)throw Error('비공개 에셋 캐시가 준비되지 않았습니다.');
  if(cache.has(key)&&fs.existsSync(cache.get(key).path)){const out=cache.get(key);return {...out,data:fs.readFileSync(out.path)};}
  if(pending.has(key))return pending.get(key);
  if(running>=4)throw Error('다른 원본 파일을 읽고 있습니다. 잠시 뒤 다시 열어 주세요.');
  running++;
  const task=(async()=>{
   const dest=path.join(dir,key);let data;
   if(fs.existsSync(dest))data=fs.readFileSync(dest);else{
    const url='https://raw.githubusercontent.com/'+e.repo+'/'+e.revision+'/'+e.path.split('/').map(encodeURIComponent).join('/');
    const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('원본 서버 응답: '+r.status);
    const chunks=[];let n=0;for await(const chunk of r.body){n+=chunk.length;if(n>16*1024*1024||n>e.size)throw Error('원본 파일 크기가 일치하지 않습니다.');chunks.push(Buffer.from(chunk));}data=Buffer.concat(chunks);
   }
   const hash=crypto.createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');
   if(hash!==e.sha||data.length!==e.size)throw Error('원본 Git 파일 무결성 확인에 실패했습니다.');
   fs.mkdirSync(dir,{recursive:true,mode:0o700});
   if(!fs.existsSync(dest)){fs.writeFileSync(dest+'.tmp',data,{mode:0o600});fs.renameSync(dest+'.tmp',dest);}
   const typed=sniffAsset(data),typedPath=dest+typed.ext;if(!fs.existsSync(typedPath))fs.writeFileSync(typedPath,data,{mode:0o600});
   const out={entry:e,data,path:typedPath,...typed};const {data:unused,...metadata}=out;cache.set(key,metadata);
   // Private bounded cache, only original catalog filenames may be evicted.
   const files=fs.readdirSync(dir).filter(n=>/^nvt-[a-f0-9]{20}(?:\.(?:bin|png|jpg|bmp|mesh|mp3|wav|ogg))?$/.test(n)).map(n=>({name:n,...fs.statSync(path.join(dir,n))})).sort((a,b)=>a.mtimeMs-b.mtimeMs);
   let total=files.reduce((n,f)=>n+f.size,0);for(const f of files){if(total<=128*1024*1024)break;if(f.name.startsWith(key))continue;fs.unlinkSync(path.join(dir,f.name));total-=f.size;}
   return out;
  })();pending.set(key,task);try{return await task;}finally{pending.delete(key);running--;}
 }
 return {get};
}
