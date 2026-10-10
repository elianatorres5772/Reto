import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { caseId } from '../contracts/proveedor.js';
export async function writeAudit(root:string,sessionId:string,caso:unknown,herramienta:string,ok:boolean,resumen:string):Promise<boolean> {
  try {
    const key=process.env.LLM_API_KEY;
    const clean=key?resumen.split(key).join('[REDACTED]'):resumen;
    const row=JSON.stringify({ts:new Date().toISOString(),sessionId,herramienta,ok,resumen:clean})+'\n';
    await mkdir(root,{recursive:true});
    await appendFile(join(root,'log.jsonl'),row,{mode:0o600});
    const parsed=caseId.safeParse(caso);
    if(parsed.success){const dir=join(root,parsed.data);await mkdir(dir,{recursive:true});await appendFile(join(dir,'log.jsonl'),row,{mode:0o600});}
    return true;
  } catch {return false;}
}
