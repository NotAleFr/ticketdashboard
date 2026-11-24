import { apiJson } from '../../api.js';
import { parseApiDate, renderHistory } from './ticket-history.js';
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
const detailCategories = document.getElementById('detail-categories');
const detailHistory = document.getElementById('detail-history');
const detailHistoryMessage = document.getElementById('detail-history-message');
const newTicketButton = document.querySelector('.new-ticket-button');
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
let historyKey = null;
let historyRequest = 0;
// Igual que el historial: solo la petición de técnicos más reciente puede pintar el diálogo.
let assignmentRequest = 0;
// Diálogo con una petición en curso: no se puede cerrar ni abrir otra acción.
let busyDialog = null;
const detailsSection = document.querySelector('.ticket-details');
const detailMoreButton = document.getElementById('detail-more');
const filtersSection = document.querySelector('.filters');
const dateToggle = document.getElementById('date-toggle');
const filtersToggle = document.getElementById('filters-toggle');

// Búsqueda sin distinguir acentos ni mayúsculas (igual que usuarios.js).
const normalize = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function formatTicketId(id) {
  return `#${String(id).padStart(3, '0')}`;
}

function classroomName(ticket) {
  if (ticket.nombre_aula) return ticket.nombre_aula;
  return ticket.id_aula == null ? 'Aula no especificada' : `Aula ${ticket.id_aula}`;
}

function equipmentName(ticket) {
  if (ticket.id_equipo == null) return 'Sin equipo específico';
  const name = [ticket.equipo_tipo, ticket.equipo_identificador].filter(Boolean).join(' ');
  return name || `Equipo ${ticket.id_equipo}`;
}

function formatDate(value) {
  const date = parseApiDate(value);
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

function createTicketRow(ticket) {
  const row = document.createElement('tr');
  row.className = 'ticket-row';
  row.dataset.ticketId = String(ticket.id_ticket);
  row.classList.toggle('is-selected', ticket.id_ticket === selectedTicketId);
  // Toda la fila selecciona el ticket (clic, Enter o espacio).
  row.tabIndex = 0;
  row.setAttribute('aria-label', `Ver detalle del ticket ${formatTicketId(ticket.id_ticket)}`);
  row.addEventListener('click', () => selectTicket(ticket.id_ticket));
  row.addEventListener('keydown', (event) => {
    if (event.target !== row || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    selectTicket(ticket.id_ticket);
    // La lista se reconstruye: el foco vuelve a la misma fila.
    ticketsBody.querySelector(`tr[data-ticket-id="${ticket.id_ticket}"]`)?.focus();
  });

  row.append(createTextCell(formatTicketId(ticket.id_ticket), 'ticket-id'));

  const locationCell = document.createElement('td');
  locationCell.className = 'ticket-location';
  const classroom = document.createElement('span');
  classroom.textContent = classroomName(ticket);
  const equipment = document.createElement('span');
  equipment.className = 'ticket-problem__description';
  equipment.textContent = equipmentName(ticket);
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
  statusCell.className = 'ticket-status';
  statusCell.append(
    createBadge(ticket.estado || 'Desconocido', `status-badge ${getStatusClass(ticket.estado)}`),
  );
  row.append(statusCell);

  const assignee = ticket.nombre_tecnico || (ticket.id_tecnico ? 'Nombre no disponible' : 'Sin asignar');
  row.append(createTextCell(assignee, ticket.id_tecnico ? 'ticket-assignee' : 'ticket-assignee assignee-muted'));

  return row;
}

function updateClassroomOptions() {
  const previousValue = classroomFilter.value;
  classroomFilter.replaceChildren();

  const allOption = document.createElement('option');
  allOption.value = '';
  allOption.textContent = 'Aula: todas';
  classroomFilter.append(allOption);

  const names = new Map();
  for (const ticket of tickets) {
    if (ticket.id_aula != null) names.set(String(ticket.id_aula), classroomName(ticket));
  }
  const classrooms = [...names.keys()]
    .sort((left, right) => names.get(left).localeCompare(names.get(right), 'es', { numeric: true }));

  for (const classroomId of classrooms) {
    const option = document.createElement('option');
    option.value = classroomId;
    option.textContent = names.get(classroomId);
    classroomFilter.append(option);
  }

  classroomFilter.value = classrooms.includes(previousValue) ? previousValue : '';
}

function renderDetails(ticket) {
  detailContent.hidden = !ticket;
  detailEmpty.hidden = Boolean(ticket);
  detailId.textContent = ticket ? formatTicketId(ticket.id_ticket) : '—';

  if (!ticket) {
    // Sin selección: se descarta cualquier historial que siga en camino.
    historyKey = null;
    historyRequest += 1;
    return;
  }

  detailClassroom.textContent = classroomName(ticket);
  detailEquipment.textContent = equipmentName(ticket);
  detailCategories.replaceChildren(...(ticket.problemas?.length
    ? ticket.problemas.map((name) => createBadge(name, 'category-chip'))
    : [document.createTextNode('Sin categoría')]));
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
  loadHistory(ticket);
}

// El historial se pide al seleccionar; se ignoran respuestas de una selección anterior.
async function loadHistory(ticket) {
  const key = `${ticket.id_ticket}:${ticket.estado}:${ticket.id_tecnico ?? ''}`;
  if (historyKey === key) return;
  historyKey = key;
  // Cada petición recibe un número; solo la más reciente puede pintar el resultado.
  const request = ++historyRequest;
  detailHistoryMessage.textContent = 'Cargando historial...';
  detailHistoryMessage.hidden = false;
  detailHistory.replaceChildren();
  try {
    const events = await apiJson(`/tickets/${ticket.id_ticket}/historial`);
    if (request !== historyRequest) return;
    renderHistory(detailHistory, events, formatDate);
    detailHistoryMessage.hidden = true;
  } catch (error) {
    if (request !== historyRequest) return;
    historyKey = null;
    detailHistoryMessage.textContent = `No se pudo cargar el historial: ${error.message}`;
  }
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
  const canAssign = (isAdministrator() || isLabLeaderFor(ticket))
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
  const request = ++assignmentRequest;
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
    // El diálogo se cerró o ya muestra otra acción: la respuesta llegó tarde.
    if (request !== assignmentRequest) return;
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

    // El técnico actual queda visible pero no se puede volver a elegir.
    for (const option of select.options) {
      if (ticket.id_tecnico && option.value === String(ticket.id_tecnico)) {
        option.disabled = true;
        option.textContent += ' (asignado actualmente)';
      }
    }
    const selectable = [...select.options].filter((option) => option.value && !option.disabled).length;
    select.disabled = technicians.length === 0;
    actionDialogSubmit.disabled = selectable === 0;
    if (technicians.length === 0) {
      setDialogError(actionDialogError, 'No hay técnicos disponibles para el aula de este ticket.');
    } else if (selectable === 0) {
      setDialogError(actionDialogError, 'No hay otro técnico disponible: el único técnico de esta aula ya es el responsable.');
    }
    select.focus();
  } catch (error) {
    if (request !== assignmentRequest) return;
    select.replaceChildren();
    select.disabled = true;
    actionDialogSubmit.disabled = true;
    setDialogError(actionDialogError, error.message);
  }
}

function openStateDialog(ticket) {
  // Invalida una carga de técnicos pendiente para que no pinte este diálogo.
  assignmentRequest += 1;
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
  solution.maxLength = 2000;
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
  select.focus();
}

function openCloseConfirmation(ticket) {
  activeActionTicket = ticket;
  setDialogError(closeDialogError);
  closeDialogSubmit.disabled = false;
  openDialog(closeTicketDialog);
}

// Mientras la petición está en curso el diálogo no se puede cerrar (Cancelar, × ni Escape).
function setDialogBusy(dialog, busy) {
  busyDialog = busy ? dialog : null;
  dialog.setAttribute('aria-busy', String(busy));
  // Chromium deja de poder cancelar Escape si se repite sin otra interacción;
  // closedby="none" lo bloquea del todo y 'cancel' cubre a los navegadores sin soporte.
  if (busy) dialog.setAttribute('closedby', 'none');
  else dialog.removeAttribute('closedby');
  for (const button of dialog.querySelectorAll('[data-close-dialog], button[type="submit"]')) {
    button.disabled = busy;
  }
}

// El resultado siempre se muestra en el diálogo que inició la petición.
async function sendTicketAction(dialog, path, body, successMessage) {
  const ticket = activeActionTicket;
  if (!ticket || busyDialog) return;

  const errorElement = dialog === closeTicketDialog ? closeDialogError : actionDialogError;
  let succeeded = false;
  setDialogBusy(dialog, true);

  try {
    await apiJson(path, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    succeeded = true;
  } catch (error) {
    // Si el navegador cerró el diálogo de todos modos, el error se avisa fuera de él.
    if (dialog.open) setDialogError(errorElement, error.message);
    else showActionFeedback(error.message, 'error');
  } finally {
    setDialogBusy(dialog, false);
  }

  if (!succeeded) return;
  closeDialog(dialog);
  showActionFeedback(successMessage);
  historyKey = null;
  await loadTickets();
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
      actionDialog,
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
      actionDialog,
      `/tickets/${activeActionTicket.id_ticket}/resolver`,
      { texto_solucion: solution },
      'Ticket resuelto y solución registrada.',
    );
  } else if (nextState === 'Cerrado') {
    closeDialog(actionDialog);
    openCloseConfirmation(activeActionTicket);
  } else if (nextState === 'En Proceso') {
    await sendTicketAction(
      actionDialog,
      `/tickets/${activeActionTicket.id_ticket}/reabrir`,
      null,
      'Ticket reabierto y devuelto a En Proceso.',
    );
  }
}

function getVisibleTickets() {
  const status = statusFilter.value;
  const classroom = classroomFilter.value;
  const searchText = normalize(ticketSearch.value.trim());
  // Include both whole days in the same local calendar as ticket details.
  const from = dateRange[0] ? new Date(dateRange[0]) : null;
  const until = dateRange[1] ? new Date(dateRange[1]) : null;
  if (until) until.setDate(until.getDate() + 1);

  return tickets.filter((ticket) => {
    const matchesStatus = !status || ticket.estado === status;
    const matchesClassroom = !classroom || String(ticket.id_aula) === classroom;
    const searchableText = normalize([
      formatTicketId(ticket.id_ticket),
      // "#5" también encuentra el ticket que se muestra como "#005".
      `#${ticket.id_ticket}`,
      ticket.nombre_ticket,
      ticket.descripcion,
      classroomName(ticket),
      equipmentName(ticket),
      ticket.estado,
      ticket.nombre_reportante,
      ticket.nombre_tecnico,
      ...(ticket.problemas || []),
    ].join(' '));
    const matchesSearch = !searchText || searchableText.includes(searchText);

    const registeredAt = parseApiDate(ticket.fecha_registro);
    const matchesDates = (!from && !until) || (
      !Number.isNaN(registeredAt.getTime())
      && (!from || registeredAt >= from)
      && (!until || registeredAt < until)
    );
    return matchesStatus && matchesClassroom && matchesSearch && matchesDates;
  });
}

// En el celular los filtros viven detrás de dos botones; un punto avisa si hay alguno activo.
function updateFilterIndicators() {
  dateToggle.querySelector('.filters-toggle__dot').hidden = dateRange.length === 0;
  filtersToggle.querySelector('.filters-toggle__dot').hidden = !statusFilter.value && !classroomFilter.value;
}

function togglePanel(button, className) {
  const open = !filtersSection.classList.contains(className);
  filtersSection.classList.toggle(className, open);
  button.setAttribute('aria-expanded', String(open));
  return open;
}

function renderTickets() {
  updateFilterIndicators();
  const visibleTickets = getVisibleTickets();
  ticketsBody.replaceChildren();

  for (const ticket of visibleTickets) {
    ticketsBody.append(createTicketRow(ticket));
  }

  // Tras un fallo se conserva el aviso hasta la siguiente carga correcta.
  ticketsCount.textContent = requestState === 'error'
    ? 'Error al cargar'
    : `${visibleTickets.length} ${visibleTickets.length === 1 ? 'ticket' : 'tickets'}`;

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
  setDetailExpanded(false);
  renderTickets();
}

// En el celular el detalle se muestra resumido (estado, responsable y acciones);
// "Ver más" despliega el resto. En escritorio el botón no se muestra.
function setDetailExpanded(expanded) {
  detailsSection.classList.toggle('is-expanded', expanded);
  detailMoreButton.setAttribute('aria-expanded', String(expanded));
  detailMoreButton.textContent = expanded ? 'Ver menos' : 'Ver más';
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
    // Un fallo al actualizar no borra los tickets que ya se mostraban.
    requestState = 'error';
    ticketsMessage.textContent = `No se pudieron cargar los tickets: ${error.message}`;
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
  // El foco vuelve al campo (el botón se oculta), pero Flatpickr abre al enfocar:
  // se cierra en el mismo instante para no tapar la lista.
  dateRangeFilter.focus();
  datePicker.close();
});
classroomFilter.addEventListener('change', renderTickets);
ticketSearch.addEventListener('input', renderTickets);
dateToggle.addEventListener('click', () => {
  if (togglePanel(dateToggle, 'show-dates')) datePicker.open();
});
filtersToggle.addEventListener('click', () => {
  if (togglePanel(filtersToggle, 'show-filters')) statusFilter.focus();
});
detailMoreButton.addEventListener('click', () => {
  setDetailExpanded(!detailsSection.classList.contains('is-expanded'));
});

refreshButton.addEventListener('click', async () => {
  // Una actualización manual vuelve a pedir el historial aunque el estado no haya cambiado.
  historyKey = null;
  refreshButton.disabled = true;
  // Si el perfil no cargó al inicio, se reintenta para mostrar acciones y "Nuevo ticket".
  if (!currentUser) await loadCurrentUser();
  await loadTickets();
});
assignTicketButton.addEventListener('click', () => {
  if (busyDialog) return;
  const ticket = getSelectedTicket();
  if (ticket) openAssignmentDialog(ticket);
});
changeTicketStateButton.addEventListener('click', () => {
  if (busyDialog) return;
  const ticket = getSelectedTicket();
  if (ticket) openStateDialog(ticket);
});
closeTicketButton.addEventListener('click', () => {
  if (busyDialog) return;
  const ticket = getSelectedTicket();
  if (ticket) openCloseConfirmation(ticket);
});
actionForm.addEventListener('submit', submitTicketAction);
closeTicketForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeActionTicket) return;
  sendTicketAction(
    closeTicketDialog,
    `/tickets/${activeActionTicket.id_ticket}/cerrar`,
    null,
    'Ticket cerrado correctamente.',
  );
});
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!busyDialog) closeDialog(button.closest('dialog'));
  });
});
for (const dialog of [actionDialog, closeTicketDialog]) {
  dialog.addEventListener('cancel', (event) => {
    if (busyDialog === dialog) event.preventDefault();
  });
}
// Al cerrar el diálogo se descarta la carga de técnicos que siga en camino.
actionDialog.addEventListener('close', () => {
  assignmentRequest += 1;
});

async function loadCurrentUser() {
  try {
    currentUser = await apiJson('/usuarios/me');
    // Solo docentes y administradores crean tickets (el backend rechaza al resto).
    newTicketButton.hidden = ![1, 3].includes(currentUser.id_rol);
  } catch (error) {
    showActionFeedback(`No se pudo cargar tu perfil: ${error.message}`, 'error');
  }
}

async function initializePage() {
  await loadCurrentUser();
  await loadTickets();
}

initializePage();
