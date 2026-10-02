"""Read geometry only from an owned/licensed legacy .rbxl/.rbxlx/.rbxl.bz2. Never execute embedded code."""
import sys,json,base64,bz2,io,math,xml.etree.ElementTree as E
try:
 req=json.load(sys.stdin);data=base64.b64decode(req['data'],validate=True)
 if len(data)>1024*1024:raise ValueError('입력 파일은 1MB 이하만 지원합니다.')
 if data.startswith(b'BZh'):
  decoder=bz2.BZ2Decompressor();data=decoder.decompress(data,max_length=16*1024*1024+1)
  if len(data)>16*1024*1024 or not decoder.eof:raise ValueError('압축 해제 크기가 너무 큽니다.')
 if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():raise ValueError('외부 엔티티 XML은 허용하지 않습니다.')
 if not data.lstrip().startswith(b'<roblox'):raise ValueError('XML 형식 구형 맵만 지원합니다. 바이너리 맵은 먼저 rbxlx로 변환해 주세요.')
 r=E.fromstring(data);objects=[];skipped=0;scripts=0;refs=[]
 for i in r.iter('Item'):
  cls=i.get('class','')
  if cls in ('Script','LocalScript','ModuleScript'):scripts+=1;continue
  if cls not in ('Part','WedgePart','SpawnLocation','TrussPart'):continue
  p=i.find('Properties')
  if p is None:continue
  def find(name):return next((v for v in p if v.get('name')==name),None)
  def vector(n,default):
   v=find(n)
   return [float(v.findtext(a,str(default[j]))) for j,a in enumerate('XYZ')] if v is not None else default
  size=vector('size',[4,1,4]);cf=find('CFrame');position=[float(cf.findtext(a,'0')) for a in 'XYZ'] if cf is not None else [0,0,0]
  if len(objects)>=800 or any(not math.isfinite(n) or abs(n)>512 for n in position) or any(n<.2 or n>256 for n in size):skipped+=1;continue
  rotation=[0,0,0]
  if cf is not None:
   m=[float(cf.findtext('R'+str(a)+str(b),str(int(a==b)))) for a in range(3) for b in range(3)]
   y=math.asin(max(-1,min(1,m[2])));x=math.atan2(-m[5],m[8]);z=math.atan2(-m[1],m[0]);rotation=[math.degrees(v) for v in [x,y,z]]
  c=find('Color3uint8');color='#%06x'%int(c.text) if c is not None and c.text else '#91bcb1'
  shape=find('shape');kind='spawn' if cls=='SpawnLocation' else 'wedge' if cls=='WedgePart' else 'ball' if shape is not None and shape.text=='0' else 'cylinder' if shape is not None and shape.text=='2' else 'box'
  objects.append(dict(id='import-'+str(len(objects)),kind=kind,position=position,size=size,rotation=rotation,color=color))
  for u in i.iter('url'):
   if u.text and len(refs)<50 and u.text not in refs:refs.append(u.text[:250])
 if not objects:raise ValueError('가져올 지형 부품이 없습니다.')
 if not any(o['kind']=='spawn' for o in objects):objects.append(dict(id='auto-spawn',kind='spawn',position=[0,5,0],size=[6,1,6],rotation=[0,0,0],color='#94e8bb'))
 if len(objects)>800:objects=objects[:799]+[objects[-1]]
 if not objects:raise ValueError('가져올 지형 부품이 없습니다.')
 print(json.dumps(dict(scene=dict(version=1,title=str(req.get('title','가져온 구형 맵'))[:60],objects=objects),report=dict(scriptsRemoved=scripts,partsSkipped=skipped,assetReferences=refs,notice='지형만 가져왔습니다. 스크립트·도구·외부 메시·원본 게임 규칙은 실행하지 않습니다.')),ensure_ascii=False))
except Exception as e:
 print(json.dumps({'error':str(e)},ensure_ascii=False));sys.exit(1)
