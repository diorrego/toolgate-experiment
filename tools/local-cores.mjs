/** Owns only the local test processes it starts; never touches other worktrees. */
import {spawn} from 'node:child_process';
import {createServer as httpsServer} from 'node:https';
import http from 'node:http';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv.includes('--live'))throw Error('Explicit --live required; use deterministic conformance for offline tests');
const cfg=JSON.parse(readFileSync(resolve(root,'.local/lab.json'),'utf8'));
const keys=parseEnv(readFileSync(resolve(root,'.env'),'utf8'));
if(!keys.TYPESAFE_AI_API_KEY)throw Error('Set TYPESAFE_AI_API_KEY in the private .env file');
const children=[];const servers=[];const agents=[];
const allowed=/^Cpus_allowed_list:\s+(.+)$/m.exec(readFileSync('/proc/self/status','utf8'))[1];
const cpus=allowed.split(',').flatMap(part=>{const[a,b]=part.split('-').map(Number);return Array.from({length:(b??a)-a+1},(_,i)=>a+i);}).slice(0,2).join(',');
function launch(name,binary,args,env,cwd=root){
 const child=spawn(binary,args,{cwd,env,stdio:['ignore','pipe','pipe']});children.push(child);
 const secrets=[cfg.admin_password,cfg.runtime_password,cfg.provider_password,cfg.pepper,...Object.values(cfg.keys),keys.TYPESAFE_AI_API_KEY,...Object.entries(env).filter(([k])=>/SECRET|KEY|MONGO_URI|PASSWORD|DB_NAME|MONGODB_DB/.test(k)).map(([,v])=>v)].filter(v=>typeof v==='string'&&v.length>3);
 for(const stream of [child.stdout,child.stderr])createInterface({input:stream}).on('line',line=>{for(const value of secrets)line=line.replaceAll(value,'[redacted]');appendFileSync(resolve(root,'.local/'+name+'.log'),line+'\n',{mode:0o600});});
 child.on('error',()=>{console.error(name+' failed to start');shutdown();});
 child.on('exit',code=>{if(!stopping){console.error(name+' exited '+String(code));shutdown();}});
 return child;
}
let stopping=false;
function shutdown(){if(stopping)return;stopping=true;for(const server of servers)server.close();for(const agent of agents)agent.destroy();for(const child of children)child.kill('SIGTERM');const timeout=setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');},11000);timeout.unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
{
 writeFileSync(resolve(root,'.local/core-proxy.pid'),String(process.pid),{mode:0o600});
 for(const [index,name]of ['go','rust'].entries()){
  const env={...process.env,TOOLGATE_LISTEN_ADDR:'127.0.0.1:'+String(9081+index),TOOLGATE_DATABASE_URL:`postgres://tg_runtime:${cfg.runtime_password}@127.0.0.1:${cfg.port??55439}/toolgate_${name}?sslmode=disable`,TOOLGATE_KEY_PEPPER:cfg.pepper,TYPESAFE_AI_API_KEY:keys.TYPESAFE_AI_API_KEY,TOOLGATE_JEV_MODEL:'jev-1.13.0',TOOLGATE_CONNECT_TIMEOUT_MS:'1000',TOOLGATE_JEV_BASE_URL:'https://api.typesafe.ai/v1/systemone'};
  const binary=resolve(root,name==='go'?'backend-go/bin/toolgate':'backend-rust/target/release/toolgate-core');
  const child=launch('core-'+name,'taskset',['-c',cpus,binary],env);writeFileSync(resolve(root,`.local/core-${name}.pid`),String(child.pid),{mode:0o600});
  const agent=new http.Agent({keepAlive:true,maxSockets:16,maxFreeSockets:16});agents.push(agent);
  const server=httpsServer({key:readFileSync(resolve(root,'.local/tls/key.pem')),cert:readFileSync(resolve(root,'.local/tls/cert.pem'))},(incoming,outgoing)=>{
    const start=performance.now();const upstream=http.request({hostname:'127.0.0.1',port:9081+index,path:incoming.url,method:incoming.method,headers:incoming.headers,agent},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
    upstream.setTimeout(4000,()=>upstream.destroy());incoming.on('aborted',()=>upstream.destroy());outgoing.on('close',()=>{if(!outgoing.writableFinished)upstream.destroy();});
    upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(503,{'Content-Type':'application/json'});outgoing.end(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message_key:'toolgate.error.service_unavailable',retryable:false,request_id:'local-proxy'}}));});
    outgoing.on('finish',()=>appendFileSync(resolve(root,'.local/core-proxy-traces.jsonl'),JSON.stringify({kind:'tls_proxy',core:name,durationMs:performance.now()-start,status:outgoing.statusCode})+'\n',{mode:0o600}));incoming.pipe(upstream);
  });server.requestTimeout=4500;server.headersTimeout=3000;server.listen(9441+index,'127.0.0.1');servers.push(server);
 }
 console.log('Core processes and verified-TLS local endpoints starting');
}
