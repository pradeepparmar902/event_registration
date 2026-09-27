// Group operations (auto-adding a number to a WhatsApp group) are NOT
// possible through Meta's official Cloud API — that's a hard platform
// restriction, not a missing feature. The only way to automate it is an
// unofficial client (e.g. whatsapp-web.js) driving a real logged-in
// WhatsApp Web session, which:
//   - violates WhatsApp's Terms of Service (ban risk for the number used)
//   - requires a persistent server process with a scanned QR login session
//   - cannot run in this sandboxed environment (no browser automation,
//     no outbound access to WhatsApp's servers)
//
// This file defines the interface your real server would implement, and
// mocks it so the rest of the app (routes, queue, DB writes) can be
// tested end-to-end without a live WhatsApp Web session.
//
// SAFER DEFAULT (recommended): instead of calling addToGroup(), just send
// the event's whatsapp_group_link in the Cloud API confirmation message
// and let the attendee tap to join. Zero ban risk, zero extra infra.

const MOCK = String(process.env.MOCK_WHATSAPP).toLowerCase() !== 'false';

async function addToGroup({ phone, groupInviteLink }) {
  if (!groupInviteLink) return { status: 'skipped', reason: 'no group configured for this event' };

  if (MOCK) {
    console.log(`[whatsapp-group:mock] would attempt to add ${phone} to group via ${groupInviteLink}`);
    return { status: 'sent', mock: true };
  }

  // Real implementation (outside this sandbox) would look roughly like:
  //
  //   const client = await getPersistentWhatsAppWebSession();  // one per org/number
  //   await client.throttledAddParticipant(groupId, phone);    // rate-limited, e.g. 1 per 5s
  //
  // Wrap in try/catch and mark whatsapp_group_status = 'failed' on error —
  // never let a group-add failure block the DB write or the confirmation send.
  throw new Error('Live WhatsApp group-add is not wired up outside MOCK_WHATSAPP=true');
}

module.exports = { addToGroup };
