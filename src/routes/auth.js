const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');

const router = express.Router();

router.post('/signup', async (req, res) => {
  const { orgName, name, email, password } = req.body;
  if (!orgName || !email || !password) {
    return res.status(400).json({ error: 'orgName, email and password are required' });
  }

  const existing = await db.get('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const orgId = uuid();
  const userId = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);

  await db.transaction([
    { text: 'INSERT INTO organizations (id, name) VALUES ($1, $2)', params: [orgId, orgName] },
    { text: 'INSERT INTO users (id, org_id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, $5, $6)', params: [userId, orgId, email, passwordHash, name || null, 'admin'] }
  ]);

  const token = signToken({ userId, orgId, email, role: 'admin' });
  res.status(201).json({ token, org: { id: orgId, name: orgName }, user: { id: userId, email, name, role: 'admin' } });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = await db.get('SELECT * FROM users WHERE email = $1', [email]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ userId: user.id, orgId: user.org_id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.org_id } });
});

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

module.exports = router;
