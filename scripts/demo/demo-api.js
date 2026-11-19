/* Demo sin servidor: simula la API de la plataforma dentro del navegador.
   Intercepta fetch('/api/...') y responde con la misma forma que server.js.
   Los datos viven en memoria y en localStorage del visitante. Los asistentes devuelven respuestas de ejemplo. */
(() => {
  'use strict';
  const D = window.DEMO_DATA, summarize = window.DEMO_SUMMARIZE;
  const { PLANS, PLAN_FEATURES, TRIAL_DAYS, CHANNELS, ASSISTANTS, DAILY_CHAT_LIMIT, EVENT_KINDS, REVIEWERS } = D;
  const DAY = 86400000, KEY = 'elevation-demo-v1';
  const now = () => Date.now();
  const clean = (s, max) => String(s ?? '').trim().slice(0, max);

  // ---------- Contenido ----------
  const phases = D.phases;
  const lessonIndex = new Map();
  for (const ph of phases) ph.lessons.forEach((l, i) => { l.phaseId = ph.id; l.order = i + 1; l.minPlan = l.free ? 'free' : ph.minPlan; lessonIndex.set(l.id, l); });
  const getLesson = (id) => lessonIndex.get(id);
  const getPhase = (id) => phases.find((p) => p.id === id);

  // ---------- Estado ----------
  function seed() {
    const t = now();
    const s = { seq: 100, session: null, users: [], lessonDone: [], checks: [], milestones: [], deliverables: [], kpis: [], posts: [], comments: [], chats: [], events: [], leads: [] };
    s.users.push({ id: 1, name: 'Equipo Elevation', email: 'admin@elevation.demo', pass: 'demo1234', plan: 'elite', billing: 'monthly', role: 'admin', country: 'México', segment: null, trial_ends_at: null, created_at: t - 90 * DAY, last_seen_at: t });
    s.users.push({ id: 2, name: 'Miembro de prueba', email: 'demo@elevation.demo', pass: 'demo1234', plan: 'pro', billing: 'monthly', role: 'member', country: 'Colombia', segment: 'futuro', trial_ends_at: null, created_at: t - 20 * DAY, last_seen_at: t });
    s.users.push({ id: 3, name: 'Lucía Paredes', email: 'lucia@ejemplo.demo', pass: 'x', plan: 'starter', billing: 'monthly', role: 'member', country: 'Perú', segment: 'novel', trial_ends_at: null, created_at: t - 12 * DAY, last_seen_at: t - DAY });
    s.users.push({ id: 4, name: 'Andrés Villa', email: 'andres@ejemplo.demo', pass: 'x', plan: 'free', billing: 'monthly', role: 'member', country: 'Chile', segment: 'consultor', trial_ends_at: t + 2 * DAY, created_at: t - DAY, last_seen_at: t - 3600000 });
    // Progreso de ejemplo del miembro de prueba
    ['s1', 's2'].forEach((id, i) => s.lessonDone.push({ user_id: 2, lesson_id: id, done_at: t - (5 - i) * DAY }));
    s.deliverables.push({ user_id: 2, lesson_id: 's1', body: 'Soy hija de maestros rurales de Boyacá. Quiero estar en política porque vi cómo una escuela cerraba por falta de transporte y nadie respondía. Defiendo la educación pública y la transparencia. Represento a familias jóvenes de municipios intermedios. Mi visión: municipios donde estudiar no dependa del código postal.', updated_at: t - 5 * DAY, review: null, reviewed_at: null, reviewer: null });
    s.milestones.push({ user_id: 2, phase_id: 'start', idx: 1 });
    [['libros', 2, 70], ['libros', 3, 40], ['libros', 1, 10], ['presentaciones', 2, 30], ['presentaciones', 3, 8], ['aliados', 9, 60], ['aliados', 16, 20], ['aliados', 22, 3], ['seguidores', 850, 50], ['seguidores', 1320, 5]]
      .forEach(([m, v, d]) => s.kpis.push({ id: ++s.seq, user_id: 2, metric: m, value: v, day: new Date(t - d * DAY).toISOString().slice(0, 10), note: null, created_at: t - d * DAY }));
    const p1 = ++s.seq, p2 = ++s.seq;
    s.posts.push({ id: p1, channel: 'abierta', user_id: 1, title: 'Bienvenida a tu red', body: 'Preséntate: quién eres, desde qué territorio escribes y en qué fase estás. Esta es la demo de Mi red: puedes publicar y responder.', created_at: t - 10 * DAY, pinned: 1 });
    s.posts.push({ id: p2, channel: 'abierta', user_id: 3, title: '¿Cómo clasifico a los actores fríos?', body: 'Estoy armando mi mapa de actores y no sé dónde poner a quienes no responden pero tampoco se oponen.', created_at: t - 2 * DAY, pinned: 0 });
    s.posts.push({ id: ++s.seq, channel: 'cerrada', user_id: 2, title: 'Mi narrativa de 90 segundos', body: 'La subo para que me digan dónde suena a discurso y dónde suena a verdad.', created_at: t - DAY, pinned: 0 });
    s.comments.push({ id: ++s.seq, post_id: p2, user_id: 2, body: 'A mí me sirvió separarlos por interés en mi causa: los fríos con interés van primero.', created_at: t - DAY });
    const at = (days, h) => { const d = new Date(t + days * DAY); d.setHours(h, 0, 0, 0); return d.getTime(); };
    [['vivo', 'Sesión en vivo: narrativa en 90 segundos', 'Practicamos la estructura Origen, Tensión, Propuesta con casos reales.', at(2, 19), 'pro'],
     ['taller', 'Taller abierto: tu primer mapa de actores', 'Plantilla y ejercicio guiado para clasificar 50 actores.', at(6, 18), 'starter'],
     ['mentoria', 'Mentoría grupal: partido o ruta independiente', 'Trae tu caso: lo analizamos en grupo con estrategas.', at(9, 20), 'elite'],
     ['convocatoria', 'Convocatoria: programa de vocerías juveniles', 'Selección de 20 perfiles para entrenamiento de medios.', at(15, 12), 'elite']]
      .forEach(([kind, title, description, starts_at, min_plan]) => s.events.push({ id: ++s.seq, kind, title, description, starts_at, url: 'https://ejemplo.com/sesion', min_plan, created_at: t }));
    [['Camila Rojas', 'camila@ejemplo.demo', 'Chile', 2.6, 3.4, 'Centro'], ['Mateo Ruiz', 'mateo@ejemplo.demo', 'Argentina', 4.1, 2.2, 'Derecha liberal'], ['Lucía Paredes', 'lucia@ejemplo.demo', 'Perú', 2.1, 2.0, 'Izquierda progresista']]
      .forEach(([name, email, country, economia, orden, zona], i) => s.leads.push({ id: ++s.seq, name, email, country, economia, orden, zona, created_at: t - (i + 1) * DAY }));
    return s;
  }
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!S || !S.users) S = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const nextId = () => ++S.seq;

  // ---------- Reglas (iguales a lib/plans.js) ----------
  const rank = (plan) => (PLANS[plan] ? PLANS[plan].rank : 0);
  function effectivePlan(u, t = now()) {
    if (rank(u.plan) >= 1) return { plan: u.plan, trial: false };
    if (u.trial_ends_at && u.trial_ends_at > t) return { plan: 'starter', trial: true };
    return { plan: 'free', trial: false };
  }
  const can = (u, min) => rank(effectivePlan(u).plan) >= rank(min);
  const userById = (id) => S.users.find((u) => u.id === id);
  function publicUser(u) {
    const eff = effectivePlan(u);
    return { id: u.id, name: u.name, email: u.email, role: u.role, country: u.country, segment: u.segment, plan: u.plan, billing: u.billing,
      effectivePlan: eff.plan, trial: eff.trial, trialEndsAt: eff.trial ? u.trial_ends_at : null, createdAt: u.created_at };
  }

  // ---------- Respuestas ----------
  class HttpError extends Error { constructor(status, body) { super(body.error); this.status = status; this.body = body; } }
  const fail = (status, error, extra) => { throw new HttpError(status, { error, ...extra }); };
  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

  const progressFor = (uid) => ({
    done: new Set(S.lessonDone.filter((r) => r.user_id === uid).map((r) => r.lesson_id)),
    msSet: new Set(S.milestones.filter((r) => r.user_id === uid).map((m) => `${m.phase_id}:${m.idx}`)),
    delivs: new Set(S.deliverables.filter((r) => r.user_id === uid && r.body.trim()).map((r) => r.lesson_id)),
  });
  function usedToday(uid) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return S.chats.filter((m) => m.user_id === uid && m.role === 'user' && m.created_at >= start.getTime()).length;
  }
  function reviewerFor(u, phaseId) {
    const id = (REVIEWERS[phaseId] || []).find((x) => can(u, ASSISTANTS[x].minPlan));
    return id ? ASSISTANTS[id] : null;
  }
  const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const lessonText = new Map();
  for (const ph of phases) for (const l of ph.lessons) {
    const parts = [l.title, l.summary];
    for (const b of l.blocks) parts.push(b.text || '', b.title || '', ...(b.items || []), ...(b.head || []), ...(b.rows || []).flat());
    lessonText.set(l.id, parts.filter(Boolean).join(' \n '));
  }
  function publicEvent(e, u) {
    const locked = !can(u, e.min_plan);
    return { id: e.id, kind: e.kind, kindLabel: EVENT_KINDS[e.kind]?.label || e.kind, title: e.title, description: e.description, startsAt: e.starts_at, minPlan: e.min_plan, locked, url: locked ? null : e.url };
  }
  function eventInput(b) {
    const kind = String(b.kind), title = clean(b.title, 140), startsAt = Number(b.startsAt), minPlan = String(b.minPlan || EVENT_KINDS[kind]?.defaultPlan), url = clean(b.url, 500);
    if (!EVENT_KINDS[kind]) fail(400, 'Tipo de evento no válido.');
    if (title.length < 3) fail(400, 'Escribe un título.');
    if (!Number.isFinite(startsAt) || startsAt <= 0) fail(400, 'Fecha no válida.');
    if (!PLANS[minPlan]) fail(400, 'Plan no válido.');
    if (url && !/^https:\/\/\S+$/i.test(url)) fail(400, 'El enlace debe empezar con https://');
    return { kind, title, description: clean(b.description, 2000), starts_at: startsAt, min_plan: minPlan, url: url || null };
  }

  // Respuestas de ejemplo de los asistentes (la demo no se conecta a un modelo).
  const SAMPLE = {
    freya: (u, msg) => `Hola, ${u.name.split(' ')[0]}. Así trabajaría tu texto como **ficha de lectura**:\n\n### 3 ideas clave\n1. Identifica la tesis central en una frase.\n2. Separa los datos verificables de las opiniones del autor.\n3. Anota qué conflicto o tensión describe.\n\n### 1 aplicación práctica\n- Conecta la idea más fuerte con tu territorio: ¿a quién afecta y qué podrías proponer?\n\nPégame el texto completo y te devuelvo la ficha lista para tu diario político.`,
    nova: (u) => `Vamos con tu narrativa, ${u.name.split(' ')[0]}. Estructura de **90 segundos**:\n\n- **Origen (20 s):** un momento concreto, con lugar y personas.\n- **Tensión (35 s):** el problema que te interpela y por qué no puedes ignorarlo.\n- **Propuesta (35 s):** lo que tú puedes hacer y nadie más igual.\n\nEvita frases como «quiero un mejor país»: son ruido. Escríbeme tu borrador y lo afinamos línea por línea.`,
    atenea: (u) => `Para decidir bien necesito tres datos: **tu territorio**, **tu fase actual** y **tu red activa** (cuántos aliados responden).\n\nMientras tanto, una regla del método: *no hay rutas incorrectas, hay rutas prematuras*. Si aún no tienes 30 aliados activos, prioriza la Fase 2 antes de cualquier candidatura.\n\n¿En qué país y municipio estás, ${u.name.split(' ')[0]}?`,
    charlie: () => `Propuesta de cronograma de **11 semanas**:\n\n1. Semanas 1–2: diagnóstico territorial y metas por barrio.\n2. Semanas 3–6: puerta a puerta, 3 jornadas semanales.\n3. Semanas 7–9: eventos de escucha y base de voluntarios.\n4. Semanas 10–11: cierre, movilización y cuidado del voto.\n\nDime tu presupuesto y tamaño de equipo y lo convierto en metas semanales medibles.`,
  };
  const SAMPLE_REVIEW = (name) => `### Lo que está bien\n- Partes de una experiencia concreta y verificable.\n- Tus valores aparecen ligados a un problema real.\n\n### Lo que falta o es débil\n- La consigna pide responder las cinco preguntas por separado; algunas quedan mezcladas.\n- Falta precisar a qué sector representas con datos (edad, territorio, ocupación).\n\n### Siguiente versión\n1. Reescribe cada respuesta en un párrafo propio.\n2. Añade una cifra o hecho que respalde tu visión.\n3. Léela en voz alta a alguien escéptico y anota sus dudas.\n\n### Veredicto\nCasi listo: la base es auténtica, falta estructura.\n\n*Revisión de ejemplo de la demo (${name}). En la plataforma real la escribe el asistente a partir de tu texto.*`;

  function memberChatStream(text) {
    const enc = new TextEncoder();
    const pieces = text.match(/[\s\S]{1,14}/g) || [];
    return new ReadableStream({
      async start(ctrl) {
        for (const t of pieces) { ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ t })}\n\n`)); await new Promise((r) => setTimeout(r, 22)); }
        ctrl.enqueue(enc.encode(`data: ${JSON.stringify({ done: true, demo: true })}\n\n`));
        ctrl.close();
      },
    });
  }

  // ---------- Rutas ----------
  const routes = [];
  const on = (method, pattern, opts, fn) => {
    if (typeof opts === 'function') { fn = opts; opts = {}; }
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, opts, fn });
  };
  const needPlan = (u, min) => { if (!can(u, min)) fail(403, 'Tu membresía actual no incluye esta función.', { minPlan: min }); };

  on('POST', '/auth/register', ({ body }) => {
    const name = clean(body.name, 80), email = clean(body.email, 120).toLowerCase(), password = String(body.password || '');
    if (name.length < 2) fail(400, 'Escribe tu nombre.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(400, 'Correo no válido.');
    if (password.length < 8) fail(400, 'La contraseña debe tener al menos 8 caracteres.');
    if (S.users.some((u) => u.email === email)) fail(409, 'Ya existe una cuenta con ese correo.');
    const t = now();
    const u = { id: nextId(), name, email, pass: password, plan: 'free', billing: 'monthly', role: 'member', country: clean(body.country, 60) || null,
      segment: ['novel', 'consultor', 'futuro'].includes(body.segment) ? body.segment : null, trial_ends_at: t + TRIAL_DAYS * DAY, created_at: t, last_seen_at: t };
    S.users.push(u); S.session = u.id;
    return [{ user: publicUser(u) }, 201];
  });
  on('POST', '/auth/login', ({ body }) => {
    const u = S.users.find((x) => x.email === clean(body.email, 120).toLowerCase());
    if (!u || u.pass !== String(body.password || '')) fail(401, 'Correo o contraseña incorrectos.');
    S.session = u.id; u.last_seen_at = now();
    return { user: publicUser(u) };
  });
  on('POST', '/auth/logout', () => { S.session = null; return { ok: true }; });
  on('GET', '/me', ({ user }) => ({ user: user ? publicUser(user) : null }));
  on('PATCH', '/me', { auth: true }, ({ user: u, body }) => {
    const name = body.name !== undefined ? clean(body.name, 80) : u.name;
    if (name.length < 2) fail(400, 'Escribe tu nombre.');
    u.name = name;
    if (body.country !== undefined) u.country = clean(body.country, 60) || null;
    if (body.segment !== undefined) u.segment = ['novel', 'consultor', 'futuro'].includes(body.segment) ? body.segment : null;
    return { user: publicUser(u) };
  });
  on('POST', '/me/password', { auth: true }, ({ user: u, body }) => {
    if (String(body.current || '') !== u.pass) fail(400, 'La contraseña actual no es correcta.');
    if (String(body.next || '').length < 8) fail(400, 'La nueva contraseña debe tener al menos 8 caracteres.');
    u.pass = String(body.next); return { ok: true };
  });
  on('DELETE', '/me', { auth: true }, ({ user: u, body }) => {
    if (String(body.password || '') !== u.pass) fail(400, 'Contraseña incorrecta.');
    if (u.role === 'admin' && S.users.filter((x) => x.role === 'admin').length <= 1) fail(400, 'Eres el único administrador: asigna otro antes de eliminar tu cuenta.');
    S.users = S.users.filter((x) => x.id !== u.id); S.session = null;
    return { ok: true };
  });

  on('GET', '/plans', () => ({ trialDays: TRIAL_DAYS, paymentsMode: 'demo', plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p, features: PLAN_FEATURES[id] })) }));
  on('POST', '/billing/change', { auth: true }, ({ user: u, body }) => {
    if (!PLANS[body.plan]) fail(400, 'Plan no válido.');
    u.plan = body.plan; u.billing = body.billing === 'annual' ? 'annual' : 'monthly';
    return { user: publicUser(u) };
  });

  on('GET', '/catalog', ({ user }) => {
    const { done, msSet, delivs } = user ? progressFor(user.id) : { done: new Set(), msSet: new Set(), delivs: new Set() };
    return { phases: phases.map((ph) => {
      const lessons = ph.lessons.map((l) => ({ id: l.id, order: l.order, title: l.title, minutes: l.minutes, summary: l.summary, minPlan: l.minPlan,
        locked: !user ? l.minPlan !== 'free' : !can(user, l.minPlan), done: done.has(l.id), hasDeliverable: delivs.has(l.id) }));
      return { id: ph.id, order: ph.order, name: ph.name, title: ph.title, subtitle: ph.subtitle, horizon: ph.horizon, minPlan: ph.minPlan, intro: ph.intro, premise: ph.premise,
        locked: user ? !can(user, ph.minPlan) : true, lessons, milestones: ph.milestones.map((m, i) => ({ ...m, idx: i, done: msSet.has(`${ph.id}:${i}`) })),
        errors: ph.errors, progress: { done: lessons.filter((l) => l.done).length, total: lessons.length } };
    }) };
  });
  on('GET', '/search', ({ user, query }) => {
    const q = norm(clean(query.get('q'), 80));
    if (q.length < 3) return { results: [] };
    const terms = q.split(/\s+/).filter((t) => t.length > 1), results = [];
    for (const ph of phases) for (const l of ph.lessons) {
      const raw = lessonText.get(l.id), text = norm(raw);
      if (!terms.every((t) => text.includes(t))) continue;
      const at = text.indexOf(terms[0]), start = Math.max(0, at - 70);
      results.push({ id: l.id, title: l.title, phase: ph.name, snippet: (start ? '…' : '') + raw.slice(start, at + 150).replace(/\s+/g, ' ').trim() + '…',
        score: terms.some((t) => norm(l.title).includes(t)) ? 2 : 1, locked: user ? !can(user, l.minPlan) : l.minPlan !== 'free' });
    }
    return { results: results.sort((a, b) => b.score - a.score).slice(0, 20) };
  });

  const delOf = (uid, lid) => S.deliverables.find((d) => d.user_id === uid && d.lesson_id === lid);
  function lessonAccess(user, id) {
    const l = getLesson(id);
    if (!l) fail(404, 'Lección no encontrada.');
    if (!can(user, l.minPlan)) fail(403, 'Esta lección requiere una membresía superior.', { minPlan: l.minPlan, lesson: { id: l.id, title: l.title, summary: l.summary } });
    return l;
  }
  on('GET', '/lessons/:id', { auth: true }, ({ user, params }) => {
    const l = lessonAccess(user, params.id), ph = getPhase(l.phaseId), uid = user.id;
    const del = delOf(uid, l.id), idx = ph.lessons.indexOf(l), nextPhase = phases[phases.indexOf(ph) + 1], rv = reviewerFor(user, ph.id);
    const link = (x) => (x ? { id: x.id, title: x.title, locked: !can(user, x.minPlan) } : null);
    return {
      lesson: { id: l.id, title: l.title, minutes: l.minutes, summary: l.summary, blocks: l.blocks, checklist: l.checklist, deliverable: l.deliverable },
      phase: { id: ph.id, name: ph.name, title: ph.title, order: ph.order, total: ph.lessons.length }, order: idx + 1,
      state: { done: S.lessonDone.some((r) => r.user_id === uid && r.lesson_id === l.id), checks: S.checks.filter((c) => c.user_id === uid && c.lesson_id === l.id).map((c) => c.idx),
        deliverable: del ? { body: del.body, updatedAt: del.updated_at } : null,
        review: del && del.review ? { text: del.review, at: del.reviewed_at, by: ASSISTANTS[del.reviewer]?.name || del.reviewer } : null },
      reviewer: rv ? { id: rv.id, name: rv.name } : null,
      prev: link(ph.lessons[idx - 1]), next: link(ph.lessons[idx + 1] || (nextPhase && nextPhase.lessons[0])),
    };
  });
  on('POST', '/lessons/:id/complete', { auth: true }, ({ user, params, body }) => {
    const l = lessonAccess(user, params.id);
    S.lessonDone = S.lessonDone.filter((r) => !(r.user_id === user.id && r.lesson_id === l.id));
    if (body.done !== false) S.lessonDone.push({ user_id: user.id, lesson_id: l.id, done_at: now() });
    return { ok: true };
  });
  on('POST', '/lessons/:id/checks', { auth: true }, ({ user, params, body }) => {
    const l = lessonAccess(user, params.id), idx = Number(body.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= l.checklist.length) fail(400, 'Ítem no válido.');
    S.checks = S.checks.filter((c) => !(c.user_id === user.id && c.lesson_id === l.id && c.idx === idx));
    if (body.checked) S.checks.push({ user_id: user.id, lesson_id: l.id, idx });
    return { ok: true };
  });
  on('PUT', '/lessons/:id/deliverable', { auth: true }, ({ user, params, body }) => {
    const l = lessonAccess(user, params.id), t = now();
    const d = delOf(user.id, l.id);
    if (d) { d.body = String(body.body ?? '').slice(0, 20000); d.updated_at = t; }
    else S.deliverables.push({ user_id: user.id, lesson_id: l.id, body: String(body.body ?? '').slice(0, 20000), updated_at: t, review: null, reviewed_at: null, reviewer: null });
    return { ok: true, updatedAt: t };
  });
  on('POST', '/lessons/:id/review', { auth: true }, async ({ user, params }) => {
    const l = lessonAccess(user, params.id), rv = reviewerFor(user, l.phaseId);
    if (!rv) fail(403, 'La revisión con IA está disponible desde la membresía Starter.', { minPlan: 'starter' });
    const d = delOf(user.id, l.id);
    if (!d || d.body.trim().length < 40) fail(400, 'Guarda un entregable de al menos unas líneas antes de pedir revisión.');
    const limit = DAILY_CHAT_LIMIT[effectivePlan(user).plan] || 0;
    if (usedToday(user.id) >= limit) fail(429, `Alcanzaste el límite diario de ${limit} mensajes de tu membresía.`);
    await new Promise((r) => setTimeout(r, 1200));
    const t = now();
    S.chats.push({ user_id: user.id, assistant: 'review', role: 'user', content: l.id, created_at: t });
    Object.assign(d, { review: SAMPLE_REVIEW(rv.name), reviewed_at: t, reviewer: rv.id });
    return { review: { text: d.review, at: t, by: rv.name }, demo: true };
  });
  on('POST', '/milestones', { auth: true }, ({ user, body }) => {
    const ph = getPhase(String(body.phase)), idx = Number(body.idx);
    if (!ph || !Number.isInteger(idx) || idx < 0 || idx >= ph.milestones.length) fail(400, 'Hito no válido.');
    needPlan(user, ph.minPlan);
    S.milestones = S.milestones.filter((m) => !(m.user_id === user.id && m.phase_id === ph.id && m.idx === idx));
    if (body.done) S.milestones.push({ user_id: user.id, phase_id: ph.id, idx });
    return { ok: true };
  });
  on('GET', '/deliverables', { auth: true }, ({ user }) => ({
    deliverables: S.deliverables.filter((d) => d.user_id === user.id && d.body.trim()).sort((a, b) => b.updated_at - a.updated_at).map((r) => {
      const l = getLesson(r.lesson_id), ph = getPhase(l.phaseId);
      return { lessonId: l.id, lessonTitle: l.title, title: l.deliverable.title, phase: ph.name, phaseOrder: ph.order, lessonOrder: l.order, body: r.body, updatedAt: r.updated_at, reviewed: !!r.review };
    }),
  }));

  on('GET', '/kpis', { auth: true }, ({ user }) => { needPlan(user, 'pro'); return { metrics: summarize(S.kpis.filter((k) => k.user_id === user.id)) }; });
  on('POST', '/kpis', { auth: true }, ({ user, body }) => {
    needPlan(user, 'pro');
    const m = D.METRICS.find((x) => x.id === String(body.metric)), value = Number(body.value), day = String(body.day || new Date().toISOString().slice(0, 10));
    if (!m) fail(400, 'Indicador no válido.');
    if (!Number.isFinite(value) || value < 0 || value > 1e9) fail(400, 'Valor no válido.');
    if (m.unit === '%' && value > 100) fail(400, 'Un porcentaje no puede superar 100.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) fail(400, 'Fecha no válida.');
    S.kpis.push({ id: nextId(), user_id: user.id, metric: m.id, value, day, note: clean(body.note, 200) || null, created_at: now() });
    return [{ ok: true }, 201];
  });
  on('DELETE', '/kpis/:id', { auth: true }, ({ user, params }) => { needPlan(user, 'pro'); S.kpis = S.kpis.filter((k) => !(k.id === Number(params.id) && k.user_id === user.id)); return { ok: true }; });

  on('GET', '/events', { auth: true }, ({ user, query }) => {
    const cut = now() - 3 * 3600000, past = query.get('past') === '1';
    const list = S.events.filter((e) => (past ? e.starts_at < cut : e.starts_at >= cut)).sort((a, b) => (past ? b.starts_at - a.starts_at : a.starts_at - b.starts_at));
    return { events: list.map((e) => publicEvent(e, user)), kinds: EVENT_KINDS };
  });
  on('POST', '/admin/events', { admin: true }, ({ body }) => { const e = eventInput(body); S.events.push({ id: nextId(), ...e, created_at: now() }); return [{ ok: true }, 201]; });
  on('PUT', '/admin/events/:id', { admin: true }, ({ params, body }) => {
    const ev = S.events.find((x) => x.id === Number(params.id)); if (!ev) fail(404, 'Evento no encontrado.');
    Object.assign(ev, eventInput(body)); return { ok: true };
  });
  on('DELETE', '/admin/events/:id', { admin: true }, ({ params }) => { S.events = S.events.filter((e) => e.id !== Number(params.id)); return { ok: true }; });

  const channelOf = (id) => CHANNELS.find((c) => c.id === id);
  const author = (uid) => userById(uid) || { name: 'Cuenta eliminada', role: 'member' };
  on('GET', '/community/channels', { auth: true }, ({ user }) => ({ channels: CHANNELS.map((c) => ({ ...c, locked: !can(user, c.minPlan), posts: S.posts.filter((p) => p.channel === c.id).length })) }));
  on('GET', '/community/posts', { auth: true }, ({ user, query }) => {
    const ch = channelOf(query.get('channel')); if (!ch) fail(400, 'Canal no válido.');
    if (!can(user, ch.minPlan)) fail(403, 'Este canal requiere una membresía superior.', { minPlan: ch.minPlan });
    const offset = Number(query.get('offset')) || 0;
    const list = S.posts.filter((p) => p.channel === ch.id).sort((a, b) => b.pinned - a.pinned || b.created_at - a.created_at);
    return { posts: list.slice(offset, offset + 20).map((p) => ({ id: p.id, title: p.title, body: p.body, created_at: p.created_at, pinned: p.pinned, author: author(p.user_id).name, author_role: author(p.user_id).role,
      comments: S.comments.filter((c) => c.post_id === p.id).length })), more: list.length > offset + 20, nextOffset: offset + 20 };
  });
  on('POST', '/community/posts', { auth: true }, ({ user, body }) => {
    const ch = channelOf(String(body.channel)); if (!ch) fail(400, 'Canal no válido.');
    if (!can(user, ch.minPlan)) fail(403, 'Este canal requiere una membresía superior.');
    const title = clean(body.title, 140), text = clean(body.body, 4000);
    if (title.length < 3 || text.length < 3) fail(400, 'Escribe un título y un mensaje.');
    const id = nextId(); S.posts.push({ id, channel: ch.id, user_id: user.id, title, body: text, created_at: now(), pinned: 0 });
    return [{ id }, 201];
  });
  function postAccess(user, id) {
    const p = S.posts.find((x) => x.id === Number(id)); if (!p) fail(404, 'Publicación no encontrada.');
    if (!can(user, channelOf(p.channel).minPlan)) fail(403, 'Este canal requiere una membresía superior.');
    return p;
  }
  on('GET', '/community/posts/:id', { auth: true }, ({ user, params }) => {
    const p = postAccess(user, params.id), isAdmin = user.role === 'admin', a = author(p.user_id);
    return {
      post: { id: p.id, channel: p.channel, title: p.title, body: p.body, author: a.name, author_role: a.role, created_at: p.created_at, pinned: !!p.pinned },
      comments: S.comments.filter((c) => c.post_id === p.id).sort((x, y) => x.created_at - y.created_at)
        .map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, author: author(c.user_id).name, author_role: author(c.user_id).role, canDelete: isAdmin || c.user_id === user.id })),
      canDelete: isAdmin || user.id === p.user_id, canPin: isAdmin,
    };
  });
  on('POST', '/community/posts/:id/comments', { auth: true }, ({ user, params, body }) => {
    const p = postAccess(user, params.id), text = clean(body.body, 2000);
    if (!text) fail(400, 'Escribe un comentario.');
    S.comments.push({ id: nextId(), post_id: p.id, user_id: user.id, body: text, created_at: now() });
    return [{ ok: true }, 201];
  });
  on('POST', '/community/posts/:id/pin', { admin: true }, ({ user, params, body }) => { postAccess(user, params.id).pinned = body.pinned ? 1 : 0; return { ok: true }; });
  on('DELETE', '/community/posts/:id', { auth: true }, ({ user, params }) => {
    const p = postAccess(user, params.id);
    if (user.role !== 'admin' && user.id !== p.user_id) fail(403, 'No puedes eliminar esta publicación.');
    S.posts = S.posts.filter((x) => x.id !== p.id); S.comments = S.comments.filter((c) => c.post_id !== p.id);
    return { ok: true };
  });
  on('DELETE', '/community/comments/:id', { auth: true }, ({ user, params }) => {
    const c = S.comments.find((x) => x.id === Number(params.id)); if (!c) fail(404, 'Comentario no encontrado.');
    if (user.role !== 'admin' && user.id !== c.user_id) fail(403, 'No puedes eliminar este comentario.');
    S.comments = S.comments.filter((x) => x.id !== c.id); return { ok: true };
  });

  on('GET', '/assistants', { auth: true }, ({ user }) => ({
    configured: true, dailyLimit: DAILY_CHAT_LIMIT[effectivePlan(user).plan] || 0, usedToday: usedToday(user.id),
    assistants: Object.values(ASSISTANTS).map((a) => ({ id: a.id, name: a.name, area: a.area, desc: a.desc, minPlan: a.minPlan, starters: a.starters, locked: !can(user, a.minPlan) })),
  }));
  const assistantAccess = (user, id) => { const a = ASSISTANTS[id]; if (!a) fail(404, 'Asistente no encontrado.'); if (!can(user, a.minPlan)) fail(403, 'Este asistente requiere una membresía superior.', { minPlan: a.minPlan }); return a; };
  on('GET', '/assistants/:id/history', { auth: true }, ({ user, params }) => {
    const a = assistantAccess(user, params.id);
    return { messages: S.chats.filter((m) => m.user_id === user.id && m.assistant === a.id).slice(-40).map(({ role, content, created_at }) => ({ role, content, created_at })) };
  });
  on('DELETE', '/assistants/:id/history', { auth: true }, ({ user, params }) => { S.chats = S.chats.filter((m) => !(m.user_id === user.id && m.assistant === params.id)); return { ok: true }; });
  on('POST', '/assistants/:id/chat', { auth: true }, ({ user, params, body }) => {
    const a = assistantAccess(user, params.id), message = clean(body.message, 4000);
    if (!message) fail(400, 'Escribe un mensaje.');
    const limit = DAILY_CHAT_LIMIT[effectivePlan(user).plan] || 0;
    if (usedToday(user.id) >= limit) fail(429, `Alcanzaste el límite diario de ${limit} mensajes de tu membresía.`);
    const text = SAMPLE[a.id](user, message) + '\n\n*Respuesta de ejemplo: en esta demo los asistentes no están conectados al modelo de IA.*';
    const t = now();
    S.chats.push({ user_id: user.id, assistant: a.id, role: 'user', content: message, created_at: t }, { user_id: user.id, assistant: a.id, role: 'assistant', content: text, created_at: t + 1 });
    save();
    return new Response(memberChatStream(text), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });

  on('GET', '/admin/stats', { admin: true }, () => {
    const t = now(), by = {}, done = {};
    S.users.forEach((u) => { by[u.plan] = (by[u.plan] || 0) + 1; });
    S.lessonDone.forEach((r) => { done[r.lesson_id] = (done[r.lesson_id] || 0) + 1; });
    const mrr = S.users.filter((u) => u.plan !== 'free').reduce((a, u) => a + (u.billing === 'annual' ? PLANS[u.plan].annual / 12 : PLANS[u.plan].monthly), 0);
    return { total: S.users.length, new7: S.users.filter((u) => u.created_at >= t - 7 * DAY).length, active7: S.users.filter((u) => u.last_seen_at >= t - 7 * DAY).length,
      trials: S.users.filter((u) => u.plan === 'free' && u.trial_ends_at > t).length, byPlan: Object.entries(by).map(([plan, n]) => ({ plan, n })), mrr: Math.round(mrr),
      lessons: S.lessonDone.length, deliverables: S.deliverables.filter((d) => d.body.trim()).length, posts: S.posts.length, msgs: S.chats.filter((m) => m.role === 'user').length, leads: S.leads.length,
      topLessons: Object.entries(done).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, n]) => ({ title: getLesson(id)?.title || id, n })) };
  });
  const match = (q, ...f) => !q || f.some((v) => String(v || '').toLowerCase().includes(q.toLowerCase()));
  on('GET', '/admin/users', { admin: true }, ({ query }) => ({
    users: S.users.filter((u) => match(query.get('q'), u.name, u.email, u.country)).sort((a, b) => b.created_at - a.created_at)
      .map((u) => ({ id: u.id, name: u.name, email: u.email, plan: u.plan, role: u.role, country: u.country, segment: u.segment, created_at: u.created_at, last_seen_at: u.last_seen_at, trial_ends_at: u.trial_ends_at,
        lessons_done: S.lessonDone.filter((r) => r.user_id === u.id).length })),
  }));
  on('PATCH', '/admin/users/:id', { admin: true }, ({ user, params, body }) => {
    const u = userById(Number(params.id)); if (!u) fail(404, 'Usuario no encontrado.');
    const plan = body.plan !== undefined ? String(body.plan) : u.plan, role = body.role !== undefined ? String(body.role) : u.role;
    if (!PLANS[plan] || !['member', 'admin'].includes(role)) fail(400, 'Datos no válidos.');
    if (u.id === user.id && role !== 'admin') fail(400, 'No puedes quitarte el rol de administrador.');
    Object.assign(u, { plan, role }); if (body.extendTrial) u.trial_ends_at = now() + TRIAL_DAYS * DAY;
    return { ok: true };
  });
  on('GET', '/admin/leads', { admin: true }, ({ query }) => ({
    leads: S.leads.filter((l) => match(query.get('q'), l.name, l.email, l.country)).sort((a, b) => b.created_at - a.created_at)
      .map((l) => ({ ...l, registered: S.users.some((u) => u.email === l.email) ? 1 : 0 })),
  }));

  // ---------- Despacho ----------
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase(), path = url.pathname.slice(4);
    let body = {};
    try { body = init.body ? JSON.parse(init.body) : {}; } catch { return json({ error: 'JSON no válido.' }, 400); }
    const user = S.session ? userById(S.session) || null : null;
    for (const r of routes) {
      if (r.method !== method) continue;
      const m = path.match(r.re); if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      try {
        if ((r.opts.auth || r.opts.admin) && !user) fail(401, 'Inicia sesión para continuar.');
        if (r.opts.admin && user.role !== 'admin') fail(403, 'Solo administradores.');
        const out = await r.fn({ user, params, body, query: url.searchParams });
        if (out instanceof Response) return out;
        save();
        return Array.isArray(out) ? json(out[0], out[1]) : json(out);
      } catch (e) {
        if (e instanceof HttpError) return json(e.body, e.status);
        console.error(e); return json({ error: 'Error interno de la demo.' }, 500);
      }
    }
    return json({ error: 'Ruta no encontrada.' }, 404);
  };

  // ---------- Ajustes del visor ----------
  // El visor bloquea confirm, prompt, print y descargas: en la demo se aceptan solas o avisan.
  window.confirm = () => true;
  window.prompt = () => (S.session && userById(S.session)?.pass) || '';
  window.print = () => window.__demoToast?.('La impresión no está disponible en la vista previa.');
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/api/"], a[download]');
    if (a) { e.preventDefault(); window.__demoToast?.('En la vista previa no se descargan archivos. En la plataforma real sí.'); }
  }, true);

  // Barra de la demo: entrar rápido con cuentas de ejemplo o reiniciar.
  function bar() {
    const el = document.createElement('div');
    el.className = 'demo-bar';
    const u = S.session ? userById(S.session) : null;
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.onclick = fn; return b; };
    const login = (id) => async () => { S.session = id; save(); location.hash = '#/panel'; location.reload(); };
    const msg = document.createElement('span');
    msg.textContent = u ? `Demo · sesión: ${u.name} (${PLANS[effectivePlan(u).plan].label}${u.role === 'admin' ? ', admin' : ''})` : 'Demo de la plataforma · entra con una cuenta de ejemplo o crea la tuya';
    el.append(msg, btn('Miembro Pro', login(2)), btn('Administrador', login(1)),
      btn('Reiniciar demo', () => { try { localStorage.removeItem(KEY); } catch {} location.hash = '#/'; location.reload(); }));
    return el;
  }
  const style = document.createElement('style');
  style.textContent = `.demo-bar{position:relative;z-index:30;display:flex;flex-wrap:wrap;gap:.4rem .6rem;align-items:center;justify-content:center;padding:.45rem 1rem;background:#ffd84d;color:#1f1b2e;font:600 13px/1.3 Outfit,system-ui,sans-serif}
  .demo-bar button{border:1.5px solid #1f1b2e;background:#fff;color:#1f1b2e;border-radius:999px;padding:.25rem .8rem;font:inherit;cursor:pointer}
  .demo-bar button:hover{background:#1f1b2e;color:#fff}`;
  document.head.appendChild(style);
  const place = () => { document.querySelector('.demo-bar')?.remove(); document.body.prepend(bar()); };
  window.addEventListener('hashchange', () => setTimeout(place, 50));
  document.addEventListener('DOMContentLoaded', place);
  window.__demoToast = (m) => { const t = document.getElementById('toast'); if (t) { t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); } };
})();
