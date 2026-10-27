// Planes, canales de comunidad y asistentes. Precios según el deck de Elevation.
const PLANS = {
  free:    { rank: 0, label: 'Free',    monthly: 0,  annual: 0,   tagline: 'Contenido público y primera lección de cada fase' },
  starter: { rank: 1, label: 'Starter', monthly: 19, annual: 190, tagline: 'Fases Start y Grow, recursos descargables, comunidad abierta y Freya' },
  pro:     { rank: 2, label: 'Pro',     monthly: 39, annual: 390, tagline: 'Starter + Launch y Scale, comunidad cerrada, Nova, Atenea y dashboard KPI' },
  elite:   { rank: 3, label: 'Elite',   monthly: 59, annual: 590, tagline: 'Pro + Charlie, mentorías grupales y convocatorias exclusivas' },
};

const TRIAL_DAYS = 3;
const DAY = 86400000;

const PLAN_FEATURES = {
  free: ['Primera lección de cada fase', 'Contenido público de la web y redes'],
  starter: ['Fases Start y Grow completas', 'Checklists y entregables con guardado', 'Recursos descargables', 'Asistente virtual Freya', 'Revisión de entregables con IA', 'Comunidad abierta', 'Talleres abiertos', 'Trial de 3 días para nuevos miembros'],
  pro: ['Todo Starter', 'Fases Launch y Scale', 'Comunidad cerrada', 'Asistentes Nova y Atenea', 'Dashboard KPI con metas por fase', 'Sesiones en vivo'],
  elite: ['Todo Pro', 'Asistente Charlie', 'Mentorías grupales', 'Convocatorias exclusivas', 'Consulta mensual con estrategas'],
};

const rank = (plan) => (PLANS[plan] ? PLANS[plan].rank : 0);

// Plan efectivo: un usuario Free con trial vigente opera como Starter.
function effectivePlan(user, now = Date.now()) {
  if (rank(user.plan) >= 1) return { plan: user.plan, trial: false };
  if (user.trial_ends_at && user.trial_ends_at > now) return { plan: 'starter', trial: true };
  return { plan: 'free', trial: false };
}

function can(user, minPlan) {
  return rank(effectivePlan(user).plan) >= rank(minPlan);
}

const CHANNELS = [
  { id: 'abierta',    label: 'Comunidad abierta',  desc: 'Preguntas, avances y recursos entre todos los miembros.', minPlan: 'starter' },
  { id: 'cerrada',    label: 'Comunidad cerrada',  desc: 'Espacio reservado para miembros Pro y Elite.',            minPlan: 'pro' },
  { id: 'mentorias',  label: 'Mentorías grupales', desc: 'Sesiones y preguntas con estrategas. Solo Elite.',        minPlan: 'elite' },
];

const ASSISTANTS = {
  freya: {
    id: 'freya', name: 'Freya', minPlan: 'starter', area: 'Síntesis documental',
    desc: 'Resume lecturas, informes y documentos, y los convierte en fichas con ideas clave y aplicación práctica.',
    focus: 'Síntesis documental: fichas de lectura (3 ideas clave + 1 aplicación práctica), resúmenes ejecutivos y extracción de datos de textos que el usuario pega.',
    starters: ['Resume este texto en una ficha de lectura', 'Dame 5 preguntas para debatir esta lectura', 'Extrae las ideas accionables de este informe'],
  },
  nova: {
    id: 'nova', name: 'Nova', minPlan: 'pro', area: 'Discurso',
    desc: 'Te ayuda a escribir y afinar tu narrativa, discursos, respuestas a prensa y mensajes.',
    focus: 'Discurso y mensaje: narrativa personal en versiones de 30 s, 90 s y 5 min (Origen, Tensión, Propuesta), discursos, respuestas a ataques con la fórmula reconocer-corregir-redirigir, columnas y entrevistas.',
    starters: ['Afina mi narrativa de 90 segundos', 'Redacta una respuesta breve a este ataque', 'Prepárame cinco preguntas hostiles de entrevista'],
  },
  atenea: {
    id: 'atenea', name: 'Atenea', minPlan: 'pro', area: 'Estrategia',
    desc: 'Analiza tu situación y te ayuda a decidir ruta, vehículo político, alianzas y prioridades.',
    focus: 'Estrategia: elección de ruta de Launch, partido vs. independiente, mapa de actores, priorización de red, alianzas, territorio temático y plan de fase.',
    starters: ['Ayúdame a elegir entre las cinco rutas', 'Revisa mi mapa de actores y dime qué priorizar', 'Evalúa si me conviene un partido o ir independiente'],
  },
  charlie: {
    id: 'charlie', name: 'Charlie', minPlan: 'elite', area: 'Logística y optimización de recursos',
    desc: 'Planifica calendarios, presupuestos, equipos y recursos para tus iniciativas y campañas.',
    focus: 'Logística y recursos: cronogramas, presupuestos de bajo costo, focalización territorial, roles de equipo, base de donantes y metas semanales medibles.',
    starters: ['Arma el cronograma de mi campaña de 11 semanas', 'Distribuye un presupuesto de bajo costo', 'Define metas semanales de puerta a puerta'],
  },
};

const DAILY_CHAT_LIMIT = { starter: 15, pro: 40, elite: 100 };

// Tipos de evento de la agenda y plan mínimo sugerido para cada uno.
const EVENT_KINDS = {
  vivo:         { label: 'Sesión en vivo',     defaultPlan: 'pro' },
  mentoria:     { label: 'Mentoría grupal',    defaultPlan: 'elite' },
  convocatoria: { label: 'Convocatoria',       defaultPlan: 'elite' },
  taller:       { label: 'Taller abierto',     defaultPlan: 'starter' },
};

// Asistente que revisa el entregable de cada fase (el mejor disponible según plan).
const REVIEWERS = { start: ['nova', 'atenea', 'freya'], grow: ['atenea', 'freya'], launch: ['atenea', 'charlie', 'freya'], scale: ['atenea', 'nova', 'freya'] };

module.exports = { PLANS, PLAN_FEATURES, TRIAL_DAYS, DAY, rank, effectivePlan, can, CHANNELS, ASSISTANTS, DAILY_CHAT_LIMIT, EVENT_KINDS, REVIEWERS };
