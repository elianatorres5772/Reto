const $ = id => document.getElementById(id);
let session = null, busy = false, state = null;
const stepNames = { lectura: 'Leer solicitud recibida', mapeo: 'Completar campos desde el maestro', formulario: 'Generar formulario solicitado', paquete: 'Reunir formulario y soportes' };
const statusNames = { lleno: 'Completado', faltante: 'Dato faltante', requiere_confirmacion: 'Revisión humana', disponible: 'Disponible', vencido: 'Vencido', archivo_faltante: 'Archivo faltante', ausente: 'Ausente' };
const phaseNames = { selected: 'Solicitud cargada', preparing: 'Preparando formulario', awaiting_approval: 'Pendiente de autorización', preparing_package: 'Reuniendo documentos', ready_for_review: 'Paquete preparado', blocked: 'Paquete con soportes pendientes', portal_manual: 'Gestión manual del portal', cancelled: 'Preparación del paquete cancelada', error: 'Preparación con pendientes' };
function text(id, value) { $(id).textContent = value ?? ''; }
function alert(message) { text('alert', message); $('alert').hidden = !message; }
function element(tag, value, className) { const node = document.createElement(tag); node.textContent = value ?? ''; if (className) node.className = className; return node; }
function pill(value, status) { return element('span', value, `pill ${['vencido','archivo_faltante','ausente'].includes(status) ? 'bad' : ['faltante','requiere_confirmacion'].includes(status) ? 'warn' : ''}`); }
function setBusy(value) {
  busy = value; $('thinking').hidden = !value;
  document.querySelectorAll('button,select').forEach(node => node.disabled = value || !session);
  $('prepare').disabled = value || !session || !$('case').value;
  text('connection-status', value ? 'Preparando documentación…' : session ? 'Listo para preparar' : 'Sin conexión');
}
function metadata(label, value) { const div = element('div'); div.append(element('dt', label), element('dd', value)); $('request-meta').append(div); }
function downloadButton(artifact) {
  const button = element('button', `Descargar ${artifact.nombre}`);
  button.type = 'button';
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      const response = await fetch(`/api/artifacts/${encodeURIComponent(artifact.id)}`, { headers: { 'X-Session-Id': session } });
      if (!response.ok) { alert('El documento no está disponible en esta sesión. Vuelve a preparar la solicitud.'); return; }
      const url = URL.createObjectURL(await response.blob());
      const link = element('a'); link.href = url; link.download = artifact.nombre; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { alert('No se pudo descargar el documento. Revisa la conexión.'); }
    finally { button.disabled = busy; }
  });
  return button;
}
function render(next) {
  state = next;
  if (state.caso_id) $('case').value = state.caso_id;
  document.querySelectorAll('.case-item').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.case === state.caso_id)));
  $('request-meta').replaceChildren(); $('fields').replaceChildren(); $('supports').replaceChildren(); $('warnings').replaceChildren(); $('downloads').replaceChildren(); $('trace-list').replaceChildren();
  const request = state.solicitud?.solicitud;
  text('request-title', request?.cliente ?? 'Selecciona una solicitud para comenzar');
  $('format').hidden = !request; text('format', request?.formato.toUpperCase()); $('email').hidden = !request;
  if (request) {
    metadata('Asunto', request.asunto); metadata('Remitente', request.de); metadata('Fecha del correo', request.fecha); metadata('País del cliente', request.pais);
    text('email-body', request.cuerpo); text('attachments', `Adjuntos recibidos: ${request.adjuntos.join(', ') || 'ninguno'}`);
    text('required-supports', `Soportes exigidos: ${state.solicitud.soportes_exigidos.join(', ') || 'ninguno'}`);
  }
  document.querySelectorAll('#steps li').forEach(node => {
    const step = state.steps.find(item => item.step === node.dataset.step);
    node.dataset.status = step?.status ?? 'pending';
    node.setAttribute('aria-label', `${stepNames[node.dataset.step]}: ${step?.status === 'done' ? 'completado' : step?.status === 'running' ? 'en curso' : step?.status === 'error' ? 'error' : 'pendiente'}`);
  });
  const running = state.steps.find(step => step.status === 'running');
  text('processing-label', running ? stepNames[running.step] + '…' : 'Preparando documentos…');
  $('review').hidden = !state.mapeo; $('supports-panel').hidden = !state.mapeo;
  $('field-counts').replaceChildren();
  if (state.mapeo) {
    const m = state.mapeo;
    for (const [key, label] of [['llenos','completados'],['faltantes','faltantes'],['requiere_confirmacion','por revisar']]) $('field-counts').append(pill(`${m[key].length} ${label}`, key === 'faltantes' ? 'faltante' : key === 'requiere_confirmacion' ? key : 'lleno'));
    text('mapping-summary', 'Cada valor tiene su fuente. Los datos ausentes permanecen pendientes y las equivalencias tributarias requieren revisión humana.');
    for (const field of m.campos) {
      const row = element('tr'); row.append(element('td', field.etiqueta), element('td', field.valor === null ? 'Pendiente: no existe un valor respaldado' : String(field.valor)));
      const status = element('td'); status.append(pill(statusNames[field.estado], field.estado));
      const source = element('td', field.fuente ?? 'Sin fuente');
      if (field.campo) source.append(element('small', `Campo maestro: ${field.campo}`));
      if (field.nota) source.append(element('small', field.nota));
      if (field.equivalente_pais) source.append(element('small', `Equivalente a revisar: ${field.equivalente_pais}`));
      row.append(status, source); $('fields').append(row);
    }
    for (const warning of [...new Set([...m.advertencias, ...(state.formulario?.advertencias ?? [])])]) $('warnings').append(element('li', warning));
    const evaluation = state.paquete ?? m.evaluacion_soportes;
    text('evaluation-date', `Evaluación UTC: ${evaluation.fecha_evaluacion}`);
    text('supports-summary', evaluation.listo_para_firma ? 'Los soportes exigidos están disponibles y vigentes según el índice. La revisión y firma humana siguen pendientes.' : 'Hay soportes ausentes, vencidos o sin archivo. Puedes descargar el borrador, pero el paquete no está listo para firma.');
    for (const support of evaluation.soportes) {
      const row = element('tr'); row.append(element('td', support.tipo), element('td', support.archivo), element('td', support.vigencia_hasta ?? 'Sin vencimiento informado'));
      const status = element('td'); status.append(pill(statusNames[support.estado], support.estado)); row.append(status); $('supports').append(row);
    }
    for (const name of evaluation.soportes_faltantes ?? evaluation.faltantes) {
      const row = element('tr'); row.append(element('td', name), element('td', 'No disponible en el repositorio'), element('td', '—'));
      const status = element('td'); status.append(pill('Ausente', 'ausente')); row.append(status); $('supports').append(row);
    }
  }
  $('documents').hidden = !state.formulario;
  if (state.formulario) {
    $('downloads').append(downloadButton(state.formulario.artefacto));
    if (state.paquete) $('downloads').append(downloadButton(state.paquete.paquete));
    text('document-note', state.phase === 'portal_manual' ? 'Formato no soportado: portal web. Descarga los valores para copiarlos manualmente; no se realiza acceso al portal.' : 'Formulario reconstruido desde los mapas JSON suministrados. El ZIP incluye los soportes disponibles, checklist, manifiesto y borrador de correo, sin firma.');
  }
  $('confirmation').hidden = !state.confirmation; text('question', state.confirmation?.question);
  $('delivery').hidden = !state.paquete && state.phase !== 'cancelled'; $('delivery').dataset.phase = state.phase;
  text('delivery-title', state.phase === 'cancelled' ? 'Empaquetado cancelado' : state.paquete?.listo_para_firma ? 'Paquete listo para revisión y firma' : 'Paquete generado con soportes pendientes');
  text('delivery-summary', state.phase === 'cancelled' ? 'Se conserva el formulario generado. Para autorizar el paquete, vuelve a preparar los documentos.' : 'Descarga el ZIP y revisa sus documentos. La preparación termina aquí; los soportes pendientes y los campos por revisar se detallan arriba y en el checklist.');
  $('trace').hidden = !state.steps.length;
  for (const step of state.steps) $('trace-list').append(element('li', `${stepNames[step.step]} · ${step.status === 'done' ? 'completado' : step.status === 'running' ? 'en curso' : 'error'}`));
  if (state.solicitud) $('trace-list').append(element('li', `Solicitud de origen: ${state.solicitud.fuente}`));
  alert(state.error?.message ?? '');
  if (!busy) text('connection-status', phaseNames[state.phase] ?? 'Listo para preparar');
}
async function action(name, input) {
  if (busy || !session) return;
  alert(''); setBusy(true);
  try {
    const response = await fetch(`/api/workflow/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-Id': session }, body: JSON.stringify(input) });
    if (!response.ok) { alert(response.status === 401 ? 'La sesión expiró. Recarga la página.' : 'No se pudo procesar la solicitud. Vuelve a intentarlo.'); return; }
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '', completed = false;
    const consume = line => { const event = JSON.parse(line); if (event.type === 'state') render(event.data); if (event.type === 'error') alert(event.error.message); if (event.type === 'done') completed = true; };
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }); let index;
      while ((index = buffer.indexOf('\n')) !== -1) { const line = buffer.slice(0,index); buffer = buffer.slice(index+1); if (line) consume(line); }
    }
    buffer += decoder.decode(); if (buffer.trim()) consume(buffer);
    if (!completed) throw new Error('Respuesta incompleta');
  } catch {
    // Recupera el resultado del servidor sin repetir una operación crítica.
    try {
      const result = await (await fetch('/api/workflow', { headers: { 'X-Session-Id': session } })).json();
      if (result.ok) render(result.data);
    } catch { /* La selección permite iniciar una nueva preparación al recuperar conexión. */ }
    alert('Conexión interrumpida. Revisa el estado recuperado antes de volver a preparar o autorizar documentos.');
  } finally { setBusy(false); }
}
async function choose(id) { if (busy) return; $('case').value = id; await action('select', { caso_id: id }); }
$('case').addEventListener('change', () => choose($('case').value));
$('prepare').addEventListener('click', () => action('prepare', { caso_id: $('case').value }));
for (const [button, confirmado] of [['approve', true], ['cancel', false]]) $(button).addEventListener('click', () => {
  if (!state?.confirmation) return;
  action('confirm', { caso_id: state.caso_id, confirmation_id: state.confirmation.id, confirmado });
});
async function init() {
  setBusy(true);
  try {
    const [sr, cr] = await Promise.all([fetch('/api/session', { method: 'POST' }), fetch('/api/cases')]);
    const [s,c] = await Promise.all([sr.json(), cr.json()]);
    if (!sr.ok || !cr.ok || !s.ok || !c.ok) throw new Error('Inicio no disponible');
    session = s.session_id; $('case').replaceChildren();
    const placeholder = element('option', 'Selecciona un correo recibido'); placeholder.value = ''; placeholder.disabled = true; placeholder.selected = true; $('case').append(placeholder);
    for (const item of c.data) {
      const option = element('option', `${item.cliente} · ${item.formato.toUpperCase()}`); option.value = item.id; $('case').append(option);
      const button = element('button', '', 'case-item'); button.type = 'button'; button.dataset.case = item.id; button.setAttribute('aria-pressed','false');
      button.append(element('strong', item.cliente), element('span', item.formato.toUpperCase()));
      button.addEventListener('click', () => choose(item.id)); $('case-list').append(button);
    }
  } catch { alert('No se pudieron cargar las solicitudes. Recarga la página o comprueba que el servidor esté disponible.'); }
  finally { setBusy(false); }
}
init();
