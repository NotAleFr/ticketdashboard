import { apiJson } from '../../api.js';

const $ = (selector) => document.querySelector(selector);
const body = $('#users-body');
const detail = $('.user-detail-card');
const roleFilter = $('[aria-label="Filtrar por rol"]');
const statusFilter = $('[aria-label="Filtrar por estado"]');
const search = $('.search-input');
const dialog = $('#user-dialog');
const form = $('#user-form');
const fields = form.elements;
const message = $('#user-dialog-message');
const submit = $('#save-user');
let users = [];
let labs = [];
let selectedId = null;
let editingId = null;
let mode = 'edit';
let busy = false;
let currentUserId = null;
const mobile = window.matchMedia('(max-width: 1024px)');

const fullName = (user) => `${user.nombre} ${user.apellido}`;
const role = (user) => user.id_rol === 1 ? ['administrador', 'Administrador']
  : user.id_rol === 3 ? ['docente', 'Docente']
    : user.is_leader ? ['lider', 'Líder Lab'] : ['soporte', 'Soporte'];
const roleKey = (user) => user.id_rol === 1 ? 'administrador' : user.id_rol === 3 ? 'docente' : user.is_leader ? 'lider-lab' : 'tecnico';
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dateFormat = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Hermosillo' });
const date = (value) => {
  if (!value) return 'Sin acceso';
  // El backend manda fechas sin zona horaria que están en UTC; se marcan como tales.
  // Se recortan los microsegundos porque no todos los WebView los aceptan.
  const text = String(value).trim().replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1');
  const naive = /T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text);
  const parsed = new Date(naive ? `${text}Z` : text);
  // Una fecha inválida haría que Intl lance RangeError.
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormat.format(parsed);
};
// Primer carácter real (no media pareja sustituta de un emoji); vacío si no hay texto.
const initial = (text) => [...(text || '').trim()][0] || '';
const actions = document.querySelectorAll('.detail-actions-row button');
const status = (user) => ({ activo: 'Activo', invitado: 'Invitado', suspendido: 'Suspendido' })[user.estado];

function badge(element, kind, label, prefix) {
  element.className = `${prefix} ${kind}`;
  element.textContent = label;
}

function renderDetail(user) {
  detail.hidden = !user;
  if (!user) return;
  $('.identity-name').textContent = fullName(user);
  $('.identity-code').textContent = `USR-${user.id_usuario.slice(0, 8)}`;
  $('.identity-code').title = user.id_usuario;
  $('.avatar-circle').textContent = `${initial(user.nombre)}${initial(user.apellido)}`.toUpperCase() || '?';
  badge($('.detail-status-badges .badge-role'), ...role(user), 'badge-role');
  badge($('.detail-status-badges .badge-status'), user.estado, status(user), 'badge-status');
  const values = [user.email, user.telefono || '—', labs.find((lab) => lab.id_aula === user.laboratorio_asignado_id)?.nombre || 'Sin asignar', user.is_leader ? 'Sí' : 'No', date(user.ultimo_acceso), date(user.fecha_registro)];
  document.querySelectorAll('.metadata-value').forEach((element, index) => { element.textContent = values[index]; });
  $('.btn-detail-danger').textContent = user.estado === 'suspendido' ? 'Reactivar cuenta' : 'Suspender cuenta';
  // El backend impide suspenderse o restablecerse la contraseña a uno mismo; aquí no se ofrecen.
  const self = user.id_usuario === currentUserId;
  $('.btn-detail-danger').hidden = self;
  $('.btn-detail-reset').hidden = self;
}

function render() {
  // La tabla se reconstruye: se recuerda qué control tenía el foco para devolverlo.
  const active = document.activeElement;
  const activeRow = active?.closest?.('#users-body tr[data-id]');
  const focusId = activeRow?.dataset.id;
  const focusButton = activeRow ? [...activeRow.querySelectorAll('button')].indexOf(active) : -1;
  const query = normalize(search.value.trim());
  const visible = users.filter((user) => (roleFilter.value === 'todos' || roleFilter.value === roleKey(user))
    && (statusFilter.value === 'todos' || statusFilter.value === user.estado)
    && normalize(`${fullName(user)} ${user.email}`).includes(query));
  if (!visible.some((user) => user.id_usuario === selectedId)) selectedId = visible[0]?.id_usuario ?? null;
  body.replaceChildren();
  for (const user of visible) {
    const row = $('#user-row-template').content.firstElementChild.cloneNode(true);
    row.dataset.id = user.id_usuario;
    row.tabIndex = 0;
    row.classList.toggle('row-selected', selectedId === user.id_usuario);
    row.querySelector('.td-usuario').textContent = fullName(user);
    row.querySelector('.td-correo').textContent = user.email;
    badge(row.querySelector('.badge-role'), ...role(user), 'badge-role');
    badge(row.querySelector('.badge-status'), user.estado, status(user), 'badge-status');
    row.querySelector('.td-acceso').textContent = date(user.ultimo_acceso);
    row.querySelector('.td-acceso').classList.toggle('sin-acceso', !user.ultimo_acceso);
    const select = () => { selectedId = user.id_usuario; render(); };
    row.addEventListener('click', () => {
      select();
      // En el celular el detalle queda debajo de la lista.
      if (mobile.matches) {
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
        actions[0].focus({ preventScroll: true });
      }
    });
    row.addEventListener('keydown', (event) => {
      if (event.target === row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); select(); }
    });
    const buttons = row.querySelectorAll('button');
    buttons[0].title = `Editar usuario ${fullName(user)}`;
    buttons[0].setAttribute('aria-label', buttons[0].title);
    buttons[0].addEventListener('click', (event) => { event.stopPropagation(); select(); openDialog('edit'); });
    body.append(row);
  }
  if (!visible.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 6;
    cell.textContent = 'No se encontraron usuarios.';
  }
  if (focusId) {
    const row = body.querySelector(`tr[data-id="${focusId}"]`);
    (focusButton >= 0 ? row?.querySelectorAll('button')[focusButton] : row)?.focus();
  }
  $('.table-footer-text').textContent = `${visible.length} usuarios${visible.length !== users.length ? ` de ${users.length}` : ''}`;
  renderDetail(users.find((user) => user.id_usuario === selectedId));
}

async function reload() {
  users = await apiJson('/usuarios/administracion');
  render();
}

function openDialog(action) {
  mode = action;
  const user = users.find((item) => item.id_usuario === selectedId);
  editingId = action === 'create' ? null : user?.id_usuario;
  if (action !== 'create' && !user) return;
  form.reset();
  message.hidden = true;
  message.textContent = '';
  hideTemporaryPassword();
  $('#user-fields').hidden = !['create', 'edit'].includes(action);
  $('#cancel-user-dialog').textContent = 'Cancelar';
  submit.hidden = false;
  submit.disabled = false;
  const titles = { create: 'Nuevo usuario', edit: 'Editar usuario', password: 'Restablecer contraseña', status: user?.estado === 'suspendido' ? 'Reactivar cuenta' : 'Suspender cuenta' };
  $('#user-dialog-title').textContent = titles[action];
  // El botón dice exactamente qué hace ("Suspender cuenta", "Restablecer contraseña"…).
  submit.textContent = ['create', 'edit'].includes(action) ? 'Guardar' : titles[action];
  if (user && action !== 'create') {
    for (const key of ['nombre', 'apellido', 'email', 'telefono']) fields[key].value = user[key] || '';
    fields.rol.value = user.is_leader && user.id_rol === 2 ? 'lider' : String(user.id_rol);
    fields.laboratorio.value = user.laboratorio_asignado_id ?? '';
  }
  // El backend rechaza asignar un laboratorio inactivo; solo se conserva el que ya tenía.
  const currentLab = action === 'edit' ? user?.laboratorio_asignado_id : null;
  for (const option of fields.laboratorio.options) {
    const lab = labs.find((item) => String(item.id_aula) === option.value);
    option.disabled = Boolean(lab && !lab.activo && lab.id_aula !== currentLab);
  }
  fields.email.disabled = action !== 'create';
  for (const input of $('#user-fields').querySelectorAll('input, select')) {
    if (input !== fields.email) input.disabled = !['create', 'edit'].includes(action);
  }
  const self = action === 'edit' && editingId === currentUserId;
  fields.rol.disabled = fields.rol.disabled || self;
  $('#self-hint').hidden = !self;
  syncLabRequirement();
  updateTicketsWarning();
  submit.classList.toggle('btn-danger', action === 'status' && user?.estado !== 'suspendido');
  if (['password', 'status'].includes(action)) {
    message.textContent = `${titles[action]}: ${fullName(user)} (${user.email}).`;
    message.hidden = false;
  }
  dialog.showModal();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  submit.disabled = true;
  $('#cancel-user-dialog').disabled = true;
  message.hidden = true;
  try {
    let result;
    if (['create', 'edit'].includes(mode)) {
      const payload = { nombre: fields.nombre.value.trim(), apellido: fields.apellido.value.trim(), telefono: fields.telefono.value.trim() || null,
        id_rol: fields.rol.value === 'lider' ? 2 : Number(fields.rol.value), is_leader: fields.rol.value === 'lider', laboratorio_asignado_id: fields.laboratorio.value ? Number(fields.laboratorio.value) : null };
      if (mode === 'create') payload.email = fields.email.value.trim();
      result = await apiJson(mode === 'create' ? '/usuarios/' : `/usuarios/${editingId}`, { method: mode === 'create' ? 'POST' : 'PUT', body: JSON.stringify(payload) });
      selectedId = result.id_usuario;
    } else if (mode === 'password') {
      result = await apiJson(`/usuarios/${editingId}/password`, { method: 'POST' });
    } else {
      const user = users.find((item) => item.id_usuario === editingId);
      await apiJson(`/usuarios/${editingId}/estado`, { method: 'PUT', body: JSON.stringify({ suspendido: user.estado !== 'suspendido' }) });
    }
    // Preserve the generated credential even if refreshing the list fails.
    $('#user-fields').hidden = true;
    submit.hidden = true;
    $('#cancel-user-dialog').textContent = 'Cerrar';
    $('#tickets-warning').hidden = true;
    message.textContent = result?.password_temporal ? 'Contraseña temporal (entrégala al usuario):' : 'Cambios guardados.';
    message.hidden = false;
    if (result?.password_temporal) showTemporaryPassword(result.password_temporal);
    try { await reload(); } catch { message.textContent += '\nNo se pudo actualizar la lista. Vuelve a abrir Usuarios para ver los cambios.'; }
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    busy = false;
    submit.disabled = false;
    $('#cancel-user-dialog').disabled = false;
  }
});

// Un líder siempre tiene laboratorio: el navegador lo exige antes de enviar.
function syncLabRequirement() {
  const leader = fields.rol.value === 'lider';
  fields.laboratorio.required = leader && !fields.laboratorio.disabled;
  $('#lab-hint').hidden = !leader;
}

// Avisa cuando la acción deja tickets "En Proceso" a nombre de alguien que ya no podrá atenderlos.
function updateTicketsWarning() {
  const user = users.find((item) => item.id_usuario === editingId);
  const count = user?.tickets_en_proceso || 0;
  const wasTechnician = user?.id_rol === 2;
  const losesAccess = (mode === 'status' && user?.estado !== 'suspendido')
    || (mode === 'edit' && wasTechnician && !['2', 'lider'].includes(fields.rol.value));
  const warning = $('#tickets-warning');
  warning.hidden = !(count && losesAccess);
  warning.textContent = warning.hidden ? '' : count === 1
    ? `${fullName(user)} tiene 1 ticket en proceso. Seguirá asignado a su nombre hasta que un líder lo reasigne.`
    : `${fullName(user)} tiene ${count} tickets en proceso. Seguirán asignados a su nombre hasta que un líder los reasigne.`;
}

// La contraseña temporal solo vive en el diálogo mientras está abierto.
function showTemporaryPassword(password) {
  $('#temp-password-value').textContent = password;
  $('#temp-password').hidden = false;
  $('#copy-password').textContent = 'Copiar';
  $('#copy-password').focus();
}

function hideTemporaryPassword() {
  $('#temp-password-value').textContent = '';
  $('#temp-password').hidden = true;
  $('#copy-status').textContent = '';
}

$('#copy-password').addEventListener('click', async () => {
  const value = $('#temp-password-value');
  try {
    await navigator.clipboard.writeText(value.textContent);
    $('#copy-password').textContent = 'Copiada';
    $('#copy-status').textContent = 'Contraseña copiada al portapapeles.';
  } catch {
    // Sin permiso de portapapeles: se deja seleccionada para copiarla a mano.
    getSelection().selectAllChildren(value);
    $('#copy-status').textContent = 'No se pudo copiar automáticamente. Ya está seleccionada: cópiala manualmente (en el celular, mantén presionado el texto).';
  }
});

fields.rol.addEventListener('change', () => { syncLabRequirement(); updateTicketsWarning(); });
$('#cancel-user-dialog').addEventListener('click', () => { if (!busy) dialog.close(); });
dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => {
  message.textContent = '';
  hideTemporaryPassword();
  // Si la lista se recargó con el diálogo abierto, el botón que lo abrió ya no existe.
  if (!document.activeElement || document.activeElement === document.body) {
    body.querySelector(`tr[data-id="${selectedId}"]`)?.focus();
  }
});
$('.btn-add-user').addEventListener('click', () => openDialog('create'));
actions[0].addEventListener('click', () => openDialog('edit'));
actions[1].addEventListener('click', () => openDialog('password'));
actions[2].addEventListener('click', () => openDialog('status'));
roleFilter.addEventListener('change', render);
statusFilter.addEventListener('change', render);
search.addEventListener('input', render);

const loadStatus = $('.load-status-card');
const loadText = $('#load-status-text');
const retryButton = $('#retry-load');

// fetch() falla con un TypeError genérico ("Failed to fetch") cuando no hay red o el servidor no responde.
function loadErrorMessage(error) {
  const message = error?.message || '';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return 'No hay conexión con el servidor. Revisa tu conexión a internet e inténtalo de nuevo.';
  }
  return `No se pudo cargar la lista: ${message || 'error desconocido'}`;
}

async function loadPage() {
  retryButton.hidden = true;
  loadText.textContent = 'Cargando usuarios...';
  loadStatus.hidden = false;
  try {
    const currentUser = await apiJson('/usuarios/me');
    if (currentUser.id_rol !== 1) {
      // Sin permiso no se muestra el panel: solo el aviso y el camino de vuelta.
      loadStatus.hidden = true;
      $('.not-allowed-card').hidden = false;
      $('.btn-volver').href = '../../../dashboard.html';
      return;
    }
    currentUserId = currentUser.id_usuario;
    labs = await apiJson('/aulas');
    fields.laboratorio.length = 1; // Solo "Sin asignar": un reintento no duplica opciones.
    for (const lab of labs) fields.laboratorio.add(new Option(`${lab.nombre}${lab.activo ? '' : ' (inactivo)'}`, lab.id_aula));
    await reload();
    // Administrador confirmado y datos cargados: ya se puede mostrar el panel.
    loadStatus.hidden = true;
    for (const section of document.querySelectorAll('.filters-search-bar, .user-table-card, .btn-add-user')) section.hidden = false;
    $('.btn-add-user').disabled = false;
  } catch (error) {
    // En Android no hay botón de recargar: el reintento vuelve a pedir todo.
    loadText.textContent = loadErrorMessage(error);
    retryButton.hidden = false;
    detail.hidden = true;
  }
}

retryButton.addEventListener('click', loadPage);
await loadPage();
