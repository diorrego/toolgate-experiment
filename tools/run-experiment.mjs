/** Five-condition, serial, counterbalanced experiment. No business-data output. */
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import {loadConfig,switchMode,modeProfile} from './experiment-config.mjs';
import {stopReason} from './run-safety.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const configArg=process.argv.find(v=>v.startsWith('--config='))?.slice(9);
if(!configArg)throw Error('Pass --config=path/to/private-config.json');
const config=loadConfig(configArg);
const MODES=config.modes;
if(!process.argv.includes('--allow-paid'))throw Error('Explicit --allow-paid is required for live model/provider calls');
const codex=execFileSync('codex',['--version'],{encoding:'utf8'}).trim();
if(codex!=='codex-cli 0.155.1')throw Error('This protocol requires Codex CLI 0.155.1');
mkdirSync(config.privateDir,{recursive:true,mode:0o700});
const resumed=process.argv.find(v=>v.startsWith('--resume='))?.slice(9);
if(resumed&&!/^[A-Za-z0-9_-]+$/.test(resumed))throw Error('Invalid run identifier');
const runId=resumed??new Date().toISOString().replace(/[:.]/g,'-');
const path=resolve(config.privateDir,`experiment-${runId}.json`);
const digest=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const core of ['go','rust']){
 if(config.pidFiles[core]&&config.artifacts[core]){
  const pid=readFileSync(config.pidFiles[core],'utf8').trim();
  if(!/^\d+$/.test(pid)||digest(`/proc/${pid}/exe`)!==digest(config.artifacts[core]))throw Error(`Running ${core} differs from the configured artifact`);
 }
}
const hashes={runSafety:digest(resolve(root,'tools/run-safety.mjs')),...Object.fromEntries(Object.entries(config.artifacts).map(([k,v])=>[k,digest(v)])),corpus:digest(config.corpusFile),config:digest(config.configFile),configurationLoader:digest(resolve(root,'tools/experiment-config.mjs')),wireContract:digest(resolve(root,'shared/openapi.yaml')),repositoryContract:digest(resolve(root,'shared/contract.lock.json')),runner:digest(resolve(root,'tools/agent-benchmark.mjs')),host:digest(resolve(root,'tools/selection-first.mjs')),master:digest(fileURLToPath(import.meta.url)),pricing:digest(resolve(root,'tools/api-pricing-2026-09-23.json'))};
let report=resumed?JSON.parse(readFileSync(path,'utf8')):{runId,startedAt:new Date().toISOString(),state:'running',language:'en',experiment:config.experiment??'selection-first',modes:MODES,expectedPerMode:30,order:'per-question cyclic Latin square, serial; one sample per question and condition',primaryBoundary:'question submission BEFORE host prepare/turn start to complete final answer',hashes,environment:{node:process.version,codex,platform:os.platform(),release:os.release(),arch:os.arch(),cpu:os.cpus()[0].model,totalMemoryBytes:os.totalmem(),concurrency:1,...config.environment,jevModel:'jev-1.13.0',model:config.model,effort:config.effort,resourceMeasurement:'agentHost measures only the npm launcher; native worker tree and remote model resources are unmeasured',pricingBasis:'Standard API equivalent; actual invoice unobserved'},cases:config.corpus.cases,argumentDefaults:config.corpus.argumentDefaults??{},ignoredArgumentRules:config.corpus.ignoredArgumentRules??[],records:[]};
if(resumed&&report.state==='finished')throw Error('Cannot resume a finished experiment');
if(JSON.stringify(report.hashes)!==JSON.stringify(hashes)||JSON.stringify(report.modes)!==JSON.stringify(MODES))throw Error('Cannot resume after artifact/configuration drift');
const save=()=>writeFileSync(path,JSON.stringify(report,null,2),{mode:0o600});save();
console.log(JSON.stringify({runId,expected:150,privateReport:path}));
let stopped=false,active;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopped=true;active?.kill('SIGTERM');report.state='interrupted';save();});
async function run(mode,id){
 return new Promise(resolveResult=>{
  let out='',err='';
  active=spawn(process.execPath,[resolve(root,'tools/agent-benchmark.mjs'),mode,'--case='+id,'--config='+config.configFile,'--allow-paid'],{cwd:root,stdio:['ignore','pipe','pipe']});
  active.stdout.on('data',v=>{out+=v});active.stderr.on('data',v=>{err+=v});
  active.on('exit',code=>{
   const match=/Private report: (.+)/.exec(out);
   if(match){try{const child=JSON.parse(readFileSync(match[1].trim(),'utf8'));const record=child.records[0];if(record){resolveResult({mode,...record,toolInventory:child.toolInventory,model:child.resolvedModel,requestedModel:child.model,effort:child.effort,bootstrapMs:child.bootstrapMs,childFile:match[1].trim()});return;}}catch{}}
   const errorFile=resolve(config.privateDir,`error-${runId}-${id}-${mode}.log`);writeFileSync(errorFile,err,{mode:0o600});
   resolveResult({mode,caseId:id,status:stopped?'interrupted':'runner_failed',answerCompleteMs:null,turnCompleteMs:null,exitCode:code,finalAnswer:null,tools:[],hostTools:[],errorFile});
  });
 });
}
try{
 outer:for(let i=0;i<config.corpus.cases.length;i++){
  const item=config.corpus.cases[i];
  for(let j=0;j<MODES.length;j++){
   if(stopped)break outer;
   const mode=MODES[(i+j)%MODES.length];
   if(report.records.some(r=>r.mode===mode&&r.caseId===item.id))continue;
   const record=await run(mode,item.id);report.records.push(record);save();
   if(config.experiment==='binary-parallel-v1'&&mode!=='direct'){
    const hops=(record.trace??[]).filter(e=>e.kind==='sdk_remote').flatMap(e=>e.hops??[]).filter(h=>h.jevCalls>0);
    record.selectorProfileVerified=hops.length?hops.every(h=>h.selectorProfile===modeProfile(mode).selector):null;
    if(record.selectorProfileVerified===false){stopped=true;report.stopReason='SELECTOR_PROFILE_DRIFT';save();break outer;}
    save();
   }
   console.log(JSON.stringify({completed:report.records.length,total:150,case:item.id,mode,status:record.status,answerMs:record.answerCompleteMs,hostTools:record.hostTools?.length??0,tools:record.tools.length,errors:[...(record.hostTools??[]),...record.tools].filter(t=>t.status!=='completed'||t.error||t.result?.isError).length}));
   const reason=stopReason(record);
   if(reason){stopped=true;report.stopReason=reason;break outer;}
  }
 }
 report.state=stopped?'interrupted':'finished';report.finishedAt=new Date().toISOString();save();
}finally{switchMode(config,'direct');}
console.log(JSON.stringify({runId,state:report.state,records:report.records.length,privateReport:path}));
