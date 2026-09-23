import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,appendFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(process.env.TOOLGATE_SDK_CONSUMER??resolve(root,'.local/consumer/package.json'));
const {RemoteClient,ToolRegistry,ToolgateProvider,PostgresStore}=require('@toolgate/sdk');
const cfg=JSON.parse(readFileSync(process.env.TOOLGATE_LAB_STATE??resolve(root,'.local/lab.json'),'utf8'));
const childMode=process.argv[2]==='--child';
const state=childMode?JSON.parse(readFileSync(process.argv[3],'utf8')):{base:process.argv[2],integration:'fixture-'+randomUUID(),actor:{principal_ref:'synthetic-a',workspace_ref:'workspace-a',authorization_revision:'policy-a',allowed_tool_ids:['read.value']},counter:resolve(root,'.local/sdk-count-'+randomUUID())};
const tool={tool_id:'read.value',name:'read.value',title:'Read value',description:'Read a synthetic value',aliases:[],tags:[],effect:'read',open_world:false,input_schema:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false},schema_profile:'tg-jsonschema-1'};
const registry=new ToolRegistry([{metadata:tool,handler:async(args)=>{appendFileSync(state.counter,'dispatch\n',{mode:0o600});return{content:[{type:'text',text:JSON.stringify({value:args.name})}]};}}]);
const metrics=[];
const client=new RemoteClient({baseUrl:state.base,apiKey:()=>Promise.resolve(cfg.keys.runtime),contractVersion:'0.1',allowInsecureLocalhost:true},{onRequest:metric=>metrics.push(metric)});
const store=new PostgresStore(state.integration,`postgres://tg_provider:${cfg.provider_password}@127.0.0.1:${cfg.port??55439}/toolgate_sdk?sslmode=disable`);
let authorization=true;let authorizations=0;
const provider=new ToolgateProvider({catalogId:'sdk-fixture',registry,client,store,authorize:async()=>{authorizations++;return authorization;}});
const count=()=>{try{return readFileSync(state.counter,'utf8').trim().split('\n').filter(Boolean).length;}catch{return 0;}};
try{
 if(childMode){try{const result=await provider.executeRead(state.actor,state.input);console.log(JSON.stringify({ok:true,result}));}catch(error){console.log(JSON.stringify({ok:false,code:error.code??'UNKNOWN'}));}}
 else{
  const admin=new RemoteClient({baseUrl:state.base,apiKey:()=>Promise.resolve(cfg.keys.admin),contractVersion:'0.1',allowInsecureLocalhost:true});
  try{await provider.bootstrap(admin);}finally{admin.close();}
  const view=await provider.prepare(state.actor,'read value',{name:'synthetic'});assert.equal(view.status,'ready');assert.equal(count(),0);
  const hop=metrics.find(m=>m.path==='/v1/operations')?.hops[0];assert.equal(hop?.jevUsageCalls,1);assert.equal(hop?.jevInputTokens,123);assert.equal(hop?.jevOutputTokens,7);
  const input={operation_id:view.operation_id,operation_revision:view.revision,arguments:{name:'synthetic'}};
  const result=await provider.executeRead(state.actor,input);assert.equal(count(),1);assert.deepEqual(await provider.executeRead(state.actor,input),result);assert.equal(count(),1);
  await assert.rejects(provider.executeRead({...state.actor,principal_ref:'synthetic-other'},input));assert.equal(count(),1);
  await assert.rejects(provider.executeRead(state.actor,{...input,arguments:{name:'changed'}}));assert.equal(count(),1);
  authorization=false;await assert.rejects(provider.executeRead(state.actor,input));authorization=true;assert.equal(count(),1);
  const invalid=await provider.prepare(state.actor,'read value',{});assert.equal(invalid.status,'needs_arguments');assert.equal(count(),1);
  const repaired=await provider.executeRead(state.actor,{operation_id:invalid.operation_id,operation_revision:invalid.revision,arguments:{name:'repaired'}});assert.ok(repaired.content);assert.equal(count(),2);
  const runChild=async(input)=>{
   const path=resolve(root,'.local/sdk-child-'+randomUUID()+'.json');writeFileSync(path,JSON.stringify({...state,input}),{mode:0o600});
   return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--child',path],{stdio:['ignore','pipe','pipe']});let output='';let error='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{error+=chunk});child.on('exit',code=>{if(code!==0)reject(Error('Synthetic child failed: '+error.slice(0,300)));else{try{resolve(JSON.parse(output))}catch{reject(Error('Invalid child result'))}}});});
  };
  const replay=await runChild(input);assert.equal(replay.ok,true);assert.equal(count(),2);
  const concurrent=await provider.prepare(state.actor,'read value',{name:'parallel'});const concurrentInput={operation_id:concurrent.operation_id,operation_revision:concurrent.revision,arguments:{name:'parallel'}};
  const children=await Promise.all([runChild(concurrentInput),runChild(concurrentInput)]);assert.ok(children.some(c=>c.ok));assert.equal(count(),3);
  console.log(JSON.stringify({passed:true,checks:['jev_usage_over_http','prepare_no_dispatch','local_dispatch','durable_replay','actor_isolation','argument_binding','revoked_authorization','needs_arguments','repair_without_reselection','process_restart_replay','two_process_claim'],handler_invocations:count(),authorizations,child_outcomes:children.map(c=>({ok:c.ok,code:c.code}))},null,2));
 }
}finally{client.close();await store.close();}
