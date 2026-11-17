// Línea de tiempo del historial de un ticket, compartida por gestión y reportes.
import './ticket-history.css';

export function describeEvent(event) {
  if (event.tipo === 'creacion') return 'Reportó el ticket';
  if (event.estado_anterior === 'Resuelto' && event.estado_actual === 'En Proceso') return 'Reabrió el ticket';
  if (event.estado_actual === 'En Proceso') {
    return event.estado_anterior === 'Abierto' ? 'Asignó un técnico (En Proceso)' : 'Reasignó el técnico';
  }
  if (event.estado_actual === 'Resuelto') return 'Marcó el ticket como Resuelto';
  if (event.estado_actual === 'Cerrado') return 'Cerró el ticket';
  return `Cambió el estado a ${event.estado_actual}`;
}

export function renderHistory(list, events, formatDate) {
  list.replaceChildren();
  for (const event of events) {
    const item = document.createElement('li');
    item.className = 'history-item';
    const what = document.createElement('p');
    what.className = 'history-item__what';
    what.textContent = describeEvent(event);
    const meta = document.createElement('p');
    meta.className = 'history-item__meta';
    meta.textContent = [event.nombre_usuario, formatDate(event.fecha)].filter(Boolean).join(' · ');
    item.append(what, meta);
    if (event.texto) {
      const solution = document.createElement('p');
      solution.className = 'history-item__note';
      solution.textContent = event.texto;
      item.append(solution);
    }
    list.append(item);
  }
}
