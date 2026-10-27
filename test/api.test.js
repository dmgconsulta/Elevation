// Pruebas de integración de la API. Usa una base temporal y el modo demo de asistentes.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'elev-test-'));
process.env.DATA_DIR = dir;
process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD = 'admin-pass-123';
process.env.PAYMENTS_MODE = 'demo';
delete process.env.ANTHROPIC_API_KEY;

const app = require('../server');
let server, base;

before(() => new Promise((r) => { server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); }); }));
after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

// Cliente mínimo con cookie de sesión.
let ipSeq = 0;
function client() {
  let cookie = '';
  const ip = `10.0.0.${++ipSeq}`; // IP distinta por cliente para no chocar con el límite de registros
  const call = async (method, p, body) => {
    const headers = { 'x-forwarded-for': ip };
    if (cookie) headers.cookie = cookie;
    if (method !== 'GET') headers['content-type'] = 'application/json';
    const res = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    return { status: res.status, data, headers: res.headers };
  };
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b ?? {}), put: (p, b) => call('PUT', p, b), patch: (p, b) => call('PATCH', p, b), del: (p, b) => call('DELETE', p, b ?? {}), get cookie() { return cookie; }, set cookie(c) { cookie = c; } };
}

let n = 0;
async function member(extra = {}) {
  const c = client();
  const r = await c.post('/api/auth/register', { name: 'Ana Pérez', email: `ana${++n}@test.com`, password: 'password123', ...extra });
  assert.equal(r.status, 201);
  return c;
}

test('registro activa prueba de Starter', async () => {
  const c = await member({ country: 'Chile', segment: 'novel' });
  const { data } = await c.get('/api/me');
  assert.equal(data.user.effectivePlan, 'starter');
  assert.equal(data.user.trial, true);
});

test('rechaza escrituras que no son JSON (CSRF)', async () => {
  const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
  assert.equal(res.status, 415);
});

test('lecciones: acceso por plan, checklist y entregable', async () => {
  const c = await member();
  assert.equal((await c.get('/api/lessons/s2')).status, 200);
  const locked = await c.get('/api/lessons/' + (await c.get('/api/catalog')).data.phases[2].lessons[1].id);
  assert.equal(locked.status, 403);
  assert.equal((await c.post('/api/lessons/s2/checks', { idx: 0, checked: true })).status, 200);
  assert.equal((await c.put('/api/lessons/s2/deliverable', { body: 'Mis fortalezas reales son estas y estas otras, con evidencia.' })).status, 200);
  const l = await c.get('/api/lessons/s2');
  assert.deepEqual(l.data.state.checks, [0]);
  assert.match(l.data.state.deliverable.body, /fortalezas/);
  assert.ok(l.data.reviewer, 'Starter tiene revisor disponible');
  const cat = await c.get('/api/catalog');
  assert.equal(cat.data.phases[0].lessons[1].hasDeliverable, true);
});

test('la última lección de una fase enlaza con la siguiente fase', async () => {
  const c = await member();
  const cat = (await c.get('/api/catalog')).data.phases;
  const last = cat[0].lessons[cat[0].lessons.length - 1];
  const r = await c.get('/api/lessons/' + last.id);
  assert.equal(r.data.next.id, cat[1].lessons[0].id);
});

test('revisión de entregable en modo demo', async () => {
  const c = await member();
  assert.equal((await c.post('/api/lessons/s2/review')).status, 400, 'sin entregable no hay revisión');
  await c.put('/api/lessons/s2/deliverable', { body: 'Texto suficientemente largo para poder pedir una revisión al asistente.' });
  const r = await c.post('/api/lessons/s2/review');
  assert.equal(r.status, 200);
  assert.equal(r.data.demo, true);
  assert.ok((await c.get('/api/lessons/s2')).data.state.review.text);
});

test('chat de asistente responde en streaming (SSE)', async () => {
  const c = await member();
  const res = await fetch(base + '/api/assistants/freya/chat', { method: 'POST', headers: { cookie: c.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ message: 'Hola' }) });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const text = await res.text();
  assert.match(text, /"done":true/);
  const hist = await c.get('/api/assistants/freya/history');
  assert.equal(hist.data.messages.length, 2);
  assert.equal((await c.post('/api/assistants/nova/chat', { message: 'Hola' })).status, 403, 'Nova requiere Pro');
});

test('KPIs: solo Pro, suma y nivel', async () => {
  const c = await member();
  assert.equal((await c.get('/api/kpis')).status, 403);
  await c.post('/api/billing/change', { plan: 'pro' });
  assert.equal((await c.post('/api/kpis', { metric: 'libros', value: 2, day: '2026-01-10' })).status, 201);
  await c.post('/api/kpis', { metric: 'libros', value: 1, day: '2026-01-20' });
  await c.post('/api/kpis', { metric: 'aliados', value: 10, day: '2026-01-10' });
  await c.post('/api/kpis', { metric: 'aliados', value: 14, day: '2026-01-20' });
  assert.equal((await c.post('/api/kpis', { metric: 'interaccion', value: 140 })).status, 400);
  assert.equal((await c.post('/api/kpis', { metric: 'nada', value: 1 })).status, 400);
  const { data } = await c.get('/api/kpis');
  const by = Object.fromEntries(data.metrics.map((m) => [m.id, m]));
  assert.equal(by.libros.current, 3);
  assert.equal(by.aliados.current, 14);
  assert.equal(by.libros.series.length, 12);
  const id = by.libros.entries[0].id;
  await c.del('/api/kpis/' + id);
  assert.equal((await c.get('/api/kpis')).data.metrics.find((m) => m.id === 'libros').current, 2);
});

test('agenda: admin crea eventos y se ocultan enlaces bloqueados', async () => {
  const admin = client();
  assert.equal((await admin.post('/api/auth/login', { email: 'admin@test.com', password: 'admin-pass-123' })).status, 200);
  const r = await admin.post('/api/admin/events', { kind: 'mentoria', title: 'Mentoría de narrativa', startsAt: Date.now() + 86400000, url: 'https://meet.example.com/x', minPlan: 'elite' });
  assert.equal(r.status, 201);
  assert.equal((await admin.post('/api/admin/events', { kind: 'vivo', title: 'Mal', startsAt: Date.now(), url: 'javascript:alert(1)' })).status, 400);
  const c = await member();
  assert.equal((await c.post('/api/admin/events', { kind: 'vivo', title: 'x', startsAt: Date.now() })).status, 403);
  const ev = (await c.get('/api/events')).data.events.find((e) => e.id === r.data.id);
  assert.equal(ev.locked, true);
  assert.equal(ev.url, null);
  const evAdmin = (await admin.get('/api/events')).data.events.find((e) => e.id === r.data.id);
  assert.equal(evAdmin.url, 'https://meet.example.com/x');
});

test('cambiar contraseña invalida otras sesiones', async () => {
  const c = await member();
  const email = (await c.get('/api/me')).data.user.email;
  const other = client();
  await other.post('/api/auth/login', { email, password: 'password123' });
  assert.ok((await other.get('/api/me')).data.user);
  assert.equal((await c.post('/api/me/password', { current: 'mala', next: 'nueva-clave-1' })).status, 400);
  assert.equal((await c.post('/api/me/password', { current: 'password123', next: 'nueva-clave-1' })).status, 200);
  assert.equal((await other.get('/api/me')).data.user, null, 'la otra sesión ya no vale');
  assert.ok((await c.get('/api/me')).data.user, 'la sesión actual sigue activa');
});

test('perfil, exportación y eliminación de cuenta', async () => {
  const c = await member();
  const p = await c.patch('/api/me', { name: 'Ana María', country: 'Perú', segment: 'futuro' });
  assert.equal(p.data.user.country, 'Perú');
  const ex = await c.get('/api/me/export');
  assert.equal(ex.data.user.name, 'Ana María');
  assert.equal((await c.del('/api/me', { password: 'otra' })).status, 400);
  assert.equal((await c.del('/api/me', { password: 'password123' })).status, 200);
  assert.equal((await c.get('/api/me')).data.user, null);
});

test('comunidad: fijar, paginar y borrar comentarios', async () => {
  const admin = client();
  await admin.post('/api/auth/login', { email: 'admin@test.com', password: 'admin-pass-123' });
  const c = await member();
  const post = await c.post('/api/community/posts', { channel: 'abierta', title: 'Mi primera duda', body: '¿Cómo empiezo mi mapa de actores?' });
  assert.equal(post.status, 201);
  await c.post(`/api/community/posts/${post.data.id}/comments`, { body: 'Respuesta' });
  assert.equal((await c.post(`/api/community/posts/${post.data.id}/pin`, { pinned: true })).status, 403);
  assert.equal((await admin.post(`/api/community/posts/${post.data.id}/pin`, { pinned: true })).status, 200);
  const list = await c.get('/api/community/posts?channel=abierta');
  assert.equal(list.data.posts[0].id, post.data.id);
  assert.equal(list.data.posts[0].pinned, 1);
  const d = await c.get('/api/community/posts/' + post.data.id);
  assert.equal(d.data.comments[0].canDelete, true);
  assert.equal((await c.del('/api/community/comments/' + d.data.comments[0].id)).status, 200);
});

test('búsqueda de lecciones ignora tildes', async () => {
  const c = client();
  const r = await c.get('/api/search?q=diagnostico');
  assert.ok(r.data.results.length > 0);
  assert.ok(r.data.results.every((x) => typeof x.locked === 'boolean'));
});

test('admin: estadísticas, búsqueda y CSV sin inyección de fórmulas', async () => {
  const admin = client();
  await admin.post('/api/auth/login', { email: 'admin@test.com', password: 'admin-pass-123' });
  await member({ name: '=HYPERLINK("x")' });
  const st = await admin.get('/api/admin/stats');
  assert.ok(st.data.total >= 2);
  assert.equal(typeof st.data.mrr, 'number');
  const u = await admin.get('/api/admin/users?q=HYPERLINK');
  assert.equal(u.data.users.length, 1);
  const csv = await admin.get('/api/admin/users.csv?q=HYPERLINK');
  assert.match(csv.data, /'=HYPERLINK/);
});
