import { z } from 'zod';
import type { LlmAdapter, Message, ToolDefinition } from './adapter.js';
import { OpenAIAdapter } from './openai.js';
const positive=(value:unknown,fallback:number,max:number)=>z.coerce.number().int().min(1).max(max).safeParse(value).data??fallback;
export function modelLimits() {return {
 iterations:positive(process.env.AGENT_MAX_ITERATIONS,25,25),
 sessionTokens:positive(process.env.LLM_MAX_SESSION_TOKENS,100000,1000000),
 outputTokens:positive(process.env.LLM_MAX_OUTPUT_TOKENS,500,2000),
 dailyTokens:positive(process.env.LLM_MAX_DAILY_TOKENS,1000000,10000000),
 timeoutMs:positive(process.env.LLM_TIMEOUT_MS,15000,60000)
};}
// Límite global conservador por proceso: crear otra sesión no reinicia este contador.
let day='',dailyReserved=0;
export function createModelRuntime(adapter:LlmAdapter=new OpenAIAdapter(),limits=modelLimits()) {
 let reserved=0;
 let lastError='';
 return {
  adapter,limits,
  get reservedTokens(){return reserved;},get lastError(){return lastError;},
  async request(messages:Message[],tools:ToolDefinition[],name:string,schema:unknown):Promise<unknown> {
   if((process.env.LLM_PROVIDER??'openai')!==adapter.provider){lastError='Proveedor LLM no soportado por el adaptador configurado.';return null;}
   // Un token consume al menos un byte UTF-8; se reserva la carga completa más margen y salida máxima.
   const upper=Buffer.byteLength(JSON.stringify({messages,tools,schema}),'utf8')+1024+limits.outputTokens;
   const now=new Date().toISOString().slice(0,10);if(day!==now){day=now;dailyReserved=0;}
   if(reserved+upper>limits.sessionTokens || dailyReserved+upper>limits.dailyTokens){lastError='Se alcanzó el límite de tokens de la sesión o del servidor. Los comandos sin LLM siguen disponibles.';return null;}
   reserved+=upper;dailyReserved+=upper;
   const reply=await adapter.enviar(messages,tools,{name,schema,maxOutputTokens:limits.outputTokens,timeoutMs:limits.timeoutMs});
   if(!reply.ok){lastError=reply.error.message;return null;}
   // No se devuelven reservas: también se cuentan solicitudes fallidas y respuestas sin usage.
   lastError='';return reply.data;
  }
 };
}
export type ModelRuntime=ReturnType<typeof createModelRuntime>;
