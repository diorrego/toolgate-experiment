import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
export function bindCorpus(corpus,bindings){
 const walk=value=>typeof value==='string'?value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g,(_,key)=>{
  if(typeof bindings[key]!=='string'||!bindings[key])throw Error('A required corpus binding is missing');
  return bindings[key];
 }):Array.isArray(value)?value.map(walk):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v)])):value;
 return walk(corpus);
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [input,bindings,output]=process.argv.slice(2);
 if(!input||!bindings||!output)throw Error('Usage: node tools/bind-corpus.mjs corpus.json private-bindings.json private-output.json');
 const result=bindCorpus(JSON.parse(readFileSync(input,'utf8')),JSON.parse(readFileSync(bindings,'utf8')));
 mkdirSync(dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log('Bound corpus written privately; identifiers were not printed');
}
