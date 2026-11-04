// Uses existing disposable test accounts; never changes their passwords or roles.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../docs/local/browser-check/node_modules/playwright');

(async () => {
  const accountFile = process.env.TEST_ACCOUNTS_FILE || path.resolve(__dirname, '../../docs/test-accounts.local.md');
  const accounts = fs.readFileSync(accountFile, 'utf8').split('\n')
    .filter(line => line.startsWith('|'))
    .map(line => [...line.matchAll(/`([^`]+)`/g)].map(match => match[1]))
    .filter(values => values.length === 2 && values[0].includes('@'));
  assert.equal(accounts.length, 4, 'Expected four disposable test accounts');
  const browser = await chromium.launch({channel: 'msedge', headless: true});
  let step = 'initialization';
  try {
    const seen = new Set();
    for (const [email, password] of accounts) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', () => errors.push('JavaScript error'));
        step = 'login';
        const base = process.env.DASHBOARD_BASE_URL || 'http://127.0.0.1:5175';
        await page.goto(`${base}/src/pages/login/login.html`);
        await page.waitForLoadState('networkidle');
        await page.locator('#email').fill(email);
        await page.locator('#password').fill(password);
        await page.locator('#login-btn').click();
        await page.waitForURL('**/dashboard.html');
        await page.waitForLoadState('networkidle');
        const user = await page.evaluate(async () => {
          const {apiJson} = await import('/src/api.js');
          const profile = await apiJson('/usuarios/me');
          return {role: profile.id_rol, leader: profile.is_leader};
        });
        seen.add(`${user.role}:${Boolean(user.leader)}`);
        step = `role=${user.role} leader=${Boolean(user.leader)}`;
        assert.equal(await page.locator('#admin-users-card').isVisible(), user.role === 1);
        assert.equal(await page.locator('#tickets-card').getAttribute('href'), user.role === 3
          ? './src/pages/gestion/nuevo.html' : './src/pages/gestion/gestion.html');
        await page.locator('#settings-button').click();
        await page.locator('#change-password-button').click();
        assert(await page.locator('#password-dialog').isVisible());
        await page.keyboard.press('Escape');
        await page.locator('#settings-button').click();
        await page.locator('#logout-button').click();
        await page.locator('#logout-dialog').getByRole('button', {name: 'Cancelar', exact: true}).click();
        assert(page.url().endsWith('/dashboard.html'));
        assert(await page.evaluate(async () => {
          const {supabaseClient} = await import('/src/auth/supabase.js');
          return Boolean((await supabaseClient.auth.getSession()).data.session);
        }));
        await page.locator('#settings-button').click();
        await page.locator('#logout-button').click();
        await page.locator('#confirm-logout-button').click();
        await page.waitForURL('**/login.html');
        assert(await page.evaluate(async () => {
          const {supabaseClient} = await import('/src/auth/supabase.js');
          return !(await supabaseClient.auth.getSession()).data.session;
        }));
        assert.deepEqual(errors, []);
        console.log(`PASS live ${step}: login, permissions, password dialog, cancel, logout and cleared session`);
      } finally { await context.close(); }
    }
    assert.deepEqual([...seen].sort(), ['1:false', '2:false', '2:true', '3:false']);
  } catch {
    // Avoid leaking credentials through automation error logs.
    console.error(`FAIL live check at ${step}`);
    process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(() => { console.error('Could not initialize live account checks'); process.exitCode = 1; });
