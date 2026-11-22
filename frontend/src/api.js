import { supabaseClient } from './auth/supabase.js';
import { getAccessToken } from './auth/session.js';

// Dirección base de FastAPI. Si no está en .env, usa esta por defecto.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

// Debe coincidir con el detalle que devuelve backend/app/core/deps.py.
export const PASSWORD_CHANGE_REQUIRED = 'Debes cambiar tu contraseña temporal antes de continuar.';

function redirectToLogin() {
  window.location.href = '/src/pages/login/login.html';
}

// FastAPI devuelve un texto o, en errores de validación (422), una lista de objetos.
function errorMessage(detail, status) {
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => item?.msg || String(item)).join(' · ');
  }
  return `Error HTTP ${status}`;
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
    let detail;

    try {
      detail = (await response.json()).detail;
    } catch {
      // La respuesta no siempre incluye un mensaje JSON.
    }

    // Con contraseña temporal solo el panel (que obliga a cambiarla) puede operar.
    if (response.status === 403 && detail === PASSWORD_CHANGE_REQUIRED
        && !/^\/dashboard(?:\.html)?$/.test(window.location.pathname)) {
      window.location.href = '/dashboard.html';
    }

    throw new Error(errorMessage(detail, response.status));
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
