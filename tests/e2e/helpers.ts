import { test as base, expect, type Page, type Download } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { workflowState } from '../../src/contracts/workflow.js';
export const test = base.extend<{ guardBrowser: void }>({
  guardBrowser: [async ({ page }, use) => {
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.protocol === 'http:' && u.hostname === '127.0.0.1' && ['3101', '3102'].includes(u.port)) await route.continue();
      else { external.push(u.origin); await route.abort(); }
    });
    await use(); expect(errors).toEqual([]); expect(external).toEqual([]);
  }, { auto: true }],
});
export { expect };
export async function openWork(page: Page, url = '/') {
  await page.goto(url); await expect(page.getByLabel('Solicitud recibida', { exact: true })).toBeEnabled();
}
export async function turn(page: Page, action: () => Promise<unknown>) {
  const pending = page.waitForResponse(r => r.url().includes('/api/workflow/') && r.request().method() === 'POST');
  await action(); const response = await pending; expect(response.status()).toBe(200);
  await expect(page.locator('#thinking')).toBeHidden(); await expect(page.locator('#case')).toBeEnabled();
  const session = response.request().headers()['x-session-id']; expect(session).toBeTruthy();
  const snapshot = await page.request.get(new URL('/api/workflow', response.url()).href, { headers: { 'X-Session-Id': session! } });
  expect(snapshot.status()).toBe(200); const body = await snapshot.json() as { data: unknown };
  return { state: workflowState.parse(body.data), session: session! };
}
export async function selectCase(page: Page, id: string) {
  return turn(page, () => page.getByLabel('Solicitud recibida', { exact: true }).selectOption(id));
}
export async function prepare(page: Page) { return turn(page, () => page.getByRole('button', { name: 'Preparar documentos', exact: true }).click()); }
export async function approve(page: Page) { return turn(page, () => page.getByRole('button', { name: 'Sí, preparar paquete', exact: true }).click()); }
export async function downloadBytes(download: Download) {
  expect(await download.failure()).toBeNull(); const path = await download.path(); expect(path).not.toBeNull(); return readFile(path!);
}
