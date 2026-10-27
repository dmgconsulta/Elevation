// Indicadores del dashboard KPI (plan Pro). Las metas salen de los hitos de cada fase.
// mode 'sum': cada registro suma (libros leídos, presentaciones). mode 'level': vale el último registro (seguidores, aliados).
const METRICS = [
  { id: 'libros',        phase: 'start',  mode: 'sum',   label: 'Libros leídos',                 unit: '',  goal: 12 },
  { id: 'presentaciones', phase: 'start', mode: 'sum',   label: 'Presentaciones públicas',       unit: '',  goal: 10 },
  { id: 'mentor',        phase: 'start',  mode: 'sum',   label: 'Reuniones con mentor',          unit: '',  goal: 12 },
  { id: 'actores',       phase: 'grow',   mode: 'level', label: 'Actores en el mapa',            unit: '',  goal: 50 },
  { id: 'aliados',       phase: 'grow',   mode: 'level', label: 'Aliados activos',               unit: '',  goal: 30 },
  { id: 'seguidores',    phase: 'grow',   mode: 'level', label: 'Seguidores locales',            unit: '',  goal: null },
  { id: 'interaccion',   phase: 'grow',   mode: 'level', label: 'Tasa de interacción',           unit: '%', goal: 5 },
  { id: 'contenidos',    phase: 'scale',  mode: 'sum',   label: 'Informes, columnas o propuestas', unit: '', goal: 8 },
  { id: 'medios',        phase: 'scale',  mode: 'sum',   label: 'Apariciones en medios',         unit: '',  goal: 10 },
  { id: 'delegados',     phase: 'scale',  mode: 'level', label: 'Cobertura territorial',         unit: '%', goal: 70 },
  { id: 'donantes',      phase: 'scale',  mode: 'level', label: 'Donantes recurrentes',          unit: '',  goal: 100 },
];

const byId = Object.fromEntries(METRICS.map((m) => [m.id, m]));

// Resume los registros de un usuario: valor actual por métrica y serie de las últimas 12 semanas.
function summarize(rows, today = new Date()) {
  const weeks = 12;
  const weekStart = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const end = weekStart(today);
  const startOf = (i) => { const x = new Date(end); x.setDate(x.getDate() - 7 * (weeks - 1 - i)); return x; };
  return METRICS.map((m) => {
    const entries = rows.filter((r) => r.metric === m.id).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.id - b.id));
    const valueUntil = (limit) => {
      const upTo = entries.filter((e) => new Date(e.day + 'T00:00:00') < limit);
      if (!upTo.length) return null;
      return m.mode === 'sum' ? upTo.reduce((a, e) => a + e.value, 0) : upTo[upTo.length - 1].value;
    };
    const series = Array.from({ length: weeks }, (_, i) => {
      const limit = startOf(i); limit.setDate(limit.getDate() + 7);
      return valueUntil(limit) ?? 0;
    });
    const current = entries.length ? (m.mode === 'sum' ? entries.reduce((a, e) => a + e.value, 0) : entries[entries.length - 1].value) : 0;
    return {
      ...m, current, series,
      progress: m.goal ? Math.min(1, current / m.goal) : null,
      entries: entries.slice(-8).reverse().map((e) => ({ id: e.id, value: e.value, day: e.day, note: e.note })),
    };
  });
}

module.exports = { METRICS, byId, summarize };
