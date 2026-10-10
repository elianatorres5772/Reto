const $=id=>document.getElementById(id);
let session=null,busy=false;
const cards=new Map();
function message(text,role='assistant') {const el=document.createElement('article');el.className=`message ${role}`;const label=document.createElement('strong');label.textContent=role==='user'?'Tú':'Agente';const pre=document.createElement('pre');pre.textContent=text;el.append(label,pre);$('history').append(el);el.scrollIntoView({block:'nearest'});}
function setBusy(value) {busy=value;$('connection-status').textContent=session?(value?'Procesando tu solicitud':'Listo para ayudarte'):'Conectando…';$('thinking').hidden=!value;document.querySelectorAll('button,input,select').forEach(el=>el.disabled=value||!session);}
function artifacts(data) {
  if(!data||typeof data!=='object')return [];
  return Object.values(data).filter(v=>v&&typeof v==='object'&&typeof v.id==='string'&&typeof v.sha256==='string'&&typeof v.nombre==='string');
}
function event(e) {
  if(e.type==='thinking'){$('thinking').hidden=!e.active;return;}
  if(e.type==='message'){message(e.text);return;}
  if(e.type==='confirmation') {
    $('confirmation-state').textContent=e.state==='confirmed'?'Confirmación recibida':e.state==='cancelled'?'Confirmación cancelada':'';
    $('confirmation').hidden=e.state!=='pending';
    if(e.question)$('question').textContent=e.question;
    if(e.state==='confirmed')message('Confirmación recibida para la acción solicitada.');
    if(e.state==='cancelled')message('Confirmación cancelada. Para continuar, solicita de nuevo la acción.');
    return;
  }
  if(e.type==='tool_call') {
    const card=document.createElement('details');card.className='tool';const title=document.createElement('summary');title.textContent=`${e.name} · ejecutando`;
    const pre=document.createElement('pre');pre.textContent=JSON.stringify(e.input,null,2);card.append(title,pre);$('history').append(card);cards.set(e.name,card);return;
  }
  if(e.type==='tool_result') {
    const card=cards.get(e.name);if(!card)return;
    card.querySelector('summary').textContent=`${e.name} · ${e.result.ok?'completada':'error controlado'}`;
    const pre=document.createElement('pre');pre.textContent=JSON.stringify(e.result,null,2);card.append(pre);
    if(e.result.ok) for(const a of artifacts(e.result.data)) {
      const button=document.createElement('button');button.textContent=`Descargar ${a.nombre}`;
      button.addEventListener('click',async()=>{
        try {const r=await fetch(`/api/artifacts/${encodeURIComponent(a.id)}`,{headers:{'X-Session-Id':session}});if(!r.ok){message('El artefacto ya no está disponible.');return;}const u=URL.createObjectURL(await r.blob());const link=document.createElement('a');link.href=u;link.download=a.nombre;link.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}catch{message('No se pudo descargar el artefacto.');}
      });card.append(button);
    }
    card.open=!e.result.ok;return;
  }
}
async function send(text) {
  if(busy||!session)return;
  const caseId=$('case').value;if(!caseId)return;
  message(text,'user');$('message').value='';$('confirmation').hidden=true;setBusy(true);
  try {
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json','X-Session-Id':session},body:JSON.stringify({caso_id:caseId,message:text})});
    if(!r.ok){message('No se pudo procesar el turno. Si la sesión expiró, recarga la página.');return;}
    const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';
    while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))!==-1){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line)event(JSON.parse(line));}}
    buffer+=decoder.decode();if(buffer.trim())event(JSON.parse(buffer));
  } catch {message('Conexión interrumpida. Revisa los resultados antes de volver a ejecutar una acción.');}
  finally {setBusy(false);}
}
$('chat').addEventListener('submit',e=>{e.preventDefault();const text=$('message').value.trim();if(text)send(text);});
document.querySelectorAll('[data-command]').forEach(b=>b.addEventListener('click',()=>send(b.dataset.command)));
$('yes').addEventListener('click',()=>send('sí'));$('no').addEventListener('click',()=>send('no'));
$('case').addEventListener('change',()=>send('leer'));
async function init() {
  setBusy(true);
  try {
    const [sr,cr,hr]=await Promise.all([fetch('/api/session',{method:'POST'}),fetch('/api/cases'),fetch('/api/health')]);
    const [s,c,h]=await Promise.all([sr.json(),cr.json(),hr.json()]);
    if(!s.ok||!c.ok) {$('connection-status').textContent='Sin conexión';document.querySelector('.connection').classList.add('offline');message('No se pudo iniciar el chat o cargar los fixtures.');return;}
    session=s.session_id;$('case').replaceChildren();
    for(const item of c.data){const o=document.createElement('option');o.value=item.id;o.textContent=`${item.cliente} · ${item.formato.toUpperCase()}`;$('case').append(o);}
    $('mode').textContent=h.mode==='deterministic'?'Modo sin LLM':'LLM para clasificación de intención';
    message('Selecciona una solicitud y pulsa «Preparar borrador». Puedes consultar cada herramienta y descargar los documentos generados.');
  } catch {$('connection-status').textContent='Sin conexión';document.querySelector('.connection').classList.add('offline');message('No se pudo conectar al servidor.');}
  finally {setBusy(false);if(!session){$('connection-status').textContent='Sin conexión';document.querySelector('.connection').classList.add('offline');}}
}
init();
