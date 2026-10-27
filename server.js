const express = require('express');
const path = require('path');
const db = require('./lib/db');
const auth = require('./lib/auth');
const plansLib = require('./lib/plans');
const assistants = require('./lib/assistants');
const kpis = require('./lib/kpis');
const content = require('./content');

const { PLANS, PLAN_FEATURES, TRIAL_DAYS, DAY, rank, effectivePlan, can, CHANNELS, ASSISTANTS, DAILY_CHAT_LIMIT, EVENT_KINDS, REVIEWERS } = plansLib;
const PORT = process.env.PORT || 3000;
const PAYMENTS_MODE = process.env.PAYMENTS_MODE || 'demo'; // demo | disabled

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Cabeceras de seguridad básicas.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  if (process.env.NODE_ENV === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

app.get('/healthz', (_req, res) => {
  try { db.prepare('SELECT 1').get(); res.json({ ok: true }); }
  catch { res.status(503).json({ ok: false }); }
});

app.use(express.json({ limit: '100kb' }));

// Defensa CSRF: toda escritura debe llegar como JSON (un formulario cruzado no puede).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json.' });
  }
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api', auth.attachUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => Date.now();
const clean = (s, max) => String(s ?? '').trim().slice(0, max);
const SEGMENTS = ['novel', 'consultor', 'futuro'];
const getUser = (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id);

function publicUser(u) {
  const eff = effectivePlan(u);
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, country: u.country, segment: u.segment,
    plan: u.plan, billing: u.billing, effectivePlan: eff.plan, trial: eff.trial,
    trialEndsAt: eff.trial ? u.trial_ends_at : null, createdAt: u.created_at,
  };
}

// ---------- Auth ----------
app.post('/api/auth/register', wrap((req, res) => {
  if (!auth.rateLimit('reg:' + req.ip, 10, 3600000)) return res.status(429).json({ error: 'Demasiados registros. Intenta más tarde.' });
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const country = clean(req.body.country, 60);
  const segment = SEGMENTS.includes(req.body.segment) ? req.body.segment : null;
  if (name.length < 2) return res.status(400).json({ error: 'Escribe tu nombre.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Correo no válido.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const t = now();
  const r = db.prepare(
    'INSERT INTO users (name, email, pass, plan, trial_ends_at, role, country, segment, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(name, email, auth.hashPassword(password), 'free', t + TRIAL_DAYS * DAY, 'member', country || null, segment, t);
  auth.setSession(res, Number(r.lastInsertRowid), 0);
  res.status(201).json({ user: publicUser(getUser(r.lastInsertRowid)) });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  if (!auth.rateLimit('login:' + req.ip + email, 8, 15 * 60000)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !auth.verifyPassword(String(req.body.password || ''), u.pass)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  auth.setSession(res, u.id, u.sess_ver);
  res.json({ user: publicUser(u) });
}));

app.post('/api/auth/logout', (_req, res) => { auth.clearSession(res); res.json({ ok: true }); });

app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

// ---------- Mi cuenta ----------
app.patch('/api/me', auth.requireAuth, (req, res) => {
  const u = req.user;
  const name = req.body.name !== undefined ? clean(req.body.name, 80) : u.name;
  const country = req.body.country !== undefined ? clean(req.body.country, 60) || null : u.country;
  const segment = req.body.segment !== undefined ? (SEGMENTS.includes(req.body.segment) ? req.body.segment : null) : u.segment;
  if (name.length < 2) return res.status(400).json({ error: 'Escribe tu nombre.' });
  db.prepare('UPDATE users SET name = ?, country = ?, segment = ? WHERE id = ?').run(name, country, segment, u.id);
  res.json({ user: publicUser(getUser(u.id)) });
});

// Cambiar la contraseña cierra las demás sesiones abiertas (sube sess_ver).
app.post('/api/me/password', auth.requireAuth, (req, res) => {
  if (!auth.rateLimit('pwd:' + req.user.id, 6, 3600000)) return res.status(429).json({ error: 'Demasiados intentos. Intenta más tarde.' });
  if (!auth.verifyPassword(String(req.body.current || ''), req.user.pass)) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  const next = String(req.body.next || '');
  if (next.length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  const ver = (req.user.sess_ver || 0) + 1;
  db.prepare('UPDATE users SET pass = ?, sess_ver = ? WHERE id = ?').run(auth.hashPassword(next), ver, req.user.id);
  auth.setSession(res, req.user.id, ver);
  res.json({ ok: true });
});

// Exportación de todos los datos del miembro.
app.get('/api/me/export', auth.requireAuth, (req, res) => {
  const uid = req.user.id;
  const q = (sql) => db.prepare(sql).all(uid);
  const data = {
    exportedAt: new Date().toISOString(),
    user: publicUser(req.user),
    lessonsDone: q('SELECT lesson_id, done_at FROM lesson_done WHERE user_id = ?'),
    checklist: q('SELECT lesson_id, idx FROM checks WHERE user_id = ?'),
    milestones: q('SELECT phase_id, idx FROM milestones_done WHERE user_id = ?'),
    deliverables: q('SELECT lesson_id, body, updated_at, review, reviewed_at FROM deliverables WHERE user_id = ?'),
    kpis: q('SELECT metric, value, day, note, created_at FROM kpi_entries WHERE user_id = ?'),
    posts: q('SELECT id, channel, title, body, created_at FROM posts WHERE user_id = ?'),
    comments: q('SELECT post_id, body, created_at FROM comments WHERE user_id = ?'),
    chats: q('SELECT assistant, role, content, created_at FROM chat_msgs WHERE user_id = ? ORDER BY id'),
  };
  res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-elevation.json"');
  res.json(data);
});

app.delete('/api/me', auth.requireAuth, (req, res) => {
  if (!auth.verifyPassword(String(req.body.password || ''), req.user.pass)) return res.status(400).json({ error: 'Contraseña incorrecta.' });
  if (req.user.role === 'admin' && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n <= 1) {
    return res.status(400).json({ error: 'Eres el único administrador: asigna otro antes de eliminar tu cuenta.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  auth.clearSession(res);
  res.json({ ok: true });
});

// ---------- Planes ----------
app.get('/api/plans', (_req, res) => {
  res.json({
    trialDays: TRIAL_DAYS,
    paymentsMode: PAYMENTS_MODE,
    plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p, features: PLAN_FEATURES[id] })),
  });
});

// En modo demo el cambio de plan es inmediato y sin cobro. En producción, reemplazar por Stripe/Mercado Pago.
app.post('/api/billing/change', auth.requireAuth, wrap((req, res) => {
  if (PAYMENTS_MODE !== 'demo') return res.status(501).json({ error: 'Los pagos aún no están conectados.' });
  const plan = String(req.body.plan);
  const billing = req.body.billing === 'annual' ? 'annual' : 'monthly';
  if (!PLANS[plan]) return res.status(400).json({ error: 'Plan no válido.' });
  db.prepare('UPDATE users SET plan = ?, billing = ? WHERE id = ?').run(plan, billing, req.user.id);
  res.json({ user: publicUser(getUser(req.user.id)) });
}));

// ---------- Catálogo y progreso ----------
function progressFor(userId) {
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_done WHERE user_id = ?').all(userId).map((r) => r.lesson_id));
  const ms = db.prepare('SELECT phase_id, idx FROM milestones_done WHERE user_id = ?').all(userId);
  const msSet = new Set(ms.map((m) => `${m.phase_id}:${m.idx}`));
  const delivs = new Set(db.prepare("SELECT lesson_id FROM deliverables WHERE user_id = ? AND trim(body) <> ''").all(userId).map((r) => r.lesson_id));
  return { done, msSet, delivs };
}

app.get('/api/catalog', (req, res) => {
  const user = req.user;
  const { done, msSet, delivs } = user ? progressFor(user.id) : { done: new Set(), msSet: new Set(), delivs: new Set() };
  const phases = content.phases.map((ph) => {
    const lessons = ph.lessons.map((l) => ({
      id: l.id, order: l.order, title: l.title, minutes: l.minutes, summary: l.summary,
      minPlan: l.minPlan, locked: !user ? l.minPlan !== 'free' : !can(user, l.minPlan), done: done.has(l.id), hasDeliverable: delivs.has(l.id),
    }));
    return {
      id: ph.id, order: ph.order, name: ph.name, title: ph.title, subtitle: ph.subtitle, horizon: ph.horizon,
      minPlan: ph.minPlan, intro: ph.intro, premise: ph.premise,
      locked: user ? !can(user, ph.minPlan) : true,
      lessons,
      milestones: ph.milestones.map((m, i) => ({ ...m, idx: i, done: msSet.has(`${ph.id}:${i}`) })),
      errors: ph.errors,
      progress: { done: lessons.filter((l) => l.done).length, total: lessons.length },
    };
  });
  res.json({ phases });
});

// Búsqueda de texto en todas las lecciones (títulos, resúmenes y cuerpo).
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const lessonText = new Map();
for (const ph of content.phases) for (const l of ph.lessons) {
  const parts = [l.title, l.summary];
  for (const b of l.blocks) parts.push(b.text || '', b.title || '', ...(b.items || []), ...(b.head || []), ...(b.rows || []).flat());
  lessonText.set(l.id, parts.filter(Boolean).join(' \n '));
}

app.get('/api/search', (req, res) => {
  const q = norm(clean(req.query.q, 80));
  if (q.length < 3) return res.json({ results: [] });
  const terms = q.split(/\s+/).filter((t) => t.length > 1);
  const results = [];
  for (const ph of content.phases) for (const l of ph.lessons) {
    const raw = lessonText.get(l.id), text = norm(raw);
    if (!terms.every((t) => text.includes(t))) continue;
    const titleHit = terms.some((t) => norm(l.title).includes(t));
    const at = text.indexOf(terms[0]);
    const start = Math.max(0, at - 70);
    const snippet = (start ? '…' : '') + raw.slice(start, at + 150).replace(/\s+/g, ' ').trim() + '…';
    results.push({ id: l.id, title: l.title, phase: ph.name, snippet, score: titleHit ? 2 : 1, locked: req.user ? !can(req.user, l.minPlan) : l.minPlan !== 'free' });
  }
  results.sort((a, b) => b.score - a.score);
  res.json({ results: results.slice(0, 20) });
});

function reviewerFor(user, phaseId) {
  const id = (REVIEWERS[phaseId] || []).find((x) => can(user, ASSISTANTS[x].minPlan));
  return id ? ASSISTANTS[id] : null;
}

app.get('/api/lessons/:id', auth.requireAuth, (req, res) => {
  const l = content.getLesson(req.params.id);
  if (!l) return res.status(404).json({ error: 'Lección no encontrada.' });
  const ph = content.getPhase(l.phaseId);
  if (!can(req.user, l.minPlan)) {
    return res.status(403).json({ error: 'Esta lección requiere un plan superior.', minPlan: l.minPlan, lesson: { id: l.id, title: l.title, summary: l.summary } });
  }
  const uid = req.user.id;
  const checks = db.prepare('SELECT idx FROM checks WHERE user_id = ? AND lesson_id = ?').all(uid, l.id).map((r) => r.idx);
  const del = db.prepare('SELECT body, updated_at, review, reviewed_at, reviewer FROM deliverables WHERE user_id = ? AND lesson_id = ?').get(uid, l.id);
  const done = !!db.prepare('SELECT 1 FROM lesson_done WHERE user_id = ? AND lesson_id = ?').get(uid, l.id);
  const idx = ph.lessons.findIndex((x) => x.id === l.id);
  const link = (x) => (x ? { id: x.id, title: x.title, locked: !can(req.user, x.minPlan) } : null);
  // Al terminar una fase, la siguiente lección es la primera de la fase siguiente.
  const nextPhase = content.phases[content.phases.indexOf(ph) + 1];
  const rv = reviewerFor(req.user, ph.id);
  res.json({
    lesson: { id: l.id, title: l.title, minutes: l.minutes, summary: l.summary, blocks: l.blocks, checklist: l.checklist, deliverable: l.deliverable },
    phase: { id: ph.id, name: ph.name, title: ph.title, order: ph.order, total: ph.lessons.length },
    order: idx + 1,
    state: {
      done, checks,
      deliverable: del ? { body: del.body, updatedAt: del.updated_at } : null,
      review: del && del.review ? { text: del.review, at: del.reviewed_at, by: ASSISTANTS[del.reviewer]?.name || del.reviewer } : null,
    },
    reviewer: rv ? { id: rv.id, name: rv.name } : null,
    prev: link(ph.lessons[idx - 1]), next: link(ph.lessons[idx + 1] || (nextPhase && nextPhase.lessons[0])),
  });
});

function lessonAccess(req, res) {
  const l = content.getLesson(req.params.id);
  if (!l) { res.status(404).json({ error: 'Lección no encontrada.' }); return null; }
  if (!can(req.user, l.minPlan)) { res.status(403).json({ error: 'Esta lección requiere un plan superior.' }); return null; }
  return l;
}

app.post('/api/lessons/:id/complete', auth.requireAuth, (req, res) => {
  const l = lessonAccess(req, res); if (!l) return;
  if (req.body.done === false) db.prepare('DELETE FROM lesson_done WHERE user_id = ? AND lesson_id = ?').run(req.user.id, l.id);
  else db.prepare('INSERT OR IGNORE INTO lesson_done (user_id, lesson_id, done_at) VALUES (?,?,?)').run(req.user.id, l.id, now());
  res.json({ ok: true });
});

app.post('/api/lessons/:id/checks', auth.requireAuth, (req, res) => {
  const l = lessonAccess(req, res); if (!l) return;
  const idx = Number(req.body.idx);
  if (!Number.isInteger(idx) || idx < 0 || idx >= l.checklist.length) return res.status(400).json({ error: 'Ítem no válido.' });
  if (req.body.checked) db.prepare('INSERT OR IGNORE INTO checks (user_id, lesson_id, idx) VALUES (?,?,?)').run(req.user.id, l.id, idx);
  else db.prepare('DELETE FROM checks WHERE user_id = ? AND lesson_id = ? AND idx = ?').run(req.user.id, l.id, idx);
  res.json({ ok: true });
});

app.put('/api/lessons/:id/deliverable', auth.requireAuth, (req, res) => {
  const l = lessonAccess(req, res); if (!l) return;
  const body = String(req.body.body ?? '').slice(0, 20000);
  const t = now();
  db.prepare(
    'INSERT INTO deliverables (user_id, lesson_id, body, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at'
  ).run(req.user.id, l.id, body, t);
  res.json({ ok: true, updatedAt: t });
});

// Revisión con IA del entregable guardado. Cuenta para el límite diario de mensajes.
app.post('/api/lessons/:id/review', auth.requireAuth, wrap(async (req, res) => {
  const l = lessonAccess(req, res); if (!l) return;
  const rv = reviewerFor(req.user, l.phaseId);
  if (!rv) return res.status(403).json({ error: 'La revisión con IA está disponible desde el plan Starter.', minPlan: 'starter' });
  const del = db.prepare('SELECT body FROM deliverables WHERE user_id = ? AND lesson_id = ?').get(req.user.id, l.id);
  if (!del || del.body.trim().length < 40) return res.status(400).json({ error: 'Guarda un entregable de al menos unas líneas antes de pedir revisión.' });
  const limit = DAILY_CHAT_LIMIT[effectivePlan(req.user).plan] || 0;
  if (usedToday(req.user.id) >= limit) return res.status(429).json({ error: `Alcanzaste el límite diario de ${limit} mensajes de tu plan.` });
  if (!auth.rateLimit('review:' + req.user.id, 5, 600000)) return res.status(429).json({ error: 'Espera unos minutos antes de pedir otra revisión.' });
  let out;
  try {
    out = await assistants.review(rv, { lessonTitle: l.title, deliverableTitle: l.deliverable.title, prompt: l.deliverable.prompt, body: del.body, ctx: memberContext(req.user) });
  } catch (e) {
    console.error('[review]', e.message);
    return res.status(502).json({ error: 'No pude contactar al modelo. Intenta de nuevo en un momento.' });
  }
  const t = now();
  if (!out.demo) db.prepare("INSERT INTO chat_msgs (user_id, assistant, role, content, created_at) VALUES (?, 'review', 'user', ?, ?)").run(req.user.id, l.id, t);
  db.prepare('UPDATE deliverables SET review = ?, reviewed_at = ?, reviewer = ? WHERE user_id = ? AND lesson_id = ?').run(out.text, t, rv.id, req.user.id, l.id);
  res.json({ review: { text: out.text, at: t, by: rv.name }, demo: out.demo });
}));

app.post('/api/milestones', auth.requireAuth, (req, res) => {
  const ph = content.getPhase(String(req.body.phase));
  const idx = Number(req.body.idx);
  if (!ph || !Number.isInteger(idx) || idx < 0 || idx >= ph.milestones.length) return res.status(400).json({ error: 'Hito no válido.' });
  if (!can(req.user, ph.minPlan)) return res.status(403).json({ error: 'Esta fase requiere un plan superior.' });
  if (req.body.done) db.prepare('INSERT OR IGNORE INTO milestones_done (user_id, phase_id, idx) VALUES (?,?,?)').run(req.user.id, ph.id, idx);
  else db.prepare('DELETE FROM milestones_done WHERE user_id = ? AND phase_id = ? AND idx = ?').run(req.user.id, ph.id, idx);
  res.json({ ok: true });
});

// Todos los entregables del usuario, para consultarlos o exportarlos.
app.get('/api/deliverables', auth.requireAuth, (req, res) => {
  const rows = db.prepare("SELECT lesson_id, body, updated_at, review, reviewed_at FROM deliverables WHERE user_id = ? AND trim(body) <> '' ORDER BY updated_at DESC").all(req.user.id);
  res.json({
    deliverables: rows.map((r) => {
      const l = content.getLesson(r.lesson_id);
      if (!l) return null;
      const ph = content.getPhase(l.phaseId);
      return { lessonId: l.id, lessonTitle: l.title, title: l.deliverable.title, phase: ph.name, phaseOrder: ph.order, lessonOrder: l.order, body: r.body, updatedAt: r.updated_at, reviewed: !!r.review };
    }).filter(Boolean),
  });
});

// ---------- Dashboard KPI (Pro) ----------
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));

app.get('/api/kpis', auth.requireAuth, auth.requirePlan('pro'), (req, res) => {
  const rows = db.prepare('SELECT id, metric, value, day, note FROM kpi_entries WHERE user_id = ?').all(req.user.id);
  res.json({ metrics: kpis.summarize(rows) });
});

app.post('/api/kpis', auth.requireAuth, auth.requirePlan('pro'), (req, res) => {
  const m = kpis.byId[String(req.body.metric)];
  const value = Number(req.body.value);
  const day = String(req.body.day || new Date().toISOString().slice(0, 10));
  if (!m) return res.status(400).json({ error: 'Indicador no válido.' });
  if (!Number.isFinite(value) || value < 0 || value > 1e9) return res.status(400).json({ error: 'Valor no válido.' });
  if (m.unit === '%' && value > 100) return res.status(400).json({ error: 'Un porcentaje no puede superar 100.' });
  if (!isDay(day)) return res.status(400).json({ error: 'Fecha no válida.' });
  if (!auth.rateLimit('kpi:' + req.user.id, 120, 3600000)) return res.status(429).json({ error: 'Demasiados registros. Intenta más tarde.' });
  db.prepare('INSERT INTO kpi_entries (user_id, metric, value, day, note, created_at) VALUES (?,?,?,?,?,?)').run(req.user.id, m.id, value, day, clean(req.body.note, 200) || null, now());
  res.status(201).json({ ok: true });
});

app.delete('/api/kpis/:id', auth.requireAuth, auth.requirePlan('pro'), (req, res) => {
  db.prepare('DELETE FROM kpi_entries WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------- Agenda ----------
function publicEvent(e, user) {
  const locked = !can(user, e.min_plan);
  return {
    id: e.id, kind: e.kind, kindLabel: EVENT_KINDS[e.kind]?.label || e.kind, title: e.title, description: e.description,
    startsAt: e.starts_at, minPlan: e.min_plan, locked, url: locked ? null : e.url,
  };
}

app.get('/api/events', auth.requireAuth, (req, res) => {
  const past = req.query.past === '1';
  const rows = past
    ? db.prepare('SELECT * FROM events WHERE starts_at < ? ORDER BY starts_at DESC LIMIT 30').all(now() - 3 * 3600000)
    : db.prepare('SELECT * FROM events WHERE starts_at >= ? ORDER BY starts_at LIMIT 50').all(now() - 3 * 3600000);
  res.json({ events: rows.map((e) => publicEvent(e, req.user)), kinds: EVENT_KINDS });
});

function eventInput(body) {
  const kind = String(body.kind);
  const title = clean(body.title, 140);
  const description = clean(body.description, 2000);
  const startsAt = Number(body.startsAt);
  const minPlan = String(body.minPlan || EVENT_KINDS[kind]?.defaultPlan);
  const url = clean(body.url, 500);
  if (!EVENT_KINDS[kind]) return { error: 'Tipo de evento no válido.' };
  if (title.length < 3) return { error: 'Escribe un título.' };
  if (!Number.isFinite(startsAt) || startsAt <= 0) return { error: 'Fecha no válida.' };
  if (!PLANS[minPlan]) return { error: 'Plan no válido.' };
  if (url && !/^https:\/\/\S+$/i.test(url)) return { error: 'El enlace debe empezar con https://' };
  return { kind, title, description, startsAt, minPlan, url: url || null };
}

app.post('/api/admin/events', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const e = eventInput(req.body);
  if (e.error) return res.status(400).json(e);
  const r = db.prepare('INSERT INTO events (kind, title, description, starts_at, url, min_plan, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(e.kind, e.title, e.description, e.startsAt, e.url, e.minPlan, now());
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/admin/events/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const e = eventInput(req.body);
  if (e.error) return res.status(400).json(e);
  const r = db.prepare('UPDATE events SET kind = ?, title = ?, description = ?, starts_at = ?, url = ?, min_plan = ? WHERE id = ?')
    .run(e.kind, e.title, e.description, e.startsAt, e.url, e.minPlan, Number(req.params.id));
  if (!r.changes) return res.status(404).json({ error: 'Evento no encontrado.' });
  res.json({ ok: true });
});

app.delete('/api/admin/events/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  db.prepare('DELETE FROM events WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------- Comunidad ----------
const channelOf = (id) => CHANNELS.find((c) => c.id === id);
const PAGE = 20;

app.get('/api/community/channels', auth.requireAuth, (req, res) => {
  const counts = Object.fromEntries(db.prepare('SELECT channel, COUNT(*) AS n FROM posts GROUP BY channel').all().map((r) => [r.channel, r.n]));
  res.json({ channels: CHANNELS.map((c) => ({ ...c, locked: !can(req.user, c.minPlan), posts: counts[c.id] || 0 })) });
});

app.get('/api/community/posts', auth.requireAuth, (req, res) => {
  const ch = channelOf(String(req.query.channel));
  if (!ch) return res.status(400).json({ error: 'Canal no válido.' });
  if (!can(req.user, ch.minPlan)) return res.status(403).json({ error: 'Este canal requiere un plan superior.', minPlan: ch.minPlan });
  const offset = Math.max(0, Math.min(10000, Number(req.query.offset) || 0));
  const posts = db.prepare(`
    SELECT p.id, p.title, p.body, p.created_at, p.pinned, u.name AS author, u.role AS author_role,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.channel = ? ORDER BY p.pinned DESC, p.created_at DESC LIMIT ? OFFSET ?`).all(ch.id, PAGE + 1, offset);
  res.json({ posts: posts.slice(0, PAGE), more: posts.length > PAGE, nextOffset: offset + PAGE });
});

app.post('/api/community/posts', auth.requireAuth, (req, res) => {
  const ch = channelOf(String(req.body.channel));
  if (!ch) return res.status(400).json({ error: 'Canal no válido.' });
  if (!can(req.user, ch.minPlan)) return res.status(403).json({ error: 'Este canal requiere un plan superior.' });
  if (!auth.rateLimit('post:' + req.user.id, 10, 3600000)) return res.status(429).json({ error: 'Has publicado demasiado. Intenta más tarde.' });
  const title = clean(req.body.title, 140), body = clean(req.body.body, 4000);
  if (title.length < 3 || body.length < 3) return res.status(400).json({ error: 'Escribe un título y un mensaje.' });
  const r = db.prepare('INSERT INTO posts (channel, user_id, title, body, created_at) VALUES (?,?,?,?,?)').run(ch.id, req.user.id, title, body, now());
  res.status(201).json({ id: Number(r.lastInsertRowid) });
});

function postAccess(req, res) {
  const p = db.prepare('SELECT p.*, u.name AS author, u.role AS author_role FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(req.params.id);
  if (!p) { res.status(404).json({ error: 'Publicación no encontrada.' }); return null; }
  if (!can(req.user, channelOf(p.channel).minPlan)) { res.status(403).json({ error: 'Este canal requiere un plan superior.' }); return null; }
  return p;
}

app.get('/api/community/posts/:id', auth.requireAuth, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  const isAdmin = req.user.role === 'admin';
  const comments = db.prepare('SELECT c.id, c.body, c.created_at, c.user_id, u.name AS author, u.role AS author_role FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at').all(p.id)
    .map(({ user_id, ...c }) => ({ ...c, canDelete: isAdmin || user_id === req.user.id }));
  res.json({
    post: { id: p.id, channel: p.channel, title: p.title, body: p.body, author: p.author, author_role: p.author_role, created_at: p.created_at, pinned: !!p.pinned },
    comments, canDelete: isAdmin || req.user.id === p.user_id, canPin: isAdmin,
  });
});

app.post('/api/community/posts/:id/comments', auth.requireAuth, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  if (!auth.rateLimit('cmt:' + req.user.id, 40, 3600000)) return res.status(429).json({ error: 'Demasiados comentarios. Intenta más tarde.' });
  const body = clean(req.body.body, 2000);
  if (body.length < 1) return res.status(400).json({ error: 'Escribe un comentario.' });
  db.prepare('INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?,?,?,?)').run(p.id, req.user.id, body, now());
  res.status(201).json({ ok: true });
});

app.post('/api/community/posts/:id/pin', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  db.prepare('UPDATE posts SET pinned = ? WHERE id = ?').run(req.body.pinned ? 1 : 0, p.id);
  res.json({ ok: true });
});

app.delete('/api/community/posts/:id', auth.requireAuth, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  if (req.user.role !== 'admin' && req.user.id !== p.user_id) return res.status(403).json({ error: 'No puedes eliminar esta publicación.' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

app.delete('/api/community/comments/:id', auth.requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(Number(req.params.id));
  if (!c) return res.status(404).json({ error: 'Comentario no encontrado.' });
  if (req.user.role !== 'admin' && req.user.id !== c.user_id) return res.status(403).json({ error: 'No puedes eliminar este comentario.' });
  db.prepare('DELETE FROM comments WHERE id = ?').run(c.id);
  res.json({ ok: true });
});

// ---------- Asistentes ----------
function usedToday(userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return db.prepare("SELECT COUNT(*) AS n FROM chat_msgs WHERE user_id = ? AND role = 'user' AND created_at >= ?").get(userId, start.getTime()).n;
}

const SEGMENT_LABEL = { novel: 'político novel o activista', consultor: 'consultor o profesional emergente', futuro: 'futuro candidato' };

// Resumen breve del miembro para que el asistente personalice sin que el usuario lo repita.
function memberContext(u) {
  const { done, msSet } = progressFor(u.id);
  const lines = [`Nombre: ${u.name.split(' ')[0]}`];
  if (u.country) lines.push(`País: ${u.country}`);
  if (u.segment) lines.push(`Perfil: ${SEGMENT_LABEL[u.segment]}`);
  lines.push(`Plan: ${PLANS[effectivePlan(u).plan].label}`);
  const current = content.phases.find((ph) => ph.lessons.some((l) => !done.has(l.id))) || content.phases[content.phases.length - 1];
  const phDone = current.lessons.filter((l) => done.has(l.id)).length;
  lines.push(`Fase actual: ${current.name} (${current.title}), ${phDone}/${current.lessons.length} lecciones completadas`);
  const ms = current.milestones.filter((_, i) => msSet.has(`${current.id}:${i}`)).map((m) => m.hito);
  if (ms.length) lines.push(`Hitos logrados en esta fase: ${ms.join(', ')}`);
  const recent = db.prepare("SELECT lesson_id, body FROM deliverables WHERE user_id = ? AND trim(body) <> '' ORDER BY updated_at DESC LIMIT 3").all(u.id);
  for (const d of recent) {
    const l = content.getLesson(d.lesson_id);
    if (l) lines.push(`Entregable «${l.deliverable.title}»: ${d.body.replace(/\s+/g, ' ').slice(0, 400)}${d.body.length > 400 ? '…' : ''}`);
  }
  return lines.join('\n');
}

app.get('/api/assistants', auth.requireAuth, (req, res) => {
  const eff = effectivePlan(req.user).plan;
  res.json({
    configured: !!process.env.ANTHROPIC_API_KEY,
    dailyLimit: DAILY_CHAT_LIMIT[eff] || 0,
    usedToday: usedToday(req.user.id),
    assistants: Object.values(ASSISTANTS).map((a) => ({ id: a.id, name: a.name, area: a.area, desc: a.desc, minPlan: a.minPlan, starters: a.starters, locked: !can(req.user, a.minPlan) })),
  });
});

app.get('/api/assistants/:id/history', auth.requireAuth, (req, res) => {
  const a = ASSISTANTS[req.params.id];
  if (!a) return res.status(404).json({ error: 'Asistente no encontrado.' });
  if (!can(req.user, a.minPlan)) return res.status(403).json({ error: 'Este asistente requiere un plan superior.', minPlan: a.minPlan });
  const rows = db.prepare('SELECT role, content, created_at FROM chat_msgs WHERE user_id = ? AND assistant = ? ORDER BY id DESC LIMIT 40').all(req.user.id, a.id).reverse();
  res.json({ messages: rows });
});

app.delete('/api/assistants/:id/history', auth.requireAuth, (req, res) => {
  if (!ASSISTANTS[req.params.id]) return res.status(404).json({ error: 'Asistente no encontrado.' });
  db.prepare('DELETE FROM chat_msgs WHERE user_id = ? AND assistant = ?').run(req.user.id, req.params.id);
  res.json({ ok: true });
});

// Respuesta en streaming (Server-Sent Events): eventos {t: fragmento}, luego {done, demo} o {error}.
app.post('/api/assistants/:id/chat', auth.requireAuth, wrap(async (req, res) => {
  const a = ASSISTANTS[req.params.id];
  if (!a) return res.status(404).json({ error: 'Asistente no encontrado.' });
  if (!can(req.user, a.minPlan)) return res.status(403).json({ error: 'Este asistente requiere un plan superior.', minPlan: a.minPlan });
  const message = clean(req.body.message, 4000);
  if (!message) return res.status(400).json({ error: 'Escribe un mensaje.' });
  const limit = DAILY_CHAT_LIMIT[effectivePlan(req.user).plan] || 0;
  if (usedToday(req.user.id) >= limit) return res.status(429).json({ error: `Alcanzaste el límite diario de ${limit} mensajes de tu plan.` });
  if (!auth.rateLimit('chat:' + req.user.id, 12, 60000)) return res.status(429).json({ error: 'Vas muy rápido. Espera un momento.' });

  const history = db.prepare('SELECT role, content FROM chat_msgs WHERE user_id = ? AND assistant = ? ORDER BY id DESC LIMIT 12').all(req.user.id, a.id).reverse();
  // La API exige que la conversación empiece con un turno del usuario.
  while (history.length && history[0].role !== 'user') history.shift();

  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' });
  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
  const ctrl = new AbortController();
  res.on('close', () => { if (!res.writableFinished) ctrl.abort(); });
  const timeout = setTimeout(() => ctrl.abort(), 90000);

  try {
    const out = await assistants.stream(a, history, message, { ctx: memberContext(req.user), onText: (t) => send({ t }), signal: ctrl.signal });
    const t = now();
    const ins = db.prepare('INSERT INTO chat_msgs (user_id, assistant, role, content, created_at) VALUES (?,?,?,?,?)');
    ins.run(req.user.id, a.id, 'user', message, t);
    ins.run(req.user.id, a.id, 'assistant', out.text, t + 1);
    send({ done: true, demo: out.demo });
  } catch (e) {
    if (!res.destroyed) console.error('[assistant]', e.message);
    if (!res.destroyed) send({ error: 'No pude contactar al modelo. Intenta de nuevo en un momento.' });
  } finally {
    clearTimeout(timeout);
    res.end();
  }
}));

// ---------- Administración ----------
app.get('/api/admin/stats', auth.requireAuth, auth.requireAdmin, (_req, res) => {
  const t = now();
  const one = (sql, ...a) => db.prepare(sql).get(...a).n;
  const byPlan = db.prepare('SELECT plan, COUNT(*) AS n FROM users GROUP BY plan').all();
  const paid = db.prepare("SELECT plan, billing, COUNT(*) AS n FROM users WHERE plan <> 'free' GROUP BY plan, billing").all();
  const mrr = paid.reduce((a, r) => a + r.n * (r.billing === 'annual' ? PLANS[r.plan].annual / 12 : PLANS[r.plan].monthly), 0);
  res.json({
    total: one('SELECT COUNT(*) AS n FROM users'),
    new7: one('SELECT COUNT(*) AS n FROM users WHERE created_at >= ?', t - 7 * DAY),
    active7: one('SELECT COUNT(*) AS n FROM users WHERE last_seen_at >= ?', t - 7 * DAY),
    trials: one("SELECT COUNT(*) AS n FROM users WHERE plan = 'free' AND trial_ends_at > ?", t),
    byPlan, mrr: Math.round(mrr),
    lessons: one('SELECT COUNT(*) AS n FROM lesson_done'),
    deliverables: one("SELECT COUNT(*) AS n FROM deliverables WHERE trim(body) <> ''"),
    posts: one('SELECT COUNT(*) AS n FROM posts'),
    msgs: one("SELECT COUNT(*) AS n FROM chat_msgs WHERE role = 'user'"),
    topLessons: db.prepare('SELECT lesson_id, COUNT(*) AS n FROM lesson_done GROUP BY lesson_id ORDER BY n DESC LIMIT 5').all()
      .map((r) => ({ title: content.getLesson(r.lesson_id)?.title || r.lesson_id, n: r.n })),
  });
});

function adminUsers(q) {
  const like = `%${q}%`;
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.plan, u.role, u.country, u.segment, u.created_at, u.last_seen_at, u.trial_ends_at,
      (SELECT COUNT(*) FROM lesson_done d WHERE d.user_id = u.id) AS lessons_done
    FROM users u WHERE (? = '' OR u.name LIKE ? OR u.email LIKE ? OR u.country LIKE ?)
    ORDER BY u.created_at DESC LIMIT 500`).all(q, like, like, like);
}

app.get('/api/admin/users', auth.requireAuth, auth.requireAdmin, (req, res) => {
  res.json({ users: adminUsers(clean(req.query.q, 80)) });
});

app.get('/api/admin/users.csv', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita inyección de fórmulas en hojas de cálculo
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const iso = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : '');
  const rows = adminUsers(clean(req.query.q, 80));
  const lines = [['id', 'nombre', 'correo', 'plan', 'rol', 'pais', 'perfil', 'alta', 'ultima_actividad', 'lecciones'].join(',')]
    .concat(rows.map((u) => [u.id, u.name, u.email, u.plan, u.role, u.country, u.segment, iso(u.created_at), iso(u.last_seen_at), u.lessons_done].map(cell).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="usuarios-elevation.csv"');
  res.send('﻿' + lines.join('\n'));
});

app.patch('/api/admin/users/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = getUser(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const plan = req.body.plan !== undefined ? String(req.body.plan) : u.plan;
  const role = req.body.role !== undefined ? String(req.body.role) : u.role;
  if (!PLANS[plan] || !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Datos no válidos.' });
  if (u.id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'No puedes quitarte el rol de administrador.' });
  const trial = req.body.extendTrial ? now() + TRIAL_DAYS * DAY : u.trial_ends_at;
  db.prepare('UPDATE users SET plan = ?, role = ?, trial_ends_at = ? WHERE id = ?').run(plan, role, trial, id);
  res.json({ ok: true });
});

// ---------- Estático y errores ----------
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders: (res, file) => { if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
}));
app.get('*', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(__dirname, 'public', 'index.html')); });

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'El contenido es demasiado grande.' });
  console.error(err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// Administrador inicial por variables de entorno.
(function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 8) return;
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) { db.prepare("UPDATE users SET role = 'admin', plan = 'elite' WHERE id = ?").run(existing.id); return; }
  db.prepare('INSERT INTO users (name, email, pass, plan, role, created_at) VALUES (?,?,?,?,?,?)')
    .run('Administrador', email, auth.hashPassword(password), 'elite', 'admin', now());
  console.log('Administrador inicial creado:', email);
})();

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  console.warn('Aviso: SESSION_SECRET no está definido; se usa un secreto generado en DATA_DIR/.secret.');
}

if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Elevation Escuela en http://localhost:${PORT}`));
  // Cierre ordenado: deja terminar las peticiones en curso y cierra la base.
  const shutdown = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 8000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = app;
