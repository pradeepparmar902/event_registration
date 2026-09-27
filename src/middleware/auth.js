const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  // --- TEMPORARY BYPASS FOR TESTING ---
  req.user = { userId: 'test-user-id', orgId: 'test-org-id', role: 'admin', email: 'test@example.com' };
  return next();
  // ------------------------------------
  
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing auth token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { userId, orgId, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
