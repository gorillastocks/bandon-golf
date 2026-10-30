import pickle, math, json, subprocess, collections
from shapely.geometry import Polygon, LineString, Point, MultiPolygon, GeometryCollection
from shapely.ops import substring
from shapely import affinity
feats,holes=pickle.load(open('stage1.pkl','rb'))
YD=0.9144
js=subprocess.run(['node','-e',"global.window=undefined;require('/workspace/bandon-golf/js/data.js');console.log(JSON.stringify(BG.COURSES.map(c=>({id:c.id,pars:c.pars,yds:c.yds}))))"],capture_output=True,text=True).stdout
D={c['id']:c for c in json.loads(js)}
KINDS=['green','tee','fairway','bunker','rough','water','lateral','wood','scrub','wetland','beach']
KMAP={'green':0,'tee':1,'fairway':2,'bunker':3,'rough':4,'water_hazard':5,'lateral_water_hazard':6,'wood':7,'scrub':8,'wetland':9,'beach':10}
# explode multipolygons
F=[]
for f in feats:
    g=f['g']
    geoms=list(g.geoms) if hasattr(g,'geoms') else [g]
    for p in geoms:
        if isinstance(p,Polygon) and not p.is_empty and p.area>1.0: F.append({'k':f['k'],'g':p,'src':f['src']})
print(len(F))
byk=collections.defaultdict(list)
for i,f in enumerate(F): byk[f['k']].append(i)
LIMIT={'green':45,'tee':30,'fairway':75,'bunker':65,'rough':95,'water_hazard':130,'lateral_water_hazard':130,'wood':170,'scrub':130,'wetland':100,'beach':100}
def plen(pts): return sum(math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
log=[]
out={}
used=set()
def process(cid,no,wid,pts,tags,official_yds,par):
    line=LineString(pts)
    # green
    gi=None;best=1e9
    end=Point(pts[-1])
    for i in byk['green']:
        d=F[i]['g'].distance(end)
        if d<best: best=d;gi=i
    gnote=''
    if gi is None or best>35: gi=None; gnote='no green polygon (fallback ellipse)'
    gc=F[gi]['g'].centroid if gi is not None else end
    gpt=(gc.x,gc.y)
    route=[tuple(p) for p in pts[:-1]]+[gpt]
    # tee candidates
    start=Point(route[0])
    cands=[]
    rl=LineString(route)
    for i in byk['tee']:
        c=F[i]['g'].centroid
        s_=rl.project(c); d_=rl.distance(c)
        if c.distance(Point(gpt))<=8: continue
        if (s_<8 and c.distance(start)<=140) or (d_<=28 and s_<0.6*rl.length): cands.append((i,(c.x,c.y)))
    def route_from(T):
        s=rl.project(Point(T)); pr=rl.interpolate(s)
        pts2=[T]
        # vertices after s
        acc=0
        for k in range(1,len(route)):
            acc_k=rl.project(Point(route[k]))
            if acc_k>s+2: pts2.append(route[k])
        if len(pts2)==1: pts2.append(route[-1])
        return pts2
    bestc=None
    for i,T in cands:
        r2=route_from(T); L=plen(r2)/YD
        sc=abs(L-official_yds)
        if bestc is None or sc<bestc[0]: bestc=(sc,i,T,r2,L)
    L0=plen(route)/YD
    tnote=''
    if bestc and bestc[0]<abs(L0-official_yds)-1:
        sc,ti,T,route2,L=bestc; tee_idx=ti; tnote='tee polygon'
    else:
        route2=route; L=L0; tee_idx=None; tnote='route tee'
        # tee polygon nearest to start
        bd=1e9
        for i in byk['tee']:
            d=F[i]['g'].distance(start)
            if d<bd: bd=d;tee_idx=i if d<12 else None
    # back-tee extension if still short
    if official_yds-L>6 and L<official_yds:
        deficit=(official_yds-L)*YD
        if deficit<=110:
            (x0,y0),(x1,y1)=route2[0],route2[1]; d=math.hypot(x1-x0,y1-y0) or 1
            nt=(x0-(x1-x0)/d*deficit, y0-(y1-y0)/d*deficit)
            route2=[nt]+route2; L=plen(route2)/YD; tnote+=' +back-tee extension %dyd'%round(deficit/YD); tee_idx=None
    elif L-official_yds>6:
        tnote+=' (route %dyd longer than scorecard)'%round(L-official_yds)
    rl2=LineString(route2)
    rec={'route':route2,'green':gpt,'gi':gi,'ti':tee_idx,'len':round(L),'note':[n for n in (gnote,tnote) if n]}
    # features
    sel=[]
    for i,f in enumerate(F):
        k=f['k']
        if f['g'].distance(rl2)<=LIMIT[k] or (k=='tee' and i==tee_idx): sel.append(i)
    rec['f']=sel
    return rec
res={}
for cid in ['bandon','pacific','trails','oldmac','sheep','preserve']:
    res[cid]={}
    n=len(D[cid]['pars'])
    for no in range(1,n+1):
        wid,pts,tags=holes[cid][no]
        # orient tee->green: end should be near a green polygon
        def gd(p): return min(F[i]['g'].distance(Point(p)) for i in byk['green'])
        if gd(pts[0])<gd(pts[-1])-3: pts=pts[::-1]; flip=True
        rec=process(cid,no,wid,pts,tags,D[cid]['yds'][no-1],D[cid]['pars'][no-1]); rec['osm']=wid
        res[cid][no]=rec
# Shorty's: assignment by yardage
import itertools
cid='shortys'; off=D[cid]['yds']
cand={}
for ref,(wid,pts,tags) in holes[cid].items():
    def gd(p): return min(F[i]['g'].distance(Point(p)) for i in byk['green'])
    if gd(pts[0])<gd(pts[-1])-3: pts=pts[::-1]
    cand[ref]=(wid,pts,tags,plen(pts)/YD)
# greedy assignment minimizing deficit/excess: allow extension for shorter routes
refs=list(cand)
import numpy as np
cost=np.array([[ (abs(cand[r][3]-y) if cand[r][3]>=y-6 else abs(cand[r][3]-y)*0.6) for r in refs] for y in off])
from scipy.optimize import linear_sum_assignment
ri,ci=linear_sum_assignment(cost)
res[cid]={}
for h,c in zip(ri,ci):
    r=refs[c]; wid,pts,tags,_=cand[r]
    rec=process(cid,h+1,wid,pts,tags,off[h],3); rec['osm']=wid; rec['note'].append('Shorty\'s: OSM maps 19 par-3 lines; matched by scorecard yardage (osm ref %d)'%r)
    res[cid][h+1]=rec
pickle.dump((F,res),open('stage2.pkl','wb'))
used=set()
for c in res:
    for n,r in res[c].items(): used.update(r['f'])
print('features used',len(used),collections.Counter(F[i]['k'] for i in used))
for c in res:
    print('==',c)
    for n,r in res[c].items(): print(n,r['len'],D[c]['yds'][n-1],r['note'],len(r['f']))
