import json, math, time, urllib.request, urllib.parse, os
LAT0,LON0=43.2,-124.4
MLAT=111200.0; MLON=111320.0*math.cos(math.radians(LAT0))
def ll(E,N): return LAT0+N/MLAT, LON0+E/MLON
E0,E1=-0.025*MLON,0.028*MLON   # lon -124.425 .. -124.372
N0,N1=-0.032*MLAT,0.028*MLAT   # lat 43.168 .. 43.228
STEP=25.0
cols=int((E1-E0)/STEP)+1; rows=int((N1-N0)/STEP)+1
print(cols,rows,cols*rows)
pts=[(E0+i*STEP,N0+j*STEP) for j in range(rows) for i in range(cols)]
out=json.load(open('dem_part.json')) if os.path.exists('dem_part.json') else {}
def q(batch):
    locs='|'.join('%.6f,%.6f'%ll(*p) for p in batch)
    url='https://api.opentopodata.org/v1/ned10m?locations='+locs+'&interpolation=bilinear'
    for k in range(6):
        try:
            d=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'bandon-golf-game/1.0'}),timeout=60))
            return [r['elevation'] for r in d['results']]
        except Exception as e:
            print('retry',k,e,flush=True); time.sleep(3+4*k)
    raise SystemExit('fail')
B=100
for b in range(0,len(pts),B):
    if str(b) in out: continue
    out[str(b)]=q(pts[b:b+B]); time.sleep(1.2)
    if (b//B)%20==0: json.dump(out,open('dem_part.json','w')); print(b,flush=True)
json.dump(out,open('dem_part.json','w'))
vals=[]
for b in range(0,len(pts),B): vals+=out[str(b)]
json.dump({'lat0':LAT0,'lon0':LON0,'mlat':MLAT,'mlon':MLON,'E0':E0,'N0':N0,'step':STEP,'cols':cols,'rows':rows,'z':vals},open('dem.json','w'))
print('done')
