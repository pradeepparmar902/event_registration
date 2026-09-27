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

// GET /api/public/events/:slug — form schema for the attendee-facing page
// This is what your QR code links to.
router.get('/events/:slug', (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE slug = ? AND is_active = 1').get(req.params.slug);
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

// POST /api/public/events/:slug/register — attendee submits the form
// Accepts multipart/form-data so profile-image / document fields can attach files.
router.post('/events/:slug/register', upload.any(), async (req, res) => {
  const ev = db.prepare('SELECT * FROM events WHERE slug = ? AND is_active = 1').get(req.params.slug);
  if (!ev) return res.status(404).json({ error: 'Event not found or no longer active' });

  const formData = { ...req.body };
  // attach uploaded file paths under their field name
  (req.files || []).forEach(f => { formData[f.fieldname] = `/uploads/${f.filename}`; });

  let fullName = formData['Full name'] || formData.name || null;
  if (!fullName) {
    const splitNameKey = Object.keys(formData).find(k => k.endsWith(' - Name'));
    if (splitNameKey) {
      const base = splitNameKey.replace(' - Name', '');
      fullName = [formData[`${base} - Name`], formData[`${base} - Middle`], formData[`${base} - Surname`]].filter(Boolean).join(' ');
    } else {
      const nameKey = Object.keys(formData).find(k => k.toLowerCase().includes('name'));
      if (nameKey) fullName = formData[nameKey];
    }
  }

  let phone = formData['Phone number'] || formData.phone || formData['Mobile Number'] || null;
  if (!phone) {
    const phoneKey = Object.keys(formData).find(k => k.toLowerCase().includes('phone') || k.toLowerCase().includes('mobile') || k.toLowerCase().includes('whatsapp'));
    if (phoneKey) phone = formData[phoneKey];
  }
  if (!phone) return res.status(400).json({ error: 'A phone or mobile number field is required to send a WhatsApp confirmation' });

  const regId = uuid();
  db.prepare(`
    INSERT INTO registrations (id, event_id, data_json, phone, full_name, source)
    VALUES (?, ?, ?, ?, ?, 'walkin')
  `).run(regId, ev.id, JSON.stringify(formData), phone, fullName);

  // Respond immediately — WhatsApp sends happen async so the attendee
  // isn't stuck waiting at the door during a check-in rush.
  res.status(201).json({ ok: true, registrationId: regId });

  enqueue(async () => {
    try {
      await whatsappCloud.sendConfirmation({ toPhone: phone, name: fullName || 'there', eventName: ev.name });
      db.prepare('UPDATE registrations SET whatsapp_status = ? WHERE id = ?').run('sent', regId);
    } catch (err) {
      console.error('[whatsapp confirm] failed:', err.message);
      db.prepare('UPDATE registrations SET whatsapp_status = ? WHERE id = ?').run('failed', regId);
    }

    try {
      const result = await whatsappGroup.addToGroup({ phone, groupInviteLink: ev.whatsapp_group_link });
      db.prepare('UPDATE registrations SET whatsapp_group_status = ? WHERE id = ?').run(result.status, regId);
    } catch (err) {
      console.error('[whatsapp group] failed:', err.message);
      db.prepare('UPDATE registrations SET whatsapp_group_status = ? WHERE id = ?').run('failed', regId);
    }
  });
});

module.exports = router;
