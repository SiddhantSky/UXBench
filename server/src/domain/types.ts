/**
 * Domain types for the UX benchmarking research platform.
 *
 * Model:
 *   Project -> Themes, Sites, Members
 *   Site -> Captures (screenshots of named states) -> Annotations
 *   Annotation -> tagged to a Theme with sentiment + commentary
 *   ThemeSynthesis -> per-theme narrative (Learnings, Suggested Features, Summary)
 *   PerformanceReport -> add-on quantitative data per site (Lighthouse, axe, etc.)
 */

// ============================================================================
// Project
// ============================================================================

export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  displayName: string;
  role: 'researcher' | 'reviewer';
  createdAt: string;
}

// ============================================================================
// Themes (the 11 FTA defaults ship as seed, editable per project)
// ============================================================================

export interface Theme {
  id: string;
  projectId: string;
  name: string;              // e.g. "Navigation", "Search"
  description?: string;
  orderIndex: number;
  color?: string;            // hex — used in annotation pins
  createdAt: string;
}

// ============================================================================
// Sites (the properties being benchmarked)
// ============================================================================

export interface Site {
  id: string;
  projectId: string;
  name: string;              // e.g. "ZATCA — Saudi Arabia"
  url: string;
  sector?: string;           // e.g. "government", "banking"
  country?: string;
  notes?: string;
  createdAt: string;
}

// ============================================================================
// Captures — screenshots of named states
// ============================================================================

export type CaptureStateName =
  | 'homepage'
  | 'search'
  | 'services_catalog'
  | 'service_detail'
  | 'contact'
  | 'about'
  | 'forms'
  | 'knowledge_centre'
  | 'tools_calculators'
  | 'login'
  | 'custom';

export interface Capture {
  id: string;
  siteId: string;
  stateName: CaptureStateName;
  stateLabel: string;        // human-friendly label, e.g. "Services catalog"
  url: string;
  title?: string;
  screenshotPath: string;    // relative to SCREENSHOTS_DIR
  screenshotWidth: number;
  screenshotHeight: number;
  capturedAt: string;
  capturedBy: 'auto' | string; // 'auto' or a member displayName
  method: 'automated' | 'manual';
  notes?: string;
}

// ============================================================================
// Annotations — researcher callouts on a capture
// ============================================================================

export type AnnotationSentiment = 'positive' | 'negative' | 'neutral';

export interface Annotation {
  id: string;
  captureId: string;
  themeId: string;
  sentiment: AnnotationSentiment;
  // Rectangle on the screenshot, in image-space pixels
  rect: { x: number; y: number; width: number; height: number };
  title: string;              // short — e.g. "Confusing nav label"
  commentary: string;         // longer explanation
  createdBy: string;          // member displayName
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Theme synthesis — the per-theme narrative (Learnings / Features / Summary)
// ============================================================================

export interface ThemeSynthesis {
  id: string;
  projectId: string;
  themeId: string;
  learnings: string;           // markdown — numbered learnings
  suggestedFeatures: string;   // markdown — recommendations with rationale
  summary: string;             // markdown — thematic summary
  lastEditedBy?: string;
  updatedAt: string;
}

// ============================================================================
// Performance add-on (shrunk-down version of v0.1's collector data)
// ============================================================================

export interface PerformanceReport {
  id: string;
  siteId: string;
  capturedAt: string;
  lighthouse?: {
    performance: number;
    accessibility: number;
    bestPractices: number;
    seo: number;
  };
  coreWebVitals?: {
    lcp?: number;
    fcp?: number;
    cls?: number;
    ttfb?: number;
  };
  accessibility?: {
    violationCount: number;
    criticalCount: number;
    seriousCount: number;
    score: number;
    topRules: Array<{ id: string; help: string; impact: string; nodeCount: number }>;
  };
  techStack?: {
    detected: Array<{ name: string; category: string }>;
    trackers: Array<{ name: string; category: string }>;
    securityHeaders: {
      csp: boolean; hsts: boolean; xFrameOptions: boolean;
      xContentTypeOptions: boolean; referrerPolicy: boolean; permissionsPolicy: boolean;
      score: number;
    };
  };
  errors: string[];
}

// ============================================================================
// DB row shapes (internal) — differ from domain types because SQLite
// stores dates/JSON as strings
// ============================================================================

export interface DbRow {
  [key: string]: string | number | null;
}
