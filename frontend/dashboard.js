import { apiJson } from './src/api.js';
import { supabaseClient } from './src/auth/supabase.js';
import { enablePasswordToggles } from './src/pages/login/password-toggle.js';

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
// Cuentas con contraseña temporal no pueden cerrar el diálogo hasta cambiarla.
let forcedPasswordChange = false;
const ticketCard = document.getElementById('tickets-card');
const ticketTitle = document.getElementById('tickets-card-title');
const adminUsersCard = document.getElementById('admin-users-card');
const reportsCard = document.getElementById('reports-card');
const reportsTitle = document.getElementById('reports-card-title');
const dashboardMessage = document.getElementById('dashboard-message');
const dashboardGrid = document.getElementById('dashboard-grid');
const dashboardError = document.getElementById('dashboard-error');
const forcedLogoutButton = document.getElementById('forced-logout-button');

enablePasswordToggles(passwordForm);

// Nombres de rol tal como existen en el sistema (tabla de roles).
function getRoleName(user) {
  if (user.id_rol === 1) return 'Administrador';
  if (user.id_rol === 2) return user.is_leader ? 'Técnico líder' : 'Técnico';
  if (user.id_rol === 3) return 'Docente';
  return 'Usuario';
}

function getSessionLabel(user) {
  const name = [user.nombre, user.apellido].filter(Boolean).join(' ').trim();
  return name ? `${name} · ${getRoleName(user)}` : getRoleName(user);
}

async function loadDashboard() {
  dashboardError.hidden = true;
  roleLabel.textContent = 'Cargando...';
  try {
    const user = await apiJson('/usuarios/me');

    roleLabel.textContent = getSessionLabel(user);
    if (user.debe_cambiar_password) openPasswordDialog(true);

    if (user.id_rol === 3) {
      ticketTitle.textContent = 'Añadir tickets';
      ticketCard.href = './src/pages/gestion/nuevo.html';
      // El docente consulta el seguimiento de sus propios tickets en la gestión.
      reportsTitle.textContent = 'Mis tickets';
      reportsCard.href = './src/pages/gestion/gestion.html';
    } else {
      ticketTitle.textContent = 'Gestión de tickets';
      ticketCard.href = './src/pages/gestion/gestion.html';
      reportsTitle.textContent = 'Historial de reportes';
      reportsCard.href = './src/pages/gestion/reportes.html';
    }

    // La administración solo se muestra al administrador.
    adminUsersCard.hidden = user.id_rol !== 1;

    const canViewReports = [1, 2, 3].includes(user.id_rol);
    reportsCard.hidden = !canViewReports;
    reportsCard.classList.toggle('dashboard-card--wide', user.id_rol !== 1);
    // Las tarjetas se muestran solo cuando ya apuntan al destino correcto del rol.
    dashboardGrid.hidden = false;
  } catch (error) {
    roleLabel.textContent = 'Sin perfil';
    dashboardMessage.textContent = `No se pudo cargar tu perfil: ${error.message}`;
    dashboardError.hidden = false;
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
// Sin relatedTarget no se cierra: Safari/WebKit no enfoca los botones al tocarlos y el
// panel se cerraría antes del clic. Los toques fuera ya lo cierran con el listener de clic.
document.querySelector('.account-settings').addEventListener('focusout', (event) => {
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) closeSettings();
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

function setForcedPasswordChange(forced) {
  forcedPasswordChange = forced;
  passwordDialog.querySelectorAll('.dialog-close, #password-form [data-close-account-dialog]')
    .forEach(button => { button.hidden = forced; });
  // Sin poder cerrar el diálogo, la única salida alternativa es cerrar sesión.
  forcedLogoutButton.hidden = !forced;
}

function openPasswordDialog(forced = false) {
  setForcedPasswordChange(forced);
  document.getElementById('password-heading').textContent = forced ? 'Crea tu contraseña' : 'Cambiar contraseña';
  document.getElementById('password-description').textContent = forced
    ? 'Tu cuenta usa una contraseña temporal. Crea una nueva para continuar.'
    : 'Elige una contraseña nueva para tu cuenta.';
  passwordForm.reset();
  // Las contraseñas vuelven a ocultarse al abrir de nuevo el diálogo.
  passwordForm.querySelectorAll('.auth__reveal[aria-pressed="true"]').forEach(button => button.click());
  confirmPassword.setCustomValidity('');
  passwordError.hidden = true;
  passwordSuccess.hidden = true;
  passwordForm.hidden = false;
  if (forced) {
    closeSettings();
    passwordDialog.showModal();
  } else {
    openAccountDialog(passwordDialog);
  }
}

document.getElementById('change-password-button').addEventListener('click', () => openPasswordDialog());
logoutButton.addEventListener('click', () => {
  logoutError.hidden = true;
  openAccountDialog(logoutDialog);
});
document.querySelectorAll('[data-close-account-dialog]').forEach(button => {
  button.addEventListener('click', () => {
    const dialog = button.closest('dialog');
    if (pendingAccountAction || (dialog === passwordDialog && forcedPasswordChange)) return;
    dialog.close();
  });
});
[passwordDialog, logoutDialog].forEach(dialog => {
  dialog.addEventListener('cancel', (event) => {
    if (pendingAccountAction || (dialog === passwordDialog && forcedPasswordChange)) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    // Chromium permite cerrar con Escape doble aunque se cancele el primero (CloseWatcher):
    // mientras el cambio sea obligatorio, el diálogo se vuelve a abrir.
    if (dialog === passwordDialog && forcedPasswordChange) {
      dialog.showModal();
      return;
    }
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
    setForcedPasswordChange(false);
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

async function signOutAndLeave(dialog, button, errorTarget) {
  if (pendingAccountAction) return;
  const label = button.textContent;
  errorTarget.hidden = true;
  setAccountBusy(dialog, true);
  button.textContent = 'Cerrando sesión...';

  try {
    const { error } = await supabaseClient.auth.signOut({ scope: 'local' });
    if (error) throw error;

    window.location.replace('/src/pages/login/login.html');
  } catch (error) {
    errorTarget.textContent = `No se pudo cerrar sesión: ${error.message}`;
    errorTarget.hidden = false;
    setAccountBusy(dialog, false);
    button.textContent = label;
  }
}

confirmLogoutButton.addEventListener('click',
  () => signOutAndLeave(logoutDialog, confirmLogoutButton, logoutError));
forcedLogoutButton.addEventListener('click',
  () => signOutAndLeave(passwordDialog, forcedLogoutButton, passwordError));

document.getElementById('dashboard-retry').addEventListener('click', loadDashboard);
loadDashboard();
