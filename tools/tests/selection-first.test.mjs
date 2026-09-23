import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareBeforeModel} from '../selection-first.mjs';
const schema = {};
const operation = {status:'needs_arguments',operation_id:'op',revision:1,selected_tool:{tool_id:'read.value',input_schema:schema}};
const result = {content:[{type:'text',text:JSON.stringify(operation)}]};
await test('host sends only the literal question, never expected tool or arguments', async()=>{
 const calls=[];let clock=100;
 const prepared=await prepareBeforeModel({question:'Read record user-id',threadId:'thread',rpc:async(...args)=>{calls.push(args);clock=135;return result;},now:()=>clock,validate:()=>true});
 assert.deepEqual(calls,[['mcpServer/tool/call',{threadId:'thread',server:'benchmark_provider',tool:'prepare_action',arguments:{intent:'Read record user-id',known_arguments:{}}}]]);
 assert.equal(prepared.hostTool.durationMs,35);
 assert.equal(prepared.context.toolgate_preparation.kind,'untrusted');
 assert.deepEqual(JSON.parse(prepared.context.toolgate_preparation.value).operation,operation);
 assert.equal(prepared.hostTool.result,result);
});
await test('invalid preparation fails closed without execution or hidden fallback',async()=>{
 for(const response of [{isError:true,content:[]},{content:[{type:'text',text:'bad json'}]},result]){
  let calls=0;
  await assert.rejects(prepareBeforeModel({question:'Read',threadId:'t',rpc:async()=>{calls++;return response;},now:()=>0,validate:()=>false}));
  assert.equal(calls,1);
 }
});
await test('abstention and ambiguity reach the model unchanged, no invented choice',async()=>{
 for(const status of ['no_match','needs_choice']){
  const op={status};
  const prepared=await prepareBeforeModel({question:'Read',threadId:'t',rpc:async()=>({content:[{type:'text',text:JSON.stringify(op)}]}),now:()=>0,validate:()=>true});
  assert.deepEqual(JSON.parse(prepared.context.toolgate_preparation.value).operation,op);
 }
});

await test('failed host attempts remain in telemetry',async()=>{
 const recorded=[];let tick=0;
 await assert.rejects(prepareBeforeModel({question:'Read',threadId:'t',rpc:async()=>{tick=600;throw Error('secret transport payload');},now:()=>tick,validate:()=>true,onTool:t=>recorded.push(t)}));
 assert.equal(recorded.length,1);assert.equal(recorded[0].durationMs,600);
 assert.equal(recorded[0].status,'failed');assert.deepEqual(recorded[0].error,{code:'HOST_PREPARATION_FAILED'});
 assert.ok(!JSON.stringify(recorded).includes('secret transport payload'));
});
