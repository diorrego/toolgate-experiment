"""Deterministic HTTP/PG contract checks; fake Jev uses HTTP, never the live key."""
import concurrent.futures, contextlib, hashlib, http.server, json, os, subprocess, threading, time, urllib.request, urllib.error, uuid
from pathlib import Path
from jsonschema import Draft202012Validator,FormatChecker
ROOT=Path(__file__).resolve().parents[1]
SCHEMA=json.loads((ROOT/'shared/schemas/api.schema.json').read_text())
def validate_wire(status,body,path,method):
    name='Error' if status>=400 else 'Capabilities' if path=='/v1/capabilities' else ('CatalogInfo' if method=='PUT' else 'CatalogDocument') if '/catalogs/' in path else 'DecisionResponse' if path.endswith('/execution-decisions') else 'ReceiptResponse' if path.endswith('/receipts') else 'OperationView'
    Draft202012Validator({**SCHEMA,'$ref':'#/$defs/'+name},format_checker=FormatChecker()).validate(body)
    return status,body

class Selector(http.server.BaseHTTPRequestHandler):
    calls=0
    lock=threading.Lock()
    def log_message(self,*args):pass
    def do_POST(self):
        raw=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        with self.lock:type(self).calls+=1
        keys=list(raw['questions']['selection']['criteria'])
        intent=raw['state']['intent']
        probabilities={key:0 for key in keys}
        choices=sorted(k for k in keys if k!='none')
        choice='none' if 'no match' in intent else choices[0]
        if 'ambiguous' in intent and len(choices)>1:
            probabilities[choices[0]]=0.5;probabilities[choices[1]]=0.5
        else:probabilities[choice]=1
        body=json.dumps({'model':'jev-fixture','usage':{'input_tokens':123,'output_tokens':7},'answers':{'selection':{'type':'choice','choice':choice,'confidence':1,'probabilities':probabilities}}}).encode()
        self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

def validate_usage(response):
    calls = int(response.headers['x-toolgate-jev-calls'])
    measured = int(response.headers['x-toolgate-jev-usage-calls'])
    assert measured == calls, 'fake Jev returned usage for every attempt'
    assert int(response.headers['x-toolgate-jev-input-tokens']) == calls * 123
    assert int(response.headers['x-toolgate-jev-output-tokens']) == calls * 7

def call(base,key,path,body=None,method='POST',idem=None,raw=None):
    headers={'Authorization':'Bearer '+key,'X-Toolgate-Contract':'0.1','Content-Type':'application/json'}
    if idem:headers['Idempotency-Key']=idem
    request=urllib.request.Request(base+path,data=raw if raw is not None else json.dumps(body).encode() if body is not None else None,method=method,headers=headers)
    try:
        with urllib.request.urlopen(request,timeout=6) as response:
            validate_usage(response)
            return validate_wire(response.status,json.load(response),path,method)
    except urllib.error.HTTPError as response:return validate_wire(response.code,json.load(response),path,method)

def canonical(value):
    # These synthetic fixtures deliberately contain only ASCII/integer JCS vectors.
    return json.dumps(value,sort_keys=True,separators=(',',':'))

def run(base,cfg):
    runtime=cfg['keys']['runtime'];admin=cfg['keys']['admin'];other=cfg['keys']['other']
    tool=lambda name:{'tool_id':name,'name':name,'title':name,'description':'Read a synthetic value','aliases':[],'tags':[],'effect':'read','open_world':False,'input_schema':{'type':'object','properties':{'name':{'type':'string'}},'required':['name'],'additionalProperties':False},'schema_profile':'tg-jsonschema-1'}
    upload={'schema_profile':'tg-jsonschema-1','tools':[tool('alpha'),tool('beta')]}
    version=hashlib.sha256(canonical(upload).encode()).hexdigest();catalog='/v1/catalogs/fixture/versions/'+version
    results=[]
    def check(name,actual,expected):
        if actual!=expected:raise AssertionError(name+': '+repr(actual)+' != '+repr(expected))
        results.append(name)
    check('auth required',call(base,'invalid','/v1/capabilities',method='GET')[0],401)
    check('capabilities',call(base,runtime,'/v1/capabilities',method='GET')[0],200)
    check('runtime cannot publish',call(base,runtime,catalog,upload,method='PUT')[0],403)
    check('publish',call(base,admin,catalog,upload,method='PUT')[0],200)
    check('cross tenant catalog',call(base,other,catalog,method='GET')[0],404)
    actor={'principal_ref':'actor-a','workspace_ref':'workspace-a','authorization_revision':'policy-1','allowed_tool_ids':['alpha','beta']}
    body={'catalog_id':'fixture','catalog_version':version,'actor':actor,'intent':'read value','known_arguments':{'name':'synthetic'}}
    key=str(uuid.uuid4());status,op=call(base,runtime,'/v1/operations',body,idem=key)
    check('prepare status',status,201);check('prepare ready',op['status'],'ready')
    check('prepare replay',call(base,runtime,'/v1/operations',body,idem=key)[1],op)
    check('different body same key',call(base,runtime,'/v1/operations',{**body,'intent':'changed'},idem=key)[0],409)
    path='/v1/operations/'+op['operation_id']
    foreign={**actor,'principal_ref':'foreign'}
    check('operation ownership',call(base,runtime,path+'/inspect',{'actor':foreign})[0],404)
    check('policy revision',call(base,runtime,path+'/inspect',{'actor':{**actor,'authorization_revision':'changed'}})[0],409)
    decisionBody={'actor':actor,'expected_revision':op['revision'],'arguments':{'name':'synthetic'}}
    count=Selector.calls
    key=str(uuid.uuid4());status,decision=call(base,runtime,path+'/execution-decisions',decisionBody,idem=key)
    check('decision',status,200);check('decision status',decision['status'],'decision_issued');check('no extra inference',Selector.calls,count)
    check('decision replay new key',call(base,runtime,path+'/execution-decisions',decisionBody,idem=str(uuid.uuid4()))[1],decision)
    check('different args after decision',call(base,runtime,path+'/execution-decisions',{**decisionBody,'arguments':{'name':'different'}},idem=str(uuid.uuid4()))[0],409)
    check('issued cannot cancel',call(base,runtime,path+'/cancel',{'actor':actor,'expected_revision':2},idem=str(uuid.uuid4()))[0],409)
    _,missing=call(base,runtime,'/v1/operations',{**body,'known_arguments':{}},idem=str(uuid.uuid4()))
    check('missing arguments',missing['status'],'needs_arguments');check('missing path',missing['missing_paths'],['/name'])
    missingPath='/v1/operations/'+missing['operation_id']+'/execution-decisions'
    count=Selector.calls;status,repaired=call(base,runtime,missingPath,{'actor':actor,'expected_revision':1,'arguments':{'name':'synthetic'}},idem=str(uuid.uuid4()))
    check('complete without reselection',repaired['status'],'decision_issued');check('complete inference count',Selector.calls,count)
    _,ambiguous=call(base,runtime,'/v1/operations',{**body,'intent':'ambiguous'},idem=str(uuid.uuid4()))
    check('ambiguity',ambiguous['status'],'needs_choice');count=Selector.calls
    status,resolved=call(base,runtime,'/v1/operations/'+ambiguous['operation_id']+'/resolve',{'actor':actor,'expected_revision':1,'tool_choice':'beta','arguments':{'name':'synthetic'}},idem=str(uuid.uuid4()))
    check('resolve',resolved['status'],'ready');check('choice binding',resolved['selected_tool']['tool_id'],'beta');check('resolve inference count',Selector.calls,count)
    _,denied=call(base,runtime,'/v1/operations',{**body,'actor':{**actor,'allowed_tool_ids':[]}},idem=str(uuid.uuid4()))
    check('empty allowlist',denied['reason'],'no_authorized_tools')
    key=str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        responses=list(executor.map(lambda _:call(base,runtime,'/v1/operations',body,idem=key),range(8)))
    successes=[v for status,v in responses if status==201]
    check('concurrent single operation',len({v['operation_id'] for v in successes}),1)
    check('duplicates bounded',all(status in (201,409) for status,_ in responses),True)
    check('raw duplicate keys',call(base,runtime,'/v1/operations',idem=str(uuid.uuid4()),raw=b'{"actor":{},"actor":{}}')[0],400)
    return {'checks':results,'count':len(results),'jev_calls':Selector.calls,'fixture_only':True}

if __name__=='__main__':
    import sys
    mode=sys.argv[1] if len(sys.argv)>1 else 'go'
    cfg=json.loads(Path(os.environ.get('TOOLGATE_LAB_STATE',str(ROOT/'.local/lab.json'))).read_text())
    http=http.server.ThreadingHTTPServer(('127.0.0.1',0),Selector);thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
    port=19081 if mode=='go' else 19082
    env={**os.environ,'TOOLGATE_LISTEN_ADDR':f'127.0.0.1:{port}','TOOLGATE_DATABASE_URL':f"postgres://tg_runtime:{cfg['runtime_password']}@127.0.0.1:{cfg.get('port',55439)}/toolgate_{mode}?sslmode=disable",'TOOLGATE_KEY_PEPPER':cfg['pepper'],'TOOLGATE_JEV_BASE_URL':f'http://127.0.0.1:{http.server_port}/v1/systemone','TYPESAFE_AI_API_KEY':'synthetic','TOOLGATE_JEV_MODEL':'jev-fixture'}
    binary=ROOT/('backend-go/bin/toolgate' if mode=='go' else 'backend-rust/target/release/toolgate-core')
    with (ROOT/f'verification/{mode}-conformance-server.log').open('w') as log:
        process=subprocess.Popen([str(binary)],env=env,stdout=log,stderr=log)
        try:
            for _ in range(60):
                try:
                    with urllib.request.urlopen(f'http://127.0.0.1:{port}/health/live',timeout=.2):break
                except OSError:
                    if process.poll() is not None:raise RuntimeError('Core startup failed')
                    time.sleep(.1)
            report=run(f'http://127.0.0.1:{port}',cfg);print(json.dumps(report,indent=2));
            if '--sdk' in sys.argv:subprocess.run(['node',str(ROOT/'tools/sdk-store-conformance.mjs'),f'http://127.0.0.1:{port}'],check=True)
        finally:
            process.terminate();process.wait(timeout=12);http.shutdown();http.server_close()
