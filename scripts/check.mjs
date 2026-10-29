import {readdir,readFile,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=[];
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){if(e.name.startsWith('.')||e.name==='node_modules')continue;const p=dir+'/'+e.name;if(e.isDirectory())await walk(p);else files.push(p);}}
await walk('dist');await walk('scripts');await walk('tests');for(const entry of await readdir('.',{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.mjs'))files.push(entry.name);
let failures=0;
for(const p of files){if(/\.(?:js|mjs)$/.test(p)){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status){console.error(p+': '+r.stderr);failures++;}}
if(/\.(?:html|js|mjs|css|json)$/.test(p)){const text=await readFile(p,'utf8');if(/sk-[a-zA-Z0-9]{20,}/.test(text)){console.error('Credential-like text in '+p);failures++;}}
}
const html=await readFile('dist/index.html','utf8');
for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(?:https?:|data:|\.\/)/.test(m[1]))continue;try{await stat(resolve('dist',m[1]));}catch{console.error('Missing asset: '+m[1]);failures++;}}
for(const file of ['dist/assets/arena.png','dist/assets/sprites.png','dist/assets/barlow-condensed.ttf','dist/assets/FONT-LICENSE.txt'])await stat(file);
if(failures)process.exitCode=1;else console.log(`Checked ${files.length} files: syntax, asset references, and credential scan passed.`);
