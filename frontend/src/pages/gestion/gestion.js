import { apiJson } from '../../api.js';
import flatpickr from 'flatpickr';
import { Spanish } from 'flatpickr/dist/l10n/es.js';
import 'flatpickr/dist/flatpickr.min.css';

const ticketsBody = document.getElementById('tickets-body');
const ticketsMessage = document.getElementById('tickets-message');
const ticketsCount = document.getElementById('tickets-count');
const statusFilter = document.getElementById('status-filter');
const classroomFilter = document.getElementById('classroom-filter');
const ticketSearch = document.getElementById('ticket-search');
const refreshButton = document.getElementById('refresh-tickets');
const actionFeedback = document.getElementById('action-feedback');

const detailEmpty = document.getElementById('detail-empty');
const detailContent = document.getElementById('detail-content');
const detailId = document.getElementById('detail-id');
const detailClassroom = document.getElementById('detail-classroom');
const detailEquipment = document.getElementById('detail-equipment');
const detailReporter = document.getElementById('detail-reporter');
const detailDate = document.getElementById('detail-date');
const detailStatus = document.getElementById('detail-status');
const detailAssignee = document.getElementById('detail-assignee');
const detailTitle = document.getElementById('detail-title');
const detailDescription = document.getElementById('detail-description-text');
const assignTicketButton = document.getElementById('assign-ticket-button');
const changeTicketStateButton = document.getElementById('change-ticket-state-button');
const closeTicketButton = document.getElementById('close-ticket-button');
const actionDialog = document.getElementById('ticket-action-dialog');
const actionForm = document.getElementById('ticket-action-form');
const actionDialogTitle = document.getElementById('action-dialog-title');
const actionDialogFields = document.getElementById('action-dialog-fields');
const actionDialogError = document.getElementById('action-dialog-error');
const actionDialogSubmit = document.getElementById('action-dialog-submit');
const closeTicketDialog = document.getElementById('close-ticket-dialog');
const closeTicketForm = document.getElementById('close-ticket-form');
const closeDialogError = document.getElementById('close-dialog-error');
const closeDialogSubmit = document.getElementById('close-dialog-submit');

let tickets = [];
let dateRange = [];
let selectedTicketId = null;
let requestState = 'loading';
let currentUser = null;
let activeActionTicket = null;
let activeDialogAction = null;
let actionFeedbackTimer = null;

function formatTicketId(id) {
  return `#${String(id).padStart(3, '0')}`;
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function createTextCell(value, className = '') {
  const cell = document.createElement('td');
  cell.textContent = value ?? '—';
  if (className) cell.className = className;
  return cell;
}

function createBadge(text, className) {
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = text;
  return badge;
}

function getStatusClass(status) {
  const classes = {
    Abierto: 'status-badge--open',
    'En Proceso': 'status-badge--progress',
    Resuelto: 'status-badge--resolved',
    Cerrado: 'status-badge--closed',
  };

  return classes[status] || 'status-badge--unknown';
}

function createViewButton(ticket) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'view-ticket-button';
  button.setAttribute('aria-label', `Ver detalle del ticket ${ticket.id_ticket}`);
  button.title = 'Ver detalle';

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');

  const eye = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  eye.setAttribute('d', 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z');

  const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  pupil.setAttribute('cx', '12');
  pupil.setAttribute('cy', '12');
  pupil.setAttribute('r', '3');

  icon.append(eye, pupil);
  button.append(icon);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    selectTicket(ticket.id_ticket);
  });

  return button;
}

function createTicketRow(ticket) {
  const row = document.createElement('tr');
  row.className = 'ticket-row';
  row.dataset.ticketId = String(ticket.id_ticket);
  row.classList.toggle('is-selected', ticket.id_ticket === selectedTicketId);
  row.addEventListener('click', () => selectTicket(ticket.id_ticket));

  row.append(createTextCell(formatTicketId(ticket.id_ticket), 'ticket-id'));

  const locationCell = document.createElement('td');
  locationCell.className = 'ticket-location';
  const classroom = document.createElement('span');
  classroom.textContent = ticket.id_aula == null ? 'Aula —' : `Aula ${ticket.id_aula}`;
  const equipment = document.createElement('span');
  equipment.className = 'ticket-problem__description';
  equipment.textContent = ticket.id_equipo == null ? 'Sin equipo específico' : `Equipo ${ticket.id_equipo}`;
  locationCell.append(classroom, equipment);
  row.append(locationCell);

  const problemCell = document.createElement('td');
  problemCell.className = 'ticket-problem';
  const problemTitle = document.createElement('span');
  problemTitle.className = 'ticket-problem__title';
  problemTitle.textContent = ticket.nombre_ticket || 'Incidencia sin título';
  const description = document.createElement('span');
  description.className = 'ticket-problem__description';
  description.textContent = ticket.descripcion || 'Sin descripción';
  problemCell.append(problemTitle, description);
  row.append(problemCell);

  const reporter = document.createElement('td');
  reporter.className = 'ticket-reporter';
  reporter.textContent = ticket.nombre_reportante || 'Nombre no disponible';
  row.append(reporter);

  const statusCell = document.createElement('td');
  statusCell.append(
    createBadge(ticket.estado || 'Desconocido', `status-badge ${getStatusClass(ticket.estado)}`),
  );
  row.append(statusCell);

  const assignee = ticket.nombre_tecnico || (ticket.id_tecnico ? 'Nombre no disponible' : '—');
  row.append(createTextCell(assignee, ticket.id_tecnico ? '' : 'assignee-muted'));

  const actionCell = document.createElement('td');
  actionCell.append(createViewButton(ticket));
  row.append(actionCell);

  return row;
}

function updateClassroomOptions() {
  const previousValue = classroomFilter.value;
  classroomFilter.replaceChildren();

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Aula: todas';
  classroomFilter.append(allOption);

  const classrooms = [...new Set(
    tickets
      .map((ticket) => ticket.id_aula)
      .filter((id) => id != null)
      .map(String),
  )].sort((left, right) => Number(left) - Number(right));

  for (const classroomId of classrooms) {
    const option = document.createElement('option');
    option.value = classroomId;
    option.textContent = `Aula ${classroomId}`;
    classroomFilter.append(option);
  }

  classroomFilter.value = classrooms.includes(previousValue) ? previousValue : '';
}

function renderDetails(ticket) {
  detailContent.hidden = !ticket;
  detailEmpty.hidden = Boolean(ticket);
  detailId.textContent = ticket ? formatTicketId(ticket.id_ticket) : '—';

  if (!ticket) return;

  document.getElementById('detail-classroom').textContent =
    ticket.id_aula == null ? 'No especificada' : `Aula ${ticket.id_aula}`;
  detailEquipment.textContent =
    ticket.id_equipo == null ? 'Sin equipo específico' : `Equipo ${ticket.id_equipo}`;
  const reporterName = ticket.nombre_reportante || 'Nombre no disponible';
  detailReporter.textContent = ticket.correo_reportante
    ? `${reporterName} · ${ticket.correo_reportante}`
    : reporterName;
  detailDate.textContent = formatDate(ticket.fecha_registro);
  detailAssignee.textContent = ticket.nombre_tecnico
    || (ticket.id_tecnico ? 'Nombre no disponible' : 'Sin asignar');
  detailTitle.textContent = ticket.nombre_ticket || 'Incidencia sin título';
  detailDescription.textContent = ticket.descripcion || 'Sin descripción.';

  detailStatus.replaceChildren(
    createBadge(ticket.estado || 'Desconocido', `status-badge ${getStatusClass(ticket.estado)}`),
  );
  renderActionButtons(ticket);
}

function isAdministrator() {
  return currentUser?.id_rol === 1;
}

function isLabLeaderFor(ticket) {
  return currentUser?.id_rol === 2
    && currentUser.is_leader
    && Number(currentUser.laboratorio_asignado_id) === Number(ticket.id_aula);
}

function isTicketCreator(ticket) {
  return String(currentUser?.id_usuario) === String(ticket.id_usuario);
}

function getAllowedStateChanges(ticket) {
  const changes = [];
  const isAssignedTechnician = currentUser?.id_rol === 2
    && String(currentUser.id_usuario) === String(ticket.id_tecnico);

  if (ticket.estado === 'En Proceso' && (isAdministrator() || isAssignedTechnician)) {
    changes.push({ value: 'Resuelto', label: 'Resuelto' });
  }

  if (ticket.estado === 'Resuelto') {
    if (isAdministrator() || isLabLeaderFor(ticket) || isTicketCreator(ticket)) {
      changes.push({ value: 'Cerrado', label: 'Cerrado' });
    }

    if (isAdministrator() || (currentUser?.id_rol === 3 && isTicketCreator(ticket))) {
      changes.push({ value: 'En Proceso', label: 'En Proceso (reabrir)' });
    }
  }

  return changes;
}

function renderActionButtons(ticket) {
  const canAssign = (isAdministrator() || (currentUser?.id_rol === 2 && currentUser.is_leader))
    && ['Abierto', 'En Proceso'].includes(ticket.estado);
  const stateChanges = getAllowedStateChanges(ticket);
  const canClose = stateChanges.some((change) => change.value === 'Cerrado');

  assignTicketButton.hidden = !canAssign;
  changeTicketStateButton.hidden = stateChanges.length === 0;
  closeTicketButton.hidden = !canClose;
}

function showActionFeedback(message, kind = 'success') {
  if (actionFeedbackTimer !== null) {
    window.clearTimeout(actionFeedbackTimer);
  }

  actionFeedback.textContent = message;
  actionFeedback.className = `action-feedback action-feedback--${kind}`;
  actionFeedback.hidden = false;
  actionFeedbackTimer = window.setTimeout(() => {
    actionFeedback.hidden = true;
    actionFeedback.textContent = '';
    actionFeedbackTimer = null;
  }, 5000);
}

function setDialogError(element, message = '') {
  element.textContent = message;
  element.hidden = !message;
}

function getSelectedTicket() {
  return tickets.find((ticket) => String(ticket.id_ticket) === String(selectedTicketId)) || null;
}

function openDialog(dialog) {
  if (!dialog.open) dialog.showModal();
}

function closeDialog(dialog) {
  if (dialog.open) dialog.close();
}

function createFieldLabel(forId, text) {
  const label = document.createElement('label');
  label.htmlFor = forId;
  label.textContent = text;
  return label;
}

async function openAssignmentDialog(ticket) {
  activeActionTicket = ticket;
  activeDialogAction = 'assign';
  actionDialogTitle.textContent = `Asignar responsable · ${formatTicketId(ticket.id_ticket)}`;
  actionDialogSubmit.textContent = 'Asignar';
  actionDialogSubmit.disabled = true;
  actionDialogFields.replaceChildren();
  setDialogError(actionDialogError);

  const label = createFieldLabel('assigned-technician', 'Técnico responsable');
  const select = document.createElement('select');
  select.id = 'assigned-technician';
  select.name = 'id_tecnico';
  select.required = true;
  select.disabled = true;

  const loadingOption = document.createElement('option');
  loadingOption.value = '';
  loadingOption.textContent = 'Cargando técnicos...';
  select.append(loadingOption);
  actionDialogFields.append(label, select);
  openDialog(actionDialog);

  try {
    const technicians = await apiJson(`/usuarios/tecnicos?id_aula=${encodeURIComponent(ticket.id_aula)}`);
    select.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona un técnico';
    select.append(placeholder);

    for (const technician of technicians) {
      const option = document.createElement('option');
      option.value = technician.id_usuario;
      option.textContent = `${technician.nombre} ${technician.apellido}${technician.email ? ` · ${technician.email}` : ''}`;
      select.append(option);
    }

    if (ticket.id_tecnico) select.value = String(ticket.id_tecnico);
    select.disabled = technicians.length === 0;
    actionDialogSubmit.disabled = technicians.length === 0;
    if (technicians.length === 0) {
      setDialogError(actionDialogError, 'No hay técnicos disponibles para el aula de este ticket.');
    }
  } catch (error) {
    select.replaceChildren();
    select.disabled = true;
    actionDialogSubmit.disabled = true;
    setDialogError(actionDialogError, error.message);
  }
}

function openStateDialog(ticket) {
  activeActionTicket = ticket;
  activeDialogAction = 'state';
  actionDialogTitle.textContent = `Cambiar estado · ${formatTicketId(ticket.id_ticket)}`;
  actionDialogSubmit.textContent = 'Guardar estado';
  actionDialogSubmit.disabled = false;
  actionDialogFields.replaceChildren();
  setDialogError(actionDialogError);

  const label = createFieldLabel('ticket-new-state', 'Estado permitido');
  const select = document.createElement('select');
  select.id = 'ticket-new-state';
  select.name = 'estado';
  select.required = true;

  for (const change of getAllowedStateChanges(ticket)) {
    const option = document.createElement('option');
    option.value = change.value;
    option.textContent = change.label;
    select.append(option);
  }

  actionDialogFields.append(label, select);

  const solutionLabel = createFieldLabel('ticket-solution', 'Comentario de solución');
  const solution = document.createElement('textarea');
  solution.id = 'ticket-solution';
  solution.name = 'texto_solucion';
  solution.rows = 4;
  solution.required = true;
  solution.maxLength = 4000;
  solution.placeholder = 'Describe la reparación realizada';
  solution.hidden = select.value !== 'Resuelto';
  solution.required = !solution.hidden;
  solutionLabel.hidden = solution.hidden;
  actionDialogFields.append(solutionLabel, solution);

  select.addEventListener('change', () => {
    const needsSolution = select.value === 'Resuelto';
    solution.hidden = !needsSolution;
    solutionLabel.hidden = !needsSolution;
    solution.required = needsSolution;
  });

  openDialog(actionDialog);
}

function openCloseConfirmation(ticket) {
  activeActionTicket = ticket;
  setDialogError(closeDialogError);
  closeDialogSubmit.disabled = false;
  openDialog(closeTicketDialog);
}

async function sendTicketAction(path, body, successMessage) {
  const ticket = activeActionTicket;
  if (!ticket) return;

  actionDialogSubmit.disabled = true;
  closeDialogSubmit.disabled = true;

  try {
    await apiJson(path, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    closeDialog(actionDialog);
    closeDialog(closeTicketDialog);
    showActionFeedback(successMessage);
    await loadTickets();
  } catch (error) {
    const errorElement = closeTicketDialog.open ? closeDialogError : actionDialogError;
    setDialogError(errorElement, error.message);
  } finally {
    actionDialogSubmit.disabled = false;
    closeDialogSubmit.disabled = false;
  }
}

async function submitTicketAction(event) {
  event.preventDefault();
  if (!activeActionTicket) return;

  if (activeDialogAction === 'assign') {
    const technicianId = new FormData(actionForm).get('id_tecnico');
    if (!technicianId) {
      setDialogError(actionDialogError, 'Selecciona un técnico para continuar.');
      return;
    }

    await sendTicketAction(
      `/tickets/${activeActionTicket.id_ticket}/asignar`,
      { id_tecnico: technicianId },
      'Responsable asignado correctamente.',
    );
    return;
  }

  const formData = new FormData(actionForm);
  const nextState = formData.get('estado');
  if (nextState === 'Resuelto') {
    const solution = String(formData.get('texto_solucion') || '').trim();
    if (!solution) {
      setDialogError(actionDialogError, 'Escribe el comentario de solución antes de continuar.');
      return;
    }

    await sendTicketAction(
      `/tickets/${activeActionTicket.id_ticket}/resolver`,
      { texto_solucion: solution },
      'Ticket resuelto y solución registrada.',
    );
  } else if (nextState === 'Cerrado') {
    closeDialog(actionDialog);
    openCloseConfirmation(activeActionTicket);
  } else if (nextState === 'En Proceso') {
    await sendTicketAction(
      `/tickets/${activeActionTicket.id_ticket}/reabrir`,
      null,
      'Ticket reabierto y devuelto a En Proceso.',
    );
  }
}

function getVisibleTickets() {
  const status = statusFilter.value;
  const classroom = classroomFilter.value;
  const searchText = ticketSearch.value.trim().toLowerCase();
  // Include both whole days in the same local calendar as ticket details.
  const from = dateRange[0] ? new Date(dateRange[0]) : null;
  const until = dateRange[1] ? new Date(dateRange[1]) : null;
  if (until) until.setDate(until.getDate() + 1);

  return tickets.filter((ticket) => {
    const matchesStatus = !status || ticket.estado === status;
    const matchesClassroom = !classroom || String(ticket.id_aula) === classroom;
    const searchableText = [
      ticket.id_ticket,
      ticket.nombre_ticket,
      ticket.descripcion,
      ticket.id_aula,
      ticket.id_equipo,
      ticket.estado,
    ].join(' ').toLowerCase();
    const matchesSearch = !searchText || searchableText.includes(searchText);

    const registeredAt = ticket.fecha_registro ? new Date(ticket.fecha_registro) : new Date(NaN);
    const matchesDates = (!from && !until) || (
      !Number.isNaN(registeredAt.getTime())
      && (!from || registeredAt >= from)
      && (!until || registeredAt < until)
    );
    return matchesStatus && matchesClassroom && matchesSearch && matchesDates;
  });
}

function renderTickets() {
  const visibleTickets = getVisibleTickets();
  ticketsBody.replaceChildren();

  for (const ticket of visibleTickets) {
    ticketsBody.append(createTicketRow(ticket));
  }

  ticketsCount.textContent = `${visibleTickets.length} ${visibleTickets.length === 1 ? 'ticket' : 'tickets'}`;

  if (requestState === 'loading') {
    ticketsMessage.textContent = 'Cargando tickets...';
    ticketsMessage.hidden = false;
    ticketsMessage.classList.remove('tickets-message--error');
  } else if (requestState === 'error') {
    // El mensaje de error ya fue configurado por loadTickets().
    ticketsMessage.hidden = false;
    ticketsMessage.classList.add('tickets-message--error');
  } else if (tickets.length === 0) {
    ticketsMessage.textContent = 'No hay tickets disponibles para tu usuario.';
    ticketsMessage.hidden = false;
    ticketsMessage.classList.remove('tickets-message--error');
  } else if (visibleTickets.length === 0) {
    ticketsMessage.textContent = 'No hay tickets que coincidan con los filtros.';
    ticketsMessage.hidden = false;
    ticketsMessage.classList.remove('tickets-message--error');
  } else {
    ticketsMessage.hidden = true;
    ticketsMessage.classList.remove('tickets-message--error');
  }

  const selectionIsVisible = visibleTickets.some(
    (ticket) => ticket.id_ticket === selectedTicketId,
  );
  if (!selectionIsVisible) {
    selectedTicketId = visibleTickets[0]?.id_ticket ?? null;
  }

  // Actualiza el estilo seleccionado después de cambiar los filtros.
  for (const row of ticketsBody.rows) {
    row.classList.toggle('is-selected', Number(row.dataset.ticketId) === Number(selectedTicketId));
  }

  const selectedTicket = tickets.find((ticket) => ticket.id_ticket === selectedTicketId);
  renderDetails(selectedTicket || null);
}

function selectTicket(ticketId) {
  selectedTicketId = ticketId;
  renderTickets();
}

async function loadTickets() {
  requestState = 'loading';
  ticketsMessage.textContent = 'Cargando tickets...';
  ticketsMessage.hidden = false;
  ticketsMessage.classList.remove('tickets-message--error');
  refreshButton.disabled = true;
  renderTickets();

  try {
    const response = await apiJson('/tickets/');
    if (!Array.isArray(response)) {
      throw new Error('La API devolvió una respuesta de tickets inesperada.');
    }

    tickets = response.sort((left, right) => Number(right.id_ticket) - Number(left.id_ticket));
    requestState = 'ready';
    updateClassroomOptions();

    if (!tickets.some((ticket) => ticket.id_ticket === selectedTicketId)) {
      selectedTicketId = tickets[0]?.id_ticket ?? null;
    }

    renderTickets();
  } catch (error) {
    tickets = [];
    selectedTicketId = null;
    requestState = 'error';
    ticketsMessage.textContent = `No se pudieron cargar los tickets: ${error.message}`;
    ticketsCount.textContent = 'Error al cargar';
    renderTickets();
  } finally {
    refreshButton.disabled = false;
  }
}

statusFilter.addEventListener('change', renderTickets);
const dateRangeFilter = document.getElementById('date-range-filter');
const clearDateRange = document.getElementById('clear-date-range');
const datePicker = flatpickr(dateRangeFilter, {
  mode: 'range',
  locale: { ...Spanish, rangeSeparator: ' – ' },
  dateFormat: 'd M Y',
  ariaDateFormat: 'j F Y',
  disableMobile: true,
  onChange(selectedDates) {
    clearDateRange.hidden = selectedDates.length === 0;
    // Keep the current filter until both ends have been chosen.
    if (selectedDates.length === 1) return;
    dateRange = selectedDates.map(date => new Date(date));
    renderTickets();
  },
  onClose(selectedDates, _value, instance) {
    if (selectedDates.length === 1) {
      instance.setDate([selectedDates[0], selectedDates[0]], true);
    }
  },
});
clearDateRange.addEventListener('click', () => {
  datePicker.clear();
  dateRangeFilter.focus();
});
classroomFilter.addEventListener('change', renderTickets);
ticketSearch.addEventListener('input', renderTickets);
refreshButton.addEventListener('click', loadTickets);
assignTicketButton.addEventListener('click', () => {
  const ticket = getSelectedTicket();
  if (ticket) openAssignmentDialog(ticket);
});
changeTicketStateButton.addEventListener('click', () => {
  const ticket = getSelectedTicket();
  if (ticket) openStateDialog(ticket);
});
closeTicketButton.addEventListener('click', () => {
  const ticket = getSelectedTicket();
  if (ticket) openCloseConfirmation(ticket);
});
actionForm.addEventListener('submit', submitTicketAction);
closeTicketForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeActionTicket) return;
  sendTicketAction(
    `/tickets/${activeActionTicket.id_ticket}/cerrar`,
    null,
    'Ticket cerrado correctamente.',
  );
});
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => {
    closeDialog(actionDialog);
    closeDialog(closeTicketDialog);
  });
});

async function initializePage() {
  try {
    currentUser = await apiJson('/usuarios/me');
  } catch (error) {
    showActionFeedback(`No se pudo cargar tu perfil: ${error.message}`, 'error');
  }

  await loadTickets();
}

initializePage();
