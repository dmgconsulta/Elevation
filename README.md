# Elevation · Escuela de estrategia política

Plataforma base de formación política para Latinoamérica. Node + Express + SQLite, front vanilla JS sin build.

## Arranque
```
npm install
cp .env.example .env   # editar valores
export $(grep -v '^#' .env | xargs)
npm start              # http://localhost:3000
npm run check          # valida el contenido
```
Requiere Node >= 22.13 (usa `node:sqlite`).

## Qué incluye
- Ruta Start → Grow → Launch → Scale: 30 lecciones (de los 4 docx) con checklist, hitos y entregable por lección; entregables exportables a .md.
- Planes Free / Starter / Pro / Elite, prueba de 3 días de Starter al registrarse.
- Asistentes: Freya (Starter), Nova y Atenea (Pro), Charlie (Elite). Límite diario de mensajes 15/40/100.
- Comunidad por canales (abierta/cerrada/mentorías según plan).
- Panel admin (`/#/admin`): métricas, usuarios, cambio de plan y rol.

## Reglas de acceso (supuesto editable)
- Primera lección de cada fase: gratis.
- Start y Grow: Starter. Launch y Scale: Pro.
- Ajustar en `content/fase*.js` (`minPlan`, `free`) y `lib/plans.js`.

## Variables de entorno
Ver `.env.example`. Sin `ANTHROPIC_API_KEY` los asistentes responden en modo demo.

## Pagos
`PAYMENTS_MODE=demo` cambia el plan sin cobrar. Fuera de demo, `/api/billing/change` responde 501: integrar Stripe/Mercado Pago ahí.

## Despliegue
- Un solo proceso Node; montar `DATA_DIR` en disco persistente (la BD es un archivo SQLite).
- Definir `SESSION_SECRET`, `NODE_ENV=production` y servir tras HTTPS (cookie Secure).
- Rate limiting en memoria: con varias instancias, moverlo a Redis.

## Estructura
`server.js` rutas · `lib/` db, auth, planes, asistentes · `content/` lecciones · `public/` SPA.
