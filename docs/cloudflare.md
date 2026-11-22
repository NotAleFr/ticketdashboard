# Despliegue gratuito en Cloudflare

Pages sirve la interfaz y envía las solicitudes de `/api` a un Python Worker privado. El Worker ejecuta FastAPI y usa Hyperdrive para conectarse a la base de datos existente de Supabase.

## 1. Preparar Cloudflare y Supabase

1. Usa la rama `deploy/cloudflare-free`. Instala [Node.js 22](https://nodejs.org/), [uv](https://docs.astral.sh/uv/getting-started/installation/) y Python 3.
2. En Supabase, abre **Connect → Direct connection** y copia la URL de PostgreSQL. En Cloudflare, abre **Workers & Pages → Hyperdrive → Create configuration**, pega la URL en el formulario y desactiva **Query caching**. Guarda el ID de Hyperdrive de 32 caracteres.
3. El nombre previsto del sitio es `tickets-laboratorios`. Si Cloudflare pide otro nombre, actualiza solo `name` en `frontend/wrangler.jsonc` y usa el dominio que te asigne Pages en los pasos siguientes.
4. Copia `backend/cloudflare/.dev.vars.example` a `backend/cloudflare/.dev.vars`. Completa la URL del proyecto, su clave pública, la clave de servidor `service_role` y la URL de recuperación del dominio elegido. Agrega `SUPABASE_JWT_SECRET` únicamente si el proyecto usa firmas HS256. El archivo está ignorado por Git.

## 2. Publicar la API

Abre PowerShell desde la raíz del repositorio. Primero inicia sesión en Cloudflare. Usa el ID de Hyperdrive en el segundo comando.

```powershell
npx --yes wrangler@4.166.0 login
python backend/cloudflare/run.py deploy --hyperdrive-id TU_ID --secrets-file backend/cloudflare/.dev.vars
```

Confirma que aparece el Worker `tickets-laboratorios-api` en **Workers & Pages**. Pages lo llama por un vínculo interno. Se puede ejecutar el mismo empaquetado sin publicar con `python backend/cloudflare/run.py build`.

## 3. Publicar Pages y configurar recuperación

1. En **Workers & Pages → Create → Pages → Connect to Git**, elige el repositorio y autoriza GitHub.
2. Selecciona `deploy/cloudflare-free` como rama de producción, `frontend` como directorio raíz, `npm run build` como comando de compilación y `dist` como salida.
3. Agrega estas variables de compilación en Pages.

   | Variable | Valor |
   | --- | --- |
   | `VITE_API_URL` | `/api` |
   | `VITE_SUPABASE_URL` | La URL del proyecto de Supabase |
   | `VITE_SUPABASE_ANON_KEY` | La clave pública `publishable` o `anon` |

4. Publica el sitio. El archivo `frontend/wrangler.jsonc` vincula `API` al Worker. Abre `https://TU-SITIO.pages.dev/api/test-db` y verifica que responda `{"state":"DB Running"}`.
5. En Supabase, abre **Authentication → URL Configuration**. Configura **Site URL** con el dominio real de Pages. Agrega la URL HTTPS completa de `/src/pages/login/nueva-contrasena` a **Redirect URLs**, igual que en el Worker. Confirma que Supabase tiene SMTP personalizado para enviar correos a usuarios fuera del equipo.

## 4. Probar acceso antes de compartir el enlace

Desde `frontend`, copia `.env.smoke.example` a `.env.smoke.local` y completa el dominio y las credenciales de cuatro cuentas de prueba con contraseñas definitivas. Para probar el acceso de un maestro al ticket de otro, agrega el ID de un ticket de prueba ajeno. Ejecuta:

```powershell
npm ci
npx playwright install chromium
node --env-file=.env.smoke.local tests/pages-access.cjs
```

Playwright inicia sesión por la interfaz y comprueba el acceso directamente contra la API. Las credenciales quedan en el archivo local. La suite de FastAPI también comprueba las restricciones de tickets, historial, exportaciones y cambios de estado con datos de prueba.

Completa en el sitio alojado el cambio de contraseña temporal, un correo real de recuperación, un usuario suspendido y un ticket de creación a cierre. Descarga la exportación más grande que esperas durante el uso y confirma sus filas. Revisa **Workers & Pages → tickets-laboratorios-api → Observability** para detectar errores de ejecución o de CPU.

## 5. Durante el día de uso

Configura un monitor HTTPS externo para `/api/test-db` y revisa los avisos de actividad de Supabase si el sitio se queda publicado durante la semana. Conserva las versiones verificadas de Pages y del Worker para poder volver a ellas desde **Deployments**.

[Configuración de Pages](https://developers.cloudflare.com/pages/configuration/build-configuration/) · [Hyperdrive y Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) · [Límites de Workers](https://developers.cloudflare.com/workers/platform/limits/) · [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp)
