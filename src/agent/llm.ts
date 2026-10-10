import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { answerJsonSchema, renderAnswer, type Evidence } from './answers.js';
export const intentSchema=z.enum(['leer','mapear','formulario','preparar','paquete','simular','resumen','ayuda','consulta']);
export type Intent=z.infer<typeof intentSchema>;
export function localIntent(text:string):Intent|null {
  const t=text.trim().toLocaleLowerCase('es');
  if(/^(sí|si|no|confirmo)[.!]?$/.test(t))return 'ayuda';
  const commands:Record<string,Intent>={leer:'leer',solicitud:'leer',mapear:'mapear',campos:'mapear',formulario:'formulario',generar:'formulario',preparar:'preparar',paquete:'paquete',empaquetar:'paquete',simular:'simular',enviar:'simular',resumen:'resumen',ayuda:'ayuda'};
  return commands[t]??null;
}
async function requestModel(payload:unknown,name:string,schema:unknown):Promise<unknown> {
  try {
    const prompt=await readFile(new URL('../../agent/prompt.md',import.meta.url),'utf8');
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.LLM_API_KEY}`},
      body:JSON.stringify({model:process.env.LLM_MODEL??'gpt-4.1-mini',messages:[{role:'system',content:prompt},{role:'user',content:JSON.stringify(payload)}],temperature:0,max_tokens:500,response_format:{type:'json_schema',json_schema:{name,strict:true,schema}}})
    });
    if(!response.ok)return null;
    const wire=z.object({choices:z.array(z.object({message:z.object({content:z.string()})})).min(1)}).safeParse(await response.json());
    return wire.success?JSON.parse(wire.data.choices[0]!.message.content):null;
  } catch {return null;}
}
export async function chooseIntent(text:string):Promise<{intent:Intent;fallback:boolean}> {
  const local=localIntent(text);
  if(local)return {intent:local,fallback:false};
  if(!process.env.LLM_API_KEY)return {intent:'consulta',fallback:false};
  const raw=await requestModel({stage:'intent',question:text},'intent',{type:'object',properties:{intent:{type:'string',enum:intentSchema.options}},required:['intent'],additionalProperties:false});
  const parsed=z.object({intent:intentSchema}).strict().safeParse(raw);
  return parsed.success?{intent:parsed.data.intent,fallback:false}:{intent:'ayuda',fallback:true};
}
export async function answerQuestion(question:string,evidence:Evidence[],recentQuestions:string[]):Promise<{ok:true;text:string}|{ok:false;error:string}> {
  if(!process.env.LLM_API_KEY)return {ok:false,error:'Las preguntas en lenguaje natural requieren configurar LLM_API_KEY en el archivo .env del servidor y reiniciarlo. Puedes continuar con los botones y comandos.'};
  const raw=await requestModel({stage:'answer',question,recent_questions:recentQuestions,evidence},'grounded_answer',answerJsonSchema);
  const text=renderAnswer(raw,evidence);
  return text?{ok:true,text}:{ok:false,error:'No fue posible obtener una respuesta validada del LLM. Revisa la clave, el saldo, el modelo y la conexión del servidor. Puedes seguir usando los comandos y consultar los resultados de las herramientas.'};
}
