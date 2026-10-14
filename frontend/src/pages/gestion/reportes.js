import { apiFetch, apiJson } from '../../api.js';

const $ = (selector) => document.querySelector(selector);
const stateFilter = $('#filtro-estado');
const labFilter = $('#filtro-laboratorio');
const periodFilter = $('#filtro-periodo');
const tableArea = $('.table-responsive');
const message = $('#report-message');
const exportButton = $('#export-report');
const dialog = $('#ticket-detail');
const states = ['Abierto', 'En Proceso', 'Resuelto', 'Cerrado'];
const colors = ['pendiente', 'en-proceso', 'resuelto', 'cerrado'];
let applied = readFilters();
let report = null;
let busy = false;
let detailRequest = 0;
let pageSize = 1;
let resizeTimer;

function rowsThatFit() {
  const headerHeight = $('.tickets-table thead').getBoundingClientRect().height;
  const rowHeight = parseFloat(getComputedStyle($('.tickets-table')).getPropertyValue('--report-row-height'));
  return Math.max(1, Math.min(100, Math.floor((tableArea.clientHeight - headerHeight - 2) / rowHeight)));
}

function fitRows() {
  if (busy || !report) return;
  const size = rowsThatFit();
  if (size === pageSize) return;
  // Conserva visible el primer ticket al cambiar el tamaño de la ventana.
  const first = (report.pagina - 1) * report.por_pagina;
  pageSize = size;
  load(Math.floor(first / size) + 1);
}

function readFilters() {
  const params = new URLSearchParams({ periodo: periodFilter.value });
  if (stateFilter.value !== 'todos') params.set('estado', stateFilter.value);
  if (labFilter.value !== 'todos') params.set('id_aula', labFilter.value);
  return params;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function date(value) {
  if (!value) return '—';
  // SQLAlchemy devuelve fechas UTC sin sufijo cuando la columna no tiene zona.
  const utc = /Z$|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeZone: 'America/Hermosillo' }).format(new Date(utc));
}

function tableMessage(text) {
  const row = element('tr', '');
  const cell = element('td', '', text);
  cell.colSpan = 8;
  row.append(cell);
  $('#report-tickets').replaceChildren(row);
}

function clearData(text) {
  report = null;
  document.querySelectorAll('.kpi-value, .kpi-trend span').forEach((node) => { node.textContent = '—'; });
  $('.bar-chart-body').replaceChildren();
  $('.horizontal-chart-body').replaceChildren(element('p', 'chart-subtitle', text));
  tableMessage(text);
  $('#report-pages').replaceChildren();
  $('.pagination-text').textContent = text;
}

function render(data) {
  const values = [data.total, ...states.slice(0, 3).map((state) => data.estados[state])];
  document.querySelectorAll('.kpi-value').forEach((node, i) => { node.textContent = values[i]; });
  document.querySelectorAll('.kpi-trend span').forEach((node, i) => {
    if (data.anteriores === null) {
      node.textContent = i === 0 ? `${data.estados.Cerrado} cerrados` : 'Todo el historial';
      return;
    }
    const previous = i === 0 ? Object.values(data.anteriores).reduce((sum, n) => sum + n, 0) : data.anteriores[states[i - 1]] || 0;
    node.textContent = previous ? `${values[i] >= previous ? '+' : ''}${Math.round((values[i] - previous) / previous * 100)}% vs período anterior`
      : values[i] ? '0 tickets en el período anterior' : 'Sin tickets en ambos períodos';
  });
  const stateChart = $('.bar-chart-body');
  stateChart.replaceChildren();
  const maximum = Math.max(1, ...Object.values(data.estados));
  states.forEach((state, i) => {
    const col = element('div', 'bar-col');
    const count = data.estados[state];
    const pillar = element('div', `bar-pillar ${colors[i]}`);
    pillar.style.height = `${count / maximum * 118}px`;
    pillar.title = `${state}: ${count}`;
    col.append(element('span', `bar-value ${colors[i]}`, count), pillar, element('span', 'bar-label', state));
    stateChart.append(col);
  });
  const labChart = $('.horizontal-chart-body');
  labChart.replaceChildren();
  const labMaximum = Math.max(1, ...data.por_laboratorio.map((lab) => lab.total));
  data.por_laboratorio.forEach((lab, i) => {
    const row = element('div', 'h-bar-row');
    const track = element('div', 'h-bar-track');
    const fill = element('div', `h-bar-fill fill-aula-${i % 4 + 1}`);
    fill.style.width = `${lab.total / labMaximum * 100}%`;
    fill.title = `${lab.nombre}: ${lab.total} tickets`;
    track.append(fill);
    row.append(element('span', 'h-bar-label', lab.nombre), track, element('span', 'h-bar-value', lab.total));
    labChart.append(row);
  });
  if (!data.total) labChart.append(element('p', 'chart-subtitle', 'No hay incidencias en este período.'));
  const body = $('#report-tickets');
  body.replaceChildren();
  data.tickets.forEach((ticket, index) => {
    const row = element('tr', index % 2 ? 'row-alt' : '');
    const values = [id(ticket.id_ticket), ticket.nombre_ticket, ticket.nombre_aula, ticket.equipo || 'Sin equipo', ticket.estado, date(ticket.fecha_registro), ticket.nombre_tecnico || 'Sin asignar'];
    const classes = ['id', 'titulo', 'aula', 'equipo', 'estado', 'fecha', 'responsable'];
    values.forEach((value, i) => {
      const cell = element('td', `td-${classes[i]}`);
      if (i === 4) cell.append(element('span', `badge-status badge-${colors[states.indexOf(ticket.estado)]}`, value));
      else {
        const text = element('span', 'report-cell-text', value);
        text.title = value;
        cell.append(text);
      }
      row.append(cell);
    });
    const action = element('td', 'td-acciones');
    const button = element('button', 'btn-view-ticket');
    button.type = 'button';
    button.title = `Ver detalles ticket ${id(ticket.id_ticket)}`;
    button.setAttribute('aria-label', button.title);
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    button.addEventListener('click', () => showDetail(ticket));
    action.append(button);
    row.append(action);
    body.append(row);
  });
  if (!data.total) tableMessage('No se encontraron tickets con estos filtros.');
  const start = data.total ? (data.pagina - 1) * data.por_pagina + 1 : 0;
  $('.pagination-text').textContent = `Mostrando ${start}–${Math.min(data.pagina * data.por_pagina, data.total)} de ${data.total} tickets`;
  renderPages(data);
}

const id = (value) => `#${String(value).padStart(3, '0')}`;

function renderPages(data) {
  const pages = $('#report-pages');
  pages.replaceChildren();
  function add(label, page, disabled, active = false) {
    const button = element('button', `pagination-btn${active ? ' active' : ''}`, label);
    button.type = 'button';
    button.disabled = disabled;
    button.setAttribute('aria-label', label === '‹' ? 'Página anterior' : label === '›' ? 'Página siguiente' : `Página ${page}`);
    if (active) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => load(page));
    pages.append(button);
  }
  add('‹', data.pagina - 1, data.pagina === 1);
  const visible = [...new Set([1, data.pagina - 1, data.pagina, data.pagina + 1, data.paginas])].filter((page) => page >= 1 && page <= data.paginas).sort((a, b) => a - b);
  visible.forEach((page, index) => {
    if (index && page > visible[index - 1] + 1) pages.append(element('span', 'pagination-ellipsis', '…'));
    add(String(page), page, !data.total, page === data.pagina);
  });
  add('›', data.pagina + 1, data.pagina === data.paginas);
}

function setBusy(value) {
  busy = value;
  document.querySelectorAll('#apply-filters, #clear-filters, .filter-select, #report-pages button').forEach((node) => { node.disabled = value; });
  exportButton.disabled = value || !report?.total;
  $('.reportes-container').setAttribute('aria-busy', String(value));
}

async function load(page = 1) {
  if (busy) return;
  setBusy(true);
  clearData('Cargando tickets…');
  message.textContent = 'Cargando reportes…';
  try {
    const params = new URLSearchParams(applied);
    params.set('pagina', page);
    params.set('por_pagina', pageSize);
    report = await apiJson(`/reportes?${params}`);
    const selected = labFilter.value;
    labFilter.replaceChildren(new Option('Todos', 'todos'));
    report.laboratorios.forEach((lab) => labFilter.add(new Option(`${lab.nombre}${lab.activo === false ? ' (inactivo)' : ''}`, lab.id_aula)));
    labFilter.value = report.laboratorios.some((lab) => String(lab.id_aula) === selected) ? selected : 'todos';
    render(report);
    message.textContent = report.total ? '' : 'No se encontraron tickets con estos filtros.';
  } catch (error) {
    clearData('No se pudieron cargar los reportes.');
    message.textContent = `Error: ${error.message}. Usa Aplicar filtros para reintentar.`;
  } finally {
    setBusy(false);
    // renderPages establece los límites de navegación después de habilitar los controles.
    if (report) renderPages(report);
    requestAnimationFrame(fitRows);
  }
}

async function showDetail(row) {
  const request = ++detailRequest;
  $('#ticket-detail-title').textContent = `Detalle del ticket ${id(row.id_ticket)}`;
  $('#ticket-detail-fields').replaceChildren();
  $('#detail-message').textContent = 'Cargando detalle…';
  dialog.showModal();
  try {
    const ticket = await apiJson(`/tickets/${row.id_ticket}`);
    if (request !== detailRequest || !dialog.open) return;
    const fields = [['Título', ticket.nombre_ticket], ['Descripción', ticket.descripcion], ['Estado', ticket.estado], ['Aula', row.nombre_aula], ['Equipo', row.equipo || 'Sin equipo'], ['Fecha', date(ticket.fecha_registro)], ['Responsable', row.nombre_tecnico || 'Sin asignar'], ['Reportante', row.nombre_reportante]];
    fields.forEach(([label, value]) => $('#ticket-detail-fields').append(element('dt', '', label), element('dd', '', value)));
    $('#detail-message').textContent = '';
  } catch (error) {
    if (request === detailRequest && dialog.open) $('#detail-message').textContent = `No se pudo cargar el detalle: ${error.message}`;
  }
}

$('#close-detail').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { detailRequest++; });
$('#apply-filters').addEventListener('click', () => { applied = readFilters(); load(); });
$('#clear-filters').addEventListener('click', () => {
  stateFilter.value = labFilter.value = 'todos';
  periodFilter.value = 'ultimo-mes';
  applied = readFilters();
  load();
});
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitRows, 150);
}).observe(tableArea);
exportButton.addEventListener('click', async () => {
  if (busy || !report?.total) return;
  setBusy(true);
  message.textContent = 'Preparando exportación…';
  try {
    const response = await apiFetch(`/reportes/exportar?${applied}`);
    const url = URL.createObjectURL(await response.blob());
    const link = element('a', '');
    link.href = url;
    link.download = 'reportes.csv';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message.textContent = 'Se exportaron todos los tickets de los filtros aplicados.';
  } catch (error) {
    message.textContent = `No se pudo exportar: ${error.message}`;
  } finally {
    setBusy(false);
    if (report) renderPages(report);
  }
});

pageSize = rowsThatFit();
load();
