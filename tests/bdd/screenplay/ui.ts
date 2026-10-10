import { By, PageElement } from '@serenity-js/web/lib/index.js';

// Solo selectores: las decisiones del flujo están en las Tasks.
export const Chat = {
  solicitud: PageElement.located(By.css('#case')).describedAs('solicitud seleccionada'),
  mensaje: PageElement.located(By.css('#message')).describedAs('mensaje al agente'),
  historial: PageElement.located(By.css('#history')).describedAs('historial del chat'),
  pregunta: PageElement.located(By.css('#question')).describedAs('pregunta de confirmación'),
};
