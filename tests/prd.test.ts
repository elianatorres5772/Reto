import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, readFile, rm, mkdir, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createProveedorTools, executePublic, proveedorTools, type ToolContext } from '../src/tools/proveedor.js';
import { field, publicContracts } from '../src/contracts/proveedor.js';
import { ConfirmationGate } from '../src/agent/confirmation.js';
import { createSession, type ChatEvent } from '../src/agent/orchestrator.js';
import { createModelRuntime } from '../src/llm/runtime.js';
import { OpenAIAdapter } from '../src/llm/openai.js';
import type { LlmAdapter } from '../src/llm/adapter.js';

async function setup(day='2026-08-29') {
 const directory=await mkdtemp(join(tmpdir(),'prd-'));
 await cp('fixtures/reto-01',join(directory,'fixtures/reto-01'),{recursive:true});
 const sessionId=randomUUID(),gate=new ConfirmationGate();
 const tools=createProveedorTools({sessionId,fixturesRoot:join(directory,'fixtures/reto-01'),outputRoot:join(directory,'out'),today:()=>day,authorize:(...args)=>gate.consume(...args)});
 const ctx:ToolContext={directory,sessionId,tools};
 return {directory,ctx,tools,gate};
}
test('Contratos públicos describen argumentos, retornan strings y rechazan mapeos o permisos inventados',async()=>{
 const s=await setup();
 try {
  for(const def of Object.values(proveedorTools)){assert.ok(def.description);for(const arg of Object.values(def.args))assert.ok(arg.description);}
  const read=await executePublic(s.ctx,'proveedor_leer_solicitud',{caso:'hn-agroexport-sula'});assert.ok(read.ok);assert.equal(read.data.pais,'HN');assert.ok(read.data.campos.length);
  const campos=read.data.campos.map(f=>field.parse(Object.fromEntries(Object.entries(f).filter(([k])=>!['requiere_confirmacion','equivalente_pais'].includes(k)))));
  const mapped=await executePublic(s.ctx,'proveedor_mapear_campos',{caso:'hn-agroexport-sula',campos});assert.ok(mapped.ok);
  assert.ok(mapped.data.requiere_confirmacion.some(f=>f.nota==='identificador extranjero'&&f.equivalente_pais==='RTN'));
  assert.ok(mapped.data.faltantes.some(f=>f.etiqueta==='Referencias comerciales'));
  const altered=structuredClone(mapped.data);altered.campos[0]!.valor='VALOR_INVENTADO';
  assert.equal((await executePublic(s.ctx,'proveedor_generar_formulario',{caso:'hn-agroexport-sula',mapeo:altered})).ok,false);
  const form=await executePublic(s.ctx,'proveedor_generar_formulario',{caso:'hn-agroexport-sula',mapeo:mapped.data});assert.ok(form.ok);
  assert.equal((await executePublic(s.ctx,'proveedor_armar_paquete',{caso:'hn-agroexport-sula'})).ok,false);
  s.gate.ask({action:'proveedor_armar_paquete',caseId:'hn-agroexport-sula',artifactId:form.data.artefacto.id,question:'¿Confirmas?'});s.gate.userTurn('sí');
  const pkg=await executePublic(s.ctx,'proveedor_armar_paquete',{caso:'hn-agroexport-sula'});assert.ok(pkg.ok);assert.equal(pkg.data.listo_para_firma,true);
  const checklist=await readFile(join(s.directory,pkg.data.checklist),'utf8');assert.match(checklist,/Referencias comerciales/);
  const correo=await readFile(join(s.directory,pkg.data.borrador_correo),'utf8');assert.ok(!correo.includes('03100012345'));assert.ok(!correo.includes('SWIFT'));
  const falseGrant=await executePublic(s.ctx,'proveedor_simular_envio',{caso:'hn-agroexport-sula',confirmado:true});assert.equal(falseGrant.ok,false);
  s.gate.ask({action:'proveedor_simular_envio',caseId:'hn-agroexport-sula',artifactId:pkg.data.paquete.id,question:'¿Confirmas?'});s.gate.userTurn('sí');
  const sim=await executePublic(s.ctx,'proveedor_simular_envio',{caso:'hn-agroexport-sula',confirmado:true});assert.ok(sim.ok);
  assert.match(await readFile(join(s.directory,sim.data.ruta),'utf8'),/No se envió correo/);
  assert.equal((await executePublic(s.ctx,'proveedor_simular_envio',{caso:'hn-agroexport-sula',confirmado:true})).ok,false);
  const rows=(await readFile(join(s.directory,'out/hn-agroexport-sula/log.jsonl'),'utf8')).trim().split('\n').map(row=>JSON.parse(row) as {ts:string;herramienta:string;ok:boolean;resumen:string});
  assert.ok(rows.every(row=>row.ts&&row.herramienta&&typeof row.ok==='boolean'&&row.resumen));
  assert.ok(rows.some(row=>row.herramienta==='proveedor_simular_envio'&&!row.ok));
  for(const row of rows)assert.ok(!JSON.stringify(row).includes('03100012345'));
  assert.ok(await readFile(join(s.directory,'out/log.jsonl'),'utf8'));
  assert.ok(publicContracts.proveedor_leer_solicitud.output.safeParse(JSON.parse(await proveedorTools.proveedor_leer_solicitud.execute({caso:'hn-agroexport-sula'},s.ctx))).success);
 } finally {await rm(s.directory,{recursive:true,force:true});}
});
test('Presupuestos de sesión y servidor bloquean llamadas incluso al crear otra sesión',async()=>{
 let calls=0;
 const adapter:LlmAdapter={provider:'openai',model:'fake',async enviar(){calls++;return {ok:true,data:{intent:'consulta'},usage:{input:1,output:1}};}};
 const runtime=createModelRuntime(adapter,{iterations:25,sessionTokens:2000,outputTokens:500,dailyTokens:1000000,timeoutMs:1000});
 const request=()=>runtime.request([{role:'user',content:'hola'}],[],'test',{});
 assert.deepEqual(await request(),{intent:'consulta'});assert.equal(await request(),null);assert.equal(calls,1);assert.match(runtime.lastError,/límite/);
 const tiny=createModelRuntime(adapter,{iterations:25,sessionTokens:1,outputTokens:500,dailyTokens:1000000,timeoutMs:1000});
 assert.equal(await tiny.request([],[],'test',{}),null);assert.equal(calls,1);
 const fresh=createModelRuntime(adapter,{iterations:25,sessionTokens:1000000,outputTokens:500,dailyTokens:runtime.reservedTokens,timeoutMs:1000});
 assert.equal(await fresh.request([{role:'user',content:'hola'}],[],'test',{}),null);assert.equal(calls,1);assert.match(fresh.lastError,/servidor/);
});
test('Tope del turno conserva resultados y sesión sin ejecutar acciones posteriores',async()=>{
 const prior=process.env.AGENT_MAX_ITERATIONS;process.env.AGENT_MAX_ITERATIONS='1';
 try {
  const session=createSession();const events:ChatEvent[]=[];
  await session.chat('co-industrias-delta','preparar',e=>events.push(e));
  assert.equal(events.filter(e=>e.type==='tool_call').length,1);
  assert.ok(events.some(e=>e.type==='message'&&String(e.text).includes('tope de iteraciones')));
  assert.ok(!events.some(e=>e.type==='confirmation'&&e.state==='pending'));
  assert.equal(events.at(-1)?.type,'done');
  assert.ok(session.history.some(e=>e.role==='user'&&e.text==='preparar'));
 } finally {if(prior===undefined)delete process.env.AGENT_MAX_ITERATIONS;else process.env.AGENT_MAX_ITERATIONS=prior;}
});
test('Adaptador convierte timeout en error sin exponer clave ni traza',async()=>{
 const original=globalThis.fetch;
 globalThis.fetch=async()=>{throw new DOMException('secret-fake','TimeoutError');};
 try {const result=await new OpenAIAdapter('fake','secret-fake').enviar([],[],{name:'t',schema:{},maxOutputTokens:10,timeoutMs:1});assert.equal(result.ok,false);if(!result.ok)assert.equal(result.error.code,'TIMEOUT');assert.ok(!JSON.stringify(result).includes('secret-fake'));}
 finally {globalThis.fetch=original;}
});


test('Admite estructura repositorio del PRD, aplica regla PE y protege fixtures de escrituras',async()=>{
 const s=await setup();
 try {
  const root=join(s.directory,'fixtures/reto-01');
  await mkdir(join(root,'repositorio'));
  await rename(join(root,'maestro.json'),join(root,'repositorio/maestro.json'));
  await rename(join(root,'soportes'),join(root,'repositorio/soportes'));
  const pe=join(root,'casos/pe-prueba');await cp(join(root,'casos/co-industrias-delta'),pe,{recursive:true});
  const raw=JSON.parse(await readFile(join(pe,'solicitud.json'),'utf8')) as {id:string;pais:string};raw.id='pe-prueba';raw.pais='PE';await writeFile(join(pe,'solicitud.json'),JSON.stringify(raw));
  const tools=createProveedorTools({fixturesRoot:root,outputRoot:join(s.directory,'out')});
  const mapped=await tools.execute('proveedor_mapear_campos',{caso_id:'pe-prueba'});assert.ok(mapped.ok);
  assert.ok(mapped.data.requiere_confirmacion.some(f=>f.campo==='nit'&&f.equivalente_pais==='RUC'));
  const before=await readFile(join(root,'repositorio/maestro.json'),'utf8');
  const blocked=createProveedorTools({fixturesRoot:root,outputRoot:root});
  const result=await executePublic({...s.ctx,tools:blocked},'proveedor_leer_solicitud',{caso:'co-industrias-delta'});assert.equal(result.ok,false);
  assert.equal(await readFile(join(root,'repositorio/maestro.json'),'utf8'),before);
  await assert.rejects(readFile(join(root,'log.jsonl')));
 } finally {await rm(s.directory,{recursive:true,force:true});}
});
