const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const db = require('../db');

const router = express.Router();

// POST /api/auth/signup
// Creates a brand-new organization (tenant) plus its first admin user.
router.post('/signup', (req, res) => {
  const { orgName, name, email, password } = req.body;
  if (!orgName || !email || !password) {
    return res.status(400).json({ error: 'orgName, email and password are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

  const orgId = uuid();
  const userId = uuid();
  const passwordHash = bcrypt.hashSync(password, 10);

  const insertOrg = db.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)');
  const insertUser = db.prepare(`
    INSERT INTO users (id, org_id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?, 'admin')
  `);

  const tx = db.transaction(() => {
    insertOrg.run(orgId, orgName);
    insertUser.run(userId, orgId, email, passwordHash, name || null);
  });
  tx();

  const token = signToken({ userId, orgId, email, role: 'admin' });
  res.status(201).json({ token, org: { id: orgId, name: orgName }, user: { id: userId, email, name, role: 'admin' } });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = signToken({ userId: user.id, orgId: user.org_id, email: user.email, role: user.role });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role, orgId: user.org_id } });
});

function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

module.exports = router;
