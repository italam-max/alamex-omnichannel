# Despliegue de Almenara

Guía para el equipo de implementación. Arquitectura del despliegue:

| Pieza | Dónde vive | Qué es |
|-------|-----------|--------|
| **Frontend** (React/Vite) | **Netlify** | Sitio estático (`/frontend`) |
| **Base de datos** (Postgres) | **Supabase** | Connection string → backend |
| **Backend** (Django + agente IA) | Host con runtime Python (Render / Railway / Fly) | API REST + webhooks |

> El frontend (Netlify) llama al backend por HTTPS; el backend usa la base de
> datos de Supabase. Netlify **no** ejecuta Django — necesitas un host con Python
> para el backend.

---

## 1. Base de datos — Supabase

1. Crea un proyecto en Supabase.
2. **Project Settings → Database → Connection string → URI**. Copia la cadena y
   reemplaza `[YOUR-PASSWORD]`. Usa el **puerto 5432** (session pooler / direct),
   no el 6543, para que funcionen las migraciones:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```
3. Esa cadena es tu `DATABASE_URL` para el backend. El backend ya fuerza
   `sslmode=require`.

No hace falta crear tablas a mano: las migraciones de Django las crean.

---

## 2. Backend — Render (ejemplo)

1. **New → Web Service** y conecta el repo de GitHub.
2. **Root Directory:** `backend`
3. **Build Command:** `./build.sh`  (instala deps, `collectstatic`, `migrate`)
4. **Start Command:** `gunicorn config.wsgi:application --bind 0.0.0.0:$PORT`
   *(o deja que use el `Procfile`)*
5. **Environment** — define estas variables (ver `backend/.env.example`):

   | Variable | Valor |
   |----------|-------|
   | `DATABASE_URL` | cadena de Supabase (paso 1) |
   | `SECRET_KEY` | clave larga aleatoria |
   | `DEBUG` | `False` |
   | `ALLOWED_HOSTS` | dominio del backend, ej. `almenara-api.onrender.com` |
   | `CORS_ALLOWED_ORIGINS` | URL del frontend, ej. `https://almenara.netlify.app` |
   | `CSRF_TRUSTED_ORIGINS` | igual que CORS |
   | `ANTHROPIC_API_KEY` | clave de Anthropic (el agente no responde sin ella) |
   | `SECURE_SSL_REDIRECT` | `True` |

   Email real (opcional, para alertas SLA): `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend` + `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, `DEFAULT_FROM_EMAIL`.

6. Tras el primer deploy, crea el administrador (Render → Shell):
   ```bash
   python manage.py createsuperuser
   ```
7. (Opcional) Datos de demo de una empresa de prueba:
   ```bash
   python manage.py seed_demo_company --company "Mi Empresa"
   ```

> **Python 3.12+** (ver `runtime.txt`). Django 6 lo requiere.

---

## 3. Frontend — Netlify

1. **Add new site → Import from Git**, selecciona el repo.
2. La configuración de build ya está en `netlify.toml` (base `frontend`, publish
   `frontend/dist`, fallback SPA). No necesitas tocar los comandos.
3. **Site settings → Environment variables:**

   | Variable | Valor |
   |----------|-------|
   | `VITE_API_URL` | URL del backend **con** `/api`, ej. `https://almenara-api.onrender.com/api` |
   | `VITE_USE_MOCK` | `false` |

4. Deploy. Toma nota del dominio (`https://<algo>.netlify.app`).

---

## 4. Conectar las piezas (orden de huevo-gallina)

1. Despliega el backend primero (sin saber aún el dominio de Netlify, pon un
   placeholder en `CORS_ALLOWED_ORIGINS`).
2. Despliega Netlify con `VITE_API_URL` apuntando al backend.
3. Vuelve al backend y pon el dominio real de Netlify en `CORS_ALLOWED_ORIGINS`
   y `CSRF_TRUSTED_ORIGINS`; vuelve a desplegar.
4. Entra al frontend, inicia sesión con el superusuario, y en **Ajustes** /
   **Conocimiento** / **Canales** configura el negocio.

### Webhooks de Meta (WhatsApp/Messenger/Instagram)
Apuntan a `https://<backend>/api/integrations/webhook/meta/`. Configura el
`verify_token` en Canales y en el panel de Meta.

---

## 5. Tareas programadas (SLA)

Supabase no incluye Redis, así que **Celery es opcional**. El agente responde de
forma síncrona sin Celery. Para el escaneo de SLA y alertas, programa un cron en
tu plataforma (o `pg_cron` / GitHub Actions) que ejecute cada 1–2 min:

```bash
python manage.py check_sla
```

Si prefieres Celery, define `CELERY_BROKER_URL` con un Redis externo (p. ej.
Upstash) y corre el worker + beat.

---

## 6. Verificación post-deploy

- `GET https://<backend>/api/` responde (no 500).
- Login desde el frontend funciona (token JWT).
- El panel **Conocimiento** carga y guarda (RBAC: solo admin).
- Una conversación de prueba en **Prueba Widget** obtiene respuesta del agente
  (requiere `ANTHROPIC_API_KEY` y saldo de créditos en **Ajustes**).
- Si algo falla en el front, aparece una **incidencia con código `ALM-…`**
  (esquina inferior derecha) — útil para reportar.
