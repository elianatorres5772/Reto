import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { startServers, origins } from '../tests/bdd/support/servers.js';
import { mcpArgs, mcpEnvironment } from './playwright-mcp.js';

await mkdir('reports/mcp', { recursive: true });
const close = await startServers(['prepared']);
const client = new Client({ name: 'registro-proveedor-qa', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: mcpArgs(), env: await mcpEnvironment(), stderr: 'pipe' });
const evidence: { tool: string; result: unknown }[] = [];
async function call(name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  evidence.push({ tool: name, result });
  assert.notEqual(result.isError, true, `Falló la herramienta MCP ${name}: ${JSON.stringify(result.content)}`);
  return result;
}
try {
  await client.connect(transport);
  const available = await client.listTools();
  for (const name of ['browser_navigate', 'browser_snapshot', 'browser_run_code_unsafe']) {
    assert.ok(available.tools.some(tool => tool.name === name), `No existe ${name}`);
  }
  await call('browser_navigate', { url: origins.prepared });
  // Código fijo del repositorio en un servidor local aislado; nunca ejecutar código recibido del chat.
  const result = await call('browser_run_code_unsafe', { code: `async (page) => {
    await page.locator('#case').waitFor();
    await page.waitForFunction(() => !document.querySelector('#case').disabled);
    async function send(text) {
      await page.locator('#message').fill(text);
      const response = page.waitForResponse(r => r.url().endsWith('/api/chat'));
      await page.getByRole('button', { name: 'Enviar', exact: true }).click();
      const received = await response;
      if (received.status() !== 200) throw new Error('Turno fallido');
      await page.waitForFunction(() => !document.querySelector('#message').disabled);
    }
    await page.locator('#case').selectOption('co-industrias-delta');
    await page.waitForFunction(() => !document.querySelector('#message').disabled);
    await send('preparar');
    const tools = name => page.locator('details.tool summary').filter({ hasText: name });
    if (await tools('proveedor_armar_paquete').count() !== 0) throw new Error('Empaquetó sin permiso');
    if (!await page.locator('#confirmation').isVisible()) throw new Error('No pidió permiso');
    await send('sí');
    if (await tools('proveedor_armar_paquete').count() !== 1) throw new Error('No generó paquete');
    if (await tools('proveedor_simular_envio').count() !== 0) throw new Error('Simuló sin segundo permiso');
    await send('sí');
    const card = page.locator('details.tool').filter({ has: page.locator('summary').filter({ hasText: 'proveedor_simular_envio' }) }).last();
    const simulated = JSON.parse(await card.locator('pre').nth(1).textContent());
    if (!simulated.ok || simulated.data.envio_real !== false) throw new Error('Simulación incorrecta');
    return 'MCP_FLOW_VERIFIED';
  }` });
  assert.ok(JSON.stringify(result.content).includes('MCP_FLOW_VERIFIED'));
  await call('browser_snapshot', {});
  console.log('MCP aprobado: navegador real, preparación, dos permisos independientes y simulación sin envío real.');
} finally {
  await writeFile('reports/mcp/evidence.json', JSON.stringify(evidence, null, 2));
  await client.close();
  await transport.close();
  await close();
}
