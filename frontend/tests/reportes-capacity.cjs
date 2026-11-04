const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../docs/local/browser-check/node_modules/playwright');

(async () => {
  const root = path.resolve(__dirname, '../..');
  const accounts = fs.readFileSync(path.join(root, 'docs/test-accounts.local.md'), 'utf8');
  const admin = accounts.split('\n').find(line => line.includes('| Administrador |'));
  const [email, password] = [...admin.matchAll(/`([^`]+)`/g)].map(match => match[1]);
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/src/pages/login/login.html');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('#login-btn').click();
    await page.waitForURL('**/dashboard.html');
    await page.locator('#reports-card').click();
    await page.locator('#report-tickets .btn-view-ticket').first().waitFor();
    assert.equal(await page.locator('#page-size').count(), 0);
    assert(!(await page.locator('.kpi-trend').allTextContents()).some(text => text.includes('Sin base')));

    async function checkSize(width, height, filename) {
      await page.setViewportSize({ width, height });
      await page.waitForFunction(() => {
        const area = document.querySelector('.table-responsive');
        const header = document.querySelector('thead').getBoundingClientRect().height;
        const capacity = Math.max(1, Math.min(100, Math.floor((area.clientHeight - header - 2) / 45)));
        const match = document.querySelector('.pagination-text').textContent.match(/Mostrando (\d+)–(\d+) de (\d+)/);
        if (!match || document.querySelector('main').getAttribute('aria-busy') === 'true') return false;
        const [, first, last, total] = match.map(Number);
        const onLastPage = last === total;
        return last - first + 1 === capacity || (onLastPage && last - first + 1 <= capacity);
      });
      await page.waitForTimeout(400); // Also catches resize/request loops after layout settles.
      const result = await page.evaluate(() => {
        const area = document.querySelector('.table-responsive');
        const header = document.querySelector('thead').getBoundingClientRect().height;
        const rows = [...document.querySelectorAll('#report-tickets tr')];
        return {
          viewport: [innerWidth, innerHeight],
          capacity: Math.max(1, Math.min(100, Math.floor((area.clientHeight - header - 2) / 45))),
          rows: rows.length,
          pagination: document.querySelector('.pagination-text').textContent,
          clipped: rows.some(row => row.getBoundingClientRect().bottom > area.getBoundingClientRect().bottom + 1),
          pageOverflow: document.documentElement.scrollWidth > innerWidth,
          cardsOverflow: [...document.querySelectorAll('.chart-card, .table-card')].some(card => card.getBoundingClientRect().right > innerWidth),
          busy: document.querySelector('main').getAttribute('aria-busy'),
        };
      });
      assert.equal(result.clipped, false);
      assert.equal(result.pageOverflow, false);
      assert.equal(result.cardsOverflow, false);
      assert.equal(result.busy, 'false');
      await page.screenshot({ path: path.join(root, 'docs/verification/reportes', filename), fullPage: true });
      console.log(JSON.stringify(result));
      return result;
    }

    const small = await checkSize(1280, 800, 'adaptive-desktop.png');
    const tall = await checkSize(1440, 1080, 'adaptive-tall.png');
    assert(tall.capacity > small.capacity);
    await checkSize(1280, 600, 'adaptive-short.png');
    await page.getByRole('button', { name: 'Página siguiente', exact: true }).click();
    await page.waitForFunction(() => {
      const match = document.querySelector('.pagination-text').textContent.match(/Mostrando (\d+)–/);
      return match && Number(match[1]) > 1 && document.querySelector('main').getAttribute('aria-busy') === 'false';
    });
    const before = Number((await page.locator('.pagination-text').textContent()).match(/Mostrando (\d+)/)[1]);
    const resized = await checkSize(1280, 800, 'adaptive-resized-page.png');
    const [, first, last] = resized.pagination.match(/Mostrando (\d+)–(\d+)/).map(Number);
    assert(first <= before && last >= before, 'Resizing must retain the first visible ticket');
    await page.locator('#clear-filters').click();
    await checkSize(390, 844, 'adaptive-mobile.png');
    await checkSize(320, 568, 'adaptive-small-mobile.png');

    await page.locator('#filtro-estado').selectOption('En Proceso');
    await page.locator('#apply-filters').click();
    await page.locator('#report-message').getByText('No se encontraron tickets con estos filtros.', { exact: true }).waitFor();
    assert(await page.locator('#export-report').isDisabled());
    await page.screenshot({ path: path.join(root, 'docs/verification/reportes/adaptive-empty.png'), fullPage: true });
    await page.locator('#clear-filters').click();
    await page.locator('#export-report').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#export-report').disabled);
    const download = page.waitForEvent('download');
    await page.locator('#export-report').click();
    const file = await download;
    assert.equal(file.suggestedFilename(), 'reportes.csv');
    const csv = fs.readFileSync(await file.path(), 'utf8');
    assert(csv.includes('Título,Aula,Equipo,Estado,Fecha,Responsable,Reportante'));
    assert.deepEqual(errors, []);
    console.log('PASS: automatic capacity, resize navigation, desktop/mobile, empty state and export');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
