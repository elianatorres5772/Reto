import { createProveedorTools } from '../tools/proveedor.js';
import { ConfirmationGate } from './confirmation.js';
import { chooseIntent, answerQuestion } from './llm.js';
import { collectEvidence } from './answers.js';
import { caseId, type ToolName } from '../contracts/proveedor.js';
export type ChatEvent = { type:'thinking'|'tool_call'|'tool_result'|'message'|'confirmation'|'done'; [key:string]:unknown };
export function createSession(options:Parameters<typeof createProveedorTools>[0]={}) {
  const gate=new ConfirmationGate();
  const tools=createProveedorTools({...options,authorize:(...args)=>gate.consume(...args)});
  let current:string|null=null,formId:string|null=null,packageId:string|null=null;
  const history:ChatEvent[]=[];
  let evidenceResults: {name:string;data:unknown}[]=[];
  let recentQuestions:string[]=[];
  let busy=false;
  async function chat(id:string,text:string,emit:(event:ChatEvent)=>void) {
    if(busy) {gate.clear();emit({type:'message',text:'Hay una operación en curso. Espera a que termine.'});emit({type:'done'});return;}
    busy=true;
    const send=(e:ChatEvent)=>{history.push(e);emit(e);};
    const call=async<N extends ToolName>(name:N,input:unknown)=> {
      send({type:'tool_call',name,input});
      const result=await tools.execute(name,input);
      send({type:'tool_result',name,result});
      if(result.ok) {
        evidenceResults=evidenceResults.filter(item=>item.name!==name);
        evidenceResults.push({name,data:result.data});
      } else evidenceResults=evidenceResults.filter(item=>item.name!==name);
      if(!result.ok) send({type:'message',text:result.error.message});
      return result;
    };
    const ask=(action:'proveedor_armar_paquete'|'proveedor_simular_envio',artifactId:string)=> {
      const question=action==='proveedor_armar_paquete'?'¿Confirmas que prepare el paquete borrador de este caso? Responde «sí» en tu próximo turno.':'¿Confirmas la simulación local del envío de este paquete borrador? No se enviará correo ni se firmará el formulario. Responde «sí» en tu próximo turno.';
      const p=gate.ask({action,caseId:id,artifactId,question});
      send({type:'confirmation',action:p.action,caseId:id,artifactId,question,state:'pending'});
      send({type:'message',text:question});
    };
    try {
      if(!caseId.safeParse(id).success) {send({type:'message',text:'Selecciona un caso válido.'});return;}
      if(id!==current){gate.clear();formId=null;packageId=null;current=id;evidenceResults=[];recentQuestions=[];}
      const pending=gate.status();
      const confirmed=gate.userTurn(text);
      send({type:'thinking',active:true});
      if(confirmed) {
        send({type:'confirmation',state:'confirmed',action:confirmed.action});
        if(confirmed.action==='proveedor_armar_paquete') {
          packageId=null;
          evidenceResults=evidenceResults.filter(item=>!['proveedor_armar_paquete','proveedor_simular_envio'].includes(item.name));
          const r=await call(confirmed.action,{caso_id:id,formulario_id:confirmed.artifactId});
          if(r.ok){packageId=r.data.paquete.id;send({type:'message',text:'Paquete borrador generado. Consulta el manifiesto y los pendientes en el resultado de la herramienta.'});}
        } else {
          const r=await call(confirmed.action,{caso_id:id,paquete_id:confirmed.artifactId});
          if(r.ok)send({type:'message',text:r.data.mensaje});
        }
        return;
      }
      if(pending)send({type:'confirmation',state:'cancelled',action:pending.action});
      const {intent,fallback}=await chooseIntent(text);
      if(fallback)send({type:'message',text:'El clasificador LLM no está disponible. Puedes continuar con los comandos del chat.'});
      if(intent==='consulta') {
        const read=await call('proveedor_leer_solicitud',{caso_id:id});
        if(!read.ok)return;
        const mapped=await call('proveedor_mapear_campos',{caso_id:id});
        if(!mapped.ok)return;
        const answer=await answerQuestion(text,collectEvidence(evidenceResults),recentQuestions);
        send({type:'message',text:answer.ok?answer.text:answer.error});
        recentQuestions=[...recentQuestions,text].slice(-4);
      } else if(intent==='leer' || intent==='resumen') {
        const r=await call('proveedor_leer_solicitud',{caso_id:id});
        if(r.ok)send({type:'message',text:JSON.stringify(r.data,null,2)});
      } else if(intent==='mapear') {
        await call('proveedor_mapear_campos',{caso_id:id});
      } else if(intent==='formulario' || intent==='preparar') {
        formId=null;packageId=null;
        evidenceResults=evidenceResults.filter(item=>!['proveedor_generar_formulario','proveedor_armar_paquete','proveedor_simular_envio'].includes(item.name));
        const read=await call('proveedor_leer_solicitud',{caso_id:id});
        if(!read.ok)return;
        const mapped=await call('proveedor_mapear_campos',{caso_id:id});
        if(!mapped.ok)return;
        if(read.data.portal_manual) {send({type:'message',text:'La solicitud indica un portal. Revisa el mapeo y gestiona el registro manualmente; no compartas credenciales en el chat.'});return;}
        const r=await call('proveedor_generar_formulario',{caso_id:id});
        if(r.ok){formId=r.data.artefacto.id;if(intent==='preparar')ask('proveedor_armar_paquete',formId);}
      } else if(intent==='paquete') {
        if(formId)ask('proveedor_armar_paquete',formId);
        else send({type:'message',text:'Primero ejecuta «preparar» o «formulario» para generar el borrador.'});
      } else if(intent==='simular') {
        if(packageId)ask('proveedor_simular_envio',packageId);
        else send({type:'message',text:'Primero genera y confirma el paquete borrador.'});
      } else send({type:'message',text:'Selecciona un caso y usa: leer, mapear, formulario, preparar, paquete, simular o resumen. «Preparar» lee y genera el borrador; solicita confirmación antes de empaquetar. Ninguna acción realiza envíos reales.'});
    } catch {
      gate.clear();send({type:'message',text:'No se pudo completar el turno. La sesión sigue disponible; vuelve a intentar el comando.'});
    } finally {
      busy=false;send({type:'thinking',active:false});send({type:'done'});
    }
  }
  return {chat,tools,history};
}
