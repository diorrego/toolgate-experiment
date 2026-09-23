/** Host orchestration only. All selection and authorization stay behind MCP. */
export async function prepareBeforeModel({question,threadId,serverName='benchmark_provider',rpc,now,validate,onTool=()=>{}}){
 const started=now();
 const hostTool={type:'mcpToolCall',source:'host',server:serverName,tool:'prepare_action',arguments:{intent:question,known_arguments:{}},status:'failed',result:null,error:null,durationMs:null};
 try{
  const result=await rpc('mcpServer/tool/call',{threadId,server:hostTool.server,tool:hostTool.tool,arguments:hostTool.arguments});
  hostTool.result=result;hostTool.status='completed';
  if(result?.isError||!Array.isArray(result?.content)||result.content.length!==1||result.content[0]?.type!=='text')throw Error('HOST_PREPARATION_INVALID');
  const operation=JSON.parse(result.content[0].text);
  if(!validate(operation))throw Error('HOST_PREPARATION_INVALID');
  return {hostTool,context:{toolgate_preparation:{kind:'untrusted',value:JSON.stringify({server:hostTool.server,tool:hostTool.tool,operation})}}};
 }catch{
  hostTool.error={code:'HOST_PREPARATION_FAILED'};
  throw Error('HOST_PREPARATION_FAILED');
 }finally{
  hostTool.durationMs=now()-started;onTool(hostTool);
 }
}
