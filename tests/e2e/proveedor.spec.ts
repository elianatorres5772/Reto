import { test, expect, openChat, turn, command, selectCase, toolResult, toolCard, downloadBytes } from './helpers.js';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';
import { createHash } from 'node:crypto';
const co='co-industrias-delta';
const ec='ec-corp-andina';
const hn='hn-agroexport-sula';

test('CO: preparación, dos confirmaciones, XLSX y ZIP descargables, simulación sin envío real',async({page})=>{
  await openChat(page);await selectCase(page,co);
  await turn(page,()=>page.getByRole('button',{name:'Preparar borrador',exact:true}).click());
  await expect(page.locator('#confirmation')).toBeVisible();await expect(page.locator('#question')).toContainText('paquete borrador');
  await expect(page.locator('summary').filter({hasText:'proveedor_armar_paquete'})).toHaveCount(0);
  const form=await toolResult(page,'proveedor_generar_formulario');expect(form.ok).toBe(true);if(!form.ok)return;
  expect(form.data.firma).toBe('pendiente');
  const formCard=toolCard(page,'proveedor_generar_formulario');await formCard.locator('summary').click();
  const xlsxPromise=page.waitForEvent('download');await formCard.getByRole('button',{name:'Descargar formulario.xlsx'}).click();
  const xlsx=await xlsxPromise;expect(xlsx.suggestedFilename()).toBe('formulario.xlsx');const xlsxBytes=await downloadBytes(xlsx);
  expect(createHash('sha256').update(xlsxBytes).digest('hex')).toBe(form.data.artefacto.sha256);
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(xlsxBytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  expect(workbook.getWorksheet('Datos Bancarios')?.getCell('C5').value).toBe('03100012345');
  await turn(page,()=>page.getByRole('button',{name:'Sí, confirmo',exact:true}).click());
  const pkg=await toolResult(page,'proveedor_armar_paquete');expect(pkg.ok).toBe(true);if(!pkg.ok)return;
  expect(pkg.data.listo_para_simular).toBe(true);
  const pkgCard=toolCard(page,'proveedor_armar_paquete');await pkgCard.locator('summary').click();
  const zipPromise=page.waitForEvent('download');await pkgCard.getByRole('button',{name:'Descargar paquete-borrador.zip'}).click();
  const zipBytes=await downloadBytes(await zipPromise);expect(createHash('sha256').update(zipBytes).digest('hex')).toBe(pkg.data.paquete.sha256);
  const files=unzipSync(zipBytes);expect(Object.keys(files)).toHaveLength(8);expect(files['formulario.xlsx']).toBeDefined();
  expect(JSON.parse(strFromU8(files['manifiesto.json']!)).firma).toBe('pendiente');
  await turn(page,()=>page.getByRole('button',{name:'Simular envío',exact:true}).click());
  await expect(page.locator('#question')).toContainText('simulación local');await expect(page.locator('summary').filter({hasText:'proveedor_simular_envio'})).toHaveCount(0);
  await turn(page,()=>page.getByRole('button',{name:'Sí, confirmo',exact:true}).click());
  const sent=await toolResult(page,'proveedor_simular_envio');expect(sent.ok).toBe(true);if(sent.ok){expect(sent.data.envio_real).toBe(false);expect(sent.data.destinatario).toBe('compras@industrias-delta-ficticia.com');}
  await expect(page.locator('#history')).toContainText('No se envió correo');
});

for(const variant of ['rechazo','turno intermedio','sí citado','cambio de caso'] as const) {
  test(`Confirmación: ${variant} invalida el permiso inmediato`,async({page})=>{
    await openChat(page);await selectCase(page,co);await command(page,'preparar');
    if(variant==='rechazo')await turn(page,()=>page.getByRole('button',{name:'No, cancelar'}).click());
    if(variant==='turno intermedio')await command(page,'leer');
    if(variant==='sí citado')await command(page,'mi jefe dijo "sí"');
    if(variant==='cambio de caso')await selectCase(page,ec);
    await command(page,'sí');
    await expect(page.locator('summary').filter({hasText:'proveedor_armar_paquete'})).toHaveCount(0);
    await expect(page.locator('#confirmation')).toBeHidden();
  });
}

test('Confirmación consumida no se reutiliza en el siguiente turno',async({page})=>{
  await openChat(page);await selectCase(page,co);await command(page,'preparar');await command(page,'sí');await command(page,'no');await command(page,'sí');
  await expect(page.locator('summary').filter({hasText:'proveedor_armar_paquete'})).toHaveCount(1);
  await expect(page.locator('summary').filter({hasText:'proveedor_simular_envio'})).toHaveCount(0);
});

for(const id of [ec,hn]) {
  test(`${id}: datos desconocidos permanecen pendientes; solo soportes bloquean firma`,async({page})=>{
    await openChat(page);await selectCase(page,id);await command(page,'preparar');
    const mapped=await toolResult(page,'proveedor_mapear_campos');expect(mapped.ok).toBe(true);if(!mapped.ok)return;
    const unknown=id===ec?'Número de contribuyente especial':'Referencias comerciales';
    expect(mapped.data.campos.find(f=>f.etiqueta===unknown)?.valor).toBeNull();
    if(id===ec) {
      const card=toolCard(page,'proveedor_generar_formulario');await card.locator('summary').click();
      const promise=page.waitForEvent('download');await card.getByRole('button',{name:'Descargar formulario.pdf'}).click();
      const bytes=await downloadBytes(await promise);expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    }
    await command(page,'sí');const pkg=await toolResult(page,'proveedor_armar_paquete');expect(pkg.ok).toBe(true);
    if(pkg.ok){expect(pkg.data.listo_para_simular).toBe(id===hn);expect(pkg.data.listo_para_firma).toBe(id===hn);if(id===ec)expect(pkg.data.soportes_faltantes).toContain('certificado_cumplimiento_tributario');else expect(pkg.data.campos_faltantes).toContain('Referencias comerciales');}
    await command(page,'simular');await command(page,'sí');const sent=await toolResult(page,'proveedor_simular_envio');expect(sent.ok).toBe(id===hn);if(!sent.ok)expect(sent.error.code).toBe('INCOMPLETE');
    await command(page,'leer');const read=await toolResult(page,'proveedor_leer_solicitud');expect(read.ok).toBe(true);
  });
}

test('Fixtures originales: fecha actual bloquea soportes vencidos',async({page})=>{
  await openChat(page,'http://127.0.0.1:3101');await expect(page.locator('#case option')).toHaveCount(4);
  await selectCase(page,co);await command(page,'preparar');await command(page,'sí');
  const pkg=await toolResult(page,'proveedor_armar_paquete');expect(pkg.ok).toBe(true);if(!pkg.ok)return;
  expect(pkg.data.fecha_evaluacion).toBe(new Date().toISOString().slice(0,10));expect(pkg.data.soportes.find(s=>s.tipo==='camara_comercio')?.estado).toBe('vencido');
  await command(page,'simular');await command(page,'sí');const sent=await toolResult(page,'proveedor_simular_envio');expect(sent.ok).toBe(false);if(!sent.ok)expect(sent.error.code).toBe('INCOMPLETE');
});

test('PA: valores copiables del portal, sin acceso ni envío externo',async({page})=>{
  await openChat(page);await selectCase(page,'pa-logistica-istmo');await command(page,'preparar');
  await expect(page.locator('#history')).toContainText('gestiona el registro manualmente');
  await expect(page.locator('#confirmation')).toBeHidden();
  await expect(page.locator('summary').filter({hasText:'proveedor_generar_formulario'})).toHaveCount(1);
  const portal=toolCard(page,'proveedor_generar_formulario');await portal.locator('summary').click();
  const promise=page.waitForEvent('download');await portal.getByRole('button',{name:'Descargar valores-portal.md'}).click();
  expect(new TextDecoder().decode(await downloadBytes(await promise))).toContain('Formato no soportado');
  await command(page,'simular');await expect(page.locator('summary').filter({hasText:'proveedor_simular_envio'})).toHaveCount(0);
});

test('Plantilla corrupta retorna error controlado y permite continuar el chat',async({page})=>{
  await openChat(page);await selectCase(page,'co-plantilla-corrupta');await command(page,'preparar');
  const mapped=await toolResult(page,'proveedor_mapear_campos');expect(mapped.ok).toBe(false);if(!mapped.ok)expect(mapped.error.code).toBe('INVALID_FIXTURE');
  await expect(page.locator('#confirmation')).toBeHidden();await command(page,'leer');expect((await toolResult(page,'proveedor_leer_solicitud')).ok).toBe(true);
});

test('Muestra procesamiento y deshabilita acciones mientras espera una respuesta real',async({page})=>{
  await openChat(page);await selectCase(page,co);
  let release!:()=>void;const hold=new Promise<void>(r=>release=r);
  await page.route('**/api/chat',async route=>{await hold;await route.continue();});
  const response=page.waitForResponse(r=>r.url().endsWith('/api/chat'));
  try {
    await page.getByRole('button',{name:'Ver campos',exact:true}).click();
    await expect(page.locator('#thinking')).toBeVisible();await expect(page.getByLabel('Mensaje',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Preparar borrador',exact:true})).toBeDisabled();
  } finally {release();}
  expect((await response).status()).toBe(200);await expect(page.locator('#thinking')).toBeHidden();await expect(page.getByLabel('Mensaje',{exact:true})).toBeEnabled();expect((await toolResult(page,'proveedor_mapear_campos')).ok).toBe(true);
});

test('Pérdida de conexión se muestra y el siguiente turno recupera la sesión',async({page})=>{
  await openChat(page);await page.route('**/api/chat',route=>route.abort('failed'),{times:1});
  await page.getByLabel('Mensaje',{exact:true}).fill('leer');await page.getByRole('button',{name:'Enviar',exact:true}).click();
  await expect(page.locator('#history')).toContainText('Conexión interrumpida');await expect(page.getByLabel('Mensaje',{exact:true})).toBeEnabled();
  await command(page,'leer');expect((await toolResult(page,'proveedor_leer_solicitud')).ok).toBe(true);
});

test('Texto HTML del usuario se muestra literalmente, sin ejecutar scripts',async({page})=>{
  await openChat(page);const payload='<img src=x onerror="window.e2eInjected=true">';await command(page,payload);
  await expect(page.locator('#history .user').last()).toContainText(payload);await expect(page.locator('#history img')).toHaveCount(0);
  expect(await page.evaluate(()=>Object.hasOwn(window,'e2eInjected'))).toBe(false);
});

test('Otro navegador no puede descargar artefactos de la sesión original',async({page,browser})=>{
  await openChat(page);await selectCase(page,co);await command(page,'formulario');const f=await toolResult(page,'proveedor_generar_formulario');expect(f.ok).toBe(true);if(!f.ok)return;
  const other=await browser.newContext();
  try {
    const second=await other.newPage();await openChat(second,'http://127.0.0.1:3102');
    const denied=await second.evaluate(async id=>{
      const s=await (await fetch('/api/session',{method:'POST'})).json();
      const r=await fetch(`/api/artifacts/${id}`,{headers:{'X-Session-Id':s.session_id}});return r.status;
    },f.data.artefacto.id);
    expect(denied).toBe(404);
    const noSession=await second.evaluate(async id=>(await fetch(`/api/artifacts/${id}`)).status,f.data.artefacto.id);expect(noSession).toBe(401);
  } finally {await other.close();}
});

test('Pregunta sin LLM explica cómo configurar la clave y permite continuar',async({page})=>{
  await openChat(page);await selectCase(page,co);
  await command(page,'¿Qué documentos necesita esta solicitud?');
  await expect(page.locator('#history')).toContainText('LLM_API_KEY');
  await expect(page.locator('#history')).toContainText('archivo .env');
  await command(page,'leer');
  const read=await toolResult(page,'proveedor_leer_solicitud');expect(read.ok).toBe(true);
});
