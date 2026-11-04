# API-57 password recovery verification

Implementation and browser checks were performed in `D:/Ale Code/API 2 - Copy`
on `feature/api-57-recuperacion`, based on `0b3ff24`.

## Implemented

- `POST /auth/recovery` requests a Supabase recovery email with a server-configured redirect.
- `PUT /auth/password` uses the authenticated user's Supabase token to update the password,
  then clears `usuarios.debe_cambiar_password`.
- Recovery and new-password pages call FastAPI. Supabase still validates the email link
  and establishes the recovery session in the browser.
- Upstream errors and password validation responses do not expose passwords or upstream details.
- A failed profile commit explicitly reports that the password already changed.

## Automated verification

From `backend`:

```powershell
.venv/Scripts/python.exe -m pytest tests_admin/test_password_recovery.py tests_admin/test_usuarios_admin.py -q
```

Result: **41 passed**. Includes 17 recovery cases and the existing administration cases.
Supabase responses are mocked in these isolated backend tests; SQLite is used for profiles.

From `frontend`, `npm run build` passed.

Live FastAPI checks rejected invalid email with HTTP 422 and an unauthenticated
password update with HTTP 401.

## Live email and browser verification

Frontend: `http://127.0.0.1:5175`; FastAPI: `http://127.0.0.1:8000`.
Vite proxies `/api` to FastAPI, so no extra CORS origin is needed for this preview.
The ignored backend `.env` contains the public Auth key and the port-5175 reset redirect.

The user-authorized test account was provisioned as role 1 (administrator), with
matching Supabase identity and application profile. The random initial credential
is kept only in ignored `docs/local/api57-test-account.json`.

The browser submitted a real recovery request through FastAPI to Supabase and
received HTTP 200. Supabase's account metadata recorded `recovery_sent_at` as
`2026-10-21T06:47:09.335068Z`.

Screenshots:

- `01-login.png`: navigation entry.
- `02-recovery-form.png`: recovery form.
- `03-email-request-result.png`: successful real recovery request.
- `04-expired-link.png`: invalid/expired link state, exercised with an explicit error URL.
- `05-valid-email-link.png`: recipient-provided screenshot of the actual email link
  opening the new-password form in their browser.
- `06-login-with-new-password.png`: browser login using the new password (masked input).
- `07-dashboard-success.png`: dashboard after successful real Supabase login.

The browser check reported no uncaught page errors. The T3 snapshot host timed out
twice, so screenshots were captured using the repository's Playwright/Edge setup.

To run navigation and expired-link checks without sending an email:

```powershell
node frontend/tests/password-recovery.cjs
```

To additionally send one real recovery email, set `LIVE_RECOVERY_EMAIL` to the
authorized disposable account before running that command. Optional variables:
`RECOVERY_BASE_URL` and `PLAYWRIGHT_PATH`.

## Completed end-to-end verification

The recipient confirmed receipt, opened the delivered link, supplied a screenshot
of the valid reset form, and confirmed saving the new password redirected to login.
The agent did not access the recipient's inbox or enter their new password in the reset form.

Subsequent live checks passed:

- Supabase password login with the new credential returned HTTP 200.
- FastAPI `/usuarios/me` returned role 1 and `debe_cambiar_password=false`.
- An authenticated password-update request with seven characters returned HTTP 422
  without modifying the password.
- The original temporary password returned HTTP 400 / `invalid_credentials`.
- A separate Playwright/Edge browser logged in with the new credential, opened the
  dashboard and confirmed the administrator profile and cleared password-change flag.
- The verification browser signed out successfully.

The actual reset submission and its immediate success message occurred in the
recipient's browser, outside the automation connection. There is no agent-captured
screenshot of that short-lived success message; the recipient's confirmation and
the subsequent live login/profile checks establish that the change succeeded.

No secrets, access tokens, or initial passwords are included in these screenshots
or this report. Verification credentials remain only in the ignored local file.
