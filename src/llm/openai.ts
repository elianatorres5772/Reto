import { z } from 'zod';
import type { LlmAdapter, Message, ToolDefinition, ModelReply } from './adapter.js';
const wireSchema=z.object({choices:z.array(z.object({message:z.object({content:z.string()})})).min(1),usage:z.object({prompt_tokens:z.number().int().nonnegative(),completion_tokens:z.number().int().nonnegative()}).optional()});
export class OpenAIAdapter implements LlmAdapter {
 readonly provider='openai';
 constructor(readonly model=process.env.LLM_MODEL??'gpt-4.1-mini',private readonly key=process.env.LLM_API_KEY??''){}
 async enviar(mensajes:Message[],herramientas:ToolDefinition[],options:{name:string;schema:unknown;maxOutputTokens:number;timeoutMs:number}):Promise<ModelReply> {
  try {
   const response=await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',signal:AbortSignal.timeout(options.timeoutMs),headers:{'Content-Type':'application/json',Authorization:`Bearer ${this.key}`},
    body:JSON.stringify({model:this.model,messages:mensajes,temperature:0,max_tokens:options.maxOutputTokens,
     ...(herramientas.length?{tools:herramientas.map(t=>({type:'function',function:t})),tool_choice:'none'}:{}),
     response_format:{type:'json_schema',json_schema:{name:options.name,strict:true,schema:options.schema}}})
   });
   if(!response.ok)return {ok:false,error:{code:'PROVIDER_ERROR',message:'El proveedor LLM rechazó la petición. Revisa clave, saldo y acceso al modelo.'}};
   const wire=wireSchema.safeParse(await response.json());
   if(!wire.success)return {ok:false,error:{code:'INVALID_RESPONSE',message:'Respuesta del proveedor LLM inválida.'}};
   return {ok:true,data:JSON.parse(wire.data.choices[0]!.message.content),usage:{input:wire.data.usage?.prompt_tokens??0,output:wire.data.usage?.completion_tokens??0}};
  } catch(error) {
   const timeout=error instanceof Error && (error.name==='TimeoutError'||error.name==='AbortError');
   return {ok:false,error:{code:timeout?'TIMEOUT':'PROVIDER_ERROR',message:timeout?'El proveedor LLM excedió el tiempo de espera. La sesión continúa disponible.':'No se pudo conectar con el proveedor LLM. La sesión continúa disponible.'}};
  }
 }
}
