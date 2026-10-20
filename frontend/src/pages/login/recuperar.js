import { supabaseClient } from '../../auth/supabase.js';

const recoveryForm = document.getElementById('recovery-form');
const emailInput = document.getElementById('email');
const recoveryButton = document.getElementById('recovery-btn');
const errorMessage = document.getElementById('recovery-error');
const successMessage = document.getElementById('recovery-success');

// Pantalla a la que Supabase redirige desde el enlace del correo.
// Debe estar permitida en Supabase > Authentication > URL Configuration > Redirect URLs.
const REDIRECT_URL = `${window.location.origin}/src/pages/login/nueva-contrasena.html`;

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  errorMessage.hidden = true;
  errorMessage.textContent = '';
  successMessage.hidden = true;
  successMessage.textContent = '';

  recoveryButton.disabled = true;
  recoveryButton.value = 'Enviando...';

  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(
      emailInput.value.trim(),
      { redirectTo: REDIRECT_URL }
    );

    if (error) {
      throw error;
    }

    // Mensaje genérico a propósito: no revela si el correo está registrado o no.
    successMessage.textContent =
      'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña. Revisa también tu carpeta de spam.';
    successMessage.hidden = false;
    recoveryForm.reset();
  } catch (error) {
    errorMessage.textContent =
      'No fue posible enviar el enlace. Inténtalo de nuevo en unos minutos.';
    errorMessage.hidden = false;

    console.error('Error al solicitar la recuperación de contraseña:', error);
  } finally {
    recoveryButton.disabled = false;
    recoveryButton.value = 'Enviar enlace';
  }
});
