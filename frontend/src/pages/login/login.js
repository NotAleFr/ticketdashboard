import { supabaseClient } from '../../auth/supabase.js';

const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginButton = document.getElementById('login-btn');
const errorMessage = document.getElementById('login-error');

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

    window.location.href = '/dashboard.html';
  } catch (error) {
    errorMessage.textContent =
      'No fue posible iniciar sesión. Verifica tus datos e inténtalo de nuevo.';
    errorMessage.hidden = false;

    console.error('Error al iniciar sesión:', error);
  } finally {
    loginButton.disabled = false;
    loginButton.value = 'Entrar';
  }
});
