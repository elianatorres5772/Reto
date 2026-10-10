import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { startServers } from '../tests/bdd/support/servers.js';

await rm('reports/bdd', { recursive: true, force: true });
await mkdir('reports/bdd/serenity', { recursive: true });
const close = await startServers();
try {
  const child = spawn(process.execPath, ['--import', 'tsx', resolve('node_modules/@cucumber/cucumber/bin/cucumber.js'), ...process.argv.slice(2)], {
    stdio: 'inherit', env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve('node_modules/.cache/qa-browsers') },
  });
  const interrupt = () => child.kill('SIGTERM');
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    process.exitCode = await new Promise<number>((done, reject) => {
      child.once('error', reject);
      child.once('exit', code => done(code ?? 1));
    });
    if (process.exitCode === 0) {
      const features = JSON.parse(await readFile('reports/bdd/cucumber.json', 'utf8')) as { elements?: unknown[] }[];
      if (!features.some(feature => (feature.elements?.length ?? 0) > 0)) {
        throw new Error('Cucumber no ejecutó escenarios; revisa la configuración o el filtro de etiquetas.');
      }
      console.log(await readFile('reports/bdd/summary.txt', 'utf8'));
      const { readdir } = await import('node:fs/promises');
      const reports = (await readdir('reports/bdd/serenity')).filter(name => name.endsWith('.json'));
      if (!reports.length) throw new Error('No se generó evidencia Serenity/JS; revisa el formatter y los reporters.');
    }
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
} finally { await close(); }
