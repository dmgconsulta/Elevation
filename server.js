const express = require('express');
const path = require('path');
const db = require('./lib/db');
const auth = require('./lib/auth');
const plansLib = require('./lib/plans');
const assistants = require('./lib/assistants');
const content = require('./content');

const { PLANS, PLAN_FEATURES, TRIAL_DAYS, DAY, rank, effectivePlan, can, CHANNELS, ASSISTANTS, DAILY_CHAT_LIMIT } = plansLib;
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
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com 'unsafe-inline'; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
  );
  next();
});

app.use(express.json({ limit: '100kb' }));

// Defensa CSRF: toda escritura debe llegar como JSON (un formulario cruzado no puede).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Content-Type debe ser application/json.' });
  }
  next();
});

app.use('/api', auth.attachUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => Date.now();
const clean = (s, max) => String(s ?? '').trim().slice(0, max);

function publicUser(u) {
  const eff = effectivePlan(u);
  return {
    id: u.id, name: u.name, email: u.email, role: u.role, country: u.country, segment: u.segment,
    plan: u.plan, effectivePlan: eff.plan, trial: eff.trial,
    trialEndsAt: eff.trial ? u.trial_ends_at : null,
  };
}

// ---------- Auth ----------
app.post('/api/auth/register', wrap((req, res) => {
  if (!auth.rateLimit('reg:' + req.ip, 10, 3600000)) return res.status(429).json({ error: 'Demasiados registros. Intenta más tarde.' });
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const country = clean(req.body.country, 60);
  const segment = ['novel', 'consultor', 'futuro'].includes(req.body.segment) ? req.body.segment : null;
  if (name.length < 2) return res.status(400).json({ error: 'Escribe tu nombre.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Correo no válido.' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'Ya existe una cuenta con ese correo.' });
  const t = now();
  const r = db.prepare(
    'INSERT INTO users (name, email, pass, plan, trial_ends_at, role, country, segment, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
  ).run(name, email, auth.hashPassword(password), 'free', t + TRIAL_DAYS * DAY, 'member', country || null, segment, t);
  auth.setSession(res, Number(r.lastInsertRowid));
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid);
  res.status(201).json({ user: publicUser(u) });
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  if (!auth.rateLimit('login:' + req.ip + email, 8, 15 * 60000)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!u || !auth.verifyPassword(String(req.body.password || ''), u.pass)) return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  auth.setSession(res, u.id);
  res.json({ user: publicUser(u) });
}));

app.post('/api/auth/logout', (_req, res) => { auth.clearSession(res); res.json({ ok: true }); });

app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));

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
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
}));

// ---------- Catálogo y progreso ----------
function progressFor(userId) {
  const done = new Set(db.prepare('SELECT lesson_id FROM lesson_done WHERE user_id = ?').all(userId).map((r) => r.lesson_id));
  const ms = db.prepare('SELECT phase_id, idx FROM milestones_done WHERE user_id = ?').all(userId);
  const msSet = new Set(ms.map((m) => `${m.phase_id}:${m.idx}`));
  return { done, msSet };
}

app.get('/api/catalog', (req, res) => {
  const user = req.user;
  const { done, msSet } = user ? progressFor(user.id) : { done: new Set(), msSet: new Set() };
  const phases = content.phases.map((ph) => {
    const lessons = ph.lessons.map((l) => ({
      id: l.id, order: l.order, title: l.title, minutes: l.minutes, summary: l.summary,
      minPlan: l.minPlan, locked: !user ? l.minPlan !== 'free' : !can(user, l.minPlan), done: done.has(l.id),
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

app.get('/api/lessons/:id', auth.requireAuth, (req, res) => {
  const l = content.getLesson(req.params.id);
  if (!l) return res.status(404).json({ error: 'Lección no encontrada.' });
  const ph = content.getPhase(l.phaseId);
  if (!can(req.user, l.minPlan)) {
    return res.status(403).json({ error: 'Esta lección requiere un plan superior.', minPlan: l.minPlan, lesson: { id: l.id, title: l.title, summary: l.summary } });
  }
  const uid = req.user.id;
  const checks = db.prepare('SELECT idx FROM checks WHERE user_id = ? AND lesson_id = ?').all(uid, l.id).map((r) => r.idx);
  const del = db.prepare('SELECT body, updated_at FROM deliverables WHERE user_id = ? AND lesson_id = ?').get(uid, l.id);
  const done = !!db.prepare('SELECT 1 FROM lesson_done WHERE user_id = ? AND lesson_id = ?').get(uid, l.id);
  const idx = ph.lessons.findIndex((x) => x.id === l.id);
  const link = (x) => (x ? { id: x.id, title: x.title, locked: !can(req.user, x.minPlan) } : null);
  res.json({
    lesson: { id: l.id, title: l.title, minutes: l.minutes, summary: l.summary, blocks: l.blocks, checklist: l.checklist, deliverable: l.deliverable },
    phase: { id: ph.id, name: ph.name, title: ph.title },
    state: { done, checks, deliverable: del ? { body: del.body, updatedAt: del.updated_at } : null },
    prev: link(ph.lessons[idx - 1]), next: link(ph.lessons[idx + 1]),
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
  db.prepare(
    'INSERT INTO deliverables (user_id, lesson_id, body, updated_at) VALUES (?,?,?,?) ON CONFLICT(user_id, lesson_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at'
  ).run(req.user.id, l.id, body, now());
  res.json({ ok: true, updatedAt: now() });
});

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
  const rows = db.prepare('SELECT lesson_id, body, updated_at FROM deliverables WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json({
    deliverables: rows.map((r) => {
      const l = content.getLesson(r.lesson_id);
      return l ? { lessonId: l.id, lessonTitle: l.title, title: l.deliverable.title, phase: content.getPhase(l.phaseId).name, body: r.body, updatedAt: r.updated_at } : null;
    }).filter(Boolean),
  });
});

// ---------- Comunidad ----------
const channelOf = (id) => CHANNELS.find((c) => c.id === id);

app.get('/api/community/channels', auth.requireAuth, (req, res) => {
  res.json({ channels: CHANNELS.map((c) => ({ ...c, locked: !can(req.user, c.minPlan) })) });
});

app.get('/api/community/posts', auth.requireAuth, (req, res) => {
  const ch = channelOf(String(req.query.channel));
  if (!ch) return res.status(400).json({ error: 'Canal no válido.' });
  if (!can(req.user, ch.minPlan)) return res.status(403).json({ error: 'Este canal requiere un plan superior.', minPlan: ch.minPlan });
  const posts = db.prepare(`
    SELECT p.id, p.title, p.body, p.created_at, u.name AS author,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comments
    FROM posts p JOIN users u ON u.id = p.user_id WHERE p.channel = ? ORDER BY p.created_at DESC LIMIT 50`).all(ch.id);
  res.json({ posts });
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
  const p = db.prepare('SELECT p.*, u.name AS author FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ?').get(req.params.id);
  if (!p) { res.status(404).json({ error: 'Publicación no encontrada.' }); return null; }
  if (!can(req.user, channelOf(p.channel).minPlan)) { res.status(403).json({ error: 'Este canal requiere un plan superior.' }); return null; }
  return p;
}

app.get('/api/community/posts/:id', auth.requireAuth, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  const comments = db.prepare('SELECT c.id, c.body, c.created_at, u.name AS author FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.created_at').all(p.id);
  res.json({ post: { id: p.id, channel: p.channel, title: p.title, body: p.body, author: p.author, created_at: p.created_at }, comments, canDelete: req.user.role === 'admin' || req.user.id === p.user_id });
});

app.post('/api/community/posts/:id/comments', auth.requireAuth, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  if (!auth.rateLimit('cmt:' + req.user.id, 40, 3600000)) return res.status(429).json({ error: 'Demasiados comentarios. Intenta más tarde.' });
  const body = clean(req.body.body, 2000);
  if (body.length < 1) return res.status(400).json({ error: 'Escribe un comentario.' });
  db.prepare('INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?,?,?,?)').run(p.id, req.user.id, body, now());
  res.status(201).json({ ok: true });
});

app.delete('/api/community/posts/:id', auth.requireAuth, (req, res) => {
  const p = postAccess(req, res); if (!p) return;
  if (req.user.role !== 'admin' && req.user.id !== p.user_id) return res.status(403).json({ error: 'No puedes eliminar esta publicación.' });
  db.prepare('DELETE FROM posts WHERE id = ?').run(p.id);
  res.json({ ok: true });
});

// ---------- Asistentes ----------
function usedToday(userId) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return db.prepare("SELECT COUNT(*) AS n FROM chat_msgs WHERE user_id = ? AND role = 'user' AND created_at >= ?").get(userId, start.getTime()).n;
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
  db.prepare('DELETE FROM chat_msgs WHERE user_id = ? AND assistant = ?').run(req.user.id, String(req.params.id));
  res.json({ ok: true });
});

app.post('/api/assistants/:id/chat', auth.requireAuth, wrap(async (req, res) => {
  const a = ASSISTANTS[req.params.id];
  if (!a) return res.status(404).json({ error: 'Asistente no encontrado.' });
  if (!can(req.user, a.minPlan)) return res.status(403).json({ error: 'Este asistente requiere un plan superior.', minPlan: a.minPlan });
  const message = clean(req.body.message, 4000);
  if (!message) return res.status(400).json({ error: 'Escribe un mensaje.' });
  const limit = DAILY_CHAT_LIMIT[effectivePlan(req.user).plan] || 0;
  if (usedToday(req.user.id) >= limit) return res.status(429).json({ error: `Alcanzaste el límite diario de ${limit} mensajes de tu plan.` });
  if (!auth.rateLimit('chat:' + req.user.id, 12, 60000)) return res.status(429).json({ error: 'Vas muy rápido. Espera un momento.' });

  const history = db.prepare('SELECT role, content FROM chat_msgs WHERE user_id = ? AND assistant = ? ORDER BY id DESC LIMIT 10').all(req.user.id, a.id).reverse();
  let out;
  try { out = await assistants.reply(a, history, message); }
  catch (e) {
    console.error('[assistant]', e.message);
    return res.status(502).json({ error: 'No pude contactar al modelo. Intenta de nuevo en un momento.' });
  }
  const t = now();
  const ins = db.prepare('INSERT INTO chat_msgs (user_id, assistant, role, content, created_at) VALUES (?,?,?,?,?)');
  ins.run(req.user.id, a.id, 'user', message, t);
  ins.run(req.user.id, a.id, 'assistant', out.text, t + 1);
  res.json({ reply: out.text, demo: out.demo });
}));

// ---------- Administración ----------
app.get('/api/admin/stats', auth.requireAuth, auth.requireAdmin, (_req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const byPlan = db.prepare('SELECT plan, COUNT(*) AS n FROM users GROUP BY plan').all();
  const lessons = db.prepare('SELECT COUNT(*) AS n FROM lesson_done').get().n;
  const posts = db.prepare('SELECT COUNT(*) AS n FROM posts').get().n;
  const msgs = db.prepare("SELECT COUNT(*) AS n FROM chat_msgs WHERE role = 'user'").get().n;
  res.json({ total, byPlan, lessons, posts, msgs });
});

app.get('/api/admin/users', auth.requireAuth, auth.requireAdmin, (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.plan, u.role, u.country, u.segment, u.created_at,
      (SELECT COUNT(*) FROM lesson_done d WHERE d.user_id = u.id) AS lessons_done
    FROM users u ORDER BY u.created_at DESC LIMIT 500`).all();
  res.json({ users });
});

app.patch('/api/admin/users/:id', auth.requireAuth, auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const plan = req.body.plan !== undefined ? String(req.body.plan) : u.plan;
  const role = req.body.role !== undefined ? String(req.body.role) : u.role;
  if (!PLANS[plan] || !['member', 'admin'].includes(role)) return res.status(400).json({ error: 'Datos no válidos.' });
  if (u.id === req.user.id && role !== 'admin') return res.status(400).json({ error: 'No puedes quitarte el rol de administrador.' });
  db.prepare('UPDATE users SET plan = ?, role = ? WHERE id = ?').run(plan, role, id);
  res.json({ ok: true });
});

// ---------- Estático y errores ----------
app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
  console.error(err);
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

app.listen(PORT, () => console.log(`Elevation Escuela en http://localhost:${PORT}`));
