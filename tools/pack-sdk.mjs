/** Install an actual tarball into an isolated test consumer, never a provider. */
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const artifacts=resolve(root,'.local/artifacts'),consumer=resolve(root,'.local/consumer');
mkdirSync(artifacts,{recursive:true,mode:0o700});mkdirSync(consumer,{recursive:true,mode:0o700});
execFileSync('npm',['run','build'],{cwd:resolve(root,'sdk-typescript'),stdio:'inherit'});
const [packed]=JSON.parse(execFileSync('npm',['pack','--workspace','@toolgate/sdk','--pack-destination',artifacts,'--json'],{cwd:resolve(root,'sdk-typescript'),encoding:'utf8'}));
writeFileSync(resolve(consumer,'package.json'),JSON.stringify({private:true,type:'module'}));
execFileSync('npm',['install','--ignore-scripts','--no-audit','--no-fund',resolve(artifacts,packed.filename)],{cwd:consumer,stdio:'inherit'});
console.log('SDK tarball consumer installed in .local/consumer');
