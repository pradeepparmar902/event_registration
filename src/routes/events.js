const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { qrPngDataUrl } = require('../utils/qrcode');

const router = express.Router();
router.use(requireAuth); // everything below requires a logged-in organizer

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
}

// POST /api/events — create a new event with its form schema
router.post('/', (req, res) => {
  const { name, eventDate, venue, whatsappGroupLink, header, fields } = req.body;
  if (!name || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'name and fields[] are required' });
  }

  const id = uuid();
  let slug = slugify(name);
  // ensure slug uniqueness by suffixing with part of the id if needed
  const clash = db.prepare('SELECT id FROM events WHERE slug = ?').get(slug);
  if (clash) slug = `${slug}-${id.slice(0, 6)}`;

  db.prepare(`
    INSERT INTO events (id, org_id, name, slug, event_date, venue, whatsapp_group_link, header_json, fields_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, req.user.orgId, name, slug, eventDate || null, venue || null,
    whatsappGroupLink || null, JSON.stringify(header || { type: 'none' }), JSON.stringify(fields)
  );

  res.status(201).json({ id, slug, checkinUrl: `${process.env.PUBLIC_BASE_URL}/r/${slug}` });
});

// GET /api/events — list this org's events
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT id, name, slug, event_date, venue, is_active, created_at,
      (SELECT COUNT(*) FROM registrations WHERE registrations.event_id = events.id) AS registration_count
    FROM events WHERE org_id = ? ORDER BY created_at DESC
  `).all(req.user.orgId);
  res.json({ events: rows });
});

// GET /api/events/:id — full event detail (for editing)
router.get('/:id', (req, res) => {
  const ev = getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ event: serializeEvent(ev) });
});

// PUT /api/events/:id — update event details/form schema
router.put('/:id', (req, res) => {
  const ev = getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });

  const { name, eventDate, venue, whatsappGroupLink, header, fields, isActive } = req.body;
  db.prepare(`
    UPDATE events SET
      name = COALESCE(?, name),
      event_date = COALESCE(?, event_date),
      venue = COALESCE(?, venue),
      whatsapp_group_link = COALESCE(?, whatsapp_group_link),
      header_json = COALESCE(?, header_json),
      fields_json = COALESCE(?, fields_json),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(
    name ?? null, eventDate ?? null, venue ?? null, whatsappGroupLink ?? null,
    header ? JSON.stringify(header) : null,
    fields ? JSON.stringify(fields) : null,
    typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
    ev.id
  );
  res.json({ ok: true });
});

// GET /api/events/:id/qrcode — QR image (data URL) for this event's check-in link
router.get('/:id/qrcode', async (req, res) => {
  const ev = getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const url = `${process.env.PUBLIC_BASE_URL}/r/${ev.slug}`;
  const dataUrl = await qrPngDataUrl(url);
  res.json({ url, qrDataUrl: dataUrl });
});

// GET /api/events/:id/registrations — list attendees for this event
router.get('/:id/registrations', (req, res) => {
  const ev = getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const rows = db.prepare(`
    SELECT id, data_json, phone, full_name, checked_in_at, whatsapp_status, whatsapp_group_status, source
    FROM registrations WHERE event_id = ? ORDER BY checked_in_at DESC
  `).all(ev.id);
  res.json({
    registrations: rows.map(r => ({ ...r, data: JSON.parse(r.data_json), data_json: undefined })),
  });
});

function getOwnedEvent(req) {
  return db.prepare('SELECT * FROM events WHERE id = ? AND org_id = ?').get(req.params.id, req.user.orgId);
}
function serializeEvent(ev) {
  return {
    ...ev,
    header: JSON.parse(ev.header_json || '{"type":"none"}'),
    fields: JSON.parse(ev.fields_json || '[]'),
    header_json: undefined,
    fields_json: undefined,
  };
}

module.exports = router;
