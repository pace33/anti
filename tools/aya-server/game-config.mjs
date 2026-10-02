import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeAppearance } from './creator.mjs';

export const MAPS = Object.freeze([
  {id:'park', title:'에이두 공원', file:'test-park.rbxlx', description:'함께 걷고 점프하는 가벼운 기본 맵', source:'에이두 자체 제작', mode:'탐험'},
  {id:'crossroads', title:'Crossroads', file:'maps/crossroads.rbxlx', description:'성·탑·다리가 있는 Roblox 대표 고전 맵', source:'Roblox 공식 공개 원본 · MIT', mode:'탐험'},
  {id:'rocket-arena', title:'Rocket Arena', file:'maps/rocket-arena.rbxlx', description:'고전 로켓 아레나의 높이 쌓인 발판', source:'Roblox 공식 공개 원본 · MIT', mode:'탐험'},
]);
export const AVATARS = Object.freeze([
  {id:'classic', title:'브라운 캐주얼', skin:'#e1ded8', torso:'#4caf50', legs:'#30393d', hair:'swept', hairColor:'#6e3f20', jacket:'#22282d'},
  {id:'sprout', title:'새싹 재킷', skin:'#ebe3d9', torso:'#80d87b', legs:'#365c39', hair:'bun', hairColor:'#92572c', jacket:'#245f50'},
  {id:'space', title:'우주 스트리트', skin:'#e8e2dc', torso:'#735bdf', legs:'#263454', hair:'swept', hairColor:'#513122', jacket:'#252738'},
  {id:'ocean', title:'바다 재킷', skin:'#e7e3dc', torso:'#43c6d9', legs:'#6b4c5a', hair:'bun', hairColor:'#92502c', jacket:'#236979'},
  {id:'rose', title:'장미 캐주얼', skin:'#eee5de', torso:'#f184b3', legs:'#814766', hair:'bun', hairColor:'#6c3d27', jacket:'#664251'},
  {id:'flame', title:'불꽃 스트리트', skin:'#dcc6ad', torso:'#e96a49', legs:'#473a37', hair:'swept', hairColor:'#4a2c20', jacket:'#303234'},
]);
export function avatarNativeSettings(id) {
  const a = typeof id==='object' ? id : AVATARS.find(x => x.id === id) || AVATARS[0];
  const rgb = hex => parseInt(hex.slice(1),16);
  return {AyaWasmForceR15:false, AyaWasmAvatarAssets:'', AyaWasmHeadColor:rgb(a.skin), AyaWasmTorsoColor:rgb(a.torso), AyaWasmLeftArmColor:rgb(a.skin), AyaWasmRightArmColor:rgb(a.skin), AyaWasmLeftLegColor:rgb(a.legs), AyaWasmRightLegColor:rgb(a.legs)};
}
export function createGameConfig({stateFile, creator, root=path.dirname(fileURLToPath(import.meta.url))}={}) {
  const data = stateFile && fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile,'utf8')) : {mapId:'park', avatars:{}};
  if(!MAPS.some(x=>x.id===data.mapId) && !creator?.map(data.mapId)) data.mapId='park';
  if(!data.customAvatars || typeof data.customAvatars!=='object' || Array.isArray(data.customAvatars))data.customAvatars={};
  if(!data.avatars || typeof data.avatars!=='object' || Array.isArray(data.avatars)) data.avatars={};
  const save=()=>{if(!stateFile)return;fs.mkdirSync(path.dirname(stateFile),{recursive:true});fs.writeFileSync(stateFile+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(stateFile+'.tmp',stateFile);};
  return {
    map(id=data.mapId){const m=MAPS.find(x=>x.id===id)||creator?.map(id);if(!m)throw Error('알 수 없는 맵입니다.');return {...m,path:path.resolve(root,m.file)};},
    setMap(id){this.map(id);data.mapId=id;save();},
    avatar(uid){const id=Object.hasOwn(data.avatars,uid)?data.avatars[uid]:'classic';const base=AVATARS.find(x=>x.id===id)||AVATARS[0];return Object.hasOwn(data.customAvatars,uid)?normalizeAppearance(data.customAvatars[uid],base):base;},
    setAvatar(uid,id){if(typeof uid!=='string'||!uid||uid.length>128)throw Error('계정이 필요합니다.');if(!AVATARS.some(x=>x.id===id))throw Error('알 수 없는 캐릭터입니다.');Object.defineProperty(data.avatars,uid,{value:id,enumerable:true,writable:true,configurable:true});delete data.customAvatars[uid];save();return this.avatar(uid);},
    customize(uid,input){if(typeof uid!=='string'||!uid||uid.length>128)throw Error('계정이 필요합니다.');const value=normalizeAppearance(input,this.avatar(uid));Object.defineProperty(data.customAvatars,uid,{value,enumerable:true,writable:true,configurable:true});save();return value;},
    catalog(){return [...MAPS.map(({file,...m})=>({...m,available:fs.existsSync(path.resolve(root,file))})),...(creator?.list()||[])];},
  };
}
