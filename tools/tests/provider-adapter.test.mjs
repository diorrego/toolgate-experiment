import assert from 'node:assert/strict';
import test from 'node:test';
import {createReadOnlySessionAdapter} from '../../examples/provider-adapter.mjs';
await test('adapter preserves trusted identity, separates preparation and execution, and rejects writes',async()=>{
 const actor={principal_ref:'trusted'};const calls=[];
 const provider={prepare:async(...args)=>{calls.push(['prepare',...args]);return{status:'ready'};},executeRead:async(...args)=>{calls.push(['execute',...args]);return{content:[{type:'text',text:'synthetic'}]};}};
 const call=createReadOnlySessionAdapter({provider,actor,validateMcp:(_name,args)=>!('actor'in args),minimizeIntent:value=>value});
 assert.equal((await call('prepare_action',{intent:'Read',known_arguments:{}})).isError,undefined);
 assert.equal(calls.length,1);assert.equal(calls[0][1],actor);
 assert.equal((await call('execute_read_action',{operation_id:'op',operation_revision:1,arguments:{}})).content[0].text,'synthetic');
 assert.equal((await call('execute_read_action',{actor:{principal_ref:'forged'}})).isError,true);
 assert.equal((await call('execute_write_action',{})).isError,true);assert.equal(calls.length,2);
});
await test('adapter reports uncertain execution without exposing arbitrary exception text',async()=>{
 const provider={executeRead:async()=>{throw{code:'EXECUTION_UNKNOWN',message:'PRIVATE_SECRET'};}};
 const call=createReadOnlySessionAdapter({provider,actor:{},validateMcp:()=>true,minimizeIntent:x=>x});
 const result=await call('execute_read_action',{});assert.equal(result.isError,true);
 assert.equal(JSON.parse(result.content[0].text).code,'EXECUTION_UNKNOWN');assert.ok(!JSON.stringify(result).includes('PRIVATE_SECRET'));
});
