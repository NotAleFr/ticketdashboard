import { supabaseClient } from './auth/supabase.js';
import { getAccessToken } from './auth/session.js';
// Botón Atrás de Android para todas las páginas que usan la API (en la web no hace nada).
import './native.js';

// Dirección base de FastAPI. Si no está en .env, usa esta por defecto.
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

// Debe coincidir con el detalle que devuelve backend/app/core/deps.py.
export const PASSWORD_CHANGE_REQUIRED = 'Debes cambiar tu contraseña temporal antes de continuar.';

export const NETWORK_ERROR_MESSAGE = 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';

// replace: "Atrás" no debe volver a una página que ya no es válida.
function redirectToLogin() {
  window.location.replace('/src/pages/login/login.html');
}

// FastAPI devuelve un texto o, en errores de validación (422), una lista de objetos.
function errorMessage(detail, status) {
  if (typeof detail === 'string' && detail) return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((item) => item?.msg || String(item)).join(' · ');
  }
  return `Error HTTP ${status}`;
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function send(path, options, token) {
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    return await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch (error) {
    // fetch solo lanza TypeError ("Failed to fetch") cuando no hay respuesta del servidor.
    if (error instanceof TypeError) throw new Error(NETWORK_ERROR_MESSAGE);
    throw error;
  }
}

// Las peticiones que reciben 401 a la vez comparten una sola renovación del token.
let refreshing = null;
function refreshAccessToken() {
  refreshing ??= supabaseClient.auth.refreshSession()
    .then(({ data, error }) => {
      if (error?.name === 'AuthRetryableFetchError') throw new Error(NETWORK_ERROR_MESSAGE);
      return data?.session?.access_token || null;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// Cierra solo la sesión de este dispositivo; si falla, la redirección sigue adelante.
async function clearLocalSession() {
  try {
    await supabaseClient.auth.signOut({ scope: 'local' });
  } catch (error) {
    console.error('No se pudo cerrar la sesión local:', error);
  }
}

// options.redirectOnUnauthorized = false: el 401 se lanza como error (status 401) sin salir de la página.
export async function apiFetch(path, { redirectOnUnauthorized = true, ...options } = {}) {
  const token = await getAccessToken(supabaseClient);

  // Sin token no debemos llamar a una ruta protegida.
  if (!token) {
    if (redirectOnUnauthorized) redirectToLogin();
    throw httpError('Inicia sesión para continuar.', 401);
  }

  let response = await send(path, options, token);

  if (response.status === 401) {
    // El token pudo vencer justo ahora: se renueva una vez y se reintenta.
    const freshToken = await refreshAccessToken();
    if (freshToken) response = await send(path, options, freshToken);
  }

  if (response.status === 401) {
    await clearLocalSession();
    if (redirectOnUnauthorized) redirectToLogin();
    throw httpError('La sesión venció. Inicia sesión nuevamente.', 401);
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
      window.location.replace('/dashboard.html');
    }

    throw httpError(errorMessage(detail, response.status), response.status);
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
