import { apiJson } from './src/api.js';
import { supabaseClient } from './src/auth/supabase.js';

const roleLabel = document.getElementById('dashboard-role-label');
const logoutButton = document.getElementById('logout-button');
const settingsButton = document.getElementById('settings-button');
const settingsPanel = document.getElementById('settings-panel');
const passwordDialog = document.getElementById('password-dialog');
const logoutDialog = document.getElementById('logout-dialog');
const passwordForm = document.getElementById('password-form');
const newPassword = document.getElementById('account-new-password');
const confirmPassword = document.getElementById('account-confirm-password');
const passwordError = document.getElementById('password-error');
const passwordSuccess = document.getElementById('password-success');
const savePasswordButton = document.getElementById('save-password-button');
const confirmLogoutButton = document.getElementById('confirm-logout-button');
const logoutError = document.getElementById('logout-error');
let pendingAccountAction = false;
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

function closeSettings(restoreFocus = false) {
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
  if (restoreFocus) settingsButton.focus();
}

settingsButton.addEventListener('click', () => {
  const opening = settingsPanel.hidden;
  settingsPanel.hidden = !opening;
  settingsButton.setAttribute('aria-expanded', String(opening));
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.account-settings')) closeSettings();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !settingsPanel.hidden) closeSettings(true);
});
document.querySelector('.account-settings').addEventListener('focusout', (event) => {
  if (!event.currentTarget.contains(event.relatedTarget)) closeSettings();
});

function openAccountDialog(dialog) {
  closeSettings(true);
  dialog.showModal();
}

function setAccountBusy(dialog, busy) {
  pendingAccountAction = busy;
  dialog.setAttribute('aria-busy', String(busy));
  dialog.querySelectorAll('button, input').forEach(control => { control.disabled = busy; });
}

document.getElementById('change-password-button').addEventListener('click', () => {
  document.getElementById('password-heading').textContent = 'Cambiar contraseña';
  document.getElementById('password-description').textContent = 'Elige una contraseña nueva para tu cuenta.';
  passwordForm.reset();
  confirmPassword.setCustomValidity('');
  passwordError.hidden = true;
  passwordSuccess.hidden = true;
  passwordForm.hidden = false;
  openAccountDialog(passwordDialog);
});
logoutButton.addEventListener('click', () => {
  logoutError.hidden = true;
  openAccountDialog(logoutDialog);
});
document.querySelectorAll('[data-close-account-dialog]').forEach(button => {
  button.addEventListener('click', () => {
    if (!pendingAccountAction) button.closest('dialog').close();
  });
});
[passwordDialog, logoutDialog].forEach(dialog => {
  dialog.addEventListener('cancel', (event) => {
    if (pendingAccountAction) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    passwordForm.reset();
    settingsButton.focus();
  });
});

confirmPassword.addEventListener('input', () => confirmPassword.setCustomValidity(''));
newPassword.addEventListener('input', () => confirmPassword.setCustomValidity(''));
passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (pendingAccountAction) return;
  passwordError.hidden = true;
  if (newPassword.value !== confirmPassword.value) {
    confirmPassword.setCustomValidity('Las contraseñas no coinciden.');
    confirmPassword.reportValidity();
    return;
  }
  setAccountBusy(passwordDialog, true);
  savePasswordButton.textContent = 'Guardando...';
  try {
    await apiJson('/auth/password', {
      method: 'PUT', body: JSON.stringify({ password: newPassword.value }),
    });
    passwordForm.reset();
    passwordForm.hidden = true;
    passwordSuccess.hidden = false;
    document.getElementById('password-heading').textContent = 'Contraseña actualizada';
    document.getElementById('password-description').textContent = 'Ya puedes usar tu nueva contraseña para iniciar sesión.';
  } catch (error) {
    passwordError.textContent = error.message || 'No se pudo guardar la contraseña. Inténtalo de nuevo.';
    passwordError.hidden = false;
  } finally {
    setAccountBusy(passwordDialog, false);
    savePasswordButton.textContent = 'Guardar contraseña';
    if (!passwordSuccess.hidden) passwordSuccess.querySelector('button').focus();
  }
});

confirmLogoutButton.addEventListener('click', async () => {
  if (pendingAccountAction) return;
  logoutError.hidden = true;
  setAccountBusy(logoutDialog, true);
  confirmLogoutButton.textContent = 'Cerrando sesión...';

  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;

    window.location.replace('/src/pages/login/login.html');
  } catch (error) {
    logoutError.textContent = `No se pudo cerrar sesión: ${error.message}`;
    logoutError.hidden = false;
    setAccountBusy(logoutDialog, false);
    confirmLogoutButton.textContent = 'Sí, cerrar sesión';
  }
});

loadDashboard();
