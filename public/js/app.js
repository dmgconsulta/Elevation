/* Elevation Escuela · SPA sin dependencias. Todo el texto dinámico se inserta como nodos de texto (sin innerHTML). */
(() => {
  'use strict';

  // ---------- Utilidades ----------
  const app = document.getElementById('app');
  const state = { user: null, catalog: null, plans: null };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    const add = (k) => {
      if (Array.isArray(k)) return k.forEach(add);
      if (k === null || k === undefined || k === false) return;
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', headers: {}, credentials: 'same-origin' };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    else if (init.method !== 'GET') init.headers['Content-Type'] = 'application/json';
    const res = await fetch('/api' + path, init);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      const err = new Error(data.error || 'Error de red');
      err.status = res.status; err.data = data;
      if (res.status === 401 && state.user) { state.user = null; go('/login'); }
      throw err;
    }
    return data;
  }

  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }

  const go = (p) => { location.hash = '#' + p; };
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (ts) => new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const PLAN_LABEL = { free: 'Free', starter: 'Starter', pro: 'Pro', elite: 'Elite' };
  const RANK = { free: 0, starter: 1, pro: 2, elite: 3 };
  const loading = () => h('div', { class: 'container center mt' }, h('span', { class: 'spinner', 'aria-label': 'Cargando' }));

  async function loadMe() { state.user = (await api('/me')).user; }
  async function loadCatalog() { state.catalog = (await api('/catalog')).phases; }

  // ---------- Layout ----------
  function topbar(active) {
    const u = state.user;
    const link = (href, label, key) => h('a', { href: '#' + href, class: active === key ? 'active' : '', onclick: () => nav.classList.remove('open') }, label);
    const nav = h('nav', { class: 'nav', 'aria-label': 'Principal' },
      u ? [
        link('/panel', 'Panel', 'panel'), link('/ruta', 'Ruta', 'ruta'), link('/asistentes', 'Asistentes', 'asistentes'),
        link('/comunidad', 'Comunidad', 'comunidad'), link('/entregables', 'Mis entregables', 'entregables'),
        u.role === 'admin' ? link('/admin', 'Admin', 'admin') : null,
        h('a', { href: '#/planes', class: 'plan-pill' }, (u.trial ? 'Trial ' : '') + PLAN_LABEL[u.effectivePlan]),
        h('a', { href: '#/', onclick: async (e) => { e.preventDefault(); await api('/auth/logout', { method: 'POST' }); state.user = null; state.catalog = null; go('/'); } }, 'Salir'),
      ] : [
        link('/', 'Inicio', 'inicio'), link('/planes', 'Planes', 'planes'), link('/login', 'Entrar', 'login'),
        h('a', { href: '#/registro', class: 'btn primary small' }, 'Empieza gratis'),
      ]);
    return h('header', { class: 'topbar' }, h('div', { class: 'container' },
      h('a', { href: u ? '#/panel' : '#/', class: 'brand', 'aria-label': 'Elevation' }, h('img', { src: '/img/logo-wordmark.png', alt: 'Elevation' })),
      h('button', { class: 'menu-btn', 'aria-label': 'Menú', onclick: () => nav.classList.toggle('open') }, '☰'),
      nav));
  }

  function footer() {
    return h('footer', { class: 'footer' }, h('div', { class: 'container row between' },
      h('div', { class: 'tag' }, 'We elevate ', h('b', {}, 'nations')),
      h('div', {}, 'Elevation · Formación política para Latinoamérica')));
  }

  function trialBanner() {
    const u = state.user;
    if (!u || !u.trial) return null;
    const days = Math.max(0, Math.ceil((u.trialEndsAt - Date.now()) / 86400000));
    return h('div', { class: 'trial-banner' }, `Tu prueba gratuita de Starter termina en ${days} ${days === 1 ? 'día' : 'días'}. `, h('a', { href: '#/planes' }, 'Elige tu plan'));
  }

  function page(active, ...content) {
    app.replaceChildren(...[topbar(active), trialBanner(), h('main', { id: 'main' }, ...content), footer()].filter(Boolean));
    window.scrollTo(0, 0);
  }

  // ---------- Bloques de lección ----------
  function renderBlock(b) {
    switch (b.t) {
      case 'p': return h('p', {}, b.text);
      case 'h': return h('h3', {}, b.text);
      case 'ul': return h('ul', {}, b.items.map((i) => h('li', {}, i)));
      case 'ol': return h('ol', {}, b.items.map((i) => h('li', {}, i)));
      case 'quote': return h('blockquote', { class: 'quote' }, b.text);
      case 'callout': return h('div', { class: 'callout' },
        h('strong', { class: 't' }, b.title),
        b.items.length === 1 ? h('p', {}, b.items[0]) : h('ul', {}, b.items.map((i) => h('li', {}, i))));
      case 'table': return h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, b.head.map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, b.rows.map((r) => h('tr', {}, r.map((c) => h('td', {}, c)))))));
      default: return null;
    }
  }

  const progressBar = (done, total) => h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': done, 'aria-valuemax': total },
    h('span', { style: `width:${total ? Math.round((done / total) * 100) : 0}%` }));

  // ---------- Vistas públicas ----------
  async function viewLanding() {
    if (!state.catalog) { try { await loadCatalog(); } catch {} }
    const phases = state.catalog || [];
    page('inicio',
      h('section', { class: 'hero' }, h('div', { class: 'container' },
        h('div', {},
          h('div', { class: 'eyebrow' }, 'Escuela de estrategia política'),
          h('h1', {}, 'Latinoamérica no necesita más asesores. Necesita ', h('em', {}, 'otra forma de hacer estrategia.')),
          h('p', { class: 'lead' }, 'Un método en cuatro fases, asistentes de IA, datos y comunidad para construir una carrera política con rigor, desde el primer día y a un costo accesible.'),
          h('div', { class: 'row mt' },
            h('a', { href: '#/registro', class: 'btn primary' }, 'Empieza con 3 días gratis'),
            h('a', { href: '#/planes', class: 'btn ghost' }, 'Ver planes'))),
        h('div', { class: 'hero-art' }, h('div', { class: 'disc' }, h('img', { src: '/img/logo-mark.png', alt: '' }))))),
      h('section', { class: 'section' }, h('div', { class: 'container' },
        h('h2', {}, 'Una ruta completa: Start → Grow → Launch → Scale'),
        h('p', { class: 'muted' }, 'Cada fase termina con entregables reales: tu primer discurso, un mapa de actores, un plan de campaña, un informe temático.'),
        h('div', { class: 'grid c4 mt' }, phases.map((p) => h('div', { class: 'card lift' },
          h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`),
          h('h3', {}, p.name),
          h('p', { class: 'small muted' }, p.title),
          h('p', { class: 'small' }, p.subtitle)))))),
      h('section', { class: 'section soft' }, h('div', { class: 'container' },
        h('h2', {}, 'Por qué la mayoría abandona antes de empezar'),
        h('p', { class: 'muted' }, 'No es falta de talento: es una triple brecha de método, acceso y datos que convierte la motivación ciudadana en frustración.'),
        h('div', { class: 'grid c3 mt' },
          h('div', { class: 'card' }, h('h3', {}, 'Método'), h('p', { class: 'small' }, 'Una hoja de ruta integral, con lecciones, checklists y entregables, en lugar de consultoras que funcionan como cajas negras.')),
          h('div', { class: 'card' }, h('h3', {}, 'Acceso'), h('p', { class: 'small' }, 'Formación, mentores y comunidad a un precio fijo y bajo, en vez de tickets inalcanzables.')),
          h('div', { class: 'card' }, h('h3', {}, 'Datos'), h('p', { class: 'small' }, 'Decidir con métricas y no con intuición, con las mismas herramientas que usan los consultores senior.'))))),
      h('section', { class: 'section' }, h('div', { class: 'container' },
        h('h2', {}, 'Qué incluye la plataforma'),
        h('div', { class: 'grid c3 mt' },
          [['Formación modular', 'Ruta Start → Grow → Launch → Scale con lecciones, talleres y entregables.'],
           ['Asistentes virtuales', 'Nova (discurso), Atenea (estrategia), Freya (síntesis) y Charlie (logística y recursos).'],
           ['Comunidad', 'Espacios abiertos y cerrados, mentorías grupales y networking entre pares.'],
           ['Mis entregables', 'Cada módulo termina con un documento tuyo, guardado y exportable.'],
           ['Hitos verificables', 'Criterios claros para saber cuándo una fase está realmente completa.'],
           ['Por país y territorio', 'Playbooks adaptados a legislación, cultura y calendario electoral.']]
            .map(([t, d]) => h('div', { class: 'card lift' }, h('h3', {}, t), h('p', { class: 'small muted' }, d)))))),
      h('section', { class: 'section soft' }, h('div', { class: 'container' },
        h('h2', {}, 'Para quién es'),
        h('div', { class: 'grid c3 mt' },
          h('div', { class: 'card' }, h('span', { class: 'badge blue' }, '18–27 años'), h('h3', { class: 'mt-s' }, 'Políticos noveles y activistas'), h('p', { class: 'small' }, 'Estudiantes o recién graduados con ambición de incidir en su comunidad, pero sin hoja de ruta estratégica.')),
          h('div', { class: 'card' }, h('span', { class: 'badge blue' }, '28–40 años'), h('h3', { class: 'mt-s' }, 'Consultores y profesionales emergentes'), h('p', { class: 'small' }, 'Con experiencia táctica en redes, diseño o prensa, que necesitan un framework político completo.')),
          h('div', { class: 'card' }, h('span', { class: 'badge blue' }, '25–35 años'), h('h3', { class: 'mt-s' }, 'Futuros candidatos'), h('p', { class: 'small' }, 'Profesionales con reputación local que quieren explorar la carrera política con un camino claro, ético y medible.'))))),
      h('section', { class: 'section center' }, h('div', { class: 'narrow' },
        h('h2', {}, 'La estrategia también puede ser un acto de verdad'),
        h('p', { class: 'muted' }, 'Crea tu cuenta y empieza hoy: tienes 3 días de Starter sin costo.'),
        h('a', { href: '#/registro', class: 'btn primary' }, 'Crear mi cuenta'))));
  }

  function authForm(mode) {
    const isReg = mode === 'registro';
    const err = h('div', { class: 'err', role: 'alert' });
    const f = (id, label, attrs = {}) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, name: id, required: true, ...attrs }));
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        const v = Object.fromEntries(new FormData(form));
        try {
          const r = await api(isReg ? '/auth/register' : '/auth/login', { method: 'POST', body: v });
          state.user = r.user; state.catalog = null;
          toast(isReg ? '¡Bienvenido! Tu prueba de Starter ya está activa.' : 'Sesión iniciada.');
          go('/panel');
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
      },
    },
      isReg ? f('name', 'Nombre completo', { autocomplete: 'name' }) : null,
      f('email', 'Correo electrónico', { type: 'email', autocomplete: 'email' }),
      f('password', 'Contraseña' + (isReg ? ' (mínimo 8 caracteres)' : ''), { type: 'password', minlength: isReg ? 8 : 1, autocomplete: isReg ? 'new-password' : 'current-password' }),
      isReg ? h('div', { class: 'field' }, h('label', { for: 'country' }, 'País'), h('input', { id: 'country', name: 'country', autocomplete: 'country-name' })) : null,
      isReg ? h('div', { class: 'field' }, h('label', { for: 'segment' }, '¿Cuál te describe mejor?'),
        h('select', { id: 'segment', name: 'segment' },
          h('option', { value: '' }, 'Prefiero no decirlo'),
          h('option', { value: 'novel' }, 'Político novel o activista'),
          h('option', { value: 'consultor' }, 'Consultor o profesional emergente'),
          h('option', { value: 'futuro' }, 'Futuro candidato'))) : null,
      err,
      h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, isReg ? 'Crear cuenta' : 'Entrar'));
    page(mode,
      h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
        h('h2', {}, isReg ? 'Crea tu cuenta' : 'Bienvenido de vuelta'),
        isReg ? h('p', { class: 'muted small' }, 'Incluye 3 días de Starter sin costo.') : null,
        form,
        h('p', { class: 'small center mt-s' }, isReg ? ['¿Ya tienes cuenta? ', h('a', { href: '#/login' }, 'Entra')] : ['¿Primera vez? ', h('a', { href: '#/registro' }, 'Crea tu cuenta')])
      )));
  }

  async function viewPlans() {
    const [pl] = await Promise.all([state.plans ? { ...state.plans } : api('/plans'), state.user ? null : null]);
    state.plans = pl;
    let annual = false;
    const root = h('div');
    const draw = () => {
      const cur = state.user ? state.user.plan : null;
      root.replaceChildren(
        h('div', { class: 'center mb' },
          h('div', { class: 'toggle', role: 'group', 'aria-label': 'Facturación' },
            h('button', { class: annual ? '' : 'on', onclick: () => { annual = false; draw(); } }, 'Mensual'),
            h('button', { class: annual ? 'on' : '', onclick: () => { annual = true; draw(); } }, 'Anual'))),
        h('div', { class: 'grid c4' }, pl.plans.map((p) => {
          const price = annual ? p.annual : p.monthly;
          const isCur = cur === p.id;
          let btn;
          if (!state.user) btn = h('a', { href: '#/registro', class: 'btn ' + (p.id === 'pro' ? 'primary' : 'ghost') }, p.id === 'free' ? 'Empezar' : 'Probar 3 días');
          else if (isCur) btn = h('button', { class: 'btn ghost', disabled: true }, 'Tu plan actual');
          else btn = h('button', { class: 'btn ' + (p.id === 'pro' ? 'primary' : 'ghost'), onclick: async () => {
            if (pl.paymentsMode !== 'demo') return toast('Los pagos aún no están conectados.');
            if (!confirm(`Cambiar a ${p.label}? (modo demostración: sin cobro)`)) return;
            try { const r = await api('/billing/change', { method: 'POST', body: { plan: p.id, billing: annual ? 'annual' : 'monthly' } }); state.user = r.user; state.catalog = null; toast(`Plan ${p.label} activado.`); draw(); }
            catch (ex) { toast(ex.message); }
          } }, RANK[p.id] > RANK[cur] ? `Subir a ${p.label}` : `Cambiar a ${p.label}`);
          return h('div', { class: 'card price-card' + (p.id === 'pro' ? ' featured' : '') },
            p.id === 'pro' ? h('span', { class: 'badge blue', style: 'align-self:flex-start;margin-bottom:.5rem' }, 'Más elegido') : null,
            h('h3', {}, p.label),
            h('div', { class: 'price' }, price === 0 ? 'Gratis' : `US$${price}`, price ? h('span', { class: 'small muted' }, annual ? ' /año' : ' /mes') : null),
            h('p', { class: 'small muted' }, p.tagline),
            h('ul', {}, p.features.map((f) => h('li', {}, f))),
            btn);
        })),
        pl.paymentsMode === 'demo' ? h('p', { class: 'small muted center mt' }, 'Modo demostración: el cambio de plan es inmediato y no genera cobros. Conecta una pasarela de pago antes de abrir al público.') : null);
    };
    draw();
    page('planes', h('section', { class: 'section' }, h('div', { class: 'container' },
      h('h1', { class: 'center' }, 'Planes'),
      h('p', { class: 'center muted mb' }, `Escala a medida que crece tu carrera. Los nuevos miembros reciben ${pl.trialDays} días de Starter sin costo.`),
      root)));
  }

  // ---------- Vistas de miembro ----------
  function nextLesson() {
    for (const ph of state.catalog) for (const l of ph.lessons) if (!l.locked && !l.done) return { ph, l };
    return null;
  }

  async function viewDashboard() {
    page('panel', loading());
    await loadCatalog();
    const u = state.user, cat = state.catalog;
    const totals = cat.reduce((a, p) => ({ d: a.d + p.progress.done, t: a.t + p.progress.total }), { d: 0, t: 0 });
    const nx = nextLesson();
    page('panel', h('div', { class: 'container section' },
      h('h1', {}, `Hola, ${u.name.split(' ')[0]}`),
      h('p', { class: 'muted' }, `Plan ${PLAN_LABEL[u.effectivePlan]}${u.trial ? ' (prueba)' : ''} · ${totals.d} de ${totals.t} lecciones completadas`),
      h('div', { class: 'grid c2 mt' },
        h('div', { class: 'card' },
          h('h3', {}, 'Continúa donde lo dejaste'),
          nx ? [h('p', { class: 'small muted' }, `${nx.ph.name} · lección ${nx.l.order}`), h('p', {}, h('strong', {}, nx.l.title)), h('p', { class: 'small muted' }, nx.l.summary),
            h('a', { class: 'btn primary', href: '#/leccion/' + nx.l.id }, 'Continuar')]
            : [h('p', {}, 'Completaste todas las lecciones disponibles en tu plan.'), h('a', { class: 'btn ghost', href: '#/planes' }, 'Ver planes')]),
        h('div', { class: 'card' },
          h('h3', {}, 'Tu avance total'),
          h('div', { class: 'stat' }, `${totals.t ? Math.round((totals.d / totals.t) * 100) : 0}%`),
          h('div', { class: 'mt-s' }, progressBar(totals.d, totals.t)))),
      h('h2', { class: 'mt' }, 'Tus fases'),
      h('div', { class: 'grid c4' }, cat.map((p) => {
        const ms = p.milestones.filter((m) => m.done).length;
        return h('a', { href: '#/fase/' + p.id, class: 'card lift', style: 'color:inherit;text-decoration:none' },
          h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`),
          h('h3', {}, p.name),
          p.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[p.minPlan]}`) : null,
          h('p', { class: 'small muted mt-s' }, `${p.progress.done}/${p.progress.total} lecciones · ${ms}/${p.milestones.length} hitos`),
          progressBar(p.progress.done, p.progress.total));
      })),
      h('div', { class: 'grid c3 mt' },
        h('a', { href: '#/asistentes', class: 'card lift', style: 'color:inherit;text-decoration:none' }, h('h3', {}, 'Asistentes IA'), h('p', { class: 'small muted' }, 'Nova, Atenea, Freya y Charlie.')),
        h('a', { href: '#/comunidad', class: 'card lift', style: 'color:inherit;text-decoration:none' }, h('h3', {}, 'Comunidad'), h('p', { class: 'small muted' }, 'Pregunta, comparte avances y conecta con pares.')),
        h('a', { href: '#/entregables', class: 'card lift', style: 'color:inherit;text-decoration:none' }, h('h3', {}, 'Mis entregables'), h('p', { class: 'small muted' }, 'Tus documentos de cada módulo, exportables.')))));
  }

  const lessonRow = (l, planNeeded) => {
    const dot = h('span', { class: 'dot' + (l.done ? ' done' : '') }, l.done ? '✓' : l.order);
    const body = [dot, h('span', { class: 'grow' }, h('strong', {}, l.title), h('br'), h('span', { class: 'small muted' }, `${l.minutes} min`)),
      l.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[l.minPlan]}`) : (l.minPlan === 'free' ? h('span', { class: 'badge ok' }, 'Gratis') : null)];
    return h('li', {}, l.locked ? h('a', { href: '#/planes' }, body) : h('a', { href: '#/leccion/' + l.id }, body));
  };

  async function viewRoute() {
    page('ruta', loading());
    await loadCatalog();
    page('ruta', h('div', { class: 'container section' },
      h('h1', {}, 'Tu ruta'),
      h('p', { class: 'muted' }, 'Start → Grow → Launch → Scale. Avanza en orden: cada fase se apoya en la anterior.'),
      state.catalog.map((p) => h('div', { class: 'card mt' },
        h('div', { class: 'row between' },
          h('div', {}, h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`), h('h2', {}, `${p.name}: ${p.title}`)),
          h('a', { href: '#/fase/' + p.id, class: 'btn ghost small' }, 'Ver fase')),
        progressBar(p.progress.done, p.progress.total),
        h('ul', { class: 'lesson-list mt-s' }, p.lessons.map((l) => lessonRow(l)))))));
  }

  async function viewPhase(id) {
    page('ruta', loading());
    await loadCatalog();
    const p = state.catalog.find((x) => x.id === id);
    if (!p) return viewNotFound();
    page('ruta', h('div', { class: 'container section' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/ruta' }, 'Ruta'), ` › ${p.name}`),
      h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`),
      h('h1', {}, `${p.name}: ${p.title}`),
      h('p', { class: 'muted' }, p.subtitle),
      h('div', { class: 'narrow', style: 'margin:0' }, h('p', { style: 'font-family:var(--serif);font-size:1.1rem' }, p.intro)),
      h('div', { class: 'callout' }, h('strong', { class: 't' }, 'Premisa de la fase'), h('p', {}, p.premise)),
      h('div', { class: 'grid c2' },
        h('div', { class: 'card' },
          h('h3', {}, 'Lecciones'),
          progressBar(p.progress.done, p.progress.total),
          h('ul', { class: 'lesson-list mt-s' }, p.lessons.map((l) => lessonRow(l)))),
        h('div', { class: 'card' },
          h('h3', {}, 'Hitos de completitud'),
          h('p', { class: 'small muted' }, 'Márcalos solo cuando puedas demostrarlos con evidencia.'),
          h('ul', { class: 'checklist', style: 'list-style:none' }, p.milestones.map((m) => h('li', {},
            h('label', {}, h('input', {
              type: 'checkbox', checked: m.done, disabled: p.locked,
              onchange: async (e) => { try { await api('/milestones', { method: 'POST', body: { phase: p.id, idx: m.idx, done: e.target.checked } }); m.done = e.target.checked; toast(m.done ? 'Hito marcado.' : 'Hito desmarcado.'); } catch (ex) { e.target.checked = !e.target.checked; toast(ex.message); } },
            }), h('span', {}, h('strong', {}, m.hito), h('br'), h('span', { class: 'small muted' }, m.criterio)))))))),
      h('div', { class: 'callout', style: 'background:#fdf0e3;border-color:var(--warn)' },
        h('strong', { class: 't', style: 'color:var(--warn)' }, 'Errores críticos a evitar'),
        h('ul', {}, p.errors.map((e) => h('li', {}, e))))));
  }

  async function viewLesson(id) {
    page('ruta', loading());
    let data;
    try { data = await api('/lessons/' + id); }
    catch (ex) {
      if (ex.status === 403) {
        const l = ex.data.lesson || {};
        return page('ruta', h('div', { class: 'narrow section center' },
          h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[ex.data.minPlan]}`),
          h('h1', { class: 'mt-s' }, l.title || 'Lección bloqueada'),
          h('p', { class: 'muted' }, l.summary || ''),
          h('a', { class: 'btn primary', href: '#/planes' }, 'Ver planes')));
      }
      if (ex.status === 404) return viewNotFound();
      throw ex;
    }
    const { lesson: l, phase, state: st, prev, next } = data;
    const checked = new Set(st.checks);
    const status = h('span', { class: 'saved' }, st.deliverable ? `Guardado ${fmtTime(st.deliverable.updatedAt)}` : '');
    const ta = h('textarea', { id: 'deliv', placeholder: 'Escribe aquí tu entregable…', maxlength: 20000, 'aria-label': l.deliverable.title }, st.deliverable ? st.deliverable.body : '');
    const save = async () => {
      try { const r = await api(`/lessons/${l.id}/deliverable`, { method: 'PUT', body: { body: ta.value } }); status.textContent = `Guardado ${fmtTime(r.updatedAt)}`; }
      catch (ex) { toast(ex.message); }
    };
    let doneNow = st.done;
    const doneBtn = h('button', { class: 'btn ' + (doneNow ? 'ghost' : 'primary'), onclick: async () => {
      doneNow = !doneNow;
      try { await api(`/lessons/${l.id}/complete`, { method: 'POST', body: { done: doneNow } }); state.catalog = null; doneBtn.className = 'btn ' + (doneNow ? 'ghost' : 'primary'); doneBtn.textContent = doneNow ? '✓ Completada (clic para deshacer)' : 'Marcar como completada'; toast(doneNow ? 'Lección completada.' : 'Marca retirada.'); }
      catch (ex) { doneNow = !doneNow; toast(ex.message); }
    } }, doneNow ? '✓ Completada (clic para deshacer)' : 'Marcar como completada');
    const navBtn = (x, label, dir) => x ? (x.locked ? h('a', { class: 'btn ghost', href: '#/planes' }, `${label} (requiere plan)`) : h('a', { class: 'btn ghost', href: '#/leccion/' + x.id }, `${dir === 'p' ? '← ' : ''}${x.title}${dir === 'n' ? ' →' : ''}`)) : h('span');
    page('ruta', h('article', { class: 'lesson' }, h('div', { class: 'narrow' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/ruta' }, 'Ruta'), ' › ', h('a', { href: '#/fase/' + phase.id }, phase.name), ` › ${l.title}`),
      h('h1', {}, l.title),
      h('p', { class: 'muted small' }, `${l.minutes} min de lectura`),
      h('div', { class: 'lesson-body' }, l.blocks.map(renderBlock)),
      h('h2', { class: 'mt' }, 'Checklist de la lección'),
      h('ul', { class: 'checklist' }, l.checklist.map((c, i) => h('li', {}, h('label', {}, h('input', {
        type: 'checkbox', checked: checked.has(i),
        onchange: async (e) => { try { await api(`/lessons/${l.id}/checks`, { method: 'POST', body: { idx: i, checked: e.target.checked } }); } catch (ex) { e.target.checked = !e.target.checked; toast(ex.message); } },
      }), h('span', {}, c))))),
      h('div', { class: 'card mt' },
        h('span', { class: 'badge blue' }, 'Entregable'),
        h('h3', { class: 'mt-s' }, l.deliverable.title),
        h('p', { class: 'small' }, l.deliverable.prompt),
        ta,
        h('div', { class: 'row mt-s' }, h('button', { class: 'btn blue small', onclick: save }, 'Guardar entregable'), status)),
      h('div', { class: 'row mt' }, doneBtn),
      h('div', { class: 'lesson-nav' }, navBtn(prev, 'Anterior', 'p'), navBtn(next, 'Siguiente', 'n')))));
    ta.addEventListener('blur', () => { if (ta.value.trim() || st.deliverable) save(); });
  }

  async function viewDeliverables() {
    page('entregables', loading());
    const { deliverables } = await api('/deliverables');
    const exportAll = () => {
      const md = deliverables.map((d) => `## ${d.phase} · ${d.title}\n_${d.lessonTitle} · ${fmtDate(d.updatedAt)}_\n\n${d.body}\n`).join('\n---\n\n');
      const a = h('a', { href: URL.createObjectURL(new Blob([`# Mis entregables de Elevation\n\n${md}`], { type: 'text/markdown' })), download: 'mis-entregables-elevation.md' });
      document.body.appendChild(a); a.click(); a.remove();
    };
    page('entregables', h('div', { class: 'container section' },
      h('div', { class: 'row between' }, h('h1', {}, 'Mis entregables'), deliverables.length ? h('button', { class: 'btn ghost', onclick: exportAll }, 'Descargar todo (.md)') : null),
      deliverables.length ? deliverables.map((d) => h('div', { class: 'card mt-s' },
        h('div', { class: 'row between' }, h('div', {}, h('span', { class: 'badge blue' }, d.phase), ' ', h('strong', {}, d.title)), h('span', { class: 'small muted' }, fmtDate(d.updatedAt))),
        h('p', { class: 'small', style: 'white-space:pre-wrap;margin-top:.7rem' }, d.body.length > 600 ? d.body.slice(0, 600) + '…' : d.body),
        h('a', { href: '#/leccion/' + d.lessonId, class: 'small' }, 'Abrir lección y editar')))
        : h('div', { class: 'card mt center' }, h('p', { class: 'muted' }, 'Aún no has guardado entregables. Cada lección tiene uno al final.'), h('a', { class: 'btn primary', href: '#/ruta' }, 'Ir a la ruta'))));
  }

  // ---------- Comunidad ----------
  async function viewCommunity(query) {
    page('comunidad', loading());
    const { channels } = await api('/community/channels');
    const sel = query.get('canal') || (channels.find((c) => !c.locked) || channels[0]).id;
    const ch = channels.find((c) => c.id === sel) || channels[0];
    const tabs = h('div', { class: 'tabs' }, channels.map((c) => h('a', { href: '#/comunidad?canal=' + c.id, class: 'tab' + (c.id === ch.id ? ' active' : '') }, c.label, c.locked ? ' 🔒' : '')));
    let body;
    if (ch.locked) {
      body = h('div', { class: 'card center' }, h('p', {}, `${ch.label} requiere el plan ${PLAN_LABEL[ch.minPlan]}.`), h('a', { class: 'btn primary', href: '#/planes' }, 'Ver planes'));
    } else {
      const { posts } = await api('/community/posts?channel=' + ch.id);
      const err = h('div', { class: 'err' });
      const form = h('form', { onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        const v = Object.fromEntries(new FormData(form));
        try { await api('/community/posts', { method: 'POST', body: { ...v, channel: ch.id } }); toast('Publicado.'); viewCommunity(query); }
        catch (ex) { err.textContent = ex.message; }
      } },
        h('div', { class: 'field' }, h('label', { for: 'pt' }, 'Título'), h('input', { id: 'pt', name: 'title', required: true, maxlength: 140 })),
        h('div', { class: 'field' }, h('label', { for: 'pb' }, 'Mensaje'), h('textarea', { id: 'pb', name: 'body', required: true, maxlength: 4000 })),
        err, h('button', { class: 'btn blue', type: 'submit' }, 'Publicar'));
      body = [
        h('details', { class: 'card mb' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, 'Nueva publicación'), h('div', { class: 'mt-s' }, form)),
        posts.length ? posts.map((p) => h('a', { href: '#/comunidad/post/' + p.id, class: 'card post lift mt-s' },
          h('strong', {}, p.title), h('p', { class: 'small muted', style: 'margin:.2rem 0' }, `${p.author} · ${fmtDate(p.created_at)} · ${p.comments} ${p.comments === 1 ? 'respuesta' : 'respuestas'}`),
          h('p', { class: 'small', style: 'margin:0' }, p.body.length > 180 ? p.body.slice(0, 180) + '…' : p.body)))
          : h('p', { class: 'muted center' }, 'Aún no hay publicaciones. Sé el primero.'),
      ];
    }
    page('comunidad', h('div', { class: 'container section' }, h('h1', {}, 'Comunidad'), h('p', { class: 'muted' }, ch.desc), tabs, body));
  }

  async function viewPost(id) {
    page('comunidad', loading());
    const d = await api('/community/posts/' + id);
    const err = h('div', { class: 'err' });
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { await api(`/community/posts/${id}/comments`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); viewPost(id); }
      catch (ex) { err.textContent = ex.message; }
    } }, h('div', { class: 'field' }, h('label', { for: 'cb' }, 'Tu respuesta'), h('textarea', { id: 'cb', name: 'body', required: true, maxlength: 2000 })), err, h('button', { class: 'btn blue', type: 'submit' }, 'Responder'));
    page('comunidad', h('div', { class: 'container section' }, h('div', { class: 'narrow' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/comunidad?canal=' + d.post.channel }, 'Comunidad'), ' › Publicación'),
      h('h1', {}, d.post.title),
      h('p', { class: 'small muted' }, `${d.post.author} · ${fmtDate(d.post.created_at)}`),
      h('p', { style: 'white-space:pre-wrap' }, d.post.body),
      d.canDelete ? h('button', { class: 'btn danger small', onclick: async () => { if (!confirm('¿Eliminar esta publicación?')) return; await api('/community/posts/' + id, { method: 'DELETE' }); go('/comunidad?canal=' + d.post.channel); } }, 'Eliminar') : null,
      h('h2', { class: 'mt' }, `${d.comments.length} ${d.comments.length === 1 ? 'respuesta' : 'respuestas'}`),
      d.comments.map((c) => h('div', { class: 'card mt-s' }, h('p', { class: 'small muted', style: 'margin:0 0 .3rem' }, `${c.author} · ${fmtTime(c.created_at)}`), h('p', { style: 'white-space:pre-wrap;margin:0' }, c.body))),
      h('div', { class: 'mt' }, form))));
  }

  // ---------- Asistentes ----------
  async function viewAssistants() {
    page('asistentes', loading());
    const d = await api('/assistants');
    page('asistentes', h('div', { class: 'container section' },
      h('h1', {}, 'Asistentes virtuales'),
      h('p', { class: 'muted' }, `Tu plan permite ${d.dailyLimit} mensajes al día. Hoy usaste ${d.usedToday}.`),
      !d.configured ? h('div', { class: 'callout' }, h('strong', { class: 't' }, 'Modo demo'), h('p', {}, 'Los asistentes aún no están conectados a un modelo de lenguaje. Configura ANTHROPIC_API_KEY en el servidor para activarlos.')) : null,
      h('div', { class: 'grid c2 mt' }, d.assistants.map((a) => h('div', { class: 'card lift' },
        h('div', { class: 'row between' }, h('h3', {}, a.name), a.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[a.minPlan]}`) : h('span', { class: 'badge ok' }, 'Disponible')),
        h('div', { class: 'phase-num' }, a.area),
        h('p', { class: 'small' }, a.desc),
        a.locked ? h('a', { class: 'btn ghost small', href: '#/planes' }, 'Ver planes') : h('a', { class: 'btn primary small', href: '#/asistentes/' + a.id }, `Hablar con ${a.name}`))))));
  }

  async function viewChat(id) {
    page('asistentes', loading());
    const [list, hist] = await Promise.all([api('/assistants'), api(`/assistants/${id}/history`).catch((e) => ({ error: e }))]);
    const a = list.assistants.find((x) => x.id === id);
    if (!a || hist.error) return page('asistentes', h('div', { class: 'narrow section center' }, h('h1', {}, 'Asistente no disponible'), h('p', { class: 'muted' }, hist.error ? hist.error.message : 'No existe.'), h('a', { class: 'btn primary', href: '#/planes' }, 'Ver planes')));
    const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
    const bubble = (role, text) => { const m = h('div', { class: 'msg ' + role }, text); log.appendChild(m); log.scrollTop = log.scrollHeight; return m; };
    if (!hist.messages.length) bubble('assistant', `Soy ${a.name}, asistente de Elevation en ${a.area.toLowerCase()}. ${a.desc} ¿Por dónde empezamos?`);
    hist.messages.forEach((m) => bubble(m.role, m.content));
    const ta = h('textarea', { rows: 1, placeholder: `Escríbele a ${a.name}…`, maxlength: 4000, 'aria-label': 'Mensaje' });
    const send = async (text) => {
      text = text.trim(); if (!text) return;
      ta.value = ''; btn.disabled = true;
      bubble('user', text);
      const wait = bubble('assistant', '…');
      try { const r = await api(`/assistants/${id}/chat`, { method: 'POST', body: { message: text } }); wait.textContent = r.reply; }
      catch (ex) { wait.textContent = ex.message; wait.style.color = 'var(--danger)'; }
      btn.disabled = false; log.scrollTop = log.scrollHeight; ta.focus();
    };
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Enviar');
    const form = h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); send(ta.value); } }, ta, btn);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    page('asistentes', h('div', { class: 'container section' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/asistentes' }, 'Asistentes'), ` › ${a.name}`),
      h('div', { class: 'row between' }, h('div', {}, h('h1', {}, a.name), h('div', { class: 'phase-num' }, a.area)),
        h('button', { class: 'btn ghost small', onclick: async () => { if (!confirm('¿Borrar esta conversación?')) return; await api(`/assistants/${id}/history`, { method: 'DELETE' }); viewChat(id); } }, 'Borrar conversación')),
      !list.configured ? h('p', { class: 'small', style: 'color:var(--warn)' }, 'Modo demo: el modelo aún no está conectado.') : null,
      h('div', { class: 'chips mb' }, a.starters.map((s) => h('button', { class: 'chip', onclick: () => send(s) }, s))),
      h('div', { class: 'chat' }, log, form)));
  }

  // ---------- Admin ----------
  async function viewAdmin() {
    page('admin', loading());
    const [stats, { users }] = await Promise.all([api('/admin/stats'), api('/admin/users')]);
    page('admin', h('div', { class: 'container section' },
      h('h1', {}, 'Administración'),
      h('div', { class: 'grid c4 mt' },
        [['Usuarios', stats.total], ['Lecciones completadas', stats.lessons], ['Publicaciones', stats.posts], ['Mensajes a asistentes', stats.msgs]].map(([t, n]) => h('div', { class: 'card' }, h('div', { class: 'stat' }, n), h('p', { class: 'small muted' }, t)))),
      h('p', { class: 'small muted mt' }, 'Por plan: ' + stats.byPlan.map((p) => `${PLAN_LABEL[p.plan]} ${p.n}`).join(' · ')),
      h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'País', 'Alta', 'Lecciones', 'Plan', 'Rol'].map((c) => h('th', {}, c)))),
        h('tbody', {}, users.map((u) => h('tr', {},
          h('td', {}, u.name), h('td', {}, u.email), h('td', {}, u.country || '—'), h('td', {}, fmtDate(u.created_at)), h('td', {}, u.lessons_done),
          h('td', {}, h('select', { 'aria-label': 'Plan de ' + u.name, onchange: async (e) => { try { await api('/admin/users/' + u.id, { method: 'PATCH', body: { plan: e.target.value } }); toast('Plan actualizado.'); } catch (ex) { toast(ex.message); } } },
            Object.keys(PLAN_LABEL).map((p) => h('option', { value: p, selected: u.plan === p }, PLAN_LABEL[p])))),
          h('td', {}, u.role))))))));
  }

  function viewNotFound() {
    page('', h('div', { class: 'narrow section center' }, h('h1', {}, 'Página no encontrada'), h('a', { class: 'btn primary', href: '#/' }, 'Volver al inicio')));
  }

  // ---------- Router ----------
  const MEMBER_ROUTES = new Set(['panel', 'ruta', 'fase', 'leccion', 'comunidad', 'asistentes', 'entregables', 'admin']);

  async function route() {
    const raw = location.hash.slice(1) || '/';
    const [pathPart, qs] = raw.split('?');
    const seg = pathPart.split('/').filter(Boolean);
    const query = new URLSearchParams(qs || '');
    const root = seg[0] || '';
    try {
      if (state.user === null && !state._loaded) { await loadMe(); state._loaded = true; }
      if (MEMBER_ROUTES.has(root) && !state.user) return go('/login');
      if ((root === 'login' || root === 'registro') && state.user) return go('/panel');
      if (root === 'admin' && state.user.role !== 'admin') return go('/panel');
      switch (root) {
        case '': return state.user ? go('/panel') : await viewLanding();
        case 'login': return authForm('login');
        case 'registro': return authForm('registro');
        case 'planes': return await viewPlans();
        case 'panel': return await viewDashboard();
        case 'ruta': return await viewRoute();
        case 'fase': return await viewPhase(seg[1]);
        case 'leccion': return await viewLesson(seg[1]);
        case 'entregables': return await viewDeliverables();
        case 'comunidad': return seg[1] === 'post' ? await viewPost(seg[2]) : await viewCommunity(query);
        case 'asistentes': return seg[1] ? await viewChat(seg[1]) : await viewAssistants();
        case 'admin': return await viewAdmin();
        default: return viewNotFound();
      }
    } catch (ex) {
      if (ex.status === 401) return;
      page('', h('div', { class: 'narrow section center' }, h('h1', {}, 'Algo salió mal'), h('p', { class: 'muted' }, ex.message), h('a', { class: 'btn primary', href: '#/' }, 'Volver al inicio')));
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
