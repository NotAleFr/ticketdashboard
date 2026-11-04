import { supabaseClient } from './auth/supabase.js';
import { getAccessToken } from './auth/session.js';

// Dirección base de FastAPI. Si no está en .env, usa esta por defecto.
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function redirectToLogin() {
  window.location.href = '/src/pages/login/login.html';
}

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken(supabaseClient);

  // Sin token no debemos llamar a una ruta protegida.
  if (!token) {
    redirectToLogin();
    throw new Error('Inicia sesión para continuar.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await supabaseClient.auth.signOut();
    redirectToLogin();
    throw new Error('La sesión venció. Inicia sesión nuevamente.');
  }

  if (!response.ok) {
    let message = `Error HTTP ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.detail) {
        message = errorData.detail;
      }
    } catch {
      // La respuesta no siempre incluye un mensaje JSON.
    }

    throw new Error(message);
  }

  return response;
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);

  if (response.status === 204) {
    return null;
  }

  return response.json();
}
