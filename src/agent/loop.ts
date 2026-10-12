import { z } from 'zod';
import { caseId, type ToolName } from '../contracts/proveedor.js';
import type { ToolDefinition } from '../llm/adapter.js';
import { proveedorTools } from '../tools/proveedor.js';
// Vista de las herramientas para el modelo: mismo nombre y descripción del contrato público, pero
// `campos` y `mapeo` los completa el servidor con los resultados de la sesión; el modelo no puede alterarlos.
const caso={type:'string',description:'Carpeta del caso en fixtures/reto-01/casos/ (por ejemplo, ec-corp-andina)'};
const shapes:Record<ToolName,{properties:Record<string,unknown>;required:string[]}>={
 proveedor_leer_solicitud:{properties:{caso},required:['caso']},
 proveedor_mapear_campos:{properties:{caso},required:['caso']},
 proveedor_generar_formulario:{properties:{caso},required:['caso']},
 proveedor_armar_paquete:{properties:{caso},required:['caso']},
 proveedor_simular_envio:{properties:{caso,confirmado:{type:'boolean',description:'true solo si la usuaria pidió enviar; la autorización real la verifica el servidor'}},required:['caso','confirmado']}
};
export const agentTools:ToolDefinition[]=(Object.keys(shapes) as ToolName[]).map(name=>({
 name,description:proveedorTools[name].description,
 parameters:{type:'object',properties:shapes[name].properties,required:shapes[name].required,additionalProperties:false}
}));
export const agentArgs=z.object({caso:caseId,confirmado:z.boolean().optional()}).strict();
export const isToolName=(name:string):name is ToolName=>Object.hasOwn(shapes,name);
type Result={ok:true;data:unknown}|{ok:false;error:{code:string;message:string}};
type Row=Record<string,unknown>;
const pick=(row:Row,keys:string[])=>Object.fromEntries(keys.filter(k=>row[k]!==undefined&&row[k]!==null).map(k=>[k,row[k]]));
// Resultado resumido para el modelo: etiquetas, estados, fuentes y rutas, sin valores del maestro
// (cuentas, identificaciones). El chat muestra el resultado completo en la tarjeta de la herramienta.
export function forModel(name:ToolName,result:Result):string {
 if(!result.ok)return JSON.stringify({ok:false,error:{code:result.error.code,message:result.error.message}});
 const d=result.data as Row;
 const rows=(key:string)=>(Array.isArray(d[key])?d[key]:[]) as Row[];
 if(name==='proveedor_leer_solicitud')return JSON.stringify({ok:true,data:{caso:(d.solicitud as Row).id,cliente:d.cliente,pais:d.pais,formato:d.formato,campos:rows('campos').map(f=>pick(f,['etiqueta','obligatorio','requiere_confirmacion','equivalente_pais'])),soportes_exigidos:d.soportes_exigidos,advertencias:d.advertencias}});
 if(name==='proveedor_mapear_campos'){
  const e=d.evaluacion_soportes as Row;
  return JSON.stringify({ok:true,data:{caso:d.caso_id,formato:d.formato,plantilla_valida:d.plantilla_valida,
   llenos:rows('llenos').map(f=>pick(f,['etiqueta','fuente'])),faltantes:rows('faltantes').map(f=>f.etiqueta),
   requiere_confirmacion:rows('requiere_confirmacion').map(f=>pick(f,['etiqueta','nota','equivalente_pais','confianza'])),
   evaluacion_soportes:{fecha_evaluacion:e.fecha_evaluacion,listo_para_firma:e.listo_para_firma,ausentes:e.faltantes,soportes:(e.soportes as Row[]).map(s=>pick(s,['tipo','estado','vigencia_hasta']))},
   advertencias:d.advertencias}});
 }
 if(name==='proveedor_generar_formulario')return JSON.stringify({ok:true,data:pick(d,['caso_id','ruta','formato','formato_no_soportado','firma','advertencias'])});
 if(name==='proveedor_armar_paquete')return JSON.stringify({ok:true,data:{...pick(d,['caso_id','ruta','listo_para_firma','checklist','borrador_correo','campos_faltantes','firma']),ausentes:d.soportes_faltantes,soportes:rows('soportes').map(s=>pick(s,['tipo','estado','vigencia_hasta']))}});
 return JSON.stringify({ok:true,data:pick(d,['caso_id','ruta','estado','envio_real','mensaje'])});
}
