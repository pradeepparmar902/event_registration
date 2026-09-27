// Simple end-to-end smoke test against a running server (npm start in another
// process, or spawned by run-smoke-test.sh). No test framework needed —
// throws on the first failed assertion so it's easy to read the output.

const BASE = process.env.BASE_URL || 'http://localhost:4000';

async function main() {
  const email = `organizer${Date.now()}@example.com`;

  // 1. Signup
  let res = await fetch(`${BASE}/api/auth/signup`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orgName: 'Pradeep Trainings', name: 'Pradeep', email, password: 'test1234' }),
  });
  assert(res.status === 201, 'signup should return 201');
  const { token } = await res.json();
  assert(token, 'signup should return a token');
  console.log('✔ signup ok');

  // 2. Create an event
  res = await fetch(`${BASE}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: 'Leadership Summit 2026',
      eventDate: '2026-11-10',
      venue: 'Hyatt Regency, Pune',
      whatsappGroupLink: 'https://chat.whatsapp.com/testgroup',
      header: { type: 'text', text: 'Welcome!', bold: true, align: 'center', size: 'lg' },
      fields: [
        { name: 'Full name', type: 'text', locked: true },
        { name: 'Phone number', type: 'tel', locked: true },
        { name: 'Email', type: 'email', locked: true },
        { name: 'City', type: 'select', options: ['Mumbai', 'Pune', 'Delhi'] },
      ],
    }),
  });
  assert(res.status === 201, 'create event should return 201');
  const created = await res.json();
  assert(created.slug, 'created event should have a slug');
  console.log('✔ event created:', created.slug);

  // 3. List events (organizer side)
  res = await fetch(`${BASE}/api/events`, { headers: { Authorization: `Bearer ${token}` } });
  const list = await res.json();
  assert(list.events.length === 1, 'org should have exactly 1 event');
  console.log('✔ event list ok');

  // 4. Get QR code
  res = await fetch(`${BASE}/api/events/${list.events[0].id}/qrcode`, { headers: { Authorization: `Bearer ${token}` } });
  const qr = await res.json();
  assert(qr.qrDataUrl.startsWith('data:image/png;base64,'), 'qr code should be a PNG data URL');
  console.log('✔ QR generated, links to:', qr.url);

  // 5. Public: fetch form schema (what the QR page would call)
  res = await fetch(`${BASE}/api/public/events/${created.slug}`);
  const schema = await res.json();
  assert(schema.fields.length === 4, 'public schema should expose 4 fields');
  console.log('✔ public form schema ok');

  // 6. Public: submit a registration
  res = await fetch(`${BASE}/api/public/events/${created.slug}/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 'Full name': 'Test Attendee', 'Phone number': '+919999999999', Email: 'attendee@example.com', City: 'Pune' }),
  });
  assert(res.status === 201, 'registration should return 201');
  console.log('✔ registration submitted');

  // give the async WhatsApp job a moment to run (mock mode)
  await new Promise(r => setTimeout(r, 300));

  // 7. Organizer: view registrations, confirm WhatsApp status updated
  res = await fetch(`${BASE}/api/events/${list.events[0].id}/registrations`, { headers: { Authorization: `Bearer ${token}` } });
  const regs = await res.json();
  assert(regs.registrations.length === 1, 'should have 1 registration');
  assert(regs.registrations[0].whatsapp_status === 'sent', 'whatsapp_status should be sent (mock mode)');
  console.log('✔ registration recorded with whatsapp_status =', regs.registrations[0].whatsapp_status);

  console.log('\nAll smoke tests passed.');
}

function assert(cond, msg) {
  if (!cond) throw new Error('FAILED: ' + msg);
}

main().catch(err => { console.error(err); process.exit(1); });
