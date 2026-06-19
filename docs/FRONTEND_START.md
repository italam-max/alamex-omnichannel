# Guía de arranque — Desarrollador Frontend (P2)

## 1. Clonar el repo y crear tu rama

```bash
git clone <repo-url>
cd alamex-omnichannel
git checkout develop
git checkout -b feat/frontend-layout   # o el módulo que vayas a iniciar
```

## 2. Inicializar React + Vite en /frontend

```bash
cd frontend
npm create vite@latest . -- --template react
# Cuando pregunte si sobreescribir la carpeta actual, escribe: y
npm install
```

### Dependencias recomendadas

```bash
npm install axios react-router-dom zustand @tanstack/react-query
npm install -D tailwindcss @tailwindcss/vite
```

Configura Tailwind en `vite.config.js`:

```js
import tailwindcss from '@tailwindcss/vite'

export default {
  plugins: [react(), tailwindcss()],
}
```

Agrega en `src/index.css`:

```css
@import "tailwindcss";
```

## 3. Módulos a construir (en orden)

| Orden | Módulo | Ruta sugerida |
|---|---|---|
| 1 | **Layout + Sidebar** | `/` — Shell con navegación lateral y header |
| 2 | **Inbox** | `/inbox` — Lista de conversaciones con filtros por canal y estado |
| 3 | **Vista conversación** | `/inbox/:id` — Hilo de mensajes + panel derecho de contacto |
| 4 | **Overview / KPIs** | `/overview` — Tarjetas de métricas, gráficas de volumen |
| 5 | **Leads pipeline** | `/leads` — Kanban por etapas con drag-and-drop |

## 4. URL base del backend

```
http://localhost:8000/api/
```

Configura en `/frontend/src/config/api.js`:

```js
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
```

Y en `/frontend/.env.local`:

```
VITE_API_URL=http://localhost:8000/api
```

## 5. Mocks mientras el backend no está listo

Crea tus datos de prueba en `/frontend/src/mocks/`. Estructura sugerida:

```
src/mocks/
├── conversations.js    # Lista de conversaciones de ejemplo
├── messages.js         # Mensajes de una conversación
├── contacts.js         # Contactos / leads
├── channels.js         # Canales configurados
└── kpis.js             # Datos de métricas para Overview
```

Ejemplo de mock (`conversations.js`):

```js
export const mockConversations = [
  {
    id: 1,
    contact: { name: 'Carlos Mendoza', phone: '+52 55 1234 5678' },
    channel: { type: 'whatsapp', name: 'WA Principal' },
    status: 'active',
    ai_active: true,
    last_message: '¿Cuánto cuesta el mantenimiento anual?',
    updated_at: '2026-06-19T14:30:00Z',
  },
]
```

Usa un flag de entorno para alternar entre mocks y API real:

```js
// src/services/conversations.js
import { mockConversations } from '../mocks/conversations'
import { API_BASE } from '../config/api'

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

export async function getConversations() {
  if (USE_MOCK) return mockConversations
  const res = await fetch(`${API_BASE}/conversations/`)
  return res.json()
}
```

## 6. Estructura de carpetas sugerida

```
frontend/src/
├── assets/              # Imágenes, íconos, logo Alamex
├── components/          # Componentes reutilizables
│   ├── ui/              # Botones, badges, avatares, inputs
│   ├── layout/          # Sidebar, Header, PageShell
│   └── conversation/    # BubbleMessage, ContactPanel, ChannelBadge
├── config/
│   └── api.js           # URL base y cliente axios
├── features/            # Lógica por módulo
│   ├── inbox/
│   ├── conversation/
│   ├── overview/
│   └── leads/
├── mocks/               # Datos de prueba
├── services/            # Llamadas a la API
├── store/               # Estado global (Zustand)
├── App.jsx
└── main.jsx
```

## 7. Autenticación

El backend usa JWT. Flujo:

```js
// POST /api/auth/token/ → { access, refresh }
// Enviar en headers: Authorization: Bearer <access>
// Renovar con POST /api/auth/token/refresh/ → { access }
```

Guarda los tokens en `localStorage` o una cookie HttpOnly. Implementa un interceptor en axios para agregar el header automáticamente.

## 8. Arrancar en desarrollo

```bash
cd frontend
npm run dev
# → http://localhost:5173
```

El backend debe estar corriendo en `http://localhost:8000` para que CORS funcione correctamente.
