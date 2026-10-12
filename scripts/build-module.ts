import { mkdir, readFile, writeFile } from 'node:fs/promises';
// Git en Windows puede convertir finales de línea; la comparación es por contenido.
const lf=(text:string)=>text.replace(/\r\n/g,'\n');
const prompt=await readFile('agent/prompt.md','utf8');
const knowledge=await readFile('src/knowledge/registro-proveedor.md','utf8');
const files={
 'modulo/agent.md':'---\ndescription: Agente de registro como proveedor con datos trazables y confirmación humana\nmode: primary\npermission:\n  edit: deny\n  bash: deny\n---\n\n'+prompt,
 'modulo/tools/proveedor.ts':"// Reexportación: mismas herramientas que utiliza el aplicativo, sin importar HTTP.\nexport { leer_solicitud, mapear_campos, generar_formulario, armar_paquete, simular_envio, proveedorTools, createProveedorTools, executePublic, releaseToolSession } from '../../src/tools/proveedor.js';\nexport type { ToolContext } from '../../src/tools/proveedor.js';\n",
 'modulo/skill/registro-proveedor/SKILL.md':'---\nname: registro-proveedor\ndescription: Preparar registro como proveedor con datos de herramientas, soportes y cierre humano\n---\n\n'+knowledge
};
let valid=true;
for(const [path,content] of Object.entries(files)) {
 if(process.argv.includes('--check')){try{if(lf(await readFile(path,'utf8'))!==lf(content))valid=false;}catch{valid=false;}}
 else {await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await writeFile(path,content);}
}
if(!valid){console.error('Módulo desactualizado: ejecuta pnpm run module.');process.exitCode=1;}
else console.log(process.argv.includes('--check')?'Módulo coincide con prompt, conocimiento y herramientas del aplicativo.':'Módulo generado desde las fuentes del aplicativo.');
