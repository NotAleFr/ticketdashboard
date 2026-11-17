const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const recoveryForm = document.getElementById('recovery-form');
const emailInput = document.getElementById('email');
const recoveryButton = document.getElementById('recovery-btn');
const errorMessage = document.getElementById('recovery-error');
const successMessage = document.getElementById('recovery-success');

// Espera mínima entre envíos; se guarda por pestaña para que recargar no la salte.
const COOLDOWN_SECONDS = 60;
const COOLDOWN_KEY = 'recovery-cooldown-until';
const BUTTON_LABEL = 'Enviar enlace';
let cooldownTimer = null;

function readCooldownEnd() {
  try { return Number(sessionStorage.getItem(COOLDOWN_KEY)) || 0; } catch { return 0; }
}

function startCooldown(until = Date.now() + COOLDOWN_SECONDS * 1000) {
  try { sessionStorage.setItem(COOLDOWN_KEY, String(until)); } catch { /* solo en memoria */ }
  clearInterval(cooldownTimer);
  const tick = () => {
    const remaining = Math.ceil((until - Date.now()) / 1000);
    if (remaining <= 0) {
      clearInterval(cooldownTimer);
      recoveryButton.disabled = false;
      recoveryButton.value = BUTTON_LABEL;
      return;
    }
    recoveryButton.disabled = true;
    recoveryButton.value = `Reenviar en ${remaining} s`;
  };
  tick();
  cooldownTimer = setInterval(tick, 1000);
}

if (readCooldownEnd() > Date.now()) startCooldown(readCooldownEnd());

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (recoveryButton.disabled) return;

  errorMessage.hidden = true;
  errorMessage.textContent = '';
  successMessage.hidden = true;
  successMessage.textContent = '';

  recoveryButton.disabled = true;
  recoveryButton.value = 'Enviando...';
  let cooldown = false;

  try {
    const response = await fetch(`${API_URL}/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim() }),
    });
    if (response.status === 429) cooldown = true;
    if (!response.ok) {
      throw new Error(response.status === 429
        ? 'Demasiados intentos. Inténtalo más tarde.'
        : 'No fue posible enviar el enlace. Inténtalo más tarde.');
    }

    // Mensaje genérico a propósito: no revela si el correo está registrado o no.
    successMessage.textContent =
      'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.';
    successMessage.hidden = false;
    recoveryForm.reset();
    cooldown = true;
  } catch (error) {
    errorMessage.textContent = error.message || 'No fue posible enviar el enlace.';
    errorMessage.hidden = false;

    console.error('Error al solicitar la recuperación de contraseña:', error);
  } finally {
    if (cooldown) {
      startCooldown();
    } else {
      recoveryButton.disabled = false;
      recoveryButton.value = BUTTON_LABEL;
    }
  }
});
