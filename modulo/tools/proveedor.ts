// Reexportación: mismas herramientas que utiliza el aplicativo, sin importar HTTP.
export { leer_solicitud, mapear_campos, generar_formulario, armar_paquete, simular_envio, proveedorTools, createProveedorTools, executePublic, releaseToolSession } from '../../src/tools/proveedor.js';
export type { ToolContext } from '../../src/tools/proveedor.js';
