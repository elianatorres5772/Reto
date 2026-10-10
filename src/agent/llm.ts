import { readFile } from 'node:fs/promises';
import { z } from 'zod';
export const intentSchema=z.enum(['leer','mapear','formulario','preparar','paquete','simular','resumen','ayuda']);
export type Intent=z.infer<typeof intentSchema>;
export function localIntent(text:string):Intent|null {
  const t=text.trim().toLocaleLowerCase('es');
  const commands:Record<string,Intent>={leer:'leer',solicitud:'leer',mapear:'mapear',campos:'mapear',formulario:'formulario',generar:'formulario',preparar:'preparar',paquete:'paquete',empaquetar:'paquete',simular:'simular',enviar:'simular',resumen:'resumen',ayuda:'ayuda'};
  return commands[t]??null;
}
export async function chooseIntent(text:string):Promise<{intent:Intent;fallback:boolean}> {
  const local=localIntent(text);
  if(local)return {intent:local,fallback:false};
  if(!process.env.LLM_API_KEY)return {intent:'ayuda',fallback:false};
  try {
    const prompt=await readFile(new URL('../../agent/prompt.md',import.meta.url),'utf8');
    const response=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.LLM_API_KEY}`},
      body:JSON.stringify({model:process.env.LLM_MODEL??'gpt-4.1-mini',messages:[{role:'system',content:prompt},{role:'user',content:text}],temperature:0,max_tokens:80,response_format:{type:'json_schema',json_schema:{name:'intent',strict:true,schema:{type:'object',properties:{intent:{type:'string',enum:intentSchema.options}},required:['intent'],additionalProperties:false}}}})
    });
    if(!response.ok)return {intent:'ayuda',fallback:true};
    const wire=z.object({choices:z.array(z.object({message:z.object({content:z.string()})})).min(1)}).safeParse(await response.json());
    if(!wire.success)return {intent:'ayuda',fallback:true};
    const parsed=z.object({intent:intentSchema}).strict().safeParse(JSON.parse(wire.data.choices[0]!.message.content));
    return parsed.success?{intent:parsed.data.intent,fallback:false}:{intent:'ayuda',fallback:true};
  } catch {return {intent:'ayuda',fallback:true};}
}
