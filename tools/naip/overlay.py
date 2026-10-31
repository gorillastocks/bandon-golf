import json,sys
from PIL import Image, ImageDraw
import fetch
D=fetch.D; K=D['kinds']
col={'green':(255,255,0),'tee':(255,128,0),'fairway':(0,255,255),'bunker':(255,0,255),'water_hazard':(0,0,255)}
for a in sys.argv[1:]:
    c,no=a.split(':')
    s=fetch.spec(c,no); im=Image.open('raw/%s_%s.jpg'%(c,no)).convert('RGB'); d=ImageDraw.Draw(im)
    rec=D['holes'][c][no]; r=rec['r']; teeE=r[0]/2; teeN=r[1]/2
    def px(E,N):
        x=E-teeE; z=-(N-teeN); return ((x-s['x0'])/(s['x1']-s['x0'])*im.width,(z-s['z0'])/(s['z1']-s['z0'])*im.height)
    for fi in rec['f']:
        k,rings=D['poly'][fi]; name=K[k]
        if name not in col: continue
        for ring in rings:
            pts=[px(ring[i]/2,ring[i+1]/2) for i in range(0,len(ring),2)]
            d.line(pts+[pts[0]],fill=col[name],width=1)
    pts=[px(r[i]/2,r[i+1]/2) for i in range(0,len(r),2)]; d.line(pts,fill=(255,0,0),width=2)
    im.save('ov_%s_%s.jpg'%(c,no),quality=88); print(c,no,im.size)
