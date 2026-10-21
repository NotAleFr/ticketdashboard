const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const recoveryForm = document.getElementById('recovery-form');
const emailInput = document.getElementById('email');
const recoveryButton = document.getElementById('recovery-btn');
const errorMessage = document.getElementById('recovery-error');
const successMessage = document.getElementById('recovery-success');

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  errorMessage.hidden = true;
  errorMessage.textContent = '';
  successMessage.hidden = true;
  successMessage.textContent = '';

  recoveryButton.disabled = true;
  recoveryButton.value = 'Enviando...';

  try {
    const response = await fetch(`${API_URL}/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailInput.value.trim() }),
    });
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
  } catch (error) {
    errorMessage.textContent = error.message || 'No fue posible enviar el enlace.';
    errorMessage.hidden = false;

    console.error('Error al solicitar la recuperación de contraseña:', error);
  } finally {
    recoveryButton.disabled = false;
    recoveryButton.value = 'Enviar enlace';
  }
});
