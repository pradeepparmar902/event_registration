// Sends the individual confirmation message via Meta's official WhatsApp
// Cloud API. This is the reliable, ToS-safe channel — no ban risk, scales
// horizontally. Group actions are NOT possible here (see whatsappGroup.js).

const MOCK = String(process.env.MOCK_WHATSAPP).toLowerCase() !== 'false';

async function sendConfirmation({ toPhone, name, eventName, checkinLink }) {
  if (MOCK) {
    console.log(`[whatsapp:mock] would send confirmation to ${toPhone}: ` +
      `"Hi ${name}, your registration for ${eventName} is confirmed. ${checkinLink || ''}"`);
    return { status: 'sent', mock: true };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'event_checkin_confirmation';
  if (!token || !phoneNumberId) {
    throw new Error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured');
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    to: toPhone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: name },
            { type: 'text', text: eventName },
          ],
        },
      ],
    },
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`WhatsApp Cloud API error (${resp.status}): ${errText}`);
  }
  return { status: 'sent', mock: false };
}

module.exports = { sendConfirmation };
