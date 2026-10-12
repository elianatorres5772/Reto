import { z } from 'zod';
import { artifactId, caseId, contracts, errorSchema, generated, mapping, packageData } from './proveedor.js';

export const requestData = contracts.proveedor_leer_solicitud.output.options[0].shape.data;
export const workflowAction = z.object({ caso_id: caseId }).strict();
export const workflowApproval = z.object({ caso_id: caseId, confirmation_id: artifactId, confirmado: z.boolean() }).strict();
export const workflowStep = z.enum(['lectura', 'mapeo', 'formulario', 'paquete']);
export const workflowState = z.object({
  phase: z.enum(['idle', 'selected', 'preparing', 'awaiting_approval', 'preparing_package', 'ready_for_review', 'blocked', 'portal_manual', 'cancelled', 'error']),
  caso_id: caseId.nullable(),
  solicitud: requestData.nullable(),
  mapeo: mapping.nullable(),
  formulario: generated.nullable(),
  paquete: packageData.nullable(),
  confirmation: z.object({ id: artifactId, question: z.string() }).strict().nullable(),
  steps: z.array(z.object({ step: workflowStep, status: z.enum(['running', 'done', 'error']) }).strict()),
  error: errorSchema.nullable(),
}).strict();
export const workflowEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('state'), data: workflowState }).strict(),
  z.object({ type: z.literal('error'), error: errorSchema }).strict(),
  z.object({ type: z.literal('done') }).strict(),
]);
export type WorkflowState = z.infer<typeof workflowState>;
export type WorkflowEvent = z.infer<typeof workflowEvent>;
