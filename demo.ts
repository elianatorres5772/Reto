import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createProveedorTools, executePublic, type ToolContext } from './src/tools/proveedor.js';
import { ConfirmationGate } from './src/agent/confirmation.js';
import { type CriticalAction, type ToolName } from './src/contracts/proveedor.js';

async function demo() {
 const directory=fileURLToPath(new URL('.',import.meta.url));
 const outputRoot=fileURLToPath(new URL('./out',import.meta.url));
 await rm(outputRoot,{recursive:true,force:true});
 const catalog=await createProveedorTools({fixturesRoot:fileURLToPath(new URL('./fixtures/reto-01',import.meta.url)),outputRoot}).listCases();
 assert.ok(catalog.ok,'El catálogo debe ser válido');
 const historical=process.argv.includes('--historico');
 const reports=[];
 for(const item of catalog.data) {
  const gate=new ConfirmationGate();let day=new Date().toISOString().slice(0,10);
  const sessionId=randomUUID();
  const tools=createProveedorTools({fixturesRoot:fileURLToPath(new URL('./fixtures/reto-01',import.meta.url)),outputRoot,sessionId,authorize:(...args)=>gate.consume(...args),today:()=>day});
  const ctx:ToolContext={directory,sessionId,tools};
  const calls=new Set<ToolName>();
  const call=async<N extends ToolName>(name:N,input:unknown)=>{calls.add(name);return executePublic(ctx,name,input);};
  const confirm=(action:CriticalAction,id:string)=>{gate.ask({action,caseId:item.id,artifactId:id,question:'¿Confirmas la acción de prueba?'});assert.ok(gate.userTurn('sí'));};
  const read=await call('proveedor_leer_solicitud',{caso:item.id});assert.ok(read.ok);
  if(historical)day=read.data.solicitud.fecha;
  const campos=read.data.campos;
  const map=await call('proveedor_mapear_campos',{caso:item.id,campos});assert.ok(map.ok);
  const form=await call('proveedor_generar_formulario',{caso:item.id,mapeo:map.data});assert.ok(form.ok);
  let pack,sim;
  if(form.data.formato!=='portal') {
   assert.equal((await call('proveedor_armar_paquete',{caso:item.id})).ok,false);
   confirm('proveedor_armar_paquete',form.data.artefacto.id);
   pack=await call('proveedor_armar_paquete',{caso:item.id});assert.ok(pack.ok);
   const denied=await call('proveedor_simular_envio',{caso:item.id,confirmado:true});assert.equal(denied.ok,false);
   confirm('proveedor_simular_envio',pack.data.paquete.id);
   sim=await call('proveedor_simular_envio',{caso:item.id,confirmado:true});
   assert.equal(sim.ok,pack.data.listo_para_firma);
  } else {
   pack=await call('proveedor_armar_paquete',{caso:item.id});assert.equal(pack.ok,false);
   sim=await call('proveedor_simular_envio',{caso:item.id,confirmado:false});assert.equal(sim.ok,false);
  }
  assert.equal(calls.size,5);
  reports.push({caso:item.id,fecha_evaluacion:day,llenos:map.data.llenos.map(f=>f.etiqueta),faltantes:map.data.faltantes.map(f=>f.etiqueta),requiere_confirmacion:map.data.requiere_confirmacion.map(f=>({etiqueta:f.etiqueta,nota:f.nota})),formulario:form.data.ruta,paquete:pack.ok?{ruta:pack.data.ruta,listo_para_firma:pack.data.listo_para_firma,soportes:pack.data.soportes.map(s=>({tipo:s.tipo,estado:s.estado})),ausentes:pack.data.soportes_faltantes}:pack.error.code,simulacion:sim.ok?sim.data.ruta:sim.error.code});
 }
 console.log(JSON.stringify({modo:historical?'Histórico: fecha de solicitud; no acredita vigencia actual':'Fecha actual UTC; sin LLM',casos_ejecutados:reports.length,herramientas_por_caso:5,resultados:reports},null,2));
}
demo().catch(()=>{console.error('Demo fallido: ejecuta pnpm test para el diagnóstico.');process.exitCode=1;});
