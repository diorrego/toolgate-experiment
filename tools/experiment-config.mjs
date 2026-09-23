import {readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {resolve,dirname,isAbsolute} from 'node:path';
import {execFileSync} from 'node:child_process';
export const MODES=['direct','go','rust','go-first','rust-first'];
export const BINARY_MODES=['direct','go-choice-first','rust-choice-first','go-binary-first','rust-binary-first'];
export function modeProfile(mode){
 if(![...MODES,...BINARY_MODES].includes(mode))throw Error('Invalid benchmark mode');
 return {backend:mode==='direct'?'direct':mode.startsWith('go')?'go':'rust',selector:mode.includes('-binary-')?'binary-parallel-v1':'choice'};
}
export function loadConfig(file){
 const path=resolve(file),base=dirname(path),value=JSON.parse(readFileSync(path,'utf8'));
 const local=p=>{if(typeof p!=='string'||!p)throw Error('Invalid configured path');return isAbsolute(p)?p:resolve(base,p);};
 if(value.version!==1||!value.provider||!/^\w[\w-]*$/.test(value.provider.serverName))throw Error('Invalid experiment configuration');
 const url=new URL(value.provider.url);
 if(url.username||url.password||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('MCP requires verified HTTPS or explicit loopback HTTP');
 if(!Array.isArray(value.provider.disableServers)||!value.provider.disableServers.every(x=>/^[\w-]+$/.test(x)&&x!==value.provider.serverName))throw Error('Invalid disabled server list');
 if(!value.provider.modeFile&&!Array.isArray(value.provider.modeCommand))throw Error('A trusted provider mode switch is required');
 if(value.provider.modeCommand&&(!value.provider.modeCommand.length||!value.provider.modeCommand.every(x=>typeof x==='string'&&x.length)))throw Error('Invalid mode command');
 if(value.model!=='gpt-6-astra'||value.effort!=='high')throw Error('This protocol fixes gpt-6-astra/high; model changes require a new experiment and price profile');
 const config={...value,configFile:path,privateDir:local(value.privateDir),corpusFile:local(value.corpusFile),provider:{...value.provider,traceFile:local(value.provider.traceFile),...(value.provider.modeFile?{modeFile:local(value.provider.modeFile)}:{})},pidFiles:Object.fromEntries(Object.entries(value.pidFiles??{}).map(([k,v])=>[k,local(v)])),artifacts:Object.fromEntries(Object.entries(value.artifacts??{}).map(([k,v])=>[k,local(v)]))};
 if(value.experiment!==undefined&&value.experiment!=='binary-parallel-v1')throw Error('Unknown experiment');
 config.modes=value.experiment==='binary-parallel-v1'?BINARY_MODES:MODES;
 if(value.experiment==='binary-parallel-v1')config.provider.selectorModeFile=local(value.provider.selectorModeFile);
 const corpus=JSON.parse(readFileSync(config.corpusFile,'utf8'));
 if(corpus.language!=='en'||corpus.cases?.length!==30||new Set(corpus.cases.map(c=>c.id)).size!==30)throw Error('Expected the fixed 30-question English corpus');
 for(const c of corpus.cases){if(typeof c.question!=='string'||!c.question||typeof c.tool!=='string'||!c.arguments||typeof c.arguments!=='object'||Array.isArray(c.arguments)||JSON.stringify(c).includes('{{'))throw Error('Invalid or unbound corpus case');}
 return {...config,corpus};
}
export function switchMode(config,mode){
 if(!config.modes.includes(mode))throw Error('Invalid benchmark mode');
 const {backend,selector}=modeProfile(mode);
 if(config.provider.selectorModeFile){
  const target=config.provider.selectorModeFile;mkdirSync(dirname(target),{recursive:true,mode:0o700});
  writeFileSync(target+'.next',JSON.stringify({mode:selector}),{mode:0o600});renameSync(target+'.next',target);
 }
 if(config.provider.modeFile){
  const target=config.provider.modeFile;mkdirSync(dirname(target),{recursive:true,mode:0o700});
  writeFileSync(target+'.next',JSON.stringify({mode:backend}),{mode:0o600});renameSync(target+'.next',target);
 }else{
  const args=config.provider.modeCommand.map(x=>x.replaceAll('{backend}',backend));
  try{execFileSync(args[0],args.slice(1),{cwd:dirname(config.configFile),stdio:'ignore',timeout:30000});}catch{throw Error('Provider mode switch failed');}
 }
}
