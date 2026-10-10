import { After, AfterAll, Before, BeforeAll, setDefaultTimeout } from '@cucumber/cucumber';
import { actorCalled, ArtifactArchiver, Cast, configure } from '@serenity-js/core/lib/index.js';
import { BrowseTheWebWithPlaywright, PlaywrightPage } from '@serenity-js/playwright/lib/index.js';
import { Photographer, TakePhotosOfFailures } from '@serenity-js/web/lib/index.js';
import { ConsoleReporter } from '@serenity-js/console-reporter/lib/index.js';
import { SerenityBDDReporter } from '@serenity-js/serenity-bdd';
import { chromium, type Browser } from 'playwright-core';
import { origins } from './servers.js';

let browser: Browser;
const pageErrors: string[] = [];
const externalRequests: string[] = [];
setDefaultTimeout(30000);

BeforeAll(async () => {
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
  configure({
    actors: Cast.where(actor => actor.whoCan(BrowseTheWebWithPlaywright.using(browser))),
    crew: [
      ConsoleReporter.forMonochromaticTerminals(),
      SerenityBDDReporter.fromJSON({ specDirectory: 'tests/bdd/features', reporter: { includeAbilityDetails: false } }),
      ArtifactArchiver.storingArtifactsAt('reports/bdd/serenity'),
      Photographer.whoWill(TakePhotosOfFailures),
    ],
  });
});

Before(async () => {
  pageErrors.length = 0;
  externalRequests.length = 0;
  const ability = BrowseTheWebWithPlaywright.as(actorCalled('Analista de proveedores'));
  await ability.initialise();
  const native = await (await actorCalled('Analista de proveedores').answer(PlaywrightPage.current())).nativePage();
  native.on('pageerror', error => pageErrors.push(error.message));
  await native.route('**/*', async route => {
    const origin = new URL(route.request().url()).origin;
    if (Object.values(origins).some(value => value === origin)) await route.continue();
    else { externalRequests.push(origin); await route.abort(); }
  });
});

After(() => {
  if (pageErrors.length) throw new Error(`Errores JavaScript: ${pageErrors.join('; ')}`);
  if (externalRequests.length) throw new Error(`Tráfico externo inesperado: ${externalRequests.join('; ')}`);
});

AfterAll(async () => { await browser?.close(); });
