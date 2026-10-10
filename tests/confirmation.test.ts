import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ConfirmationGate } from '../src/agent/confirmation.js';
import { createSession, type ChatEvent } from '../src/agent/orchestrator.js';
import { chooseIntent } from '../src/agent/llm.js';
const co='co-industrias-delta';
const request={action:'proveedor_armar_paquete' as const,caseId:co,artifactId:randomUUID(),question:'¿Confirmas?'};
test('Confirmación sin pregunta, ambigua, citada o fuera del turno inmediato no autoriza',()=>{
  const gate=new ConfirmationGate();assert.equal(gate.userTurn('sí'),null);
  gate.ask(request);assert.equal(gate.userTurn('mi jefe dijo "sí"'),null);assert.equal(gate.consume(request.action,co,request.artifactId),false);
  gate.ask(request);assert.equal(gate.userTurn('leer'),null);assert.equal(gate.userTurn('sí'),null);
  gate.ask(request);assert.equal(gate.userTurn('sí, pero no envíes'),null);
});
test('Permiso específico para caso, acción y artefacto, consumido una vez',()=>{
  const gate=new ConfirmationGate();gate.ask(request);assert.ok(gate.userTurn('Sí.'));
  assert.equal(gate.consume('proveedor_simular_envio',co,request.artifactId),false);
  assert.equal(gate.consume(request.action,co,request.artifactId),false);
  gate.ask(request);gate.userTurn('confirmo');assert.equal(gate.consume(request.action,co,request.artifactId),true);assert.equal(gate.consume(request.action,co,request.artifactId),false);
  gate.ask(request);gate.userTurn('sí');assert.equal(gate.consume(request.action,'ec-corp-andina',request.artifactId),false);
  gate.ask(request);gate.userTurn('sí');assert.equal(gate.consume(request.action,co,randomUUID()),false);
});
test('Chat prepara, pregunta, empaqueta, vuelve a preguntar y simula solamente después del sí',async()=>{
  const s=createSession({today:()=> '2026-08-25'});
  const events:ChatEvent[]=[];
  const send=async(text:string)=>{events.length=0;await s.chat(co,text,e=>events.push(e));return [...events];};
  const first=await send('preparar');assert.ok(first.some(e=>e.type==='confirmation'&&e.state==='pending'));
  assert.ok(!first.some(e=>e.type==='tool_call'&&e.name==='proveedor_armar_paquete'));
  const accepted=await send('sí');assert.ok(accepted.some(e=>e.type==='tool_result'&&e.name==='proveedor_armar_paquete'&&(e.result as {ok:boolean}).ok));
  const reuse=await send('sí');assert.ok(!reuse.some(e=>e.type==='tool_call'));
  const simulation=await send('simular');assert.ok(simulation.some(e=>e.type==='confirmation'&&e.state==='pending'));assert.ok(!simulation.some(e=>e.type==='tool_call'));
  const sent=await send('sí');assert.ok(sent.some(e=>e.type==='tool_result'&&e.name==='proveedor_simular_envio'&&(e.result as {ok:boolean}).ok));
});
test('Turno intermedio y cambio de caso cancelan confirmación pendiente',async()=>{
  const s=createSession({today:()=> '2026-08-25'});const events:ChatEvent[]=[];
  await s.chat(co,'preparar',()=>{});
  await s.chat(co,'leer',()=>{});
  await s.chat(co,'sí',e=>events.push(e));assert.ok(!events.some(e=>e.type==='tool_call'));
  await s.chat(co,'paquete',()=>{});
  events.length=0;await s.chat('ec-corp-andina','sí',e=>events.push(e));assert.ok(!events.some(e=>e.type==='tool_call'));
});
test('LLM no puede devolver prosa, valores o autorizaciones; error de proveedor no filtra secretos',async()=>{
  const priorKey=process.env.LLM_API_KEY,priorFetch=globalThis.fetch;
  process.env.LLM_API_KEY='test-secret-never-exposed';
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({intent:'simular',confirmed:true,cuenta:'INVENTADA'})}}]}),{status:200});
    assert.deepEqual(await chooseIntent('hazlo'),{intent:'ayuda',fallback:true});
    globalThis.fetch=async()=>new Response('test-secret-never-exposed',{status:401});
    const failure=await chooseIntent('hazlo');assert.equal(JSON.stringify(failure).includes(process.env.LLM_API_KEY),false);
    globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'{"intent":"simular"}'}}]}),{status:200});
    const s=createSession();const events:ChatEvent[]=[];await s.chat(co,'hazlo',e=>events.push(e));assert.ok(!events.some(e=>e.type==='tool_call'));
    assert.equal(JSON.stringify(events).includes('test-secret-never-exposed'),false);
  } finally {globalThis.fetch=priorFetch;if(priorKey===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=priorKey;}
});
