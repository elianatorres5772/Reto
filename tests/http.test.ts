import { z } from 'zod';
import { contracts } from '../src/contracts/proveedor.js';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Cada prueba escribe en su propia salida: los archivos de prueba corren en paralelo y comparten out/.
const outputs:string[]=[];
const tempOut=()=>{const dir=mkdtempSync(join(tmpdir(),'proveedor-out-'));outputs.push(dir);return dir;};
after(()=>{for(const dir of outputs)rmSync(dir,{recursive:true,force:true});});


test('HTTP: chat incremental, confirmación, descarga aislada, errores y seguridad',async()=>{
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const address=probe.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>(r=>probe.close(()=>r()));
  const base=`http://127.0.0.1:${port}`;
  const secret=`test-key-${randomUUID()}`;
  const child=spawn(process.execPath,['--import','tsx','src/server.ts'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LLM_API_KEY:secret,OUTPUT_ROOT:tempOut()},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  try {
    let ready=false;
    for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break;}}catch{}await delay(50);}
    assert.ok(ready,'El servidor debe arrancar');
    const html=await fetch(base);assert.equal(html.status,200);assert.ok((await html.text()).includes('Registro como proveedor'));assert.ok(html.headers.get('content-security-policy'));
    const cases=z.object({data:z.array(z.object({id:z.string()}))}).parse(await (await fetch(`${base}/api/cases`)).json());assert.equal(cases.data.length,4);
    const session=z.object({session_id:z.string()}).parse(await (await fetch(`${base}/api/session`,{method:'POST'})).json());
    const session2=z.object({session_id:z.string()}).parse(await (await fetch(`${base}/api/session`,{method:'POST'})).json());
    const headers={'Content-Type':'application/json','X-Session-Id':session.session_id};
    const chat=async(message:string)=>{
      const response=await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({caso_id:'co-industrias-delta',message})});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/x-ndjson; charset=utf-8');
      const text=await response.text();assert.equal(text.includes(secret),false);return text.trim().split('\n').map(line=>z.object({type:z.string(),name:z.string().optional(),state:z.string().optional(),result:z.unknown().optional()}).parse(JSON.parse(line)));
    };
    const events=await chat('preparar');assert.equal(events[0]?.type,'thinking');assert.equal(events.at(-1)?.type,'done');assert.ok(events.some(e=>e.type==='confirmation'&&e.state==='pending'));
    assert.ok(!events.some(e=>e.type==='tool_call'&&e.name==='proveedor_armar_paquete'));
    const generated=contracts.proveedor_generar_formulario.output.parse(events.find(e=>e.type==='tool_result'&&e.name==='proveedor_generar_formulario')?.result);assert.ok(generated.ok);
    const f=generated.data.artefacto;
    const download=await fetch(`${base}/api/artifacts/${f.id}`,{headers});assert.equal(download.status,200);assert.ok((await download.arrayBuffer()).byteLength>100);
    const foreign=await fetch(`${base}/api/artifacts/${f.id}`,{headers:{'X-Session-Id':session2.session_id}});assert.equal(foreign.status,404);
    const packed=await chat('sí');const pack=contracts.proveedor_armar_paquete.output.parse(packed.find(e=>e.type==='tool_result'&&e.name==='proveedor_armar_paquete')?.result);assert.ok(pack.ok);
    const zip=await fetch(`${base}/api/artifacts/${pack.data.paquete.id}`,{headers});const files=unzipSync(new Uint8Array(await zip.arrayBuffer()));assert.ok(files['manifiesto.json']);
    await chat('no');assert.ok(!(await chat('sí')).some(e=>e.type==='tool_call'));
    const malformed=await fetch(`${base}/api/chat`,{method:'POST',headers,body:'{'});assert.equal(malformed.status,400);
    const traversal=await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({caso_id:'../../maestro',message:'leer'})});assert.equal(traversal.status,400);
    const csrf=await fetch(`${base}/api/chat`,{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:'{}'});assert.equal(csrf.status,403);
    const unauth=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauth.status,401);
    assert.ok((await chat('leer')).some(e=>e.type==='tool_result'&&contracts.proveedor_leer_solicitud.output.safeParse(e.result).success));
    const historyResponse=await fetch(`${base}/api/sessions/${session.session_id}`,{headers});assert.equal(historyResponse.status,200);const history=z.object({history:z.array(z.object({type:z.string(),role:z.string().optional()}))}).parse(await historyResponse.json());assert.ok(history.history.some(e=>e.role==='user'));
    assert.equal((await fetch(`${base}/api/sessions/${session.session_id}`,{headers:{'X-Session-Id':session2.session_id}})).status,401);
    const health=z.object({provider:z.string(),model:z.string(),configured:z.boolean()}).parse(await (await fetch(`${base}/api/health`)).json());assert.equal(health.provider,'anthropic');assert.equal(health.configured,true);
    assert.equal(logs.includes(secret),false);
  } finally {child.kill('SIGTERM');await once(child,'exit');}
});
async function startServer(env:Record<string,string>) {
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const address=probe.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>(r=>probe.close(()=>r()));
  const child=spawn(process.execPath,['--import','tsx','src/server.ts'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LLM_API_KEY:'',OUTPUT_ROOT:tempOut(),...env},stdio:['ignore','pipe','pipe']});
  return {child,base:`http://127.0.0.1:${port}`};
}
test('HTTP: FECHA_EVALUACION permite el guion §11 hasta ENVIO-SIMULADO.md y rechaza fechas inválidas o futuras',async()=>{
  for(const fecha of ['2026-13-40','2999-01-01','ayer']) {
    const {child}=await startServer({FECHA_EVALUACION:fecha});const [code]=await once(child,'exit');assert.equal(code,1);
  }
  const {child,base}=await startServer({FECHA_EVALUACION:'2026-08-25'});
  try {
    let ready=false;
    for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break;}}catch{}await delay(50);}
    assert.ok(ready,'El servidor debe arrancar');
    assert.equal(z.object({fecha_evaluacion:z.string()}).parse(await (await fetch(`${base}/api/health`)).json()).fecha_evaluacion,'2026-08-25');
    const session=z.object({session_id:z.string()}).parse(await (await fetch(`${base}/api/session`,{method:'POST'})).json());
    const chat=async(message:string)=>{
      const response=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json','X-Session-Id':session.session_id},body:JSON.stringify({caso_id:'co-industrias-delta',message})});
      return (await response.text()).trim().split('\n').map(line=>JSON.parse(line) as {type:string;name?:string;state?:string;text?:string;result?:{ok:boolean;data?:{ruta?:string}}});
    };
    const first=await chat('Procesa el caso "co-industrias-delta". No envíes nada todavía.');
    assert.ok(first.some(e=>e.type==='message'&&e.text?.includes('Listo para firma según soportes: sí')));
    await chat('envía');await chat('sí');
    const sent=await chat('sí');const result=sent.find(e=>e.type==='tool_result'&&e.name==='proveedor_simular_envio')?.result;
    assert.ok(result?.ok);assert.equal(result.data?.ruta,'out/co-industrias-delta/ENVIO-SIMULADO.md');
  } finally {child.kill('SIGTERM');await once(child,'exit');}
});
