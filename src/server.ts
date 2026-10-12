import 'dotenv/config';
import { createServer, type ServerResponse, type IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createSession } from './agent/orchestrator.js';
import { llmProvider, llmModel } from './llm/runtime.js';
import { createProveedorTools } from './tools/proveedor.js';
import { caseId, artifactId } from './contracts/proveedor.js';
import { createRegistrationWorkflow } from './workflow/registration.js';
import { workflowAction, workflowApproval } from './contracts/workflow.js';
const sessions=new Map<string,{session:ReturnType<typeof createSession>;workflow:ReturnType<typeof createRegistrationWorkflow>;accessed:number}>();
const catalog=createProveedorTools();
// Fecha de evaluación simulada para la defensa (YYYY-MM-DD, no futura). Vacía: fecha UTC actual.
const evaluationDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(d=>!Number.isNaN(Date.parse(d))&&d<=new Date().toISOString().slice(0,10)).optional().safeParse(process.env.FECHA_EVALUACION||undefined);
const today=evaluationDate.success&&evaluationDate.data?()=>evaluationDate.data!:undefined;
const MAX_SESSIONS=100;
// Protección CSRF solo para peticiones que cambian estado. Abrir la página desde otro sitio
// (por ejemplo, un enlace en el panel del hosting) es una navegación GET legítima.
const originAllowed=(req:IncomingMessage)=>{
 if(req.method==='GET'||req.method==='HEAD')return true;
 const origin=req.headers.origin;
 // Detrás de un proxy (Render) el dominio público puede llegar en X-Forwarded-Host.
 const hosts=[req.headers.host,...String(req.headers['x-forwarded-host']??'').split(',')].map(h=>h?.trim()).filter(Boolean);
 const sameOrigin=!!origin&&hosts.some(h=>origin===`https://${h}`||origin===`http://${h}`);
 return (!origin||sameOrigin||origin===process.env.PUBLIC_ORIGIN)&&req.headers['sec-fetch-site']!=='cross-site';
};
const requests=new Map<string,{minute:number;count:number}>();
function rateAllowed(req:IncomingMessage){const ip=req.socket.remoteAddress??'unknown',minute=Math.floor(Date.now()/60000);for(const [key,row] of requests)if(row.minute!==minute)requests.delete(key);const row=requests.get(ip)??{minute,count:0};row.count++;requests.set(ip,row);return row.count<=(z.coerce.number().int().min(1).max(10000).safeParse(process.env.CHAT_RATE_LIMIT).data??120);}

const TTL=60*60*1000;
function scrub(value:string) {const key=process.env.LLM_API_KEY;return key?value.split(key).join('[REDACTED]'):value;}
function json(res:ServerResponse,status:number,data:unknown) {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(scrub(JSON.stringify(data)));}
async function body(req:IncomingMessage) {
  let size=0;const chunks:Buffer[]=[];
  for await(const chunk of req){size+=chunk.length;if(size>8192)return null;chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;}catch{return null;}
}
function sessionEntry(req:IncomingMessage) {
  const id=req.headers['x-session-id'];
  if(typeof id!=='string')return null;
  const entry=sessions.get(id);
  if(!entry || Date.now()-entry.accessed>TTL){sessions.delete(id);return null;}
  entry.accessed=Date.now();return entry;
}
function authorized(req:IncomingMessage) { return sessionEntry(req)?.session ?? null; }
export const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  try {
    // Sin CORS. Impide uso desde sitios externos y peticiones de navegador de otro origen.
    if(!originAllowed(req)) {json(res,403,{ok:false,error:'Origen no permitido.'});return;}
    if(req.method==='POST'&&!rateAllowed(req)){json(res,429,{ok:false,error:'Demasiadas solicitudes. Espera un minuto.'});return;}
    const url=new URL(req.url??'/','http://localhost');
    if(req.method==='GET' && ['/','/theme.js','/registration.js','/chat.js','/styles.css','/assets/assistant.svg'].includes(url.pathname)) {
      const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
      res.setHeader('Content-Type',name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.js')?'text/javascript; charset=utf-8':name.endsWith('.svg')?'image/svg+xml':'text/css; charset=utf-8');
      res.end(await readFile(new URL(`../web/${name}`,import.meta.url)));return;
    }
    if(req.method==='GET' && url.pathname==='/api/health') {json(res,200,{ok:true,mode:process.env.LLM_API_KEY?(llmProvider()==='anthropic'?'llm-tools':'llm-intent'):'deterministic',provider:llmProvider(),model:llmModel(),configured:!!process.env.LLM_API_KEY,fecha_evaluacion:today?.()??null});return;}
    if(req.method==='GET' && url.pathname==='/api/cases') {const r=await catalog.listCases();json(res,r.ok?200:500,r);return;}
    if(req.method==='POST' && url.pathname==='/api/session') {
      for(const [id,entry] of sessions)if(Date.now()-entry.accessed>TTL)sessions.delete(id);
      if(sessions.size>=MAX_SESSIONS){json(res,503,{ok:false,error:'Capacidad temporal agotada.'});return;}
      const id=randomUUID();sessions.set(id,{session:createSession({sessionId:id,today}),workflow:createRegistrationWorkflow({sessionId:id,today}),accessed:Date.now()});json(res,201,{ok:true,session_id:id});return;
    }
    if(req.method==='GET' && url.pathname==='/api/workflow') {
      const entry=sessionEntry(req);if(!entry){json(res,401,{ok:false,error:'Sesión no disponible.'});return;}
      json(res,200,{ok:true,data:entry.workflow.snapshot()});return;
    }
    if(req.method==='POST' && ['/api/workflow/select','/api/workflow/prepare','/api/workflow/confirm'].includes(url.pathname)) {
      const entry=sessionEntry(req);if(!entry){json(res,401,{ok:false,error:'Sesión no disponible.'});return;}
      const raw=await body(req);
      const parsed=(url.pathname.endsWith('/confirm')?workflowApproval:workflowAction).safeParse(raw);
      if(!parsed.success){json(res,400,{ok:false,error:'Solicitud de preparación inválida.'});return;}
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});
      const action=url.pathname.endsWith('/confirm')?'confirm':url.pathname.endsWith('/prepare')?'prepare':'select';
      await entry.workflow[action](parsed.data,event=>{if(!res.destroyed)res.write(scrub(JSON.stringify(event))+'\n');});
      res.end();return;
    }
    if(req.method==='GET' && url.pathname.startsWith('/api/sessions/')) {
      const session=authorized(req);
      const id=url.pathname.slice('/api/sessions/'.length);
      if(!session || id!==session.sessionId){json(res,401,{ok:false,error:'Sesión no disponible.'});return;}
      json(res,200,{ok:true,sessionId:id,history:session.history});return;
    }
    if(req.method==='POST' && url.pathname==='/api/chat') {
      const session=authorized(req);if(!session){json(res,401,{ok:false,error:'Sesión no disponible.'});return;}
      const input=z.object({caso_id:caseId,message:z.string().trim().min(1).max(2000)}).strict().safeParse(await body(req));
      if(!input.success){json(res,400,{ok:false,error:'Mensaje inválido.'});return;}
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8'});
      await session.chat(input.data.caso_id,input.data.message,event=>{if(!res.destroyed)res.write(scrub(JSON.stringify(event))+'\n');});
      res.end();return;
    }
    if(req.method==='GET' && url.pathname.startsWith('/api/artifacts/')) {
      const entry=sessionEntry(req);if(!entry){json(res,401,{ok:false,error:'Sesión no disponible.'});return;}
      const id=artifactId.safeParse(url.pathname.slice('/api/artifacts/'.length));
      const file=id.success?(await entry.workflow.tools.download(id.data)??await entry.session.tools.download(id.data)):null;
      if(!file){json(res,404,{ok:false,error:'Artefacto no disponible.'});return;}
      res.writeHead(200,{'Content-Type':file.meta.mime,'Content-Disposition':`attachment; filename="${file.meta.nombre}"`});res.end(file.bytes);return;
    }
    json(res,404,{ok:false,error:'Ruta no disponible.'});
  } catch {if(!res.headersSent)json(res,500,{ok:false,error:'Operación no disponible.'});else res.end();}
});
const port=z.coerce.number().int().min(1).max(65535).safeParse(process.env.PORT??3000);
if(!port.success){console.error('PORT debe ser un puerto válido.');process.exitCode=1;}
else if(!evaluationDate.success){console.error('FECHA_EVALUACION debe tener formato YYYY-MM-DD y no ser futura.');process.exitCode=1;}
else {server.requestTimeout=30000;server.headersTimeout=10000;server.listen(port.data,process.env.HOST??'127.0.0.1',()=>console.log(`Servidor iniciado en puerto ${port.data}.`));}
