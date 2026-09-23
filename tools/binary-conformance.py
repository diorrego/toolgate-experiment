"""Real HTTP/PostgreSQL checks for bounded binary-parallel selection, without paid calls."""
import argparse, hashlib, http.server, importlib.util, json, os, subprocess, threading, time, urllib.error, urllib.request, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('conformance',ROOT/'tools/core-conformance.py');base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)

class Server(http.server.ThreadingHTTPServer):
    request_queue_size=64

class Binary(http.server.BaseHTTPRequestHandler):
    condition=threading.Condition();active=0;peak=0;calls=0;invalid=False
    barrier=None;release=threading.Event()
    def log_message(self,*args):pass
    @classmethod
    def reset(cls):
        with cls.condition:
            if not cls.condition.wait_for(lambda:cls.active==0,timeout=3):raise AssertionError('Fixture requests did not finish')
            cls.active=0;cls.peak=0;cls.calls=0;cls.invalid=False;cls.barrier=threading.Barrier(22);cls.release=threading.Event()
    def do_POST(self):
        cls=type(self)
        body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        intent=body['state']['intent'];criteria=body['questions']['selection']['criteria']
        with cls.condition:
            cls.active+=1;cls.peak=max(cls.peak,cls.active);cls.calls+=1
            cls.invalid |= set(criteria)!={'none','t0001'} or 'FORBIDDEN_METADATA' in json.dumps(body)
        try:
            cls.barrier.wait(timeout=3)
            if 'timeout' in intent:cls.release.wait(timeout=5)
            title=criteria['t0001'].split(' | ')[0]
            yes=title=='Tool00' or ('ambiguous' in intent and title=='Tool01')
            if 'none' in intent:yes=False
            p=.95 if yes else .1
            response={'model':'jev-fixture','usage':{'input_tokens':123,'output_tokens':7},'answers':{'selection':{'type':'choice','choice':'t0001' if yes else 'none','confidence':1,'probabilities':{'t0001':p,'none':1-p}}}}
            if 'invalid' in intent and title=='Tool00':response['answers']['selection']['probabilities']['none']=.4
            raw=json.dumps(response).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        except (BrokenPipeError,ConnectionResetError,threading.BrokenBarrierError):pass
        finally:
            with cls.condition:cls.active-=1;cls.condition.notify_all()

def run(mode):
    cfg=json.loads(Path(os.environ.get('TOOLGATE_LAB_STATE',str(ROOT/'.local/lab.json'))).read_text())
    selector=Server(('127.0.0.1',0),Binary);threading.Thread(target=selector.serve_forever,daemon=True).start()
    port=19181 if mode=='go' else 19182;origin=f'http://127.0.0.1:{port}'
    env={**os.environ,'TOOLGATE_LISTEN_ADDR':f'127.0.0.1:{port}','TOOLGATE_DATABASE_URL':f"postgres://tg_runtime:{cfg['runtime_password']}@127.0.0.1:{cfg.get('port',55439)}/toolgate_{mode}?sslmode=disable",'TOOLGATE_KEY_PEPPER':cfg['pepper'],'TOOLGATE_JEV_BASE_URL':f'http://127.0.0.1:{selector.server_port}/v1/systemone','TYPESAFE_AI_API_KEY':'synthetic','TOOLGATE_JEV_MODEL':'jev-fixture','TOOLGATE_SELECTOR_MODE':'binary-parallel-v1'}
    binary=ROOT/('backend-go/bin/toolgate' if mode=='go' else 'backend-rust/target/release/toolgate-core')
    log_dir=ROOT/('verification' if (ROOT/'verification').exists() else 'evidence');log_dir.mkdir(exist_ok=True)
    checks=[]
    def check(name,condition):
        if not condition:raise AssertionError(name)
        checks.append(name)
    def call(path,body,key=None,method='POST',idem=None):
        headers={'Authorization':'Bearer '+(key or cfg['keys']['runtime']),'Content-Type':'application/json','X-Toolgate-Contract':'0.1'}
        if idem:headers['Idempotency-Key']=idem
        request=urllib.request.Request(origin+path,data=json.dumps(body).encode(),headers=headers,method=method)
        try:response=urllib.request.urlopen(request,timeout=6)
        except urllib.error.HTTPError as error:response=error
        with response:
            value=json.load(response);base.validate_wire(response.status,value,path,method)
            return response.status,value,response.headers
    with (log_dir/f'{mode}-binary-conformance-server.log').open('w') as log:
        core=subprocess.Popen([str(binary)],env=env,stdout=log,stderr=log)
        try:
            for _ in range(60):
                try:
                    with urllib.request.urlopen(origin+'/health/live',timeout=.2):break
                except OSError:
                    if core.poll() is not None:raise RuntimeError('Core startup failed')
                    time.sleep(.1)
            tools=[{'tool_id':f'tool{i:02}','name':f'tool{i:02}','title':f'Tool{i:02}','description':'Read a synthetic value','aliases':[],'tags':[],'effect':'read','open_world':False,'input_schema':{'type':'object','properties':{'name':{'type':'string'}},'required':['name'],'additionalProperties':False},'schema_profile':'tg-jsonschema-1'} for i in range(22)]
            forbidden={**tools[0],'tool_id':'zzz_forbidden','name':'zzz_forbidden','title':'FORBIDDEN_METADATA'}
            upload={'schema_profile':'tg-jsonschema-1','tools':tools+[forbidden]};version=hashlib.sha256(base.canonical(upload).encode()).hexdigest()
            check('publish',call('/v1/catalogs/binary-fixture/versions/'+version,upload,cfg['keys']['admin'],'PUT')[0]==200)
            actor={'principal_ref':'actor-a','workspace_ref':'workspace-a','authorization_revision':'policy-1','allowed_tool_ids':[t['tool_id'] for t in tools]}
            request={'catalog_id':'binary-fixture','catalog_version':version,'actor':actor,'intent':'parallel winner','known_arguments':{'name':'synthetic'}}
            Binary.reset();idem=str(uuid.uuid4());status,view,headers=call('/v1/operations',request,idem=idem)
            check('parallel ready',status==201 and view.get('status')=='ready' and view['selected_tool']['tool_id']=='tool00')
            check('22 actual HTTP calls',Binary.calls==22)
            check('one authorized tool per call',not Binary.invalid)
            check('22 in-flight requests before release',Binary.peak==22 and headers.get('x-toolgate-jev-max-concurrent')=='22')
            check('all usage measured',headers.get('x-toolgate-jev-calls')=='22' and headers.get('x-toolgate-jev-usage-calls')=='22' and headers.get('x-toolgate-jev-input-tokens')==str(22*123))
            check('overlap measured separately',float(headers['x-toolgate-selector-ms'])>0 and float(headers['x-toolgate-jev-ms'])>float(headers['x-toolgate-selector-ms']))
            replay=call('/v1/operations',request,idem=idem);check('idempotency does not fan out again',replay[1]==view and replay[2].get('x-toolgate-jev-calls')=='0' and Binary.calls==22)
            decision=call('/v1/operations/'+view['operation_id']+'/execution-decisions',{'actor':actor,'expected_revision':1,'arguments':{'name':'synthetic'}},idem=str(uuid.uuid4()))
            check('decision does not infer',decision[1]['status']=='decision_issued' and decision[2].get('x-toolgate-jev-calls')=='0')
            denied=call('/v1/operations',{**request,'actor':{**actor,'allowed_tool_ids':[]}},idem=str(uuid.uuid4()))
            check('no authorized tools means no requests',denied[1]['status']=='no_match' and denied[2].get('x-toolgate-jev-calls')=='0')
            for scenario in ['ambiguous','none','invalid','timeout']:
                Binary.reset()
                try:status,result,h=call('/v1/operations',{**request,'intent':'parallel '+scenario},idem=str(uuid.uuid4()))
                finally:Binary.release.set()
                check(scenario+' counts all attempts',h.get('x-toolgate-jev-calls')=='22' and Binary.calls==22)
                if scenario=='ambiguous':
                    check('stable ambiguity',status==201 and result['status']=='needs_choice' and [c['tool_id'] for c in result['candidates']]==['tool00','tool01'])
                    resolved=call('/v1/operations/'+result['operation_id']+'/resolve',{'actor':actor,'expected_revision':1,'tool_choice':'tool01','arguments':{'name':'synthetic'}},idem=str(uuid.uuid4()))
                    check('resolve without 22 new calls',resolved[1]['selected_tool']['tool_id']=='tool01' and resolved[2].get('x-toolgate-jev-calls')=='0')
                elif scenario=='none':check('abstains',status==201 and result['status']=='no_match')
                elif scenario=='invalid':check('one invalid response rejects entire batch',status==502 and result['error']['code']=='SELECTOR_INVALID_RESPONSE')
                else:check('timeout preserves unknown usage',status==504 and h.get('x-toolgate-jev-usage-calls')=='0')
            print(json.dumps({'core':mode,'passed':True,'fixture_only':True,'checks':checks,'count':len(checks)},indent=2))
        finally:
            Binary.release.set();core.terminate();core.wait(timeout=12);selector.shutdown();selector.server_close()

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('core',choices=['go','rust']);run(parser.parse_args().core)
