const { verifyToken } = require('./security');
const { getDb, audit } = require('./db');

function requireAuth(...roles) {
  return (req, res, next) => {
    try {
      const header = req.get('authorization') || '';
      if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required.' });
      const token = header.slice(7);
      const payload = verifyToken(token);
      if (roles.length && !roles.includes(payload.role)) return res.status(403).json({ error: 'You are not authorized for this action.' });
      req.user = payload;
      next();
    } catch (err) {
      return res.status(401).json({ error: err.message || 'Invalid authentication token.' });
    }
  };
}

function withRequestAudit(action, entity) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (req.user && res.statusCode < 500) {
        try {
          const db = getDb();
          audit(db, req.user.id, action, entity, req.params.id, { method: req.method, path: req.originalUrl, status: res.statusCode });
          db.close();
        } catch {}
      }
    });
    next();
  };
}

module.exports = { requireAuth, withRequestAudit };
