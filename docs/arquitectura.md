# Arquitectura del Sistema (API II)

Este documento describe la arquitectura técnica, diseño de capas, interacción entre servicios y convenciones de desarrollo del Sistema de Gestión de Tickets.

---

## 1. Stack Tecnológico y Responsabilidades

El sistema se estructura en tres componentes principales:

1. **Frontend (`/frontend`):**
   - **Tecnologías:** HTML5, CSS3, JavaScript Vanilla (ES Modules) con **Vite**.
   - **Función:** Interfaz gráfica para inicio de sesión, panel y creación/listado de tickets. Gestiona la sesión mediante el cliente de Supabase Auth y se comunica con el backend mediante peticiones HTTP autenticadas.

2. **Backend (`/backend`):**
   - **Tecnologías:** Python, **FastAPI**, **SQLAlchemy** (ORM), Pydantic v2.
   - **Función:** Expone la API REST, centraliza validación y autorización por rol, y crea/consulta tickets. La automatización completa de cambios de estado, auditoría, equipos y notificaciones sigue pendiente.

3. **Plataforma y Base de Datos (Supabase):**
   - **Tecnologías:** **PostgreSQL**, **Supabase Auth**, **SMTP**.
   - **Función:** Aloja la base de datos relacional con Row Level Security (RLS), gestiona la autenticación segura y emisión de tokens JWT. Las notificaciones por correo son una decisión de arquitectura pendiente de implementación.


## 2. Estructura del Repositorio

```
API 2/
├── backend/
│   ├── app/
│   │   ├── core/           # Configuración (.env), seguridad, dependencias de auth
│   │   ├── db/             # Sesión de base de datos (SQLAlchemy engine/sessionmaker)
│   │   ├── models/         # Modelos de base de datos (SQLAlchemy ORM)
│   │   ├── schemas/        # Esquemas de entrada/salida y validación (Pydantic v2)
│   │   ├── services/       # Lógica de negocio (enrutamiento de tickets, notificaciones)
│   │   ├── routers/        # Endpoints de la API REST agrupados por entidad
│   │   └── main.py         # Instancia FastAPI y registro de middlewares/routers
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── index.html
|   ├── public/
│   │   └── imgs/                 # Imagenes fijas
│   ├── src/
│   │   ├── main.js               # Archivo JS principal (inicializa la app, rutas, auth)
│   │   ├── style.css             # Variables CSS globales, tipografia y resets base
│   │   ├── components/           # Componentes modulares reutilizables
│   │   ├── pages/                # Vistas (Login, Dashboard, Formulario Ticket, Admin)
|   │   │   ├── login/
|   |   |   |    ├── login.css    # Estilos especificos
|   |   |   |    ├── login.js     # Logica especifica del login
│   │   |   |    └── login.html   # Estructura del login
│   │   |   └── gestion/          # Gestion.html
│   │   └── services/             # Clientes HTTP (API y Supabase Auth)
│   ├── package.json
│   └── vite.config.js
├── database/
│   └── supabase_schema.sql # Script maestro de creación de base de datos
├── docs/
│   ├── Logica.md           # Reglas de negocio, matriz de roles y ciclo de vida
│   └── arquitectura.md     # Este documento
└── README.md
```

---

## 3. Flujo de Autenticación y Autorización

1. **Inicio de Sesión:**
   - El usuario ingresa credenciales en el frontend.
   - El frontend contacta a Supabase Auth (`supabase.auth.signInWithPassword()`).
   - Supabase valida la contraseña hasheada y retorna un **JWT (Access Token)** y Refresh Token.
2. **Peticiones a FastAPI:**
   - Cada petición a la API REST incluye la cabecera:
     ```http
     Authorization: Bearer <jwt_token>
     ```
3. **Validación en FastAPI (`get_current_user`):**
   - Una dependencia FastAPI identifica el algoritmo del JWT. Los tokens actuales ES256 se verifican contra el JWKS público de `SUPABASE_URL/auth/v1/.well-known/jwks.json`; HS256 queda solo como compatibilidad para proyectos heredados configurados con `SUPABASE_JWT_SECRET`.
   - Extrae el `sub` (UUID del usuario en `auth.users`).
   - Consulta `public.USUARIOS` para obtener el perfil completo (`id_rol`, `is_leader`, `laboratorio_asignado_id`).
   - Inyecta el usuario autenticado en la función del endpoint para evaluar permisos antes de procesar la lógica.

---

## 4. Convenciones de la API REST

* **Formato de Respuesta:** JSON en camelCase o snake_case consistente (`snake_case` recomendado para alineación directa con modelos Pydantic).
* **Códigos de Estado HTTP:**
  * `200 OK`: Consulta o actualización exitosa.
  * `201 Created`: Creación de recurso exitosa (`POST /tickets`).
  * `400 Bad Request`: Error de validación de negocio (ej. equipo no pertenece al aula seleccionada).
  * `401 Unauthorized`: Token ausente o expirado.
  * `403 Forbidden`: El usuario no tiene rol o permisos suficientes (ej. un técnico intentando asignar tickets).
  * `404 Not Found`: Recurso inexistente.
* **Documentación Interactiva:**
  * Accesible en desarrollo en `http://localhost:8000/docs` (Swagger UI).

---

## 5. Alcance actual de la demo

La demo integrada cubre login con Supabase Auth, propagación del access token al header `Authorization: Bearer`, validación ES256 mediante JWKS, validación del perfil de aplicación y creación/listado/filtrado de tickets. FastAPI protege las rutas de tickets, aulas, equipos y categorías de problema; las mutaciones de aulas y equipos requieren rol administrador. La interfaz de tickets muestra estados claros de carga, vacío y error, y se adapta a pantallas pequeñas conservando el acceso horizontal a la tabla.

El ciclo completo definido en ADR 0004 (asignación de técnicos, registro de solución, transiciones lineales auditadas, cierre/reapertura y notificaciones) es arquitectura acordada, no funcionalidad terminada. La documentación de esa ADR no debe interpretarse como evidencia de que esas operaciones ya existen en los endpoints. Aunque existe un `PUT /tickets/{id}` básico, no aplica estas reglas de ciclo de vida y no forma parte del flujo de demostración.
