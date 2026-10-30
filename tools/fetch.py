import json, time, urllib.request, os, sys
def get(b):
    url="https://api.openstreetmap.org/api/0.6/map.json?bbox=%.4f,%.4f,%.4f,%.4f"%b
    req=urllib.request.Request(url,headers={"User-Agent":"bandon-golf-game/1.0 (static hobby game; contact gorillastocks)"})
    for k in range(3):
        try:
            return json.load(urllib.request.urlopen(req,timeout=60))
        except Exception as e:
            err=str(e)
            if '400' in err: return None
            time.sleep(3)
    return None
els={}
lat0,lat1,lon0,lon1=43.14,43.24,-124.44,-124.37
step=0.01
import math
def tile(w,s,e,n):
    d=get((w,s,e,n))
    if d is None:
        if e-w<0.0015: print("fail",w,s); return
        mx=(w+e)/2; my=(s+n)/2
        for b in [(w,s,mx,my),(mx,s,e,my),(w,my,mx,n),(mx,my,e,n)]: tile(*b)
        return
    for el in d['elements']: els[(el['type'],el['id'])]=el
la=lat0
while la<lat1-1e-9:
    lo=lon0
    while lo<lon1-1e-9:
        tile(round(lo,4),round(la,4),round(lo+step,4),round(la+step,4)); time.sleep(0.5)
        lo+=step
    la+=step
    print(round(la,3),len(els),flush=True)
json.dump(list(els.values()),open('all.json','w'))
