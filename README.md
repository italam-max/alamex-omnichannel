# Alamex Omnichannel

Plataforma omnicanal con agente de IA para Alamex, empresa de elevadores. Centraliza conversaciones de WhatsApp, Messenger e Instagram en un solo inbox, con pipeline de leads, base de conocimiento y cotizaciones integradas con Odoo.

## Estructura del proyecto

```
alamex-omnichannel/
├── backend/               # Django + DRF + Channels
│   ├── config/            # Proyecto Django (settings, urls, wsgi, asgi)
│   ├── conversations/     # Canal, Contacto, Conversación, Mensaje
│   ├── contacts/          # Lead, FollowUp
│   ├── knowledge/         # Base de conocimiento del agente IA
│   ├── integrations/      # Odoo, Evolution API, Cotizaciones
│   ├── venv/              # Entorno virtual (no commitear)
│   ├── .env.example       # Plantilla de variables de entorno
│   └── requirements.txt
├── frontend/              # React + Vite (inicializar por P2)
└── docs/
    └── FRONTEND_START.md  # Guía de arranque para el desarrollador frontend
```

## Levantar el backend (primera vez)

```bash
# 1. Clonar el repo
git clone <repo-url>
cd alamex-omnichannel

# 2. Crear y activar el entorno virtual
cd backend
python3 -m venv venv
source venv/bin/activate          # Linux/Mac
# venv\Scripts\activate           # Windows

# 3. Instalar dependencias
pip install -r requirements.txt

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales reales

# 5. Crear la base de datos en PostgreSQL
createdb alamex_omnichannel       # o desde psql

# 6. Aplicar migraciones
python manage.py migrate

# 7. Crear superusuario
python manage.py createsuperuser

# 8. Arrancar el servidor de desarrollo
python manage.py runserver
```

El backend queda disponible en `http://localhost:8000`.

## Levantar el frontend (P2)

Ver `/docs/FRONTEND_START.md` para instrucciones detalladas.

```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```

## Variables de entorno requeridas

| Variable | Descripción |
|---|---|
| `DB_NAME` | Nombre de la base de datos PostgreSQL |
| `DB_USER` | Usuario de PostgreSQL |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `DB_HOST` | Host de PostgreSQL (default: localhost) |
| `DB_PORT` | Puerto de PostgreSQL (default: 5432) |
| `SECRET_KEY` | Clave secreta de Django (generarla con `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`) |
| `DEBUG` | `True` en desarrollo, `False` en producción |
| `ALLOWED_HOSTS` | Hosts permitidos separados por coma |
| `ANTHROPIC_API_KEY` | API key de Claude (agente IA) |
| `EVOLUTION_API_URL` | URL de Evolution API (WhatsApp) |
| `EVOLUTION_API_KEY` | API key de Evolution API |
| `ODOO_URL` | URL de la instancia Odoo |
| `ODOO_DB` | Nombre de la base de datos Odoo |
| `ODOO_USER` | Usuario de Odoo |
| `ODOO_PASSWORD` | Contraseña de Odoo |
| `CORS_ALLOWED_ORIGINS` | Orígenes CORS permitidos |

## Convención de ramas

| Rama | Propósito |
|---|---|
| `main` | Producción — solo merges revisados |
| `develop` | Integración continua — rama base para features |
| `feat/backend-*` | Features de backend (ej. `feat/backend-ai-agent`) |
| `feat/frontend-*` | Features de frontend (ej. `feat/frontend-inbox`) |
| `feat/integr-*` | Integraciones externas (ej. `feat/integr-odoo`) |

Flujo: `feat/*` → PR a `develop` → PR a `main`.

## Endpoints de la API

| Endpoint | Descripción |
|---|---|
| `GET /api/health/` | Health check (público) |
| `POST /api/auth/token/` | Obtener JWT |
| `POST /api/auth/token/refresh/` | Renovar JWT |
| `GET /api/conversations/` | Conversaciones |
| `GET /api/conversations/channels/` | Canales |
| `GET /api/conversations/contacts/` | Contactos |
| `GET /api/conversations/messages/` | Mensajes |
| `GET /api/contacts/leads/` | Pipeline de leads |
| `GET /api/contacts/followups/` | Seguimientos |
| `GET /api/knowledge/docs/` | Base de conocimiento |
| `GET /api/integrations/integrations/` | Integraciones |
| `GET /api/integrations/quotes/` | Cotizaciones |
