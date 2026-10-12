import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { publicContracts } from '../contracts/proveedor.js';
import { createModelRuntime, type ModelRuntime } from '../llm/runtime.js';
import { proveedorTools } from '../tools/proveedor.js';
import { answerJsonSchema, renderAnswer, type Evidence } from './answers.js';
export const intentSchema=z.enum(['leer','mapear','formulario','preparar','paquete','simular','resumen','ayuda','consulta']);
export type Intent=z.infer<typeof intentSchema>;
export function localIntent(text:string):Intent|null {
  const t=text.trim().toLocaleLowerCase('es');
  if(/^(sí|si|no|confirmo)[.!]?$/.test(t))return 'ayuda';
  const commands:Record<string,Intent>={leer:'leer',solicitud:'leer',mapear:'mapear',campos:'mapear',formulario:'formulario',generar:'formulario',preparar:'preparar',paquete:'paquete',empaquetar:'paquete',simular:'simular',enviar:'simular',resumen:'resumen',ayuda:'ayuda'};
  return commands[t]??null;
}
// Frases naturales sin LLM: el orden importa ("procesa… no envíes nada" es preparar, no simular).
const keywordRules:[RegExp,Intent][]=[
 [/\b(procesa|procesar|prepara|preparar)\b/u,'preparar'],
 [/(^|\s)(env[ií]a|env[ií]alo|enviar|simula|simular)\b/u,'simular'],
 [/\b(paquete|empaqueta|empaquetar)\b/u,'paquete'],
 [/\b(formulario|genera|generar)\b/u,'formulario'],
 [/\b(mapea|mapear|campos|faltan|faltantes)\b/u,'mapear'],
 [/\b(lee|leer|solicitud|soportes|resumen)\b/u,'leer'],
 [/\b(ayuda|comandos)\b/u,'ayuda']
];
export function keywordIntent(text:string):Intent|null {
  const t=text.toLocaleLowerCase('es');
  return keywordRules.find(([pattern])=>pattern.test(t))?.[1]??null;
}
// System prompt del ciclo con herramientas: comportamiento (agent/prompt.md) + conocimiento del proceso.
export async function agentSystemPrompt():Promise<string> {
  const [prompt,knowledge]=await Promise.all([
   readFile(new URL('../../agent/prompt.md',import.meta.url),'utf8'),
   readFile(new URL('../knowledge/registro-proveedor.md',import.meta.url),'utf8')
  ]);
  return `${prompt}\n\n---\n\n${knowledge}`;
}
async function requestModel(payload:unknown,name:string,schema:unknown,runtime:ModelRuntime):Promise<unknown> {
 try {
  const [prompt,knowledge]=await Promise.all([
   readFile(new URL('../../agent/prompt.md',import.meta.url),'utf8'),
   readFile(new URL('../knowledge/registro-proveedor.md',import.meta.url),'utf8')
  ]);
  const tools=Object.entries(proveedorTools).map(([tool,definition])=>({name:tool,description:definition.description,parameters:zodToJsonSchema(publicContracts[tool as keyof typeof publicContracts].input,{$refStrategy:'none'})}));
  return runtime.request([{role:'system',content:prompt},{role:'user',content:JSON.stringify({...payload as object,process_knowledge:knowledge})}],tools,name,schema);
 } catch {return null;}
}
export async function chooseIntent(text:string,runtime:ModelRuntime=createModelRuntime()):Promise<{intent:Intent;fallback:boolean}> {
  const local=localIntent(text);
  if(local)return {intent:local,fallback:false};
  if(!process.env.LLM_API_KEY)return {intent:keywordIntent(text)??'consulta',fallback:false};
  const raw=await requestModel({stage:'intent',question:text},'intent',{type:'object',properties:{intent:{type:'string',enum:intentSchema.options}},required:['intent'],additionalProperties:false},runtime);
  const parsed=z.object({intent:intentSchema}).strict().safeParse(raw);
  return parsed.success?{intent:parsed.data.intent,fallback:false}:{intent:keywordIntent(text)??'ayuda',fallback:true};
}
export async function answerQuestion(question:string,evidence:Evidence[],recentQuestions:string[],runtime:ModelRuntime=createModelRuntime()):Promise<{ok:true;text:string}|{ok:false;error:string}> {
  if(!process.env.LLM_API_KEY)return {ok:false,error:'Las preguntas en lenguaje natural requieren configurar LLM_API_KEY en el archivo .env del servidor y reiniciarlo. Puedes continuar con los botones y comandos.'};
  const raw=await requestModel({stage:'answer',question,recent_questions:recentQuestions,evidence},'grounded_answer',answerJsonSchema,runtime);
  const text=renderAnswer(raw,evidence);
  return text?{ok:true,text}:{ok:false,error:runtime.lastError || 'No fue posible obtener una respuesta validada del LLM. Revisa la clave, el saldo, el modelo y la conexión del servidor. Puedes seguir usando los comandos y consultar los resultados de las herramientas.'};
}
