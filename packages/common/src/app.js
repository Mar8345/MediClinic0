const express = require('express');
const cors = require('cors');
const path = require('node:path');
try { require('node:process').loadEnvFile(path.resolve(process.cwd(), '.env')); } catch {}
const { getDb } = require('./db');
const { hashPassword, verifyPassword, signToken } = require('./security');

function createApp(serviceName) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim()) : true }));
  app.use(express.json({ limit: '1mb' }));
  app.get('/health', (req,res) => res.json({ service: serviceName, status: 'ok', timestamp: new Date().toISOString() }));
  app.post('/api/auth/login', (req,res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
      const db = getDb();
      const user = db.prepare(`SELECT id, role, email, full_name, phone, active, password_hash FROM users WHERE email = ? COLLATE NOCASE`).get(String(email).trim());
      if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
        db.close();
        return res.status(401).json({ error: 'Invalid email or password.' });
      }
      const token = signToken({ id: user.id, role: user.role, email: user.email, name: user.full_name });
      db.close();
      return res.json({ token, user: { id: user.id, role: user.role, email: user.email, name: user.full_name, phone: user.phone } });
    } catch (err) { return res.status(500).json({ error: 'Login failed.', details: err.message }); }
  });
  return app;
}

function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  const status = err.status || (err.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500);
  return res.status(status).json({ error: err.message || 'Internal server error.' });
}

module.exports = { createApp, errorHandler, getDb, hashPassword, verifyPassword, signToken };
