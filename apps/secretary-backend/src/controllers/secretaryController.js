const crypto = require('node:crypto');
const { getDb, audit, hashPassword } = require('@clinic/common');


function registerWalkIn(req, res) {
  const { fullName, phone = '', email = null, dateOfBirth = null, reason = '' } = req.body || {};
  if (!fullName) return res.status(400).json({ error: 'fullName is required.' });
  const db = getDb();
  db.exec('BEGIN');
  try {
    let userId;
    if (email) {
      const existing = db.prepare('SELECT id,role FROM users WHERE email=? COLLATE NOCASE').get(String(email).trim());
      if (existing) {
        if (existing.role !== 'PATIENT') { db.exec('ROLLBACK'); db.close(); return res.status(409).json({ error: 'That email belongs to a non-patient account.' }); }
        userId = existing.id;
      }
    }
    if (!userId) {
      const syntheticEmail = email ? String(email).trim().toLowerCase() : `walkin-${Date.now()}@clinic.local`;
      const tempPassword = `WalkIn-${crypto.randomBytes(9).toString('hex')}`;
      const result = db.prepare(`INSERT INTO users (role,email,password_hash,full_name,phone) VALUES ('PATIENT',?,?,?,?)`).run(syntheticEmail, hashPassword(tempPassword), String(fullName).trim(), String(phone).trim());
      userId = Number(result.lastInsertRowid);
      db.prepare(`INSERT INTO patients (user_id,date_of_birth,medical_notes) VALUES (?,?,?)`).run(userId, dateOfBirth, 'Registered as walk-in by secretary.');
    } else if (!db.prepare('SELECT id FROM patients WHERE user_id=?').get(userId)) {
      db.prepare(`INSERT INTO patients (user_id,date_of_birth,medical_notes) VALUES (?,?,?)`).run(userId, dateOfBirth, 'Registered as walk-in by secretary.');
    }
    const patient = db.prepare(`SELECT p.id,u.full_name,u.phone,u.email,p.date_of_birth FROM patients p JOIN users u ON u.id=p.user_id WHERE p.user_id=?`).get(userId);
    audit(db, req.user.id, 'CREATE', 'WalkInPatient', patient.id, { reason });
    db.exec('COMMIT');
    db.close();
    res.status(201).json({ patient, message: 'Walk-in patient registered. Schedule an appointment through /api/secretary/appointments.' });
  } catch (err) { try { db.exec('ROLLBACK'); } catch {} db.close(); return res.status(500).json({ error: 'Walk-in registration failed.', details: err.message }); }
}

function scheduleAppointment(req, res) {
  const { patientId, doctorId, scheduledAt, reason = '', notes = '', status = 'Confirmed' } = req.body || {};
  if (!patientId || !doctorId || !scheduledAt) return res.status(400).json({ error: 'patientId, doctorId, and scheduledAt are required.' });
  if (!['Pending','Confirmed','Completed','Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid appointment status.' });
  if (Number.isNaN(Date.parse(scheduledAt))) return res.status(400).json({ error: 'scheduledAt must be a valid date/time.' });
  const db = getDb();
  if (!db.prepare('SELECT id FROM patients WHERE id=?').get(patientId)) { db.close(); return res.status(404).json({ error: 'Patient not found.' }); }
  if (!db.prepare('SELECT id FROM doctors WHERE id=?').get(doctorId)) { db.close(); return res.status(404).json({ error: 'Doctor not found.' }); }
  const duplicate = db.prepare(`SELECT id FROM appointments WHERE doctor_id=? AND scheduled_at=? AND status IN ('Pending','Confirmed')`).get(doctorId, scheduledAt);
  if (duplicate) { db.close(); return res.status(409).json({ error: 'That appointment slot is already booked.' }); }
  const result = db.prepare(`INSERT INTO appointments (patient_id,doctor_id,scheduled_at,status,reason,notes,created_by_user_id) VALUES (?,?,?,?,?,?,?)`).run(patientId,doctorId,scheduledAt,status,String(reason).trim(),String(notes).trim(),req.user.id);
  audit(db, req.user.id, 'CREATE', 'Appointment', result.lastInsertRowid, { patientId, doctorId });
  const row = db.prepare(`SELECT a.*, pu.full_name AS patient_name, du.full_name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users pu ON pu.id=p.user_id JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id WHERE a.id=?`).get(result.lastInsertRowid);
  db.close();
  res.status(201).json({ appointment: row });
}

function reschedule(req, res) {
  const { scheduledAt, status, reason, notes } = req.body || {};
  if (!scheduledAt && !status && reason === undefined && notes === undefined) return res.status(400).json({ error: 'Provide at least one appointment field to update.' });
  if (scheduledAt && Number.isNaN(Date.parse(scheduledAt))) return res.status(400).json({ error: 'scheduledAt must be a valid date/time.' });
  const db = getDb();
  const current = db.prepare('SELECT * FROM appointments WHERE id=?').get(req.params.id);
  if (!current) { db.close(); return res.status(404).json({ error: 'Appointment not found.' }); }
  const nextStatus = status || current.status;
  if (!['Pending','Confirmed','Completed','Cancelled'].includes(nextStatus)) { db.close(); return res.status(400).json({ error: 'Invalid appointment status.' }); }
  const nextTime = scheduledAt || current.scheduled_at;
  if (nextTime !== current.scheduled_at || current.status === 'Cancelled') {
    const duplicate = db.prepare(`SELECT id FROM appointments WHERE doctor_id=? AND scheduled_at=? AND status IN ('Pending','Confirmed') AND id<>?`).get(current.doctor_id,nextTime,current.id);
    if (duplicate && nextStatus !== 'Cancelled') { db.close(); return res.status(409).json({ error: 'That appointment slot is already booked.' }); }
  }
  db.prepare(`UPDATE appointments SET scheduled_at=?,status=?,reason=?,notes=?,updated_at=datetime('now') WHERE id=?`).run(nextTime,nextStatus,reason === undefined ? current.reason : String(reason).trim(),notes === undefined ? current.notes : String(notes).trim(),current.id);
  audit(db, req.user.id, 'UPDATE', 'Appointment', current.id, {});
  const row = db.prepare(`SELECT a.*, pu.full_name AS patient_name, du.full_name AS doctor_name FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users pu ON pu.id=p.user_id JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id WHERE a.id=?`).get(current.id);
  db.close();
  res.json({ appointment: row });
}

function queue(req, res) {
  const date = req.query.date || new Date().toISOString().slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must use YYYY-MM-DD format.' });
  const db = getDb();
  const rows = db.prepare(`SELECT a.id,a.scheduled_at,a.status,a.reason,a.notes,p.id AS patient_id,pu.full_name AS patient_name,d.id AS doctor_id,du.full_name AS doctor_name
    FROM appointments a JOIN patients p ON p.id=a.patient_id JOIN users pu ON pu.id=p.user_id JOIN doctors d ON d.id=a.doctor_id JOIN users du ON du.id=d.user_id
    WHERE substr(a.scheduled_at,1,10)=? ORDER BY a.scheduled_at ASC`).all(date);
  db.close();
  res.json({ date, queue: rows });
}

function updateQueueStatus(req, res) {
  const { status } = req.body || {};
  if (!['Pending','Confirmed','Completed','Cancelled'].includes(status)) return res.status(400).json({ error: 'status must be Pending, Confirmed, Completed, or Cancelled.' });
  const db = getDb();
  const current = db.prepare('SELECT id FROM appointments WHERE id=?').get(req.params.id);
  if (!current) { db.close(); return res.status(404).json({ error: 'Appointment not found.' }); }
  db.prepare(`UPDATE appointments SET status=?, updated_at=datetime('now') WHERE id=?`).run(status,current.id);
  audit(db, req.user.id, 'UPDATE', 'Appointment', current.id, { status });
  db.close();
  res.json({ message: 'Queue status updated.', appointmentId: current.id, status });
}

function billing(req, res) {
  const { patientId, appointmentId = null, amountCents, paymentMethod = 'Cash', status = 'Paid' } = req.body || {};
  if (!patientId || !Number.isInteger(Number(amountCents)) || Number(amountCents) < 0) return res.status(400).json({ error: 'patientId and a non-negative integer amountCents are required.' });
  if (!['Paid','Unpaid'].includes(status)) return res.status(400).json({ error: 'status must be Paid or Unpaid.' });
  const db = getDb();
  if (!db.prepare('SELECT id FROM patients WHERE id=?').get(patientId)) { db.close(); return res.status(404).json({ error: 'Patient not found.' }); }
  if (appointmentId && !db.prepare('SELECT id FROM appointments WHERE id=?').get(appointmentId)) { db.close(); return res.status(404).json({ error: 'Appointment not found.' }); }
  const invoice = `INV-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${String(Date.now()).slice(-6)}`;
  const paidAt = status === 'Paid' ? new Date().toISOString() : null;
  const result = db.prepare(`INSERT INTO billing (patient_id,appointment_id,invoice_number,amount_cents,payment_method,status,paid_at,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)`).run(patientId,appointmentId,invoice,Number(amountCents),String(paymentMethod).trim(),status,paidAt,req.user.id);
  audit(db, req.user.id, 'CREATE', 'Billing', result.lastInsertRowid, { invoiceNumber: invoice });
  const row = db.prepare('SELECT * FROM billing WHERE id=?').get(result.lastInsertRowid);
  db.close();
  res.status(201).json({ invoice: row });
}

function getInvoice(req, res) {
  const db = getDb();
  const row = db.prepare(`SELECT b.*, pu.full_name AS patient_name FROM billing b JOIN patients p ON p.id=b.patient_id JOIN users pu ON pu.id=p.user_id WHERE b.id=?`).get(req.params.id);
  db.close();
  if (!row) return res.status(404).json({ error: 'Invoice not found.' });
  res.json({ invoice: row });
}

module.exports = { registerWalkIn, scheduleAppointment, reschedule, queue, updateQueueStatus, billing, getInvoice };
