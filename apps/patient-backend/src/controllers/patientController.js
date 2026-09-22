const { getDb, hashPassword, audit } = require('@clinic/common');

function register(req, res) {
  const { email, password, fullName, phone = '', dateOfBirth = null, gender = '', address = '', emergencyContactName = '', emergencyContactPhone = '', medicalNotes = '' } = req.body || {};
  if (!email || !password || !fullName) return res.status(400).json({ error: 'email, password, and fullName are required.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please provide a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').get(String(email).trim())) { db.close(); return res.status(409).json({ error: 'An account with this email already exists.' }); }
  db.exec('BEGIN');
  try {
    const userResult = db.prepare(`INSERT INTO users (role,email,password_hash,full_name,phone) VALUES ('PATIENT',?,?,?,?,?)`).run(String(email).trim().toLowerCase(), hashPassword(password), String(fullName).trim(), String(phone).trim());
    const userId = Number(userResult.lastInsertRowid);
    const patientResult = db.prepare(`INSERT INTO patients (user_id,date_of_birth,gender,address,emergency_contact_name,emergency_contact_phone,medical_notes) VALUES (?,?,?,?,?,?,?)`).run(userId, dateOfBirth, String(gender).trim(), String(address).trim(), String(emergencyContactName).trim(), String(emergencyContactPhone).trim(), String(medicalNotes).trim());
    audit(db, userId, 'CREATE', 'Patient', patientResult.lastInsertRowid, {});
    db.exec('COMMIT');
    const patient = db.prepare(`SELECT p.*, u.email, u.full_name, u.phone FROM patients p JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(patientResult.lastInsertRowid);
    db.close();
    res.status(201).json({ patient });
  } catch (err) { try { db.exec('ROLLBACK'); } catch {} db.close(); return res.status(500).json({ error: 'Patient registration failed.', details: err.message }); }
}

function getProfile(req, res) {
  const db = getDb();
  const patient = db.prepare(`SELECT p.*, u.email, u.full_name, u.phone FROM patients p JOIN users u ON u.id=p.user_id WHERE p.user_id=?`).get(req.user.id);
  db.close();
  if (!patient) return res.status(404).json({ error: 'Patient profile not found.' });
  res.json({ patient });
}

function updateProfile(req, res) {
  const fields = req.body || {};
  const allowed = ['fullName','phone','dateOfBirth','gender','address','emergencyContactName','emergencyContactPhone','medicalNotes'];
  const db = getDb();
  const patient = db.prepare('SELECT id,user_id FROM patients WHERE user_id=?').get(req.user.id);
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient profile not found.' }); }
  if (fields.fullName !== undefined || fields.phone !== undefined) {
    const current = db.prepare('SELECT full_name,phone FROM users WHERE id=?').get(req.user.id);
    db.prepare(`UPDATE users SET full_name=?, phone=?, updated_at=datetime('now') WHERE id=?`).run(fields.fullName === undefined ? current.full_name : String(fields.fullName).trim(), fields.phone === undefined ? current.phone : String(fields.phone).trim(), req.user.id);
  }
  const current = db.prepare('SELECT * FROM patients WHERE id=?').get(patient.id);
  const values = {
    dateOfBirth: fields.dateOfBirth === undefined ? current.date_of_birth : fields.dateOfBirth,
    gender: fields.gender === undefined ? current.gender : String(fields.gender).trim(),
    address: fields.address === undefined ? current.address : String(fields.address).trim(),
    emergencyContactName: fields.emergencyContactName === undefined ? current.emergency_contact_name : String(fields.emergencyContactName).trim(),
    emergencyContactPhone: fields.emergencyContactPhone === undefined ? current.emergency_contact_phone : String(fields.emergencyContactPhone).trim(),
    medicalNotes: fields.medicalNotes === undefined ? current.medical_notes : String(fields.medicalNotes).trim()
  };
  db.prepare(`UPDATE patients SET date_of_birth=?,gender=?,address=?,emergency_contact_name=?,emergency_contact_phone=?,medical_notes=?,updated_at=datetime('now') WHERE id=?`).run(values.dateOfBirth,values.gender,values.address,values.emergencyContactName,values.emergencyContactPhone,values.medicalNotes,patient.id);
  audit(db, req.user.id, 'UPDATE', 'Patient', patient.id, {});
  const updated = db.prepare(`SELECT p.*, u.email, u.full_name, u.phone FROM patients p JOIN users u ON u.id=p.user_id WHERE p.id=?`).get(patient.id);
  db.close();
  res.json({ patient: updated });
}

function bookAppointment(req, res) {
  const { doctorId, scheduledAt, reason = '' } = req.body || {};
  if (!doctorId || !scheduledAt) return res.status(400).json({ error: 'doctorId and scheduledAt are required.' });
  if (Number.isNaN(Date.parse(scheduledAt))) return res.status(400).json({ error: 'scheduledAt must be a valid date/time.' });
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patients WHERE user_id=?').get(req.user.id);
  const doctor = db.prepare('SELECT id FROM doctors WHERE id=?').get(doctorId);
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient profile not found.' }); }
  if (!doctor) { db.close(); return res.status(404).json({ error: 'Doctor not found.' }); }
  const duplicate = db.prepare(`SELECT id FROM appointments WHERE doctor_id=? AND scheduled_at=? AND status IN ('Pending','Confirmed')`).get(doctorId, scheduledAt);
  if (duplicate) { db.close(); return res.status(409).json({ error: 'That appointment slot is already booked.' }); }
  const result = db.prepare(`INSERT INTO appointments (patient_id,doctor_id,scheduled_at,status,reason,created_by_user_id) VALUES (?,?,?,'Pending',?,?)`).run(patient.id, doctorId, scheduledAt, String(reason).trim(), req.user.id);
  audit(db, req.user.id, 'CREATE', 'Appointment', result.lastInsertRowid, { doctorId });
  const appointment = db.prepare(`SELECT a.*, u.full_name AS doctor_name, d.specialization FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id WHERE a.id=?`).get(result.lastInsertRowid);
  db.close();
  res.status(201).json({ appointment });
}

function appointments(req, res) {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patients WHERE user_id=?').get(req.user.id);
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient profile not found.' }); }
  const rows = db.prepare(`SELECT a.*, u.full_name AS doctor_name, d.specialization FROM appointments a JOIN doctors d ON d.id=a.doctor_id JOIN users u ON u.id=d.user_id WHERE a.patient_id=? ORDER BY a.scheduled_at DESC`).all(patient.id);
  db.close();
  res.json({ appointments: rows });
}

function medicalHistory(req, res) {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patients WHERE user_id=?').get(req.user.id);
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient profile not found.' }); }
  const records = db.prepare(`SELECT mr.*, u.full_name AS doctor_name, d.specialization FROM medical_records mr JOIN doctors d ON d.id=mr.doctor_id JOIN users u ON u.id=d.user_id WHERE mr.patient_id=? ORDER BY mr.created_at DESC`).all(patient.id);
  const prescriptions = db.prepare(`SELECT pr.*, u.full_name AS doctor_name, d.specialization FROM prescriptions pr JOIN doctors d ON d.id=pr.doctor_id JOIN users u ON u.id=d.user_id WHERE pr.patient_id=? ORDER BY pr.issued_at DESC`).all(patient.id);
  const reports = records.map(r => ({ id: r.id, type: 'Medical Record', diagnosis: r.diagnosis, symptoms: r.symptoms, notes: r.notes, date: r.created_at, doctorName: r.doctor_name }));
  db.close();
  res.json({ records, prescriptions, reports });
}

function prescriptions(req, res) {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patients WHERE user_id=?').get(req.user.id);
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient profile not found.' }); }
  const rows = db.prepare(`SELECT pr.*, u.full_name AS doctor_name FROM prescriptions pr JOIN doctors d ON d.id=pr.doctor_id JOIN users u ON u.id=d.user_id WHERE pr.patient_id=? ORDER BY pr.issued_at DESC`).all(patient.id);
  db.close();
  res.json({ prescriptions: rows });
}

module.exports = { register, getProfile, updateProfile, bookAppointment, appointments, medicalHistory, prescriptions };
