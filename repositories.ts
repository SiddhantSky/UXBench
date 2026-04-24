import { nanoid } from 'nanoid';
import { getDb } from './schema';
import { DEFAULT_THEMES } from '../domain/default-themes';
import type {
  Project, ProjectMember, Theme, Site, Capture, Annotation,
  ThemeSynthesis, PerformanceReport, CaptureStateName, AnnotationSentiment,
} from '../domain/types';

const now = () => new Date().toISOString();
const newId = () => nanoid(12);

// ============================================================================
// Projects
// ============================================================================

export const Projects = {
  list(): Project[] {
    return getDb()
      .prepare('SELECT id, name, description, status, created_at as createdAt, updated_at as updatedAt FROM projects ORDER BY updated_at DESC')
      .all() as Project[];
  },

  get(id: string): Project | null {
    return getDb()
      .prepare('SELECT id, name, description, status, created_at as createdAt, updated_at as updatedAt FROM projects WHERE id = ?')
      .get(id) as Project | null;
  },

  create(input: { name: string; description?: string }): Project {
    const p: Project = {
      id: newId(),
      name: input.name,
      description: input.description,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    };
    const db = getDb();
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO projects (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(p.id, p.name, p.description ?? null, p.status, p.createdAt, p.updatedAt);
      // Seed default themes
      const insertTheme = db.prepare('INSERT INTO themes (id, project_id, name, description, order_index, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
      DEFAULT_THEMES.forEach((t, i) => {
        insertTheme.run(newId(), p.id, t.name, t.description, i, t.color, now());
      });
    });
    tx();
    return p;
  },

  update(id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'status'>>): Project | null {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch, updatedAt: now() };
    getDb()
      .prepare('UPDATE projects SET name = ?, description = ?, status = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.description ?? null, next.status, next.updatedAt, id);
    return next;
  },

  remove(id: string): boolean {
    return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
  },
};

// ============================================================================
// Themes
// ============================================================================

export const Themes = {
  listByProject(projectId: string): Theme[] {
    return getDb()
      .prepare('SELECT id, project_id as projectId, name, description, order_index as orderIndex, color, created_at as createdAt FROM themes WHERE project_id = ? ORDER BY order_index ASC')
      .all(projectId) as Theme[];
  },

  get(id: string): Theme | null {
    return getDb()
      .prepare('SELECT id, project_id as projectId, name, description, order_index as orderIndex, color, created_at as createdAt FROM themes WHERE id = ?')
      .get(id) as Theme | null;
  },

  create(input: { projectId: string; name: string; description?: string; color?: string; orderIndex?: number }): Theme {
    const existingCount = getDb().prepare('SELECT COUNT(*) as c FROM themes WHERE project_id = ?').get(input.projectId) as { c: number };
    const t: Theme = {
      id: newId(),
      projectId: input.projectId,
      name: input.name,
      description: input.description,
      orderIndex: input.orderIndex ?? existingCount.c,
      color: input.color,
      createdAt: now(),
    };
    getDb()
      .prepare('INSERT INTO themes (id, project_id, name, description, order_index, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(t.id, t.projectId, t.name, t.description ?? null, t.orderIndex, t.color ?? null, t.createdAt);
    return t;
  },

  update(id: string, patch: Partial<Pick<Theme, 'name' | 'description' | 'color' | 'orderIndex'>>): Theme | null {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    getDb()
      .prepare('UPDATE themes SET name = ?, description = ?, color = ?, order_index = ? WHERE id = ?')
      .run(next.name, next.description ?? null, next.color ?? null, next.orderIndex, id);
    return next;
  },

  remove(id: string): boolean {
    return getDb().prepare('DELETE FROM themes WHERE id = ?').run(id).changes > 0;
  },
};

// ============================================================================
// Sites
// ============================================================================

export const Sites = {
  listByProject(projectId: string): Site[] {
    return getDb()
      .prepare('SELECT id, project_id as projectId, name, url, sector, country, notes, created_at as createdAt FROM sites WHERE project_id = ? ORDER BY name ASC')
      .all(projectId) as Site[];
  },

  get(id: string): Site | null {
    return getDb()
      .prepare('SELECT id, project_id as projectId, name, url, sector, country, notes, created_at as createdAt FROM sites WHERE id = ?')
      .get(id) as Site | null;
  },

  create(input: { projectId: string; name: string; url: string; sector?: string; country?: string; notes?: string }): Site {
    const s: Site = {
      id: newId(),
      projectId: input.projectId,
      name: input.name,
      url: input.url,
      sector: input.sector,
      country: input.country,
      notes: input.notes,
      createdAt: now(),
    };
    getDb()
      .prepare('INSERT INTO sites (id, project_id, name, url, sector, country, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(s.id, s.projectId, s.name, s.url, s.sector ?? null, s.country ?? null, s.notes ?? null, s.createdAt);
    return s;
  },

  update(id: string, patch: Partial<Pick<Site, 'name' | 'url' | 'sector' | 'country' | 'notes'>>): Site | null {
    const current = this.get(id);
    if (!current) return null;
    const next = { ...current, ...patch };
    getDb()
      .prepare('UPDATE sites SET name = ?, url = ?, sector = ?, country = ?, notes = ? WHERE id = ?')
      .run(next.name, next.url, next.sector ?? null, next.country ?? null, next.notes ?? null, id);
    return next;
  },

  remove(id: string): boolean {
    return getDb().prepare('DELETE FROM sites WHERE id = ?').run(id).changes > 0;
  },
};

// ============================================================================
// Captures
// ============================================================================

export const Captures = {
  listBySite(siteId: string): Capture[] {
    return getDb()
      .prepare(`SELECT id, site_id as siteId, state_name as stateName, state_label as stateLabel,
                       url, title, screenshot_path as screenshotPath,
                       screenshot_width as screenshotWidth, screenshot_height as screenshotHeight,
                       captured_at as capturedAt, captured_by as capturedBy, method, notes
                FROM captures WHERE site_id = ? ORDER BY state_name, captured_at DESC`)
      .all(siteId) as Capture[];
  },

  get(id: string): Capture | null {
    return getDb()
      .prepare(`SELECT id, site_id as siteId, state_name as stateName, state_label as stateLabel,
                       url, title, screenshot_path as screenshotPath,
                       screenshot_width as screenshotWidth, screenshot_height as screenshotHeight,
                       captured_at as capturedAt, captured_by as capturedBy, method, notes
                FROM captures WHERE id = ?`)
      .get(id) as Capture | null;
  },

  create(input: Omit<Capture, 'id' | 'capturedAt'> & { capturedAt?: string }): Capture {
    const c: Capture = {
      id: newId(),
      capturedAt: input.capturedAt ?? now(),
      ...input,
    };
    getDb()
      .prepare(`INSERT INTO captures (id, site_id, state_name, state_label, url, title,
                                       screenshot_path, screenshot_width, screenshot_height,
                                       captured_at, captured_by, method, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(c.id, c.siteId, c.stateName, c.stateLabel, c.url, c.title ?? null,
           c.screenshotPath, c.screenshotWidth, c.screenshotHeight,
           c.capturedAt, c.capturedBy, c.method, c.notes ?? null);
    return c;
  },

  remove(id: string): boolean {
    return getDb().prepare('DELETE FROM captures WHERE id = ?').run(id).changes > 0;
  },
};

// ============================================================================
// Annotations
// ============================================================================

export const Annotations = {
  listByCapture(captureId: string): Annotation[] {
    const rows = getDb()
      .prepare(`SELECT id, capture_id as captureId, theme_id as themeId, sentiment,
                       rect_x, rect_y, rect_w, rect_h,
                       title, commentary, created_by as createdBy,
                       created_at as createdAt, updated_at as updatedAt
                FROM annotations WHERE capture_id = ? ORDER BY created_at ASC`)
      .all(captureId) as Array<Omit<Annotation, 'rect'> & { rect_x: number; rect_y: number; rect_w: number; rect_h: number }>;
    return rows.map((r) => ({
      id: r.id,
      captureId: r.captureId,
      themeId: r.themeId,
      sentiment: r.sentiment as AnnotationSentiment,
      rect: { x: r.rect_x, y: r.rect_y, width: r.rect_w, height: r.rect_h },
      title: r.title,
      commentary: r.commentary,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  },

  listByProject(projectId: string): Array<Annotation & { siteName: string; siteId: string; captureStateLabel: string; themeName: string }> {
    const rows = getDb()
      .prepare(`SELECT a.id, a.capture_id as captureId, a.theme_id as themeId, a.sentiment,
                       a.rect_x, a.rect_y, a.rect_w, a.rect_h,
                       a.title, a.commentary, a.created_by as createdBy,
                       a.created_at as createdAt, a.updated_at as updatedAt,
                       s.name as siteName, s.id as siteId,
                       c.state_label as captureStateLabel,
                       t.name as themeName
                FROM annotations a
                JOIN captures c ON c.id = a.capture_id
                JOIN sites s ON s.id = c.site_id
                JOIN themes t ON t.id = a.theme_id
                WHERE s.project_id = ?
                ORDER BY a.created_at DESC`)
      .all(projectId) as Array<any>;
    return rows.map((r) => ({
      id: r.id, captureId: r.captureId, themeId: r.themeId,
      sentiment: r.sentiment as AnnotationSentiment,
      rect: { x: r.rect_x, y: r.rect_y, width: r.rect_w, height: r.rect_h },
      title: r.title, commentary: r.commentary, createdBy: r.createdBy,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      siteName: r.siteName, siteId: r.siteId,
      captureStateLabel: r.captureStateLabel, themeName: r.themeName,
    }));
  },

  create(input: Omit<Annotation, 'id' | 'createdAt' | 'updatedAt'>): Annotation {
    const a: Annotation = { id: newId(), createdAt: now(), updatedAt: now(), ...input };
    getDb()
      .prepare(`INSERT INTO annotations (id, capture_id, theme_id, sentiment,
                                          rect_x, rect_y, rect_w, rect_h,
                                          title, commentary, created_by, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(a.id, a.captureId, a.themeId, a.sentiment,
           a.rect.x, a.rect.y, a.rect.width, a.rect.height,
           a.title, a.commentary, a.createdBy, a.createdAt, a.updatedAt);
    return a;
  },

  update(id: string, patch: Partial<Pick<Annotation, 'themeId' | 'sentiment' | 'rect' | 'title' | 'commentary'>>): Annotation | null {
    const current = getDb()
      .prepare(`SELECT id, capture_id as captureId, theme_id as themeId, sentiment,
                       rect_x, rect_y, rect_w, rect_h,
                       title, commentary, created_by as createdBy,
                       created_at as createdAt, updated_at as updatedAt
                FROM annotations WHERE id = ?`).get(id) as any;
    if (!current) return null;
    const next: Annotation = {
      id: current.id,
      captureId: current.captureId,
      themeId: patch.themeId ?? current.themeId,
      sentiment: patch.sentiment ?? current.sentiment,
      rect: patch.rect ?? { x: current.rect_x, y: current.rect_y, width: current.rect_w, height: current.rect_h },
      title: patch.title ?? current.title,
      commentary: patch.commentary ?? current.commentary,
      createdBy: current.createdBy,
      createdAt: current.createdAt,
      updatedAt: now(),
    };
    getDb()
      .prepare(`UPDATE annotations SET theme_id = ?, sentiment = ?, rect_x = ?, rect_y = ?, rect_w = ?, rect_h = ?,
                                         title = ?, commentary = ?, updated_at = ? WHERE id = ?`)
      .run(next.themeId, next.sentiment, next.rect.x, next.rect.y, next.rect.width, next.rect.height,
           next.title, next.commentary, next.updatedAt, id);
    return next;
  },

  remove(id: string): boolean {
    return getDb().prepare('DELETE FROM annotations WHERE id = ?').run(id).changes > 0;
  },
};

// ============================================================================
// Theme syntheses
// ============================================================================

export const Syntheses = {
  getByProjectAndTheme(projectId: string, themeId: string): ThemeSynthesis | null {
    const row = getDb()
      .prepare(`SELECT id, project_id as projectId, theme_id as themeId,
                       learnings, suggested_features as suggestedFeatures, summary,
                       last_edited_by as lastEditedBy, updated_at as updatedAt
                FROM theme_syntheses WHERE project_id = ? AND theme_id = ?`)
      .get(projectId, themeId) as ThemeSynthesis | null;
    return row;
  },

  listByProject(projectId: string): ThemeSynthesis[] {
    return getDb()
      .prepare(`SELECT id, project_id as projectId, theme_id as themeId,
                       learnings, suggested_features as suggestedFeatures, summary,
                       last_edited_by as lastEditedBy, updated_at as updatedAt
                FROM theme_syntheses WHERE project_id = ?`)
      .all(projectId) as ThemeSynthesis[];
  },

  upsert(input: { projectId: string; themeId: string; learnings: string; suggestedFeatures: string; summary: string; lastEditedBy?: string }): ThemeSynthesis {
    const existing = this.getByProjectAndTheme(input.projectId, input.themeId);
    const s: ThemeSynthesis = {
      id: existing?.id ?? newId(),
      projectId: input.projectId,
      themeId: input.themeId,
      learnings: input.learnings,
      suggestedFeatures: input.suggestedFeatures,
      summary: input.summary,
      lastEditedBy: input.lastEditedBy,
      updatedAt: now(),
    };
    getDb()
      .prepare(`INSERT INTO theme_syntheses (id, project_id, theme_id, learnings, suggested_features, summary, last_edited_by, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, theme_id) DO UPDATE SET
                  learnings = excluded.learnings,
                  suggested_features = excluded.suggested_features,
                  summary = excluded.summary,
                  last_edited_by = excluded.last_edited_by,
                  updated_at = excluded.updated_at`)
      .run(s.id, s.projectId, s.themeId, s.learnings, s.suggestedFeatures, s.summary, s.lastEditedBy ?? null, s.updatedAt);
    return s;
  },
};

// ============================================================================
// Performance reports
// ============================================================================

export const PerformanceReports = {
  listBySite(siteId: string): PerformanceReport[] {
    const rows = getDb()
      .prepare('SELECT id, site_id as siteId, captured_at as capturedAt, payload FROM performance_reports WHERE site_id = ? ORDER BY captured_at DESC')
      .all(siteId) as Array<{ id: string; siteId: string; capturedAt: string; payload: string }>;
    return rows.map((r) => ({ id: r.id, siteId: r.siteId, capturedAt: r.capturedAt, ...JSON.parse(r.payload) }));
  },

  latestForSite(siteId: string): PerformanceReport | null {
    const rows = this.listBySite(siteId);
    return rows[0] ?? null;
  },

  save(report: Omit<PerformanceReport, 'id'>): PerformanceReport {
    const r: PerformanceReport = { id: newId(), ...report };
    const { id, siteId, capturedAt, ...payload } = r;
    getDb()
      .prepare('INSERT INTO performance_reports (id, site_id, captured_at, payload) VALUES (?, ?, ?, ?)')
      .run(id, siteId, capturedAt, JSON.stringify(payload));
    return r;
  },
};
