import { apiJson, redirectToLogin } from '../../api.js';

const body = document.getElementById('tickets-body');
const message = document.getElementById('tickets-message');
const count = document.getElementById('tickets-count');
const statusFilter = document.getElementById('status-filter');
const search = document.getElementById('ticket-search');

let tickets = [];

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function renderTickets() {
  const selectedStatus = statusFilter.value;
  const query = search.value.trim().toLowerCase();
  const visibleTickets = tickets.filter((ticket) => {
    const matchesStatus = !selectedStatus || ticket.estado === selectedStatus;
    const searchableText = `${ticket.id_ticket} ${ticket.nombre_ticket} ${ticket.descripcion}`.toLowerCase();
    return matchesStatus && (!query || searchableText.includes(query));
  });

  body.replaceChildren();
  for (const ticket of visibleTickets) {
    const row = document.createElement('tr');
    for (const value of [
      `#${ticket.id_ticket}`,
      ticket.nombre_ticket,
      ticket.id_aula,
      ticket.estado,
      formatDate(ticket.fecha_registro),
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      cell.style.padding = '.65rem .35rem';
      row.appendChild(cell);
    }
    body.appendChild(row);
  }

  count.textContent = `${visibleTickets.length} ticket${visibleTickets.length === 1 ? '' : 's'} mostrado${visibleTickets.length === 1 ? '' : 's'}.`;
  message.textContent = visibleTickets.length ? '' : 'No hay tickets que coincidan con los filtros seleccionados.';
}

async function loadTickets() {
  message.textContent = 'Cargando tickets…';
  try {
    tickets = await apiJson('/tickets/');
    renderTickets();
  } catch (error) {
    if (error.message.includes('sesión') || error.message.includes('token')) {
      redirectToLogin();
      return;
    }
    message.textContent = `No se pudieron cargar los tickets: ${error.message}`;
  }
}

statusFilter.addEventListener('change', renderTickets);
search.addEventListener('input', renderTickets);
document.getElementById('refresh-tickets').addEventListener('click', loadTickets);
loadTickets();
