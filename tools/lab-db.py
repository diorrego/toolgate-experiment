"""Provision only the dedicated local Toolgate test container and databases."""
import hashlib,hmac,json,os,secrets,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
STATE=Path(os.environ.get('TOOLGATE_LAB_STATE',str(ROOT/'.local/lab.json')))
PORT=int(os.environ.get('TOOLGATE_LAB_PORT','55439'))
CONTAINER=os.environ.get('TOOLGATE_LAB_CONTAINER','toolgate-repro-pg')
IMAGE='postgres:17.11-alpine'
def command(args, **kwargs):
    return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,**kwargs).stdout

def main():
    if len(sys.argv)!=2 or sys.argv[1]!='init':raise SystemExit('Usage: python3 tools/lab-db.py init')
    if STATE.exists():
        print('Existing lab configuration retained; no migrations or seeds repeated.');return
    cfg={'image':IMAGE,'port':PORT,'container':CONTAINER,'admin_password':secrets.token_hex(32),'runtime_password':secrets.token_hex(32),'provider_password':secrets.token_hex(32),'pepper':secrets.token_hex(32),'keys':{}}
    for name in ['admin','runtime','other']:
        cfg['keys'][name]=secrets.token_hex(8)+'.'+secrets.token_hex(32)
    env={**os.environ,'POSTGRES_PASSWORD':cfg['admin_password']}
    command(['docker','run','-d','--name',CONTAINER,'--cpus=2','--memory=768m','-p',f'127.0.0.1:{PORT}:5432','--env','POSTGRES_PASSWORD','--health-cmd','pg_isready -U postgres','--health-interval','1s','--health-retries','30',IMAGE],env=env)
    import time
    for _ in range(30):
        ready=subprocess.run(['docker','exec',CONTAINER,'pg_isready','-U','postgres'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if ready.returncode==0:break
        time.sleep(1)
    else:raise RuntimeError('Test PostgreSQL not ready')
    def sql(db,body):command(['docker','exec','-i',CONTAINER,'psql','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1'],input=body.encode())
    sql('postgres',f"CREATE ROLE tg_runtime LOGIN PASSWORD '{cfg['runtime_password']}' NOSUPERUSER NOBYPASSRLS; CREATE ROLE tg_provider LOGIN PASSWORD '{cfg['provider_password']}' NOSUPERUSER NOBYPASSRLS;")
    for db in ['toolgate_go','toolgate_rust','toolgate_sdk']:
        command(['docker','exec',CONTAINER,'createdb','-U','postgres',db])
        if db=='toolgate_sdk':sql(db,(ROOT/'sdk-typescript/sql/001_ledger.sql').read_text());continue
        sql(db,(ROOT/'shared/migrations/001_core.sql').read_text())
        seed="INSERT INTO tg.tenants VALUES ('tenant-a',true),('tenant-b',true); INSERT INTO tg.projects VALUES ('tenant-a','project-a'),('tenant-b','project-b'); INSERT INTO tg.integrations VALUES ('scope-a','tenant-a','project-a','integration-a',true,true),('scope-b','tenant-b','project-b','integration-b',true,true);"
        for name,key in cfg['keys'].items():
            ident,secret=key.split('.')
            digest=hmac.new(cfg['pepper'].encode(),secret.encode(),hashlib.sha256).hexdigest()
            scope='scope-b' if name=='other' else 'scope-a'
            scopes="ARRAY['catalog:write','catalog:read','runtime']" if name=='admin' else "ARRAY['catalog:read','runtime']"
            seed+=f"INSERT INTO tg.service_keys VALUES ('{ident}','{digest}','{scope}',{scopes},false);"
        sql(db,seed)
    STATE.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    fd=os.open(STATE,os.O_CREAT|os.O_WRONLY|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f:json.dump(cfg,f)
    print(f'Dedicated PostgreSQL ready on port {PORT}; three test databases with scoped roles. Secrets are stored only in the private state file.')
if __name__=='__main__':
    try:main()
    except Exception:
        print('Lab provisioning failed; inspect container state without printing secrets.',file=sys.stderr);raise SystemExit(1)
