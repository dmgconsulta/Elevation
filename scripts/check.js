// Verifica que el contenido cargue y sea consistente.
const { phases, getLesson } = require('../content');
let n = 0;
for (const p of phases) {
  for (const l of p.lessons) {
    n++;
    if (!l.title || !l.blocks?.length) throw new Error('Lección incompleta: ' + l.id);
    if (getLesson(l.id).phaseId !== p.id) throw new Error('phaseId inválido: ' + l.id);
  }
}
console.log(`OK: ${phases.length} fases, ${n} lecciones`);
