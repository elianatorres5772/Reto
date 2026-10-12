import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, rm, readFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { createProveedorTools } from '../src/tools/proveedor.js';
import { contracts } from '../src/contracts/proveedor.js';
import { ConfirmationGate } from '../src/agent/confirmation.js';
const co='co-industrias-delta';
const ec='ec-corp-andina';
const hn='hn-agroexport-sula';
const pa='pa-logistica-istmo';
async function tempFixtures() {const dir=await mkdtemp(join(tmpdir(),'proveedor-test-'));await cp('fixtures/reto-01',dir,{recursive:true});return dir;}
function authorized(date='2026-08-25',fixturesRoot?:string) {
  const gate=new ConfirmationGate();
  const tools=createProveedorTools({fixturesRoot,outputRoot:join(tmpdir(),'proveedor-artifacts'),today:()=>date,authorize:(...args)=>gate.consume(...args)});
  const confirm=(action:'proveedor_armar_paquete'|'proveedor_simular_envio',caseId:string,artifactId:string)=>{gate.ask({action,caseId,artifactId,question:'¿Confirmas?'});assert.ok(gate.userTurn('sí'));};
  return {tools,gate,confirm};
}
test('Contratos estrictos rechazan traversal, fechas imposibles y autoridad enviada por el cliente',async()=>{
  const tools=createProveedorTools();
  const r=await tools.execute('proveedor_leer_solicitud',{caso_id:'../../maestro'});assert.equal(r.ok,false);
  const r2=await tools.execute('proveedor_leer_solicitud',{caso_id:co,confirmed:true});assert.equal(r2.ok,false);
  assert.equal(contracts.proveedor_armar_paquete.input.safeParse({caso_id:co,formulario_id:randomUUID(),fecha_evaluacion:'2026-02-30'}).success,false);
  const valid=await tools.execute('proveedor_leer_solicitud',{caso_id:co});assert.ok(valid.ok);
});
test('Maestro y glosario conservan cuenta como texto, país de origen y procedencia',async()=>{
  const r=await createProveedorTools().execute('proveedor_mapear_campos',{caso_id:co});assert.ok(r.ok);
  const field=r.data.campos.find(f=>f.etiqueta==='Número de cuenta');assert.equal(field?.valor,'03100012345');assert.equal(field?.fuente,'maestro.json#banco.numero_cuenta');
  const h=await createProveedorTools().execute('proveedor_mapear_campos',{caso_id:hn});assert.ok(h.ok);
  assert.equal(h.data.campos.find(f=>f.etiqueta==='País')?.valor,'CO');
  assert.equal(h.data.campos.find(f=>f.etiqueta==='Referencias comerciales')?.valor,null);
  assert.deepEqual(h.data.faltantes_obligatorios,['Referencias comerciales']);
  const e=await createProveedorTools().execute('proveedor_mapear_campos',{caso_id:ec});assert.ok(e.ok);
  assert.equal(e.data.campos.find(f=>f.etiqueta==='Número de contribuyente especial')?.valor,null);
  assert.deepEqual(e.data.faltantes_obligatorios,[]);
});
test('JSON corrupto, caso inexistente y plantilla inválida son errores recuperables',async()=>{
  const dir=await tempFixtures();
  try {
    const tools=createProveedorTools({fixturesRoot:dir});
    const missing=await tools.execute('proveedor_leer_solicitud',{caso_id:'co-inexistente'});assert.equal(missing.ok,false);if(!missing.ok)assert.equal(missing.error.code,'NOT_FOUND');
    await writeFile(join(dir,'casos',co,'plantilla-celdas.json'),'{ corrupto');
    const partial=await tools.execute('proveedor_mapear_campos',{caso_id:co});assert.ok(partial.ok);
    if(partial.ok){assert.equal(partial.data.plantilla_valida,false);assert.equal(partial.data.campos.length,0);assert.ok(partial.data.evaluacion_soportes.soportes.length>0);assert.match(partial.data.advertencias[0]!,/plantilla del caso está corrupta/);}
    const corrupt=await tools.execute('proveedor_generar_formulario',{caso_id:co});assert.equal(corrupt.ok,false);if(!corrupt.ok)assert.equal(corrupt.error.code,'INVALID_FIXTURE');
    await writeFile(join(dir,'casos',co,'plantilla-celdas.json'),'[{"etiqueta":"NIT"}]');
    const invalid=await tools.execute('proveedor_generar_formulario',{caso_id:co});assert.equal(invalid.ok,false);
    const good=await tools.execute('proveedor_leer_solicitud',{caso_id:ec});assert.ok(good.ok);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('No permite symlinks de fixtures que escapen del directorio autorizado',{skip:process.platform==='win32'&&'Windows exige privilegios para crear symlinks'},async()=>{
  const dir=await tempFixtures();
  try {
    await rm(join(dir,'maestro.json'));await symlink(join(process.cwd(),'fixtures/reto-01/maestro.json'),join(dir,'maestro.json'));
    const r=await createProveedorTools({fixturesRoot:dir}).execute('proveedor_mapear_campos',{caso_id:co});assert.equal(r.ok,false);if(!r.ok)assert.equal(r.error.code,'INVALID_FIXTURE');
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('Genera XLSX real y PDF legible, no modifica fixtures',async()=>{
  const before=await readFile('fixtures/reto-01/maestro.json','utf8');
  const {tools}=authorized();
  const r=await tools.execute('proveedor_generar_formulario',{caso_id:co});assert.ok(r.ok);
  const file=await tools.download(r.data.artefacto.id);assert.ok(file);
  const book=new ExcelJS.Workbook();await book.xlsx.load(Buffer.from(file.bytes) as unknown as Parameters<typeof book.xlsx.load>[0]);
  assert.equal(book.getWorksheet('Datos Bancarios')?.getCell('C5').value,'03100012345');
  assert.equal(book.getWorksheet('Datos Proveedor')?.getCell('C4').value,'900123456');
  assert.ok(book.getWorksheet('Revision borrador'));
  const p=await tools.execute('proveedor_generar_formulario',{caso_id:ec});assert.ok(p.ok);
  const pf=await tools.download(p.data.artefacto.id);assert.ok(pf);assert.ok((await PDFDocument.load(pf.bytes)).getPageCount()>0);
  assert.equal(await readFile('fixtures/reto-01/maestro.json','utf8'),before);
});
test('Paquete ZIP contiene formulario, soportes exigidos y manifiesto; confirma una sola vez',async()=>{
  const {tools,confirm}=authorized();
  const f=await tools.execute('proveedor_generar_formulario',{caso_id:co});assert.ok(f.ok);
  const args={caso_id:co,formulario_id:f.data.artefacto.id};
  const no=await tools.execute('proveedor_armar_paquete',args);assert.equal(no.ok,false);if(!no.ok)assert.equal(no.error.code,'CONFIRMATION_REQUIRED');
  confirm('proveedor_armar_paquete',co,args.formulario_id);
  const p=await tools.execute('proveedor_armar_paquete',args);assert.ok(p.ok);assert.equal(p.data.listo_para_simular,true);
  const zip=await tools.download(p.data.paquete.id);assert.ok(zip);
  const files=unzipSync(zip.bytes);assert.equal(Object.keys(files).length,8);assert.ok(files['formulario.xlsx']);
  const manifest=JSON.parse(strFromU8(files['manifiesto.json']!));assert.equal(manifest.firma,'pendiente');assert.equal(manifest.soportes.length,4);
  const reuse=await tools.execute('proveedor_armar_paquete',args);assert.equal(reuse.ok,false);
  const denied=await tools.execute('proveedor_simular_envio',{caso_id:co,paquete_id:p.data.paquete.id});assert.equal(denied.ok,false);
  confirm('proveedor_simular_envio',co,p.data.paquete.id);
  const s=await tools.execute('proveedor_simular_envio',{caso_id:co,paquete_id:p.data.paquete.id});assert.ok(s.ok);assert.equal(s.data.envio_real,false);assert.equal(s.data.destinatario,'compras@industrias-delta-ficticia.com');
});
test('Soportes vencidos o ausentes bloquean firma; campos faltantes no bloquean por sí solos',async()=>{
  for(const [id,at,missing] of [[co,'2026-10-09',false],[ec,'2026-08-27',true],[hn,'2026-08-29',false]] as const) {
    const {tools,confirm}=authorized(at);
    const f=await tools.execute('proveedor_generar_formulario',{caso_id:id});assert.ok(f.ok);
    confirm('proveedor_armar_paquete',id,f.data.artefacto.id);
    const p=await tools.execute('proveedor_armar_paquete',{caso_id:id,formulario_id:f.data.artefacto.id});assert.ok(p.ok);assert.equal(p.data.listo_para_simular,id===hn);assert.equal(p.data.listo_para_firma,id===hn);
    if(missing)assert.deepEqual(p.data.soportes_faltantes,['certificado_cumplimiento_tributario']);
    if(id===co)assert.equal(p.data.soportes.find(s=>s.tipo==='camara_comercio')?.estado,'vencido');
    confirm('proveedor_simular_envio',id,p.data.paquete.id);
    const s=await tools.execute('proveedor_simular_envio',{caso_id:id,paquete_id:p.data.paquete.id});assert.equal(s.ok,id===hn);if(!s.ok)assert.equal(s.error.code,'INCOMPLETE');
  }
});
test('Un archivo faltante en disco no se declara disponible',async()=>{
  const dir=await tempFixtures();
  try {
    await rm(join(dir,'soportes/rut-2026.txt'));
    const {tools,confirm}=authorized('2026-08-25',dir);
    const f=await tools.execute('proveedor_generar_formulario',{caso_id:co});assert.ok(f.ok);confirm('proveedor_armar_paquete',co,f.data.artefacto.id);
    const p=await tools.execute('proveedor_armar_paquete',{caso_id:co,formulario_id:f.data.artefacto.id});assert.ok(p.ok);assert.equal(p.data.soportes.find(s=>s.tipo==='rut')?.estado,'archivo_faltante');assert.equal(p.data.listo_para_simular,false);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('Portal genera valores copiables, no accede al sitio ni empaqueta automáticamente',async()=>{
  const tools=createProveedorTools();const r=await tools.execute('proveedor_generar_formulario',{caso_id:pa});assert.ok(r.ok);assert.equal(r.data.formato_no_soportado,true);assert.equal(r.data.artefacto.nombre,'valores-portal.md');const file=await tools.download(r.data.artefacto.id);assert.ok(file);assert.match(strFromU8(file.bytes),/Formato no soportado/);
  const p=await tools.execute('proveedor_armar_paquete',{caso_id:pa,formulario_id:randomUUID()});assert.equal(p.ok,false);if(!p.ok)assert.equal(p.error.code,'PORTAL_MANUAL');
});
test('Artefactos no se comparten entre casos o sesiones',async()=>{
  const a=authorized(),b=authorized();
  const f=await a.tools.execute('proveedor_generar_formulario',{caso_id:co});assert.ok(f.ok);
  assert.equal(await b.tools.download(f.data.artefacto.id),null);
  a.confirm('proveedor_armar_paquete',ec,f.data.artefacto.id);
  const p=await a.tools.execute('proveedor_armar_paquete',{caso_id:ec,formulario_id:f.data.artefacto.id});assert.equal(p.ok,false);if(!p.ok)assert.equal(p.error.code,'NOT_FOUND');
});
test('Revalida vencimiento al simular y rechaza fechas futuras',async()=>{
  let day='2026-08-25';
  const gate=new ConfirmationGate();
  const tools=createProveedorTools({today:()=>day,outputRoot:join(tmpdir(),'proveedor-rollover'),authorize:(...args)=>gate.consume(...args)});
  const confirm=(action:'proveedor_armar_paquete'|'proveedor_simular_envio',id:string)=>{gate.ask({action,caseId:co,artifactId:id,question:'¿Confirmas?'});gate.userTurn('sí');};
  const f=await tools.execute('proveedor_generar_formulario',{caso_id:co});assert.ok(f.ok);
  confirm('proveedor_armar_paquete',f.data.artefacto.id);
  const future=await tools.execute('proveedor_armar_paquete',{caso_id:co,formulario_id:f.data.artefacto.id,fecha_evaluacion:'2026-12-01'});assert.equal(future.ok,false);if(!future.ok)assert.equal(future.error.code,'INVALID_INPUT');
  confirm('proveedor_armar_paquete',f.data.artefacto.id);
  const p=await tools.execute('proveedor_armar_paquete',{caso_id:co,formulario_id:f.data.artefacto.id});assert.ok(p.ok);assert.equal(p.data.listo_para_simular,true);
  day='2026-10-09';confirm('proveedor_simular_envio',p.data.paquete.id);
  const s=await tools.execute('proveedor_simular_envio',{caso_id:co,paquete_id:p.data.paquete.id});assert.equal(s.ok,false);if(!s.ok)assert.equal(s.error.code,'INCOMPLETE');
});
