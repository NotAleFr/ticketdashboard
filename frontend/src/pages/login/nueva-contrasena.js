import { supabaseClient } from '../../auth/supabase.js';
import { apiJson } from '../../api.js';

const MIN_PASSWORD_LENGTH = 8;
// Tiempo máximo de espera para que Supabase confirme el enlace del correo.
const LINK_CHECK_TIMEOUT_MS = 5000;
const LOGIN_URL = '/src/pages/login/login.html';

const checkingMessage = document.getElementById('reset-checking');
const invalidBlock = document.getElementById('reset-invalid');
const resetForm = document.getElementById('reset-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetButton = document.getElementById('reset-btn');
const errorMessage = document.getElementById('reset-error');
const successMessage = document.getElementById('reset-success');

let recoveryReady = false;

function showForm() {
  recoveryReady = true;
  checkingMessage.hidden = true;
  invalidBlock.hidden = true;
  resetForm.hidden = false;
  newPasswordInput.focus();
}

function showInvalidLink() {
  if (recoveryReady) {
    return;
  }
  checkingMessage.hidden = true;
  resetForm.hidden = true;
  invalidBlock.hidden = false;
}

// Si Supabase devolvió un error en la URL (por ejemplo, enlace expirado), no hay nada que esperar.
const urlParams = new URLSearchParams(
  window.location.hash.replace(/^#/, '') || window.location.search
);
if (urlParams.get('error')) {
  showInvalidLink();
}

// Supabase procesa el enlace automáticamente y emite PASSWORD_RECOVERY cuando es válido.
supabaseClient.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    showForm();
  }
});

setTimeout(showInvalidLink, LINK_CHECK_TIMEOUT_MS);

resetForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  errorMessage.hidden = true;
  errorMessage.textContent = '';

  const newPassword = newPasswordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    errorMessage.textContent = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    errorMessage.hidden = false;
    return;
  }

  if (newPassword !== confirmPassword) {
    errorMessage.textContent = 'Las contraseñas no coinciden.';
    errorMessage.hidden = false;
    return;
  }

  resetButton.disabled = true;
  resetButton.value = 'Guardando...';

  try {
    await apiJson('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ password: newPassword }),
    });

    // Se cierra la sesión temporal de recuperación para que inicie sesión con la contraseña nueva.
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) {
      throw new Error('Tu contraseña cambió, pero no se pudo cerrar la sesión. Cierra sesión antes de continuar.');
    }

    resetForm.hidden = true;
    successMessage.textContent =
      'Tu contraseña se actualizó correctamente. Te llevamos al inicio de sesión...';
    successMessage.hidden = false;

    setTimeout(() => {
      window.location.href = LOGIN_URL;
    }, 2000);
  } catch (error) {
    errorMessage.textContent = error.message || 'No fue posible actualizar la contraseña.';
    errorMessage.hidden = false;

    console.error('Error al actualizar la contraseña:', error);

    resetButton.disabled = false;
    resetButton.value = 'Guardar contraseña';
  }
});
