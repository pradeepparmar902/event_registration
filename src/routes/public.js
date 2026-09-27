const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { enqueue } = require('../services/queue');
const whatsappCloud = require('../services/whatsappCloud');
const whatsappGroup = require('../services/whatsappGroup');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', '..', 'uploads'),
    filename: (req, file, cb) => cb(null, `${uuid()}-${file.originalname}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB per file — tune for real usage
});

router.get('/events/:slug', async (req, res) => {
  const ev = await db.get('SELECT * FROM events WHERE slug = $1 AND is_active = 1', [req.params.slug]);
  if (!ev) return res.status(404).json({ error: 'Event not found or no longer active' });
  res.json({
    id: ev.id,
    name: ev.name,
    eventDate: ev.event_date,
    venue: ev.venue,
    header: JSON.parse(ev.header_json || '{"type":"none"}'),
    fields: JSON.parse(ev.fields_json || '[]').filter(f => !f.hidden),
  });
});

router.post('/events/:slug/register', upload.any(), async (req, res) => {
  const ev = await db.get('SELECT * FROM events WHERE slug = $1 AND is_active = 1', [req.params.slug]);
  if (!ev) return res.status(404).json({ error: 'Event not found or no longer active' });

  const formData = { ...req.body };
  (req.files || []).forEach(f => { formData[f.fieldname] = `/uploads/${f.filename}`; });

  const fullName = formData['Full name'] || formData.name || null;
  const phone = formData['Phone number'] || formData.phone || null;
  if (!phone) return res.status(400).json({ error: 'Phone number is required to send a WhatsApp confirmation' });

  const regId = uuid();
  await db.run(`
    INSERT INTO registrations (id, event_id, data_json, phone, full_name, source)
    VALUES ($1, $2, $3, $4, $5, 'walkin')
  `, [regId, ev.id, JSON.stringify(formData), phone, fullName]);

  res.status(201).json({ ok: true, registrationId: regId });

  enqueue(async () => {
    try {
      await whatsappCloud.sendConfirmation({ toPhone: phone, name: fullName || 'there', eventName: ev.name });
      await db.run('UPDATE registrations SET whatsapp_status = $1 WHERE id = $2', ['sent', regId]);
    } catch (err) {
      console.error('[whatsapp confirm] failed:', err.message);
      await db.run('UPDATE registrations SET whatsapp_status = $1 WHERE id = $2', ['failed', regId]);
    }

    try {
      const result = await whatsappGroup.addToGroup({ phone, groupInviteLink: ev.whatsapp_group_link });
      await db.run('UPDATE registrations SET whatsapp_group_status = $1 WHERE id = $2', [result.status, regId]);
    } catch (err) {
      console.error('[whatsapp group] failed:', err.message);
      await db.run('UPDATE registrations SET whatsapp_group_status = $1 WHERE id = $2', ['failed', regId]);
    }
  });
});

module.exports = router;
