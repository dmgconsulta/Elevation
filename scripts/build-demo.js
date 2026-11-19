// Genera una demo estática de la plataforma (sin servidor) en entregas/demo/.
// Copia public/, incrusta el contenido y añade scripts/demo/demo-api.js, que simula la API en el navegador.
const fs = require('fs');
const path = require('path');
const content = require('../content');
const plans = require('../lib/plans');
const kpis = require('../lib/kpis');

const root = path.join(__dirname, '..');
const out = path.join(root, 'entregas', 'demo');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'public'), out, { recursive: true });

const strip = (l) => { const { phaseId, order, minPlan, ...rest } = l; return rest; };
const data = {
  phases: content.phases.map((p) => ({ ...p, lessons: p.lessons.map(strip) })),
  PLANS: plans.PLANS, PLAN_FEATURES: plans.PLAN_FEATURES, TRIAL_DAYS: plans.TRIAL_DAYS, CHANNELS: plans.CHANNELS,
  ASSISTANTS: plans.ASSISTANTS, DAILY_CHAT_LIMIT: plans.DAILY_CHAT_LIMIT, EVENT_KINDS: plans.EVENT_KINDS, REVIEWERS: plans.REVIEWERS,
  METRICS: kpis.METRICS,
};
fs.writeFileSync(path.join(out, 'js', 'demo-data.js'),
  `window.DEMO_DATA=${JSON.stringify(data)};\nwindow.DEMO_SUMMARIZE=(function(){const METRICS=window.DEMO_DATA.METRICS;return ${kpis.summarize.toString()};})();\n`);
fs.copyFileSync(path.join(__dirname, 'demo', 'demo-api.js'), path.join(out, 'js', 'demo-api.js'));

// Rutas relativas: la demo puede servirse desde cualquier carpeta.
let html = fs.readFileSync(path.join(out, 'index.html'), 'utf8')
  .replace(/(href|src)="\/(?!\/)/g, '$1="')
  .replace('<script src="js/app.js"></script>', '<script src="js/demo-data.js"></script>\n  <script src="js/demo-api.js"></script>\n  <script src="js/app.js"></script>')
  .replace('<title>Elevation · Escuela de estrategia política</title>', '<title>Elevation · Demo</title>');
fs.writeFileSync(path.join(out, 'index.html'), html);
const app = path.join(out, 'js', 'app.js');
fs.writeFileSync(app, fs.readFileSync(app, 'utf8').replace(/'\/img\//g, "'img/"));
console.log('Demo generada en', path.relative(root, out));
