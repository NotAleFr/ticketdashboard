import { apiJson } from './src/api.js';
import { supabaseClient } from './src/auth/supabase.js';

const roleLabel = document.getElementById('dashboard-role-label');
const logoutButton = document.getElementById('logout-button');
const ticketCard = document.getElementById('tickets-card');
const ticketTitle = document.getElementById('tickets-card-title');
const adminUsersCard = document.getElementById('admin-users-card');
const reportsCard = document.getElementById('reports-card');
const reportsTitle = document.getElementById('reports-card-title');
const dashboardMessage = document.getElementById('dashboard-message');

function getRoleLabel(user) {
  if (user.id_rol === 1) return 'admin';
  if (user.id_rol === 3) return 'docente';
  if (user.id_rol === 2) return 'soporte';
  return 'usuario';
}

async function loadDashboard() {
  try {
    const user = await apiJson('/usuarios/me');

    roleLabel.textContent = getRoleLabel(user);

    if (user.id_rol === 3) {
      ticketTitle.textContent = 'Añadir tickets';
      ticketCard.href = './src/pages/gestion/nuevo.html';
      reportsTitle.textContent = '¿Cómo sirven los reportes?';
    } else {
      ticketTitle.textContent = 'Gestión de tickets';
      ticketCard.href = './src/pages/gestion/gestion.html';
      reportsTitle.textContent = 'Historial de reportes';
    }

    // La administración solo se muestra al administrador.
    adminUsersCard.hidden = user.id_rol !== 1;

    const canViewReports = [1, 2, 3].includes(user.id_rol);
    reportsCard.hidden = !canViewReports;
    reportsCard.classList.toggle('dashboard-card--wide', user.id_rol !== 1);
  } catch (error) {
    dashboardMessage.textContent = `No se pudo cargar el perfil: ${error.message}`;
    dashboardMessage.hidden = false;
  }
}

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    window.location.replace('/src/pages/login/login.html');
  } catch (error) {
    dashboardMessage.textContent = `No se pudo cerrar sesión: ${error.message}`;
    dashboardMessage.hidden = false;
    logoutButton.disabled = false;
  }
});

loadDashboard();
