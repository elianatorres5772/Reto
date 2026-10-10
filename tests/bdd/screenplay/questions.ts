import { Question } from '@serenity-js/core/lib/index.js';
import { PlaywrightPage } from '@serenity-js/playwright/lib/index.js';
import { contracts, type ToolName } from '../../../src/contracts/proveedor.js';
import { z } from 'zod';

export const ResultadoDe = <N extends ToolName>(name: N) => Question.about(`resultado validado de ${name}`, async actor => {
  const page = await (await actor.answer(PlaywrightPage.current())).nativePage();
  const card = page.locator('details.tool').filter({ has: page.locator('summary').filter({ hasText: name }) }).last();
  const text = await card.locator('pre').nth(1).textContent();
  return contracts[name].output.parse(JSON.parse(text ?? 'null')) as z.infer<(typeof contracts)[N]['output']>;
});

export const VecesEjecutada = (name: ToolName) => Question.about(`veces ejecutada ${name}`, async actor => {
  const page = await (await actor.answer(PlaywrightPage.current())).nativePage();
  return page.locator('details.tool summary').filter({ hasText: name }).count();
});

export const ConfirmacionVisible = () => Question.about('confirmación visible', async actor => {
  const page = await (await actor.answer(PlaywrightPage.current())).nativePage();
  return page.locator('#confirmation').isVisible();
});
