const { Pool } = require('pg');

let pool;

async function init() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.warn("WARNING: DATABASE_URL is not set. Supabase connection will fail.");
  }
  
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false } // Required for Supabase
  });

  // Run schema setup
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      event_date TEXT,
      venue TEXT,
      whatsapp_group_link TEXT,
      header_json TEXT,      
      fields_json TEXT NOT NULL, 
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      data_json TEXT NOT NULL,   
      phone TEXT,                
      full_name TEXT,
      checked_in_at TIMESTAMP NOT NULL DEFAULT NOW(),
      whatsapp_status TEXT NOT NULL DEFAULT 'pending', 
      whatsapp_group_status TEXT NOT NULL DEFAULT 'pending',
      source TEXT NOT NULL DEFAULT 'walkin' 
    );

    CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
    CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
  `);
  
  // --- TEMPORARY TEST DATA FOR AUTH BYPASS ---
  try {
    await pool.query(`INSERT INTO organizations (id, name) VALUES ('test-org-id', 'Test Organization') ON CONFLICT DO NOTHING`);
    await pool.query(`INSERT INTO users (id, org_id, email, password_hash, name, role) VALUES ('test-user-id', 'test-org-id', 'test@example.com', 'none', 'Test User', 'admin') ON CONFLICT DO NOTHING`);
  } catch(e) {
    console.error(e);
  }
  // -------------------------------------------
}

async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

async function get(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0];
}

async function run(text, params) {
  const result = await pool.query(text, params);
  return { changes: result.rowCount };
}

async function transaction(queries) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const q of queries) {
      await client.query(q.text, q.params);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { init, query, get, run, transaction };
