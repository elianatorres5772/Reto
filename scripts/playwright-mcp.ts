import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

export async function mcpEnvironment() {
  const cache = resolve('reports/mcp/cache');
  const config = resolve('reports/mcp/config');
  await mkdir(cache, { recursive: true });
  await mkdir(config, { recursive: true });
  return { ...getDefaultEnvironment(), XDG_CACHE_HOME: cache, XDG_CONFIG_HOME: config,
    PLAYWRIGHT_BROWSERS_PATH: resolve('node_modules/.cache/qa-browsers') };
}

// Launcher compartido por el cliente MCP y la configuración de editores.
export function mcpArgs() {
  return [resolve('node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--block-service-workers',
    '--output-dir', resolve('reports/mcp'),
    ...(process.env.PLAYWRIGHT_MCP_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? ['--executable-path', process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH]
      : ['--browser', 'chromium']),
  ];
}

if (process.argv[1] && resolve(process.argv[1]) === resolve('scripts/playwright-mcp.ts')) {
  const child = spawn(process.execPath, mcpArgs(), { stdio: 'inherit', env: await mcpEnvironment() });
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('exit', code => { process.exitCode = code ?? 1; });
}
