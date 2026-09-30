import { apiJson, redirectToLogin } from './src/api.js';

const message = document.getElementById('dashboard-message');

function isSessionError(error) {
  return error.message.includes('sesión') || error.message.includes('token');
}

async function loadDashboard() {
  try {
    const tickets = await apiJson('/tickets/');
    await apiJson('/tickets/');
  } catch (error) {
    if (isSessionError(error)) {
      redirectToLogin();
      return;
    }
    message.textContent = 'No se pudo cargar el resumen. Intenta actualizar la página.';
    message.hidden = false;
  }
}

loadDashboard();
