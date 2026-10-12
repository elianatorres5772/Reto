import { test, expect } from './helpers.js';

test('Tema: sigue al sistema, alterna claro/oscuro y recuerda la elección al recargar', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const root = page.locator('html'), toggle = page.getByRole('button', { name: 'Cambiar a modo claro' });
  await expect(root).toHaveAttribute('data-theme', 'dark'); await expect(toggle).toHaveText('☀ Modo claro');
  await toggle.click();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Cambiar a modo oscuro' })).toBeVisible();
  await page.reload();
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Cambiar a modo oscuro' }).click();
  await expect(root).toHaveAttribute('data-theme', 'dark');
  await expect(root).toHaveCSS('background-color', 'rgb(15, 20, 18)');
});
