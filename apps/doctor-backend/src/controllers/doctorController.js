const { getDb, audit } = require('@clinic/common');

function listAppointments(req, res) {
  const db = getDb();
  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id = ?').get(req.user.id);
  if (!doctor) { db.close(); return res.status(404).json({ error: 'Doctor profile not found.' }); }
  const rows = db.prepare(`SELECT a.id, a.scheduled_at, a.status, a.reason, a.notes,
      p.id AS patient_id, u.full_name AS patient_name, u.phone AS patient_phone
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users u ON u.id=p.user_id
    WHERE a.doctor_id=? ORDER BY a.scheduled_at ASC`).all(doctor.id);
  db.close();
  res.json({ appointments: rows });
}

function addMedicalRecord(req, res) {
  const { patientId, diagnosis, symptoms = '', notes = '' } = req.body || {};
  if (!patientId || !diagnosis) return res.status(400).json({ error: 'patientId and diagnosis are required.' });
  const db = getDb();
  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id=?').get(req.user.id);
  const patient = db.prepare('SELECT id FROM patients WHERE id=?').get(patientId);
  if (!doctor) { db.close(); return res.status(404).json({ error: 'Doctor profile not found.' }); }
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient not found.' }); }
  const result = db.prepare(`INSERT INTO medical_records (patient_id,doctor_id,diagnosis,symptoms,notes) VALUES (?,?,?,?,?)`).run(patientId, doctor.id, String(diagnosis).trim(), String(symptoms).trim(), String(notes).trim());
  const id = Number(result.lastInsertRowid);
  audit(db, req.user.id, 'CREATE', 'MedicalRecord', id, { patientId });
  const record = db.prepare(`SELECT mr.*, u.full_name AS doctor_name FROM medical_records mr JOIN doctors d ON d.id=mr.doctor_id JOIN users u ON u.id=d.user_id WHERE mr.id=?`).get(id);
  db.close();
  res.status(201).json({ record });
}

function updateMedicalRecord(req, res) {
  const { diagnosis, symptoms = '', notes = '' } = req.body || {};
  if (!diagnosis) return res.status(400).json({ error: 'diagnosis is required.' });
  const db = getDb();
  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id=?').get(req.user.id);
  const current = db.prepare('SELECT * FROM medical_records WHERE id=?').get(req.params.id);
  if (!doctor) { db.close(); return res.status(404).json({ error: 'Doctor profile not found.' }); }
  if (!current) { db.close(); return res.status(404).json({ error: 'Medical record not found.' }); }
  if (current.doctor_id !== doctor.id) { db.close(); return res.status(403).json({ error: 'You may only update records you created.' }); }
  db.prepare(`UPDATE medical_records SET diagnosis=?, symptoms=?, notes=?, updated_at=datetime('now') WHERE id=?`).run(String(diagnosis).trim(), String(symptoms).trim(), String(notes).trim(), req.params.id);
  audit(db, req.user.id, 'UPDATE', 'MedicalRecord', req.params.id, {});
  const record = db.prepare('SELECT * FROM medical_records WHERE id=?').get(req.params.id);
  db.close();
  res.json({ record });
}

function issuePrescription(req, res) {
  const { patientId, medication, dosage, instructions } = req.body || {};
  if (!patientId || !medication || !dosage || !instructions) return res.status(400).json({ error: 'patientId, medication, dosage, and instructions are required.' });
  const db = getDb();
  const doctor = db.prepare('SELECT id FROM doctors WHERE user_id=?').get(req.user.id);
  const patient = db.prepare('SELECT id FROM patients WHERE id=?').get(patientId);
  if (!doctor) { db.close(); return res.status(404).json({ error: 'Doctor profile not found.' }); }
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient not found.' }); }
  const result = db.prepare(`INSERT INTO prescriptions (patient_id,doctor_id,medication,dosage,instructions) VALUES (?,?,?,?,?)`).run(patientId, doctor.id, String(medication).trim(), String(dosage).trim(), String(instructions).trim());
  const id = Number(result.lastInsertRowid);
  audit(db, req.user.id, 'CREATE', 'Prescription', id, { patientId });
  const prescription = db.prepare(`SELECT pr.*, u.full_name AS doctor_name FROM prescriptions pr JOIN doctors d ON d.id=pr.doctor_id JOIN users u ON u.id=d.user_id WHERE pr.id=?`).get(id);
  db.close();
  res.status(201).json({ prescription });
}

function patientHistory(req, res) {
  const db = getDb();
  const patient = db.prepare('SELECT id FROM patients WHERE id=?').get(req.params.patientId);
  if (!patient) { db.close(); return res.status(404).json({ error: 'Patient not found.' }); }
  const records = db.prepare(`SELECT mr.*, u.full_name AS doctor_name FROM medical_records mr JOIN doctors d ON d.id=mr.doctor_id JOIN users u ON u.id=d.user_id WHERE mr.patient_id=? ORDER BY mr.created_at DESC`).all(req.params.patientId);
  const prescriptions = db.prepare(`SELECT pr.*, u.full_name AS doctor_name FROM prescriptions pr JOIN doctors d ON d.id=pr.doctor_id JOIN users u ON u.id=d.user_id WHERE pr.patient_id=? ORDER BY pr.issued_at DESC`).all(req.params.patientId);
  db.close();
  res.json({ records, prescriptions });
}

module.exports = { listAppointments, addMedicalRecord, updateMedicalRecord, issuePrescription, patientHistory };
