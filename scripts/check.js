// Verifica que el contenido cargue y sea consistente.
const { phases, getLesson } = require('../content');
const { PLANS } = require('../lib/plans');

const BLOCKS = { p: ['text'], h: ['text'], quote: ['text'], ul: ['items'], ol: ['items'], callout: ['title', 'items'], table: ['head', 'rows'] };
const errors = [];
const ids = new Set();
let n = 0;
for (const p of phases) {
  if (!PLANS[p.minPlan]) errors.push(`Fase ${p.id}: minPlan inválido`);
  if (!p.milestones?.length) errors.push(`Fase ${p.id}: sin hitos`);
  if (!p.lessons.some((l) => l.free)) errors.push(`Fase ${p.id}: ninguna lección gratuita`);
  for (const l of p.lessons) {
    n++;
    const where = `Lección ${l.id}`;
    if (ids.has(l.id)) errors.push(`${where}: id duplicado`);
    ids.add(l.id);
    if (!l.title || !l.summary || !l.blocks?.length) errors.push(`${where}: título, resumen o bloques vacíos`);
    if (!Number.isFinite(l.minutes) || l.minutes <= 0) errors.push(`${where}: minutos inválidos`);
    if (!l.checklist?.length) errors.push(`${where}: sin checklist`);
    if (!l.deliverable?.title || !l.deliverable?.prompt) errors.push(`${where}: entregable incompleto`);
    if (getLesson(l.id).phaseId !== p.id) errors.push(`${where}: phaseId inválido`);
    for (const b of l.blocks || []) {
      const req = BLOCKS[b.t];
      if (!req) { errors.push(`${where}: bloque desconocido «${b.t}»`); continue; }
      for (const k of req) if (b[k] === undefined || (Array.isArray(b[k]) && !b[k].length)) errors.push(`${where}: bloque ${b.t} sin ${k}`);
      if (b.t === 'table' && b.rows.some((r) => r.length !== b.head.length)) errors.push(`${where}: tabla con filas de distinto ancho`);
    }
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log(`OK: ${phases.length} fases, ${n} lecciones`);
