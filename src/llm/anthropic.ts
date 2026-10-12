import Anthropic from '@anthropic-ai/sdk';
import type { LlmAdapter, Message, ToolDefinition, ModelReply, AgentTurn, AgentReply } from './adapter.js';
export const ANTHROPIC_DEFAULT_MODEL='claude-opus-5-5';
type Options={name:string;schema:unknown;maxOutputTokens:number;timeoutMs:number};
type Failure={ok:false;error:{code:'TIMEOUT'|'PROVIDER_ERROR'|'INVALID_RESPONSE';message:string}};
// El esquema de herramientas sale de zod-to-json-schema; la API solo necesita el objeto JSON Schema.
function inputSchema(parameters:unknown):Anthropic.Beta.BetaTool.InputSchema {
 const {$schema:_ignored,...schema}=(parameters??{}) as Record<string,unknown>;
 return {type:'object',...schema};
}
const toolList=(herramientas:ToolDefinition[])=>herramientas.map(t=>({name:t.name,description:t.description,input_schema:inputSchema(t.parameters)}));
// Errores del proveedor en lenguaje claro, sin la clave ni trazas.
function failure(error:unknown):Failure {
 if(error instanceof Anthropic.APIConnectionTimeoutError)return {ok:false,error:{code:'TIMEOUT',message:'El proveedor LLM excedió el tiempo de espera. La sesión continúa disponible.'}};
 if(error instanceof Anthropic.AuthenticationError||error instanceof Anthropic.PermissionDeniedError)return {ok:false,error:{code:'PROVIDER_ERROR',message:'El proveedor LLM rechazó la clave. Revisa LLM_API_KEY y el acceso al modelo.'}};
 if(error instanceof Anthropic.RateLimitError)return {ok:false,error:{code:'PROVIDER_ERROR',message:'El proveedor LLM limitó las solicitudes. Espera un momento y vuelve a intentarlo.'}};
 if(error instanceof Anthropic.APIError)return {ok:false,error:{code:'PROVIDER_ERROR',message:'El proveedor LLM rechazó la petición. Revisa clave, saldo y modelo configurado.'}};
 if(error instanceof SyntaxError)return {ok:false,error:{code:'INVALID_RESPONSE',message:'Respuesta del proveedor LLM inválida.'}};
 return {ok:false,error:{code:'PROVIDER_ERROR',message:'No se pudo conectar con el proveedor LLM. La sesión continúa disponible.'}};
}
// Turnos neutrales → mensajes de la API. El turno del asistente se reenvía tal cual (append-only).
function toMessages(turnos:AgentTurn[]):Anthropic.Beta.BetaMessageParam[] {
 return turnos.map(turn=>{
  if(turn.role==='assistant')return {role:'assistant',content:turn.raw as Anthropic.Beta.BetaContentBlockParam[]};
  const content:Anthropic.Beta.BetaContentBlockParam[]=(turn.toolResults??[]).map(r=>({type:'tool_result',tool_use_id:r.id,content:r.content,is_error:r.isError}));
  if(turn.text)content.push({type:'text',text:turn.text});
  return {role:'user',content};
 });
}
export class AnthropicAdapter implements LlmAdapter {
 readonly provider='anthropic';
 private readonly client:Anthropic;
 constructor(readonly model=process.env.LLM_MODEL||ANTHROPIC_DEFAULT_MODEL,key=process.env.LLM_API_KEY??''){
  this.client=new Anthropic({apiKey:key,maxRetries:1});
 }
 async enviar(mensajes:Message[],herramientas:ToolDefinition[],options:Options):Promise<ModelReply> {
  try {
   const system=mensajes.filter(m=>m.role==='system').map(m=>m.content).join('\n\n');
   const turns=mensajes.filter(m=>m.role==='user'||m.role==='assistant').map(m=>({role:m.role as 'user'|'assistant',content:m.content}));
   const response=await this.client.beta.messages.create({
    model:this.model,
    max_tokens:options.maxOutputTokens,
    system,
    messages:turns,
    // Las herramientas se describen al modelo, pero en este modo la aplicación decide su ejecución.
    ...(herramientas.length?{tools:toolList(herramientas),tool_choice:{type:'none' as const}}:{}),
    // Clasificar intención y elegir evidencia es una tarea corta: esfuerzo bajo y salida JSON con esquema.
    output_config:{effort:'low',format:{type:'json_schema',schema:options.schema as Record<string,unknown>}},
    // Si un clasificador de seguridad declina, la API reintenta en el modelo de respaldo adecuado.
    betas:['server-side-fallback-2026-07-01'],
    fallbacks:'default'
   },{timeout:options.timeoutMs});
   if(response.stop_reason==='refusal')return {ok:false,error:{code:'PROVIDER_ERROR',message:'El modelo declinó la solicitud. Puedes continuar con los comandos del chat.'}};
   if(response.stop_reason==='max_tokens')return {ok:false,error:{code:'INVALID_RESPONSE',message:'La respuesta del modelo quedó incompleta. Aumenta LLM_MAX_OUTPUT_TOKENS.'}};
   const text=response.content.find((block):block is Anthropic.Beta.BetaTextBlock=>block.type==='text')?.text;
   if(!text)return {ok:false,error:{code:'INVALID_RESPONSE',message:'Respuesta del proveedor LLM inválida.'}};
   return {ok:true,data:JSON.parse(text),usage:{input:response.usage.input_tokens,output:response.usage.output_tokens}};
  } catch(error) {return failure(error);}
 }
 async conversar(system:string,turnos:AgentTurn[],herramientas:ToolDefinition[],options:{maxOutputTokens:number;timeoutMs:number}):Promise<AgentReply> {
  try {
   const response=await this.client.beta.messages.create({
    model:this.model,
    max_tokens:options.maxOutputTokens,
    system,
    messages:toMessages(turnos),
    tools:toolList(herramientas),
    tool_choice:{type:'auto'},
    output_config:{effort:'medium'},
    // El prefijo (herramientas, prompt, conocimiento y turnos previos) se repite en cada llamada del ciclo.
    cache_control:{type:'ephemeral'},
    betas:['server-side-fallback-2026-07-01'],
    fallbacks:'default'
   },{timeout:options.timeoutMs});
   const text=response.content.filter((block):block is Anthropic.Beta.BetaTextBlock=>block.type==='text').map(block=>block.text).join('\n').trim();
   const toolCalls=response.content.filter((block):block is Anthropic.Beta.BetaToolUseBlock=>block.type==='tool_use').map(block=>({id:block.id,name:block.name,input:block.input}));
   const stop=response.stop_reason==='refusal'?'refusal':response.stop_reason==='max_tokens'?'max_tokens':toolCalls.length?'tool_use':'end';
   return {ok:true,data:{text,toolCalls,raw:response.content,stop},usage:{input:response.usage.input_tokens,output:response.usage.output_tokens}};
  } catch(error) {return failure(error);}
 }
}
