// Live smoke check. Sends one recovery email only when LIVE_RECOVERY_EMAIL is set.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '../../docs/local/browser-check/node_modules/playwright');

(async () => {
  const base = process.env.RECOVERY_BASE_URL || 'http://127.0.0.1:5175';
  const output = path.resolve(__dirname, '../../docs/verification/recovery');
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(`${base}/src/pages/login/login.html`);
    await page.locator('a[href="./recuperar.html"]').waitFor();
    await page.screenshot({ path: path.join(output, '01-login.png'), fullPage: true });
    await page.locator('a[href="./recuperar.html"]').click();
    await page.waitForLoadState('networkidle');
    await page.locator('#recovery-form').waitFor();
    await page.screenshot({ path: path.join(output, '02-recovery-form.png'), fullPage: true });
    if (process.env.LIVE_RECOVERY_EMAIL) {
      await page.locator('#email').fill(process.env.LIVE_RECOVERY_EMAIL);
      const pending = page.waitForResponse(response => response.url().endsWith('/auth/recovery'));
      await page.locator('#recovery-btn').click();
      const response = await pending;
      await page.waitForFunction(() => !document.querySelector('#recovery-btn').disabled);
      await page.screenshot({ path: path.join(output, '03-email-request-result.png'), fullPage: true });
      console.log(JSON.stringify({ step: 'live-email-request', status: response.status(), result: await response.json() }));
      assert.equal(response.status(), 200);
      assert(await page.locator('#recovery-success').isVisible());
    }
    await page.goto(`${base}/src/pages/login/nueva-contrasena.html#error=access_denied&error_code=otp_expired`);
    await page.locator('#reset-invalid').waitFor({ state: 'visible' });
    assert(await page.locator('#reset-form').isHidden());
    await page.screenshot({ path: path.join(output, '04-expired-link.png'), fullPage: true });
    assert.deepEqual(pageErrors, []);
    console.log('PASS: recovery navigation, live request (when configured), expired-link handling, no page errors');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
