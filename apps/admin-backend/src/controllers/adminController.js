const { getDb, hashPassword, audit } = require('@clinic/common');


function staffList(req, res) {
  const db = getDb();
  const rows = db.prepare(`SELECT u.id,u.role,u.email,u.full_name,u.phone,u.active,u.created_at,
      d.id AS doctor_id,d.specialization,d.working_hours,d.fee_cents
    FROM users u LEFT JOIN doctors d ON d.user_id=u.id WHERE u.role IN ('DOCTOR','SECRETARY') ORDER BY u.role,u.full_name`).all();
  db.close();
  res.json({ staff: rows });
}

function settings(req, res) {
  const db = getDb();
  const rows = db.prepare(`SELECT setting_key,setting_value,updated_at FROM system_settings ORDER BY setting_key`).all();
  db.close();
  res.json({ settings: rows });
}

function updateSettings(req, res) {
  const settings = req.body?.settings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return res.status(400).json({ error: 'settings must be an object of key/value pairs.' });
  const entries = Object.entries(settings).filter(([k,v]) => String(k).trim() && v !== undefined && v !== null);
  if (!entries.length) return res.status(400).json({ error: 'At least one setting is required.' });
  const db = getDb();
  db.exec('BEGIN');
  try {
    const stmt = db.prepare(`INSERT INTO system_settings (setting_key,setting_value,updated_by_user_id,updated_at) VALUES (?,?,?,datetime('now')) ON CONFLICT(setting_key) DO UPDATE SET setting_value=excluded.setting_value,updated_by_user_id=excluded.updated_by_user_id,updated_at=datetime('now')`);
    for (const [key,value] of entries) stmt.run(String(key).trim(), typeof value === 'string' ? value : JSON.stringify(value), req.user.id);
    audit(db, req.user.id, 'UPDATE', 'SystemSettings', null, { keys: entries.map(([k]) => String(k).trim()) });
    db.exec('COMMIT');
    const rows = db.prepare(`SELECT setting_key,setting_value,updated_at FROM system_settings ORDER BY setting_key`).all();
    db.close();
    res.json({ message: 'System settings updated.', settings: rows });
  } catch (err) { try { db.exec('ROLLBACK'); } catch {} db.close(); return res.status(500).json({ error: 'Settings update failed.', details: err.message }); }
}

function analytics(req, res) {
  const db = getDb();
  const totalPatients = db.prepare(`SELECT COUNT(*) AS count FROM patients`).get().count;
  const totalDoctors = db.prepare(`SELECT COUNT(*) AS count FROM doctors`).get().count;
  const totalSecretaries = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE role='SECRETARY'`).get().count;
  const totalAppointments = db.prepare(`SELECT COUNT(*) AS count FROM appointments`).get().count;
  const completedAppointments = db.prepare(`SELECT COUNT(*) AS count FROM appointments WHERE status='Completed'`).get().count;
  const revenueCents = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM billing WHERE status='Paid'`).get().total;
  const outstandingCents = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) AS total FROM billing WHERE status='Unpaid'`).get().total;
  const todayAppointments = db.prepare(`SELECT COUNT(*) AS count FROM appointments WHERE substr(scheduled_at,1,10)=date('now')`).get().count;
  const dbVersion = db.prepare(`SELECT sqlite_version() AS version`).get().version;
  db.close();
  res.json({ clinic: { totalPatients, totalDoctors, totalSecretaries, totalAppointments, completedAppointments, todayAppointments, totalRevenueCents: revenueCents, outstandingBillingCents: outstandingCents, sqliteVersion: dbVersion } });
}

function staff(req, res) {
  const { role, email, password, fullName, phone = '', specialization = '', workingHours = {}, feeCents = 0 } = req.body || {};
  if (!['DOCTOR','SECRETARY'].includes(role)) return res.status(400).json({ error: 'role must be DOCTOR or SECRETARY.' });
  if (!email || !password || !fullName) return res.status(400).json({ error: 'email, password, and fullName are required.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please provide a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(String(email).trim())) { db.close(); return res.status(409).json({ error: 'An account with this email already exists.' }); }
  db.exec('BEGIN');
  try {
    const userResult = db.prepare(`INSERT INTO users (role,email,password_hash,full_name,phone) VALUES (?,?,?,?,?)`).run(role,String(email).trim().toLowerCase(),hashPassword(password),String(fullName).trim(),String(phone).trim());
    const userId = Number(userResult.lastInsertRowid);
    let profile = null;
    if (role === 'DOCTOR') {
      if (!specialization) { db.exec('ROLLBACK'); db.close(); return res.status(400).json({ error: 'specialization is required for doctors.' }); }
      if (!Number.isInteger(Number(feeCents)) || Number(feeCents) < 0) { db.exec('ROLLBACK'); db.close(); return res.status(400).json({ error: 'feeCents must be a non-negative integer.' }); }
      const doctor = db.prepare(`INSERT INTO doctors (user_id,specialization,working_hours,fee_cents) VALUES (?,?,?,?)`).run(userId,String(specialization).trim(),JSON.stringify(workingHours),Number(feeCents));
      profile = { id: Number(doctor.lastInsertRowid), role };
    }
    audit(db, req.user.id, 'CREATE', 'Staff', userId, { role, email });
    db.exec('COMMIT');
    const result = db.prepare(`SELECT id,role,email,full_name,phone,active,created_at FROM users WHERE id=?`).get(userId);
    db.close();
    res.status(201).json({ staff: { ...result, profile } });
  } catch (err) { try { db.exec('ROLLBACK'); } catch {} db.close(); return res.status(500).json({ error: 'Staff creation failed.', details: err.message }); }
}

function updateStaff(req, res) {
  const { fullName, phone, active, specialization, workingHours, feeCents } = req.body || {};
  const db = getDb();
  const user = db.prepare(`SELECT id,role,full_name,phone,active FROM users WHERE id=? AND role IN ('DOCTOR','SECRETARY')`).get(req.params.id);
  if (!user) { db.close(); return res.status(404).json({ error: 'Staff account not found.' }); }
  db.exec('BEGIN');
  try {
    const nextName = fullName === undefined ? user.full_name : String(fullName).trim();
    const nextPhone = phone === undefined ? user.phone : String(phone).trim();
    const nextActive = active === undefined ? user.active : (active ? 1 : 0);
    db.prepare(`UPDATE users SET full_name=?,phone=?,active=?,updated_at=datetime('now') WHERE id=?`).run(nextName,nextPhone,nextActive,user.id);
    if (user.role === 'DOCTOR') {
      const doctor = db.prepare('SELECT * FROM doctors WHERE user_id=?').get(user.id);
      if (specialization !== undefined && !String(specialization).trim()) { db.exec('ROLLBACK'); db.close(); return res.status(400).json({ error: 'specialization cannot be empty.' }); }
      const nextSpec = specialization === undefined ? doctor.specialization : String(specialization).trim();
      const nextHours = workingHours === undefined ? doctor.working_hours : JSON.stringify(workingHours);
      const nextFee = feeCents === undefined ? doctor.fee_cents : Number(feeCents);
      if (!Number.isInteger(nextFee) || nextFee < 0) { db.exec('ROLLBACK'); db.close(); return res.status(400).json({ error: 'feeCents must be a non-negative integer.' }); }
      db.prepare(`UPDATE doctors SET specialization=?,working_hours=?,fee_cents=?,updated_at=datetime('now') WHERE user_id=?`).run(nextSpec,nextHours,nextFee,user.id);
    }
    audit(db, req.user.id, 'UPDATE', 'Staff', user.id, {});
    db.exec('COMMIT');
    const result = db.prepare(`SELECT id,role,email,full_name,phone,active,updated_at FROM users WHERE id=?`).get(user.id);
    db.close();
    res.json({ staff: result });
  } catch (err) { try { db.exec('ROLLBACK'); } catch {} db.close(); return res.status(500).json({ error: 'Staff update failed.', details: err.message }); }
}

function deleteStaff(req, res) {
  const db = getDb();
  const user = db.prepare(`SELECT id,role,email FROM users WHERE id=? AND role IN ('DOCTOR','SECRETARY')`).get(req.params.id);
  if (!user) { db.close(); return res.status(404).json({ error: 'Staff account not found.' }); }
  if (user.id === req.user.id) { db.close(); return res.status(400).json({ error: 'You cannot deactivate your own admin account through this endpoint.' }); }
  // Soft-delete account to preserve appointment/history integrity.
  db.prepare(`UPDATE users SET active=0,updated_at=datetime('now') WHERE id=?`).run(user.id);
  audit(db, req.user.id, 'DEACTIVATE', 'Staff', user.id, { email: user.email, role: user.role });
  db.close();
  res.json({ message: 'Staff account deactivated.', id: user.id });
}

function logs(req, res) {
  const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
  const db = getDb();
  const rows = db.prepare(`SELECT al.*, u.email AS actor_email, u.full_name AS actor_name FROM audit_logs al LEFT JOIN users u ON u.id=al.actor_user_id ORDER BY al.created_at DESC LIMIT ?`).all(limit);
  db.close();
  res.json({ logs: rows });
}

module.exports = { analytics, staffList, staff, updateStaff, deleteStaff, logs, settings, updateSettings };
