const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
try { require('node:process').loadEnvFile(path.resolve(__dirname, '../.env')); } catch {}

const dbPath = process.env.DB_PATH || path.join(__dirname, 'clinic.db');
const resolved = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath);
fs.mkdirSync(path.dirname(resolved), { recursive: true });
const db = new DatabaseSync(resolved);
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384, r = 8, p = 1, keylen = 64;
  const derived = crypto.scryptSync(password, salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt}$${derived.toString('hex')}`;
}

function user(email, role, name, password, phone) {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return existing.id;
  const result = db.prepare(`INSERT INTO users (role,email,password_hash,full_name,phone) VALUES (?,?,?,?,?)`).run(role, email, hashPassword(password), name, phone);
  return Number(result.lastInsertRowid);
}

const adminUserId = user('admin@clinic.local', 'ADMIN', 'Clinic Admin', 'Admin@12345', '01000000000');
const doctorUserId = user('doctor@clinic.local', 'DOCTOR', 'Dr. Samir Hassan', 'Doctor@12345', '01000000001');
const secretaryUserId = user('secretary@clinic.local', 'SECRETARY', 'Mona Reception', 'Secretary@12345', '01000000002');
const patientUserId = user('patient@clinic.local', 'PATIENT', 'Ahmed Patient', 'Patient@12345', '01000000003');

if (!db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(doctorUserId)) {
  db.prepare(`INSERT INTO doctors (user_id,specialization,working_hours,fee_cents) VALUES (?,?,?,?)`).run(doctorUserId, 'General Medicine', JSON.stringify({Mon:'09:00-16:00',Tue:'09:00-16:00',Wed:'09:00-16:00',Thu:'09:00-16:00'}), 50000);
}
if (!db.prepare('SELECT id FROM patients WHERE user_id = ?').get(patientUserId)) {
  db.prepare(`INSERT INTO patients (user_id,date_of_birth,gender,address,emergency_contact_name,emergency_contact_phone,medical_notes) VALUES (?,?,?,?,?,?,?)`).run(patientUserId, '1998-04-12', 'Male', 'Cairo, Egypt', 'Mariam Patient', '01000000004', 'Seed patient for development testing.');
}

const doctorId = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(doctorUserId).id;
const patientId = db.prepare('SELECT id FROM patients WHERE user_id = ?').get(patientUserId).id;
const appointment = db.prepare('SELECT id FROM appointments WHERE patient_id = ? AND doctor_id = ?').get(patientId, doctorId);
if (!appointment) {
  db.prepare(`INSERT INTO appointments (patient_id,doctor_id,scheduled_at,status,reason,created_by_user_id) VALUES (?,?,?,?,?,?)`).run(patientId, doctorId, '2026-09-23T10:00:00', 'Confirmed', 'Routine check-up', secretaryUserId);
}

console.log(JSON.stringify({
  message: 'Seed completed',
  demoAccounts: [
    { role: 'ADMIN', email: 'admin@clinic.local', password: 'Admin@12345' },
    { role: 'DOCTOR', email: 'doctor@clinic.local', password: 'Doctor@12345' },
    { role: 'SECRETARY', email: 'secretary@clinic.local', password: 'Secretary@12345' },
    { role: 'PATIENT', email: 'patient@clinic.local', password: 'Patient@12345' }
  ]
}, null, 2));
db.close();
