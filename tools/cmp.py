import pickle, math, json
feats,holes=pickle.load(open('stage1.pkl','rb'))
import re
exec(open('/dev/stdin').read()) if False else None
# load data.js pars/yds via node
import subprocess
js=subprocess.run(['node','-e',"global.window=undefined;require('/workspace/bandon-golf/js/data.js');console.log(JSON.stringify(BG.COURSES.map(c=>({id:c.id,pars:c.pars,yds:c.yds}))))"],capture_output=True,text=True).stdout
D={c['id']:c for c in json.loads(js)}
for c in ['bandon','pacific','trails','oldmac','sheep','preserve','shortys']:
    print('==',c)
    for ref in sorted(holes[c]):
        wid,pts,t=holes[c][ref]
        L=sum(math.hypot(pts[i+1][0]-pts[i][0],pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))/0.9144
        d=t.get('dist:black'); 
        i=ref-1
        dp=D[c]['pars'][i] if i<len(D[c]['pars']) else None; dy=D[c]['yds'][i] if i<len(D[c]['yds']) else None
        print(ref,'osmpar',t.get('par'),'datapar',dp,'osmblack',d,'datayds',dy,'route yd',round(L))
