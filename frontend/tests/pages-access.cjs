const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const usersPage = '/src/pages/gestion/usuarios';
const accounts = [
  { name: 'ADMIN', role: 1, leader: false },
  { name: 'TEACHER', role: 3, leader: false },
  { name: 'TECH', role: 2, leader: false },
  { name: 'LEADER', role: 2, leader: true },
];

async function assertStatus(request, path, status, headers) {
  const response = await request.get(path, { headers });
  assert.equal(response.status(), status, path);
}

async function checkAccount(context, account) {
  const page = await context.newPage();
  await page.goto('/');
  await page.locator('#email').fill(process.env[`SMOKE_${account.name}_EMAIL`]);
  await page.locator('#password').fill(process.env[`SMOKE_${account.name}_PASSWORD`]);
  const [profileResponse] = await Promise.all([
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/usuarios/me'),
    page.locator('#login-btn').click(),
  ]);
  assert.equal(profileResponse.status(), 200, 'signed-in profile');
  const profile = await profileResponse.json();
  assert.equal(profile.id_rol, account.role, 'backend role');
  assert.equal(Boolean(profile.is_leader), account.leader, 'backend leadership flag');
  assert.equal(profile.debe_cambiar_password, false, 'use a test account with onboarding complete');
  const authorization = await profileResponse.request().headerValue('authorization');
  assert.ok(authorization, 'browser sent its access token');
  const headers = { Authorization: authorization };

  const canManage = account.role === 1;
  await assertStatus(context.request, '/api/usuarios/administracion', canManage ? 200 : 403, headers);
  await assertStatus(context.request, '/api/tickets/', 200, headers);

  await page.goto(usersPage);
  await page.locator(canManage ? '.user-table-card' : '.not-allowed-card').waitFor({ state: 'visible' });
  if (!canManage) {
    await page.locator('.user-table-card').waitFor({ state: 'hidden' });
  }

  const outside = process.env.SMOKE_TEACHER_PRIVATE_TICKET_ID;
  if (outside && (account.name === 'ADMIN' || account.name === 'TEACHER')) {
    assert.match(outside, /^[1-9]\d*$/, 'private fixture ticket ID');
    const expected = canManage ? 200 : 404;
    await assertStatus(context.request, `/api/tickets/${outside}`, expected, headers);
    await assertStatus(context.request, `/api/tickets/${outside}/historial`, expected, headers);
  }
}

async function main() {
  const baseURL = process.env.SMOKE_BASE_URL;
  assert.ok(baseURL && URL.canParse(baseURL), 'Set SMOKE_BASE_URL to the Pages URL');
  if (process.env.SMOKE_ANONYMOUS_ONLY !== '1') {
    for (const { name } of accounts) {
      assert.ok(process.env[`SMOKE_${name}_EMAIL`] && process.env[`SMOKE_${name}_PASSWORD`],
        `Set SMOKE_${name}_EMAIL and SMOKE_${name}_PASSWORD`);
    }
  }

  const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL });
  let step = 'anonymous';
  try {
    const anonymous = await browser.newContext({ baseURL });
    try {
      await assertStatus(anonymous.request, '/api/usuarios/administracion', 401);
      await assertStatus(anonymous.request, '/api/reportes/exportar?periodo=todos', 401);
      const page = await anonymous.newPage();
      await page.goto(usersPage);
      await page.waitForURL(/\/src\/pages\/login\/login(?:\.html)?$/);
      await page.locator('#login-form').waitFor();
    } finally {
      await anonymous.close();
    }
    console.log('PASS anonymous access');
    if (process.env.SMOKE_ANONYMOUS_ONLY === '1') return;
    for (const account of accounts) {
      step = account.name;
      const context = await browser.newContext({ baseURL });
      try {
        await checkAccount(context, account);
        console.log(`PASS ${step} access`);
      } finally {
        await context.close();
      }
    }
  } catch (error) {
    const detail = error.code === 'ERR_ASSERTION' ? ` (${error.message})` : ` (${error.name})`;
    console.error(`FAIL access check at ${step}${detail}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error.code === 'ERR_ASSERTION' ? error.message : 'Could not start Playwright. Run npx playwright install chromium.');
  process.exitCode = 1;
});
