import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAPS = Object.freeze([
  {id:'park', title:'에이두 공원', file:'test-park.rbxlx', description:'함께 걷고 점프하는 가벼운 기본 맵', source:'에이두 자체 제작', mode:'탐험'},
  {id:'crossroads', title:'Crossroads', file:'maps/crossroads.rbxlx', description:'성·탑·다리가 있는 Roblox 대표 고전 맵', source:'Roblox 공식 공개 원본 · MIT', mode:'탐험'},
  {id:'rocket-arena', title:'Rocket Arena', file:'maps/rocket-arena.rbxlx', description:'고전 로켓 아레나의 높이 쌓인 발판', source:'Roblox 공식 공개 원본 · MIT', mode:'탐험'},
]);
export const AVATARS = Object.freeze([
  {id:'classic', title:'클래식', skin:'#ffcc33', torso:'#4caf50', legs:'#3366cc'},
  {id:'sprout', title:'새싹 친구', skin:'#ffd8b1', torso:'#80d87b', legs:'#365c39'},
  {id:'space', title:'우주 탐험가', skin:'#ffd8b1', torso:'#735bdf', legs:'#263454'},
  {id:'ocean', title:'바다 친구', skin:'#f4c7a1', torso:'#43c6d9', legs:'#235886'},
  {id:'rose', title:'장미 친구', skin:'#ffd8b1', torso:'#f184b3', legs:'#814766'},
  {id:'flame', title:'불꽃 친구', skin:'#dba877', torso:'#e96a49', legs:'#473a37'},
]);
export function avatarNativeSettings(id) {
  const a = AVATARS.find(x => x.id === id) || AVATARS[0];
  const rgb = hex => parseInt(hex.slice(1),16);
  return {AyaWasmForceR15:false, AyaWasmAvatarAssets:'', AyaWasmHeadColor:rgb(a.skin), AyaWasmTorsoColor:rgb(a.torso), AyaWasmLeftArmColor:rgb(a.skin), AyaWasmRightArmColor:rgb(a.skin), AyaWasmLeftLegColor:rgb(a.legs), AyaWasmRightLegColor:rgb(a.legs)};
}
export function createGameConfig({stateFile, root=path.dirname(fileURLToPath(import.meta.url))}={}) {
  const data = stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile,'utf8')) : {mapId:'park', avatars:{}};
  if(!MAPS.some(x=>x.id===data.mapId)) data.mapId='park';
  if(!data.avatars || typeof data.avatars!=='object' || Array.isArray(data.avatars)) data.avatars={};
  const save=()=>{if(!stateFile)return;fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(stateFile+'.tmp',stateFile);};
  return {
    map(id=data.mapId){const m=MAPS.find(x=>x.id===id);if(!m)throw Error('알 수 없는 맵입니다.');return {...m,path:path.resolve(root,m.file)};},
    setMap(id){this.map(id);data.mapId=id;save();},
    avatar(uid){const id=Object.hasOwn(data.avatars,uid)?data.avatars[uid]:'classic';return AVATARS.find(x=>x.id===id)||AVATARS[0];},
    setAvatar(uid,id){if(typeof uid!=='string'||!uid||uid.length>128)throw Error('계정이 필요합니다.');if(!AVATARS.some(x=>x.id===id))throw Error('알 수 없는 캐릭터입니다.');Object.defineProperty(data.avatars,uid,{value:id,enumerable:true,writable:true,configurable:true});save();return this.avatar(uid);},
    catalog(){return MAPS.map(({file,...m})=>({...m,available:fs.existsSync(path.resolve(root,file))}));},
  };
}
