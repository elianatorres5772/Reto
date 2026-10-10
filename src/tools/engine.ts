import { readFile, writeFile, mkdir, realpath, readdir, access, rm } from 'node:fs/promises';
import { resolve, sep, relative } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import { contracts, solicitud, plantilla, support, maestroSchema, artifact, type ToolName, type ToolResult, type CriticalAction, type mapping, type packageData } from '../contracts/proveedor.js';
import { writeAudit } from './audit.js';

class ControlledFault {
  constructor(readonly code: 'INVALID_INPUT'|'NOT_FOUND'|'INVALID_FIXTURE'|'IO_ERROR'|'CONFIRMATION_REQUIRED'|'INCOMPLETE'|'PORTAL_MANUAL', readonly message: string) {}
}
export type Authorization = (action: CriticalAction, caseId: string, artifactId: string) => boolean;
type Artifact = z.infer<typeof artifact>;
type RecordFile = { meta:Artifact; path:string; caseId:string; kind:'formulario'|'paquete'|'simulacion'; mapping?:z.infer<typeof mapping>; package?:z.infer<typeof packageData> };
export function createProveedorTools(options: { fixturesRoot?:string; outputRoot?:string; authorize?:Authorization; today?:()=>string; sessionId?:string } = {}) {
  const root = resolve(options.fixturesRoot ?? 'fixtures/reto-01');
  const output = resolve(options.outputRoot ?? process.env.OUTPUT_ROOT ?? 'out');
  const sessionId=options.sessionId??randomUUID();
  const privateOutput=resolve(output,'.sesiones',sessionId);
  const latestForms=new Map<string,string>(),latestPackages=new Map<string,string>();
  const outputAllowed=output!==root && !output.startsWith(root+sep);
  const records = new Map<string,RecordFile>();
  const today = options.today ?? (()=>new Date().toISOString().slice(0,10));
  async function safePath(relative:string) {
    const base = await realpath(root);
    const path = await realpath(resolve(base, relative));
    if (!path.startsWith(base+sep)) throw new ControlledFault('INVALID_FIXTURE','Ruta del fixture no permitida.');
    return path;
  }
  async function json<T extends z.ZodTypeAny>(relative:string,schema:T):Promise<z.infer<T>> {
    const raw = await readFile(await safePath(relative),'utf8');
    const parsed = schema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new ControlledFault('INVALID_FIXTURE','El archivo no cumple el contrato del fixture.');
    return parsed.data;
  }
  async function repositoryPath(file:string) {
    try {await access(resolve(root,'repositorio'));return `repositorio/${file}`;}catch{return file;}
  }
  const fiscal:Record<string,string>={CO:'NIT',EC:'RUC',PE:'RUC',PA:'RUC',HN:'RTN'};
  const ambiguous=(label:string)=>/identificaci[oó]n tributaria|identificaci[oó]n fiscal/i.test(label);
  async function readCase(id:string) {
    const s = await json(`casos/${id}/solicitud.json`,solicitud);
    if(s.id!==id) throw new ControlledFault('INVALID_FIXTURE','El identificador de solicitud no coincide con el caso.');
    return s;
  }
  async function evaluateSupports(id:string,at:string) {
    const required=await json(`casos/${id}/soportes-exigidos.json`,z.array(z.string()));
    const index=await json(await repositoryPath('soportes/index.json'),z.array(support));
    if(new Set(index.map(x=>x.tipo)).size!==index.length)throw new ControlledFault('INVALID_FIXTURE','Índice de soportes ambiguo.');
    const statuses:z.infer<typeof packageData>['soportes']=[],missing:string[]=[];
    const files:Record<string,Uint8Array>={};
    for(const type of required){
      const item=index.find(i=>i.tipo===type);
      if(!item){missing.push(type);continue;}
      let estado:'disponible'|'vencido'|'archivo_faltante'=item.vigencia_hasta!==null&&item.vigencia_hasta<at?'vencido':'disponible';
      try {files[`soportes/${item.archivo}`]=new Uint8Array(await readFile(await safePath(await repositoryPath(`soportes/${item.archivo}`))));}
      catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')estado='archivo_faltante';else throw error;}
      statuses.push({...item,estado,fuente:`soportes/index.json#${type}`});
    }
    return {files,evaluation:{fecha_evaluacion:at,soportes:statuses,faltantes:missing,listo_para_firma:missing.length===0&&statuses.every(s=>s.estado==='disponible')}};
  }
  async function map(id:string):Promise<z.infer<typeof mapping>> {
    const s = await readCase(id);
    const fields = await json(`casos/${id}/${s.formato==='xlsx'?'plantilla-celdas.json':'plantilla-campos.json'}`,plantilla);
    if(s.formato==='xlsx' && fields.some(f=>!f.hoja || !f.celda_valor || !f.celda_etiqueta)) throw new ControlledFault('INVALID_FIXTURE','Mapa de celdas XLSX incompleto.');
    const positions = new Set<string>();
    for(const f of fields) {
      if(f.celda_valor) {
        const key=`${f.hoja}/${f.celda_valor}`;
        if(positions.has(key)) throw new ControlledFault('INVALID_FIXTURE','El mapa contiene destinos duplicados.');
        positions.add(key);
      }
    }
    const glossary = await json('glosario-campos.json',z.record(z.string()));
    const master = await json(await repositoryPath('maestro.json'),maestroSchema);
    const campos = fields.map(f=> {
      const campo = Object.hasOwn(glossary,f.etiqueta) ? glossary[f.etiqueta]! : null;
      let value:unknown = master;
      if(campo) for(const segment of campo.split('.')) {
        value = value!==null && typeof value==='object' && Object.hasOwn(value,segment) ? (value as Record<string,unknown>)[segment] : undefined;
      } else value=undefined;
      const valid = ['string','number','boolean'].includes(typeof value);
      const foreign=campo==='nit' && s.pais!=='CO';
      const review=valid && (foreign || ambiguous(f.etiqueta));
      return {...f, obligatorio:f.obligatorio??true, campo, valor:valid?value as string|number|boolean:null,
        estado:!valid?'faltante' as const:review?'requiere_confirmacion' as const:'lleno' as const,
        fuente:valid?`maestro.json#${campo}`:null,confianza:!valid?0:review?0.7:1,
        nota:foreign?'identificador extranjero':review?'Etiqueta ambigua: revisar equivalente del país':null,
        equivalente_pais:campo==='nit'?fiscal[s.pais]??null:null};
    });
    const {evaluation}=await evaluateSupports(id,today());
    return {evaluacion_soportes:evaluation,caso_id:id,formato:s.formato,campos,llenos:campos.filter(f=>f.estado==='lleno'),faltantes:campos.filter(f=>f.estado==='faltante'),requiere_confirmacion:campos.filter(f=>f.estado==='requiere_confirmacion'),faltantes_obligatorios:campos.filter(f=>f.obligatorio&&f.estado==='faltante').map(f=>f.etiqueta),advertencias:[
      'El glosario define equivalencias; no acredita identificaciones fiscales locales ni aceptación legal en otro país.',
      ...(s.formato==='portal'?['Portal: gestión manual; no se accede a credenciales ni se automatiza el navegador.']:[])
    ]};
  }
  async function save(id:string,kind:RecordFile['kind'],name:string,mime:string,bytes:Uint8Array):Promise<Artifact> {
    if(!outputAllowed)throw new ControlledFault('IO_ERROR','La salida no puede estar dentro de fixtures.');
    await mkdir(resolve(privateOutput,id),{recursive:true});
    await mkdir(resolve(output,id),{recursive:true});
    const uuid=randomUUID(), path=resolve(privateOutput,id,`${uuid}-${name}`);
    await writeFile(path,bytes,{flag:'wx',mode:0o600});
    await writeFile(resolve(output,id,name),bytes,{mode:0o600});
    const meta={id:uuid,nombre:name,mime,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
    records.set(uuid,{meta,path,caseId:id,kind});
    return meta;
  }
  function record(id:string,caseId:string,kind:RecordFile['kind']) {
    const r=records.get(id);
    if(!r || r.caseId!==caseId || r.kind!==kind) throw new ControlledFault('NOT_FOUND','Artefacto no disponible para este caso y sesión.');
    return r;
  }
  function authorize(action:CriticalAction,id:string,artifactId:string) {
    if(!options.authorize?.(action,id,artifactId)) throw new ControlledFault('CONFIRMATION_REQUIRED','Se requiere pregunta explícita y respuesta afirmativa en el turno inmediatamente anterior.');
  }
  const route=(id:string,name:string)=>'out/'+relative(output,resolve(output,id,name)).split(sep).join('/');
  const implementations:{[N in ToolName]:(input:z.infer<(typeof contracts)[N]['input']>)=>Promise<unknown>}={
    async proveedor_leer_solicitud({caso_id}) {
      const s=await readCase(caso_id);
      const required=await json(`casos/${caso_id}/soportes-exigidos.json`,z.array(z.string().min(1)));
      let fields:z.infer<typeof plantilla>=[],advertencias:string[]=[];
      try {fields=await json(`casos/${caso_id}/${s.formato==='xlsx'?'plantilla-celdas.json':'plantilla-campos.json'}`,plantilla);}catch{advertencias=['No se pudo leer la plantilla; la solicitud y los soportes siguen disponibles.'];}
      const campos=fields.map(f=>({...f,requiere_confirmacion:ambiguous(f.etiqueta)||(s.pais!=='CO'&&['NIT','RUC','RTN'].includes(f.etiqueta)),equivalente_pais:ambiguous(f.etiqueta)||['NIT','RUC','RTN'].includes(f.etiqueta)?fiscal[s.pais]??null:null}));
      return {solicitud:s,pais:s.pais,cliente:s.cliente,formato:s.formato,campos,soportes:required,advertencias,soportes_exigidos:required,fuente:`casos/${caso_id}/solicitud.json`,portal_manual:s.formato==='portal'};
    },
    async proveedor_mapear_campos({caso_id}) { return map(caso_id); },
    async proveedor_generar_formulario({caso_id}) {
      const m=await map(caso_id);
      let bytes:Uint8Array;
      if(m.formato==='portal') {
        const rows=m.campos.map(f=>`| ${f.etiqueta.replaceAll('|','\\|')} | ${f.valor===null?'[FALTANTE]':String(f.valor).replaceAll('|','\\|')} | ${f.estado} | ${f.fuente??'Sin fuente'} |`);
        bytes=strToU8('# Formato no soportado: portal web\n\nGestión manual. No se accedió al portal. Firma y envío humanos.\n\n| Campo | Valor | Estado | Fuente |\n|---|---|---|---|\n'+rows.join('\n'));
      } else
      if(m.formato==='xlsx') {
        const book=new ExcelJS.Workbook();
        for(const f of m.campos) {
          const sheet=book.getWorksheet(f.hoja!)??book.addWorksheet(f.hoja!);
          sheet.getCell(f.celda_etiqueta!).value=f.etiqueta;
          sheet.getCell(f.celda_valor!).value=f.valor;
          sheet.getColumn(1).width=35;sheet.getColumn(2).width=45;sheet.getColumn(3).width=65;
        }
        const notes=book.addWorksheet('Revision borrador');
        notes.addRows([['BORRADOR RECONSTRUIDO: no es la plantilla original'],['Firma del representante legal pendiente'],...m.faltantes_obligatorios.map(f=>['Campo pendiente',f]),...m.advertencias.map(a=>[a])]);
        bytes=new Uint8Array(await book.xlsx.writeBuffer());
      } else {
        const pdf=await PDFDocument.create(); const font=await pdf.embedFont(StandardFonts.Helvetica);
        let page=pdf.addPage([842,595]),y=560;
        const lines=['BORRADOR RECONSTRUIDO - Firma pendiente',...m.campos.map(f=>`${f.etiqueta}: ${f.valor===null?'[PENDIENTE]':String(f.valor)}`),'No sustituye la plantilla PDF original.'];
        for(const line of lines) {
          if(y<40){page=pdf.addPage([842,595]);y=560;}
          page.drawText(line,{x:30,y,size:10,font});y-=24;
        }
        bytes=await pdf.save();
      }
      const a=await save(caso_id,'formulario',m.formato==='portal'?'valores-portal.md':`formulario.${m.formato}`,m.formato==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':m.formato==='pdf'?'application/pdf':'text/markdown',bytes);
      records.get(a.id)!.mapping=m;latestForms.set(caso_id,a.id);latestPackages.delete(caso_id);
      return {caso_id,ruta:route(caso_id,a.nombre),formato:m.formato,formato_no_soportado:m.formato==='portal',artefacto:a,mapeo:m,borrador:true,firma:'pendiente',advertencias:['Plantilla binaria original no suministrada: documento reconstruido desde el mapa JSON.',...m.advertencias]};
    },
    async proveedor_armar_paquete({caso_id,formulario_id,fecha_evaluacion}) {
      const s=await readCase(caso_id);
      if(s.formato==='portal') throw new ControlledFault('PORTAL_MANUAL','El portal requiere gestión manual.');
      const form=record(formulario_id,caso_id,'formulario');
      authorize('proveedor_armar_paquete',caso_id,formulario_id);
      const at=fecha_evaluacion??today();
      if(at>today()) throw new ControlledFault('INVALID_INPUT','No se permite evaluar el paquete a una fecha futura.');
      const {files:soporteFiles,evaluation}=await evaluateSupports(caso_id,at);
      const m=form.mapping!;
      const formBytes=new Uint8Array(await readFile(form.path));
      if(createHash('sha256').update(formBytes).digest('hex')!==form.meta.sha256)throw new ControlledFault('IO_ERROR','El formulario cambió después de su generación. Vuelve a generar el borrador.');
      const files:Record<string,Uint8Array>={[form.meta.nombre]:formBytes,...soporteFiles};
      const statuses=evaluation.soportes,missing=evaluation.faltantes;
      const checklist='# Checklist para firma\n\n'+statuses.map(s=>`- ${s.tipo}: ${s.estado} (vigencia: ${s.vigencia_hasta??'no informada'})`).join('\n')+'\n'+missing.map(t=>`- ${t}: ausente`).join('\n')+'\n\n## Campos faltantes\n'+m.faltantes.map(f=>`- ${f.etiqueta}`).join('\n')+'\n\n## Revisión de equivalencias\n'+m.requiere_confirmacion.map(f=>`- ${f.etiqueta}: ${f.nota}; equivalente ${f.equivalente_pais??'pendiente'}`).join('\n');
      const ready=missing.length===0&&statuses.every(s=>s.estado==='disponible');
      const correo=`# Borrador de correo — pendiente de revisión humana\n\nPara: ${s.de}\nAsunto: Registro como proveedor — documentación para revisión\n\nSe adjunta el formulario y los soportes de la solicitud seleccionada para revisión y firma del representante legal. Consulte el checklist para identificar pendientes. Este borrador no acredita firma ni aceptación del registro.\n\nNo se ha enviado este correo.\n`;
      const details={caso_id,ruta:route(caso_id,'paquete'),listo_para_firma:ready,checklist:route(caso_id,'paquete/checklist.md'),borrador_correo:route(caso_id,'paquete/borrador-correo.md'),formulario:form.meta,fecha_evaluacion:at,soportes:statuses,soportes_faltantes:missing,campos_faltantes:m.faltantes.map(f=>f.etiqueta),listo_para_simular:ready,firma:'pendiente' as const,advertencias:['Paquete de demostración: soportes ficticios y formulario sin firma. No enviar como registro real.','Vigencia evaluada con fechas del índice; antigüedad de emisión y aceptación extranjera requieren revisión humana.']};
      files['checklist.md']=strToU8(checklist);
      files['borrador-correo.md']=strToU8(correo);
      files['manifiesto.json']=strToU8(JSON.stringify(details,null,2));
      const packageDir=resolve(output,caso_id,'paquete');
      await rm(packageDir,{recursive:true,force:true});await mkdir(packageDir,{recursive:true});
      for(const [name,bytes] of Object.entries(files)){const target=resolve(packageDir,name);await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,bytes,{mode:0o600});}
      const a=await save(caso_id,'paquete','paquete-borrador.zip','application/zip',zipSync(files));
      const data={...details,paquete:a};records.get(a.id)!.package=data;latestPackages.set(caso_id,a.id);
      return data;
    },
    async proveedor_simular_envio({caso_id,paquete_id}) {
      const s=await readCase(caso_id);
      if(s.formato==='portal') throw new ControlledFault('PORTAL_MANUAL','El portal requiere gestión manual.');
      const r=record(paquete_id,caso_id,'paquete');
      authorize('proveedor_simular_envio',caso_id,paquete_id);
      if(!r.package?.listo_para_simular) throw new ControlledFault('INCOMPLETE','El paquete tiene soportes ausentes o vencidos y no puede simularse.');
      const p=r.package;
      // Un paquete aprobado ayer no conserva vigencia automáticamente hoy.
      if(p.soportes.some(x=>x.vigencia_hasta!==null&&x.vigencia_hasta<today())) throw new ControlledFault('INCOMPLETE','Un soporte venció desde la evaluación; vuelva a preparar el paquete.');
      const text=`# ENVÍO SIMULADO\n\nDestinatario: ${s.de}\nPaquete: ${paquete_id}\n\nSimulación local confirmada. No se envió correo, no se cargó un portal y no se firmó ningún documento.\n`;
      const a=await save(caso_id,'simulacion','ENVIO-SIMULADO.md','text/markdown',strToU8(text));
      return {caso_id,ruta:route(caso_id,a.nombre),artefacto:a,paquete_id,destinatario:s.de,estado:'simulado',envio_real:false,firma:'pendiente',mensaje:'Simulación local del paquete borrador completada. No se envió correo, no se cargó un portal y no se firmó ningún documento.'};
    }
  };
  async function execute<N extends ToolName>(name:N,input:unknown):Promise<z.infer<(typeof contracts)[N]['output']>> {
    const contract=contracts[name];
    if(!contract)return {ok:false,error:{code:'INVALID_INPUT',message:'Herramienta no permitida.',retryable:false}} as z.infer<(typeof contracts)[N]['output']>;
    const parsed=contract.input.safeParse(input);
    if(!parsed.success){if(outputAllowed)await writeAudit(output,sessionId,null,name,false,'INVALID_INPUT');return {ok:false,error:{code:'INVALID_INPUT',message:'Entrada inválida para la herramienta.',retryable:false}} as z.infer<(typeof contracts)[N]['output']>;}
    let outcome:unknown;
    try {
      // Dispatch correlacionado: parsed.data ya fue validado por el contrato de name.
      const implementation=implementations[name] as (input:typeof parsed.data)=>Promise<unknown>;
      const data=await implementation(parsed.data);
      outcome={ok:true,data};
    } catch(e) {
      const controlled=e instanceof ControlledFault;
      const missing=(e as NodeJS.ErrnoException)?.code==='ENOENT';
      const invalid=e instanceof SyntaxError || e instanceof z.ZodError;
      outcome={ok:false,error:{code:controlled?e.code:missing?'NOT_FOUND':invalid?'INVALID_FIXTURE':'IO_ERROR',message:controlled?e.message:missing?'Archivo o caso no encontrado.':invalid?'Archivo JSON inválido.':'No se pudo completar la operación; la sesión continúa disponible.',retryable:!controlled&&!invalid}};
    }
    const valid=contract.output.safeParse(outcome);
    const final=(valid.success?valid.data:{ok:false,error:{code:'INVALID_OUTPUT',message:'La salida no cumple el contrato de la herramienta.',retryable:false}}) as z.infer<(typeof contracts)[N]['output']>;
    const id=(parsed.data as {caso_id:string}).caso_id;
    if(!outputAllowed || !await writeAudit(output,sessionId,id,name,final.ok,final.ok?'Operación completada':final.error.code))return {ok:false,error:{code:'AUDIT_ERROR',message:'No se pudo guardar el registro de auditoría. Revisa la salida antes de repetir la acción.',retryable:true}} as z.infer<(typeof contracts)[N]['output']>;
    return final;
  }
  async function listCases():Promise<ToolResult<{id:string;cliente:string;formato:string}[]>> {
    try {
      const ids=(await readdir(await safePath('casos'),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name).sort();
      const data=[];
      for(const id of ids) { const valid=contracts.proveedor_leer_solicitud.input.safeParse({caso_id:id}); if(!valid.success)continue;const s=await readCase(id);data.push({id:s.id,cliente:s.cliente,formato:s.formato}); }
      return {ok:true,data};
    }catch{return {ok:false,error:{code:'INVALID_FIXTURE',message:'No se pudo leer el catálogo de casos.',retryable:true}};}
  }
  async function download(id:string):Promise<{meta:Artifact;bytes:Uint8Array}|null> {
    try {const r=records.get(id);return r?{meta:r.meta,bytes:new Uint8Array(await readFile(r.path))}:null;}catch{return null;}
  }
  return {execute,listCases,download,latestForm:(id:string)=>latestForms.get(id),latestPackage:(id:string)=>latestPackages.get(id),outputRoot:output,outputAllowed};
}
