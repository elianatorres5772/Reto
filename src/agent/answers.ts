import { z } from 'zod';

export const answerSchema = z.object({
  status: z.enum(['answered', 'not_available', 'out_of_scope']),
  evidence_ids: z.array(z.number().int().nonnegative()).max(20)
}).strict();
export const answerJsonSchema = {
  type:'object',properties:{status:{type:'string',enum:['answered','not_available','out_of_scope']},evidence_ids:{type:'array',items:{type:'integer'},maxItems:20}},required:['status','evidence_ids'],additionalProperties:false
};
export type Evidence = {id:number;label:string;value:string;source:string};
export function collectEvidence(results: {name:string;data:unknown}[]): Evidence[] {
  const evidence:Evidence[]=[];
  const add=(label:string,value:unknown,source:string)=> {
    if(value===null || value===undefined)return;
    evidence.push({id:evidence.length,label,value:typeof value==='boolean'?(value?'Sí':'No'):String(value),source});
  };
  for(const {name,data} of results) {
    const walk=(value:unknown,path:string)=> {
      if(value===null)return;
      if(Array.isArray(value)) {
        if(value.length===0)add(path,'Sin elementos reportados',name);
        else value.forEach((item,i)=>walk(item,`${path} (${i+1})`));
      } else if(typeof value==='object' && value) {
        const obj=value as Record<string,unknown>;
        // Presentar cada campo con su etiqueta de plantilla y su estado real.
        if(typeof obj.etiqueta==='string' && 'estado' in obj && 'valor' in obj) {
          add(obj.etiqueta,obj.valor,name);
          add(`Estado de ${obj.etiqueta}`,obj.estado,name);
          add(`Fuente de ${obj.etiqueta}`,obj.fuente,name);
        } else Object.entries(obj).forEach(([key,item])=>walk(item,`${path ? path+' · ':''}${key.replaceAll('_',' ')}`));
      } else add(path,value,name);
    };
    walk(data,'');
  }
  return evidence;
}
export function renderAnswer(raw:unknown,evidence:Evidence[]):string|null {
  const parsed=answerSchema.safeParse(raw);
  if(!parsed.success)return null;
  const {status,evidence_ids:ids}=parsed.data;
  if(status!=='answered') {
    if(ids.length)return null;
    return status==='out_of_scope'?'Puedo ayudarte con la solicitud seleccionada, sus campos, soportes y borradores. Pregunta sobre ese proceso.':'Las herramientas no han retornado información que permita responder esa pregunta. No completaré ese dato por suposición.';
  }
  if(!ids.length || new Set(ids).size!==ids.length || ids.some(id=>!evidence[id] || evidence[id].id!==id))return null;
  return 'Según las herramientas del caso seleccionado:\n\n'+ids.map(id=>{
    const e=evidence[id]!;
    return `• ${e.label}: ${e.value}\n  Fuente: ${e.source}`;
  }).join('\n\n');
}
