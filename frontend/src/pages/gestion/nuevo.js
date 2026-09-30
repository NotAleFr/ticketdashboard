import { apiJson, redirectToLogin } from '../../api.js';

const form = document.getElementById('ticket-form');
const classroom = document.getElementById('classroom');
const equipment = document.getElementById('equipment');
const problemTypes = document.getElementById('problem-types');
const message = document.getElementById('form-message');
const submitButton = document.getElementById('submit-ticket');

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? '#b91c1c' : '';
}

function showError(error) {
  if (error.message.includes('sesión') || error.message.includes('token')) {
    redirectToLogin();
    return;
  }
  setMessage(error.message, true);
}

async function loadClassrooms() {
  const classrooms = await apiJson('/aulas');
  classroom.replaceChildren();
  for (const aula of classrooms.filter((item) => item.activo)) {
    const option = new Option(aula.nombre, aula.id_aula);
    classroom.add(option);
  }
  if (!classroom.options.length) {
    classroom.add(new Option('No hay aulas activas disponibles', ''));
    submitButton.disabled = true;
    setMessage('No hay aulas activas disponibles. Solicita a un administrador que registre una antes de crear un ticket.', true);
    return;
  }
  await loadEquipment();
}

async function loadEquipment() {
  const aulaId = classroom.value;
  equipment.replaceChildren(new Option('Incidencia general del aula', ''));
  if (!aulaId) return;
  const equipos = await apiJson(`/equipos?id_aula=${encodeURIComponent(aulaId)}`);
  for (const equipo of equipos) {
    equipment.add(new Option(`${equipo.identificador} (${equipo.tipo})`, equipo.id_equipo));
  }
}

async function loadProblemTypes() {
  const types = await apiJson('/tipos-problema');
  problemTypes.replaceChildren();
  for (const type of types) {
    const label = document.createElement('label');
    label.style.display = 'block';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'problem_type';
    checkbox.value = type.id_tipo_problema;
    label.append(checkbox, ` ${type.nombre}`);
    problemTypes.appendChild(label);
  }
  if (!types.length) {
    problemTypes.textContent = 'No hay categorías disponibles.';
    submitButton.disabled = true;
    setMessage('No hay categorías disponibles. Solicita a un administrador que las registre antes de crear un ticket.', true);
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('Creando ticket…');
  submitButton.disabled = true;

  const problemasIds = [...document.querySelectorAll('input[name="problem_type"]:checked')]
    .map((input) => Number(input.value));
  if (!problemasIds.length) {
    setMessage('Selecciona al menos una categoría del problema.', true);
    submitButton.disabled = false;
    return;
  }

  const payload = {
    nombre_ticket: document.getElementById('title').value.trim(),
    descripcion: document.getElementById('description').value.trim(),
    id_aula: Number(classroom.value),
    id_equipo: equipment.value ? Number(equipment.value) : null,
    problemas_ids: problemasIds,
  };

  try {
    await apiJson('/tickets/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    window.location.href = './gestion.html';
  } catch (error) {
    showError(error);
    submitButton.disabled = false;
  }
});

classroom.addEventListener('change', () => loadEquipment().catch(showError));
Promise.all([loadClassrooms(), loadProblemTypes()])
  .then(() => {
    if (!message.textContent) setMessage('Completa los datos para registrar una incidencia.');
  })
  .catch((error) => {
    submitButton.disabled = true;
    showError(error);
  });
