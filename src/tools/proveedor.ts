import { readFile, writeFile, mkdir, realpath, readdir } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { zipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import { contracts, solicitud, plantilla, support, maestroSchema, artifact, type ToolName, type ToolResult, type CriticalAction, type mapping, type packageData } from '../contracts/proveedor.js';

class ControlledFault {
  constructor(readonly code: 'INVALID_INPUT'|'NOT_FOUND'|'INVALID_FIXTURE'|'IO_ERROR'|'CONFIRMATION_REQUIRED'|'INCOMPLETE'|'PORTAL_MANUAL', readonly message: string) {}
}
export type Authorization = (action: CriticalAction, caseId: string, artifactId: string) => boolean;
type Artifact = z.infer<typeof artifact>;
type RecordFile = { meta:Artifact; path:string; caseId:string; kind:'formulario'|'paquete'; mapping?:z.infer<typeof mapping>; package?:z.infer<typeof packageData> };
export function createProveedorTools(options: { fixturesRoot?:string; outputRoot?:string; authorize?:Authorization; today?:()=>string } = {}) {
  const root = resolve(options.fixturesRoot ?? 'fixtures/reto-01');
  const output = resolve(options.outputRoot ?? 'outputs', randomUUID());
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
  async function readCase(id:string) {
    const s = await json(`casos/${id}/solicitud.json`,solicitud);
    if(s.id!==id) throw new ControlledFault('INVALID_FIXTURE','El identificador de solicitud no coincide con el caso.');
    return s;
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
    const master = await json('maestro.json',maestroSchema);
    const campos = fields.map(f=> {
      const campo = Object.hasOwn(glossary,f.etiqueta) ? glossary[f.etiqueta]! : null;
      let value:unknown = master;
      if(campo) for(const segment of campo.split('.')) {
        value = value!==null && typeof value==='object' && Object.hasOwn(value,segment) ? (value as Record<string,unknown>)[segment] : undefined;
      } else value=undefined;
      const valid = ['string','number','boolean'].includes(typeof value);
      return {...f, obligatorio:f.obligatorio??true, campo, valor:valid?value as string|number|boolean:null, estado:!campo?'sin_equivalencia' as const:valid?'mapeado' as const:'sin_dato' as const, fuente:valid?`maestro.json#${campo}`:null};
    });
    return {caso_id:id,formato:s.formato,campos,faltantes_obligatorios:campos.filter(f=>f.obligatorio&&f.estado!=='mapeado').map(f=>f.etiqueta),advertencias:[
      'El glosario define equivalencias; no acredita identificaciones fiscales locales ni aceptación legal en otro país.',
      ...(s.formato==='portal'?['Portal: gestión manual; no se accede a credenciales ni se automatiza el navegador.']:[])
    ]};
  }
  async function save(id:string,kind:RecordFile['kind'],name:string,mime:string,bytes:Uint8Array):Promise<Artifact> {
    await mkdir(output,{recursive:true});
    const uuid=randomUUID(), path=resolve(output,`${uuid}-${name}`);
    await writeFile(path,bytes,{flag:'wx',mode:0o600});
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
  const implementations:{[N in ToolName]:(input:z.infer<(typeof contracts)[N]['input']>)=>Promise<unknown>}={
    async proveedor_leer_solicitud({caso_id}) {
      const s=await readCase(caso_id);
      const required=await json(`casos/${caso_id}/soportes-exigidos.json`,z.array(z.string().min(1)));
      return {solicitud:s,soportes_exigidos:required,fuente:`casos/${caso_id}/solicitud.json`,portal_manual:s.formato==='portal'};
    },
    async proveedor_mapear_campos({caso_id}) { return map(caso_id); },
    async proveedor_generar_formulario({caso_id}) {
      const m=await map(caso_id);
      if(m.formato==='portal') throw new ControlledFault('PORTAL_MANUAL','Este caso requiere completar el portal manualmente; no existe formulario adjunto.');
      let bytes:Uint8Array;
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
      const a=await save(caso_id,'formulario',`formulario-borrador.${m.formato}`,m.formato==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'application/pdf',bytes);
      records.get(a.id)!.mapping=m;
      return {caso_id,artefacto:a,mapeo:m,borrador:true,firma:'pendiente',advertencias:['Plantilla binaria original no suministrada: documento reconstruido desde el mapa JSON.',...m.advertencias]};
    },
    async proveedor_armar_paquete({caso_id,formulario_id,fecha_evaluacion}) {
      const s=await readCase(caso_id);
      if(s.formato==='portal') throw new ControlledFault('PORTAL_MANUAL','El portal requiere gestión manual.');
      const form=record(formulario_id,caso_id,'formulario');
      authorize('proveedor_armar_paquete',caso_id,formulario_id);
      const at=fecha_evaluacion??today();
      if(at>today()) throw new ControlledFault('INVALID_INPUT','No se permite evaluar el paquete a una fecha futura.');
      const required=await json(`casos/${caso_id}/soportes-exigidos.json`,z.array(z.string()));
      const index=await json('soportes/index.json',z.array(support));
      if(new Set(index.map(x=>x.tipo)).size!==index.length) throw new ControlledFault('INVALID_FIXTURE','Índice de soportes ambiguo.');
      const m=form.mapping!;
      const formBytes=new Uint8Array(await readFile(form.path));
      if(createHash('sha256').update(formBytes).digest('hex')!==form.meta.sha256) throw new ControlledFault('IO_ERROR','El formulario cambió después de su generación. Vuelve a generar el borrador.');
      const files:Record<string,Uint8Array>={[form.meta.nombre]:formBytes};
      const statuses:z.infer<typeof packageData>['soportes']=[];
      const missing:string[]=[];
      for(const type of required) {
        const item=index.find(i=>i.tipo===type);
        if(!item){missing.push(type);continue;}
        let status:'disponible'|'vencido'|'archivo_faltante'=item.vigencia_hasta!==null&&item.vigencia_hasta<at?'vencido':'disponible';
        try { const bytes=await readFile(await safePath(`soportes/${item.archivo}`)); if(status==='disponible')files[`soportes/${item.archivo}`]=bytes; }
        catch(e) { if((e as NodeJS.ErrnoException).code==='ENOENT') status='archivo_faltante';else throw e; }
        statuses.push({...item,estado:status,fuente:`soportes/index.json#${type}`});
      }
      const details={caso_id,formulario:form.meta,fecha_evaluacion:at,soportes:statuses,soportes_faltantes:missing,campos_faltantes:m.faltantes_obligatorios,listo_para_simular:missing.length===0&&statuses.every(s=>s.estado==='disponible')&&m.faltantes_obligatorios.length===0,firma:'pendiente' as const,advertencias:['Paquete de demostración: soportes ficticios y formulario sin firma. No enviar como registro real.','Vigencia evaluada con fechas del índice; antigüedad de emisión y aceptación extranjera requieren revisión humana.']};
      files['manifiesto.json']=strToU8(JSON.stringify(details,null,2));
      const a=await save(caso_id,'paquete','paquete-borrador.zip','application/zip',zipSync(files));
      const data={...details,paquete:a};records.get(a.id)!.package=data;
      return data;
    },
    async proveedor_simular_envio({caso_id,paquete_id}) {
      const s=await readCase(caso_id);
      if(s.formato==='portal') throw new ControlledFault('PORTAL_MANUAL','El portal requiere gestión manual.');
      const r=record(paquete_id,caso_id,'paquete');
      authorize('proveedor_simular_envio',caso_id,paquete_id);
      if(!r.package?.listo_para_simular) throw new ControlledFault('INCOMPLETE','El paquete tiene campos o soportes pendientes y no puede simularse.');
      const p=r.package;
      // Un paquete aprobado ayer no conserva vigencia automáticamente hoy.
      if(p.soportes.some(x=>x.vigencia_hasta!==null&&x.vigencia_hasta<today())) throw new ControlledFault('INCOMPLETE','Un soporte venció desde la evaluación; vuelva a preparar el paquete.');
      return {caso_id,paquete_id,destinatario:s.de,estado:'simulado',envio_real:false,firma:'pendiente',mensaje:'Simulación local del paquete borrador completada. No se envió correo, no se cargó un portal y no se firmó ningún documento.'};
    }
  };
  async function execute<N extends ToolName>(name:N,input:unknown):Promise<z.infer<(typeof contracts)[N]['output']>> {
    const contract=contracts[name];
    if(!contract)return {ok:false,error:{code:'INVALID_INPUT',message:'Herramienta no permitida.',retryable:false}} as z.infer<(typeof contracts)[N]['output']>;
    const parsed=contract.input.safeParse(input);
    if(!parsed.success)return {ok:false,error:{code:'INVALID_INPUT',message:'Entrada inválida para la herramienta.',retryable:false}} as z.infer<(typeof contracts)[N]['output']>;
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
    return (valid.success?valid.data:{ok:false,error:{code:'INVALID_OUTPUT',message:'La salida no cumple el contrato de la herramienta.',retryable:false}}) as z.infer<(typeof contracts)[N]['output']>;
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
  return {execute,listCases,download};
}
