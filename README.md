# Elevation · Escuela de estrategia política

Plataforma de formación política para Latinoamérica. Node + Express + SQLite (`node:sqlite`), front vanilla JS sin build. Una sola dependencia (`express`).

## Arranque
```
npm install
cp .env.example .env   # editar valores
export $(grep -v '^#' .env | xargs)
npm start              # http://localhost:3000
npm run check          # valida el contenido de las lecciones
npm test               # pruebas de integración de la API
```
Requiere Node >= 22.13. Con Docker: `docker build -t elevation . && docker run -p 3000:3000 -v elevation-data:/data --env-file .env elevation`.

## Qué incluye
- **Ruta** Start → Grow → Launch → Scale: 30 lecciones con checklist, hitos y entregable. Búsqueda de texto en todas las lecciones (ignora tildes), barra de lectura, guía descargable (.md) e impresión.
- **Entregables** con guardado automático (y Ctrl/Cmd+S), contador de palabras y **revisión con IA**: el mejor asistente disponible para la fase lo contrasta con la consigna y devuelve qué está bien, qué falta y un veredicto.
- **Asistentes** Freya (Starter), Nova y Atenea (Pro), Charlie (Elite): respuestas en **streaming**, Markdown, copiar y exportar conversación. Conocen el país, perfil, fase actual, hitos y últimos entregables del miembro. Límite diario 15/40/100 (las revisiones cuentan).
- **Dashboard KPI** (Pro): 11 indicadores con metas tomadas de los hitos (libros, presentaciones, aliados, medios, donantes, cobertura…), tendencia de 12 semanas y exportación CSV.
- **Agenda**: sesiones en vivo, mentorías, talleres y convocatorias, con plan mínimo por evento (el enlace se oculta si no tienes acceso) y descarga .ics.
- **Comunidad** por canales, con paginación, publicaciones fijadas por el equipo y borrado de respuestas.
- **Mi cuenta**: editar perfil, cambiar contraseña (cierra las demás sesiones), exportar todos los datos (JSON) y eliminar la cuenta.
- **Admin** (`/#/admin`): usuarios nuevos/activos, pruebas en curso, MRR estimado, lecciones más completadas; búsqueda, cambio de plan y rol, renovar prueba, export CSV; gestión de agenda.
- Modo claro/oscuro automático (con botón en el pie), diseño responsive y accesible (skip link, aria, foco visible).

## Reglas de acceso (supuesto editable)
- Primera lección de cada fase: gratis. Start y Grow: Starter. Launch y Scale: Pro.
- Ajustar en `content/fase*.js` (`minPlan`, `free`) y `lib/plans.js` (planes, canales, asistentes, tipos de evento, revisores por fase). Indicadores en `lib/kpis.js`.

## Variables de entorno
Ver `.env.example`. Sin `ANTHROPIC_API_KEY` los asistentes responden en modo demo.

## Pagos
`PAYMENTS_MODE=demo` cambia el plan sin cobrar. Fuera de demo, `/api/billing/change` responde 501: integrar Stripe/Mercado Pago ahí.

## Despliegue
- Un solo proceso Node; montar `DATA_DIR` en disco persistente (la BD es un archivo SQLite). El esquema se migra solo al arrancar.
- Definir `SESSION_SECRET`, `NODE_ENV=production` y servir tras HTTPS (cookie Secure + HSTS).
- `GET /healthz` para el balanceador. Cierre ordenado con SIGTERM.
- El proxy no debe almacenar en búfer `text/event-stream` (se envía `X-Accel-Buffering: no` para nginx).
- Rate limiting en memoria: con varias instancias, moverlo a Redis.

## Estructura
`server.js` rutas · `lib/` db, auth, planes, asistentes, kpis · `content/` lecciones · `public/` SPA · `test/` pruebas.
