import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contracts } from '../src/contracts/proveedor.js';
import { type Evidence, collectEvidence, renderAnswer } from '../src/agent/answers.js';
import { createSession, type ChatEvent } from '../src/agent/orchestrator.js';

test('Respuestas solo admiten referencias válidas, nunca prosa ni valores inventados',()=>{
 const evidence=collectEvidence([{name:'herramienta',data:{cliente:'Cliente real',faltantes:['RUC'],campos:[{etiqueta:'Cuenta',valor:'00123',estado:'mapeado',fuente:'maestro.json'}]}}]);
 assert.match(renderAnswer({status:'answered',evidence_ids:[0]},evidence)!,/Cliente real/);
 for(const raw of [{status:'answered',evidence_ids:[999]},{status:'answered',evidence_ids:[0,0]},{status:'answered',evidence_ids:[]},{status:'answered',evidence_ids:[0],text:'Cuenta inventada'},{status:'not_available',evidence_ids:[0]}])assert.equal(renderAnswer(raw,evidence),null);
 assert.match(renderAnswer({status:'not_available',evidence_ids:[]},evidence)!,/No completaré/);
});

test('Consultas LLM leen herramientas, responden con evidencia, cancelan permiso y aíslan casos',async()=>{
 const key=process.env.LLM_API_KEY,originalFetch=globalThis.fetch,budget=process.env.LLM_MAX_SESSION_TOKENS;
 process.env.LLM_MAX_SESSION_TOKENS='1000000';
 process.env.LLM_API_KEY='secret-test';
 let invalid=false,failed=false;
 type Payload={stage:string;evidence:Evidence[];recent_questions:string[]};
 const payloads:Payload[]=[];
 globalThis.fetch=async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  const payload=JSON.parse(body.messages[1].content) as Payload;payloads.push(payload);
  assert.equal(body.messages[0].role,'system');
  if(failed)return new Response('secret-test',{status:401});
  const answer=payload.stage==='intent'?{intent:'consulta'}:invalid?{status:'answered',evidence_ids:[99999]}:{status:'answered',evidence_ids:[payload.evidence.find(e=>e.label==='solicitud · cliente')!.id]};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(answer)}}]}));
 };
 try {
  const session=createSession({today:()=> '2026-08-25'});
  const events:ChatEvent[]=[];
  const turn=async(id:string,text:string)=>{events.length=0;await session.chat(id,text,e=>events.push(e));return [...events];};
  await turn('co-industrias-delta','preparar');
  const response=await turn('co-industrias-delta','¿Para qué cliente es esta solicitud?');
  assert.ok(response.some(e=>e.type==='confirmation'&&e.state==='cancelled'));
  const read=response.find(e=>e.type==='tool_result'&&e.name==='proveedor_leer_solicitud')!;
  const readResult=contracts.proveedor_leer_solicitud.output.parse(read.result);assert.ok(readResult.ok);const client=readResult.data.solicitud.cliente;
  assert.ok(response.some(e=>e.type==='message'&&String(e.text).includes(client)&&String(e.text).includes('Fuente:')));
  assert.ok(!response.some(e=>e.type==='tool_call'&&e.name==='proveedor_armar_paquete'));
  const after=await turn('co-industrias-delta','sí');assert.ok(!after.some(e=>e.type==='tool_call'));
  await turn('ec-corp-andina','¿Y el cliente?');
  const last=payloads.at(-1)!;assert.deepEqual(last.recent_questions,[]);
  assert.ok(!JSON.stringify(last.evidence).includes(client));
  invalid=true;
  const rejected=await turn('ec-corp-andina','¿Cuenta?');
  assert.ok(rejected.some(e=>e.type==='message'&&String(e.text).includes('respuesta validada')));
  failed=true;
  const failure=await turn('ec-corp-andina','¿Documentos?');
  assert.ok(failure.some(e=>e.type==='message'&&String(e.text).includes('no está disponible')));
  assert.ok(!JSON.stringify(failure).includes('secret-test'));
 } finally {globalThis.fetch=originalFetch;if(budget===undefined)delete process.env.LLM_MAX_SESSION_TOKENS;else process.env.LLM_MAX_SESSION_TOKENS=budget;if(key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=key;}
});

test('Sin clave explica configuración y conserva la sesión',async()=>{
 const key=process.env.LLM_API_KEY;delete process.env.LLM_API_KEY;
 try {
  const session=createSession();const events:ChatEvent[]=[];
  await session.chat('co-industrias-delta','¿Qué documentos requiere?',e=>events.push(e));
  assert.ok(events.some(e=>e.type==='message'&&String(e.text).includes('LLM_API_KEY')));
  assert.equal(events.at(-1)?.type,'done');
 } finally {if(key!==undefined)process.env.LLM_API_KEY=key;}
});
