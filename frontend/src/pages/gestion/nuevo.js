import { apiJson } from '../../api.js';

const form = document.getElementById('new-ticket-form');
const titleInput = document.getElementById('ticket-title');
const classroomSelect = document.getElementById('classroom-select');
const equipmentSelect = document.getElementById('equipment-select');
const problemTypesList = document.getElementById('problem-types-list');
const descriptionInput = document.getElementById('ticket-description');
const formMessage = document.getElementById('form-message');
const submitButton = document.getElementById('submit-ticket');
const retryButton = document.getElementById('retry-options');
const titleError = document.getElementById('ticket-title-error');
const classroomError = document.getElementById('classroom-select-error');
const problemTypesError = document.getElementById('problem-types-error');
const descriptionError = document.getElementById('ticket-description-error');
const newTicketCard = document.querySelector('.new-ticket-card');

// Solo docentes (3) y administradores (1) pueden crear tickets; el backend rechaza al resto.
const ROLES_QUE_CREAN = [1, 3];

// El envío solo se habilita con aulas/tipos cargados y, si hay aula, con sus equipos cargados;
// así nunca se envía id_equipo null por un error de red sin que el usuario lo sepa.
let currentUser = null;
let optionsReady = false;
let equipmentReady = true;
let submitting = false;

function updateSubmitState() {
  submitButton.disabled = submitting || !(optionsReady && equipmentReady);
}

function createOption(value, label) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function showMessage(message, type = 'error') {
  formMessage.textContent = message;
  formMessage.className = `form-message form-message--${type}`;
  formMessage.hidden = !message;
}

function renderClassrooms(classrooms) {
  classroomSelect.replaceChildren(createOption('', 'Selecciona un aula'));

  const activeClassrooms = classrooms
    .filter((classroom) => classroom.activo !== false)
    .sort((left, right) => left.nombre.localeCompare(right.nombre, 'es'));

  for (const classroom of activeClassrooms) {
    classroomSelect.append(
      createOption(classroom.id_aula, classroom.nombre),
    );
  }

  if (activeClassrooms.length === 0) {
    classroomSelect.replaceChildren(createOption('', 'No hay aulas disponibles'));
  }
}

function renderProblemTypes(problemTypes) {
  problemTypesList.replaceChildren();

  const sortedTypes = [...problemTypes].sort(
    (left, right) => left.nombre.localeCompare(right.nombre, 'es'),
  );

  if (sortedTypes.length === 0) {
    const message = document.createElement('span');
    message.className = 'field-hint';
    message.textContent = 'No hay tipos de problema disponibles.';
    problemTypesList.append(message);
    return;
  }

  for (const problemType of sortedTypes) {
    const label = document.createElement('label');
    label.className = 'problem-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'problemas_ids';
    checkbox.value = problemType.id_tipo_problema;
    checkbox.setAttribute('aria-describedby', 'problem-types-error');

    const text = document.createElement('span');
    text.textContent = problemType.nombre;

    label.append(checkbox, text);
    problemTypesList.append(label);
  }
}

function showNotAllowed() {
  const message = document.createElement('div');
  message.className = 'not-allowed';
  const text = document.createElement('p');
  text.textContent = 'Solo docentes y administradores pueden crear tickets.';
  const link = document.createElement('a');
  link.className = 'cancel-button';
  link.href = './gestion.html';
  link.textContent = 'Volver a gestión de tickets';
  message.append(text, link);
  newTicketCard.replaceChildren(message);
}

async function loadFormOptions() {
  optionsReady = false;
  updateSubmitState();
  retryButton.hidden = true;
  showMessage(currentUser ? 'Cargando aulas y tipos de problema...' : 'Verificando permisos...', 'info');

  try {
    // El rol se revisa primero: quien no puede crear tickets no ve el formulario.
    currentUser ??= await apiJson('/usuarios/me');
    if (!ROLES_QUE_CREAN.includes(currentUser.id_rol)) {
      showNotAllowed();
      return;
    }
    form.classList.remove('is-checking-role');
    showMessage('Cargando aulas y tipos de problema...', 'info');

    const [classrooms, problemTypes] = await Promise.all([
      apiJson('/aulas?activas=true'),
      apiJson('/tickets/tipos-problema'),
    ]);

    renderClassrooms(classrooms);
    renderProblemTypes(problemTypes);
    const hasClassrooms = classrooms.some((classroom) => classroom.activo !== false);
    if (!hasClassrooms || problemTypes.length === 0) {
      showMessage(hasClassrooms
        ? 'No hay tipos de problema configurados. Pide a un administrador que los registre.'
        : 'No hay aulas activas para reportar. Pide a un administrador que active una.');
      return;
    }
    showMessage('');
    optionsReady = true;
    updateSubmitState();
  } catch (error) {
    showMessage(`No se pudieron cargar las opciones: ${error.message}`);
    retryButton.hidden = false;
  }
}

// Validación propia (el form usa novalidate): el mensaje queda junto al campo
// y el foco va al primer campo con error.
function setFieldError(field, errorElement, message) {
  errorElement.textContent = message;
  errorElement.hidden = !message;
  // En el grupo de casillas el estado inválido se marca en cada casilla.
  const targets = field === problemTypesList
    ? problemTypesList.querySelectorAll('input')
    : [field];
  for (const target of targets) target.setAttribute('aria-invalid', String(Boolean(message)));
}

function validateForm(selectedProblemIds) {
  const checks = [
    [titleInput, titleError, titleInput.value.trim() ? '' : 'Escribe un nombre para el ticket.'],
    [classroomSelect, classroomError, classroomSelect.value ? '' : 'Selecciona el aula donde está el problema.'],
    [problemTypesList, problemTypesError, selectedProblemIds.length ? '' : 'Selecciona al menos un tipo de problema.'],
    [descriptionInput, descriptionError, descriptionInput.value.trim() ? '' : 'Describe qué ocurre.'],
  ];
  // La validez no depende de que exista un elemento al que mover el foco.
  const invalid = checks.filter(([, , message]) => message);
  for (const [field, errorElement, message] of checks) {
    setFieldError(field, errorElement, message);
  }
  if (invalid.length) {
    const [field] = invalid[0];
    (field === problemTypesList ? problemTypesList.querySelector('input') : field)?.focus();
  }
  return invalid.length === 0;
}

let equipmentRequest = 0;

async function loadEquipment() {
  const classroomId = classroomSelect.value;
  // Cada cambio de aula invalida las peticiones anteriores (también A → B → A).
  const request = ++equipmentRequest;

  equipmentSelect.disabled = true;
  equipmentSelect.replaceChildren(
    createOption('', classroomId ? 'Cargando equipos...' : 'Selecciona un aula primero'),
  );
  equipmentReady = !classroomId;
  updateSubmitState();
  if (!retryButton.hidden) {
    retryButton.hidden = true;
    showMessage('');
  }

  if (!classroomId) return;

  try {
    const equipmentList = await apiJson(
      `/equipos?id_aula=${encodeURIComponent(classroomId)}`,
    );

    if (request !== equipmentRequest) return;

    // El backend solo rechaza equipos dados de baja; "En Mantenimiento" también se puede reportar.
    const availableEquipment = equipmentList.filter(
      (equipment) => equipment.estado_actual !== 'Inoperativo',
    );

    equipmentSelect.replaceChildren(
      createOption('', 'Sin equipo específico'),
    );

    for (const equipment of availableEquipment) {
      equipmentSelect.append(
        createOption(
          equipment.id_equipo,
          `${equipment.identificador} · ${equipment.tipo}`,
        ),
      );
    }

    equipmentSelect.disabled = false;
    equipmentReady = true;
    updateSubmitState();
  } catch (error) {
    if (request !== equipmentRequest) return;
    equipmentSelect.replaceChildren(
      createOption('', 'No se pudieron cargar los equipos'),
    );
    showMessage(`No se pudieron cargar los equipos: ${error.message}`);
    retryButton.hidden = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  const selectedProblemIds = [
    ...problemTypesList.querySelectorAll('input[name="problemas_ids"]:checked'),
  ].map((checkbox) => Number(checkbox.value));

  if (!validateForm(selectedProblemIds)) return;

  const ticket = {
    nombre_ticket: titleInput.value.trim(),
    descripcion: descriptionInput.value.trim(),
    id_aula: Number(classroomSelect.value),
    id_equipo: equipmentSelect.value ? Number(equipmentSelect.value) : null,
    problemas_ids: selectedProblemIds,
  };

  submitting = true;
  updateSubmitState();
  submitButton.textContent = 'Creando ticket...';

  try {
    await apiJson('/tickets/', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });

    showMessage('Ticket creado. Volviendo a la lista...', 'success');
    // replace: "Atrás" desde la lista no vuelve al formulario ya enviado.
    window.setTimeout(() => {
      window.location.replace('./gestion.html');
    }, 900);
  } catch (error) {
    showMessage(`No se pudo crear el ticket: ${error.message}`);
    submitting = false;
    updateSubmitState();
    submitButton.textContent = 'Crear ticket';
  }
});

classroomSelect.addEventListener('change', loadEquipment);
// El mismo botón reintenta lo que falló: las opciones del formulario o los equipos del aula.
retryButton.addEventListener('click', () => (optionsReady ? loadEquipment() : loadFormOptions()));

// Volver/Cancelar regresa a la página de la app desde la que se llegó (panel o gestión);
// sin una página previa propia, el enlace lleva al panel.
function cameFromApp() {
  try {
    return window.history.length > 1 && new URL(document.referrer).origin === window.location.origin;
  } catch {
    return false;
  }
}
document.querySelectorAll('.back-button, .form-actions .cancel-button').forEach((link) => {
  link.addEventListener('click', (event) => {
    if (!cameFromApp()) return;
    event.preventDefault();
    window.history.back();
  });
});

// Al corregir un campo se quita su mensaje de error.
titleInput.addEventListener('input', () => setFieldError(titleInput, titleError, ''));
descriptionInput.addEventListener('input', () => setFieldError(descriptionInput, descriptionError, ''));
classroomSelect.addEventListener('change', () => setFieldError(classroomSelect, classroomError, ''));
problemTypesList.addEventListener('change', () => setFieldError(problemTypesList, problemTypesError, ''));
loadFormOptions();
