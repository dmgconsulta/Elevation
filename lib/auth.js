const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { effectivePlan, rank } = require('./plans');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

// Secreto de sesión: variable de entorno o archivo generado una sola vez.
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(dir, '.secret');
  try { return fs.readFileSync(file, 'utf8'); } catch {}
  const s = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, s, { mode: 0o600 });
  return s;
}
const SECRET = loadSecret();

const COOKIE = 'elev_session';
const SESSION_MS = 30 * 86400000;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    return payload.exp > Date.now() ? payload : null;
  } catch { return null; }
}

function parseCookies(header = '') {
  const out = {};
  header.split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

// `ver` es la versión de sesión del usuario: al cambiar la contraseña sube y las sesiones anteriores dejan de valer.
function setSession(res, userId, ver = 0) {
  const token = sign({ uid: userId, v: ver, exp: Date.now() + SESSION_MS });
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_MS / 1000}`];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

// Adjunta req.user si hay sesión válida.
function attachUser(req, _res, next) {
  const payload = verify(parseCookies(req.headers.cookie)[COOKIE]);
  if (payload) {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
    req.user = u && (u.sess_ver || 0) === (payload.v || 0) ? u : null;
    // Última actividad, como mucho una escritura cada 5 minutos por usuario.
    if (req.user && (!u.last_seen_at || Date.now() - u.last_seen_at > 300000)) {
      db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(Date.now(), u.id);
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
  next();
}

function requirePlan(minPlan) {
  return (req, res, next) => {
    if (rank(effectivePlan(req.user).plan) < rank(minPlan)) {
      return res.status(403).json({ error: 'Tu plan actual no incluye esta función.', minPlan });
    }
    next();
  };
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Solo administradores.' });
  next();
}

// Rate limit simple en memoria (por clave).
const buckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (b.length >= max) { buckets.set(key, b); return false; }
  b.push(now); buckets.set(key, b);
  return true;
}

// Limpia claves vencidas para que el mapa no crezca sin límite (ventana máxima usada: 1 h).
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (!b.length || now - b[b.length - 1] > 3600000) buckets.delete(k);
}, 600000).unref();

module.exports = { hashPassword, verifyPassword, setSession, clearSession, attachUser, requireAuth, requirePlan, requireAdmin, rateLimit };
