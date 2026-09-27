const path = require('path');
const initSqlJs = require('sql.js');
const fs = require('fs');

class Statement {
  constructor(wrapper, sql) {
    this.wrapper = wrapper;
    this.sql = sql;
  }
  
  get(...args) {
    const stmt = this.wrapper.db.prepare(this.sql);
    stmt.bind(args);
    let result = null;
    if (stmt.step()) {
       result = stmt.getAsObject();
    }
    stmt.free();
    return result || undefined;
  }

  all(...args) {
    const stmt = this.wrapper.db.prepare(this.sql);
    stmt.bind(args);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  run(...args) {
    const stmt = this.wrapper.db.prepare(this.sql);
    stmt.bind(args);
    stmt.step();
    stmt.free();
    this.wrapper._save();
    return { changes: 1, lastInsertRowid: 0 }; 
  }
}

class DBWrapper {
  constructor() {
    this.db = null;
    this.dbPath = path.join(__dirname, '..', 'data', 'app.db');
  }

  async init() {
    const SQL = await initSqlJs();
    if (fs.existsSync(this.dbPath)) {
      const filebuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(filebuffer);
    } else {
      this.db = new SQL.Database();
    }
    
    // run schema
    this.pragma('journal_mode = WAL');
    this.pragma('foreign_keys = ON');

    this.exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        data_json TEXT NOT NULL,   
        phone TEXT,                
        full_name TEXT,
        checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
        whatsapp_status TEXT NOT NULL DEFAULT 'pending', 
        whatsapp_group_status TEXT NOT NULL DEFAULT 'pending',
        source TEXT NOT NULL DEFAULT 'walkin' 
      );

      CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id);
      CREATE INDEX IF NOT EXISTS idx_registrations_event ON registrations(event_id);
    `);
    this._save();
  }

  _save() {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      if (!fs.existsSync(path.dirname(this.dbPath))) {
        fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
      }
      fs.writeFileSync(this.dbPath, buffer);
    } catch (e) {
      console.error('Error saving db', e);
    }
  }

  pragma(p) {
    if(!this.db) return;
    try {
        this.db.run(`PRAGMA ${p}`);
    } catch(e) {}
  }

  exec(sql) {
    this.db.run(sql);
    this._save();
  }

  prepare(sql) {
    return new Statement(this, sql);
  }

  transaction(fn) {
    return (...args) => {
      this.db.run('BEGIN');
      try {
        const result = fn(...args);
        this.db.run('COMMIT');
        this._save();
        return result;
      } catch (err) {
        this.db.run('ROLLBACK');
        throw err;
      }
    };
  }
}

const wrapper = new DBWrapper();
module.exports = wrapper;
