#!/usr/bin/env python3
"""Private technical verification only. Does not establish redistribution rights."""
import hashlib,json,re,sys,subprocess
from pathlib import Path
base='https://aya.nodium.lol'
root=Path(sys.argv[1])
root.mkdir(parents=True,exist_ok=True)
names=['Aya.App.js','Aya.App.wasm','Aya.App.data','Aya.GameWebRtc.js','Aya.App.StreamingFrame.js','Aya.Diagnostics.js']
provenance=[]
for name in ['index.html']+names:
    url=base+'/runtime?apptype=server' if name=='index.html' else base+'/runtime/'+name
    target=root/name
    if target.exists() and target.stat().st_size>100:
        print('Existing',name,target.stat().st_size,flush=True)
    else:
        tmp=target.with_suffix(target.suffix+'.download')
        print('Downloading',url,flush=True)
        subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','180',url,'--output',str(tmp)],check=True)
        if name.endswith('.wasm'):
            with tmp.open('rb') as f:assert f.read(4)==b'\x00asm','Invalid WASM response'
        tmp.replace(target)
    digest=hashlib.sha256()
    with target.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):digest.update(b)
    provenance.append({'file':name,'source':url,'bytes':target.stat().st_size,'sha256':digest.hexdigest()})
html=(root/'index.html').read_text()
versions={k:re.search(r'const '+k+r' = "([^"]+)"',html).group(1) for k in ['runtimeVersion','runtimeDataVersion']}
(root/'provenance.json').write_text(json.dumps({'privateOnly':True,'versions':versions,'files':provenance},indent=2))
print(json.dumps({'downloaded':provenance,'versions':versions}),flush=True)
