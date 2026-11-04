// API fixtures keep verification independent of credentials and database writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../docs/local/browser-check/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ timezoneId: 'America/Hermosillo' });
    const dates = ['2026-10-21T06:59:59Z', '2026-10-21T07:00:00Z',
      '2026-10-22T06:59:59.999Z', '2026-10-22T07:00:00Z', null, 'invalid'];
    const tickets = dates.map((fecha_registro, i) => ({
      id_ticket: i + 1, fecha_registro, nombre_ticket: 'Mouse', descripcion: 'Fixture',
      id_aula: 1, estado: i === 2 ? 'Cerrado' : 'Abierto',
    }));
    await page.route('**/src/api.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `export async function apiJson(path) {
        if (path === '/usuarios/me') return {id_rol: 1};
        if (path === '/tickets/') return ${JSON.stringify(tickets)};
        throw Error('Unexpected API call');
      }`,
    }));
    await page.goto(`${process.env.GESTION_BASE_URL || 'http://127.0.0.1:5175'}/src/pages/gestion/gestion.html`);
    await page.waitForLoadState('networkidle');
    const range = page.locator('#date-range-filter');
    async function expectIds(expected) {
      assert.deepEqual(await page.locator('#tickets-body tr').evaluateAll(rows =>
        rows.map(row => Number(row.dataset.ticketId)).sort((a, b) => a - b)), expected);
    }
    async function choose(start, end) {
      await range.click();
      await range.evaluate(input => input._flatpickr.jumpToDate(new Date(2026, 9, 1)));
      const days = page.locator('.flatpickr-calendar.open .flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)');
      await days.getByText(String(start), {exact: true}).click();
      await days.getByText(String(end), {exact: true}).click();
    }
    await expectIds([1, 2, 3, 4, 5, 6]);
    await choose(21, 21);
    await expectIds([2, 3]); // Includes midnight and the entire last day.
    await page.locator('#status-filter').selectOption('Cerrado');
    await expectIds([3]);
    await page.locator('#ticket-search').fill('missing');
    await expectIds([]);
    await page.locator('#ticket-search').fill('');
    await page.locator('#status-filter').selectOption('');
    await page.locator('#clear-date-range').click();
    await choose(22, 20);
    await expectIds([1, 2, 3, 4]);
    await page.locator('#clear-date-range').click();
    await expectIds([1, 2, 3, 4, 5, 6]);
    for (const [width, height] of [[1440, 1000], [1280, 800], [390, 844], [320, 568]]) {
      await page.setViewportSize({width, height});
      await range.click();
      const calendar = await page.locator('.flatpickr-calendar.open').boundingBox();
      assert(calendar.x >= 0 && calendar.x + calendar.width <= width);
      await range.press('Escape');
      assert(await page.evaluate(() => Math.abs(
        document.querySelector('#ticket-search').getBoundingClientRect().right
        - document.querySelector('.ticket-table-card').getBoundingClientRect().right) < 2));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    console.log('PASS: inclusive dates, reversed range, combined filters, clear and responsive layout');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
