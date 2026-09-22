const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
try { require('node:process').loadEnvFile(path.resolve(__dirname, '../.env')); } catch {}

const dbPath = process.env.DB_PATH || path.join(__dirname, 'clinic.db');
const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });
const db = new DatabaseSync(resolved);
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);
db.close();
console.log(`Database initialized: ${resolved}`);
