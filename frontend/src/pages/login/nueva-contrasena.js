import { supabaseClient } from '../../auth/supabase.js';
import { apiJson } from '../../api.js';
import { enablePasswordToggles } from './password-toggle.js';

const MIN_PASSWORD_LENGTH = 8;
// Tiempo máximo de espera para que Supabase confirme el enlace del correo.
const LINK_CHECK_TIMEOUT_MS = 5000;
// Marca que esta pestaña llegó por un enlace de recuperación válido (sobrevive a recargar).
const RECOVERY_FLAG = 'password-recovery-flow';

function readRecoveryFlag() {
  try { return sessionStorage.getItem(RECOVERY_FLAG) === '1'; } catch { return false; }
}

function setRecoveryFlag(active) {
  try {
    if (active) sessionStorage.setItem(RECOVERY_FLAG, '1');
    else sessionStorage.removeItem(RECOVERY_FLAG);
  } catch { /* sin almacenamiento: recargar pedirá un enlace nuevo */ }
}

const checkingMessage = document.getElementById('reset-checking');
const invalidBlock = document.getElementById('reset-invalid');
const resetForm = document.getElementById('reset-form');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');
const resetButton = document.getElementById('reset-btn');
const errorMessage = document.getElementById('reset-error');
const successMessage = document.getElementById('reset-success');
const continueLink = document.getElementById('reset-continue');

enablePasswordToggles();

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
// Al recargar, el fragmento ya se consumió: solo se acepta la sesión restaurada si
// esta misma pestaña había validado antes un enlace de recuperación.
supabaseClient.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    setRecoveryFlag(true);
    showForm();
  } else if (event === 'INITIAL_SESSION' && session && readRecoveryFlag()) {
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
      // Un 401 aquí significa que el enlace ya no sirve: no se manda al login.
      redirectOnUnauthorized: false,
    });

    // La contraseña ya cambió: desde aquí no se vuelve a ofrecer el formulario.
    setRecoveryFlag(false);
    // Se cierra la sesión de recuperación. Si el servidor no responde, al menos se
    // descarta la sesión local para que el siguiente acceso use la contraseña nueva.
    const { error: signOutError } = await supabaseClient.auth.signOut();
    if (signOutError) {
      console.error('No se pudo cerrar la sesión en el servidor:', signOutError);
      await supabaseClient.auth.signOut({ scope: 'local' });
    }

    resetForm.hidden = true;
    successMessage.textContent =
      'Tu contraseña se actualizó correctamente. Inicia sesión con tu contraseña nueva.';
    successMessage.hidden = false;
    continueLink.hidden = false;
    continueLink.focus();
  } catch (error) {
    if (error.status === 401) {
      setRecoveryFlag(false);
      resetForm.hidden = true;
      invalidBlock.querySelector('.auth__message').textContent =
        'La sesión no es válida. Solicita un enlace nuevo.';
      invalidBlock.hidden = false;
      console.error('Sesión de recuperación rechazada:', error);
      return;
    }
    errorMessage.textContent = error.message || 'No fue posible actualizar la contraseña.';
    errorMessage.hidden = false;

    console.error('Error al actualizar la contraseña:', error);

    resetButton.disabled = false;
    resetButton.value = 'Guardar contraseña';
  }
});
