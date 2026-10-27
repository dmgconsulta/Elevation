// SQLite embebido de Node (node:sqlite). Sin dependencias nativas que compilar.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(path.join(dir, 'elevation.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  billing TEXT NOT NULL DEFAULT 'monthly',
  trial_ends_at INTEGER,
  role TEXT NOT NULL DEFAULT 'member',
  country TEXT,
  segment TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_done (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS checks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id, idx)
);

CREATE TABLE IF NOT EXISTS milestones_done (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  PRIMARY KEY (user_id, phase_id, idx)
);

CREATE TABLE IF NOT EXISTS deliverables (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL,
  body TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assistant TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat ON chat_msgs(user_id, assistant, id);

CREATE TABLE IF NOT EXISTS kpi_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  day TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kpi ON kpi_entries(user_id, metric, day);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  url TEXT,
  min_plan TEXT NOT NULL DEFAULT 'pro',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events ON events(starts_at);
`);

// Migraciones aditivas: columnas nuevas sobre bases ya existentes.
function addColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumn('users', 'sess_ver', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'last_seen_at', 'INTEGER');
addColumn('posts', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
addColumn('deliverables', 'review', 'TEXT');
addColumn('deliverables', 'reviewed_at', 'INTEGER');
addColumn('deliverables', 'reviewer', 'TEXT');

db.exec('CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at)');

module.exports = db;
