import { test, expect, command, selectCase } from './helpers.js';

test('Consulta LLM responde desde herramientas y no autoriza el paquete pendiente',async({page})=>{
 await page.goto('http://127.0.0.1:3103');
 await expect(page.getByLabel('Solicitud',{exact:true})).toBeEnabled();
 await expect(page.locator('#mode')).toContainText('LLM configurado');
 await selectCase(page,'co-industrias-delta');
 await command(page,'preparar');
 await expect(page.locator('#confirmation')).toBeVisible();
 await command(page,'¿Cuál es el número de cuenta?');
 await expect(page.locator('#history .message').last()).toContainText('03100012345');
 await expect(page.locator('#history .message').last()).toContainText(/Fuente: proveedor_(mapear_campos|generar_formulario)/);
 await expect(page.locator('#confirmation')).toBeHidden();
 await command(page,'sí');
 await expect(page.locator('summary').filter({hasText:'proveedor_armar_paquete'})).toHaveCount(0);
});

test('Respuesta LLM inválida muestra error controlado y permite otro turno',async({page})=>{
 await page.goto('http://127.0.0.1:3103');
 await expect(page.getByLabel('Solicitud',{exact:true})).toBeEnabled();
 await selectCase(page,'co-industrias-delta');
 await command(page,'Solicito una respuesta inválida');
 await expect(page.locator('#history .message').last()).toContainText('No fue posible obtener una respuesta validada');
 await expect(page.locator('#history')).not.toContainText('e2e-fake-key');
 await command(page,'¿Cuál es el número de cuenta?');
 await expect(page.locator('#history .message').last()).toContainText(/Fuente: proveedor_(mapear_campos|generar_formulario)/);
});
