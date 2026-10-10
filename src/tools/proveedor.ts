import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { createProveedorTools } from './engine.js';
import { writeAudit } from './audit.js';
import { publicContracts, field, type ToolName } from '../contracts/proveedor.js';
export { createProveedorTools } from './engine.js';
export type { Authorization } from './engine.js';
export type ToolContext={directory:string;sessionId:string;tools?:ReturnType<typeof createProveedorTools>;authorize?:NonNullable<Parameters<typeof createProveedorTools>[0]>['authorize'];today?:()=>string};
const contextSchema=z.object({directory:z.string().min(1),sessionId:z.string().uuid()});
const sessions=new Map<string,ReturnType<typeof createProveedorTools>>();
function engine(ctx:ToolContext) {
 if(ctx.tools)return ctx.tools;
 const key=`${resolve(ctx.directory)}:${ctx.sessionId}`;
 let tools=sessions.get(key);
 if(!tools){
  if(sessions.size>=100)return null;
  tools=createProveedorTools({fixturesRoot:resolve(ctx.directory,'fixtures/reto-01'),outputRoot:resolve(ctx.directory,'out'),sessionId:ctx.sessionId,authorize:ctx.authorize,today:ctx.today});sessions.set(key,tools);
 }
 return tools;
}
export function releaseToolSession(ctx:Pick<ToolContext,'directory'|'sessionId'>) {sessions.delete(`${resolve(ctx.directory)}:${ctx.sessionId}`);}
const failure=(code:'INVALID_INPUT'|'NOT_FOUND'|'CONFIRMATION_REQUIRED'|'IO_ERROR',message:string)=>({ok:false as const,error:{code,message,retryable:false}});
function defineTool<N extends ToolName>(name:N,description:string,run:(args:z.infer<(typeof publicContracts)[N]['input']>,tools:ReturnType<typeof createProveedorTools>)=>Promise<unknown>) {
 const contract=publicContracts[name];
 return {
  description,args:contract.input.shape,
  async execute(args:unknown,ctx:ToolContext):Promise<string> {
   try {
    if(!contextSchema.safeParse(ctx).success)return JSON.stringify(failure('INVALID_INPUT','Contexto de sesión inválido.'));
    const tools=engine(ctx);
    if(tools&&!tools.outputAllowed)return JSON.stringify(failure('IO_ERROR','La salida no puede estar dentro de fixtures.'));
    if(!tools)return JSON.stringify(failure('IO_ERROR','Capacidad temporal de sesiones agotada.'));
    const input=contract.input.safeParse(args);
    if(!input.success) {
     const caso=typeof args==='object'&&args!==null&&'caso' in args?args.caso:null;
     await writeAudit(tools.outputRoot,ctx.sessionId,caso,name,false,'INVALID_INPUT');
     return JSON.stringify(failure('INVALID_INPUT','Argumentos inválidos para la herramienta.'));
    }
    const raw=await run(input.data as z.infer<(typeof publicContracts)[N]['input']>,tools);
    const result=contract.output.safeParse(raw);
    const outcome=result.success?result.data:null;
    const caso=(input.data as {caso:string}).caso;
    if(!await writeAudit(tools.outputRoot,ctx.sessionId,caso,name,!!outcome?.ok,outcome?.ok?'Contrato público completado':outcome&&!outcome.ok?outcome.error.code:'INVALID_OUTPUT'))return JSON.stringify(failure('IO_ERROR','No se pudo guardar la auditoría del contrato público.'));
    return JSON.stringify(result.success?result.data:failure('IO_ERROR','La salida de la herramienta no cumple su contrato.'));
   } catch {return JSON.stringify(failure('IO_ERROR','No se pudo completar la herramienta; la sesión continúa disponible.'));}
  }
 };
}
export const leer_solicitud=defineTool('proveedor_leer_solicitud','Lee el correo, la plantilla y los soportes exigidos del caso.',async({caso},tools)=>tools.execute('proveedor_leer_solicitud',{caso_id:caso}));
export const mapear_campos=defineTool('proveedor_mapear_campos','Mapea los campos de la plantilla al maestro y reporta faltantes y revisiones por país.',async({caso,campos},tools)=>{
 const read=await tools.execute('proveedor_leer_solicitud',{caso_id:caso});
 if(!read.ok)return read;
 const expected=read.data.campos.map(f=>field.parse(Object.fromEntries(Object.entries(f).filter(([key])=>key!=='requiere_confirmacion'&&key!=='equivalente_pais'))));
 if(!isDeepStrictEqual(campos,expected))return failure('INVALID_INPUT','Los campos deben corresponder exactamente a la plantilla del caso.');
 return tools.execute('proveedor_mapear_campos',{caso_id:caso});
});
export const generar_formulario=defineTool('proveedor_generar_formulario','Genera Excel, PDF o valores copiables para portal desde un mapeo verificado.',async({caso,mapeo},tools)=>{
 const expected=await tools.execute('proveedor_mapear_campos',{caso_id:caso});
 if(!expected.ok)return expected;
 if(!isDeepStrictEqual(expected.data,mapeo))return failure('INVALID_INPUT','El mapeo no coincide con los datos retornados por las herramientas.');
 return tools.execute('proveedor_generar_formulario',{caso_id:caso});
});
export const armar_paquete=defineTool('proveedor_armar_paquete','Prepara formulario, soportes, checklist y correo borrador tras confirmación humana.',async({caso},tools)=>{
 const id=tools.latestForm(caso);
 return id?tools.execute('proveedor_armar_paquete',{caso_id:caso,formulario_id:id}):failure('NOT_FOUND','Genera primero el formulario en esta sesión.');
});
export const simular_envio=defineTool('proveedor_simular_envio','Escribe ENVIO-SIMULADO.md solo con permiso humano del turno inmediato anterior.',async({caso,confirmado},tools)=>{
 if(!confirmado)return failure('CONFIRMATION_REQUIRED','Se requiere confirmación explícita del turno inmediato anterior.');
 const id=tools.latestPackage(caso);
 return id?tools.execute('proveedor_simular_envio',{caso_id:caso,paquete_id:id}):failure('NOT_FOUND','Prepara primero el paquete de esta sesión.');
});
export const proveedorTools={proveedor_leer_solicitud:leer_solicitud,proveedor_mapear_campos:mapear_campos,proveedor_generar_formulario:generar_formulario,proveedor_armar_paquete:armar_paquete,proveedor_simular_envio:simular_envio} as const;
export async function executePublic<N extends ToolName>(ctx:ToolContext,name:N,input:unknown):Promise<z.infer<(typeof publicContracts)[N]['output']>> {
 try {return publicContracts[name].output.parse(JSON.parse(await proveedorTools[name].execute(input,ctx))) as z.infer<(typeof publicContracts)[N]['output']>;}
 catch {return failure('IO_ERROR','Respuesta de herramienta inválida.') as z.infer<(typeof publicContracts)[N]['output']>;}
}
