import { mkdtemp, cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
const repo=process.cwd();
const prepared=process.argv[2]!=='original';
const dir=await mkdtemp(join(tmpdir(),'proveedor-e2e-'));
await mkdir(join(dir,'fixtures'),{recursive:true});
const fixtures=join(dir,'fixtures/reto-01');
await cp(resolve('fixtures/reto-01'),fixtures,{recursive:true});
if(prepared) {
  const indexPath=join(fixtures,'soportes/index.json');
  const index=JSON.parse(await readFile(indexPath,'utf8')) as {vigencia_hasta:string|null}[];
  for(const s of index)if(s.vigencia_hasta!==null)s.vigencia_hasta='2099-12-31';
  await writeFile(indexPath,JSON.stringify(index));
  const corrupt=join(fixtures,'casos/co-plantilla-corrupta');
  await cp(join(fixtures,'casos/co-industrias-delta'),corrupt,{recursive:true});
  const request=JSON.parse(await readFile(join(corrupt,'solicitud.json'),'utf8'));
  request.id='co-plantilla-corrupta';request.cliente='Caso E2E: plantilla corrupta';
  await writeFile(join(corrupt,'solicitud.json'),JSON.stringify(request));
  await writeFile(join(corrupt,'plantilla-celdas.json'),'{ JSON corrupto');
}
const child=spawn(process.execPath,[join(repo,'node_modules/tsx/dist/cli.mjs'),join(repo,'src/server/index.ts')],{
  cwd:dir,env:{...process.env,HOST:'127.0.0.1',CHAT_RATE_LIMIT:'2000',PORT:prepared?'3102':'3101',LLM_API_KEY:'',DOTENV_CONFIG_PATH:join(dir,'.env')},stdio:'inherit'
});
let stopping=false;
async function stop() {if(stopping)return;stopping=true;child.kill('SIGTERM');}
process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
child.on('exit',async code=>{await rm(dir,{recursive:true,force:true});process.exit(stopping?0:code??1);});
