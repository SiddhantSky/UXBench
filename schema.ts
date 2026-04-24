import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let db: Database.Database | null = null;

export function initDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const d = new Database(dbPath);
  d.pragma('journal_mode = WAL');
  d.pragma('foreign_keys = ON');

  d.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id           TEXT PRIMARY KEY,
      project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'researcher',
      created_at   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_members_project ON project_members(project_id);

    CREATE TABLE IF NOT EXISTS themes (
      id          TEXT PRIMARY KEY,
      project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL DEFAULT 0,
      color       TEXT,
      created_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_themes_project ON themes(project_id);

    CREATE TABLE IF NOT EXISTS sites (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      url        TEXT NOT NULL,
      sector     TEXT,
      country    TEXT,
      notes      TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sites_project ON sites(project_id);

    CREATE TABLE IF NOT EXISTS captures (
      id                  TEXT PRIMARY KEY,
      site_id             TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      state_name          TEXT NOT NULL,
      state_label         TEXT NOT NULL,
      url                 TEXT NOT NULL,
      title               TEXT,
      screenshot_path     TEXT NOT NULL,
      screenshot_width    INTEGER NOT NULL,
      screenshot_height   INTEGER NOT NULL,
      captured_at         TEXT NOT NULL,
      captured_by         TEXT NOT NULL,
      method              TEXT NOT NULL,
      notes               TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_captures_site ON captures(site_id);

    CREATE TABLE IF NOT EXISTS annotations (
      id          TEXT PRIMARY KEY,
      capture_id  TEXT NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
      theme_id    TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      sentiment   TEXT NOT NULL,
      rect_x      REAL NOT NULL,
      rect_y      REAL NOT NULL,
      rect_w      REAL NOT NULL,
      rect_h      REAL NOT NULL,
      title       TEXT NOT NULL,
      commentary  TEXT NOT NULL,
      created_by  TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      updated_at  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_capture ON annotations(capture_id);
    CREATE INDEX IF NOT EXISTS idx_annotations_theme   ON annotations(theme_id);

    CREATE TABLE IF NOT EXISTS theme_syntheses (
      id                 TEXT PRIMARY KEY,
      project_id         TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      theme_id           TEXT NOT NULL REFERENCES themes(id) ON DELETE CASCADE,
      learnings          TEXT NOT NULL DEFAULT '',
      suggested_features TEXT NOT NULL DEFAULT '',
      summary            TEXT NOT NULL DEFAULT '',
      last_edited_by     TEXT,
      updated_at         TEXT NOT NULL,
      UNIQUE(project_id, theme_id)
    );

    CREATE TABLE IF NOT EXISTS performance_reports (
      id           TEXT PRIMARY KEY,
      site_id      TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      captured_at  TEXT NOT NULL,
      payload      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_perf_site ON performance_reports(site_id);
  `);

  db = d;
  return d;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDb() first');
  return db;
}

export function closeDb() {
  if (db) { db.close(); db = null; }
}
