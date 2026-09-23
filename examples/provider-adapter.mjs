/** Framework-neutral adapter. Mount on the provider's existing authenticated MCP. */
export function createReadOnlySessionAdapter({provider,actor,validateMcp,minimizeIntent}){
 if(!provider||!actor||typeof validateMcp!=='function'||typeof minimizeIntent!=='function')throw Error('Trusted provider dependencies are required');
 const json=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
 const failure=code=>({isError:true,content:[{type:'text',text:JSON.stringify({code})}]});
 return async function call(name,args){
  if(!validateMcp(name,args))return failure('INVALID_REQUEST');
  try{
   if(name==='prepare_action'){
    if(args.intent!==undefined)return json(await provider.prepare(actor,minimizeIntent(args.intent),args.known_arguments));
    return json(await provider.resolve(actor,args.operation_id,args.operation_revision,args.tool_choice,args.known_arguments));
   }
   if(name==='execute_read_action'){
    const value=await provider.executeRead(actor,args);
    return Array.isArray(value?.content)?value:json(value);
   }
   if(name==='execute_write_action')return failure('APPROVAL_REQUIRED');
   return failure('INVALID_REQUEST');
  }catch(error){
   const allowed=['EXECUTION_UNKNOWN','EXECUTION_IN_PROGRESS','AUTHORIZATION_DENIED','APPROVAL_REQUIRED','OPERATION_NOT_FOUND','OPERATION_EXPIRED','DECISION_EXPIRED','REVISION_CONFLICT','AUTHORIZATION_CONTEXT_CHANGED','ARGUMENTS_INVALID','STORE_UNAVAILABLE','TRANSPORT_TIMEOUT'];
   return failure(allowed.includes(error?.code)?error.code:'TOOLGATE_REQUEST_FAILED');
  }
 };
}
