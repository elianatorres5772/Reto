import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const mcpRequire = createRequire(import.meta.resolve('@playwright/mcp/package.json'));
const targets = [
  { cli: resolve('node_modules/playwright-core/cli.js'), browser: 'chromium' },
  { cli: resolve(dirname(mcpRequire.resolve('playwright/package.json')), 'cli.js'), browser: 'chrome-for-testing' },
];
// Cada driver usa la revisión de navegador que corresponde a su versión.
for (const { cli, browser } of targets) {
  const child = spawn(process.execPath, [cli, 'install', browser, ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve('node_modules/.cache/qa-browsers') },
  });
  const code = await new Promise<number>((done, reject) => {
    child.once('error', reject);
    child.once('exit', status => done(status ?? 1));
  });
  if (code !== 0) { process.exitCode = code; break; }
}
