import { test, expect } from './helpers.js';
import type { Page } from '@playwright/test';

async function settled(page: Page) { await expect(page.locator('#chat-thinking')).toBeHidden(); await expect(page.getByLabel('Mensaje')).toBeEnabled(); }
async function say(page: Page, text: string) {
  const done = page.waitForResponse(r => r.url().endsWith('/api/chat'));
  await page.getByLabel('Mensaje').fill(text); await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  expect((await done).status()).toBe(200); await settled(page);
}

test('Chat modal: guion §11 muestra herramientas, resalta confirmación y simula el envío solo tras el sí', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Conversar con el agente' }).click();
  const dialog = page.getByRole('dialog', { name: 'Registro como proveedor' });
  await expect(dialog).toBeVisible(); await expect(dialog.locator('#chat-case option')).not.toHaveCount(0, { timeout: 15000 });
  await say(page, 'Procesa el caso "co-industrias-delta". Dime qué campos quedaron llenos, cuáles faltan, si el paquete está listo para firma y qué soportes debo actualizar. No envíes nada todavía.');
  await expect(dialog.locator('.chat-tool summary')).toHaveText([/proveedor_leer_solicitud · ok/, /proveedor_mapear_campos · ok/, /proveedor_generar_formulario · ok — ruta: out\/co-industrias-delta\/formulario\.xlsx/]);
  await expect(dialog.locator('.chat-message.assistant').filter({ hasText: 'Listo para firma según soportes: sí' })).toHaveCount(1);
  await expect(dialog.getByRole('alertdialog')).toBeVisible();
  await say(page, 'envía');
  await expect(dialog.locator('#chat-question')).toContainText('Para simular el envío primero debo armar el paquete');
  await expect(dialog.locator('.chat-tool summary', { hasText: 'proveedor_armar_paquete' })).toHaveCount(0);
  const packed = page.waitForResponse(r => r.url().endsWith('/api/chat'));
  await dialog.getByRole('button', { name: 'Sí', exact: true }).click(); await packed; await settled(page);
  await expect(dialog.locator('.chat-tool summary', { hasText: 'proveedor_armar_paquete · ok' })).toHaveCount(1);
  await expect(dialog.locator('#chat-question')).toContainText('simulación local del envío');
  const sent = page.waitForResponse(r => r.url().endsWith('/api/chat'));
  await dialog.getByRole('button', { name: 'Sí', exact: true }).click(); await sent; await settled(page);
  await expect(dialog.locator('.chat-tool summary', { hasText: 'proveedor_simular_envio · ok' })).toContainText('out/co-industrias-delta/ENVIO-SIMULADO.md');
  await expect(dialog.getByRole('alertdialog')).toBeHidden();
  await dialog.getByRole('button', { name: 'Cerrar chat' }).click(); await expect(dialog).toBeHidden();
});
