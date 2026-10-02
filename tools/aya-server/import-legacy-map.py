"""Inspect legacy XML/BZ2 geometry without executing scripts or fetching external URLs."""
import sys,json,base64,bz2,math,re,xml.etree.ElementTree as E
from pathlib import Path
try:
 req=json.load(sys.stdin);data=base64.b64decode(req['data'],validate=True)
 if len(data)>16*1024*1024:raise ValueError('입력 파일은 16MB 이하만 지원합니다.')
 if data.startswith(b'BZh'):
  decoder=bz2.BZ2Decompressor();data=decoder.decompress(data,max_length=32*1024*1024+1)
  if len(data)>32*1024*1024 or not decoder.eof:raise ValueError('압축 해제 크기가 너무 큽니다.')
 if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('외부 엔티티 XML은 허용하지 않습니다.')
 if not data.lstrip().startswith(b'<roblox') or data.startswith(b'<roblox!'):raise ValueError('바이너리 형식은 아직 3D 변환하지 못합니다. 원본 파일을 열어 주세요.')
 r=E.fromstring(data);objects=[];skipped=0;scripts=0;refs=[];mesh_missing=0;classes={}
 catalog=json.loads((Path(__file__).parent/'novetus-catalog.json').read_text(encoding='utf8'))['entries']
 paths={e['path'].lower():e for e in catalog if e['repo'].endswith('novetus-assetdelivery')}
 def asset(v,kind):
  v=str(v or '').strip();v=re.sub(r'^rbxasset(?:id)?://','',v,flags=re.I)
  n=re.fullmatch(r'(?:https?://(?:www\.)?roblox\.com/(?:asset/?|asset\.ashx)\?id=)?(\d+)',v,re.I)
  e=(paths.get(('fonts/' if kind=='mesh' else 'textures/')+n[1]+('.mesh' if kind=='mesh' else '.png')) or (paths.get('assets/'+n[1]) if kind=='image' else None)) if n else paths.get(v.replace('\\','/').lower())
  return e['key'] if e and (e['kind']==kind or (kind=='image' and e['kind']=='asset')) else None
 brick=json.loads((Path(__file__).parent/'brick-colors.json').read_text(encoding='utf8'))['colors']
 for i in r.iter('Item'):
  cls=i.get('class','');classes[cls]=classes.get(cls,0)+1
  if cls in ('Script','LocalScript','ModuleScript'):scripts+=1;continue
  if cls not in ('Part','WedgePart','SpawnLocation','TrussPart'):continue
  p=i.find('Properties')
  if p is None:continue
  def find(name,props=p):return next((v for v in props if v.get('name')==name),None)
  def vector(n,default,props=p):
   v=find(n,props)
   return [float(v.findtext(a,str(default[j]))) for j,a in enumerate('XYZ')] if v is not None else default
  size=vector('size',[4,1,4]);cf=find('CFrame');position=[float(cf.findtext(a,'0')) for a in 'XYZ'] if cf is not None else [0,0,0]
  if len(objects)>=799 or any(not math.isfinite(n) or abs(n)>512 for n in position) or any(not math.isfinite(n) or n<.2 or n>256 for n in size):skipped+=1;continue
  rotation=[0,0,0]
  if cf is not None:
   m=[float(cf.findtext('R'+str(a)+str(b),str(int(a==b)))) for a in range(3) for b in range(3)]
   if any(not math.isfinite(n) or abs(n)>1.001 for n in m):skipped+=1;continue
   y=math.asin(max(-1,min(1,m[2])))
   if abs(m[2])<.999999:x=math.atan2(-m[5],m[8]);z=math.atan2(-m[1],m[0])
   else:x=math.atan2(m[7],m[4]);z=0
   rotation=[math.degrees(v) for v in [x,y,z]]
  c=find('Color3uint8');bc=find('BrickColor');old=find('Color')
  color='#%06x'%(int(c.text)&0xffffff) if c is not None and c.text else brick.get(str(int(bc.text)),'#91bcb1') if bc is not None and bc.text else '#91bcb1'
  if old is not None and old.tag=='Color3':color='#%02x%02x%02x'%tuple(max(0,min(255,round(float(old.findtext(a,'0.5'))*255))) for a in 'RGB')
  shape=find('shape');kind='spawn' if cls=='SpawnLocation' else 'wedge' if cls=='WedgePart' else 'ball' if shape is not None and shape.text=='0' else 'cylinder' if shape is not None and shape.text=='2' else 'box'
  obj=dict(id='import-'+str(len(objects)),kind=kind,position=position,size=size,rotation=rotation,color=color)
  for child in i.findall('Item'):
   cp=child.find('Properties')
   if cp is None:continue
   if child.get('class') in ('Decal','Texture'):
    tex=find('Texture',cp);key=asset(tex.findtext('url','') if tex is not None else '', 'image')
    if key:obj['texture']=key
   if child.get('class')=='SpecialMesh':
    mid=find('MeshId',cp);key=asset(mid.findtext('url','') if mid is not None else '', 'mesh')
    if key:
     scale=vector('Scale',[1,1,1],cp);offset=vector('Offset',[0,0,0],cp)
     if all(math.isfinite(n) and .001<=n<=256 for n in scale) and all(math.isfinite(n) and abs(n)<=256 for n in offset):
      obj['mesh']=dict(asset=key,scale=scale,offset=offset)
      tex=find('TextureId',cp);tk=asset(tex.findtext('url','') if tex is not None else '', 'image')
      if tk:obj['mesh']['texture']=tk
    elif mid is not None and mid.findtext('url',''):mesh_missing+=1
  objects.append(obj)
  for u in i.iter('url'):
   if u.text and len(refs)<100 and u.text not in refs:refs.append(u.text[:250])
 if req.get('inspect') and not objects:
  print(json.dumps(dict(kind='inspector',classes=classes,scriptsRemoved=scripts,keyframes=classes.get('Keyframe',0),notice='원본 구조를 열었습니다. 스크립트 실행·애니메이션 재생은 하지 않습니다.'),ensure_ascii=False));sys.exit(0)
 if not objects:raise ValueError('가져올 3D 부품이 없습니다. 스크립트/애니메이션 전용 파일입니다.')
 if req.get('map',True) and not any(o['kind']=='spawn' for o in objects):
  floor=max(objects,key=lambda o:o['size'][0]*o['size'][2]);pos=[floor['position'][0],min(500,floor['position'][1]+floor['size'][1]/2+3),floor['position'][2]]
  objects.append(dict(id='auto-spawn',kind='spawn',position=pos,size=[6,1,6],rotation=[0,0,0],color='#94e8bb'))
 print(json.dumps(dict(scene=dict(version=1,title=str(req.get('title','가져온 구형 맵'))[:60],objects=objects),report=dict(scriptsRemoved=scripts,partsSkipped=skipped,meshesPreserved=sum('mesh' in o for o in objects),texturesPreserved=sum(bool('texture' in o or o.get('mesh',{}).get('texture')) for o in objects),meshesMissing=mesh_missing,classes=classes,assetReferences=refs,notice='원본 3D 지형·지원 메시·텍스처를 열었습니다. 스크립트·도구 동작·원본 게임 규칙은 실행하지 않습니다.')),ensure_ascii=False))
except Exception as e:
 print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
