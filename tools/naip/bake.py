import json, os, sys, math
from PIL import Image
import numpy as np
import fetch
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','assets','aerial')
idx={}; tot=[0,0]
def lin(c): return np.where(c<=0.04045,c/12.92,((c+0.055)/1.055)**2.4)
for c in fetch.D['holes']:
    os.makedirs(OUT+'/'+c,exist_ok=True); idx[c]={}
    for no in sorted(fetch.D['holes'][c],key=int):
        p='raw/%s_%s.jpg'%(c,no)
        if not os.path.exists(p): print('missing',c,no); continue
        s=fetch.spec(c,no); im=Image.open(p).convert('RGB')
        a=np.asarray(im).astype(np.float32)/255
        avg=lin(a).reshape(-1,3).mean(0)
        f=OUT+'/%s/%s.webp'%(c,no); im.save(f,'WEBP',quality=86,method=6); tot[0]+=os.path.getsize(f)
        sm=im.copy(); sc=512/max(sm.size)
        if sc<1: sm=sm.resize((max(1,round(sm.width*sc)),max(1,round(sm.height*sc))),Image.LANCZOS)
        f2=OUT+'/%s/%s_s.webp'%(c,no); sm.save(f2,'WEBP',quality=76,method=6); tot[1]+=os.path.getsize(f2)
        idx[c][no]=dict(x0=round(s['x0'],1),x1=round(s['x1'],1),z0=round(s['z0'],1),z1=round(s['z1'],1),w=im.width,h=im.height,avg=[round(float(v),4) for v in avg])
json.dump(idx,open(OUT+'/index.json','w'),separators=(',',':'))
print('full MB',tot[0]/1e6,'small MB',tot[1]/1e6, 'holes',sum(len(v) for v in idx.values()))
