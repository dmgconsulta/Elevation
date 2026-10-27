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

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    kids.forEach((k) => k && el.appendChild(k));
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

  function download(name, content, type) {
    const url = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  const go = (p) => { location.hash = '#' + p; };
  const fmtDate = (ts) => new Date(ts).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (ts) => new Date(ts).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtLong = (ts) => new Date(ts).toLocaleString('es', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const fmtNum = (n) => Number(n).toLocaleString('es', { maximumFractionDigits: 1 });
  const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const words = (t) => (t.trim().match(/\S+/g) || []).length;
  const PLAN_LABEL = { free: 'Free', starter: 'Starter', pro: 'Pro', elite: 'Elite' };
  const RANK = { free: 0, starter: 1, pro: 2, elite: 3 };
  const hasPlan = (min) => !!state.user && RANK[state.user.effectivePlan] >= RANK[min];
  const loading = () => h('div', { class: 'container center mt', 'aria-busy': 'true' }, h('span', { class: 'spinner', 'aria-label': 'Cargando' }));

  async function loadMe() { state.user = (await api('/me')).user; }
  async function loadCatalog() { state.catalog = (await api('/catalog')).phases; }

  // ---------- Markdown seguro (solo nodos de texto) ----------
  function inline(text) {
    const out = [];
    const re = /(\*\*[^*\n]+\*\*|\*[^*\s\n][^*\n]*\*|`[^`\n]+`)/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith('**')) out.push(h('strong', {}, tok.slice(2, -2)));
      else if (tok.startsWith('`')) out.push(h('code', {}, tok.slice(1, -1)));
      else out.push(h('em', {}, tok.slice(1, -1)));
      last = m.index + tok.length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  }

  function markdown(src) {
    const root = h('div', { class: 'md' });
    const lines = String(src).replace(/\r/g, '').split('\n');
    let list = null, para = [];
    const flushPara = () => { if (para.length) { root.appendChild(h('p', {}, para.flatMap((l, i) => (i ? [h('br'), ...inline(l)] : inline(l))))); para = []; } };
    const flushList = () => { if (list) { root.appendChild(list); list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushPara(); flushList(); continue; }
      if ((m = line.match(/^\s*#{1,6}\s+(.*)$/))) { flushPara(); flushList(); root.appendChild(h('h4', {}, inline(m[1]))); continue; }
      if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
        flushPara(); if (!list || list.tagName !== 'UL') { flushList(); list = h('ul'); }
        list.appendChild(h('li', {}, inline(m[1]))); continue;
      }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
        flushPara(); if (!list || list.tagName !== 'OL') { flushList(); list = h('ol'); }
        list.appendChild(h('li', {}, inline(m[1]))); continue;
      }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); flushList(); root.appendChild(h('hr')); continue; }
      flushList(); para.push(line);
    }
    flushPara(); flushList();
    return root;
  }

  // ---------- Tema claro/oscuro ----------
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(store.get('theme'));
  function toggleTheme() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark'
      || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
    const next = dark ? 'light' : 'dark';
    store.set('theme', next); applyTheme(next);
  }

  // ---------- Layout ----------
  function topbar(active) {
    const u = state.user;
    const close = () => nav.classList.remove('open');
    const link = (href, label, key) => h('a', { href: '#' + href, class: active === key ? 'active' : '', 'aria-current': active === key ? 'page' : null, onclick: close }, label);
    const logout = async (e) => { e.preventDefault(); await api('/auth/logout', { method: 'POST' }).catch(() => {}); state.user = null; state.catalog = null; go('/'); };
    const nav = h('nav', { class: 'nav', id: 'main-nav', 'aria-label': 'Principal' },
      u ? [
        link('/panel', 'Panel', 'panel'), link('/ruta', 'Ruta', 'ruta'), link('/asistentes', 'Asistentes', 'asistentes'),
        link('/comunidad', 'Comunidad', 'comunidad'), link('/agenda', 'Agenda', 'agenda'), link('/kpis', 'KPIs', 'kpis'),
        h('details', { class: 'user-menu' },
          h('summary', { 'aria-label': 'Menú de cuenta' }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, u.name.trim()[0].toUpperCase()), h('span', { class: 'plan-pill' }, (u.trial ? 'Trial ' : '') + PLAN_LABEL[u.effectivePlan])),
          h('div', { class: 'menu' },
            h('div', { class: 'small muted', style: 'padding:.3rem .8rem .5rem' }, u.email),
            link('/entregables', 'Mis entregables', 'entregables'),
            link('/cuenta', 'Mi cuenta', 'cuenta'),
            link('/planes', 'Planes', 'planes'),
            u.role === 'admin' ? link('/admin', 'Administración', 'admin') : null,
            h('a', { href: '#/', onclick: logout }, 'Salir'))),
      ] : [
        link('/', 'Inicio', 'inicio'), link('/planes', 'Planes', 'planes'), link('/login', 'Entrar', 'login'),
        h('a', { href: '#/registro', class: 'btn primary small' }, 'Empieza gratis'),
      ]);
    return h('header', { class: 'topbar' }, h('div', { class: 'container' },
      h('a', { href: u ? '#/panel' : '#/', class: 'brand', 'aria-label': 'Elevation, inicio' }, h('img', { src: '/img/logo-wordmark.png', alt: 'Elevation', width: 204, height: 26, class: 'logo-light' }), h('img', { src: '/img/logo-wordmark-dark.png', alt: '', width: 204, height: 26, class: 'logo-dark' })),
      h('button', { class: 'menu-btn', 'aria-label': 'Abrir menú', 'aria-controls': 'main-nav', onclick: (e) => { const o = nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', o); } }, '☰'),
      nav));
  }

  function footer() {
    return h('footer', { class: 'footer' }, h('div', { class: 'container row between' },
      h('div', { class: 'tag' }, 'We elevate ', h('b', {}, 'nations')),
      h('div', { class: 'row', style: 'gap:.8rem' },
        h('span', {}, 'Elevation · Formación política para Latinoamérica'),
        h('button', { class: 'chip', onclick: toggleTheme, 'aria-label': 'Cambiar tema claro u oscuro' }, '◐ Tema'))));
  }

  function trialBanner() {
    const u = state.user;
    if (!u || !u.trial) return null;
    const days = Math.max(0, Math.ceil((u.trialEndsAt - Date.now()) / 86400000));
    return h('div', { class: 'trial-banner' }, `Tu prueba gratuita de Starter termina en ${days} ${days === 1 ? 'día' : 'días'}. `, h('a', { href: '#/planes' }, 'Elige tu plan'));
  }

  function page(active, ...content) {
    app.replaceChildren(...[
      h('a', { href: '#main', class: 'skip', onclick: (e) => { e.preventDefault(); document.getElementById('main').focus(); } }, 'Saltar al contenido'),
      topbar(active), trialBanner(), h('main', { id: 'main', tabindex: '-1' }, ...content), footer(),
    ].filter(Boolean));
    window.scrollTo(0, 0);
  }

  function setTitle(t) { document.title = t ? `${t} · Elevation` : 'Elevation · Escuela de estrategia política'; }

  const upsell = (min, what) => h('div', { class: 'card center upsell' },
    h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[min]}`),
    h('h2', { class: 'mt-s' }, what),
    h('p', { class: 'muted' }, `Disponible desde el plan ${PLAN_LABEL[min]}.`),
    h('a', { class: 'btn primary', href: '#/planes' }, 'Ver planes'));

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

  // Versión Markdown de una lección, para descargar como recurso.
  function lessonToMd(l, phase) {
    const out = [`# ${l.title}`, `_${phase.name} · ${phase.title} · ${l.minutes} min_`, '', l.summary, ''];
    for (const b of l.blocks) {
      if (b.t === 'p') out.push(b.text, '');
      else if (b.t === 'h') out.push(`## ${b.text}`, '');
      else if (b.t === 'ul') out.push(...b.items.map((i) => `- ${i}`), '');
      else if (b.t === 'ol') out.push(...b.items.map((i, n) => `${n + 1}. ${i}`), '');
      else if (b.t === 'quote') out.push(`> ${b.text}`, '');
      else if (b.t === 'callout') out.push(`**${b.title}**`, ...b.items.map((i) => `- ${i}`), '');
      else if (b.t === 'table') out.push(`| ${b.head.join(' | ')} |`, `|${b.head.map(() => ' --- ').join('|')}|`, ...b.rows.map((r) => `| ${r.join(' | ')} |`), '');
    }
    out.push('## Checklist', ...l.checklist.map((c) => `- [ ] ${c}`), '', `## Entregable: ${l.deliverable.title}`, l.deliverable.prompt, '');
    return out.join('\n');
  }

  const pct = (done, total) => (total ? Math.round((done / total) * 100) : 0);
  const progressBar = (done, total, label) => h('div', { class: 'bar', role: 'progressbar', 'aria-label': label || 'Progreso', 'aria-valuenow': pct(done, total), 'aria-valuemin': 0, 'aria-valuemax': 100 },
    h('span', { style: `width:${pct(done, total)}%` }));

  function ring(value, size = 120) {
    const r = size / 2 - 9, c = 2 * Math.PI * r;
    return s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'ring', role: 'img', 'aria-label': `${value}% completado` },
      s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-bg' }),
      value > 0 ? s('circle', { cx: size / 2, cy: size / 2, r, class: 'ring-fg', 'stroke-dasharray': `${(c * value) / 100} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }) : null,
      (() => { const t = s('text', { x: '50%', y: '50%', 'dominant-baseline': 'central', 'text-anchor': 'middle', class: 'ring-txt' }); t.textContent = `${value}%`; return t; })());
  }

  function sparkline(series, w = 160, hgt = 40) {
    const max = Math.max(1, ...series);
    const step = w / (series.length - 1);
    const pts = series.map((v, i) => [i * step, hgt - 4 - (v / max) * (hgt - 8)]);
    const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
    const area = `0,${hgt} ${line} ${w},${hgt}`;
    const last = pts[pts.length - 1];
    return s('svg', { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: 'spark', 'aria-hidden': 'true' },
      s('polygon', { points: area, class: 'spark-area' }),
      s('polyline', { points: line, class: 'spark-line' }),
      s('circle', { cx: last[0], cy: last[1], r: 3, class: 'spark-dot' }));
  }

  // ---------- Vistas públicas ----------
  async function viewLanding() {
    setTitle('');
    if (!state.catalog) { try { await loadCatalog(); } catch {} }
    const phases = state.catalog || [];
    const totalLessons = phases.reduce((a, p) => a + p.lessons.length, 0);
    page('inicio',
      h('section', { class: 'hero' }, h('div', { class: 'container' },
        h('div', {},
          h('div', { class: 'eyebrow' }, 'Escuela de estrategia política'),
          h('h1', {}, 'Latinoamérica no necesita más asesores. Necesita ', h('em', {}, 'otra forma de hacer estrategia.')),
          h('p', { class: 'lead' }, 'Un método en cuatro fases, asistentes de IA, datos y comunidad para construir una carrera política con rigor, desde el primer día y a un costo accesible.'),
          h('div', { class: 'row mt' },
            h('a', { href: '#/registro', class: 'btn primary' }, 'Empieza con 3 días gratis'),
            h('a', { href: '#/planes', class: 'btn ghost' }, 'Ver planes')),
          h('div', { class: 'hero-stats' },
            [[phases.length || 4, 'fases'], [totalLessons || 30, 'lecciones'], [4, 'asistentes IA'], ['10', 'años de ruta']]
              .map(([n, t]) => h('div', {}, h('strong', {}, n), h('span', {}, t))))),
        h('div', { class: 'hero-art' }, h('div', { class: 'disc' }, h('img', { src: '/img/logo-mark.png', alt: '' }))))),
      h('section', { class: 'section' }, h('div', { class: 'container' },
        h('h2', {}, 'Una ruta completa: Start → Grow → Launch → Scale'),
        h('p', { class: 'muted' }, 'Cada fase termina con entregables reales: tu primer discurso, un mapa de actores, un plan de campaña, un informe temático.'),
        h('ol', { class: 'timeline mt' }, phases.map((p) => h('li', { class: 'card lift' },
          h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`),
          h('h3', {}, p.name),
          h('p', { class: 'small muted' }, p.title),
          h('p', { class: 'small' }, p.subtitle),
          h('p', { class: 'small muted', style: 'margin:0' }, `${p.lessons.length} lecciones · primera gratis`)))))),
      h('section', { class: 'section soft' }, h('div', { class: 'container' },
        h('h2', {}, 'Por qué la mayoría abandona antes de empezar'),
        h('p', { class: 'muted' }, 'No es falta de talento: es una triple brecha de método, acceso y datos que convierte la motivación ciudadana en frustración.'),
        h('div', { class: 'grid c3 mt' },
          h('div', { class: 'card' }, h('h3', {}, 'Método'), h('p', { class: 'small' }, 'Una hoja de ruta integral, con lecciones, checklists y entregables, en lugar de consultoras que funcionan como cajas negras.')),
          h('div', { class: 'card' }, h('h3', {}, 'Acceso'), h('p', { class: 'small' }, 'Formación, mentores y comunidad a un precio fijo y bajo, en vez de tickets inalcanzables.')),
          h('div', { class: 'card' }, h('h3', {}, 'Datos'), h('p', { class: 'small' }, 'Decidir con métricas y no con intuición: un dashboard de KPIs con las metas de cada fase.'))))),
      h('section', { class: 'section' }, h('div', { class: 'container' },
        h('h2', {}, 'Qué incluye la plataforma'),
        h('div', { class: 'grid c3 mt' },
          [['Formación modular', 'Ruta Start → Grow → Launch → Scale con lecciones, checklists y entregables descargables.'],
           ['Asistentes virtuales', 'Nova (discurso), Atenea (estrategia), Freya (síntesis) y Charlie (logística). Conocen tu fase y tus entregables.'],
           ['Revisión de entregables', 'Pide a un asistente que revise tu trabajo con la consigna de la lección y te diga qué falta.'],
           ['Dashboard KPI', 'Registra libros, presentaciones, aliados, medios o donantes y mira tu avance hacia cada hito.'],
           ['Comunidad y agenda', 'Canales abiertos y cerrados, sesiones en vivo, mentorías grupales y convocatorias.'],
           ['Hitos verificables', 'Criterios claros para saber cuándo una fase está realmente completa.']]
            .map(([t, d]) => h('div', { class: 'card lift' }, h('h3', {}, t), h('p', { class: 'small muted' }, d)))))),
      h('section', { class: 'section soft' }, h('div', { class: 'container' },
        h('h2', {}, 'Para quién es'),
        h('div', { class: 'grid c3 mt' },
          h('div', { class: 'card' }, h('span', { class: 'badge blue' }, '18–27 años'), h('h3', { class: 'mt-s' }, 'Políticos noveles y activistas'), h('p', { class: 'small' }, 'Estudiantes o recién graduados con ambición de incidir en su comunidad, pero sin hoja de ruta estratégica.')),
          h('div', { class: 'card' }, h('span', { class: 'badge blue' }, '28–40 años'), h('h3', { class: 'mt-s' }, 'Consultores y profesionales emergentes'), h('p', { class: 'small' }, 'Con experiencia táctica en redes, diseño o prensa, que necesitan un framework político completo.')),
          h('div', { class: 'card' }, h('span', { class: 'badge blue' }, '25–35 años'), h('h3', { class: 'mt-s' }, 'Futuros candidatos'), h('p', { class: 'small' }, 'Profesionales con reputación local que quieren explorar la carrera política con un camino claro, ético y medible.'))))),
      h('section', { class: 'section' }, h('div', { class: 'narrow' },
        h('h2', { class: 'center' }, 'Preguntas frecuentes'),
        [['¿Necesito experiencia política previa?', 'No. La fase Start está pensada para empezar desde cero: diagnóstico, narrativa e identidad antes de cualquier acción pública.'],
         ['¿La escuela promueve alguna ideología?', 'No. El método sirve a personas de cualquier orientación política. Los asistentes tampoco hacen propaganda a favor o en contra de partidos o candidatos.'],
         ['¿Qué pasa al terminar la prueba de 3 días?', 'Tu cuenta vuelve al plan Free: conservas tu progreso y tus entregables, y puedes seguir con la primera lección de cada fase.'],
         ['¿Puedo descargar mis entregables?', 'Sí. Cada entregable se guarda automáticamente y puedes descargarlos todos en un archivo, además de exportar todos tus datos desde Mi cuenta.']]
          .map(([q, a]) => h('details', { class: 'faq' }, h('summary', {}, q), h('p', { class: 'muted' }, a))))),
      h('section', { class: 'section center soft' }, h('div', { class: 'narrow' },
        h('h2', {}, 'La estrategia también puede ser un acto de verdad'),
        h('p', { class: 'muted' }, 'Crea tu cuenta y empieza hoy: tienes 3 días de Starter sin costo.'),
        h('a', { href: '#/registro', class: 'btn primary' }, 'Crear mi cuenta'))));
  }

  function authForm(mode) {
    const isReg = mode === 'registro';
    setTitle(isReg ? 'Crear cuenta' : 'Entrar');
    const err = h('div', { class: 'err', role: 'alert' });
    const f = (id, label, attrs = {}) => h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, name: id, required: true, ...attrs }));
    const pwd = h('input', { id: 'password', name: 'password', type: 'password', required: true, minlength: isReg ? 8 : 1, autocomplete: isReg ? 'new-password' : 'current-password' });
    const form = h('form', {
      onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        const btn = form.querySelector('button[type=submit]'); btn.disabled = true;
        const v = Object.fromEntries(new FormData(form));
        try {
          const r = await api(isReg ? '/auth/register' : '/auth/login', { method: 'POST', body: v });
          state.user = r.user; state.catalog = null;
          toast(isReg ? '¡Bienvenido! Tu prueba de Starter ya está activa.' : 'Sesión iniciada.');
          const back = sessionStorage.getItem('after-login'); sessionStorage.removeItem('after-login');
          go(back && !/^\/(login|registro)/.test(back) ? back : '/panel');
        } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
      },
    },
      isReg ? f('name', 'Nombre completo', { autocomplete: 'name' }) : null,
      f('email', 'Correo electrónico', { type: 'email', autocomplete: 'email' }),
      h('div', { class: 'field' }, h('label', { for: 'password' }, 'Contraseña' + (isReg ? ' (mínimo 8 caracteres)' : '')),
        h('div', { class: 'pwd' }, pwd, h('button', { type: 'button', class: 'chip', 'aria-label': 'Mostrar u ocultar contraseña', onclick: (e) => { pwd.type = pwd.type === 'password' ? 'text' : 'password'; e.currentTarget.textContent = pwd.type === 'password' ? 'Ver' : 'Ocultar'; } }, 'Ver'))),
      isReg ? h('div', { class: 'field' }, h('label', { for: 'country' }, 'País'), countryInput('country', '')) : null,
      isReg ? h('div', { class: 'field' }, h('label', { for: 'segment' }, '¿Cuál te describe mejor?'), segmentSelect('segment', '')) : null,
      err,
      h('button', { class: 'btn primary', type: 'submit', style: 'width:100%' }, isReg ? 'Crear cuenta' : 'Entrar'));
    page(mode,
      h('div', { class: 'auth-wrap' }, h('div', { class: 'auth-card' },
        h('h2', {}, isReg ? 'Crea tu cuenta' : 'Bienvenido de vuelta'),
        isReg ? h('p', { class: 'muted small' }, 'Incluye 3 días de Starter sin costo. Sin tarjeta.') : null,
        form,
        h('p', { class: 'small center mt-s' }, isReg ? ['¿Ya tienes cuenta? ', h('a', { href: '#/login' }, 'Entra')] : ['¿Primera vez? ', h('a', { href: '#/registro' }, 'Crea tu cuenta')])
      )));
  }

  const COUNTRIES = ['Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España', 'Estados Unidos', 'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá', 'Paraguay', 'Perú', 'Puerto Rico', 'República Dominicana', 'Uruguay', 'Venezuela'];
  function countryInput(id, value) {
    return [h('input', { id, name: 'country', list: id + '-list', autocomplete: 'country-name', value: value || '', maxlength: 60 }),
      h('datalist', { id: id + '-list' }, COUNTRIES.map((c) => h('option', { value: c })))];
  }
  function segmentSelect(id, value) {
    return h('select', { id, name: 'segment' },
      [['', 'Prefiero no decirlo'], ['novel', 'Político novel o activista'], ['consultor', 'Consultor o profesional emergente'], ['futuro', 'Futuro candidato']]
        .map(([v, t]) => h('option', { value: v, selected: (value || '') === v }, t)));
  }

  async function viewPlans() {
    setTitle('Planes');
    const pl = state.plans || await api('/plans');
    state.plans = pl;
    let annual = false;
    const root = h('div');
    const draw = () => {
      const cur = state.user ? state.user.plan : null;
      root.replaceChildren(
        h('div', { class: 'center mb' },
          h('div', { class: 'toggle', role: 'group', 'aria-label': 'Facturación' },
            h('button', { class: annual ? '' : 'on', 'aria-pressed': !annual, onclick: () => { annual = false; draw(); } }, 'Mensual'),
            h('button', { class: annual ? 'on' : '', 'aria-pressed': annual, onclick: () => { annual = true; draw(); } }, 'Anual ', h('span', { class: 'badge ok' }, '2 meses gratis')))),
        h('div', { class: 'grid c4' }, pl.plans.map((p) => {
          const price = annual ? p.annual : p.monthly;
          const isCur = cur === p.id;
          let btn;
          if (!state.user) btn = h('a', { href: '#/registro', class: 'btn ' + (p.id === 'pro' ? 'primary' : 'ghost') }, p.id === 'free' ? 'Empezar' : 'Probar 3 días');
          else if (isCur) btn = h('button', { class: 'btn ghost', disabled: true }, 'Tu plan actual');
          else btn = h('button', { class: 'btn ' + (p.id === 'pro' ? 'primary' : 'ghost'), onclick: async () => {
            if (pl.paymentsMode !== 'demo') return toast('Los pagos aún no están conectados.');
            if (!confirm(`¿Cambiar a ${p.label}? (modo demostración: sin cobro)`)) return;
            try { const r = await api('/billing/change', { method: 'POST', body: { plan: p.id, billing: annual ? 'annual' : 'monthly' } }); state.user = r.user; state.catalog = null; toast(`Plan ${p.label} activado.`); page('planes', shell); draw(); }
            catch (ex) { toast(ex.message); }
          } }, RANK[p.id] > RANK[cur] ? `Subir a ${p.label}` : `Cambiar a ${p.label}`);
          return h('div', { class: 'card price-card' + (p.id === 'pro' ? ' featured' : '') },
            p.id === 'pro' ? h('span', { class: 'badge blue', style: 'align-self:flex-start;margin-bottom:.5rem' }, 'Más elegido') : null,
            h('h3', {}, p.label),
            h('div', { class: 'price' }, price === 0 ? 'Gratis' : `US$${price}`, price ? h('span', { class: 'small muted' }, annual ? ' /año' : ' /mes') : null),
            annual && price ? h('p', { class: 'small muted', style: 'margin:-.3rem 0 .4rem' }, `Equivale a US$${(price / 12).toFixed(2)} al mes`) : null,
            h('p', { class: 'small muted' }, p.tagline),
            h('ul', {}, p.features.map((f) => h('li', {}, f))),
            btn);
        })),
        pl.paymentsMode === 'demo' ? h('p', { class: 'small muted center mt' }, 'Modo demostración: el cambio de plan es inmediato y no genera cobros. Conecta una pasarela de pago antes de abrir al público.') : null);
    };
    draw();
    const shell = h('section', { class: 'section' }, h('div', { class: 'container' },
      h('h1', { class: 'center' }, 'Planes'),
      h('p', { class: 'center muted mb' }, `Escala a medida que crece tu carrera. Los nuevos miembros reciben ${pl.trialDays} días de Starter sin costo.`),
      root));
    page('planes', shell);
  }

  // ---------- Vistas de miembro ----------
  function nextLesson() {
    for (const ph of state.catalog) for (const l of ph.lessons) if (!l.locked && !l.done) return { ph, l };
    return null;
  }

  async function viewDashboard() {
    setTitle('Panel');
    page('panel', loading());
    const [, ev] = await Promise.all([loadCatalog(), api('/events').catch(() => ({ events: [] }))]);
    const u = state.user, cat = state.catalog;
    const totals = cat.reduce((a, p) => ({ d: a.d + p.progress.done, t: a.t + p.progress.total }), { d: 0, t: 0 });
    const msTotals = cat.reduce((a, p) => ({ d: a.d + p.milestones.filter((m) => m.done).length, t: a.t + p.milestones.length }), { d: 0, t: 0 });
    const delivs = cat.reduce((a, p) => a + p.lessons.filter((l) => l.hasDeliverable).length, 0);
    const nx = nextLesson();
    const upcoming = ev.events.slice(0, 3);
    page('panel', h('div', { class: 'container section' },
      h('h1', {}, `Hola, ${u.name.split(' ')[0]}`),
      h('p', { class: 'muted' }, `Plan ${PLAN_LABEL[u.effectivePlan]}${u.trial ? ' (prueba)' : ''} · ${totals.d} de ${totals.t} lecciones completadas`),
      !u.country || !u.segment ? h('div', { class: 'callout' }, h('strong', { class: 't' }, 'Personaliza tu experiencia'),
        h('p', {}, 'Indica tu país y perfil para que los asistentes adapten sus respuestas. ', h('a', { href: '#/cuenta' }, 'Completar perfil'))) : null,
      h('div', { class: 'grid dash mt' },
        h('div', { class: 'card continue' },
          h('h3', {}, 'Continúa donde lo dejaste'),
          nx ? [h('p', { class: 'small muted' }, `${nx.ph.name} · lección ${nx.l.order} · ${nx.l.minutes} min`), h('p', {}, h('strong', {}, nx.l.title)), h('p', { class: 'small muted' }, nx.l.summary),
            h('a', { class: 'btn primary', href: '#/leccion/' + nx.l.id }, 'Continuar')]
            : [h('p', {}, 'Completaste todas las lecciones disponibles en tu plan.'), h('a', { class: 'btn ghost', href: '#/planes' }, 'Ver planes')]),
        h('div', { class: 'card center' },
          h('h3', {}, 'Tu avance total'),
          ring(pct(totals.d, totals.t)),
          h('div', { class: 'mini-stats' },
            h('div', {}, h('strong', {}, msTotals.d), h('span', {}, 'hitos')),
            h('div', {}, h('strong', {}, delivs), h('span', {}, 'entregables'))))),
      h('h2', { class: 'mt' }, 'Tus fases'),
      h('div', { class: 'grid c4' }, cat.map((p) => {
        const ms = p.milestones.filter((m) => m.done).length;
        return h('a', { href: '#/fase/' + p.id, class: 'card lift plain' },
          h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`),
          h('h3', {}, p.name),
          p.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[p.minPlan]}`) : (p.progress.done === p.progress.total ? h('span', { class: 'badge ok' }, 'Completada') : null),
          h('p', { class: 'small muted mt-s' }, `${p.progress.done}/${p.progress.total} lecciones · ${ms}/${p.milestones.length} hitos`),
          progressBar(p.progress.done, p.progress.total, `Progreso de ${p.name}`));
      })),
      h('div', { class: 'grid c2 mt', style: 'align-items:start' },
        h('div', { class: 'card' },
          h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Próximos eventos'), h('a', { href: '#/agenda', class: 'small' }, 'Ver agenda')),
          upcoming.length ? h('ul', { class: 'event-mini' }, upcoming.map((e) => h('li', {},
            h('span', { class: 'when' }, fmtTime(e.startsAt)), h('span', { class: 'grow' }, h('strong', {}, e.title), h('br'), h('span', { class: 'small muted' }, e.kindLabel)),
            e.locked ? h('span', { class: 'badge lock' }, PLAN_LABEL[e.minPlan]) : null)))
            : h('p', { class: 'small muted mt-s' }, 'No hay eventos programados por ahora.')),
        h('div', { class: 'grid c2', style: 'gap:1rem' },
          [['#/asistentes', 'Asistentes IA', 'Nova, Atenea, Freya y Charlie.'], ['#/kpis', 'Dashboard KPI', hasPlan('pro') ? 'Registra tu avance medible.' : 'Disponible en Pro.'],
           ['#/comunidad', 'Comunidad', 'Pregunta y conecta con pares.'], ['#/entregables', 'Mis entregables', 'Tus documentos, exportables.']]
            .map(([href, t, d]) => h('a', { href, class: 'card lift plain' }, h('h3', {}, t), h('p', { class: 'small muted', style: 'margin:0' }, d)))))));
  }

  const lessonRow = (l) => {
    const dot = h('span', { class: 'dot' + (l.done ? ' done' : '') }, l.done ? '✓' : l.order);
    const body = [dot, h('span', { class: 'grow' }, h('strong', {}, l.title), h('br'), h('span', { class: 'small muted' }, `${l.minutes} min`, l.hasDeliverable ? ' · entregable guardado' : '')),
      l.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[l.minPlan]}`) : (l.minPlan === 'free' ? h('span', { class: 'badge ok' }, 'Gratis') : null)];
    return h('li', {}, l.locked ? h('a', { href: '#/planes' }, body) : h('a', { href: '#/leccion/' + l.id }, body));
  };

  function searchBox() {
    const results = h('div', { class: 'search-results', 'aria-live': 'polite' });
    let timer, seq = 0;
    const input = h('input', { type: 'search', placeholder: 'Buscar en las lecciones (ej.: narrativa, partido, donantes)…', 'aria-label': 'Buscar en las lecciones', oninput: () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const q = input.value.trim(), my = ++seq;
        if (q.length < 3) return results.replaceChildren();
        const { results: r } = await api('/search?q=' + encodeURIComponent(q));
        if (my !== seq) return;
        results.replaceChildren(r.length ? h('ul', { class: 'lesson-list card' }, r.map((x) => h('li', {}, h('a', { href: x.locked ? '#/planes' : '#/leccion/' + x.id },
          h('span', { class: 'grow' }, h('span', { class: 'small muted' }, x.phase), h('br'), h('strong', {}, x.title), h('br'), h('span', { class: 'small muted' }, x.snippet)),
          x.locked ? h('span', { class: 'badge lock' }, 'Bloqueada') : null)))) : h('p', { class: 'small muted' }, 'Sin resultados.'));
      }, 250);
    } });
    return h('div', { class: 'search' }, input, results);
  }

  async function viewRoute() {
    setTitle('Tu ruta');
    page('ruta', loading());
    await loadCatalog();
    page('ruta', h('div', { class: 'container section' },
      h('h1', {}, 'Tu ruta'),
      h('p', { class: 'muted' }, 'Start → Grow → Launch → Scale. Avanza en orden: cada fase se apoya en la anterior.'),
      searchBox(),
      state.catalog.map((p) => h('div', { class: 'card mt' },
        h('div', { class: 'row between' },
          h('div', {}, h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`), h('h2', {}, `${p.name}: ${p.title}`)),
          h('a', { href: '#/fase/' + p.id, class: 'btn ghost small' }, 'Ver fase')),
        progressBar(p.progress.done, p.progress.total, `Progreso de ${p.name}`),
        h('ul', { class: 'lesson-list mt-s' }, p.lessons.map(lessonRow))))));
  }

  async function viewPhase(id) {
    page('ruta', loading());
    await loadCatalog();
    const p = state.catalog.find((x) => x.id === id);
    if (!p) return viewNotFound();
    setTitle(p.name);
    const msCount = h('span', {}, `${p.milestones.filter((m) => m.done).length}/${p.milestones.length}`);
    page('ruta', h('div', { class: 'container section' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/ruta' }, 'Ruta'), ` › ${p.name}`),
      h('div', { class: 'phase-num' }, `Fase ${p.order} · ${p.horizon}`),
      h('h1', {}, `${p.name}: ${p.title}`),
      h('p', { class: 'muted' }, p.subtitle),
      h('div', { class: 'narrow', style: 'margin:0' }, h('p', { class: 'intro' }, p.intro)),
      h('div', { class: 'callout' }, h('strong', { class: 't' }, 'Premisa de la fase'), h('p', {}, p.premise)),
      h('div', { class: 'grid c2' },
        h('div', { class: 'card' },
          h('h3', {}, 'Lecciones'),
          progressBar(p.progress.done, p.progress.total, `Progreso de ${p.name}`),
          h('ul', { class: 'lesson-list mt-s' }, p.lessons.map(lessonRow))),
        h('div', { class: 'card' },
          h('div', { class: 'row between' }, h('h3', { style: 'margin:0' }, 'Hitos de completitud'), h('span', { class: 'badge blue' }, msCount)),
          h('p', { class: 'small muted mt-s' }, 'Márcalos solo cuando puedas demostrarlos con evidencia.'),
          h('ul', { class: 'checklist' }, p.milestones.map((m) => h('li', {},
            h('label', {}, h('input', {
              type: 'checkbox', checked: m.done, disabled: p.locked,
              onchange: async (e) => {
                try {
                  await api('/milestones', { method: 'POST', body: { phase: p.id, idx: m.idx, done: e.target.checked } });
                  m.done = e.target.checked; msCount.textContent = `${p.milestones.filter((x) => x.done).length}/${p.milestones.length}`;
                  toast(m.done ? 'Hito marcado.' : 'Hito desmarcado.');
                } catch (ex) { e.target.checked = !e.target.checked; toast(ex.message); }
              },
            }), h('span', {}, h('strong', {}, m.hito), h('br'), h('span', { class: 'small muted' }, m.criterio)))))))),
      h('div', { class: 'callout warn' },
        h('strong', { class: 't' }, 'Errores críticos a evitar'),
        h('ul', {}, p.errors.map((e) => h('li', {}, e))))));
  }

  async function viewLesson(id) {
    page('ruta', loading());
    let data;
    try { data = await api('/lessons/' + id); }
    catch (ex) {
      if (ex.status === 403) {
        const l = ex.data.lesson || {};
        setTitle(l.title || 'Lección bloqueada');
        return page('ruta', h('div', { class: 'narrow section center' },
          h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[ex.data.minPlan]}`),
          h('h1', { class: 'mt-s' }, l.title || 'Lección bloqueada'),
          h('p', { class: 'muted' }, l.summary || ''),
          h('a', { class: 'btn primary', href: '#/planes' }, 'Ver planes')));
      }
      if (ex.status === 404) return viewNotFound();
      throw ex;
    }
    const { lesson: l, phase, state: st, prev, next, reviewer, order } = data;
    setTitle(l.title);
    const checked = new Set(st.checks);

    // Entregable con guardado automático.
    const status = h('span', { class: 'saved', 'aria-live': 'polite' }, st.deliverable ? `Guardado ${fmtTime(st.deliverable.updatedAt)}` : '');
    const ta = h('textarea', { id: 'deliv', placeholder: 'Escribe aquí tu entregable… Se guarda solo mientras escribes.', maxlength: 20000, 'aria-label': l.deliverable.title, rows: 10 }, st.deliverable ? st.deliverable.body : '');
    const wc = h('span', { class: 'small muted' }, `${words(ta.value)} palabras`);
    let saved = ta.value, saveTimer, saving = null;
    const save = async () => {
      clearTimeout(saveTimer);
      if (ta.value === saved) return;
      const body = ta.value;
      status.textContent = 'Guardando…';
      saving = api(`/lessons/${l.id}/deliverable`, { method: 'PUT', body: { body } })
        .then((r) => { saved = body; status.textContent = `Guardado ${fmtTime(r.updatedAt)}`; })
        .catch((ex) => { status.textContent = 'Sin guardar'; toast(ex.message); })
        .finally(() => { saving = null; });
      return saving;
    };
    ta.addEventListener('input', () => { wc.textContent = `${words(ta.value)} palabras`; status.textContent = 'Cambios sin guardar'; clearTimeout(saveTimer); saveTimer = setTimeout(save, 1200); });
    ta.addEventListener('blur', save);
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
    window.addEventListener('hashchange', () => { if (ta.value !== saved) save(); }, { once: true });

    // Revisión con IA.
    const reviewBox = h('div', { class: 'review' });
    const showReview = (r) => reviewBox.replaceChildren(r ? h('div', { class: 'card review-card mt-s' },
      h('div', { class: 'row between' }, h('strong', {}, `Revisión de ${r.by}`), h('span', { class: 'small muted' }, fmtTime(r.at))),
      markdown(r.text)) : '');
    showReview(st.review);
    const reviewBtn = reviewer
      ? h('button', { class: 'btn ghost small', onclick: async (e) => {
        const b = e.currentTarget; b.disabled = true; const label = b.textContent; b.textContent = `${reviewer.name} está revisando…`;
        try { await save(); if (saving) await saving; const r = await api(`/lessons/${l.id}/review`, { method: 'POST' }); showReview(r.review); reviewBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
        catch (ex) { toast(ex.message); }
        b.disabled = false; b.textContent = label;
      } }, `✦ Pedir revisión a ${reviewer.name}`)
      : h('a', { class: 'btn ghost small', href: '#/planes' }, '✦ Revisión con IA (Starter)');

    let doneNow = st.done;
    const doneLabel = () => (doneNow ? '✓ Completada (clic para deshacer)' : 'Marcar como completada');
    const afterDone = h('div');
    const doneBtn = h('button', { class: 'btn ' + (doneNow ? 'ghost' : 'primary'), onclick: async () => {
      doneNow = !doneNow;
      try {
        await api(`/lessons/${l.id}/complete`, { method: 'POST', body: { done: doneNow } });
        state.catalog = null; doneBtn.className = 'btn ' + (doneNow ? 'ghost' : 'primary'); doneBtn.textContent = doneLabel();
        toast(doneNow ? 'Lección completada.' : 'Marca retirada.');
        afterDone.replaceChildren(doneNow && next && !next.locked ? h('div', { class: 'callout ok mt-s' }, h('strong', { class: 't' }, '¡Bien hecho!'), h('p', {}, 'Sigue con ', h('a', { href: '#/leccion/' + next.id }, next.title), '.')) : '');
      } catch (ex) { doneNow = !doneNow; toast(ex.message); }
    } }, doneLabel());

    const navBtn = (x, dir) => x ? (x.locked ? h('a', { class: 'btn ghost', href: '#/planes' }, `${dir === 'p' ? 'Anterior' : 'Siguiente'} (requiere plan)`) : h('a', { class: 'btn ghost', href: '#/leccion/' + x.id, rel: dir === 'p' ? 'prev' : 'next' }, `${dir === 'p' ? '← ' : ''}${x.title}${dir === 'n' ? ' →' : ''}`)) : h('span');
    const readBar = h('div', { class: 'read-progress', 'aria-hidden': 'true' }, h('span'));

    page('ruta', readBar, h('article', { class: 'lesson' }, h('div', { class: 'narrow' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/ruta' }, 'Ruta'), ' › ', h('a', { href: '#/fase/' + phase.id }, phase.name), ` › Lección ${order} de ${phase.total}`),
      h('h1', {}, l.title),
      h('div', { class: 'row between lesson-meta' },
        h('p', { class: 'muted small', style: 'margin:0' }, `${l.minutes} min de lectura`),
        h('div', { class: 'row', style: 'gap:.4rem' },
          h('button', { class: 'chip', onclick: () => download(`elevation-${l.id}.md`, lessonToMd(l, phase), 'text/markdown') }, '↓ Descargar guía'),
          h('button', { class: 'chip', onclick: () => print() }, '⎙ Imprimir'))),
      h('p', { class: 'lead-summary' }, l.summary),
      h('div', { class: 'lesson-body' }, l.blocks.map(renderBlock)),
      h('h2', { class: 'mt' }, 'Checklist de la lección'),
      h('ul', { class: 'checklist' }, l.checklist.map((c, i) => h('li', {}, h('label', {}, h('input', {
        type: 'checkbox', checked: checked.has(i),
        onchange: async (e) => { try { await api(`/lessons/${l.id}/checks`, { method: 'POST', body: { idx: i, checked: e.target.checked } }); } catch (ex) { e.target.checked = !e.target.checked; toast(ex.message); } },
      }), h('span', {}, c))))),
      h('div', { class: 'card mt deliverable' },
        h('span', { class: 'badge blue' }, 'Entregable'),
        h('h3', { class: 'mt-s' }, l.deliverable.title),
        h('p', { class: 'small' }, l.deliverable.prompt),
        ta,
        h('div', { class: 'row between mt-s' }, h('div', { class: 'row', style: 'gap:.6rem' }, h('button', { class: 'btn blue small', onclick: save }, 'Guardar'), status), wc),
        h('div', { class: 'row mt-s' }, reviewBtn, h('span', { class: 'small muted' }, 'Recibe una devolución contrastada con la consigna.')),
        reviewBox),
      h('div', { class: 'row mt' }, doneBtn),
      afterDone,
      h('div', { class: 'lesson-nav' }, navBtn(prev, 'p'), navBtn(next, 'n')))));

    const onScroll = () => {
      if (!readBar.isConnected) return window.removeEventListener('scroll', onScroll);
      const max = document.documentElement.scrollHeight - innerHeight;
      readBar.firstChild.style.width = `${max > 0 ? Math.min(100, (scrollY / max) * 100) : 0}%`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  async function viewDeliverables() {
    setTitle('Mis entregables');
    page('entregables', loading());
    const { deliverables } = await api('/deliverables');
    const sorted = [...deliverables].sort((a, b) => a.phaseOrder - b.phaseOrder || a.lessonOrder - b.lessonOrder);
    const exportAll = () => {
      const md = sorted.map((d) => `## ${d.phase} · ${d.title}\n_${d.lessonTitle} · ${fmtDate(d.updatedAt)}_\n\n${d.body}\n`).join('\n---\n\n');
      download('mis-entregables-elevation.md', `# Mis entregables de Elevation\n\n${md}`, 'text/markdown');
    };
    page('entregables', h('div', { class: 'container section' },
      h('div', { class: 'row between' }, h('h1', {}, 'Mis entregables'), deliverables.length ? h('button', { class: 'btn ghost', onclick: exportAll }, '↓ Descargar todo (.md)') : null),
      deliverables.length ? h('p', { class: 'muted' }, `${deliverables.length} ${deliverables.length === 1 ? 'entregable' : 'entregables'}, ordenados según la ruta.`) : null,
      deliverables.length ? sorted.map((d) => h('div', { class: 'card mt-s' },
        h('div', { class: 'row between' }, h('div', {}, h('span', { class: 'badge blue' }, d.phase), ' ', h('strong', {}, d.title), d.reviewed ? [' ', h('span', { class: 'badge ok' }, 'Revisado')] : null), h('span', { class: 'small muted' }, fmtDate(d.updatedAt))),
        h('p', { class: 'small', style: 'white-space:pre-wrap;margin-top:.7rem' }, d.body.length > 600 ? d.body.slice(0, 600) + '…' : d.body),
        h('div', { class: 'row', style: 'gap:.8rem' }, h('a', { href: '#/leccion/' + d.lessonId, class: 'small' }, 'Abrir lección y editar'), h('span', { class: 'small muted' }, `${words(d.body)} palabras`))))
        : h('div', { class: 'card mt center' }, h('p', { class: 'muted' }, 'Aún no has guardado entregables. Cada lección tiene uno al final.'), h('a', { class: 'btn primary', href: '#/ruta' }, 'Ir a la ruta'))));
  }

  // ---------- Dashboard KPI ----------
  async function viewKpis() {
    setTitle('Dashboard KPI');
    if (!hasPlan('pro')) {
      return page('kpis', h('div', { class: 'container section' }, h('h1', {}, 'Dashboard KPI'),
        h('p', { class: 'muted' }, 'Mide lo que importa en cada fase: libros, presentaciones, aliados, medios, donantes y cobertura territorial, con las metas de los hitos de Elevation.'),
        upsell('pro', 'Decide con datos, no con intuición')));
    }
    page('kpis', loading());
    const { metrics } = await api('/kpis');
    const PH = { start: 'Start', grow: 'Grow', scale: 'Scale' };
    const err = h('div', { class: 'err', role: 'alert' });
    const metricSel = h('select', { id: 'k-metric', name: 'metric' }, metrics.map((m) => h('option', { value: m.id }, `${PH[m.phase]} · ${m.label}${m.unit ? ` (${m.unit})` : ''}`)));
    const hint = h('p', { class: 'small muted', style: 'margin:.2rem 0 0' });
    const updHint = () => { const m = metrics.find((x) => x.id === metricSel.value); hint.textContent = m.mode === 'sum' ? 'Se suma al total (por ejemplo, 1 libro más).' : 'Reemplaza el valor actual (registra el total de hoy).'; };
    metricSel.addEventListener('change', updHint); updHint();
    const form = h('form', { class: 'kpi-form', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const v = Object.fromEntries(new FormData(form));
      try { await api('/kpis', { method: 'POST', body: v }); toast('Registro guardado.'); viewKpis(); }
      catch (ex) { err.textContent = ex.message; }
    } },
      h('div', { class: 'field' }, h('label', { for: 'k-metric' }, 'Indicador'), metricSel, hint),
      h('div', { class: 'field' }, h('label', { for: 'k-value' }, 'Valor'), h('input', { id: 'k-value', name: 'value', type: 'number', min: 0, step: 'any', required: true, inputmode: 'decimal' })),
      h('div', { class: 'field' }, h('label', { for: 'k-day' }, 'Fecha'), h('input', { id: 'k-day', name: 'day', type: 'date', value: todayStr(), max: todayStr(), required: true })),
      h('div', { class: 'field' }, h('label', { for: 'k-note' }, 'Nota (opcional)'), h('input', { id: 'k-note', name: 'note', maxlength: 200, placeholder: 'Ej.: «Por qué fracasan los países»' })),
      err, h('button', { class: 'btn primary', type: 'submit' }, 'Registrar'));

    const card = (m) => {
      const goalTxt = m.goal ? `Meta ${fmtNum(m.goal)}${m.unit}` : 'Sin meta fija';
      const entries = h('details', { class: 'kpi-entries' }, h('summary', { class: 'small' }, `Últimos registros (${m.entries.length})`),
        h('ul', {}, m.entries.map((e) => h('li', { class: 'small' },
          h('span', {}, `${e.day} · ${m.mode === 'sum' ? '+' : ''}${fmtNum(e.value)}${m.unit}`, e.note ? ` — ${e.note}` : ''),
          h('button', { class: 'link-btn', 'aria-label': 'Eliminar registro', onclick: async () => { if (!confirm('¿Eliminar este registro?')) return; await api('/kpis/' + e.id, { method: 'DELETE' }); viewKpis(); } }, '✕')))));
      return h('div', { class: 'card kpi' + (m.progress === 1 ? ' reached' : '') },
        h('div', { class: 'row between' }, h('span', { class: 'phase-num', style: 'font-size:.95rem' }, PH[m.phase]), m.progress === 1 ? h('span', { class: 'badge ok' }, 'Meta lograda') : null),
        h('h3', { style: 'margin:.2rem 0 .4rem' }, m.label),
        h('div', { class: 'row between', style: 'align-items:flex-end' },
          h('div', {}, h('div', { class: 'stat' }, `${fmtNum(m.current)}${m.unit}`), h('div', { class: 'small muted' }, goalTxt)),
          sparkline(m.series)),
        m.goal ? h('div', { class: 'mt-s' }, progressBar(Math.round(m.progress * 100), 100, `${m.label}: avance hacia la meta`)) : null,
        m.entries.length ? entries : null);
    };
    page('kpis', h('div', { class: 'container section' },
      h('div', { class: 'row between' }, h('h1', {}, 'Dashboard KPI'),
        h('button', { class: 'btn ghost small', onclick: () => {
          const rows = [['indicador', 'fase', 'valor_actual', 'meta']].concat(metrics.map((m) => [m.label, PH[m.phase], m.current, m.goal ?? '']));
          download('kpis-elevation.csv', '\ufeff' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), 'text/csv');
        } }, '↓ Exportar CSV')),
      h('p', { class: 'muted' }, 'Las metas vienen de los hitos de cada fase. Las gráficas muestran las últimas 12 semanas.'),
      h('div', { class: 'kpi-layout mt' },
        h('div', { class: 'card kpi-add' }, h('h3', {}, 'Nuevo registro'), form),
        h('div', {}, ['start', 'grow', 'scale'].map((ph) => [
          h('h2', { class: 'kpi-phase' }, PH[ph]),
          h('div', { class: 'grid c2' }, metrics.filter((m) => m.phase === ph).map(card))])))));
  }

  // ---------- Agenda ----------
  function icsFor(e) {
    const stamp = (ts) => new Date(ts).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (t) => String(t || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Elevation//Agenda//ES', 'BEGIN:VEVENT',
      `UID:elevation-${e.id}@elevation`, `DTSTAMP:${stamp(Date.now())}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.startsAt + 3600000)}`,
      `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.description + (e.url ? '\n' + e.url : ''))}`, e.url ? `URL:${e.url}` : null,
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  }

  async function viewAgenda(query) {
    setTitle('Agenda');
    page('agenda', loading());
    const past = query.get('pasados') === '1';
    const { events } = await api('/events' + (past ? '?past=1' : ''));
    const byMonth = new Map();
    for (const e of events) {
      const k = new Date(e.startsAt).toLocaleDateString('es', { month: 'long', year: 'numeric' });
      if (!byMonth.has(k)) byMonth.set(k, []);
      byMonth.get(k).push(e);
    }
    page('agenda', h('div', { class: 'container section' },
      h('h1', {}, 'Agenda'),
      h('p', { class: 'muted' }, 'Sesiones en vivo, mentorías grupales, talleres y convocatorias. Las horas se muestran en tu zona horaria.'),
      h('div', { class: 'tabs' },
        h('a', { href: '#/agenda', class: 'tab' + (past ? '' : ' active') }, 'Próximos'),
        h('a', { href: '#/agenda?pasados=1', class: 'tab' + (past ? ' active' : '') }, 'Pasados')),
      events.length ? [...byMonth].map(([month, list]) => [
        h('h2', { class: 'month' }, month),
        list.map((e) => {
          const d = new Date(e.startsAt);
          return h('div', { class: 'card event mt-s' + (e.locked ? ' locked' : '') },
            h('div', { class: 'date-badge', 'aria-hidden': 'true' }, h('strong', {}, d.getDate()), h('span', {}, d.toLocaleDateString('es', { weekday: 'short' }))),
            h('div', { class: 'grow' },
              h('div', { class: 'row', style: 'gap:.4rem' }, h('span', { class: 'badge blue' }, e.kindLabel), e.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[e.minPlan]}`) : null),
              h('h3', { class: 'mt-s', style: 'margin-bottom:.2rem' }, e.title),
              h('p', { class: 'small muted', style: 'margin:0 0 .4rem' }, fmtLong(e.startsAt)),
              e.description ? h('p', { class: 'small', style: 'white-space:pre-wrap' }, e.description) : null,
              h('div', { class: 'row', style: 'gap:.5rem' },
                e.locked ? h('a', { class: 'btn primary small', href: '#/planes' }, 'Ver planes')
                  : [e.url && !past ? h('a', { class: 'btn primary small', href: e.url, target: '_blank', rel: 'noopener noreferrer' }, 'Unirme') : null,
                    !past ? h('button', { class: 'btn ghost small', onclick: () => download(`elevation-evento-${e.id}.ics`, icsFor(e), 'text/calendar') }, '+ Añadir a mi calendario') : null])));
        })])
        : h('div', { class: 'card center mt' }, h('p', { class: 'muted' }, past ? 'Aún no hay eventos pasados.' : 'No hay eventos programados por ahora. Vuelve pronto.'))));
  }

  // ---------- Mi cuenta ----------
  async function viewAccount() {
    setTitle('Mi cuenta');
    const u = state.user;
    const msg = (el, t, ok) => { el.textContent = t; el.className = ok ? 'saved' : 'err'; };
    const pErr = h('div', { class: 'err', role: 'status' });
    const profile = h('form', { onsubmit: async (e) => {
      e.preventDefault();
      try { const r = await api('/me', { method: 'PATCH', body: Object.fromEntries(new FormData(profile)) }); state.user = r.user; msg(pErr, 'Perfil actualizado.', true); }
      catch (ex) { msg(pErr, ex.message); }
    } },
      h('div', { class: 'field' }, h('label', { for: 'a-name' }, 'Nombre'), h('input', { id: 'a-name', name: 'name', value: u.name, required: true, maxlength: 80, autocomplete: 'name' })),
      h('div', { class: 'field' }, h('label', { for: 'a-country' }, 'País'), countryInput('a-country', u.country)),
      h('div', { class: 'field' }, h('label', { for: 'a-seg' }, 'Perfil'), segmentSelect('a-seg', u.segment)),
      pErr, h('button', { class: 'btn primary', type: 'submit' }, 'Guardar perfil'));

    const wErr = h('div', { class: 'err', role: 'status' });
    const pwd = h('form', { onsubmit: async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(pwd));
      if (v.next !== v.confirm) return msg(wErr, 'Las contraseñas nuevas no coinciden.');
      try { await api('/me/password', { method: 'POST', body: v }); pwd.reset(); msg(wErr, 'Contraseña actualizada. Cerramos tus otras sesiones.', true); }
      catch (ex) { msg(wErr, ex.message); }
    } },
      h('div', { class: 'field' }, h('label', { for: 'a-cur' }, 'Contraseña actual'), h('input', { id: 'a-cur', name: 'current', type: 'password', required: true, autocomplete: 'current-password' })),
      h('div', { class: 'field' }, h('label', { for: 'a-new' }, 'Nueva contraseña'), h('input', { id: 'a-new', name: 'next', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' })),
      h('div', { class: 'field' }, h('label', { for: 'a-conf' }, 'Repite la nueva contraseña'), h('input', { id: 'a-conf', name: 'confirm', type: 'password', required: true, minlength: 8, autocomplete: 'new-password' })),
      wErr, h('button', { class: 'btn blue', type: 'submit' }, 'Cambiar contraseña'));

    page('cuenta', h('div', { class: 'container section' },
      h('h1', {}, 'Mi cuenta'),
      h('p', { class: 'muted' }, `${u.email} · miembro desde ${fmtDate(u.createdAt)}`),
      h('div', { class: 'grid c2 mt' },
        h('div', { class: 'card' }, h('h3', {}, 'Perfil'), h('p', { class: 'small muted' }, 'Tu país y perfil ayudan a los asistentes a personalizar sus respuestas.'), profile),
        h('div', { class: 'card' }, h('h3', {}, 'Seguridad'), pwd)),
      h('div', { class: 'grid c2 mt' },
        h('div', { class: 'card' }, h('h3', {}, 'Plan'),
          h('p', {}, `Plan actual: `, h('strong', {}, PLAN_LABEL[u.plan]), u.plan !== 'free' ? ` (${u.billing === 'annual' ? 'anual' : 'mensual'})` : '', u.trial ? ` · prueba de Starter hasta ${fmtDate(u.trialEndsAt)}` : ''),
          h('a', { class: 'btn ghost', href: '#/planes' }, 'Cambiar de plan')),
        h('div', { class: 'card' }, h('h3', {}, 'Tus datos'),
          h('p', { class: 'small muted' }, 'Descarga todo lo que guardaste: progreso, entregables, KPIs, publicaciones y conversaciones.'),
          h('div', { class: 'row' },
            h('a', { class: 'btn ghost', href: '/api/me/export', download: 'mis-datos-elevation.json' }, '↓ Exportar mis datos'),
            h('button', { class: 'btn danger', onclick: async () => {
              const password = prompt('Esto elimina tu cuenta y todos tus datos de forma permanente. Escribe tu contraseña para confirmar:');
              if (!password) return;
              try { await api('/me', { method: 'DELETE', body: { password } }); state.user = null; state.catalog = null; toast('Tu cuenta fue eliminada.'); go('/'); }
              catch (ex) { toast(ex.message); }
            } }, 'Eliminar cuenta'))))));
  }

  // ---------- Comunidad ----------
  const authorTag = (name, role) => [name, role === 'admin' ? [' ', h('span', { class: 'badge blue' }, 'Equipo')] : null];

  async function viewCommunity(query) {
    setTitle('Comunidad');
    page('comunidad', loading());
    const { channels } = await api('/community/channels');
    const sel = query.get('canal') || (channels.find((c) => !c.locked) || channels[0]).id;
    const ch = channels.find((c) => c.id === sel) || channels[0];
    const tabs = h('div', { class: 'tabs', role: 'tablist' }, channels.map((c) => h('a', { href: '#/comunidad?canal=' + c.id, role: 'tab', 'aria-selected': c.id === ch.id, class: 'tab' + (c.id === ch.id ? ' active' : '') }, c.label, c.locked ? ' 🔒' : ` (${c.posts})`)));
    let body;
    if (ch.locked) {
      body = upsell(ch.minPlan, ch.label);
    } else {
      const list = h('div');
      const more = h('div', { class: 'center mt' });
      const postCard = (p) => h('a', { href: '#/comunidad/post/' + p.id, class: 'card post lift mt-s' + (p.pinned ? ' pinned' : '') },
        h('div', { class: 'row', style: 'gap:.4rem' }, p.pinned ? h('span', { class: 'badge ok' }, '📌 Fijada') : null, h('strong', {}, p.title)),
        h('p', { class: 'small muted', style: 'margin:.2rem 0' }, authorTag(p.author, p.author_role), ` · ${fmtDate(p.created_at)} · ${p.comments} ${p.comments === 1 ? 'respuesta' : 'respuestas'}`),
        h('p', { class: 'small', style: 'margin:0' }, p.body.length > 180 ? p.body.slice(0, 180) + '…' : p.body));
      const load = async (offset) => {
        const r = await api(`/community/posts?channel=${ch.id}&offset=${offset}`);
        if (!offset && !r.posts.length) list.appendChild(h('p', { class: 'muted center' }, 'Aún no hay publicaciones. Sé el primero.'));
        r.posts.forEach((p) => list.appendChild(postCard(p)));
        more.replaceChildren(r.more ? h('button', { class: 'btn ghost', onclick: () => load(r.nextOffset) }, 'Cargar más') : '');
      };
      await load(0);
      const err = h('div', { class: 'err' });
      const form = h('form', { onsubmit: async (e) => {
        e.preventDefault(); err.textContent = '';
        const v = Object.fromEntries(new FormData(form));
        try { const r = await api('/community/posts', { method: 'POST', body: { ...v, channel: ch.id } }); toast('Publicado.'); go('/comunidad/post/' + r.id); }
        catch (ex) { err.textContent = ex.message; }
      } },
        h('div', { class: 'field' }, h('label', { for: 'pt' }, 'Título'), h('input', { id: 'pt', name: 'title', required: true, maxlength: 140 })),
        h('div', { class: 'field' }, h('label', { for: 'pb' }, 'Mensaje'), h('textarea', { id: 'pb', name: 'body', required: true, maxlength: 4000 })),
        err, h('button', { class: 'btn blue', type: 'submit' }, 'Publicar'));
      body = [h('details', { class: 'card mb' }, h('summary', { style: 'cursor:pointer;font-weight:600' }, '+ Nueva publicación'), h('div', { class: 'mt-s' }, form)), list, more];
    }
    page('comunidad', h('div', { class: 'container section' }, h('h1', {}, 'Comunidad'), h('p', { class: 'muted' }, ch.desc), tabs, body));
  }

  async function viewPost(id) {
    page('comunidad', loading());
    const d = await api('/community/posts/' + id);
    setTitle(d.post.title);
    const err = h('div', { class: 'err' });
    const form = h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      try { await api(`/community/posts/${id}/comments`, { method: 'POST', body: Object.fromEntries(new FormData(form)) }); viewPost(id); }
      catch (ex) { err.textContent = ex.message; }
    } }, h('div', { class: 'field' }, h('label', { for: 'cb' }, 'Tu respuesta'), h('textarea', { id: 'cb', name: 'body', required: true, maxlength: 2000 })), err, h('button', { class: 'btn blue', type: 'submit' }, 'Responder'));
    page('comunidad', h('div', { class: 'container section' }, h('div', { class: 'narrow' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/comunidad?canal=' + d.post.channel }, 'Comunidad'), ' › Publicación'),
      h('h1', {}, d.post.title),
      h('p', { class: 'small muted' }, authorTag(d.post.author, d.post.author_role), ` · ${fmtDate(d.post.created_at)}`),
      h('p', { style: 'white-space:pre-wrap' }, d.post.body),
      h('div', { class: 'row', style: 'gap:.5rem' },
        d.canPin ? h('button', { class: 'btn ghost small', onclick: async () => { await api(`/community/posts/${id}/pin`, { method: 'POST', body: { pinned: !d.post.pinned } }); toast(d.post.pinned ? 'Publicación desfijada.' : 'Publicación fijada.'); viewPost(id); } }, d.post.pinned ? 'Desfijar' : '📌 Fijar') : null,
        d.canDelete ? h('button', { class: 'btn danger small', onclick: async () => { if (!confirm('¿Eliminar esta publicación?')) return; await api('/community/posts/' + id, { method: 'DELETE' }); go('/comunidad?canal=' + d.post.channel); } }, 'Eliminar') : null),
      h('h2', { class: 'mt' }, `${d.comments.length} ${d.comments.length === 1 ? 'respuesta' : 'respuestas'}`),
      d.comments.map((c) => h('div', { class: 'card mt-s' },
        h('div', { class: 'row between' }, h('p', { class: 'small muted', style: 'margin:0 0 .3rem' }, authorTag(c.author, c.author_role), ` · ${fmtTime(c.created_at)}`),
          c.canDelete ? h('button', { class: 'link-btn', 'aria-label': 'Eliminar respuesta', onclick: async () => { if (!confirm('¿Eliminar esta respuesta?')) return; await api('/community/comments/' + c.id, { method: 'DELETE' }); viewPost(id); } }, '✕') : null),
        h('p', { style: 'white-space:pre-wrap;margin:0' }, c.body))),
      h('div', { class: 'mt' }, form))));
  }

  // ---------- Asistentes ----------
  async function viewAssistants() {
    setTitle('Asistentes');
    page('asistentes', loading());
    const d = await api('/assistants');
    const left = Math.max(0, d.dailyLimit - d.usedToday);
    page('asistentes', h('div', { class: 'container section' },
      h('h1', {}, 'Asistentes virtuales'),
      h('p', { class: 'muted' }, `Conocen tu fase, tu perfil y tus últimos entregables. Hoy te quedan ${left} de ${d.dailyLimit} mensajes.`),
      d.dailyLimit ? h('div', { style: 'max-width:360px' }, progressBar(d.usedToday, d.dailyLimit, 'Mensajes usados hoy')) : null,
      !d.configured ? h('div', { class: 'callout' }, h('strong', { class: 't' }, 'Modo demo'), h('p', {}, 'Los asistentes aún no están conectados a un modelo de lenguaje. Configura ANTHROPIC_API_KEY en el servidor para activarlos.')) : null,
      h('div', { class: 'grid c2 mt' }, d.assistants.map((a) => h('div', { class: 'card lift assistant-card' },
        h('div', { class: 'row between' }, h('div', { class: 'row', style: 'gap:.7rem' }, h('span', { class: 'avatar big', 'aria-hidden': 'true' }, a.name[0]), h('div', {}, h('h3', { style: 'margin:0' }, a.name), h('div', { class: 'phase-num', style: 'font-size:.95rem' }, a.area))),
          a.locked ? h('span', { class: 'badge lock' }, `Requiere ${PLAN_LABEL[a.minPlan]}`) : h('span', { class: 'badge ok' }, 'Disponible')),
        h('p', { class: 'small mt-s' }, a.desc),
        a.locked ? h('a', { class: 'btn ghost small', href: '#/planes' }, 'Ver planes') : h('a', { class: 'btn primary small', href: '#/asistentes/' + a.id }, `Hablar con ${a.name}`))))));
  }

  // Lee la respuesta SSE del servidor y llama a onText con cada fragmento.
  async function streamChat(id, message, onText) {
    const res = await fetch(`/api/assistants/${id}/chat`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }) });
    if (!res.ok) {
      let d = {}; try { d = await res.json(); } catch {}
      const err = new Error(d.error || 'Error de red'); err.status = res.status;
      if (res.status === 401) { state.user = null; go('/login'); }
      throw err;
    }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = '', final = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (!line.startsWith('data:')) continue;
        const evt = JSON.parse(line.slice(5));
        if (evt.t) onText(evt.t);
        else if (evt.error) throw new Error(evt.error);
        else if (evt.done) final = evt;
      }
    }
    if (!final) throw new Error('La respuesta se interrumpió. Intenta de nuevo.');
    return final;
  }

  async function viewChat(id) {
    page('asistentes', loading());
    const [list, hist] = await Promise.all([api('/assistants'), api(`/assistants/${id}/history`).catch((e) => ({ error: e }))]);
    const a = list.assistants.find((x) => x.id === id);
    if (!a || hist.error) return page('asistentes', h('div', { class: 'narrow section center' }, h('h1', {}, 'Asistente no disponible'), h('p', { class: 'muted' }, hist.error ? hist.error.message : 'No existe.'), h('a', { class: 'btn primary', href: '#/planes' }, 'Ver planes')));
    setTitle(a.name);
    let used = list.usedToday;
    const counter = h('span', { class: 'small muted' });
    const updCounter = () => { counter.textContent = `${Math.max(0, list.dailyLimit - used)} mensajes restantes hoy`; };
    updCounter();
    const log = h('div', { class: 'chat-log', role: 'log', 'aria-live': 'polite' });
    const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    const copyBtn = (getText) => h('button', { class: 'copy', 'aria-label': 'Copiar respuesta', onclick: async (e) => {
      try { await navigator.clipboard.writeText(getText()); e.currentTarget.textContent = '✓'; } catch { toast('No se pudo copiar.'); }
    } }, '⧉');
    const bubble = (role, text) => {
      const m = h('div', { class: 'msg ' + role }, role === 'assistant' ? markdown(text) : text);
      if (role === 'assistant') { m.dataset.raw = text; m.appendChild(copyBtn(() => m.dataset.raw)); }
      log.appendChild(m); log.scrollTop = log.scrollHeight; return m;
    };
    const setMd = (m, text) => { m.dataset.raw = text; m.replaceChildren(markdown(text), copyBtn(() => m.dataset.raw)); };
    if (!hist.messages.length) bubble('assistant', `Soy ${a.name}, asistente de Elevation en ${a.area.toLowerCase()}. ${a.desc} ¿Por dónde empezamos?`);
    hist.messages.forEach((m) => bubble(m.role, m.content));
    const ta = h('textarea', { rows: 1, placeholder: `Escríbele a ${a.name}… (Enter envía, Shift+Enter nueva línea)`, maxlength: 4000, 'aria-label': 'Mensaje' });
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    ta.addEventListener('input', grow);
    let busy = false;
    const send = async (text) => {
      text = text.trim(); if (!text || busy) return;
      busy = true; ta.value = ''; grow(); btn.disabled = true;
      bubble('user', text);
      const wait = h('div', { class: 'msg assistant typing' }, h('span'), h('span'), h('span'));
      log.appendChild(wait); log.scrollTop = log.scrollHeight;
      let acc = '', frame = 0;
      try {
        await streamChat(id, text, (t) => {
          acc += t;
          if (!frame) frame = requestAnimationFrame(() => { frame = 0; const stick = nearBottom(); wait.classList.remove('typing'); setMd(wait, acc); if (stick) log.scrollTop = log.scrollHeight; });
        });
        cancelAnimationFrame(frame); wait.classList.remove('typing'); setMd(wait, acc.trim() || 'No obtuve respuesta.');
        used++; updCounter();
      } catch (ex) {
        cancelAnimationFrame(frame); wait.classList.remove('typing'); wait.classList.add('error');
        wait.replaceChildren(acc ? markdown(acc) : '', h('p', {}, ex.message));
      }
      busy = false; btn.disabled = false; log.scrollTop = log.scrollHeight; ta.focus();
    };
    const btn = h('button', { class: 'btn primary', type: 'submit' }, 'Enviar');
    const form = h('form', { class: 'chat-form', onsubmit: (e) => { e.preventDefault(); send(ta.value); } }, ta, btn);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
    const exportChat = () => {
      const md = [...log.querySelectorAll('.msg')].map((m) => `**${m.classList.contains('user') ? 'Tú' : a.name}:**\n\n${m.dataset.raw || m.textContent}`).join('\n\n---\n\n');
      download(`conversacion-${a.id}.md`, `# Conversación con ${a.name}\n\n${md}\n`, 'text/markdown');
    };
    page('asistentes', h('div', { class: 'container section' },
      h('div', { class: 'crumbs' }, h('a', { href: '#/asistentes' }, 'Asistentes'), ` › ${a.name}`),
      h('div', { class: 'row between' }, h('div', {}, h('h1', { style: 'margin-bottom:.1rem' }, a.name), h('div', { class: 'phase-num' }, a.area)),
        h('div', { class: 'row', style: 'gap:.5rem' }, counter,
          h('button', { class: 'btn ghost small', onclick: exportChat }, '↓ Exportar'),
          h('button', { class: 'btn ghost small', onclick: async () => { if (!confirm('¿Borrar esta conversación?')) return; await api(`/assistants/${id}/history`, { method: 'DELETE' }); viewChat(id); } }, 'Borrar conversación'))),
      !list.configured ? h('p', { class: 'small', style: 'color:var(--warn)' }, 'Modo demo: el modelo aún no está conectado.') : null,
      h('div', { class: 'chips mb mt-s' }, a.starters.map((s) => h('button', { class: 'chip', onclick: () => send(s) }, s))),
      h('div', { class: 'chat' }, log, form)));
    ta.focus();
  }

  // ---------- Admin ----------
  async function viewAdmin(query) {
    setTitle('Administración');
    page('admin', loading());
    const tab = query.get('tab') || 'usuarios';
    const tabs = h('div', { class: 'tabs' }, [['usuarios', 'Usuarios'], ['eventos', 'Agenda']].map(([k, t]) => h('a', { href: '#/admin?tab=' + k, class: 'tab' + (tab === k ? ' active' : '') }, t)));
    const stats = await api('/admin/stats');
    const head = [
      h('h1', {}, 'Administración'),
      h('div', { class: 'grid c4 mt' },
        [['Usuarios', stats.total, `+${stats.new7} esta semana`], ['Activos 7 días', stats.active7, `${stats.trials} en prueba`], ['MRR estimado', `US$${fmtNum(stats.mrr)}`, 'Según planes asignados'], ['Mensajes a asistentes', stats.msgs, `${stats.deliverables} entregables`]]
          .map(([t, n, sub]) => h('div', { class: 'card' }, h('div', { class: 'stat' }, n), h('p', { class: 'small', style: 'margin:.4rem 0 0;font-weight:600' }, t), h('p', { class: 'small muted', style: 'margin:0' }, sub)))),
      h('p', { class: 'small muted mt' }, 'Por plan: ' + stats.byPlan.map((p) => `${PLAN_LABEL[p.plan]} ${p.n}`).join(' · ') + ` · ${stats.lessons} lecciones completadas · ${stats.posts} publicaciones`),
      stats.topLessons.length ? h('p', { class: 'small muted' }, 'Lecciones más completadas: ' + stats.topLessons.map((l) => `${l.title} (${l.n})`).join(' · ')) : null,
      tabs,
    ];
    if (tab === 'eventos') return page('admin', h('div', { class: 'container section' }, head, await adminEvents()));

    const q = query.get('q') || '';
    const { users } = await api('/admin/users?q=' + encodeURIComponent(q));
    const search = h('form', { class: 'row', onsubmit: (e) => { e.preventDefault(); go('/admin?tab=usuarios&q=' + encodeURIComponent(search.elements.q.value.trim())); } },
      h('input', { name: 'q', type: 'search', value: q, placeholder: 'Buscar por nombre, correo o país', 'aria-label': 'Buscar usuarios', style: 'max-width:340px' }),
      h('button', { class: 'btn ghost small', type: 'submit' }, 'Buscar'),
      h('a', { class: 'btn ghost small', href: '/api/admin/users.csv?q=' + encodeURIComponent(q), download: 'usuarios-elevation.csv' }, '↓ CSV'));
    const patch = async (u, body, okMsg) => { try { await api('/admin/users/' + u.id, { method: 'PATCH', body }); toast(okMsg); return true; } catch (ex) { toast(ex.message); return false; } };
    page('admin', h('div', { class: 'container section' }, head, search,
      h('p', { class: 'small muted' }, `${users.length} ${users.length === 1 ? 'usuario' : 'usuarios'}`),
      h('div', { class: 'table-wrap' }, h('table', { class: 't' },
        h('thead', {}, h('tr', {}, ['Nombre', 'Correo', 'País', 'Alta', 'Última actividad', 'Lecciones', 'Plan', 'Rol', ''].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', {}, users.map((u) => h('tr', {},
          h('td', {}, u.name), h('td', {}, u.email), h('td', {}, u.country || '—'), h('td', {}, fmtDate(u.created_at)), h('td', {}, u.last_seen_at ? fmtDate(u.last_seen_at) : '—'), h('td', {}, u.lessons_done),
          h('td', {}, h('select', { 'aria-label': 'Plan de ' + u.name, onchange: (e) => patch(u, { plan: e.target.value }, 'Plan actualizado.') },
            Object.keys(PLAN_LABEL).map((p) => h('option', { value: p, selected: u.plan === p }, PLAN_LABEL[p])))),
          h('td', {}, h('select', { 'aria-label': 'Rol de ' + u.name, onchange: async (e) => { if (!(await patch(u, { role: e.target.value }, 'Rol actualizado.'))) e.target.value = u.role; else u.role = e.target.value; } },
            [['member', 'Miembro'], ['admin', 'Admin']].map(([v, t]) => h('option', { value: v, selected: u.role === v }, t)))),
          h('td', {}, u.plan === 'free' ? h('button', { class: 'link-btn small', onclick: () => patch(u, { extendTrial: true }, 'Prueba renovada por 3 días.') }, 'Renovar prueba') : ''))))))));
  }

  async function adminEvents() {
    const { events, kinds } = await api('/events');
    const { events: past } = await api('/events?past=1');
    const toLocal = (ts) => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
    const err = h('div', { class: 'err', role: 'alert' });
    let editing = null;
    const form = h('form', { class: 'card', onsubmit: async (e) => {
      e.preventDefault(); err.textContent = '';
      const v = Object.fromEntries(new FormData(form));
      const body = { ...v, startsAt: new Date(v.startsAt).getTime() };
      try {
        await api(editing ? '/admin/events/' + editing : '/admin/events', { method: editing ? 'PUT' : 'POST', body });
        toast(editing ? 'Evento actualizado.' : 'Evento creado.'); route();
      } catch (ex) { err.textContent = ex.message; }
    } },
      h('h3', {}, 'Nuevo evento'),
      h('div', { class: 'grid c2', style: 'gap:0 1rem' },
        h('div', { class: 'field' }, h('label', { for: 'e-kind' }, 'Tipo'), h('select', { id: 'e-kind', name: 'kind', onchange: (e) => { form.elements.minPlan.value = kinds[e.target.value].defaultPlan; } }, Object.entries(kinds).map(([k, v]) => h('option', { value: k }, v.label)))),
        h('div', { class: 'field' }, h('label', { for: 'e-plan' }, 'Plan mínimo'), h('select', { id: 'e-plan', name: 'minPlan' }, Object.entries(PLAN_LABEL).map(([k, v]) => h('option', { value: k, selected: k === 'pro' }, v)))),
        h('div', { class: 'field' }, h('label', { for: 'e-title' }, 'Título'), h('input', { id: 'e-title', name: 'title', required: true, maxlength: 140 })),
        h('div', { class: 'field' }, h('label', { for: 'e-when' }, 'Fecha y hora (tu zona)'), h('input', { id: 'e-when', name: 'startsAt', type: 'datetime-local', required: true }))),
      h('div', { class: 'field' }, h('label', { for: 'e-url' }, 'Enlace (Zoom, Meet, formulario…)'), h('input', { id: 'e-url', name: 'url', type: 'url', placeholder: 'https://', maxlength: 500 })),
      h('div', { class: 'field' }, h('label', { for: 'e-desc' }, 'Descripción'), h('textarea', { id: 'e-desc', name: 'description', maxlength: 2000 })),
      err, h('button', { class: 'btn primary', type: 'submit' }, 'Guardar evento'));
    const edit = (e) => {
      editing = e.id; form.querySelector('h3').textContent = 'Editar evento';
      const f = form.elements;
      f.kind.value = e.kind; f.minPlan.value = e.minPlan; f.title.value = e.title; f.startsAt.value = toLocal(e.startsAt);
      f.url.value = e.url || ''; f.description.value = e.description; form.scrollIntoView({ behavior: 'smooth' });
    };
    const row = (e) => h('tr', {},
      h('td', {}, fmtTime(e.startsAt)), h('td', {}, e.kindLabel), h('td', {}, e.title), h('td', {}, PLAN_LABEL[e.minPlan]),
      h('td', {}, h('button', { class: 'link-btn small', onclick: () => edit(e) }, 'Editar'), ' ',
        h('button', { class: 'link-btn small danger', onclick: async () => { if (!confirm('¿Eliminar este evento?')) return; await api('/admin/events/' + e.id, { method: 'DELETE' }); toast('Evento eliminado.'); route(); } }, 'Eliminar')));
    const table = (list) => h('div', { class: 'table-wrap' }, h('table', { class: 't' },
      h('thead', {}, h('tr', {}, ['Fecha', 'Tipo', 'Título', 'Plan', ''].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, list.map(row))));
    return [form,
      h('h2', { class: 'mt' }, 'Próximos'), events.length ? table(events) : h('p', { class: 'muted' }, 'Sin eventos próximos.'),
      past.length ? [h('h2', { class: 'mt' }, 'Pasados'), table(past)] : null];
  }

  function viewNotFound() {
    setTitle('Página no encontrada');
    page('', h('div', { class: 'narrow section center' }, h('h1', {}, 'Página no encontrada'), h('a', { class: 'btn primary', href: '#/' }, 'Volver al inicio')));
  }

  // ---------- Router ----------
  const MEMBER_ROUTES = new Set(['panel', 'ruta', 'fase', 'leccion', 'comunidad', 'asistentes', 'entregables', 'admin', 'kpis', 'agenda', 'cuenta']);

  async function route() {
    const raw = location.hash.slice(1) || '/';
    const [pathPart, qs] = raw.split('?');
    const seg = pathPart.split('/').filter(Boolean);
    const query = new URLSearchParams(qs || '');
    const root = seg[0] || '';
    try {
      if (state.user === null && !state._loaded) { await loadMe(); state._loaded = true; }
      if (MEMBER_ROUTES.has(root) && !state.user) { sessionStorage.setItem('after-login', raw); return go('/login'); }
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
        case 'kpis': return await viewKpis();
        case 'agenda': return await viewAgenda(query);
        case 'cuenta': return await viewAccount();
        case 'comunidad': return seg[1] === 'post' ? await viewPost(seg[2]) : await viewCommunity(query);
        case 'asistentes': return seg[1] ? await viewChat(seg[1]) : await viewAssistants();
        case 'admin': return await viewAdmin(query);
        default: return viewNotFound();
      }
    } catch (ex) {
      if (ex.status === 401) return;
      if (ex.status === 404) return viewNotFound();
      page('', h('div', { class: 'narrow section center' }, h('h1', {}, 'Algo salió mal'), h('p', { class: 'muted' }, ex.message), h('a', { class: 'btn primary', href: '#/' }, 'Volver al inicio')));
    }
  }

  window.addEventListener('hashchange', route);
  route();
})();
