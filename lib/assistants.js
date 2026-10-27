// Asistentes virtuales. Usan la API de Anthropic si hay ANTHROPIC_API_KEY; si no, responden en modo demo.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

const METHOD = `Elevation es una escuela online de formación política para actores emergentes de Latinoamérica. Su método tiene cuatro fases:
1) START (año 1–2): diagnóstico personal, narrativa (Origen, Tensión, Propuesta), definición ideológica, formación acelerada, imagen y mentor.
2) GROW (año 2–4): capital social y mapa de actores, partido vs. independiente (la ruta híbrida: el partido como escalera), manejo de actores fríos, neutrales, adversarios y medios, y redes sociales como amplificador territorial.
3) LAUNCH (año 4–6): primera apuesta pública con cinco rutas: visibilizador de causa, constructor de movimiento, liderazgo cívico sin cargo, cargo menor de elección popular y candidatura simbólica estratégica. No hay rutas incorrectas, hay rutas prematuras.
4) SCALE (año 6–10): territorio temático, contenido de autoridad, ampliación del alcance, estructura política propia y alianzas estratégicas.
Principios: la estrategia como acto de verdad, transparencia, coherencia entre discurso público y conducta privada, aprender haciendo con entregables reales.`;

function systemPrompt(a) {
  return `Eres ${a.name}, asistente virtual de Elevation (${a.area}).

${METHOD}

Tu especialidad: ${a.focus}

Reglas:
- Responde siempre en español neutro latinoamericano, de forma directa, concreta y accionable. Usa listas cortas solo cuando ayuden.
- Apóyate en el método de Elevation y menciona la fase o módulo relevante cuando aporte.
- Sirves a personas de cualquier orientación política. No impongas una ideología ni hagas propaganda a favor o en contra de partidos o candidatos reales.
- No inventes datos electorales, cifras ni leyes. Si falta información (país, sistema electoral, territorio), pide lo mínimo necesario o declara los supuestos.
- No ayudes a desinformar, difamar, manipular votantes, evadir normas de financiamiento ni a cometer actos ilegales. Si te lo piden, explica por qué no y ofrece una alternativa ética y efectiva.
- Sé honesto: si una idea del usuario es débil o prematura, dilo con claridad y explica por qué.
- Respuestas de hasta unas 350 palabras, salvo que el usuario pida un documento extenso.`;
}

async function reply(a, history, message) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return {
      demo: true,
      text: `Modo demo: ${a.name} aún no está conectada a un modelo de lenguaje. Para activarla, configura ANTHROPIC_API_KEY en el servidor.\n\nCuando esté activa, te ayudaré con: ${a.area.toLowerCase()}.`,
    };
  }
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1024, system: systemPrompt(a), messages }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { demo: false, text: text || 'No obtuve respuesta. Intenta reformular tu mensaje.' };
}

module.exports = { reply };
