/** Own four fixed-profile cores; route between completed questions via trusted local state. */
import {spawn} from 'node:child_process';
import {createServer} from 'node:https';
import http from 'node:http';
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {createInterface} from 'node:readline';
import {resolve,dirname} from 'node:path';
if(!process.argv.includes('--live'))throw Error('Explicit --live required');
const configFile=process.argv.find(v=>v.startsWith('--config='))?.slice(9);
if(!configFile)throw Error('Pass a private --config file');
const base=dirname(resolve(configFile)),config=JSON.parse(readFileSync(configFile,'utf8'));
const path=value=>resolve(base,value);
const cfg=JSON.parse(readFileSync(path(config.stateFile),'utf8'));
const keys=parseEnv(readFileSync(path(config.apiKeyFile),'utf8'));
if(!keys.TYPESAFE_AI_API_KEY)throw Error('Missing selector credential');
const privateDir=path(config.privateDir);mkdirSync(privateDir,{recursive:true,mode:0o700});
const allowed=/^Cpus_allowed_list:\s+(.+)$/m.exec(readFileSync('/proc/self/status','utf8'))[1];
const cpus=allowed.split(',').flatMap(part=>{const[a,b]=part.split('-').map(Number);return Array.from({length:(b??a)-a+1},(_,i)=>a+i);}).slice(0,2).join(',');
const children=[],servers=[],agents=[];let stopping=false;
function shutdown(){if(stopping)return;stopping=true;for(const server of servers)server.close();for(const agent of agents)agent.destroy();for(const child of children)child.kill('SIGTERM');setTimeout(()=>{for(const child of children)if(child.exitCode===null)child.kill('SIGKILL');},11000).unref();}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,shutdown);
const secrets=[keys.TYPESAFE_AI_API_KEY,cfg.admin_password,cfg.runtime_password,cfg.provider_password,cfg.pepper,...Object.values(cfg.keys)];
writeFileSync(resolve(privateDir,'proxy.pid'),String(process.pid),{mode:0o600});
for(const [index,language] of ['go','rust'].entries()){
 for(const [offset,profile] of [[0,'choice'],[2,'binary-parallel-v1']]){
  const env={...process.env,TOOLGATE_LISTEN_ADDR:'127.0.0.1:'+String(9081+index+offset),TOOLGATE_DATABASE_URL:`postgres://tg_runtime:${cfg.runtime_password}@127.0.0.1:${cfg.port??55439}/toolgate_${language}?sslmode=disable`,TOOLGATE_KEY_PEPPER:cfg.pepper,TYPESAFE_AI_API_KEY:keys.TYPESAFE_AI_API_KEY,TOOLGATE_JEV_MODEL:'jev-1.13.0',TOOLGATE_CONNECT_TIMEOUT_MS:'1000',TOOLGATE_JEV_BASE_URL:'https://api.typesafe.ai/v1/systemone',TOOLGATE_SELECTOR_MODE:profile};
  const name=language+(offset?'-binary':'-choice');
  const child=spawn('taskset',['-c',cpus,path(config.artifacts[language])],{env,stdio:['ignore','pipe','pipe']});children.push(child);
  writeFileSync(resolve(privateDir,name+'.pid'),String(child.pid),{mode:0o600});
  for(const stream of [child.stdout,child.stderr])createInterface({input:stream}).on('line',line=>{for(const secret of secrets)line=line.replaceAll(secret,'[redacted]');appendFileSync(resolve(privateDir,name+'.log'),line+'\n',{mode:0o600});});
  child.on('error',()=>{console.error(name+' failed to start');shutdown();});child.on('exit',code=>{if(!stopping){console.error(name+' exited '+code);shutdown();}});
 }
 const agent=new http.Agent({keepAlive:true,maxSockets:16,maxFreeSockets:16});agents.push(agent);
 const server=createServer({key:readFileSync(path(config.tlsKeyFile)),cert:readFileSync(path(config.tlsCertFile))},(incoming,outgoing)=>{
  let profile;
  try{profile=JSON.parse(readFileSync(path(config.selectorModeFile),'utf8')).mode;if(!['choice','binary-parallel-v1'].includes(profile))throw Error('Invalid selector profile');}
  catch{outgoing.writeHead(503,{'Content-Type':'application/json'});outgoing.end(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message_key:'toolgate.error.service_unavailable',retryable:false,request_id:'local-proxy'}}));return;}
  const started=performance.now();
  const upstream=http.request({hostname:'127.0.0.1',port:9081+index+(profile==='choice'?0:2),path:incoming.url,method:incoming.method,headers:incoming.headers,agent},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
  upstream.setTimeout(4000,()=>upstream.destroy());incoming.on('aborted',()=>upstream.destroy());outgoing.on('close',()=>{if(!outgoing.writableFinished)upstream.destroy();});
  upstream.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(503,{'Content-Type':'application/json'});outgoing.end(JSON.stringify({error:{code:'SERVICE_UNAVAILABLE',message_key:'toolgate.error.service_unavailable',retryable:false,request_id:'local-proxy'}}));});
  outgoing.on('finish',()=>appendFileSync(resolve(privateDir,'proxy-traces.jsonl'),JSON.stringify({kind:'tls_proxy',core:language,profile,durationMs:performance.now()-started,status:outgoing.statusCode})+'\n',{mode:0o600}));incoming.pipe(upstream);
 });
 server.requestTimeout=4500;server.headersTimeout=3000;server.on('error',()=>{console.error('TLS listener failed');shutdown();});server.listen(9441+index,'127.0.0.1');servers.push(server);
}
console.log('Four fixed-profile cores starting; verified local TLS and trusted routing enabled');
