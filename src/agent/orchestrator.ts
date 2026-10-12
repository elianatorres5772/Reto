import { randomUUID } from 'node:crypto';
import type { LlmAdapter } from '../llm/adapter.js';
import { createModelRuntime } from '../llm/runtime.js';
import { localIntent } from './llm.js';
import { createProveedorTools, executePublic } from '../tools/proveedor.js';
import { ConfirmationGate } from './confirmation.js';
import { chooseIntent, answerQuestion } from './llm.js';
import { collectEvidence } from './answers.js';
import { caseId, type ToolName } from '../contracts/proveedor.js';
export type ChatEvent = { type:'thinking'|'tool_call'|'tool_result'|'message'|'confirmation'|'done'|'case_selected'; [key:string]:unknown };
export function createSession(options:NonNullable<Parameters<typeof createProveedorTools>[0]>&{llmAdapter?:LlmAdapter}={}) {
  const gate=new ConfirmationGate();
  const sessionId=options.sessionId??randomUUID();
  const runtime=createModelRuntime(options.llmAdapter);
  const tools=createProveedorTools({...options,sessionId,authorize:(...args)=>gate.consume(...args)});
  const ctx={directory:process.cwd(),sessionId,tools};
  let current:string|null=null,formId:string|null=null,packageId:string|null=null;
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
    try {
      if(!caseId.safeParse(id).success) {send({type:'message',text:'Selecciona un caso válido.'});return;}
      const mentioned=text.match(/\b[a-z]{2}-[a-z0-9-]+\b/)?.[0];
      let selected:Awaited<ReturnType<typeof executePublic<'proveedor_leer_solicitud'>>>|null=null;
      if(mentioned&&mentioned!==id){selected=await call('proveedor_leer_solicitud',{caso:mentioned});if(!selected.ok)return;id=selected.data.solicitud.id;send({type:'case_selected',caseId:id});}
      if(id!==current){gate.clear();formId=null;packageId=null;current=id;evidenceResults=[];recentQuestions=[];}
      const pending=gate.status();
      const confirmed=gate.userTurn(text);
      send({type:'thinking',active:true});
      if(confirmed) {
        send({type:'confirmation',state:'confirmed',action:confirmed.action});
        if(confirmed.action==='proveedor_armar_paquete') {
          packageId=null;
          evidenceResults=evidenceResults.filter(item=>!['proveedor_armar_paquete','proveedor_simular_envio'].includes(item.name));
          const r=await call(confirmed.action,{caso:id});
          if(r.ok){
            packageId=r.data.paquete.id;
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
        return;
      }
      if(!localIntent(text) && process.env.LLM_API_KEY)step();
      const {intent,fallback}=await chooseIntent(text,runtime);
      // «envía» sobre la pregunta del paquete la reformula; no es una cancelación para la usuaria.
      if(pending && !(pending.action==='proveedor_armar_paquete' && (intent==='simular'||intent==='paquete')))send({type:'confirmation',state:'cancelled',action:pending.action});
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
        const r=await call('proveedor_generar_formulario',{caso:id,mapeo:mapped.data});
        if(r.ok){
          formId=r.data.artefacto.id;
          const m=r.data.mapeo,evaluation=m.evaluacion_soportes;
          const actualizar=[...evaluation.faltantes,...evaluation.soportes.filter(s=>s.estado!=='disponible').map(s=>`${s.tipo} (${s.estado}${s.vigencia_hasta?`, vigencia ${s.vigencia_hasta}`:''})`)];
          send({type:'message',text:`Resumen del caso ${id}\nFormulario: ${r.data.ruta}\nCampos llenos (${m.llenos.length}): ${m.llenos.map(f=>f.etiqueta).join(', ')||'ninguno'}\nCampos faltantes: ${m.faltantes.map(f=>f.etiqueta).join(', ')||'ninguno'}\nRequieren confirmación: ${m.requiere_confirmacion.map(f=>`${f.etiqueta} (${f.nota})`).join(', ')||'ninguno'}\nListo para firma según soportes: ${evaluation.listo_para_firma?'sí':'no'}\nSoportes a actualizar: ${actualizar.join(', ')||'ninguno'}`});
          if(r.data.formato_no_soportado){send({type:'message',text:'Formato no soportado: portal web. Usa valores-portal.md y gestiona el registro manualmente; no compartas credenciales en el chat.'});return;}
          if(intent==='preparar')ask('proveedor_armar_paquete',formId);
        }
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
