import { apiJson } from '../../api.js';

try {
  const user = await apiJson('/usuarios/me');
  document.getElementById('report-users-link').hidden = user.id_rol !== 1;
} catch (error) {
  console.error('No se pudo cargar la navegación de reportes:', error.message);
}
