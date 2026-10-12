import { randomUUID } from 'node:crypto';
import type { LlmAdapter, AgentTurn, AgentToolCall } from '../llm/adapter.js';
import { createModelRuntime } from '../llm/runtime.js';
import { localIntent } from './llm.js';
import { createProveedorTools, executePublic } from '../tools/proveedor.js';
import { ConfirmationGate } from './confirmation.js';
import { chooseIntent, answerQuestion, keywordIntent, agentSystemPrompt } from './llm.js';
import { agentTools, agentArgs, isToolName, forModel } from './loop.js';
import { collectEvidence } from './answers.js';
import { caseId, type ToolName } from '../contracts/proveedor.js';
export type ChatEvent = { type:'thinking'|'tool_call'|'tool_result'|'message'|'confirmation'|'done'|'case_selected'; [key:string]:unknown };
export function createSession(options:NonNullable<Parameters<typeof createProveedorTools>[0]>&{llmAdapter?:LlmAdapter}={}) {
  const gate=new ConfirmationGate();
  const sessionId=options.sessionId??randomUUID();
  const runtime=createModelRuntime(options.llmAdapter);
  const tools=createProveedorTools({...options,sessionId,authorize:(...args)=>gate.consume(...args)});
  const ctx={directory:process.cwd(),sessionId,tools};
  let current:string|null=null,formId:string|null=null,packageId:string|null=null,packageReady=false;
  // Conversación con el modelo, solo se agrega (append-only) para conservar su razonamiento entre llamadas.
  const conversation:AgentTurn[]=[];
  const history:ChatEvent[]=[];
  let evidenceResults: {name:string;data:unknown}[]=[];
  let recentQuestions:string[]=[];
  let busy=false;
  async function chat(id:string,text:string,emit:(event:ChatEvent)=>void) {
    if(busy) {gate.clear();emit({type:'message',text:'Hay una operación en curso. Espera a que termine.'});emit({type:'done'});return;}
    busy=true;
    history.push({type:'message',role:'user',text,caseId:id});
    const send=(e:ChatEvent)=>{history.push(e);emit(e);};
    let iterations=0;
    const step=()=>{if(++iterations>runtime.limits.iterations)throw {turnLimit:true};};
    const call=async<N extends ToolName>(name:N,input:unknown)=> {
      step();
      send({type:'tool_call',name,input});
      const result=await executePublic(ctx,name,input);
      send({type:'tool_result',name,result});
      if(result.ok) {
        evidenceResults=evidenceResults.filter(item=>item.name!==name);
        evidenceResults.push({name,data:result.data});
      } else evidenceResults=evidenceResults.filter(item=>item.name!==name);
      if(!result.ok) send({type:'message',text:result.error.message});
      return result;
    };
    const ask=(action:'proveedor_armar_paquete'|'proveedor_simular_envio',artifactId:string,override?:string)=> {
      const question=override??(action==='proveedor_armar_paquete'?'¿Confirmas que prepare el paquete borrador de este caso? Responde «sí» en tu próximo turno.':'¿Confirmas la simulación local del envío de este paquete borrador? No se enviará correo ni se firmará el formulario. Responde «sí» en tu próximo turno.');
      const p=gate.ask({action,caseId:id,artifactId,question});
      send({type:'confirmation',action:p.action,caseId:id,artifactId,question,state:'pending'});
      send({type:'message',text:question});
    };
    // ---- Ciclo con herramientas (Claude decide qué llamar; el servidor conserva datos y permisos) ----
    type ReadResult=Awaited<ReturnType<typeof executePublic<'proveedor_leer_solicitud'>>>;
    type MapResult=Awaited<ReturnType<typeof executePublic<'proveedor_mapear_campos'>>>;
    const reads=new Map<string,ReadResult>(),maps=new Map<string,Extract<MapResult,{ok:true}>>();
    let asked=false;
    const read=async(caso:string)=>{const cached=reads.get(caso);if(cached)return cached;const r=await call('proveedor_leer_solicitud',{caso});if(r.ok)reads.set(caso,r);return r;};
    const out=(name:ToolName,r:{ok:true;data:unknown}|{ok:false;error:{code:string;message:string}},endTurn=false)=>({content:forModel(name,r),isError:!r.ok,endTurn});
    const refuse=(code:string,message:string)=>({content:JSON.stringify({ok:false,error:{code,message}}),isError:true,endTurn:false});
    const pause=(message:string)=>{asked=true;return {content:JSON.stringify({ok:false,error:{code:'CONFIRMATION_REQUIRED',message}}),isError:false,endTurn:true};};
    const switchCase=(caso:string)=>{
      if(caso===id)return;
      id=caso;current=caso;gate.clear();formId=null;packageId=null;packageReady=false;evidenceResults=[];recentQuestions=[];
      send({type:'case_selected',caseId:caso});
    };
    async function runTool(request:AgentToolCall):Promise<{content:string;isError:boolean;endTurn:boolean}> {
      if(!isToolName(request.name))return refuse('INVALID_INPUT','Herramienta no disponible.');
      const args=agentArgs.safeParse(request.input);
      if(!args.success)return refuse('INVALID_INPUT','Argumentos inválidos: se espera {caso} con el nombre de la carpeta del caso.');
      const name=request.name,caso=args.data.caso;
      if(asked)return pause('Ya hay una confirmación pendiente; espera la respuesta de la usuaria.');
      if(caso!==id){const r=await read(caso);if(!r.ok)return out('proveedor_leer_solicitud',r);switchCase(r.data.solicitud.id);}
      if(name==='proveedor_leer_solicitud')return out(name,await read(caso));
      if(name==='proveedor_mapear_campos'||name==='proveedor_generar_formulario') {
        let mapped=name==='proveedor_generar_formulario'?maps.get(caso):undefined;
        if(!mapped) {
          const r=await read(caso);if(!r.ok)return out('proveedor_leer_solicitud',r);
          const m=await call('proveedor_mapear_campos',{caso,campos:r.data.campos});
          if(m.ok)maps.set(caso,m);
          if(name==='proveedor_mapear_campos'||!m.ok)return out('proveedor_mapear_campos',m);
          mapped=m;
        }
        formId=null;packageId=null;packageReady=false;
        const g=await call('proveedor_generar_formulario',{caso,mapeo:mapped.data});
        if(g.ok)formId=g.data.artefacto.id;
        return out(name,g);
      }
      // Acciones con efecto: el modelo solo puede pedirlas; el servidor pregunta y termina el turno (CA3).
      if(name==='proveedor_armar_paquete') {
        if(!formId)return refuse('NOT_FOUND','Genera primero el formulario de este caso con proveedor_generar_formulario.');
        ask('proveedor_armar_paquete',formId);
        return pause('Se pidió confirmación explícita a la usuaria para armar el paquete. El turno termina; no hagas más llamadas.');
      }
      if(packageId&&!packageReady)return refuse('INCOMPLETE','El paquete no está listo para firma (soportes vencidos o ausentes). No se propone el envío; indica qué soportes actualizar.');
      if(packageId){ask('proveedor_simular_envio',packageId);return pause('Se pidió confirmación explícita a la usuaria para simular el envío. El turno termina.');}
      if(formId){ask('proveedor_armar_paquete',formId,'Para simular el envío primero debo armar el paquete para firma. ¿Confirmas que lo prepare? Responde «sí» en tu próximo turno; después te pediré confirmar el envío simulado.');return pause('El envío necesita un paquete: se pidió confirmación para armarlo. El turno termina.');}
      return refuse('NOT_FOUND','Primero procesa el caso: genera el formulario y después el paquete.');
    }
    async function agentLoop(userText:string):Promise<'done'|'unavailable'> {
      const system=await agentSystemPrompt();
      conversation.push({role:'user',text:`[Caso activo: ${id}]\n${userText}`});
      for(let first=true;;first=false) {
        step();
        const reply=await runtime.converse(system,conversation,agentTools);
        if(!reply||!reply.ok) {
          if(first)return 'unavailable';
          send({type:'message',text:runtime.lastError||'El modelo no respondió. La sesión sigue disponible.'});return 'done';
        }
        const {text:said,toolCalls,raw,stop}=reply.data;
        conversation.push({role:'assistant',text:said,toolCalls,raw});
        if(said)send({type:'message',text:said});
        if(stop==='refusal'){send({type:'message',text:'El modelo declinó la solicitud. Puedes continuar con los comandos del chat.'});return 'done';}
        if(!toolCalls.length) {
          if(stop==='max_tokens')send({type:'message',text:'La respuesta del modelo quedó incompleta. Aumenta LLM_MAX_OUTPUT_TOKENS.'});
          return 'done';
        }
        const results:{id:string;content:string;isError:boolean}[]=[];let endTurn=false;
        try {
          for(const request of toolCalls){const r=await runTool(request);results.push({id:request.id,content:r.content,isError:r.isError});endTurn||=r.endTurn;}
        } finally {
          // Cada llamada pedida recibe un resultado, aunque el turno se corte (tope de iteraciones o error).
          for(const request of toolCalls.slice(results.length))results.push({id:request.id,content:JSON.stringify({ok:false,error:{code:'LIMIT_REACHED',message:'No se ejecutó: el turno terminó antes.'}}),isError:true});
          conversation.push({role:'user',toolResults:results});
        }
        if(endTurn)return 'done';
      }
    }
    try {
      if(!caseId.safeParse(id).success) {send({type:'message',text:'Selecciona un caso válido.'});return;}
      const mentioned=text.match(/\b[a-z]{2}-[a-z0-9-]+\b/)?.[0];
      let selected:Awaited<ReturnType<typeof executePublic<'proveedor_leer_solicitud'>>>|null=null;
      if(mentioned&&mentioned!==id){selected=await call('proveedor_leer_solicitud',{caso:mentioned});if(!selected.ok)return;id=selected.data.solicitud.id;send({type:'case_selected',caseId:id});}
      if(id!==current){gate.clear();formId=null;packageId=null;packageReady=false;current=id;evidenceResults=[];recentQuestions=[];}
      if(selected?.ok)reads.set(id,selected);
      const pending=gate.status();
      const confirmed=gate.userTurn(text);
      send({type:'thinking',active:true});
      if(confirmed) {
        send({type:'confirmation',state:'confirmed',action:confirmed.action});
        if(confirmed.action==='proveedor_armar_paquete') {
          packageId=null;packageReady=false;
          evidenceResults=evidenceResults.filter(item=>!['proveedor_armar_paquete','proveedor_simular_envio'].includes(item.name));
          const r=await call(confirmed.action,{caso:id});
          if(r.ok){
            packageId=r.data.paquete.id;packageReady=r.data.listo_para_firma;
            const vencidos=r.data.soportes.filter(s=>s.estado!=='disponible').map(s=>s.tipo);
            send({type:'message',text:`Paquete para firma: ${r.data.ruta}\nListo para firma: ${r.data.listo_para_firma?'sí':'no'}\nCampos faltantes: ${r.data.campos_faltantes.join(', ')||'ninguno'}\nSoportes ausentes: ${r.data.soportes_faltantes.join(', ')||'ninguno'}\nSoportes vencidos o sin archivo: ${vencidos.join(', ')||'ninguno'}\nFirma: ${r.data.firma}`});
            // RN3: un paquete bloqueado no se propone para envío; se indica qué actualizar.
            if(r.data.listo_para_firma)ask('proveedor_simular_envio',packageId);
            else send({type:'message',text:`No propongo el envío: el paquete no está listo para firma. Actualiza estos soportes y vuelve a procesar el caso: ${[...r.data.soportes_faltantes,...vencidos].join(', ')}.`});
          }
        } else {
          const r=await call(confirmed.action,{caso:id,confirmado:true});
          if(r.ok)send({type:'message',text:r.data.mensaje});
        }
        // El modelo se entera en su próximo turno de lo que ejecutó el servidor tras la confirmación.
        const last=history.filter(e=>e.type==='tool_result').at(-1);
        if(conversation.length&&last)conversation.push({role:'user',text:`${text}

[El servidor ejecutó la acción confirmada ${confirmed.action}] ${forModel(confirmed.action,last.result as Parameters<typeof forModel>[1])}`});
        return;
      }
      // Con clave y un proveedor que lo admite, Claude conduce el turno llamando herramientas.
      const useModel=!localIntent(text)&&!!process.env.LLM_API_KEY&&runtime.canConverse;
      if(useModel) {
        if(pending)send({type:'confirmation',state:'cancelled',action:pending.action});
        if(await agentLoop(text)==='done')return;
        send({type:'message',text:`No pude usar el modelo: ${runtime.lastError||'sin respuesta'} Continúo con los comandos del chat.`});
      }
      if(!useModel&&!localIntent(text)&&process.env.LLM_API_KEY)step();
      const {intent,fallback}=useModel?{intent:keywordIntent(text)??'ayuda',fallback:false}:await chooseIntent(text,runtime);
      // «envía» sobre la pregunta del paquete la reformula; no es una cancelación para la usuaria.
      if(!useModel && pending && !(pending.action==='proveedor_armar_paquete' && (intent==='simular'||intent==='paquete')))send({type:'confirmation',state:'cancelled',action:pending.action});
      if(fallback)send({type:'message',text:'El clasificador LLM no está disponible. '+(runtime.lastError||'Puedes continuar con los comandos del chat.')});
      if(intent==='consulta') {
        const read=selected??await call('proveedor_leer_solicitud',{caso:id});
        if(!read.ok)return;
        const mapped=await call('proveedor_mapear_campos',{caso:id,campos:read.data.campos});
        if(!mapped.ok)return;
        if(process.env.LLM_API_KEY)step();
        const answer=await answerQuestion(text,collectEvidence(evidenceResults),recentQuestions,runtime);
        send({type:'message',text:answer.ok?answer.text:answer.error});
        recentQuestions=[...recentQuestions,text].slice(-4);
      } else if(intent==='leer' || intent==='resumen') {
        const r=selected??await call('proveedor_leer_solicitud',{caso:id});
        if(r.ok)send({type:'message',text:JSON.stringify(r.data,null,2)});
      } else if(intent==='mapear') {
        const read=selected??await call('proveedor_leer_solicitud',{caso:id});
        if(read.ok)await call('proveedor_mapear_campos',{caso:id,campos:read.data.campos});
      } else if(intent==='formulario' || intent==='preparar') {
        formId=null;packageId=null;
        evidenceResults=evidenceResults.filter(item=>!['proveedor_generar_formulario','proveedor_armar_paquete','proveedor_simular_envio'].includes(item.name));
        const read=selected??await call('proveedor_leer_solicitud',{caso:id});
        if(!read.ok)return;
        const mapped=await call('proveedor_mapear_campos',{caso:id,campos:read.data.campos});
        if(!mapped.ok)return;
        const m=mapped.data,evaluation=m.evaluacion_soportes;
        const actualizar=[...evaluation.faltantes,...evaluation.soportes.filter(s=>s.estado!=='disponible').map(s=>`${s.tipo} (${s.estado}${s.vigencia_hasta?`, vigencia ${s.vigencia_hasta}`:''})`)];
        const summary=(form:string)=>`Resumen del caso ${id}\nFormulario: ${form}\nCampos llenos (${m.llenos.length}): ${m.llenos.map(f=>f.etiqueta).join(', ')||'ninguno'}\nCampos faltantes: ${m.faltantes.map(f=>f.etiqueta).join(', ')||'ninguno'}\nRequieren confirmación: ${m.requiere_confirmacion.map(f=>`${f.etiqueta} (${f.nota})`).join(', ')||'ninguno'}\nListo para firma según soportes: ${evaluation.listo_para_firma?'sí':'no'}\nSoportes a actualizar: ${actualizar.join(', ')||'ninguno'}`;
        const r=await call('proveedor_generar_formulario',{caso:id,mapeo:m});
        // HU-5: sin formulario, el reporte de soportes y faltantes se entrega igual.
        if(!r.ok){send({type:'message',text:`${summary('no generado')}\nAvisos: ${m.advertencias.join(' ')}`});return;}
        formId=r.data.artefacto.id;
        send({type:'message',text:summary(r.data.ruta)});
        if(r.data.formato_no_soportado){send({type:'message',text:'Formato no soportado: portal web. Usa valores-portal.md y gestiona el registro manualmente; no compartas credenciales en el chat.'});return;}
        if(intent==='preparar')ask('proveedor_armar_paquete',formId);
      } else if(intent==='paquete') {
        if(formId)ask('proveedor_armar_paquete',formId);
        else send({type:'message',text:'Primero pide «procesa el caso» o «formulario» para generar el borrador.'});
      } else if(intent==='simular') {
        if(packageId)ask('proveedor_simular_envio',packageId);
        // El envío requiere un paquete: se pide primero esa confirmación y después la del envío.
        else if(formId)ask('proveedor_armar_paquete',formId,'Para simular el envío primero debo armar el paquete para firma. ¿Confirmas que lo prepare? Responde «sí» en tu próximo turno; después te pediré confirmar el envío simulado.');
        else send({type:'message',text:'Primero pide «procesa el caso» para generar el formulario y el paquete.'});
      } else send({type:'message',text:'Selecciona un caso y usa: leer, mapear, formulario, preparar, paquete, simular o resumen. «Preparar» lee y genera el borrador; solicita confirmación antes de empaquetar. Ninguna acción realiza envíos reales.'});
    } catch(error) {
      gate.clear();
      if(typeof error==='object'&&error!==null&&'turnLimit' in error){send({type:'message',text:'Se alcanzó el tope de iteraciones del turno. Los resultados obtenidos permanecen en el historial; revisa sus faltantes antes de continuar.'});return;}
      send({type:'message',text:'No se pudo completar el turno. La sesión sigue disponible; vuelve a intentar el comando.'});
    } finally {
      busy=false;send({type:'thinking',active:false});send({type:'done'});
    }
  }
  return {chat,tools,history,runtime,sessionId};
}
