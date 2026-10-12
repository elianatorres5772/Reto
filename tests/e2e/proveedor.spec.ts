import { test, expect, openWork, selectCase, prepare, approve, turn, downloadBytes } from './helpers.js';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import ExcelJS from 'exceljs';
import { PDFDocument } from 'pdf-lib';

test('Solicitud a paquete: correo, campos con fuente, XLSX, autorización y ZIP para firma sin envío', async ({ page }) => {
  const routes: string[] = []; page.on('request', r => { if (r.method() === 'POST') routes.push(r.url()); });
  await openWork(page); await expect(page.locator('#message')).toHaveCount(0); await expect(page.locator('#chat')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('undefined');
  await selectCase(page, 'co-industrias-delta'); await expect(page.locator('#request-meta')).toContainText('compras@industrias-delta-ficticia.com');
  const prepared = await prepare(page); expect(prepared.state.phase).toBe('awaiting_approval'); expect(prepared.state.paquete).toBeNull();
  await expect(page.locator('#fields')).toContainText('03100012345'); await expect(page.locator('#fields')).toContainText('maestro.json#');
  await expect(page.locator('#confirmation')).toBeVisible();
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar formulario.xlsx', exact: true }).click();
  const bytes = await downloadBytes(await promise); expect(createHash('sha256').update(bytes).digest('hex')).toBe(prepared.state.formulario?.artefacto.sha256);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  expect(workbook.getWorksheet('Datos Bancarios')?.getCell('C5').value).toBe('03100012345');
  const packed = await approve(page); expect(packed.state.phase).toBe('ready_for_review'); expect(packed.state.confirmation).toBeNull();
  await expect(page.locator('#delivery')).toContainText('Firma del representante legal: pendiente'); await expect(page.locator('#confirmation')).toBeHidden();
  const zipPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar paquete-borrador.zip', exact: true }).click();
  const zip = await downloadBytes(await zipPromise); expect(createHash('sha256').update(zip).digest('hex')).toBe(packed.state.paquete?.paquete.sha256);
  const files = unzipSync(zip); expect(files['checklist.md']).toBeDefined(); expect(files['borrador-correo.md']).toBeDefined();
  expect(JSON.parse(strFromU8(files['manifiesto.json']!)).firma).toBe('pendiente'); expect(files['ENVIO-SIMULADO.md']).toBeUndefined();
  expect(routes.some(url => url.includes('/api/chat'))).toBe(false); await expect(page.getByRole('button', { name: 'Simular envío' })).toHaveCount(0);
});

test('Cancelar el paquete conserva formulario y exige nueva autorización', async ({ page }) => {
  await openWork(page); await selectCase(page, 'co-industrias-delta'); const original = await prepare(page);
  const cancelled = await turn(page, () => page.getByRole('button', { name: 'Cancelar preparación del paquete' }).click());
  expect(cancelled.state.phase).toBe('cancelled'); expect(cancelled.state.paquete).toBeNull(); await expect(page.locator('#confirmation')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Descargar formulario.xlsx' })).toBeVisible();
  const rejected = await page.request.post('/api/workflow/confirm', { headers: { 'X-Session-Id': original.session }, data: { caso_id: 'co-industrias-delta', confirmation_id: original.state.confirmation!.id, confirmado: true } });
  expect(await rejected.text()).toContain('CONFIRMATION_REQUIRED');
  await prepare(page); const result = await approve(page); expect(result.state.phase).toBe('ready_for_review');
});

test('Cambiar de solicitud descarta el permiso del formulario anterior', async ({ page }) => {
  await openWork(page); await selectCase(page, 'co-industrias-delta'); const original = await prepare(page);
  await selectCase(page, 'ec-corp-andina'); await expect(page.locator('#confirmation')).toBeHidden(); await expect(page.locator('#review')).toBeHidden();
  const rejected = await page.request.post('/api/workflow/confirm', { headers: { 'X-Session-Id': original.session }, data: { caso_id: 'co-industrias-delta', confirmation_id: original.state.confirmation!.id, confirmado: true } });
  expect(await rejected.text()).toContain('CONFIRMATION_REQUIRED');
});

for (const id of ['ec-corp-andina', 'hn-agroexport-sula']) {
  test(`${id}: faltantes, equivalencia fiscal y estado real de los soportes`, async ({ page }) => {
    await openWork(page); await selectCase(page, id); const prepared = await prepare(page);
    expect(prepared.state.mapeo?.faltantes.length).toBeGreaterThan(0);
    await expect(page.locator('#fields')).toContainText(id.startsWith('ec') ? 'RUC' : 'RTN');
    await expect(page.locator('#fields')).toContainText('Pendiente: no existe un valor respaldado');
    if (id.startsWith('ec')) {
      const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar formulario.pdf' }).click();
      expect((await PDFDocument.load(await downloadBytes(await promise))).getPageCount()).toBeGreaterThan(0);
    }
    const packed = await approve(page); expect(packed.state.phase).toBe(id.startsWith('ec') ? 'blocked' : 'ready_for_review');
    if (id.startsWith('ec')) await expect(page.locator('#supports')).toContainText('certificado_cumplimiento_tributario');
  });
}

test('Soportes originales vencidos: paquete descargable con bloqueo para firma', async ({ page }) => {
  await openWork(page, 'http://127.0.0.1:3101'); await selectCase(page, 'co-industrias-delta'); await prepare(page);
  await expect(page.locator('#supports')).toContainText('Vencido'); const packed = await approve(page);
  expect(packed.state.phase).toBe('blocked'); await expect(page.locator('#delivery-title')).toHaveText('Paquete generado con soportes pendientes');
  await expect(page.getByRole('button', { name: 'Descargar paquete-borrador.zip' })).toBeVisible();
});

test('Portal: documento para copia manual, sin autorización de paquete ni navegación externa', async ({ page }) => {
  await openWork(page); await selectCase(page, 'pa-logistica-istmo'); const result = await prepare(page);
  expect(result.state.phase).toBe('portal_manual'); await expect(page.locator('#confirmation')).toBeHidden();
  const promise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Descargar valores-portal.md' }).click();
  expect(new TextDecoder().decode(await downloadBytes(await promise))).toContain('Formato no soportado');
});

test('Plantilla corrupta muestra el correo y un error controlado; otra solicitud se prepara', async ({ page }) => {
  await openWork(page); await selectCase(page, 'co-plantilla-corrupta'); const result = await prepare(page);
  expect(result.state.error?.code).toBe('INVALID_FIXTURE'); await expect(page.locator('#alert')).toBeVisible();
  await expect(page.locator('#email')).toBeVisible(); await expect(page.locator('#confirmation')).toBeHidden();
  await selectCase(page, 'ec-corp-andina'); expect((await prepare(page)).state.formulario?.formato).toBe('pdf');
});

test('Preparación indica progreso y bloquea acciones hasta recibir los resultados', async ({ page }) => {
  await openWork(page); await selectCase(page, 'co-industrias-delta');
  let release!: () => void; const hold = new Promise<void>(done => release = done);
  await page.route('**/api/workflow/prepare', async route => { await hold; await route.continue(); });
  try {
    await page.getByRole('button', { name: 'Preparar documentos', exact: true }).click();
    await expect(page.locator('#thinking')).toBeVisible(); await expect(page.locator('#case')).toBeDisabled();
    await expect(page.locator('#prepare')).toBeDisabled();
  } finally { release(); }
  await expect(page.locator('#confirmation')).toBeVisible(); await expect(page.locator('#thinking')).toBeHidden();
});

test('Pérdida de conexión recupera estado sin repetir automáticamente la operación', async ({ page }) => {
  await openWork(page); await selectCase(page, 'co-industrias-delta');
  await page.route('**/api/workflow/prepare', route => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: 'Preparar documentos', exact: true }).click();
  await expect(page.locator('#alert')).toContainText('Conexión interrumpida'); await expect(page.locator('#prepare')).toBeEnabled();
  expect((await prepare(page)).state.phase).toBe('awaiting_approval');
});

test('Descargas y revisión de estado aisladas por sesión; sin sesión no hay acceso', async ({ page, browser }) => {
  await openWork(page); await selectCase(page, 'co-industrias-delta'); const result = await prepare(page);
  const id = result.state.formulario!.artefacto.id; const context = await browser.newContext();
  try {
    const response = await context.request.post('http://127.0.0.1:3102/api/session'); const s = await response.json() as { session_id: string };
    expect((await context.request.get(`http://127.0.0.1:3102/api/artifacts/${id}`, { headers: { 'X-Session-Id': s.session_id } })).status()).toBe(404);
    expect((await context.request.get(`http://127.0.0.1:3102/api/artifacts/${id}`)).status()).toBe(401);
    expect((await context.request.get('http://127.0.0.1:3102/api/workflow')).status()).toBe(401);
    const fake = await context.request.post('http://127.0.0.1:3102/api/workflow/confirm', { headers: { 'X-Session-Id': s.session_id }, data: { caso_id: 'co-industrias-delta', confirmation_id: result.state.confirmation!.id, confirmado: true } });
    expect(await fake.text()).toContain('CONFIRMATION_REQUIRED');
  } finally { await context.close(); }
});

test('Diseño móvil: solicitud, preparación y autorización accesibles sin chat', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await openWork(page); await selectCase(page, 'co-industrias-delta'); await prepare(page);
  await expect(page.locator('#confirmation')).toBeVisible(); await expect(page.locator('#approve')).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
