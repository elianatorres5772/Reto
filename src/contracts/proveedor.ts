import { z } from 'zod';

export const caseId = z.string().regex(/^[a-z]{2}-[a-z0-9-]+$/).max(100);
export const artifactId = z.string().uuid();
export const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Fecha inválida');
export const errorSchema = z.object({ code: z.enum(['INVALID_INPUT', 'NOT_FOUND', 'INVALID_FIXTURE', 'IO_ERROR', 'CONFIRMATION_REQUIRED', 'INCOMPLETE', 'PORTAL_MANUAL', 'INVALID_OUTPUT']), message: z.string(), retryable: z.boolean() }).strict();
export const result = <T extends z.ZodTypeAny>(data: T) => z.discriminatedUnion('ok', [z.object({ ok: z.literal(true), data }).strict(), z.object({ ok: z.literal(false), error: errorSchema }).strict()]);
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: z.infer<typeof errorSchema> };
export const solicitud = z.object({ id: caseId, de: z.string().email(), para: z.string().email(), asunto: z.string(), fecha: date, pais: z.enum(['CO', 'EC', 'HN', 'PA']), cliente: z.string(), formato: z.enum(['xlsx', 'pdf', 'portal']), cuerpo: z.string(), adjuntos: z.array(z.string()) }).strict();
export const field = z.object({ etiqueta: z.string().min(1), obligatorio: z.boolean().optional(), hoja: z.string().min(1).max(31).optional(), celda_etiqueta: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/).optional(), celda_valor: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/).optional() }).strict();
export const plantilla = z.array(field).min(1).max(500);
export const support = z.object({ tipo: z.string(), archivo: z.string().regex(/^[a-z0-9-]+\.txt$/), vigencia_hasta: date.nullable(), pais_emisor: z.string(), descripcion: z.string() }).strict();
const scalar = z.union([z.string(), z.number().finite(), z.boolean()]);
const contact = z.object({ nombre: z.string(), cargo: z.string(), email: z.string().email(), telefono: z.string().optional(), tipo_identificacion: z.string().optional(), identificacion: z.string().optional() }).strict();
export const maestroSchema = z.object({
  razon_social:z.string(),tipo_sociedad:z.string(),nit:z.string(),digito_verificacion:z.string(),pais:z.string(),ciudad:z.string(),departamento:z.string(),direccion:z.string(),codigo_postal:z.string(),telefono:z.string(),sitio_web:z.string().url(),fecha_constitucion:date,matricula_mercantil:z.string(),ciiu_principal:z.string(),ciiu_secundario:z.string(),actividad_economica:z.string(),regimen_tributario:z.string(),gran_contribuyente:z.boolean(),autorretenedor:z.boolean(),numero_empleados:z.number().int().nonnegative(),ingresos_ultimo_ano:z.object({valor:z.number().nonnegative(),moneda:z.string(),ano:z.number().int()}).strict(),certificaciones:z.array(z.string()),representante_legal:contact,contacto_comercial:contact,contacto_financiero:contact,banco:z.object({nombre:z.string(),tipo_cuenta:z.string(),numero_cuenta:z.string(),titular:z.string(),swift:z.string(),moneda:z.string()}).strict()
}).strict();
export const mappedField = field.extend({ campo: z.string().nullable(), valor: scalar.nullable(), estado: z.enum(['mapeado', 'sin_equivalencia', 'sin_dato']), fuente: z.string().nullable() });
export const mapping = z.object({ caso_id: caseId, formato: solicitud.shape.formato, campos: z.array(mappedField), faltantes_obligatorios: z.array(z.string()), advertencias: z.array(z.string()) }).strict();
export const artifact = z.object({ id: artifactId, nombre: z.string(), mime: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().nonnegative() }).strict();
export const generated = z.object({ caso_id:caseId, artefacto:artifact, mapeo:mapping, borrador:z.literal(true), firma:z.literal('pendiente'), advertencias:z.array(z.string()) }).strict();
export const supportStatus = support.extend({ estado:z.enum(['disponible', 'vencido', 'archivo_faltante']), fuente:z.string() });
export const packageData = z.object({ caso_id:caseId, paquete:artifact, formulario:artifact, fecha_evaluacion:date, soportes:z.array(supportStatus), soportes_faltantes:z.array(z.string()), campos_faltantes:z.array(z.string()), listo_para_simular:z.boolean(), firma:z.literal('pendiente'), advertencias:z.array(z.string()) }).strict();
export const sent = z.object({ caso_id:caseId, paquete_id:artifactId, destinatario:z.string().email(), estado:z.literal('simulado'), envio_real:z.literal(false), firma:z.literal('pendiente'), mensaje:z.string() }).strict();
export const contracts = {
  proveedor_leer_solicitud: { input:z.object({caso_id:caseId}).strict(), output:result(z.object({solicitud, soportes_exigidos:z.array(z.string()), fuente:z.string(), portal_manual:z.boolean()}).strict()) },
  proveedor_mapear_campos: { input:z.object({caso_id:caseId}).strict(), output:result(mapping) },
  proveedor_generar_formulario: { input:z.object({caso_id:caseId}).strict(), output:result(generated) },
  proveedor_armar_paquete: { input:z.object({caso_id:caseId, formulario_id:artifactId, fecha_evaluacion:date.optional()}).strict(), output:result(packageData) },
  proveedor_simular_envio: { input:z.object({caso_id:caseId, paquete_id:artifactId}).strict(), output:result(sent) }
} as const;
export type ToolName = keyof typeof contracts;
export type CriticalAction = 'proveedor_armar_paquete' | 'proveedor_simular_envio';
export const toolNames = Object.keys(contracts) as ToolName[];
