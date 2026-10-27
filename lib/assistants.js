// Asistentes virtuales. Usan la API de Anthropic si hay ANTHROPIC_API_KEY; si no, responden en modo demo.
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

const METHOD = `Elevation es una escuela online de formación política para actores emergentes de Latinoamérica. Su método tiene cuatro fases:
1) START (año 1–2): diagnóstico personal, narrativa (Origen, Tensión, Propuesta), definición ideológica, formación acelerada, imagen y mentor.
2) GROW (año 2–4): capital social y mapa de actores, partido vs. independiente (la ruta híbrida: el partido como escalera), manejo de actores fríos, neutrales, adversarios y medios, y redes sociales como amplificador territorial.
3) LAUNCH (año 4–6): primera apuesta pública con cinco rutas: visibilizador de causa, constructor de movimiento, liderazgo cívico sin cargo, cargo menor de elección popular y candidatura simbólica estratégica. No hay rutas incorrectas, hay rutas prematuras.
4) SCALE (año 6–10): territorio temático, contenido de autoridad, ampliación del alcance, estructura política propia y alianzas estratégicas.
Principios: la estrategia como acto de verdad, transparencia, coherencia entre discurso público y conducta privada, aprender haciendo con entregables reales.`;

const RULES = `Reglas:
- Responde siempre en español neutro latinoamericano, de forma directa, concreta y accionable. Usa listas cortas solo cuando ayuden.
- Puedes usar Markdown sencillo: **negritas**, listas con guiones o números y encabezados con ###. No uses tablas ni HTML.
- Apóyate en el método de Elevation y menciona la fase o módulo relevante cuando aporte.
- Sirves a personas de cualquier orientación política. No impongas una ideología ni hagas propaganda a favor o en contra de partidos o candidatos reales.
- No inventes datos electorales, cifras ni leyes. Si falta información (país, sistema electoral, territorio), pide lo mínimo necesario o declara los supuestos.
- No ayudes a desinformar, difamar, manipular votantes, evadir normas de financiamiento ni a cometer actos ilegales. Si te lo piden, explica por qué no y ofrece una alternativa ética y efectiva.
- Sé honesto: si una idea del usuario es débil o prematura, dilo con claridad y explica por qué.
- Respuestas de hasta unas 350 palabras, salvo que el usuario pida un documento extenso.`;

// Bloque estable (se cachea) + bloque con el contexto del miembro (cambia por usuario).
function system(a, ctx) {
  const blocks = [{
    type: 'text',
    text: `Eres ${a.name}, asistente virtual de Elevation (${a.area}).\n\n${METHOD}\n\nTu especialidad: ${a.focus}\n\n${RULES}`,
    cache_control: { type: 'ephemeral' },
  }];
  if (ctx) blocks.push({ type: 'text', text: `Contexto del miembro (úsalo para personalizar, no lo repitas literalmente):\n${ctx}` });
  return blocks;
}

const REVIEW_TASK = `Tarea: revisa el entregable que el miembro escribió para una lección de Elevation.
Devuelve exactamente estas secciones en Markdown:
### Lo que está bien
(2 o 3 puntos concretos, citando frases del texto)
### Lo que falta o es débil
(2 a 4 puntos, contrastados con lo que pide la consigna)
### Siguiente versión
(3 acciones concretas para mejorarlo esta semana)
### Veredicto
Una línea: "Listo para avanzar", "Casi listo" o "Necesita otra vuelta", con una frase de justificación.
Sé exigente pero respetuoso. No reescribas el entregable completo.`;

function demoText(a) {
  return `**Modo demo:** ${a.name} aún no está conectada a un modelo de lenguaje. Para activarla, configura \`ANTHROPIC_API_KEY\` en el servidor.\n\nCuando esté activa, te ayudaré con: ${a.area.toLowerCase()}.`;
}

function request(body, signal) {
  return fetch(API_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, ...body }),
    signal,
  });
}

async function fail(res) {
  const detail = await res.text().catch(() => '');
  throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
}

// Respuesta en streaming: llama a onText con cada fragmento y devuelve el texto completo.
async function stream(a, history, message, { ctx, onText, signal } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const text = demoText(a);
    onText?.(text);
    return { demo: true, text };
  }
  const messages = [...history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: message }];
  const res = await request({ system: system(a, ctx), messages, stream: true }, signal || AbortSignal.timeout(90000));
  if (!res.ok) await fail(res);

  const decoder = new TextDecoder();
  let buf = '', text = '';
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const evt = buf.slice(0, i); buf = buf.slice(i + 2);
      const line = evt.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let data; try { data = JSON.parse(line.slice(5)); } catch { continue; }
      if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
        text += data.delta.text; onText?.(data.delta.text);
      } else if (data.type === 'error') {
        throw new Error('Anthropic stream: ' + (data.error?.message || 'error'));
      }
    }
  }
  text = text.trim();
  return { demo: false, text: text || 'No obtuve respuesta. Intenta reformular tu mensaje.' };
}

// Revisión de un entregable (sin streaming, respuesta única).
async function review(a, { lessonTitle, deliverableTitle, prompt, body, ctx }) {
  if (!process.env.ANTHROPIC_API_KEY) return { demo: true, text: demoText(a) };
  const content = `${REVIEW_TASK}\n\nLección: ${lessonTitle}\nEntregable: ${deliverableTitle}\nConsigna: ${prompt}\n\n--- Texto del miembro ---\n${body}`;
  const res = await request({ system: system(a, ctx), messages: [{ role: 'user', content }] }, AbortSignal.timeout(90000));
  if (!res.ok) await fail(res);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return { demo: false, text: text || 'No obtuve respuesta. Intenta de nuevo.' };
}

module.exports = { stream, review, MODEL };
