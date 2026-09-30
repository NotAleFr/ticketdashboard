import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const loginBtn = document.getElementById('login-btn');
const errorMsg = document.getElementById('error-message');

if (!supabaseUrl || !supabaseAnonKey) {
  showError('La configuración de Supabase no está disponible.');
  loginBtn.disabled = true;
} else {
  initializeLogin();
}

// DOM Elements
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

function initializeLogin() {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  loginBtn.addEventListener('click', async () => {
  // Clear previous errors
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';
  loginBtn.value = 'Iniciando sesión...';
  loginBtn.disabled = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showError("Por favor ingresa correo y contraseña.");
    return;
  }

  try {
    // Attempt to sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      });

      if (error) {
        throw error;
      }

    // Success! Save the access token (Supabase handles it automatically, but we can also be explicit if needed)
      if (!data.session) {
        throw new Error('No se pudo crear la sesión.');
      }

      localStorage.setItem('access_token', data.session.access_token);

    // Redirect to dashboard
      window.location.href = '/dashboard.html';

    } catch (err) {
      console.error('Error signing in:', err);
      showError('No fue posible iniciar sesión. Verifica tus credenciales e inténtalo de nuevo.');
    } finally {
      loginBtn.value = 'Entrar';
      loginBtn.disabled = false;
    }
  });
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  loginBtn.value = 'Entrar';
  loginBtn.disabled = false;
}
