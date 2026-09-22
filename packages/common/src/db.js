const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function getDb() {
  const configured = process.env.DB_PATH || path.resolve(__dirname, '../../../database/clinic.db');
  const dbPath = path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  return db;
}

function parseJson(value, fallback = {}) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function audit(db, actorUserId, action, entity, entityId, details = {}) {
  db.prepare(`INSERT INTO audit_logs (actor_user_id,action,entity,entity_id,details) VALUES (?,?,?,?,?)`)
    .run(actorUserId ?? null, action, entity, entityId == null ? null : String(entityId), JSON.stringify(details));
}

module.exports = { getDb, parseJson, audit };
