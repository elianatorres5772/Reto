import { z } from 'zod';
import type { LlmAdapter, Message, ToolDefinition, AgentTurn, AgentReply } from './adapter.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter, ANTHROPIC_DEFAULT_MODEL } from './anthropic.js';
// Proveedor activo: anthropic por defecto; openai se conserva como alternativa del mismo contrato.
export const llmProvider=()=>process.env.LLM_PROVIDER||'anthropic';
export const llmModel=()=>process.env.LLM_MODEL||(llmProvider()==='openai'?'gpt-4.1-mini':ANTHROPIC_DEFAULT_MODEL);
export function createAdapter():LlmAdapter {return llmProvider()==='openai'?new OpenAIAdapter(llmModel()):new AnthropicAdapter(llmModel());}
const positive=(value:unknown,fallback:number,max:number)=>z.coerce.number().int().min(1).max(max).safeParse(value).data??fallback;
export function modelLimits() {return {
 iterations:positive(process.env.AGENT_MAX_ITERATIONS,25,25),
 sessionTokens:positive(process.env.LLM_MAX_SESSION_TOKENS,500000,5000000),
 outputTokens:positive(process.env.LLM_MAX_OUTPUT_TOKENS,4000,16000),
 dailyTokens:positive(process.env.LLM_MAX_DAILY_TOKENS,5000000,50000000),
 timeoutMs:positive(process.env.LLM_TIMEOUT_MS,30000,120000)
};}
// Límite global conservador por proceso: crear otra sesión no reinicia este contador.
let day='',dailyReserved=0;
export function createModelRuntime(adapter:LlmAdapter=createAdapter(),limits=modelLimits()) {
 let reserved=0;
 let lastError='';
 return {
  adapter,limits,
  get reservedTokens(){return reserved;},get lastError(){return lastError;},
  get canConverse(){return llmProvider()===adapter.provider&&typeof adapter.conversar==='function';},
  async request(messages:Message[],tools:ToolDefinition[],name:string,schema:unknown):Promise<unknown> {
   if(llmProvider()!==adapter.provider){lastError='Proveedor LLM no soportado por el adaptador configurado.';return null;}
   if(!reserve({messages,tools,schema}))return null;
   const reply=await adapter.enviar(messages,tools,{name,schema,maxOutputTokens:limits.outputTokens,timeoutMs:limits.timeoutMs});
   if(!reply.ok){lastError=reply.error.message;return null;}
   // No se devuelven reservas: también se cuentan solicitudes fallidas y respuestas sin usage.
   lastError='';return reply.data;
  },
  async converse(system:string,turns:AgentTurn[],tools:ToolDefinition[]):Promise<AgentReply|null> {
   if(llmProvider()!==adapter.provider||!adapter.conversar){lastError='El proveedor configurado no admite el ciclo con herramientas.';return null;}
   if(!reserve({system,turns,tools}))return null;
   const reply=await adapter.conversar(system,turns,tools,{maxOutputTokens:limits.outputTokens,timeoutMs:limits.timeoutMs});
   lastError=reply.ok?'':reply.error.message;
   return reply;
  }
 };
 // Un token consume al menos un byte UTF-8; se reserva la carga completa más margen y salida máxima.
 function reserve(payload:unknown):boolean {
  const upper=Buffer.byteLength(JSON.stringify(payload),'utf8')+1024+limits.outputTokens;
  const now=new Date().toISOString().slice(0,10);if(day!==now){day=now;dailyReserved=0;}
  if(reserved+upper>limits.sessionTokens || dailyReserved+upper>limits.dailyTokens){lastError='Se alcanzó el límite de tokens de la sesión o del servidor. Los comandos sin LLM siguen disponibles.';return false;}
  reserved+=upper;dailyReserved+=upper;return true;
 }
}
export type ModelRuntime=ReturnType<typeof createModelRuntime>;
