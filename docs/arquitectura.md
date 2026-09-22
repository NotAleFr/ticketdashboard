# Arquitectura del Sistema (API II)

Este documento describe la arquitectura técnica, diseño de capas, interacción entre servicios y convenciones de desarrollo del Sistema de Gestión de Tickets.

---

## 1. Stack Tecnológico y Responsabilidades

El sistema se estructura en tres componentes principales:

1. **Frontend (`/frontend`):**
   - **Tecnologías:** HTML5, CSS3, JavaScript Vanilla (ES Modules) con **Vite**.
   - **Función:** Interfaz gráfica para todos los roles (inicio de sesión, formulario de tickets, bandejas de asignación y paneles de administración). Gestiona la sesión del usuario mediante el cliente de Supabase Auth y se comunica con el backend mediante peticiones HTTP.

2. **Backend (`/backend`):**
   - **Tecnologías:** Python, **FastAPI**, **SQLAlchemy** (ORM), Pydantic v2.
   - **Función:** Expone la API REST, centraliza toda la lógica de negocio, valida permisos por rol, administra los cambios de estado de los tickets, sincroniza el estado de los equipos y coordina las notificaciones.

3. **Plataforma y Base de Datos (Supabase):**
   - **Tecnologías:** **PostgreSQL**, **Supabase Auth**, **SMTP**.
   - **Función:** Aloja la base de datos relacional con Row Level Security (RLS), gestiona la autenticación segura y emisión de tokens JWT, y provee el servicio de correos para notificaciones externas.


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
│   ├── src/
│   │   ├── assets/         # Estilos CSS, imágenes, fuentes
│   │   ├── components/     # Componentes modulares reutilizables
│   │   ├── pages/          # Vistas (Login, Dashboard, Formulario Ticket, Admin)
│   │   └── services/       # Clientes HTTP (API y Supabase Auth)
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
   - Un middleware/dependencia FastAPI verifica la firma del JWT usando la clave secreta o JWKS de Supabase.
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
