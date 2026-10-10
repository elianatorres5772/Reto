import { Duration, Interaction, Task, Wait } from '@serenity-js/core/lib/index.js';
import { Enter, isEnabled, Navigate } from '@serenity-js/web/lib/index.js';
import { PlaywrightPage } from '@serenity-js/playwright/lib/index.js';
import { Chat } from './ui.js';
import { origins, type Environment } from '../support/servers.js';

export const AbrirElChat = (environment: Environment) => Task.where(`#actor abre el chat ${environment}`,
  Navigate.to(origins[environment]),
  Wait.upTo(Duration.ofSeconds(10)).until(Chat.solicitud, isEnabled()),
);

export const SeleccionarSolicitud = (id: string) => Task.where(`#actor selecciona la solicitud ${id}`,
  Interaction.where('#actor espera la lectura de la solicitud seleccionada', async actor => {
    const page = await (await actor.answer(PlaywrightPage.current())).nativePage();
    if (await page.locator('#case').inputValue() === id) return;
    const response = page.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST');
    await page.locator('#case').selectOption(id);
    if ((await response).status() !== 200) throw new Error('La selección no pudo procesarse');
    await page.locator('#message').waitFor({ state: 'visible' });
  }),
  Wait.upTo(Duration.ofSeconds(10)).until(Chat.mensaje, isEnabled()),
);

export const EnviarMensaje = (message: string) => Task.where(`#actor envía «${message}»`,
  Enter.theValue(message).into(Chat.mensaje),
  Interaction.where('#actor envía el turno y espera su respuesta completa', async actor => {
    const page = await (await actor.answer(PlaywrightPage.current())).nativePage();
    const response = page.waitForResponse(r => r.url().endsWith('/api/chat') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Enviar', exact: true }).click();
    const received = await response;
    if (received.status() !== 200) throw new Error('El turno no pudo procesarse');
  }),
  Wait.upTo(Duration.ofSeconds(10)).until(Chat.mensaje, isEnabled()),
);
