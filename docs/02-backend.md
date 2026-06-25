# Almenara — Backend

Cómo está organizado el backend, **cómo se usa** y, sobre todo, **por qué está
diseñado así**. Stack: Django 6 + DRF + SimpleJWT, agente sobre LangGraph/Claude,
PostgreSQL.

---

## 1. Estructura

```
backend/
├── config/            # settings, urls, wsgi/asgi, celery
├── conversations/     # canales, conversaciones, mensajes, contactos
├── integrations/      # webhooks Meta, widget, y el AGENTE IA (services/)
├── knowledge/         # config del agente, documentos, herramientas custom
├── contacts/          # leads y follow-ups
├── accounts/          # workspace, agentes/roles, motor SLA
└── billing/           # créditos y cobro por uso
```

Cada dominio es una **app de Django** independiente. Razón: separar
responsabilidades y poder evolucionar (o extraer a un servicio) cada una sin tocar
las demás. Las apps se comunican por modelos e imports puntuales, no por estado
global.

---

## 2. El agente de IA (lo más importante)

Vive en `integrations/services/`:

| Archivo | Qué hace |
|---------|----------|
| `agent_graph.py` | Construye y ejecuta el grafo LangGraph. `run_agent()` es la API pública. |
| `agent_tools.py` | Las 4 herramientas del sistema (`@tool`). |
| `agent_state.py` | El `AgentState` (estado que fluye por el grafo) y `MAX_ITERATIONS`. |
| `custom_tools.py` | Genera y ejecuta las herramientas **personalizadas** por empresa. |
| `net_safety.py` | Guard anti-SSRF compartido (webhooks + scraper). |
| `ai_agent.py` | Adaptador delgado: precondiciones (IA activa, keywords de handoff) antes de llamar al grafo. |

### El grafo (patrón ReAct)

```
   check_relevance ──► call_model ──► (¿pidió herramientas?) ──► execute_tools ──┐
        │  no                │  no                                               │
        ▼                    ▼                                                   │
     finalize  ◄─────────────┴───────────────────────────────────────────◄──────┘
```

1. **check_relevance** — ¿este mensaje merece respuesta? Heurística de costo cero
   (mensajes < 2 caracteres) + un clasificador barato (Claude Haiku) que responde
   RESPONDER/IGNORAR. Si IGNORAR → no se responde (anti-spam).
2. **call_model** — Claude recibe el *system prompt* (ver §3) + el historial y
   decide: responder en texto **o** llamar herramientas.
3. **execute_tools** — ejecuta las herramientas que pidió y vuelve a call_model con
   los resultados (el "observe" de ReAct).
4. **finalize** — extrae la respuesta y se cobran los créditos del turno completo.

**Tope de iteraciones** (`MAX_ITERATIONS`) para que el loop nunca sea infinito.

### Por qué LangGraph / ReAct
El agente original solo llamaba a Claude para "responder texto". Se migró a
LangGraph para que pudiera **ejecutar acciones de dominio** (buscar conocimiento,
crear leads, escalar) de forma estructurada y auditable, sin hardcodear lógica en
cadenas de `if`. ReAct es el patrón estándar para "razonar y usar herramientas".

### Decisiones técnicas clave del grafo
- **El grafo se cachea por "firma" de herramientas** (`_get_graph` +
  `active_tools_signature`). Compilar el grafo es caro; las herramientas casi nunca
  cambian, así que se reconstruye solo cuando cambia el conjunto de tools activas.
- **El cliente de Claude se cachea** por `(modelo, max_tokens)` — construir el
  cliente HTTP en cada turno era un desperdicio.
- **`conversation_id` viaja por un `ContextVar`**, no como parámetro de las tools
  personalizadas. Así el LLM solo ve los parámetros que definió la empresa, y el
  backend inyecta el contexto de forma segura.
- **ToolNode ejecuta las tools en hilos**: las conexiones a la BD son
  *thread-local*, por eso cada tool cierra su conexión al terminar (solo en hilos
  worker, nunca en el principal).

---

## 3. El "system prompt" (cómo se configura la personalidad)

`_build_system_prompt()` en `agent_graph.py` arma **un solo prompt** a partir de la
configuración (`knowledge.AIConfig`), **en este orden**:

1. **Persona** — `agent_name`, `company_name`, `tone`, `agent_gender`. Si la
   "línea de identidad" está vacía, se **genera** con el nombre y la empresa. → Por
   eso cambiar el nombre en la UI cambia de verdad cómo se presenta el agente.
2. **CONTEXTO DEL NEGOCIO** — el "resumen" (`overview`).
3. **REGLAS DE COMPORTAMIENTO** — la lista ordenada de reglas.
4. **Idioma** — espejo del cliente o idiomas fijos.
5. **HERRAMIENTAS** — instrucciones de uso obligatorio.

Los **documentos** de conocimiento NO van en el prompt: el agente los consulta en
tiempo real con `search_knowledge_base` (ahorra tokens; solo lee lo que necesita).

---

## 4. Herramientas

### Del sistema (`agent_tools.py`) — siempre activas
`search_knowledge_base`, `create_lead`, `create_followup`, `handoff_to_human`.

### Personalizadas (`custom_tools.py`) — las define cada empresa, **sin código**
Principio de diseño: **el tenant nunca escribe código**. Configura una *instancia*
de un **arquetipo** que la plataforma define, y un *dispatcher* genérico la
ejecuta. Arquetipos:

| Arquetipo | Qué hace |
|-----------|----------|
| `collect_data` | Recolecta campos del cliente y los registra. |
| `tag_route` | Etiqueta la conversación / la escala a humano. |
| `canned_response` | Devuelve un texto fijo o un documento. |
| `webhook` | POST a un sistema externo del tenant (CRM, Zapier). |

**Por qué declarativo:** ejecutar código arbitrario del tenant sería un riesgo
enorme. Al ser declarativo, el agente recibe un esquema JSON y el backend dispatcha
a un handler seguro. Rieles que protegen la plataforma:
- Límite de herramientas por plan (`Workspace.max_custom_tools`).
- Nombres validados; no pueden pisar las del sistema.
- **Webhooks blindados (anti-SSRF)**: solo HTTPS, se resuelve la IP y se bloquean
  direcciones internas/privadas/metadata; allowlist de dominios; timeout; cobro por
  ejecución. Y **no se auto-activan**: pasan por revisión del operador.
- Cada ejecución se registra en `CustomToolRun` (auditoría + datos capturados).

---

## 5. Modelo de datos

### Singletons configurables (single-tenant)
`accounts.Workspace`, `knowledge.AIConfig` y `billing.CreditAccount` son **filas
únicas** (`pk=1`, vía `get_solo()`).

**Por qué:** el producto se diseñó como *single-tenant configurable* — una empresa
por instalación, pero con TODO configurable desde la UI. Esto simplificó el MVP
(sin la complejidad de multi-tenancy) sin caer en hardcodear valores. Para
multi-tenant real más adelante, estos singletons se convierten en filas por
`Organization` (es el principal trabajo pendiente para SaaS multi-empresa).

### Entidades principales
- `conversations.Channel` — un canal conectado (WhatsApp/web/…). `credentials` es
  un JSON con tokens (enmascarados al serializar) y la config de IA del canal.
- `conversations.Contact` — la persona del otro lado.
- `conversations.Conversation` — el hilo; tiene `status` (active / human_takeover /
  blocked), `ai_active`, y `assigned_to` (un agente).
- `conversations.Message` — cada mensaje (`role`: customer / ai / agent).
- `contacts.Lead`, `contacts.FollowUp` — interesados y seguimientos (los crea la IA
  o el equipo).
- `knowledge.AIConfig` (persona), `KnowledgeDoc` (documentos), `CustomTool` /
  `CustomToolRun` (herramientas y su bitácora).
- `accounts.Agent` (OneToOne con el User de Django; rol, canales, disponibilidad),
  `SLAAlert` (alertas idempotentes por conversación/nivel).
- `billing.CreditAccount`, `CreditTransaction`.

---

## 6. Créditos y facturación

Cada llamada a la IA **consume créditos** según los tokens (entrada/salida) y el
modelo, con un `markup_multiplier` configurable. `_deduct_credits()`:
- Bloquea la fila de la cuenta (`select_for_update`) dentro de una transacción para
  serializar deducciones concurrentes.
- **Nunca deja el saldo negativo** (`max(0, saldo − costo)`); la transacción
  registra el costo real.

**Por qué importa:** protege el margen del negocio y evita estados imposibles
(saldo negativo) bajo concurrencia.

---

## 7. Motor de SLA (`accounts/services.py`)

`scan_sla()` evalúa cada conversación en `human_takeover` contra los umbrales del
Workspace (aviso / crítico / escalada) y crea **una `SLAAlert` por
(conversación, nivel)** — es **idempotente**, así correrlo cada minuto no genera
correos duplicados. En el nivel "escalada" envía email y marca el dashboard.

Se dispara con el comando `python manage.py check_sla` (programado por cron). Celery
es **opcional** (Supabase no trae Redis); el agente responde de forma síncrona sin
él.

---

## 8. Seguridad

- **Autenticación**: JWT (SimpleJWT). El frontend manda `Authorization: Bearer`.
- **Autorización (RBAC)**: clases de permiso en `accounts/permissions.py`.
  - `IsAdmin` — lectura para autenticados, **escritura solo admin** (knowledge,
    config, tools, scrape).
  - `IsAdminStrict` — admin para **todo método**, incl. lecturas (billing, que es
    sensible).
  - El frontend oculta, pero **el backend es la fuente de verdad**.
- **Anti-SSRF** (`net_safety.py`): todo fetch saliente (webhooks de tools y el
  scraper) resuelve la IP y rechaza loopback/privadas/link-local/metadata; exige
  HTTPS en webhooks; allowlist opcional.
- **Webhooks de Meta**: verificación **HMAC** de firma que **falla cerrado** (si no
  hay secreto configurado, rechaza).
- **Secretos**: las `credentials` de canal se **enmascaran** al leer; los `.env`
  nunca se commitean.
- **Hardening de producción** (`if not DEBUG`): HSTS, redirección SSL, cookies
  seguras, `X-Frame-Options: DENY`, y se niega a arrancar con `ALLOWED_HOSTS` por
  defecto.

---

## 9. API REST (resumen)

Base: `/api/`. Autenticación JWT salvo el widget y el webhook (públicos) y
`/api/health/`.

| Recurso | Rutas |
|---------|-------|
| Auth | `POST /auth/token/`, `POST /auth/token/refresh/` |
| Salud | `GET /health/` (verifica BD; 503 si cae) |
| Conversaciones | `/conversations/` (CRUD + acciones `update`, `claim`, `release`, `create_message`; filtros `?assigned=me`, `?queue=true`, `?status=`) |
| Canales / Contactos / Mensajes | `/conversations/channels/`, `/contacts/`, `/messages/` |
| Conocimiento | `/knowledge/config/`, `/knowledge/docs/`, `/knowledge/tools/` (+ `approve`, `runs`), `/knowledge/scrape/` |
| Contactos (CRM) | `/contacts/leads/`, `/contacts/followups/` (+ `set-status`, `?mine=true`) |
| Equipo / SLA | `/accounts/agents/` (+ `me`, `availability`, `reactivate`), `/accounts/alerts/` (+ `scan`, `resolve`), `/accounts/workspace/`, `/accounts/reassign/`, `/accounts/stats/` |
| Billing | `/billing/account/`, `/billing/topup/`, `/billing/transactions/`, `/billing/usage/` |
| Integraciones | `POST /integrations/webhook/meta/`, `GET /integrations/widget/<key>/config/`, `POST /integrations/widget/<key>/message/` |

### Validación de entradas
Los endpoints que escriben validan: p. ej. el `PATCH` de conversación valida
`status` contra las opciones del modelo y coacciona `ai_active` a booleano; billing
rechaza montos no positivos y valores negativos de configuración. Los errores
devuelven `400` con un `detail` claro.

---

## 10. Cómo correr el backend (local)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # y completa SECRET_KEY, DB, ANTHROPIC_API_KEY
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Comandos de gestión útiles
| Comando | Para qué |
|---------|----------|
| `python manage.py seed_demo_company` | Siembra una empresa de prueba (workspace, 5 empleados, config IA, documentos y una herramienta de ejemplo). |
| `python manage.py check_sla` | Ejecuta el escaneo de SLA (programar por cron). |
| `python manage.py agent_stats --days 7` | Estadísticas de uso del agente (llamadas, tokens, costo, leads). |

### Pruebas
```bash
python manage.py test          # o:
.venv/bin/python -m pytest -q   # 114 pruebas
```
Las pruebas mockean la API de Anthropic — no hacen llamadas reales.

---

## 11. Configuración (variables de entorno)

Lo esencial (lista completa en `backend/.env.example`):

| Variable | Para qué |
|----------|----------|
| `DATABASE_URL` | Cadena de conexión (Supabase). Si está vacía, usa `DB_*` locales. Fuerza SSL. |
| `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS` | Django básico de producción. |
| `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS` | Origen del frontend (Netlify). |
| `ANTHROPIC_API_KEY` | Clave de Claude — sin ella el agente no responde. |
| `EMAIL_*` | SMTP para los correos de escalación de SLA (por defecto, consola). |
| `CELERY_BROKER_URL` | Opcional; solo si se usa Celery en vez del cron. |

---

## 12. Por qué, en resumen

- **Django + DRF**: madurez, ORM, admin, y un ecosistema sólido para un backend de
  negocio con datos relacionales.
- **LangGraph/ReAct**: para que la IA *actúe* (herramientas de dominio), no solo
  conteste — de forma estructurada, con tope de iteraciones y auditable.
- **Herramientas declarativas**: extensibilidad por empresa **sin** ejecutar código
  del tenant (seguridad).
- **Single-tenant configurable**: time-to-market del MVP sin hardcodear; el camino
  a multi-tenant queda claro (Organization FK).
- **Seguridad por capas**: JWT + RBAC en el servidor + anti-SSRF + HMAC + hardening,
  porque el frontend nunca es la frontera de seguridad.
- **Idempotencia y locks** en SLA y créditos: para que correr tareas repetidas o
  bajo concurrencia no rompa la consistencia.
