import { createClient } from '@supabase/supabase-js';
import { getAccessToken } from './auth/session.js';

export function resolveApiUrl(configuredUrl) {
  const url = (configuredUrl || '/api').trim().replace(/\/+$/, '');
  if (url.startsWith('/')) {
    return url;
  }
  const absoluteUrl = /^https?:\/\//i.test(url) ? url : `http://${url}`;
  return absoluteUrl.replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1');
}

const apiUrl = resolveApiUrl(import.meta.env.VITE_API_URL);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function apiFetch(path, options = {}) {
  let token;
  try {
    token = await getAccessToken({ supabaseClient });
  } catch {
    throw new Error('No se pudo recuperar tu sesión. Inicia sesión nuevamente.');
  }
  if (!token) {
    throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response;
  try {
    response = await fetch(`${apiUrl}${path}`, { ...options, headers });
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica que la API esté disponible e inténtalo de nuevo.');
  }
  if (response.status === 401) {
    localStorage.removeItem('access_token');
    throw new Error('La sesión expiró o el token fue rechazado.');
  }

  if (!response.ok) {
    let detail = `Error ${response.status}`;
    try {
      const payload = await response.json();
      detail = payload.detail || detail;
    } catch {
      // Keep the HTTP status when the API response is not JSON.
    }
    throw new Error(detail);
  }

  return response;
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  return response.status === 204 ? null : response.json();
}

export function redirectToLogin() {
  window.location.href = '/src/pages/login/login.html';
}
