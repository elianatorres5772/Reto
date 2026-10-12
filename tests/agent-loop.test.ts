import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession, type ChatEvent } from '../src/agent/orchestrator.js';
import type { LlmAdapter, AgentTurn, AgentReply, AgentToolCall } from '../src/llm/adapter.js';
const outputs:string[]=[];
const tempOut=()=>{const dir=mkdtempSync(join(tmpdir(),'proveedor-out-'));outputs.push(dir);return dir;};
after(()=>{for(const dir of outputs)rmSync(dir,{recursive:true,force:true});});
const co='co-industrias-delta';
type Step={text?:string;calls?:Omit<AgentToolCall,'id'>[]};
// Claude simulado: responde un guion y valida la conversación como lo haría la API.
function scripted(steps:Step[]) {
  const seen:{system:string;turns:AgentTurn[];tools:string[]}[]=[];let n=0;
  const adapter:LlmAdapter={provider:'anthropic',model:'fake',
    async enviar(){return {ok:false,error:{code:'PROVIDER_ERROR',message:'no usado'}};},
    async conversar(system,turns,tools):Promise<AgentReply>{
      turns.forEach((turn,i)=>{
        if(turn.role!=='assistant'||!turn.toolCalls.length)return;
        const next=turns[i+1];
        assert.ok(next&&next.role==='user'&&next.toolResults,'cada tool_use necesita su tool_result');
        assert.deepEqual(next.toolResults!.map(r=>r.id),turn.toolCalls.map(c=>c.id));
      });
      seen.push({system,turns:structuredClone(turns),tools:tools.map(t=>t.name)});
      const step=steps.shift();assert.ok(step,'el ciclo pidió más respuestas de las previstas');
      const toolCalls=(step.calls??[]).map(c=>({...c,id:`toolu_${++n}`}));
      return {ok:true,data:{text:step.text??'',toolCalls,raw:[{type:'text',text:step.text??''},...toolCalls.map(c=>({type:'tool_use',...c}))],stop:toolCalls.length?'tool_use':'end'},usage:{input:1,output:1}};
    }};
  return {adapter,seen,remaining:()=>steps.length};
}
async function withKey(run:()=>Promise<void>) {
  const saved={key:process.env.LLM_API_KEY,session:process.env.LLM_MAX_SESSION_TOKENS};
  process.env.LLM_API_KEY='test-key';process.env.LLM_MAX_SESSION_TOKENS='5000000';
  try {await run();} finally {
    if(saved.key===undefined)delete process.env.LLM_API_KEY;else process.env.LLM_API_KEY=saved.key;
    if(saved.session===undefined)delete process.env.LLM_MAX_SESSION_TOKENS;else process.env.LLM_MAX_SESSION_TOKENS=saved.session;
  }
}
const turnOf=(s:ReturnType<typeof createSession>)=>async(caso:string,text:string)=>{const events:ChatEvent[]=[];await s.chat(caso,text,e=>events.push(e));return events;};
const called=(events:ChatEvent[])=>events.filter(e=>e.type==='tool_call').map(e=>e.name);

test('Ciclo con herramientas: Claude elige las llamadas; paquete y envío solo tras confirmaciones',()=>withKey(async()=>{
  const fake=scripted([
    {text:'Leo la solicitud.',calls:[{name:'proveedor_leer_solicitud',input:{caso:co}}]},
    {calls:[{name:'proveedor_mapear_campos',input:{caso:co}}]},
    {calls:[{name:'proveedor_generar_formulario',input:{caso:co}}]},
    {text:'Resumen: formulario en out/co-industrias-delta/formulario.xlsx. ¿Quieres que arme el paquete?'},
    {calls:[{name:'proveedor_simular_envio',input:{caso:co,confirmado:true}}]}
  ]);
  const s=createSession({today:()=> '2026-08-25',outputRoot:tempOut(),llmAdapter:fake.adapter});const turn=turnOf(s);
  const first=await turn(co,'Procesa el caso. No envíes nada todavía.');
  assert.deepEqual(called(first),['proveedor_leer_solicitud','proveedor_mapear_campos','proveedor_generar_formulario']);
  assert.ok(first.some(e=>e.type==='message'&&String(e.text).startsWith('Resumen:')));
  assert.match(fake.seen[0]!.system,/Agente de registro como proveedor/);assert.match(fake.seen[0]!.system,/Identificador tributario/);
  assert.deepEqual(fake.seen[0]!.tools,['proveedor_leer_solicitud','proveedor_mapear_campos','proveedor_generar_formulario','proveedor_armar_paquete','proveedor_simular_envio']);
  // El modelo recibe etiquetas y estados, no valores del maestro.
  const mapResult=(fake.seen[2]!.turns.at(-1) as {toolResults:{content:string}[]}).toolResults[0]!.content;
  const cuenta=(JSON.parse(readFileSync('fixtures/reto-01/maestro.json','utf8')) as {banco:{numero_cuenta:string}}).banco.numero_cuenta;
  assert.match(mapResult,/"llenos"/);assert.ok(!mapResult.includes(cuenta));assert.doesNotMatch(mapResult,/"valor"/);
  const envia=await turn(co,'envía');
  assert.deepEqual(called(envia),[]);assert.ok(envia.some(e=>e.type==='confirmation'&&e.state==='pending'&&e.action==='proveedor_armar_paquete'));
  const packed=await turn(co,'sí');
  assert.deepEqual(called(packed),['proveedor_armar_paquete']);assert.ok(packed.some(e=>e.type==='confirmation'&&e.state==='pending'&&e.action==='proveedor_simular_envio'));
  const sent=await turn(co,'sí');
  const result=sent.find(e=>e.type==='tool_result'&&e.name==='proveedor_simular_envio')?.result as {ok:boolean;data:{ruta:string}};
  assert.ok(result.ok);assert.equal(result.data.ruta,`out/${co}/ENVIO-SIMULADO.md`);
  assert.equal(fake.remaining(),0);
}));

test('Ciclo con herramientas: sin formulario no hay paquete; argumentos inválidos vuelven al modelo como error',()=>withKey(async()=>{
  const fake=scripted([
    {calls:[{name:'proveedor_armar_paquete',input:{caso:co}},{name:'proveedor_leer_solicitud',input:{caso:'../../maestro'}}]},
    {text:'Primero debo generar el formulario.'}
  ]);
  const s=createSession({today:()=> '2026-08-25',outputRoot:tempOut(),llmAdapter:fake.adapter});
  const events=await turnOf(s)(co,'arma el paquete ya');
  assert.deepEqual(called(events),[]);assert.ok(!events.some(e=>e.type==='confirmation'&&e.state==='pending'));
  const results=(fake.seen[1]!.turns.at(-1) as {toolResults:{content:string;isError:boolean}[]}).toolResults;
  assert.ok(results.every(r=>r.isError));assert.match(results[0]!.content,/Genera primero el formulario/);assert.match(results[1]!.content,/Argumentos inválidos/);
}));

test('Ciclo con herramientas: paquete bloqueado no se propone para envío y el tope corta el turno sin romper la conversación',()=>withKey(async()=>{
  const fake=scripted([
    {calls:[{name:'proveedor_generar_formulario',input:{caso:'ec-corp-andina'}}]},
    {text:'Listo el formulario.'},
    {calls:[{name:'proveedor_simular_envio',input:{caso:'ec-corp-andina',confirmado:true}}]},
    ...Array.from({length:30},()=>({calls:[{name:'proveedor_leer_solicitud',input:{caso:'ec-corp-andina'}}]}))
  ]);
  const s=createSession({today:()=> '2026-08-25',outputRoot:tempOut(),llmAdapter:fake.adapter});const turn=turnOf(s);
  const first=await turn(co,'genera el formulario de ec-corp-andina');
  assert.ok(first.some(e=>e.type==='case_selected'&&e.caseId==='ec-corp-andina'));
  await turn('ec-corp-andina','envía');await turn('ec-corp-andina','sí');
  const blocked=await turn('ec-corp-andina','sí');
  assert.ok(!blocked.some(e=>e.type==='tool_call'&&e.name==='proveedor_simular_envio'));
  const looping=await turn('ec-corp-andina','revisa todo otra vez');
  assert.ok(looping.some(e=>e.type==='message'&&String(e.text).includes('tope de iteraciones')));
}));
