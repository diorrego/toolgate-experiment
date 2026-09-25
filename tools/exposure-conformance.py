"""Deterministic V3 workflow parity over real HTTP and PostgreSQL, no paid calls."""
import concurrent.futures, hashlib, http.server, json, os, subprocess, threading, time, urllib.request, urllib.error, uuid
from pathlib import Path
from jsonschema import Draft202012Validator
ROOT=Path(__file__).resolve().parents[1]
SCHEMA=json.loads((ROOT/'shared/schemas/api.schema.json').read_text())
class MockServer(http.server.ThreadingHTTPServer):
    request_queue_size=128
class Selector(http.server.BaseHTTPRequestHandler):
    calls=0; seen=[]; lock=threading.Lock()
    def log_message(self,*args):pass
    def do_POST(self):
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with self.lock:Selector.calls+=1;Selector.seen.append(body)
        intent=body['state']['intent'];answers={}
        if 'timeout' in intent:time.sleep(2.6)
        if 'http error' in intent:
            self.send_response(503);self.end_headers();self.wfile.write(b'not JSON');return
        for key in body['questions']:
            yes='no match' not in intent
            answers[key]={'type':'choice','choice':'yes' if yes else 'no','confidence':1,'probabilities':{'yes':1 if yes else 0,'no':0 if yes else 1}}
        if 'invalid' in intent:answers.pop(next(iter(answers)))
        data=json.dumps({'model':'jev-fixture','usage':{'input_tokens':123,'output_tokens':7},'answers':answers}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers()
        try:self.wfile.write(data)
        except (BrokenPipeError,ConnectionResetError):pass
LAST_TRACE=None
def call(base,key,path,body,method='POST',idem=None):
    req=urllib.request.Request(base+path,data=json.dumps(body).encode(),method=method,headers={'Authorization':'Bearer '+key,'X-Toolgate-Contract':'0.1','Content-Type':'application/json','Idempotency-Key':idem or str(uuid.uuid4())})
    try:r=urllib.request.urlopen(req,timeout=6)
    except urllib.error.HTTPError as e:r=e
    with r:
        global LAST_TRACE
        LAST_TRACE=json.loads(r.headers["x-toolgate-workflow-trace"]) if r.headers.get("x-toolgate-workflow-trace") else None
        data=json.load(r);status=r.status
        name='Error' if status>=400 else 'CatalogInfo' if method=='PUT' else 'WorkflowView' if path=='/v1/workflows' else 'DecisionResponse' if path.endswith('/execution-decisions') else 'OperationView'
        Draft202012Validator({**SCHEMA,'$ref':'#/$defs/'+name}).validate(data)
        calls=int(r.headers['x-toolgate-jev-calls']);measured=int(r.headers['x-toolgate-jev-usage-calls']);assert measured<=calls;assert int(r.headers['x-toolgate-jev-input-tokens'])==123*measured
        if status<400:assert measured==calls
        return status,data

def run(base,cfg,binary):
    checks=[]
    def check(name,condition):
        assert condition,name
        checks.append(name)
    tools=[{'tool_id':f'tool{i:02}','name':f'tool{i:02}','title':'Synthetic workflow step','description':'Read a synthetic value','aliases':[],'tags':[],'effect':'read' if i%2==0 else 'write','open_world':False,'input_schema':{'type':'object','properties':{'id':{'type':'string'}},'required':['id'],'additionalProperties':False},'schema_profile':'tg-jsonschema-1'} for i in range(10)]
    upload={'schema_profile':'tg-jsonschema-1','tools':tools};version=hashlib.sha256(json.dumps(upload,sort_keys=True,separators=(',',':')).encode()).hexdigest()
    status,_=call(base,cfg['keys']['admin'],'/v1/catalogs/workflow-fixture/versions/'+version,upload,'PUT');check('catalog',status==200)
    actor={'principal_ref':'wf-user','workspace_ref':'wf-workspace','authorization_revision':'wf-policy','allowed_tool_ids':['tool00','tool01']}
    body={'catalog_id':'workflow-fixture','catalog_version':version,'actor':actor,'intent':'find and update value'}
    key=str(uuid.uuid4());count=Selector.calls
    status,view=call(base,cfg['keys']['runtime'],'/v1/workflows',body,idem=key)
    check('two independent selected schemas',status==201 and [o['selected_tool']['tool_id'] for o in view['operations']]==actor['allowed_tool_ids'])
    check('profile attempt count',Selector.calls-count==(2 if binary else 1))
    check('filter before inference',all('tool02' not in json.dumps(b) for b in Selector.seen))
    check('missing args individually',all(o['status']=='needs_arguments' and o['missing_paths']==['/id'] for o in view['operations']))
    count=Selector.calls;check('idempotent same bundle',call(base,cfg['keys']['runtime'],'/v1/workflows',body,idem=key)[1]==view and Selector.calls==count)
    check('idempotency conflict',call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'intent':'other'},idem=key)[0]==409)
    op=view['operations'][0];path='/v1/operations/'+op['operation_id'];check('child ownership',call(base,cfg['keys']['runtime'],path+'/inspect',{'actor':{**actor,'principal_ref':'other'}})[0]==404)
    check('child authorization',call(base,cfg['keys']['runtime'],path+'/execution-decisions',{'actor':{**actor,'allowed_tool_ids':['tool01']},'expected_revision':1,'arguments':{'id':'found'}})[0]>=400)
    decision={'actor':actor,'expected_revision':1,'arguments':{'id':'found'}}
    status,d=call(base,cfg['keys']['runtime'],path+'/execution-decisions',decision);check('normal child decision no inference',status==200 and d['status']=='decision_issued' and Selector.calls==count)
    for intent,expected in [('no match','no_match'),('invalid',None)]:
        status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'intent':intent})
        check('selector '+intent,status==502 if expected is None else status==201 and v['status']==expected and not v['operations'])
    for intent,expectedStatus,expectedCode in [('timeout',504,'DEADLINE_EXCEEDED'),('http error',503,'SELECTOR_UNAVAILABLE')]:
        status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'intent':intent});check('error parity '+intent,status==expectedStatus and v.get('error',{}).get('code')==expectedCode)
    count=Selector.calls;status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'actor':{**actor,'allowed_tool_ids':[]}});check('empty authorization no inference',status==201 and v['status']=='no_match' and Selector.calls==count)
    status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'actor':{**actor,'allowed_tool_ids':[t['tool_id'] for t in tools]}});check('overflow explicit no children',status==201 and v['status']=='needs_refinement' and not v['operations'])
    check('unknown request input rejected',call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'tool_ids':['tool00']})[0]==400)
    key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:responses=list(pool.map(lambda _:call(base,cfg['keys']['runtime'],'/v1/workflows',body,idem=key),range(4)))
    successes=[v for s,v in responses if s==201];check('concurrent atomic bundle',len({json.dumps(v,sort_keys=True) for v in successes})==1 and all(s in (201,409) for s,_ in responses))
    previous=None
    for cap in [1,3,5,8]:
        before=Selector.calls
        status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'actor':{**actor,'allowed_tool_ids':[t['tool_id'] for t in tools]},'exposure_limit':cap})
        check('cap '+str(cap),status==201 and [c['selected_tool']['tool_id'] for c in v['operations']]==[t['tool_id'] for t in tools[:cap]])
        check('unchanged full inclusion '+str(cap),LAST_TRACE['retrieved']==list(range(10)) and LAST_TRACE['included']==list(range(10)) and LAST_TRACE['exposed']==list(range(cap)))
        payload=Selector.seen[-1]
        if previous is not None:check('identical selector request '+str(cap),payload==previous)
        previous=payload
        check('one joint call '+str(cap),Selector.calls-before==1)
    for cap in [0,2,9,True,'3']:
        check('invalid cap '+str(cap),call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'exposure_limit':cap})[0]==400)
    status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'intent':'no match','exposure_limit':3})
    check('never pad',status==201 and v['operations']==[] and LAST_TRACE['included']==[] and LAST_TRACE['exposed']==[])
    status,v=call(base,cfg['keys']['runtime'],'/v1/workflows',{**body,'intent':'invalid','exposure_limit':3})
    check('failed inclusion not false negative',status==502 and LAST_TRACE['retrieved']==[0,1] and LAST_TRACE['included'] is None and LAST_TRACE['exposed'] is None)
    return checks
if __name__=='__main__':
    cfg=json.loads(Path(os.environ['TOOLGATE_LAB_STATE']).read_text());reports=[]
    for mode in ['go','rust']:
      for profile in ['choice']:
        Selector.calls=0;Selector.seen=[]
        server=MockServer(('127.0.0.1',0),Selector);threading.Thread(target=server.serve_forever,daemon=True).start();port=19085
        env={**os.environ,'TOOLGATE_LISTEN_ADDR':f'127.0.0.1:{port}','TOOLGATE_DATABASE_URL':f"postgres://tg_runtime:{cfg['runtime_password']}@127.0.0.1:{cfg['port']}/toolgate_{mode}?sslmode=disable",'TOOLGATE_KEY_PEPPER':cfg['pepper'],'TOOLGATE_JEV_BASE_URL':f'http://127.0.0.1:{server.server_port}/v1/systemone','TYPESAFE_AI_API_KEY':'synthetic','TOOLGATE_JEV_MODEL':'jev-fixture','TOOLGATE_SELECTOR_MODE':profile}
        binary=ROOT/('backend-go/bin/toolgate' if mode=='go' else 'backend-rust/target/release/toolgate-core')
        with open(os.environ['TOOLGATE_VERIFICATION_DIR']+'/'+mode+'-workflow-server.log','a') as log:
          p=subprocess.Popen([str(binary)],env=env,stdout=log,stderr=log)
          try:
            for _ in range(60):
              try:
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/health/live',timeout=.2):break
              except OSError:time.sleep(.1)
            checks=run(f'http://127.0.0.1:{port}',cfg,profile!='choice')
            subprocess.run(['node',str(ROOT/'tools/workflow-sdk-conformance.mjs'),f'http://127.0.0.1:{port}'],check=True)
            reports.append({'core':mode,'profile':profile,'checks':checks});print(json.dumps(reports[-1]),flush=True)
          finally:p.terminate();p.wait(timeout=12);server.shutdown();server.server_close()
    Path(os.environ['TOOLGATE_VERIFICATION_DIR']+'/exposure-conformance.json').write_text(json.dumps(reports,indent=2)+'\n')
