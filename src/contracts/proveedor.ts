import { z } from 'zod';

export const caseId = z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/).max(100);
export const artifactId = z.string().uuid();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Fecha inválida');
export const errorSchema = z.object({ code: z.enum(['INVALID_INPUT', 'NOT_FOUND', 'INVALID_FIXTURE', 'IO_ERROR', 'CONFIRMATION_REQUIRED', 'INCOMPLETE', 'PORTAL_MANUAL', 'INVALID_OUTPUT', 'AUDIT_ERROR', 'LIMIT_REACHED']), message: z.string(), retryable: z.boolean() }).strict();
export const result = <T extends z.ZodTypeAny>(data: T) => z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data }).strict(), z.object({ ok: z.literal(false), error: errorSchema }).strict()]);
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: z.infer<typeof errorSchema> };
export const solicitud = z.object({ id: caseId, de: z.string().email(), para: z.string().email(), asunto: z.string(), fecha: date, pais: z.enum(['CO', 'EC', 'PE', 'HN', 'PA']), cliente: z.string(), formato: z.enum(['xlsx', 'pdf', 'portal']), cuerpo: z.string(), adjuntos: z.array(z.string()) }).strict();
export const field = z.object({ etiqueta: z.string().min(1), obligatorio: z.boolean().optional(), hoja: z.string().min(1).max(31).optional(), celda_etiqueta: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/).optional(), celda_valor: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/).optional() }).strict();
export const plantilla = z.array(field).min(1).max(500);
export const support = z.object({ tipo: z.string(), archivo: z.string().regex(/^[a-z0-9-]+\.txt$/), vigencia_hasta: date.nullable(), pais_emisor: z.string(), descripcion: z.string() }).strict();
export const supportStatus = support.extend({ estado:z.enum(['disponible', 'vencido', 'archivo_faltante']), fuente:z.string() });
export const supportEvaluation=z.object({fecha_evaluacion:date,soportes:z.array(supportStatus),faltantes:z.array(z.string()),listo_para_firma:z.boolean()}).strict();
const scalar = z.union([z.string(), z.number().finite(), z.boolean()]);
const contact = z.object({ nombre: z.string(), cargo: z.string(), email: z.string().email(), telefono: z.string().optional(), tipo_identificacion: z.string().optional(), identificacion: z.string().optional() }).strict();
export const maestroSchema = z.object({
  razon_social:z.string(),tipo_sociedad:z.string(),nit:z.string(),digito_verificacion:z.string(),pais:z.string(),ciudad:z.string(),departamento:z.string(),direccion:z.string(),codigo_postal:z.string(),telefono:z.string(),sitio_web:z.string().url(),fecha_constitucion:date,matricula_mercantil:z.string(),ciiu_principal:z.string(),ciiu_secundario:z.string(),actividad_economica:z.string(),regimen_tributario:z.string(),gran_contribuyente:z.boolean(),autorretenedor:z.boolean(),numero_empleados:z.number().int().nonnegative(),ingresos_ultimo_ano:z.object({valor:z.number().nonnegative(),moneda:z.string(),ano:z.number().int()}).strict(),certificaciones:z.array(z.string()),representante_legal:contact,contacto_comercial:contact,contacto_financiero:contact,banco:z.object({nombre:z.string(),tipo_cuenta:z.string(),numero_cuenta:z.string(),titular:z.string(),swift:z.string(),moneda:z.string()}).strict()
}).strict();
export const mappedField = field.extend({ campo: z.string().nullable(), valor: scalar.nullable(), estado: z.enum(['lleno', 'faltante', 'requiere_confirmacion']), fuente: z.string().nullable(), confianza:z.number().min(0).max(1), nota:z.string().nullable(), equivalente_pais:z.string().nullable() });
export const mapping = z.object({ evaluacion_soportes:supportEvaluation, caso_id: caseId, formato: solicitud.shape.formato, plantilla_valida:z.boolean(), campos: z.array(mappedField), llenos:z.array(mappedField), faltantes:z.array(mappedField), requiere_confirmacion:z.array(mappedField), faltantes_obligatorios: z.array(z.string()), advertencias: z.array(z.string()) }).strict();
export const artifact = z.object({ id: artifactId, nombre: z.string(), mime: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict();
export const generated = z.object({ caso_id:caseId, ruta:z.string(), formato:solicitud.shape.formato, formato_no_soportado:z.boolean(), artefacto:artifact, mapeo:mapping, borrador:z.literal(true), firma:z.literal('pendiente'), advertencias:z.array(z.string()) }).strict();
export const packageData = z.object({ caso_id:caseId, ruta:z.string(), listo_para_firma:z.boolean(), checklist:z.string(), borrador_correo:z.string(), paquete:artifact, formulario:artifact, fecha_evaluacion:date, soportes:z.array(supportStatus), soportes_faltantes:z.array(z.string()), campos_faltantes:z.array(z.string()), listo_para_simular:z.boolean(), firma:z.literal('pendiente'), advertencias:z.array(z.string()) }).strict();
export const sent = z.object({ caso_id:caseId, ruta:z.string(), artefacto:artifact, paquete_id:artifactId, destinatario:z.string().email(), estado:z.literal('simulado'), envio_real:z.literal(false), firma:z.literal('pendiente'), mensaje:z.string() }).strict();
export const contracts = {
  proveedor_leer_solicitud: { input:z.object({caso_id:caseId}).strict(), output:result(z.object({solicitud, pais:solicitud.shape.pais,cliente:z.string(),formato:solicitud.shape.formato,campos:z.array(field.extend({requiere_confirmacion:z.boolean(),equivalente_pais:z.string().nullable()})),soportes:z.array(z.string()),advertencias:z.array(z.string()), soportes_exigidos:z.array(z.string()), fuente:z.string(), portal_manual:z.boolean()}).strict()) },
  proveedor_mapear_campos: { input:z.object({caso_id:caseId}).strict(), output:result(mapping) },
  proveedor_generar_formulario: { input:z.object({caso_id:caseId}).strict(), output:result(generated) },
  proveedor_armar_paquete: { input:z.object({caso_id:caseId, formulario_id:artifactId, fecha_evaluacion:date.optional()}).strict(), output:result(packageData) },
  proveedor_simular_envio: { input:z.object({caso_id:caseId, paquete_id:artifactId}).strict(), output:result(sent) }
} as const;
export type ToolName = keyof typeof contracts;
export type CriticalAction = 'proveedor_armar_paquete' | 'proveedor_simular_envio';
export const toolNames = Object.keys(contracts) as ToolName[];

// Contratos públicos obligatorios del PRD; la fachada traduce al motor interno.
export const publicContracts = {
 proveedor_leer_solicitud: {input:z.object({caso:caseId.describe('Carpeta del caso en fixtures/reto-01/casos/')}).strict(),output:contracts.proveedor_leer_solicitud.output},
 proveedor_mapear_campos: {input:z.object({caso:caseId.describe('Caso a mapear'),campos:z.array(field.strip()).max(500).describe('Campos retornados por la lectura; se ignoran las anotaciones de revisión, nunca se alteran etiquetas ni celdas')}).strict(),output:contracts.proveedor_mapear_campos.output},
 proveedor_generar_formulario: {input:z.object({caso:caseId.describe('Caso del formulario'),mapeo:mapping.describe('Mapeo validado retornado por la herramienta')}).strict(),output:contracts.proveedor_generar_formulario.output},
 proveedor_armar_paquete: {input:z.object({caso:caseId.describe('Caso con formulario generado en la sesión')}).strict(),output:contracts.proveedor_armar_paquete.output},
 proveedor_simular_envio: {input:z.object({caso:caseId.describe('Caso del paquete'),confirmado:z.boolean().describe('Se exige además autorización del turno inmediato anterior en el contexto confiable')}).strict(),output:contracts.proveedor_simular_envio.output}
} as const;
