// Genera una demo estática completa (sin servidor) en entregas/demo/:
// el sitio de presentación en la raíz y la plataforma en app/, con la API simulada en el navegador
// (scripts/demo/demo-api.js). Misma estructura que sirve server.js: sitio en / y plataforma en /app/.
const fs = require('fs');
const path = require('path');
const content = require('../content');
const plans = require('../lib/plans');
const kpis = require('../lib/kpis');

const root = path.join(__dirname, '..');
const out = path.join(root, 'entregas', 'demo');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// Sitio de presentación (sin los archivos que solo sirven en un hosting Apache).
const skip = new Set(['.htaccess', 'LEEME.txt', '404.html', 'config.js']);
fs.cpSync(path.join(root, 'sitio'), out, { recursive: true, filter: (src) => !skip.has(path.basename(src)) });
// apiUrl false: en la vista previa el sitio no envía resultados (no hay servidor).
fs.writeFileSync(path.join(out, 'config.js'), "window.ELEVATION_CONFIG = { appUrl: 'app/index.html', apiUrl: false };\n");

// Plataforma.
const app = path.join(out, 'app');
fs.cpSync(path.join(root, 'public'), app, { recursive: true });
const strip = (l) => { const { phaseId, order, minPlan, ...rest } = l; return rest; };
const data = {
  phases: content.phases.map((p) => ({ ...p, lessons: p.lessons.map(strip) })),
  PLANS: plans.PLANS, PLAN_FEATURES: plans.PLAN_FEATURES, TRIAL_DAYS: plans.TRIAL_DAYS, CHANNELS: plans.CHANNELS,
  ASSISTANTS: plans.ASSISTANTS, DAILY_CHAT_LIMIT: plans.DAILY_CHAT_LIMIT, EVENT_KINDS: plans.EVENT_KINDS, REVIEWERS: plans.REVIEWERS,
  METRICS: kpis.METRICS,
};
fs.writeFileSync(path.join(app, 'js', 'demo-data.js'),
  `window.ELEVATION_SITE='../index.html';\nwindow.DEMO_DATA=${JSON.stringify(data)};\n` +
  `window.DEMO_SUMMARIZE=(function(){const METRICS=window.DEMO_DATA.METRICS;return ${kpis.summarize.toString()};})();\n`);
fs.copyFileSync(path.join(__dirname, 'demo', 'demo-api.js'), path.join(app, 'js', 'demo-api.js'));
const indexPath = path.join(app, 'index.html');
fs.writeFileSync(indexPath, fs.readFileSync(indexPath, 'utf8')
  .replace('<script src="js/app.js"></script>', '<script src="js/demo-data.js"></script>\n  <script src="js/demo-api.js"></script>\n  <script src="js/app.js"></script>')
  .replace('<title>Elevation · Escuela de estrategia política</title>', '<title>Elevation · Plataforma (demo)</title>'));
console.log('Demo generada en', path.relative(root, out));
