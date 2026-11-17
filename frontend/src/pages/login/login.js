import { supabaseClient } from '../../auth/supabase.js';
import { enablePasswordToggles } from './password-toggle.js';

const DASHBOARD_URL = '/dashboard.html';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-btn');
const errorMessage = document.getElementById('login-error');

enablePasswordToggles();

// Quien ya tiene sesión va directo al panel (si la sesión no es válida, el panel la cierra).
supabaseClient.auth.getSession().then(({ data }) => {
  if (data?.session) window.location.replace(DASHBOARD_URL);
});

// Distingue datos incorrectos de fallas de red o del servicio.
function loginErrorMessage(error) {
  // Supabase reporta los 5xx como AuthRetryableFetchError con su código HTTP.
  if (error?.status >= 500) {
    return 'El servicio no está disponible en este momento. Inténtalo más tarde.';
  }
  if (!navigator.onLine || error?.name === 'AuthRetryableFetchError' || !error?.status) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }
  if (error.status === 429) {
    return 'Demasiados intentos. Espera un momento e inténtalo de nuevo.';
  }
  if (error.code === 'email_not_confirmed') {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada.';
  }
  return 'Correo o contraseña incorrectos. Verifica tus datos e inténtalo de nuevo.';
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  errorMessage.hidden = true;
  errorMessage.textContent = '';

  loginButton.disabled = true;
  loginButton.value = 'Iniciando sesión...';

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: emailInput.value.trim(),
      password: passwordInput.value,
    });

    if (error) {
      throw error;
    }

    window.location.href = DASHBOARD_URL;
  } catch (error) {
    errorMessage.textContent = loginErrorMessage(error);
    errorMessage.hidden = false;

    console.error('Error al iniciar sesión:', error);
  } finally {
    loginButton.disabled = false;
    loginButton.value = 'Entrar';
  }
});
