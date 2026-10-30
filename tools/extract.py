import json, math, re, collections
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely.ops import unary_union, polygonize
from shapely.prepared import prep
LAT0,LON0=43.2,-124.4
MLAT=111200.0; MLON=111320.0*math.cos(math.radians(LAT0))
def P(n): return ((n['lon']-LON0)*MLON,(n['lat']-LAT0)*MLAT)
els=json.load(open('all.json'))
nodes={e['id']:e for e in els if e['type']=='node'}
ways={e['id']:e for e in els if e['type']=='way'}
rels={e['id']:e for e in els if e['type']=='relation'}
def wpts(w): return [P(nodes[n]) for n in w['nodes'] if n in nodes]
def tag(w,k): return w.get('tags',{}).get(k)
# ---------- polygons
def assemble(rel, role):
    segs=[ways[m['ref']]['nodes'] for m in rel['members'] if m['type']=='way' and m['role']==role and m['ref'] in ways]
    rings=[]; segs=[list(s) for s in segs]
    while segs:
        cur=segs.pop()
        changed=True
        while cur[0]!=cur[-1] and changed:
            changed=False
            for i,s in enumerate(segs):
                if s[0]==cur[-1]: cur+=s[1:]; segs.pop(i); changed=True; break
                if s[-1]==cur[-1]: cur+=s[::-1][1:]; segs.pop(i); changed=True; break
                if s[-1]==cur[0]: cur=s[:-1]+cur; segs.pop(i); changed=True; break
                if s[0]==cur[0]: cur=s[::-1][:-1]+cur; segs.pop(i); changed=True; break
        if cur[0]==cur[-1] and len(cur)>=4: rings.append([P(nodes[n]) for n in cur if n in nodes])
    return rings
feats=[]  # dict(kind, poly shapely)
def kind_of(t):
    g=t.get('golf')
    if g in ('green','tee','fairway','bunker','rough','water_hazard','lateral_water_hazard'): return g
    if t.get('natural')=='water' : return 'water_hazard'
    if t.get('natural')=='wood' or t.get('landuse')=='forest': return 'wood'
    if t.get('natural')=='scrub': return 'scrub'
    if t.get('natural')=='wetland': return 'wetland'
    if t.get('natural')=='beach': return 'beach'
    return None
used_in_rel=set()
for r in rels.values():
    t=r.get('tags',{})
    if t.get('type')!='multipolygon': continue
    k=kind_of(t)
    if not k: continue
    outs=assemble(r,'outer'); ins=assemble(r,'inner')
    for m in r['members']:
        if m['type']=='way': used_in_rel.add(m['ref'])
    for o in outs:
        try:
            po=Polygon(o)
            if not po.is_valid: po=po.buffer(0)
            holes=[Polygon(i) for i in ins if po.contains(Polygon(i).representative_point())]
            for h in holes: po=po.difference(h)
            if not po.is_empty: feats.append({'k':k.split(';')[0],'g':po,'src':'r%d'%r['id']})
        except Exception as e: pass
for w in ways.values():
    t=w.get('tags',{})
    if w['id'] in used_in_rel and not kind_of(t): continue
    k=kind_of(t)
    if not k: continue
    p=wpts(w)
    if len(p)<4 or w['nodes'][0]!=w['nodes'][-1]: continue
    po=Polygon(p)
    if not po.is_valid: po=po.buffer(0)
    if po.is_empty: continue
    feats.append({'k':k,'g':po,'src':'w%d'%w['id']})
print(collections.Counter(f['k'] for f in feats))
# ---------- courses polygons
cpoly={}
for w in ways.values():
    if tag(w,'leisure')=='golf_course':
        cpoly[w['id']]=(tag(w,'name'),Polygon(wpts(w)).buffer(0))
print({k:v[0] for k,v in cpoly.items()})
# ---------- holes
holes=[w for w in ways.values() if tag(w,'golf')=='hole']
assign=collections.defaultdict(dict)  # course -> ref -> way
def put(c,ref,w):
    if ref in assign[c]: print('dup',c,ref,w['id'],assign[c][ref]['id'])
    assign[c][ref]=w
relmap={21826242:'bandon',21826241:'pacific',21826243:'oldmac'}
seen=set()
for rid,c in relmap.items():
    for m in rels[rid]['members']:
        w=ways[m['ref']]; put(c,int(tag(w,'ref')),w); seen.add(w['id'])
for w in holes:
    if w['id'] in seen: continue
    nm=tag(w,'name') or ''
    ref=tag(w,'ref')
    if 'Bandon Trails' in nm: put('trails',int(ref),w); seen.add(w['id'])
    elif 'Bandon Preserve' in nm: put('preserve',int(ref),w); seen.add(w['id'])
    elif 'Bandon Dunes' in nm: put('bandon',int(ref),w); seen.add(w['id'])
    elif 'Pacific Dunes' in nm: put('pacific',int(ref),w); seen.add(w['id'])
rest=[w for w in holes if w['id'] not in seen]
cp={'sheep':823626858,'shortys':1540940976}
for w in rest:
    p=Point(wpts(w)[0])
    for c,i in cp.items():
        if cpoly[i][1].contains(p): put(c,int(tag(w,'ref')),w); seen.add(w['id']); break
rest=[w for w in holes if w['id'] not in seen]
print('unassigned',[(w['id'],tag(w,'ref'),tag(w,'par')) for w in rest])
for c in assign: print(c,sorted(assign[c]))
json.dump({'assign':{c:{str(k):v['id'] for k,v in d.items()} for c,d in assign.items()}},open('assign.json','w'))
import pickle
pickle.dump((feats,{c:{k:(w['id'],wpts(w),w.get('tags',{})) for k,w in d.items()} for c,d in assign.items()}),open('stage1.pkl','wb'))
