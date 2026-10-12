import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { unzipSync, strFromU8 } from 'fflate';
import { createRegistrationWorkflow } from '../src/workflow/registration.js';
import { workflowEvent, type WorkflowEvent } from '../src/contracts/workflow.js';
import { randomUUID } from 'node:crypto';

async function fixture(prepared = true) {
  const dir = await mkdtemp(join(tmpdir(), 'registro-workflow-'));
  const root = join(dir, 'fixtures'); await cp(resolve('fixtures/reto-01'), root, { recursive: true });
  if (prepared) {
    const index = JSON.parse(await readFile(join(root, 'soportes/index.json'), 'utf8')) as { vigencia_hasta: string | null }[];
    index.forEach(s => { if (s.vigencia_hasta) s.vigencia_hasta = '2099-12-31'; });
    await writeFile(join(root, 'soportes/index.json'), JSON.stringify(index));
  }
  const flow = createRegistrationWorkflow({ fixturesRoot: root, outputRoot: join(dir, 'out'), today: () => '2026-10-12' });
  const events: WorkflowEvent[] = [];
  const emit = (event: WorkflowEvent) => { events.push(workflowEvent.parse(event)); };
  return { dir, root, flow, emit, events, close: () => rm(dir, { recursive: true, force: true }) };
}

test('Flujo documental: formulario, permiso, paquete con checklist y cierre sin firma ni simulación', async () => {
  const f = await fixture();
  try {
    await f.flow.select({ caso_id: 'co-industrias-delta' }, f.emit);
    assert.equal(f.flow.snapshot().solicitud?.solicitud.formato, 'xlsx');
    await f.flow.prepare({ caso_id: 'co-industrias-delta' }, f.emit);
    const before = f.flow.snapshot();
    assert.equal(before.phase, 'awaiting_approval'); assert.equal(before.paquete, null);
    assert.ok(before.formulario); assert.ok(before.confirmation);
    await f.flow.confirm({ caso_id: before.caso_id, confirmation_id: before.confirmation.id, confirmado: true }, f.emit);
    const after = f.flow.snapshot();
    assert.equal(after.phase, 'ready_for_review'); assert.equal(after.confirmation, null);
    assert.equal(after.paquete?.firma, 'pendiente'); assert.ok(after.paquete);
    const downloaded = await f.flow.tools.download(after.paquete.paquete.id); assert.ok(downloaded);
    const files = unzipSync(downloaded.bytes);
    for (const name of ['formulario.xlsx', 'checklist.md', 'borrador-correo.md', 'manifiesto.json']) assert.ok(files[name]);
    assert.ok(!strFromU8(files['borrador-correo.md']!).includes('03100012345'));
    assert.ok(!(await readdir(join(f.dir, 'out/co-industrias-delta'))).includes('ENVIO-SIMULADO.md'));
    const logs = await readFile(join(f.dir, 'out/log.jsonl'), 'utf8');
    assert.ok(!logs.includes('proveedor_simular_envio'));
    await f.flow.confirm({ caso_id: before.caso_id, confirmation_id: before.confirmation.id, confirmado: true }, f.emit);
    assert.equal(f.flow.snapshot().error?.code, 'CONFIRMATION_REQUIRED');
  } finally { await f.close(); }
});

test('Autorización vinculada al caso y formulario: falso permiso, cancelación y cambio de solicitud', async () => {
  const f = await fixture();
  try {
    await f.flow.confirm({ caso_id: 'co-industrias-delta', confirmation_id: randomUUID(), confirmado: true }, f.emit);
    assert.equal(f.flow.snapshot().paquete, null);
    await f.flow.prepare({ caso_id: 'co-industrias-delta' }, f.emit);
    const pending = f.flow.snapshot().confirmation!;
    await f.flow.confirm({ caso_id: 'co-industrias-delta', confirmation_id: pending.id, confirmado: false }, f.emit);
    assert.equal(f.flow.snapshot().phase, 'cancelled'); assert.equal(f.flow.snapshot().paquete, null);
    await f.flow.prepare({ caso_id: 'co-industrias-delta' }, f.emit);
    const old = f.flow.snapshot().confirmation!;
    await f.flow.select({ caso_id: 'ec-corp-andina' }, f.emit);
    await f.flow.confirm({ caso_id: 'co-industrias-delta', confirmation_id: old.id, confirmado: true }, f.emit);
    assert.equal(f.flow.snapshot().error?.code, 'CONFIRMATION_REQUIRED'); assert.equal(f.flow.snapshot().paquete, null);
    await f.flow.prepare({ caso_id: 'co-industrias-delta', mapeo: { banco: 'inventado' } }, f.emit);
    assert.equal(f.flow.snapshot().error?.code, 'INVALID_INPUT');
  } finally { await f.close(); }
});

test('Soportes faltantes y vencidos bloquean firma; datos ausentes permanecen nulos; portal es manual', async () => {
  const f = await fixture(); const original = await fixture(false);
  try {
    for (const [id, phase] of [['ec-corp-andina', 'blocked'], ['hn-agroexport-sula', 'ready_for_review']] as const) {
      await f.flow.prepare({ caso_id: id }, f.emit);
      const before = f.flow.snapshot(); assert.ok(before.mapeo?.faltantes.every(field => field.valor === null));
      await f.flow.confirm({ caso_id: id, confirmation_id: before.confirmation!.id, confirmado: true }, f.emit);
      assert.equal(f.flow.snapshot().phase, phase);
    }
    await original.flow.prepare({ caso_id: 'co-industrias-delta' }, original.emit);
    await original.flow.confirm({ caso_id: 'co-industrias-delta', confirmation_id: original.flow.snapshot().confirmation!.id, confirmado: true }, original.emit);
    assert.equal(original.flow.snapshot().phase, 'blocked');
    assert.ok(original.flow.snapshot().paquete?.soportes.some(s => s.estado === 'vencido'));
    await f.flow.prepare({ caso_id: 'pa-logistica-istmo' }, f.emit);
    assert.equal(f.flow.snapshot().phase, 'portal_manual'); assert.equal(f.flow.snapshot().confirmation, null);
    assert.equal(f.flow.snapshot().formulario?.artefacto.nombre, 'valores-portal.md');
  } finally { await f.close(); await original.close(); }
});

test('Plantilla corrupta conserva el correo y permite preparar otra solicitud sin perder la sesión', async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, 'casos/co-industrias-delta/plantilla-celdas.json'), '{ corrupto');
    await f.flow.prepare({ caso_id: 'co-industrias-delta' }, f.emit);
    assert.equal(f.flow.snapshot().phase, 'error'); assert.equal(f.flow.snapshot().error?.code, 'INVALID_FIXTURE');
    assert.ok(f.flow.snapshot().solicitud?.solicitud.cuerpo);assert.equal(f.flow.snapshot().mapeo?.plantilla_valida,false);assert.ok(f.flow.snapshot().mapeo?.evaluacion_soportes.soportes.length); assert.equal(f.flow.snapshot().confirmation, null);
    await f.flow.prepare({ caso_id: 'ec-corp-andina' }, f.emit);
    assert.equal(f.flow.snapshot().phase, 'awaiting_approval'); assert.equal(f.flow.snapshot().formulario?.formato, 'pdf');
  } finally { await f.close(); }
});
