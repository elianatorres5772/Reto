import { randomUUID } from 'node:crypto';
import { ConfirmationGate } from '../agent/confirmation.js';
import { createProveedorTools, executePublic } from '../tools/proveedor.js';
import { workflowAction, workflowApproval, workflowState, type WorkflowEvent, type WorkflowState } from '../contracts/workflow.js';
import type { ToolName } from '../contracts/proveedor.js';

/** Flujo documental determinista. Los datos proceden exclusivamente de las herramientas. */
export function createRegistrationWorkflow(options: NonNullable<Parameters<typeof createProveedorTools>[0]> = {}) {
  const sessionId = options.sessionId ?? randomUUID();
  const gate = new ConfirmationGate();
  const tools = createProveedorTools({ ...options, sessionId, authorize: (...args) => gate.consume(...args) });
  const ctx = { directory: process.cwd(), sessionId, tools };
  const empty = (): WorkflowState => ({ phase: 'idle', caso_id: null, solicitud: null, mapeo: null, formulario: null, paquete: null, confirmation: null, steps: [], error: null });
  let state = empty();
  let busy = false;
  const snapshot = () => workflowState.parse(state);
  type Emit = (event: WorkflowEvent) => void;
  const send = (emit: Emit) => emit({ type: 'state', data: snapshot() });
  const fail = (emit: Emit, code: 'INVALID_INPUT' | 'CONFIRMATION_REQUIRED' | 'IO_ERROR', message: string) => {
    gate.clear(); state.confirmation = null; state.phase = 'error';
    state.error = { code, message, retryable: true }; send(emit);
  };
  async function call<N extends ToolName>(name: N, input: unknown, step: WorkflowState['steps'][number]['step'], emit: Emit) {
    state.steps = state.steps.filter(item => item.step !== step);
    state.steps.push({ step, status: 'running' }); send(emit);
    const result = await executePublic(ctx, name, input);
    state.steps.find(item => item.step === step)!.status = result.ok ? 'done' : 'error';
    if (!result.ok) { state.phase = 'error'; state.error = result.error; gate.clear(); state.confirmation = null; }
    send(emit); return result;
  }
  async function run(operation: () => Promise<void>, emit: Emit) {
    if (busy) {
      emit({ type: 'error', error: { code: 'LIMIT_REACHED', message: 'Hay una preparación en curso. Espera a que termine.', retryable: true } });
      emit({ type: 'done' }); return;
    }
    busy = true;
    try { await operation(); }
    catch { fail(emit, 'IO_ERROR', 'No se pudo completar la preparación. Puedes seleccionar otra solicitud o volver a intentarlo.'); }
    finally { busy = false; emit({ type: 'done' }); }
  }
  async function load(caso: string, emit: Emit) {
    const result = await call('proveedor_leer_solicitud', { caso }, 'lectura', emit);
    if (!result.ok) return false;
    state.solicitud = result.data; send(emit); return true;
  }
  return {
    sessionId, tools, snapshot,
    async select(input: unknown, emit: Emit) {
      await run(async () => {
        gate.clear(); state = empty();
        const parsed = workflowAction.safeParse(input);
        if (!parsed.success) { fail(emit, 'INVALID_INPUT', 'Selecciona una solicitud válida.'); return; }
        state.caso_id = parsed.data.caso_id; state.phase = 'selected';
        await load(parsed.data.caso_id, emit);
      }, emit);
    },
    async prepare(input: unknown, emit: Emit) {
      await run(async () => {
        gate.clear(); state = empty();
        const parsed = workflowAction.safeParse(input);
        if (!parsed.success) { fail(emit, 'INVALID_INPUT', 'Selecciona una solicitud válida.'); return; }
        const caso = parsed.data.caso_id;
        state.caso_id = caso; state.phase = 'preparing';
        if (!await load(caso, emit)) return;
        const mapped = await call('proveedor_mapear_campos', { caso, campos: state.solicitud!.campos }, 'mapeo', emit);
        if (!mapped.ok) return;
        state.mapeo = mapped.data; send(emit);
        const form = await call('proveedor_generar_formulario', { caso, mapeo: mapped.data }, 'formulario', emit);
        if (!form.ok) return;
        state.formulario = form.data;
        if (form.data.formato_no_soportado) { state.phase = 'portal_manual'; send(emit); return; }
        const question = '¿Confirmas que prepare el paquete documental de esta solicitud para revisión y firma del representante legal?';
        gate.ask({ action: 'proveedor_armar_paquete', caseId: caso, artifactId: form.data.artefacto.id, question });
        state.confirmation = { id: randomUUID(), question }; state.phase = 'awaiting_approval'; send(emit);
      }, emit);
    },
    async confirm(input: unknown, emit: Emit) {
      await run(async () => {
        const parsed = workflowApproval.safeParse(input);
        if (!parsed.success) { fail(emit, 'INVALID_INPUT', 'La autorización no es válida. Vuelve a preparar la solicitud.'); return; }
        const { caso_id: caso, confirmation_id: id, confirmado } = parsed.data;
        if (!state.confirmation || state.confirmation.id !== id || state.caso_id !== caso || state.phase !== 'awaiting_approval') {
          fail(emit, 'CONFIRMATION_REQUIRED', 'La autorización expiró o corresponde a otra solicitud. Vuelve a preparar el formulario.'); return;
        }
        state.confirmation = null;
        const permission = gate.userTurn(confirmado ? 'sí' : 'no');
        if (!confirmado) { state.phase = 'cancelled'; send(emit); return; }
        if (!permission) { fail(emit, 'CONFIRMATION_REQUIRED', 'Se requiere una autorización nueva.'); return; }
        state.phase = 'preparing_package'; send(emit);
        const packed = await call('proveedor_armar_paquete', { caso }, 'paquete', emit);
        if (!packed.ok) return;
        state.paquete = packed.data;
        state.phase = packed.data.listo_para_firma ? 'ready_for_review' : 'blocked';
        // El flujo termina aquí. No ejecuta firma, envío ni simulación.
        gate.clear(); send(emit);
      }, emit);
    },
  };
}
