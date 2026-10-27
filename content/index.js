// Catálogo completo de la escuela. Cada fase se corresponde con un documento fuente.
const phases = [require('./fase1'), require('./fase2'), require('./fase3'), require('./fase4')];

const lessonIndex = new Map();
for (const phase of phases) {
  phase.lessons.forEach((lesson, i) => {
    lesson.phaseId = phase.id;
    lesson.order = i + 1;
    // Plan mínimo por lección: la primera lección de cada fase es gratuita (vitrina para Free).
    lesson.minPlan = lesson.free ? 'free' : phase.minPlan;
    lessonIndex.set(lesson.id, lesson);
  });
}

function getPhase(id) { return phases.find((p) => p.id === id); }
function getLesson(id) { return lessonIndex.get(id); }

module.exports = { phases, getPhase, getLesson };
