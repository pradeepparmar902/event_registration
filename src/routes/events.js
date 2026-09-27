const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { qrPngDataUrl } = require('../utils/qrcode');

const router = express.Router();
router.use(requireAuth);

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
}

router.post('/', async (req, res) => {
  const { name, eventDate, venue, whatsappGroupLink, header, fields } = req.body;
  if (!name || !Array.isArray(fields)) {
    return res.status(400).json({ error: 'name and fields[] are required' });
  }

  const id = uuid();
  let slug = req.body.slug || slugify(name);
  const clash = await db.get('SELECT id FROM events WHERE slug = $1', [slug]);
  if (clash) slug = `${slug}-${id.slice(0, 6)}`;

  await db.run(`
    INSERT INTO events (id, org_id, name, slug, event_date, venue, whatsapp_group_link, header_json, fields_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [
    id, req.user.orgId, name, slug, eventDate || null, venue || null,
    whatsappGroupLink || null, JSON.stringify(header || { type: 'none' }), JSON.stringify(fields)
  ]);

  res.status(201).json({ id, slug, checkinUrl: `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/r/${slug}` });
});

router.get('/', async (req, res) => {
  const rows = await db.query(`
    SELECT id, name, slug, event_date, venue, is_active, created_at,
      (SELECT COUNT(*) FROM registrations WHERE registrations.event_id = events.id) AS registration_count
    FROM events WHERE org_id = $1 ORDER BY created_at DESC
  `, [req.user.orgId]);
  res.json({ events: rows });
});

router.get('/:id', async (req, res) => {
  const ev = await getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json({ event: serializeEvent(ev) });
});

router.put('/:id', async (req, res) => {
  const ev = await getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });

  const { name, eventDate, venue, whatsappGroupLink, header, fields, isActive } = req.body;
  await db.run(`
    UPDATE events SET
      name = COALESCE($1, name),
      event_date = COALESCE($2, event_date),
      venue = COALESCE($3, venue),
      whatsapp_group_link = COALESCE($4, whatsapp_group_link),
      header_json = COALESCE($5, header_json),
      fields_json = COALESCE($6, fields_json),
      is_active = COALESCE($7, is_active)
    WHERE id = $8
  `, [
    name ?? null, eventDate ?? null, venue ?? null, whatsappGroupLink ?? null,
    header ? JSON.stringify(header) : null,
    fields ? JSON.stringify(fields) : null,
    typeof isActive === 'boolean' ? (isActive ? 1 : 0) : null,
    ev.id
  ]);
  res.json({ ok: true });
});

router.get('/:id/qrcode', async (req, res) => {
  const ev = await getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const url = `${process.env.PUBLIC_BASE_URL || 'http://localhost:4000'}/r/${ev.slug}`;
  const dataUrl = await qrPngDataUrl(url);
  res.json({ url, qrDataUrl: dataUrl });
});

router.get('/:id/registrations', async (req, res) => {
  const ev = await getOwnedEvent(req);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  const rows = await db.query(`
    SELECT id, data_json, phone, full_name, checked_in_at, whatsapp_status, whatsapp_group_status, source
    FROM registrations WHERE event_id = $1 ORDER BY checked_in_at DESC
  `, [ev.id]);
  res.json({
    registrations: rows.map(r => ({ ...r, data: JSON.parse(r.data_json), data_json: undefined })),
  });
});

async function getOwnedEvent(req) {
  return await db.get('SELECT * FROM events WHERE id = $1 AND org_id = $2', [req.params.id, req.user.orgId]);
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
