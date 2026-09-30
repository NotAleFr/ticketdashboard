# Computer Lab Ticket Management

A Vite frontend and FastAPI backend for reporting computer-lab incidents. Supabase Auth owns browser login and PostgreSQL stores application data; the frontend talks to the database only through FastAPI.

## Demo-ready flow

1. Sign in with a pre-provisioned Supabase Auth user that also has a matching `USUARIOS` profile.
2. The dashboard requests `GET /tickets/` with `Authorization: Bearer <access token>`.
3. Open **Ticket management**, create a ticket, select an active classroom, optional equipment, and one or more problem categories.
4. FastAPI validates the Supabase ES256 access token against the project's public JWKS, resolves the matching application profile, and validates the classroom/equipment relationship and categories before writing the ticket.

The current demo supports authenticated ticket listing, creation, filtering, and a responsive Spanish ticket UI. The complete technician-assignment, solution, audited-transition, close/reopen, and notification lifecycle described in ADR 0004 is planned work, not yet implemented or demonstrated.

## Run locally

### Prerequisites

- Python 3.11+ and Node.js 20+.
- A Supabase project with its PostgreSQL database and Auth enabled.
- A confirmed Supabase Auth user with a matching `USUARIOS` profile to exercise the browser flow.

Open two PowerShell terminals at the repository root. Start the backend first, then the frontend.

### Backend

Create a virtual environment, install dependencies, then copy and configure the local environment file:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt pytest
Copy-Item .env.example .env
```

Set these values in `backend/.env`:

```dotenv
DATABASE_URL=postgresql+psycopg2://postgres:[URL-ENCODED-PASSWORD]@[HOST]:[PORT]/postgres
SUPABASE_URL=https://[PROJECT-REF].supabase.co
```

Use the connection URI supplied by **Supabase Dashboard → Connect**. If the direct database host is unreachable on the local network, use the **Session Pooler** URI. URL-encode reserved password characters (for example, `@` becomes `%40`). Keep database credentials in the backend only.

Supabase's current ES256 access tokens are verified with the public JWKS published at `SUPABASE_URL/auth/v1/.well-known/jwks.json`; the backend does not need a JWT secret for that path. `SUPABASE_JWT_SECRET` remains an optional compatibility setting only for legacy HS256 tokens.

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Confirm it is running at `http://127.0.0.1:8000/test-db`.

### Frontend

In the second terminal, create `frontend/.env` with public browser configuration only:

```dotenv
# Local Vite development uses the proxy in frontend/vite.config.js.
VITE_API_URL=/api
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Never place the Supabase service-role key, database password, or JWT secret in this file. When the frontend is deployed separately from Vite, set `VITE_API_URL` to the public HTTPS FastAPI URL instead of `/api`.

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173`. Vite forwards local `/api/*` requests to FastAPI, so both processes must stay running during browser testing.

## Verify before testing in the browser

Run these commands from separate terminals after both dependency installs complete:

```powershell
# Backend
cd backend
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider

# Frontend
cd frontend
npm test -- --run
npm run build
```

For a presentation dataset, run the idempotent seed command in [Demo data](#demo-data) with the UUID of an existing confirmed Auth user. Then sign in through the browser and create a ticket.

## Authentication troubleshooting

A `401 Unauthorized` means FastAPI did not receive a valid bearer token. Verify that the frontend and backend point at the same Supabase project and that the backend can reach its JWKS endpoint. A valid Supabase Auth user without a matching `USUARIOS` profile receives `404`, which indicates that provisioning/seed data is incomplete rather than that the password is wrong.

## Demo data

Run the idempotent preparation script after creating a confirmed Supabase Auth user. It adds the two API-required profile fields when absent, ensures the roles, presentation classroom, equipment, and categories exist, links that existing Auth UUID as an Administrator profile, and creates two sample tickets. It never creates an Auth identity or prints credentials.

```powershell
cd backend
python scripts/prepare_demo_data.py --auth-user-id <UUID>
```

## Project layout

- `/frontend` — Vite client, Supabase session handling, and ticket UI.
- `/backend` — FastAPI endpoints, authorization, validation, and SQLAlchemy models.
- `/database` — Supabase schema.
- `/docs` — architecture, domain rules, and architecture decisions.
