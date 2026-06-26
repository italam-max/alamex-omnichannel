# Almenara — Visión general

## 1. Qué es

**Almenara** es una plataforma omnicanal de atención al cliente con un **agente de
inteligencia artificial** que responde automáticamente por todos los canales de
mensajería (WhatsApp, Messenger, Instagram y un widget web), escala a un humano
cuando hace falta, y le da al equipo herramientas para gestionar conversaciones,
seguimientos, alertas de tiempo de respuesta (SLA) y el conocimiento del negocio.

El nombre viene del árabe *al-manara* — **la hoguera de señales / faro** que
comunica a distancia. Es la metáfora del producto: un punto que recibe cada canal
y responde, alcanzando al cliente esté donde esté.

### Para quién está pensada
Empresas que reciben muchos mensajes y quieren que una IA atienda la primera
línea (resolver dudas, calificar interesados, agendar seguimientos) con
supervisión humana. Está construida como **single-tenant configurable**: una
instalación = una empresa, pero **todo es configurable desde la interfaz** (no hay
nada "hardcodeado" para un negocio en particular), de modo que la misma base sirve
para cualquier empresa.

---

## 2. Arquitectura de alto nivel

```
                    ┌──────────────────────────┐
   Clientes  ─────► │  Canales                  │
   (WhatsApp,       │  WhatsApp / Messenger /   │
    IG, Web…)       │  Instagram / Widget web   │
                    └────────────┬─────────────┘
                                 │ webhooks / HTTP
                                 ▼
   ┌───────────────────────────────────────────────────────┐
   │  BACKEND (Django + DRF)                                 │
   │                                                         │
   │   Webhooks ──► Agente IA (LangGraph ReAct)              │
   │                  │  ├─ ¿es relevante? (anti-spam)       │
   │                  │  ├─ Claude razona y decide           │
   │                  │  └─ Herramientas: buscar KB, crear   │
   │                  │     lead, seguimiento, escalar…      │
   │                  ▼                                       │
   │   Conversaciones · Contactos · Leads · SLA · Créditos   │
   └───────────────────────────┬───────────────────────────┘
                                │ REST API (JWT)
                                ▼
   ┌───────────────────────────────────────────────────────┐
   │  FRONTEND (React + Vite)                                │
   │  Inbox · Mi Bandeja · Seguimientos · Conocimiento ·     │
   │  Canales · Agentes · Ajustes                            │
   └───────────────────────────────────────────────────────┘

   Base de datos: PostgreSQL   ·   IA: Claude (Anthropic)
```

**Despliegue de referencia** (ver `DEPLOYMENT.md`): frontend en **Netlify**, base
de datos en **Supabase** (Postgres), backend Django en un host con runtime Python.

### Dos caminos de entrada de un mensaje
1. **Canales de Meta** (WhatsApp/Messenger/Instagram): Meta envía un *webhook* al
   backend → se verifica la firma → se guarda el mensaje → corre el agente → se
   responde por la Graph API del canal.
2. **Widget web**: la página del cliente llama por HTTP al backend
   (`/widget/<key>/message/`) → corre el agente → responde en la misma petición.

En ambos, el agente decide si responde solo o **escala a un humano** (handoff),
momento en que la conversación entra a la cola de un agente del equipo.

---

## 3. Stack tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18, Vite, React Router, Zustand (estado), Axios |
| Backend | Django 6, Django REST Framework, SimpleJWT |
| Agente IA | LangGraph (ReAct), LangChain, Claude (Anthropic) |
| Base de datos | PostgreSQL (Supabase en producción) |
| Tareas/escalación | Comando `check_sla` (cron) · Celery opcional |
| Servidor | Gunicorn + WhiteNoise (estáticos) |

---

## 4. Módulos del backend (apps)

| App | Responsabilidad |
|-----|-----------------|
| **conversations** | Canales, conversaciones, mensajes, contactos. El corazón del inbox. |
| **integrations** | Webhooks de Meta, widget web, y el **agente IA** (LangGraph). |
| **knowledge** | Configuración del agente (persona, reglas, idioma), documentos de conocimiento y **herramientas personalizadas**. |
| **contacts** | Leads (interesados) y seguimientos (follow-ups). |
| **accounts** | Workspace (reglas del negocio), agentes/roles, motor de **SLA** y alertas. |
| **billing** | Cuenta de créditos y cobro por uso de la IA (tokens). |

(El detalle de cada una está en **[02-backend.md](02-backend.md)**.)

---

## 5. Funcionalidades principales (lo que ve el usuario)

- **Inbox** — todas las conversaciones; ver el hilo, responder, activar/desactivar
  la IA por conversación, pasar a humano, exportar.
- **Mi Bandeja** (vista de agente) — solo las conversaciones asignadas a mí, la
  cola de disponibles en mis canales, y mis seguimientos.
- **Conocimiento** — define **quién es el agente** (nombre, empresa, tono, género),
  el contexto del negocio, las reglas de comportamiento, el idioma, los
  **documentos** que consulta, y las **herramientas personalizadas** que puede
  ejecutar.
- **Canales** — conecta WhatsApp/Messenger/Instagram/Widget; configura credenciales
  y el comportamiento de la IA por canal.
- **Seguimientos** — leads y follow-ups generados por la IA + conversaciones en
  atención humana con su **barra de SLA**.
- **Agentes** (admin) — alta/baja de agentes, roles, canales que atienden.
- **Ajustes** — reglas de negocio (umbrales SLA, escalación por email), y créditos.

### Feedback in-app (identidad Almenara)
- **Confirmaciones** — diálogos propios (no los del navegador) para acciones
  destructivas.
- **Centro de incidencias** — si algo falla, aparece una tarjeta **persistente**
  con un **código rastreable** (`ALM-XXXXX`), bitácora que sobrevive recargas, y
  botón para copiar el reporte. No son avisos efímeros.

---

## 6. Roles y permisos

| Rol | Puede |
|-----|-------|
| **Administrador** | Todo: configurar IA, canales, créditos, agentes, reglas. |
| **Supervisor** | Ver todas las conversaciones, reasignar, seguimientos. |
| **Agente** | Solo su bandeja (conversaciones asignadas, su cola, sus follow-ups). |

El frontend oculta lo que cada rol no puede usar, y el **backend lo refuerza** con
permisos (no basta con esconder el botón). Ver seguridad en el doc de backend.

---

## 7. El agente de IA, en breve

El agente sigue el patrón **ReAct** (razona → actúa con herramientas → observa →
responde) sobre **LangGraph**. Esto permite que, en lugar de solo "responder
texto", el agente **ejecute acciones de negocio**:

- `search_knowledge_base` — consulta los documentos antes de responder.
- `create_lead` — registra un interesado.
- `create_followup` — agenda un seguimiento.
- `handoff_to_human` — escala a una persona.
- **+ herramientas personalizadas** que cada empresa define sin escribir código.

Antes de responder, un **filtro de relevancia** descarta spam/acuses ("ok",
"gracias", emojis sueltos) para no gastar ni molestar. Cada respuesta **consume
créditos** según los tokens usados.

El *por qué* de este diseño está en **[02-backend.md](02-backend.md)**.

---

## 8. Estado actual

- **MVP entregado** (v1.0.0) y mergeado a `main`; el equipo de implementación lo
  está probando con Netlify + Supabase.
- **En curso**: robustecer el backend (validación de entradas, correctitud,
  observabilidad) en la rama `feat/backend-hardening`.
- **Pendiente conocido**: dashboard de KPIs con datos reales (hoy demo),
  accesibilidad de algunos modales, code-splitting del frontend, base de ops
  (Docker/CI), y multi-tenancy real (hoy single-tenant por diseño).
