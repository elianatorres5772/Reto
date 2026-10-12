const chat = id => document.getElementById(id);
let chatSession = null, chatBusy = false;
const toolCards = new Map();
function chatElement(tag, value, className) { const node = document.createElement(tag); node.textContent = value ?? ''; if (className) node.className = className; return node; }
function chatMessage(value, role = 'assistant') {
  const article = chatElement('article', '', `chat-message ${role}`);
  article.append(chatElement('strong', role === 'user' ? 'Tú' : 'Agente'), chatElement('p', value));
  chat('chat-history').append(article); article.scrollIntoView({ block: 'nearest' });
}
function chatSetBusy(value) {
  chatBusy = value; chat('chat-thinking').hidden = !value;
  chat('chat-dialog').querySelectorAll('form button,form input,select,.chat-commands button,.chat-confirmation button').forEach(node => node.disabled = value || !chatSession);
}
function toolSummary(result) {
  if (!result.ok) return `error: ${result.error.message}`;
  const data = result.data;
  if (data.ruta) return `ruta: ${data.ruta}${'listo_para_firma' in data ? ` · listo para firma: ${data.listo_para_firma ? 'sí' : 'no'}` : ''}`;
  if (data.llenos) return `${data.llenos.length} llenos · ${data.faltantes.length} faltantes · ${data.requiere_confirmacion.length} por confirmar`;
  if (data.campos) return `${data.cliente} · ${data.pais} · ${data.formato} · ${data.campos.length} campos · ${data.soportes.length} soportes`;
  return 'completada';
}
function downloads(data) {
  if (!data || typeof data !== 'object') return [];
  return Object.values(data).filter(v => v && typeof v === 'object' && typeof v.id === 'string' && typeof v.sha256 === 'string' && typeof v.nombre === 'string');
}
function downloadLink(artifact) {
  const button = chatElement('button', `Descargar ${artifact.nombre}`, 'secondary'); button.type = 'button';
  button.addEventListener('click', async () => {
    try {
      const response = await fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}`, { headers: { 'X-Session-Id': chatSession } });
      if (!response.ok) { chatMessage('El documento ya no está disponible en esta sesión.'); return; }
      const url = URL.createObjectURL(await response.blob()); const link = chatElement('a'); link.href = url; link.download = artifact.nombre; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { chatMessage('No se pudo descargar el documento.'); }
  });
  return button;
}
function chatEvent(event) {
  if (event.type === 'case_selected') { chat('chat-case').value = event.caseId; return; }
  if (event.type === 'thinking') { chat('chat-thinking').hidden = !event.active; return; }
  if (event.type === 'message') { chatMessage(event.text); return; }
  if (event.type === 'confirmation') {
    chat('chat-confirmation').hidden = event.state !== 'pending';
    if (event.question) chat('chat-question').textContent = event.question;
    if (event.state === 'cancelled') chatMessage('Confirmación cancelada. Para continuar, vuelve a pedir la acción.');
    return;
  }
  if (event.type === 'tool_call') {
    const card = chatElement('details', '', 'chat-tool');
    card.append(chatElement('summary', `🔧 ${event.name} · ejecutando`), chatElement('pre', `Argumentos: ${JSON.stringify(event.input, null, 2)}`));
    chat('chat-history').append(card); toolCards.set(event.name, card); return;
  }
  if (event.type === 'tool_result') {
    const card = toolCards.get(event.name); if (!card) return;
    card.dataset.ok = String(event.result.ok);
    card.querySelector('summary').textContent = `🔧 ${event.name} · ${event.result.ok ? 'ok' : 'error controlado'} — ${toolSummary(event.result)}`;
    card.append(chatElement('pre', `Resultado: ${JSON.stringify(event.result, null, 2)}`));
    if (event.result.ok) for (const artifact of downloads(event.result.data)) card.append(downloadLink(artifact));
    card.scrollIntoView({ block: 'nearest' });
  }
}
async function chatSend(value) {
  if (chatBusy || !chatSession || !chat('chat-case').value) return;
  chatMessage(value, 'user'); chat('chat-message').value = ''; chat('chat-confirmation').hidden = true; chatSetBusy(true);
  try {
    const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Id': chatSession }, body: JSON.stringify({ caso_id: chat('chat-case').value, message: value }) });
    if (!response.ok) { chatMessage(response.status === 401 ? 'La sesión expiró. Recarga la página.' : 'No se pudo procesar el mensaje. Vuelve a intentarlo.'); return; }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
    while (true) {
      const { done, value: chunk } = await reader.read(); if (done) break;
      buffer += decoder.decode(chunk, { stream: true }); let index;
      while ((index = buffer.indexOf('\n')) !== -1) { const line = buffer.slice(0, index); buffer = buffer.slice(index + 1); if (line) chatEvent(JSON.parse(line)); }
    }
    buffer += decoder.decode(); if (buffer.trim()) chatEvent(JSON.parse(buffer));
  } catch { chatMessage('Conexión interrumpida. Revisa los resultados antes de repetir una acción.'); }
  finally { chatSetBusy(false); chat('chat-message').focus(); }
}
async function chatInit() {
  chatSetBusy(true);
  try {
    const [sr, cr, hr] = await Promise.all([fetch('/api/session', { method: 'POST' }), fetch('/api/cases'), fetch('/api/health')]);
    const [s, c, h] = await Promise.all([sr.json(), cr.json(), hr.json()]);
    if (!s.ok || !c.ok) throw new Error('Inicio no disponible');
    chatSession = s.session_id;
    for (const item of c.data) { const option = chatElement('option', `${item.cliente} · ${item.formato.toUpperCase()}`); option.value = item.id; chat('chat-case').append(option); }
    chat('chat-mode').textContent = (h.mode === 'deterministic' ? 'Modo sin LLM: entiende órdenes como «procesa el caso…» o «envía»' : `LLM: ${h.provider} · ${h.model}`) + (h.fecha_evaluacion ? ` · Vigencias evaluadas al ${h.fecha_evaluacion} (fecha simulada)` : '');
    chatMessage('Hola. Pídeme, por ejemplo: «Procesa el caso ec-corp-andina. No envíes nada todavía.» Verás cada herramienta que ejecuto y te pediré confirmación antes de cualquier envío.');
  } catch { chat('chat-mode').textContent = 'Sin conexión'; chatMessage('No se pudo conectar con el servidor. Recarga la página.'); }
  finally { chatSetBusy(false); }
}
chat('chat-open').addEventListener('click', () => {
  chat('chat-dialog').showModal();
  if (!chatSession && !chatBusy) chatInit();
  const selected = document.getElementById('case')?.value;
  if (selected && !chat('chat-history').childElementCount) chat('chat-case').value = selected;
  chat('chat-message').focus();
});
chat('chat-close').addEventListener('click', () => chat('chat-dialog').close());
chat('chat-form').addEventListener('submit', event => { event.preventDefault(); const value = chat('chat-message').value.trim(); if (value) chatSend(value); });
chat('chat-dialog').querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => chatSend(button.dataset.command)));
chat('chat-yes').addEventListener('click', () => chatSend('sí'));
chat('chat-no').addEventListener('click', () => chatSend('no'));
