# Sistema Web de Gestión de Tickets para Laboratorios de Cómputo
Sistema de gestión de tickets diseñado para administrar el soporte técnico en los laboratorios de cómputo. Permite la creación, asignación y seguimiento de incidencias.

### Backend (`/backend`)
- **Lenguaje:** Python
- **Framework:** FastAPI
- **ORM:** SQLAlchemy
- **Base de Datos:** PostgreSQL (via Supabase)
- **Autenticación:** Supabase Auth

### Frontend (`/frontend`)
- **Herramienta de Build:** Vite
- **Tecnologías Base:** HTML, CSS, JavaScript (Vanilla)

## Estructura del Proyecto

Android (Capacitor): [configuracion y comandos de desarrollo](docs/android.md).

- `/frontend` - Aplicación cliente.
- `/backend` - API REST y lógica de negocio.

[Guía de despliegue gratuito en Cloudflare](docs/cloudflare.md).

## Ejecución local

Requisitos: Python 3.10+, Node.js 20.19+ o 22.12+.

Backend (`http://127.0.0.1:8000`):

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt   # Linux/macOS: .venv/bin/pip
copy .env.example .env                          # Linux/macOS: cp; completar valores
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend (`http://127.0.0.1:5173`):

```bash
cd frontend
npm ci
copy .env.example .env                          # Linux/macOS: cp; completar valores
npm run dev -- --host 127.0.0.1 --port 5173
```

Abrir `http://127.0.0.1:5173`.
