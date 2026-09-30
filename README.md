# Sistema Web de Gestión de Tickets para Laboratorios de Cómputo

Sistema de gestión de tickets para el soporte técnico de los laboratorios de cómputo. El frontend usa Supabase Auth para iniciar sesión y FastAPI para acceder a PostgreSQL en Supabase.

### Backend (`/backend`)

- Python, FastAPI y SQLAlchemy.
- PostgreSQL y Auth en el proyecto compartido de Supabase.

### Frontend (`/frontend`)

- Vite, HTML, CSS y JavaScript.
- El proxy local `/api` reenvía las peticiones a FastAPI.

## Inicio local

Solicita al equipo los valores actuales de los archivos `.env`; no los agregues al repositorio ni los compartas en mensajes.
Abre dos terminales de PowerShell desde la raíz del repositorio.

### 1. Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt pytest
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

En `backend/.env` configura los valores proporcionados por el equipo:

```dotenv
DATABASE_URL=postgresql+psycopg2://...
SUPABASE_URL=https://[PROJECT-REF].supabase.co
```

Inicia la API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Confirma que responde en `http://127.0.0.1:8000/test-db`.

### 2. Frontend

En la segunda terminal:

```powershell
cd frontend
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev -- --host 127.0.0.1
```

En `frontend/.env` usa el proyecto compartido de Supabase y conserva esta ruta local:

```dotenv
VITE_API_URL=/api
VITE_SUPABASE_URL=https://[PROJECT-REF].supabase.co
VITE_SUPABASE_ANON_KEY=...
```

Abre `http://127.0.0.1:5173`. Mantén backend y frontend encendidos durante las pruebas.

## Pruebas

```powershell
# Backend
cd backend
.\.venv\Scripts\python.exe -m pytest -q -p no:cacheprovider

# Frontend
cd frontend
npm test -- --run
npm run build
```

## Datos compartidos de Supabase

- Usa una cuenta de Auth confirmada que tenga un perfil correspondiente en `USUARIOS`.

## Alcance actual

La demo permite iniciar sesión, listar y filtrar tickets, y crear tickets con aula, equipo opcional y categorías. La asignación de técnicos, soluciones, transiciones auditadas, cierre/reapertura y notificaciones siguen pendientes.

## Estructura del proyecto

- `/frontend` - Aplicación cliente.
- `/backend` - API REST y lógica de negocio.
- `/docs` - Arquitectura y reglas de negocio.
