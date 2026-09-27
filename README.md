# Event Check-in & Registration Backend

Multi-tenant backend for QR-based event registration: organizers sign up,
create an event with a custom form, get a QR code, attendees scan it, fill
the form, and their entry is stored + an individual WhatsApp confirmation
is sent (WhatsApp group-add is stubbed — see below).

## Stack
- Node.js + Express
- SQLite (`better-sqlite3`) — swap for Postgres later by replacing `src/db.js`
- JWT auth, `bcryptjs` for password hashing
- `multer` for profile-image / document uploads (stored to `/uploads` locally — swap for S3 in production)
- In-memory job queue (`src/services/queue.js`) — swap for BullMQ + Redis for real check-in-day traffic

## Setup
```bash
npm install
cp .env.example .env      # already done for you; edit JWT_SECRET before going live
npm start                 # runs on http://localhost:4000
```

## Run the smoke test
With the server running in one terminal:
```bash
node test/smoke-test.js
```
This exercises the full flow: organizer signup → login → create event →
generate QR → fetch public form schema → submit a registration → confirm
the WhatsApp job ran (mock mode) and the status was recorded.

## MOCK_WHATSAPP
`.env` has `MOCK_WHATSAPP=true` by default — WhatsApp sends are logged to
the console instead of calling Meta's API, so you can test the whole flow
without any WhatsApp credentials. Set it to `false` and fill in
`WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` (from Meta's WhatsApp Cloud
API) once you're ready to send real messages — you'll also need to get a
message template pre-approved by Meta.

## WhatsApp group-add — important limitation
Meta's official Cloud API has **no concept of groups** — it can only send
1-to-1 messages. `src/services/whatsappGroup.js` documents this and stubs
the group-add call. Real group-add requires an unofficial client
(`whatsapp-web.js`) driving a logged-in WhatsApp Web session on your own
server, which risks a ban on that number. The safer default already wired
in: send the event's group invite link inside the confirmation message so
attendees join with one tap, at zero risk.

## API overview

### Auth (no token required)
- `POST /api/auth/signup` — `{ orgName, name, email, password }` → creates org + admin user, returns JWT
- `POST /api/auth/login` — `{ email, password }` → returns JWT

### Organizer routes (require `Authorization: Bearer <token>`)
- `POST /api/events` — create an event: `{ name, eventDate, venue, whatsappGroupLink, header, fields }`
- `GET /api/events` — list your org's events
- `GET /api/events/:id` — full event detail
- `PUT /api/events/:id` — update event / form schema
- `GET /api/events/:id/qrcode` — QR code as a PNG data URL, plus the check-in URL
- `GET /api/events/:id/registrations` — list attendees + their WhatsApp send status

### Public routes (no auth — what the QR code links to)
- `GET /api/public/events/:slug` — form schema for the attendee page (visible fields only)
- `POST /api/public/events/:slug/register` — attendee submission (`multipart/form-data`, so file/image fields work)

## Multi-tenant model
Every event and registration is scoped to an `organizations` row via
`org_id`. A user's JWT carries their `orgId`, and every organizer route
filters by it — one customer can never see another's events or attendees.
Add a `role` check (`admin` / `organizer` / `scanner`) in `middleware/auth.js`
if you want a stripped-down "scanner" login for door staff.

## Wiring up the front-end builder
The form-builder artifact from earlier in this conversation should POST
its event JSON (name, header, fields) to `POST /api/events`, and the
QR-linked page attendees see should call `GET /api/public/events/:slug`
to render the form, then `POST /api/public/events/:slug/register` on submit.

## Production checklist before going live
1. Move file storage (`multer` disk storage) to S3 / Firebase Storage
2. Swap SQLite → Postgres for concurrent-write safety at scale
3. Swap the in-memory queue → BullMQ + Redis so a check-in rush doesn't block requests
4. Get a WhatsApp message template approved by Meta, set `MOCK_WHATSAPP=false`
5. Add rate limiting on `/api/public/*` (a public endpoint with no auth is the one surface open to abuse)
6. Put the whole thing behind HTTPS + a real domain for `PUBLIC_BASE_URL`
