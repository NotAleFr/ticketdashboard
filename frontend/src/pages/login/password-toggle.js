// Agrega un botón "Mostrar/Ocultar" a cada campo de contraseña marcado con data-reveal.
const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a10.6 10.6 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

export function enablePasswordToggles(root = document) {
  root.querySelectorAll('input[data-reveal]').forEach((input) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'auth__password';
    input.replaceWith(wrapper);
    wrapper.append(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'auth__reveal';
    button.setAttribute('aria-controls', input.id);
    wrapper.append(button);

    const render = (visible) => {
      input.type = visible ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(visible));
      button.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
      button.innerHTML = visible ? EYE_OFF : EYE;
    };
    render(false);
    button.addEventListener('click', () => render(input.type === 'password'));
    // Al enviar el formulario la contraseña vuelve a ocultarse.
    input.form?.addEventListener('submit', () => render(false));
  });
}
