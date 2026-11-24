// Integración con Android (Capacitor). En la web no hace nada.
import { Capacitor } from '@capacitor/core';

// Páginas raíz: "Atrás" sale de la app en lugar de volver al login o rebotar al panel.
const ROOT_PAGES = /^\/(?:|index\.html|dashboard(?:\.html)?|src\/pages\/login\/login\.html)$/;

// Cierra el diálogo abierto respetando sus propias reglas (evento "cancel"):
// el cambio de contraseña obligatorio o un diálogo ocupado lo cancelan.
function closeOpenDialog() {
  const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (!dialog) return false;
  if (dialog.dataset.busy === 'true' || dialog.getAttribute('aria-busy') === 'true') return true;
  if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
  return true;
}

// Paneles desplegables (ajustes, filtros): su botón tiene aria-expanded y aria-controls.
function closeOpenPanel() {
  const toggle = [...document.querySelectorAll('[aria-expanded="true"][aria-controls]')]
    .find((element) => element.getClientRects().length > 0);
  if (!toggle) return false;
  toggle.click();
  return true;
}

function handleBackButton({ canGoBack }, app) {
  if (closeOpenDialog() || closeOpenPanel()) return;
  if (ROOT_PAGES.test(window.location.pathname) || !canGoBack) {
    app.exitApp();
  } else {
    window.history.back();
  }
}

if (Capacitor.isNativePlatform()) {
  import('@capacitor/app')
    .then(({ App }) => App.addListener('backButton', (event) => handleBackButton(event, App)))
    .catch((error) => console.error('No se pudo activar el botón Atrás de Android:', error));
}
