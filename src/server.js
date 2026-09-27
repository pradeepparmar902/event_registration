require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

require('./db').init().then(() => {
  const authRoutes = require('./routes/auth');
  const eventRoutes = require('./routes/events');
  const publicRoutes = require('./routes/public');

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.use('/api/auth', authRoutes);
  app.use('/api/events', eventRoutes);       // organizer-side, requires login
  app.use('/api/public', publicRoutes);      // attendee-side, no auth

  app.get('/health', (req, res) => res.json({ ok: true }));

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => console.log(`Event check-in API listening on :${PORT}`));
}).catch(err => {
  console.error("Failed to initialize database", err);
});
