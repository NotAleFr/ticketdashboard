import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { apiFetch, apiJson } from '../../api.js';
import { renderHistory } from './ticket-history.js';

const $ = (selector) => document.querySelector(selector);
const stateFilter = $('#filtro-estado');
const labFilter = $('#filtro-laboratorio');
const periodFilter = $('#filtro-periodo');
const tableArea = $('.table-responsive');
const message = $('#report-message');
const exportButton = $('#export-report');
const dialog = $('#ticket-detail');
const filtersCard = $('.filters-card');
const retryButton = $('#apply-filters');
const periodToggle = $('#period-toggle');
const mainFiltersToggle = $('#main-filters-toggle');
const detailHistorySection = $('.detail-history');
const DEFAULT_PERIOD = 'ultimo-mes';
const states = ['Abierto', 'En Proceso', 'Resuelto', 'Cerrado'];
const colors = ['pendiente', 'en-proceso', 'resuelto', 'cerrado'];
let applied = readFilters();
let report = null;
let busy = false;
let detailRequest = 0;
let pageSize = 1;
let resizeTimer;
// Botón de paginación que tenía el foco: se recupera después de recargar la página.
let pendingFocus = null;

function rowsThatFit() {
  const headerHeight = $('.tickets-table thead').getBoundingClientRect().height;
  const rowHeight = parseFloat(getComputedStyle($('.tickets-table')).getPropertyValue('--report-row-height'));
  return Math.max(1, Math.min(100, Math.floor((tableArea.clientHeight - headerHeight - 2) / rowHeight)));
}

// Con la página llena, el alto que sobra (menos de una fila) se reparte entre las filas.
function stretchRows() {
  const rows = report?.tickets.length || 0;
  const full = rows && rows === pageSize && !tableArea.closest('.table-card').classList.contains('fits-content');
  if (!full) {
    tableArea.style.removeProperty('--report-fill-height');
    return;
  }
  const headerHeight = $('.tickets-table thead').getBoundingClientRect().height;
  tableArea.style.setProperty('--report-fill-height', `${Math.floor((tableArea.clientHeight - headerHeight - 2) / rows)}px`);
}

function fitRows() {
  if (busy || !report) return;
  // La tarjeta encogida ya muestra todo; medirla achicaría la página sin motivo.
  if (tableArea.closest('.table-card').classList.contains('fits-content')) return stretchRows();
  const size = rowsThatFit();
  if (size === pageSize) return stretchRows();
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

const shortDate = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeZone: 'America/Hermosillo' });
const longDate = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Hermosillo' });

// SQLAlchemy devuelve fechas UTC sin sufijo ("2026-10-22T02:00:00") cuando la columna no tiene
// zona: se leen como UTC. Una fecha faltante o inválida se muestra como "—", porque format()
// lanzaría RangeError y dejaría la página sin datos.
function formatDate(formatter, value) {
  const text = String(value ?? '').trim();
  const naive = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text);
  const parsed = new Date(naive ? `${text.replace(' ', 'T')}Z` : text);
  return text && !Number.isNaN(parsed.getTime()) ? formatter.format(parsed) : '—';
}

const date = (value) => formatDate(shortDate, value);

function tableMessage(text) {
  const row = element('tr', '');
  const cell = element('td', '', text);
  cell.colSpan = 7;
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
    // Toda la fila abre el detalle (clic, Enter o espacio).
    row.classList.add('report-row');
    row.tabIndex = 0;
    row.setAttribute('aria-label', `Ver detalle del ticket ${id(ticket.id_ticket)}: ${ticket.nombre_ticket}`);
    row.addEventListener('click', () => showDetail(ticket));
    row.addEventListener('keydown', (event) => {
      if (['Enter', ' '].includes(event.key)) { event.preventDefault(); showDetail(ticket); }
    });
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
    button.addEventListener('click', () => {
      pendingFocus = button.getAttribute('aria-label');
      load(page);
    });
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
    // Con todos los tickets en una página, la tarjeta se ajusta a su contenido (sin hueco vacío).
    tableArea.closest('.table-card').classList.toggle('fits-content', report.total <= pageSize);
    message.textContent = report.total ? '' : 'No se encontraron tickets con estos filtros.';
    retryButton.hidden = true;
  } catch (error) {
    clearData('No se pudieron cargar los reportes.');
    message.textContent = `Error: ${error.message}.`;
    retryButton.hidden = false;
  } finally {
    setBusy(false);
    // renderPages establece los límites de navegación después de habilitar los controles.
    if (report) renderPages(report);
    restorePaginationFocus();
    requestAnimationFrame(fitRows);
  }
}

function restorePaginationFocus() {
  if (!pendingFocus) return;
  const buttons = [...document.querySelectorAll('#report-pages button')];
  const same = buttons.find((button) => button.getAttribute('aria-label') === pendingFocus && !button.disabled);
  (same || buttons.find((button) => button.getAttribute('aria-current') === 'page'))?.focus();
  pendingFocus = null;
}

const dateTime = (value) => formatDate(longDate, value);

// /tickets/{id} trae el estado actual; los nombres se toman de ahí cuando vienen y, si no,
// se deducen de los ids actuales para no mezclar datos viejos de la fila con el estado nuevo.
function detailFields(ticket, row) {
  const has = (key) => ticket[key] !== undefined;
  const lab = report?.laboratorios.find((item) => item.id_aula === ticket.id_aula);
  const aula = has('nombre_aula') ? ticket.nombre_aula
    : lab?.nombre ?? (ticket.id_aula === row.id_aula ? row.nombre_aula : null);
  const equipo = has('equipo_identificador') ? ticket.equipo_identificador
    : has('equipo') ? ticket.equipo
      : ticket.id_equipo == null ? null : row.equipo || 'Asignado';
  const tecnico = has('nombre_tecnico') ? ticket.nombre_tecnico
    : ticket.id_tecnico == null ? null : row.nombre_tecnico || 'Asignado';
  return {
    aula: aula || '—',
    equipo: equipo || 'Sin equipo',
    tecnico: tecnico || 'Sin asignar',
    reportante: (has('nombre_reportante') ? ticket.nombre_reportante : row.nombre_reportante) || '—',
  };
}

async function showDetail(row) {
  const request = ++detailRequest;
  $('#ticket-detail-title').textContent = `Detalle del ticket ${id(row.id_ticket)}`;
  $('#ticket-detail-fields').replaceChildren();
  detailHistorySection.hidden = true;
  $('#detail-message').textContent = 'Cargando detalle…';
  dialog.showModal();
  try {
    // Si solo falla el historial, el detalle del ticket se muestra igual.
    const [ticket, events] = await Promise.all([
      apiJson(`/tickets/${row.id_ticket}`),
      apiJson(`/tickets/${row.id_ticket}/historial`).catch((error) => error),
    ]);
    if (request !== detailRequest || !dialog.open) return;
    const names = detailFields(ticket, row);
    const status = element('span', `badge-status badge-${colors[states.indexOf(ticket.estado)]}`, ticket.estado);
    const categories = element('span', 'detail-chips');
    (ticket.problemas?.length ? ticket.problemas : ['Sin categoría']).forEach((name) => {
      categories.append(element('span', 'detail-chip', name));
    });
    const fields = [['Título', ticket.nombre_ticket], ['Descripción', ticket.descripcion], ['Estado', status], ['Categorías', categories], ['Aula', names.aula], ['Equipo', names.equipo], ['Fecha', date(ticket.fecha_registro)], ['Responsable', names.tecnico], ['Reportante', names.reportante]];
    fields.forEach(([label, value]) => {
      const dd = element('dd', '');
      if (value instanceof Node) dd.append(value);
      else dd.textContent = value;
      $('#ticket-detail-fields').append(element('dt', '', label), dd);
    });
    if (events instanceof Error) {
      $('#detail-history').replaceChildren(element('li', 'detail-history-error', `No se pudo cargar el historial: ${events.message}`));
    } else renderHistory($('#detail-history'), events, dateTime);
    detailHistorySection.hidden = false;
    $('#detail-message').textContent = '';
  } catch (error) {
    if (request === detailRequest && dialog.open) $('#detail-message').textContent = `No se pudo cargar el detalle: ${error.message}`;
  }
}

$('#close-detail').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { detailRequest++; });
// Los filtros se aplican en cuanto cambian (los selects se desactivan mientras carga).
function applyFilters() {
  applied = readFilters();
  updateFilterIndicators();
  load();
}

// En el celular los filtros viven detrás de dos botones; un punto avisa si hay alguno activo.
function updateFilterIndicators() {
  periodToggle.querySelector('.filters-toggle__dot').hidden = periodFilter.value === DEFAULT_PERIOD;
  mainFiltersToggle.querySelector('.filters-toggle__dot').hidden =
    stateFilter.value === 'todos' && labFilter.value === 'todos';
}

function togglePanel(button, className) {
  const open = !filtersCard.classList.contains(className);
  filtersCard.classList.toggle(className, open);
  button.setAttribute('aria-expanded', String(open));
  return open;
}

[stateFilter, labFilter, periodFilter].forEach((select) => select.addEventListener('change', applyFilters));
retryButton.addEventListener('click', () => load());
periodToggle.addEventListener('click', () => {
  if (togglePanel(periodToggle, 'show-period')) periodFilter.focus();
});
mainFiltersToggle.addEventListener('click', () => {
  if (togglePanel(mainFiltersToggle, 'show-main')) stateFilter.focus();
});
$('#clear-filters').addEventListener('click', () => {
  stateFilter.value = labFilter.value = 'todos';
  periodFilter.value = DEFAULT_PERIOD;
  applyFilters();
});
new ResizeObserver(() => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitRows, 150);
}).observe(tableArea);
// Nombre con la fecha local para no pisar exportaciones anteriores.
function exportFileName() {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Hermosillo' }).format(new Date());
  return `reportes-${day}.csv`;
}

function downloadCsv(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = element('a', '');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revocar enseguida puede cortar la descarga en navegadores lentos.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// El WebView de Android ignora <a download>: el CSV se guarda en caché y se abre el menú de
// compartir (Drive, Archivos, correo…). Devuelve false si el usuario cierra el menú.
async function shareCsv(response, fileName) {
  let data = await response.text();
  // text() descarta el BOM UTF-8 que manda el backend; Excel lo necesita para leer los acentos.
  const bom = String.fromCharCode(0xfeff);
  if (!data.startsWith(bom)) data = bom + data;
  const { uri } = await Filesystem.writeFile({ path: fileName, data, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: 'Reporte de tickets', files: [uri], dialogTitle: 'Guardar o enviar el reporte' });
  } catch (error) {
    if (/cancel/i.test(error?.message || '')) return false;
    throw error;
  }
  return true;
}

exportButton.addEventListener('click', async () => {
  if (busy || !report?.total) return;
  setBusy(true);
  message.textContent = 'Preparando exportación…';
  try {
    const response = await apiFetch(`/reportes/exportar?${applied}`);
    const fileName = exportFileName();
    let done = true;
    if (Capacitor.isNativePlatform()) done = await shareCsv(response, fileName);
    else downloadCsv(await response.blob(), fileName);
    message.textContent = done ? 'Se exportaron todos los tickets de los filtros aplicados.' : '';
  } catch (error) {
    message.textContent = `No se pudo exportar: ${error.message}`;
  } finally {
    setBusy(false);
    if (report) renderPages(report);
    // Un cambio de tamaño durante la exportación se ignoró por estar ocupado: se recalcula ahora.
    requestAnimationFrame(fitRows);
  }
});

pageSize = rowsThatFit();
load();
