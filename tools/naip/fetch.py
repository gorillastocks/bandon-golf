import json, sys, os, time, math, urllib.request, urllib.parse
import os; os.chdir(os.path.dirname(os.path.abspath(__file__)))
D=json.load(open('holes.json')); F=D['frame']
URL='https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer/exportImage'
MARGIN=170.0
def bounds(rec):
    r=rec['r']; teeE=r[0]/2; teeN=r[1]/2
    xs=[r[i]/2-teeE for i in range(0,len(r),2)]; zs=[-(r[i+1]/2-teeN) for i in range(0,len(r),2)]
    return teeE,teeN,min(xs)-MARGIN,max(xs)+MARGIN,min(zs)-MARGIN,max(zs)+MARGIN
def spec(c,no):
    teeE,teeN,x0,x1,z0,z1=bounds(D['holes'][c][no])
    # local x east, z south -> E=teeE+x, N=teeN-z
    E0,E1=teeE+x0,teeE+x1; N0,N1=teeN-z1,teeN-z0
    lon0=F['lon0']+E0/F['mlon']; lon1=F['lon0']+E1/F['mlon']; lat0=F['lat0']+N0/F['mlat']; lat1=F['lat0']+N1/F['mlat']
    wm,hm=x1-x0,z1-z0; res=max(0.6,max(wm,hm)/1024.0)
    return dict(c=c,no=int(no),x0=x0,x1=x1,z0=z0,z1=z1,lon0=lon0,lon1=lon1,lat0=lat0,lat1=lat1,res=res,W=int(round(wm/res)),H=int(round(hm/res)))
def get(s,path):
    q=dict(bbox='%.7f,%.7f,%.7f,%.7f'%(s['lon0'],s['lat0'],s['lon1'],s['lat1']),bboxSR=4326,imageSR=4326,size='%d,%d'%(s['W'],s['H']),format='jpg',compressionQuality=92,interpolation='RSP_BilinearInterpolation',f='image')
    u=URL+'?'+urllib.parse.urlencode(q)
    for a in range(4):
        try:
            d=urllib.request.urlopen(urllib.request.Request(u,headers={'User-Agent':'bandon-golf-asset-build'}),timeout=90).read()
            if d[:2]==b'\xff\xd8': open(path,'wb').write(d); return len(d)
            print('bad',d[:200])
        except Exception as e: print('err',e)
        time.sleep(3*(a+1))
    return 0
if __name__=='__main__':
    os.makedirs('raw',exist_ok=True); specs=[]
    only=sys.argv[1:]
    for c in D['holes']:
        for no in sorted(D['holes'][c],key=int):
            if only and (c+':'+no) not in only and c not in only: continue
            s=spec(c,no); p='raw/%s_%s.jpg'%(c,no)
            if not os.path.exists(p): n=get(s,p); print(c,no,s['W'],s['H'],round(s['res'],2),n,flush=True); time.sleep(0.4)
            specs.append(s)
    json.dump(specs,open('specs_%s.json'%('_'.join(only) or 'all'),'w'))
