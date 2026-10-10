import { Given, When, Then } from '@cucumber/cucumber';
import { actorCalled, actorInTheSpotlight, Interaction } from '@serenity-js/core/lib/index.js';
import { Ensure, equals, includes, not } from '@serenity-js/assertions/lib/index.js';
import { Text } from '@serenity-js/web/lib/index.js';
import { PlaywrightPage } from '@serenity-js/playwright/lib/index.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { z } from 'zod';
import { AbrirElChat, EnviarMensaje, SeleccionarSolicitud } from '../screenplay/tasks.js';
import { ConfirmacionVisible, ResultadoDe, VecesEjecutada } from '../screenplay/questions.js';
import { Chat } from '../screenplay/ui.js';
import { toolNames, type ToolName } from '../../../src/contracts/proveedor.js';

const tool = (name: string): ToolName => {
  const found = toolNames.find(value => value === name);
  assert.ok(found, `Herramienta desconocida: ${name}`);
  return found;
};
Given('que el analista abre el chat {string} para {string}', async (mode: string, id: string) => {
  const environment = z.enum(['original', 'prepared', 'llm']).parse(mode);
  await actorCalled('Analista de proveedores').attemptsTo(AbrirElChat(environment), SeleccionarSolicitud(id));
});
When('solicita {string}', async (message: string) => {
  await actorInTheSpotlight().attemptsTo(EnviarMensaje(message));
});
Then('se solicita confirmar {string}', async (text: string) => {
  await actorInTheSpotlight().attemptsTo(
    Ensure.that(ConfirmacionVisible(), equals(true)),
    Ensure.that(Text.of(Chat.pregunta), includes(text)),
  );
});
Then('no hay confirmación pendiente', async () => {
  await actorInTheSpotlight().attemptsTo(Ensure.that(ConfirmacionVisible(), equals(false)));
});
Then('la herramienta {string} se ha ejecutado {int} veces', async (name: string, count: number) => {
  await actorInTheSpotlight().attemptsTo(Ensure.that(VecesEjecutada(tool(name)), equals(count)));
});
Then('la herramienta {string} termina correctamente', async (name: string) => {
  await actorInTheSpotlight().attemptsTo(Ensure.that(ResultadoDe(tool(name)).ok, equals(true)));
});
Then('la herramienta {string} devuelve el error {string}', async (name: string, code: string) => {
  await actorInTheSpotlight().attemptsTo(Interaction.where(`#actor verifica el error controlado ${code}`, async actor => {
    const result = await actor.answer(ResultadoDe(tool(name)));
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, code);
  }));
});
Then('el historial contiene {string}', async (text: string) => {
  await actorInTheSpotlight().attemptsTo(Ensure.that(Text.of(Chat.historial), includes(text)));
});
Then('el historial no contiene {string}', async (text: string) => {
  await actorInTheSpotlight().attemptsTo(Ensure.that(Text.of(Chat.historial), not(includes(text))));
});
Then('el paquete está listo para firma', async () => {
  await actorInTheSpotlight().attemptsTo(Interaction.where('#actor verifica los soportes completos y la firma pendiente', async actor => {
    const result = await actor.answer(ResultadoDe('proveedor_armar_paquete'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.listo_para_firma, true);
    assert.equal(result.data.firma, 'pendiente');
  }));
});
Then('el paquete está bloqueado por soportes', async () => {
  await actorInTheSpotlight().attemptsTo(Interaction.where('#actor verifica el soporte ausente sin inventarlo', async actor => {
    const result = await actor.answer(ResultadoDe('proveedor_armar_paquete'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.listo_para_firma, false);
    assert.ok(result.data.soportes_faltantes.includes('certificado_cumplimiento_tributario'));
  }));
});
Then('el paquete registra la fecha UTC actual y detecta soportes vencidos', async () => {
  await actorInTheSpotlight().attemptsTo(Interaction.where('#actor verifica la evaluación temporal de los soportes originales', async actor => {
    const result = await actor.answer(ResultadoDe('proveedor_armar_paquete'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.fecha_evaluacion, new Date().toISOString().slice(0, 10));
    assert.ok(result.data.soportes.some(s => s.estado === 'vencido'));
    assert.equal(result.data.listo_para_firma, false);
  }));
});
Then('el campo {string} conserva un valor nulo', async (label: string) => {
  await actorInTheSpotlight().attemptsTo(Interaction.where(`#actor verifica que ${label} no se invente`, async actor => {
    const result = await actor.answer(ResultadoDe('proveedor_mapear_campos'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.campos.find(field => field.etiqueta === label)?.valor, null);
  }));
});
Then('el envío queda simulado sin enviar correo real', async () => {
  await actorInTheSpotlight().attemptsTo(Interaction.where('#actor verifica que no hubo envío real', async actor => {
    const result = await actor.answer(ResultadoDe('proveedor_simular_envio'));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.envio_real, false);
  }));
});
Then('el paquete descargado contiene documentos de revisión', async () => {
  await actorInTheSpotlight().attemptsTo(Interaction.where('#actor descarga y comprueba integridad y contenido del ZIP', async actor => {
    const result = await actor.answer(ResultadoDe('proveedor_armar_paquete'));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const page = await (await actor.answer(PlaywrightPage.current())).nativePage();
    const card = page.locator('details.tool').filter({ has: page.locator('summary').filter({ hasText: 'proveedor_armar_paquete' }) }).last();
    if ((await card.getAttribute('open')) === null) await card.locator('summary').click();
    const downloaded = page.waitForEvent('download');
    await card.getByRole('button', { name: 'Descargar paquete-borrador.zip', exact: true }).click();
    const download = await downloaded;
    assert.equal(await download.failure(), null);
    const path = await download.path();
    assert.ok(path);
    const bytes = await readFile(path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), result.data.paquete.sha256);
    const files = unzipSync(bytes);
    for (const name of ['formulario.xlsx', 'checklist.md', 'borrador-correo.md', 'manifiesto.json']) assert.ok(files[name], `Falta ${name}`);
    assert.equal(JSON.parse(strFromU8(files['manifiesto.json']!)).firma, 'pendiente');
    assert.ok(!strFromU8(files['borrador-correo.md']!).includes('03100012345'), 'El correo no debe exponer la cuenta bancaria');
  }));
});
