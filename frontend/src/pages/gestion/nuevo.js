import { apiJson } from '../../api.js';

const form = document.getElementById('new-ticket-form');
const titleInput = document.getElementById('ticket-title');
const classroomSelect = document.getElementById('classroom-select');
const equipmentSelect = document.getElementById('equipment-select');
const problemTypesList = document.getElementById('problem-types-list');
const descriptionInput = document.getElementById('ticket-description');
const formMessage = document.getElementById('form-message');
const submitButton = document.getElementById('submit-ticket');

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

    const text = document.createElement('span');
    text.textContent = problemType.nombre;

    label.append(checkbox, text);
    problemTypesList.append(label);
  }
}

async function loadFormOptions() {
  submitButton.disabled = true;
  showMessage('Cargando aulas y tipos de problema...', 'info');

  try {
    const [classrooms, problemTypes] = await Promise.all([
      apiJson('/aulas'),
      apiJson('/tickets/tipos-problema'),
    ]);

    renderClassrooms(classrooms);
    renderProblemTypes(problemTypes);
    showMessage('');
    submitButton.disabled = false;
  } catch (error) {
    showMessage(`No se pudieron cargar las opciones: ${error.message}`);
  }
}

async function loadEquipment() {
  const classroomId = classroomSelect.value;

  equipmentSelect.disabled = true;
  equipmentSelect.replaceChildren(
    createOption('', classroomId ? 'Cargando equipos...' : 'Selecciona un aula primero'),
  );

  if (!classroomId) return;

  try {
    const equipmentList = await apiJson(
      `/equipos?id_aula=${encodeURIComponent(classroomId)}`,
    );

    // Ignora una respuesta vieja si el usuario ya eligió otra aula.
    if (classroomSelect.value !== classroomId) return;

    const availableEquipment = equipmentList.filter(
      (equipment) => equipment.estado_actual === 'Operativo',
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
  } catch (error) {
    equipmentSelect.replaceChildren(
      createOption('', 'No se pudieron cargar los equipos'),
    );
    showMessage(`No se pudieron cargar los equipos: ${error.message}`);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage('');

  const selectedProblemIds = [
    ...problemTypesList.querySelectorAll('input[name="problemas_ids"]:checked'),
  ].map((checkbox) => Number(checkbox.value));

  if (selectedProblemIds.length === 0) {
    showMessage('Selecciona al menos un tipo de problema.');
    return;
  }

  const ticket = {
    nombre_ticket: titleInput.value.trim(),
    descripcion: descriptionInput.value.trim(),
    id_aula: Number(classroomSelect.value),
    id_equipo: equipmentSelect.value ? Number(equipmentSelect.value) : null,
    problemas_ids: selectedProblemIds,
  };

  submitButton.disabled = true;
  submitButton.textContent = 'Creando ticket...';

  try {
    await apiJson('/tickets/', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });

    showMessage('Ticket creado. Volviendo a la lista...', 'success');
    window.setTimeout(() => {
      window.location.href = './gestion.html';
    }, 900);
  } catch (error) {
    showMessage(`No se pudo crear el ticket: ${error.message}`);
    submitButton.disabled = false;
    submitButton.textContent = 'Crear ticket';
  }
});

classroomSelect.addEventListener('change', loadEquipment);
loadFormOptions();
