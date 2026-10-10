import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { unzipSync } from 'fflate';

test('HTTP: chat incremental, confirmación, descarga aislada, errores y seguridad',async()=>{
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const address=probe.address();assert.ok(address&&typeof address!=='string');const port=address.port;await new Promise<void>(r=>probe.close(()=>r()));
  const base=`http://127.0.0.1:${port}`;
  const secret=`test-key-${randomUUID()}`;
  const child=spawn(process.execPath,['--import','tsx','src/server/index.ts'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',LLM_API_KEY:secret},stdio:['ignore','pipe','pipe']});
  let logs='';child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
  try {
    let ready=false;
    for(let i=0;i<100;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok){ready=true;break;}}catch{}await delay(50);}
    assert.ok(ready,'El servidor debe arrancar');
    const html=await fetch(base);assert.equal(html.status,200);assert.ok((await html.text()).includes('Registro como proveedor'));assert.ok(html.headers.get('content-security-policy'));
    const cases=await (await fetch(`${base}/api/cases`)).json() as any;assert.equal(cases.data.length,4);
    const session=await (await fetch(`${base}/api/session`,{method:'POST'})).json() as any;
    const session2=await (await fetch(`${base}/api/session`,{method:'POST'})).json() as any;
    const headers={'Content-Type':'application/json','X-Session-Id':session.session_id};
    const chat=async(message:string)=>{
      const response=await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({caso_id:'co-industrias-delta',message})});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/x-ndjson; charset=utf-8');
      const text=await response.text();assert.equal(text.includes(secret),false);return text.trim().split('\n').map(line=>JSON.parse(line));
    };
    const events=await chat('preparar');assert.equal(events[0].type,'thinking');assert.equal(events.at(-1).type,'done');assert.ok(events.some(e=>e.type==='confirmation'&&e.state==='pending'));
    assert.ok(!events.some(e=>e.type==='tool_call'&&e.name==='proveedor_armar_paquete'));
    const generated=events.find(e=>e.type==='tool_result'&&e.name==='proveedor_generar_formulario');assert.equal(generated.result.ok,true);
    const f=generated.result.data.artefacto;
    const download=await fetch(`${base}/api/artifacts/${f.id}`,{headers});assert.equal(download.status,200);assert.ok((await download.arrayBuffer()).byteLength>100);
    const foreign=await fetch(`${base}/api/artifacts/${f.id}`,{headers:{'X-Session-Id':session2.session_id}});assert.equal(foreign.status,404);
    const packed=await chat('sí');const pack=packed.find(e=>e.type==='tool_result'&&e.name==='proveedor_armar_paquete');assert.equal(pack.result.ok,true);
    const zip=await fetch(`${base}/api/artifacts/${pack.result.data.paquete.id}`,{headers});const files=unzipSync(new Uint8Array(await zip.arrayBuffer()));assert.ok(files['manifiesto.json']);
    assert.ok(!(await chat('sí')).some(e=>e.type==='tool_call'));
    const malformed=await fetch(`${base}/api/chat`,{method:'POST',headers,body:'{'});assert.equal(malformed.status,400);
    const traversal=await fetch(`${base}/api/chat`,{method:'POST',headers,body:JSON.stringify({caso_id:'../../maestro',message:'leer'})});assert.equal(traversal.status,400);
    const csrf=await fetch(`${base}/api/chat`,{method:'POST',headers:{...headers,Origin:'https://attacker.invalid'},body:'{}'});assert.equal(csrf.status,403);
    const unauth=await fetch(`${base}/api/chat`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauth.status,401);
    assert.ok((await chat('leer')).some(e=>e.type==='tool_result'&&e.result.ok));
    assert.equal(logs.includes(secret),false);
  } finally {child.kill('SIGTERM');await once(child,'exit');}
});
