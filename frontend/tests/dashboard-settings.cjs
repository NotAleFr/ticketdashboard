// Deterministic browser checks: simulated API/Auth failures never change real accounts.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../docs/local/browser-check/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const profile of [
      { role: 1, leader: false, label: 'admin' },
      { role: 2, leader: false, label: 'soporte' },
      { role: 2, leader: true, label: 'soporte' },
      { role: 3, leader: false, label: 'docente' },
    ]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/src/api.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `export async function apiJson(path, options) {
        if(path === '/usuarios/me') return ${JSON.stringify({id_rol: profile.role, is_leader: profile.leader})};
        if(path !== '/auth/password' || options.method !== 'PUT') throw Error('Unexpected API');
        window.passwordCalls = (window.passwordCalls || 0) + 1;
        await new Promise(resolve => window.releasePassword = resolve);
        if(window.failPassword) throw Error('No se pudo conectar. Intenta de nuevo.');
        return {message: 'OK'};
      }`,
    }));
    await page.route('**/src/auth/supabase.js', route => route.fulfill({
      contentType: 'application/javascript',
      body: `export const supabaseClient = {auth: {async signOut(options) {
        window.logoutScope = options.scope;
        window.logoutCalls = (window.logoutCalls || 0) + 1;
        await new Promise(resolve => window.releaseLogout = resolve);
        return {error: window.failLogout ? Error('Sin conexion') : null};
      }}};`,
    }));
    const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5175';
    await page.goto(`${base}/dashboard.html`);
    await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#dashboard-role-label').textContent(), profile.label);
    assert.equal(await page.locator('#admin-users-card').isVisible(), profile.role === 1);
    assert.equal(await page.locator('#tickets-card').getAttribute('href'), profile.role === 3
      ? './src/pages/gestion/nuevo.html' : './src/pages/gestion/gestion.html');
    const settings = page.locator('#settings-button');
    const panel = page.locator('#settings-panel');
    const passwordDialog = page.locator('#password-dialog');
    const logoutDialog = page.locator('#logout-dialog');
    async function openPassword() {
      await settings.click();
      await page.locator('#change-password-button').click();
    }
    await settings.focus();
    await page.keyboard.press('Enter');
    assert.equal(await settings.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').getAttribute('id'), 'change-password-button');
    await page.keyboard.press('Escape');
    assert(await panel.isHidden());
    assert(await settings.evaluate(el => el === document.activeElement));
    await settings.click();
    await page.locator('#dashboard-role-label').click();
    assert(await panel.isHidden());

    await openPassword();
    assert(await passwordDialog.isVisible());
    assert.equal(await page.locator(':focus').getAttribute('id'), 'account-new-password');
    await page.locator('#account-new-password').fill('short');
    await page.locator('#account-confirm-password').fill('short');
    await page.locator('#save-password-button').click();
    assert.equal(await page.evaluate(() => window.passwordCalls || 0), 0);
    await page.locator('#account-new-password').fill('FixturePassword1');
    await page.locator('#account-confirm-password').fill('FixturePassword2');
    await page.locator('#save-password-button').click();
    assert.equal(await page.evaluate(() => window.passwordCalls || 0), 0);
    assert(await page.locator('#account-confirm-password').evaluate(el => !el.validity.valid));
    await page.locator('#account-confirm-password').fill('FixturePassword1');
    await page.evaluate(() => window.failPassword = true);
    await page.locator('#save-password-button').click();
    await page.waitForFunction(() => !!window.releasePassword);
    assert(await page.locator('#save-password-button').isDisabled());
    await page.keyboard.press('Escape');
    assert(await passwordDialog.isVisible());
    await page.evaluate(() => window.releasePassword());
    await page.locator('#password-error').waitFor({state: 'visible'});
    assert(await page.locator('#save-password-button').isEnabled());
    await page.evaluate(() => { window.failPassword = false; window.releasePassword = null; });
    await page.locator('#save-password-button').click();
    await page.waitForFunction(() => !!window.releasePassword);
    await page.evaluate(() => window.releasePassword());
    await page.locator('#password-success').waitFor({state: 'visible'});
    assert.equal(await page.locator('#account-new-password').inputValue(), '');
    await passwordDialog.getByRole('button', {name: 'Volver al panel'}).click();
    await openPassword();
    assert(await page.locator('#password-success').isHidden());
    await page.keyboard.press('Escape');
    assert(await passwordDialog.isHidden());

    await settings.click();
    await page.locator('#logout-button').click();
    assert(await logoutDialog.isVisible());
    assert.equal(await page.locator(':focus').textContent(), 'Cancelar');
    await logoutDialog.getByRole('button', {name: 'Cancelar', exact: true}).click();
    assert.equal(await page.evaluate(() => window.logoutCalls || 0), 0);
    await settings.click();
    await page.locator('#logout-button').click();
    await page.evaluate(() => window.failLogout = true);
    await page.locator('#confirm-logout-button').click();
    await page.waitForFunction(() => !!window.releaseLogout);
    await page.keyboard.press('Escape');
    assert(await logoutDialog.isVisible());
    await page.evaluate(() => window.releaseLogout());
    await page.locator('#logout-error').waitFor({state: 'visible'});
    assert(await page.locator('#confirm-logout-button').isEnabled());
    assert.equal(await page.evaluate(() => window.logoutScope), 'local');
    await page.keyboard.press('Escape');

    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568]]) {
      await page.setViewportSize({width, height});
      await settings.click();
      const bounds = await panel.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
      await page.locator('#change-password-button').click();
      const dialogBounds = await passwordDialog.boundingBox();
      assert(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= width);
      assert(dialogBounds.y >= 0 && dialogBounds.y + dialogBounds.height <= height);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.keyboard.press('Tab');
      assert(await passwordDialog.evaluate(el => el.contains(document.activeElement)));
      await page.keyboard.press('Escape');
    }
    await settings.click();
    await page.locator('#logout-button').click();
    await page.evaluate(() => { window.failLogout = false; window.releaseLogout = null; });
    await page.locator('#confirm-logout-button').click();
    await page.waitForFunction(() => !!window.releaseLogout);
    await page.evaluate(() => window.releaseLogout());
    await page.waitForURL('**/login.html');
    assert.deepEqual(errors, []);
    console.log(`PASS role=${profile.role} leader=${profile.leader}: permissions, keyboard, validation, error/retry/success, cancel/confirm logout and responsive layout`);
    await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
