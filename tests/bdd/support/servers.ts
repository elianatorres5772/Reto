import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';

export const origins = {
  original: 'http://127.0.0.1:3151',
  prepared: 'http://127.0.0.1:3152',
  llm: 'http://127.0.0.1:3153',
} as const;
export type Environment = keyof typeof origins;

/** Solo termina procesos propios; los fixtures se copian y limpian en el harness existente. */
export async function startServers(modes: Environment[] = ['original', 'prepared', 'llm']) {
  const children: ChildProcess[] = [];
  const close = async () => {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const ended = once(child, 'exit');
      child.kill('SIGTERM');
      const forced = setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await ended; } finally { clearTimeout(forced); }
    }));
  };
  try {
    for (const mode of modes) {
      const origin = origins[mode];
      // Nunca reutilizar otro servidor: podría contener datos o claves reales.
      const occupied = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) }).then(() => true, () => false);
      if (occupied) throw new Error(`Puerto de pruebas ocupado: ${new URL(origin).port}. Detén ese servidor antes de continuar.`);
      const child = spawn(process.execPath, [resolve('node_modules/tsx/dist/cli.mjs'), resolve('tests/e2e/server.ts'), mode], {
        env: { ...process.env, E2E_PORT: new URL(origin).port },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      children.push(child);
      let diagnostic = '';
      child.stderr?.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-3000); });
      const deadline = Date.now() + 30000;
      let ready = false;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`No arrancó el servidor de pruebas ${mode}: ${diagnostic}`);
        ready = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(500) })
          .then(async response => response.ok && (await response.json() as { ok?: boolean }).ok === true, () => false);
        if (ready) break;
        await new Promise(done => setTimeout(done, 100));
      }
      if (!ready) throw new Error(`Tiempo agotado al iniciar ${mode}`);
    }
    return close;
  } catch (error) { await close(); throw error; }
}
