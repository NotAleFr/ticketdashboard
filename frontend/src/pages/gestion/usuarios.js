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

const fullName = (user) => `${user.nombre} ${user.apellido}`;
const role = (user) => user.id_rol === 1 ? ['administrador', 'Administrador']
  : user.id_rol === 3 ? ['docente', 'Docente']
    : user.is_leader ? ['lider', 'Líder Lab'] : ['soporte', 'Soporte'];
const roleKey = (user) => user.id_rol === 1 ? 'administrador' : user.id_rol === 3 ? 'docente' : user.is_leader ? 'lider-lab' : 'tecnico';
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const date = (value) => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Sin acceso';
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
  $('.avatar-circle').textContent = `${user.nombre[0]}${user.apellido[0]}`.toUpperCase();
  badge($('.detail-status-badges .badge-role'), ...role(user), 'badge-role');
  badge($('.detail-status-badges .badge-status'), user.estado, status(user), 'badge-status');
  const values = [user.email, user.telefono || '—', labs.find((lab) => lab.id_aula === user.laboratorio_asignado_id)?.nombre || 'Sin asignar', user.is_leader ? 'Sí' : 'No', date(user.ultimo_acceso), date(user.fecha_registro)];
  document.querySelectorAll('.metadata-value').forEach((element, index) => { element.textContent = values[index]; });
  const activity = $('.activity-list');
  activity.replaceChildren();
  for (const [time, description] of [[user.ultimo_acceso, 'Último inicio de sesión'], [user.fecha_registro, 'Alta de usuario']]) {
    if (!time) continue;
    const item = document.createElement('div');
    item.className = 'activity-item';
    for (const [className, text] of [['activity-marker', ''], ['activity-time', date(time)], ['activity-desc', description]]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      item.append(span);
    }
    activity.append(item);
  }
  $('.btn-detail-danger').textContent = user.estado === 'suspendido' ? 'Reactivar cuenta' : 'Suspender cuenta';
}

function render() {
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
    row.addEventListener('click', select);
    row.addEventListener('keydown', (event) => {
      if (event.target === row && ['Enter', ' '].includes(event.key)) { event.preventDefault(); select(); }
    });
    const buttons = row.querySelectorAll('button');
    buttons[0].title = `Editar usuario ${fullName(user)}`;
    buttons[0].setAttribute('aria-label', buttons[0].title);
    buttons[0].addEventListener('click', (event) => { event.stopPropagation(); select(); openDialog('edit'); });
    buttons[1].title = `Ver detalle de ${fullName(user)}`;
    buttons[1].setAttribute('aria-label', buttons[1].title);
    body.append(row);
  }
  if (!visible.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 6;
    cell.textContent = 'No se encontraron usuarios.';
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
  $('#user-fields').hidden = !['create', 'edit'].includes(action);
  $('#cancel-user-dialog').textContent = 'Cancelar';
  submit.hidden = false;
  submit.disabled = false;
  const titles = { create: 'Nuevo usuario', edit: 'Editar usuario', password: 'Restablecer contraseña', status: user?.estado === 'suspendido' ? 'Reactivar cuenta' : 'Suspender cuenta' };
  $('#user-dialog-title').textContent = titles[action];
  submit.textContent = ['create', 'edit'].includes(action) ? 'Guardar' : 'Confirmar';
  if (user && action !== 'create') {
    for (const key of ['nombre', 'apellido', 'email', 'telefono']) fields[key].value = user[key] || '';
    fields.rol.value = user.is_leader && user.id_rol === 2 ? 'lider' : String(user.id_rol);
    fields.laboratorio.value = user.laboratorio_asignado_id ?? '';
  }
  fields.email.disabled = action !== 'create';
  for (const input of $('#user-fields').querySelectorAll('input, select')) {
    if (input !== fields.email) input.disabled = !['create', 'edit'].includes(action);
  }
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
    message.textContent = result?.password_temporal ? `Contraseña temporal (entrégala al usuario):\n${result.password_temporal}` : 'Cambios guardados.';
    message.hidden = false;
    try { await reload(); } catch { message.textContent += '\nNo se pudo actualizar la lista. Recarga la página.'; }
  } catch (error) {
    message.textContent = error.message;
    message.hidden = false;
  } finally {
    busy = false;
    submit.disabled = false;
    $('#cancel-user-dialog').disabled = false;
  }
});

$('#cancel-user-dialog').addEventListener('click', () => { if (!busy) dialog.close(); });
dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
dialog.addEventListener('close', () => { message.textContent = ''; });
$('.btn-add-user').addEventListener('click', () => openDialog('create'));
const actions = document.querySelectorAll('.detail-actions-row button');
actions[0].addEventListener('click', () => openDialog('edit'));
actions[1].addEventListener('click', () => openDialog('password'));
actions[2].addEventListener('click', () => { openDialog('edit'); fields.rol.focus(); });
actions[3].addEventListener('click', () => openDialog('status'));
roleFilter.addEventListener('change', render);
statusFilter.addEventListener('change', render);
search.addEventListener('input', render);

try {
  const currentUser = await apiJson('/usuarios/me');
  if (currentUser.id_rol !== 1) throw new Error('Solo el administrador puede administrar usuarios.');
  labs = await apiJson('/aulas');
  for (const lab of labs) fields.laboratorio.add(new Option(`${lab.nombre}${lab.activo ? '' : ' (inactivo)'}`, lab.id_aula));
  await reload();
  $('.btn-add-user').disabled = false;
} catch (error) {
  body.replaceChildren();
  const cell = body.insertRow().insertCell();
  cell.colSpan = 6;
  cell.textContent = `No se pudo cargar la lista: ${error.message}`;
  $('.table-footer-text').textContent = 'Usuarios no disponibles';
  detail.hidden = true;
}
