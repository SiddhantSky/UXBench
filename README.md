# UX Research Platform (v0.2)

A small collaborative tool for qualitative UX benchmarking studies — the kind of project where 2–5 researchers look at a set of reference sites, annotate screenshots, and converge on themes and recommendations.

Modelled on the shape of the FTA Secondary Research Outcome Report: themes, per-site deep dives with annotated screenshots ("Nice", "Confusing", "Easily scannable"), and per-theme syntheses (Learnings / Suggested Features / Summary).

This is a **working scaffold**, not a finished product. See *Honest scope notes* below.

---

## What it does

1. **Projects** hold a set of sites, themes, captures, and annotations.
2. **Sites** are the benchmark targets. Each site has one or more **captures** — a capture is a named page state (homepage, services catalog, search results, contact) with screenshot + page HTML + performance metrics.
3. **Annotations** are rectangles drawn on a capture with title + commentary + theme tag + sentiment (positive / neutral / negative). This is the core of the research.
4. **Theme syntheses** aggregate the annotations for one theme across all sites into Learnings / Suggested Features / Summary sections — drafted by the team, with a Claude-assisted first draft.
5. **Report** view assembles everything into an interactive web report.

---

## Architecture at a glance

```
┌──────────────────────────────────────┐
│  Browser (React via CDN, no build)   │
│  Dashboard · Project · Workspace ·   │
│  Syntheses · Report                  │
└──────────────┬───────────────────────┘
               │ /api/*  (JSON)
               │ /screenshots/*  (static)
┌──────────────▼───────────────────────┐
│  Fastify server (TypeScript)         │
│  routes/api.ts                       │
├──────────────────────────────────────┤
│  repositories  ·  capture engine     │
│  ai client     ·  domain types       │
├──────────────────────────────────────┤
│  SQLite (better-sqlite3, WAL)        │
│  Filesystem: server/data/screenshots │
└──────────────┬───────────────────────┘
               │
      ┌────────┴────────┐
      ▼                 ▼
  Playwright        Anthropic API
  (captures +       (tag suggest,
   axe + perf)      synthesis drafts)
```

### Module map

| Path | Role |
|---|---|
| `server/src/index.ts` | Fastify entry, static file serving, CORS |
| `server/src/config/index.ts` | Zod-validated env loader; exports `hasAI` flag |
| `server/src/domain/types.ts` | Domain contracts — Project, Site, Capture, Annotation, Theme, Synthesis, PerformanceReport |
| `server/src/domain/default-themes.ts` | The 11 FTA themes seeded into each new project |
| `server/src/db/schema.ts` | SQLite init, tables, FK constraints |
| `server/src/db/repositories.ts` | All CRUD — project creation seeds themes in a tx |
| `server/src/capture/engine.ts` | Playwright capture plan (named states) + axe + Core Web Vitals + tech detection + security headers |
| `server/src/ai/client.ts` | Anthropic SDK wrapper — `suggestTagging`, `draftThemeSynthesis` |
| `server/src/routes/api.ts` | REST endpoints |
| `web/public/index.html` | Shell + CSS (~400 lines, dark theme) |
| `web/public/app.js` | Entire React frontend (~1300 lines, single file, Babel-in-browser) |

### API surface

```
GET    /api/health

GET    /api/projects
POST   /api/projects
GET    /api/projects/:id
DELETE /api/projects/:id

GET    /api/projects/:id/themes
POST   /api/projects/:id/themes
PATCH  /api/themes/:id
DELETE /api/themes/:id

GET    /api/projects/:id/sites
POST   /api/projects/:id/sites
DELETE /api/sites/:id
GET    /api/sites/:id/captures
POST   /api/sites/:id/capture         ← triggers Playwright capture (30–60s, blocks)
GET    /api/sites/:id/performance

GET    /api/captures/:id/annotations
POST   /api/captures/:id/annotations
PATCH  /api/annotations/:id
DELETE /api/annotations/:id
GET    /api/projects/:id/annotations  ← joined, for syntheses/report

GET    /api/projects/:id/themes/:themeId/synthesis
PUT    /api/projects/:id/themes/:themeId/synthesis

POST   /api/ai/suggest-tag            ← Claude picks a theme + sentiment
POST   /api/ai/draft-synthesis        ← Claude drafts Learnings/Features/Summary

GET    /api/projects/:id/report       ← full bundle for report view
```

---

## Setup

**Requirements:** Node.js 20+, ~300MB disk for Playwright's Chromium.

```bash
npm install
npx playwright install chromium
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY for AI features
npm run dev
```

Open `http://localhost:3000`. First load is slow (~600ms) because Babel compiles JSX in the browser — see *Upgrade paths* for the fix.

### Environment variables

| Var | Required | Purpose |
|---|---|---|
| `PORT` | no (default 3000) | HTTP port |
| `DATABASE_PATH` | no (default `./server/data/platform.db`) | SQLite file |
| `SCREENSHOTS_DIR` | no (default `./server/data/screenshots`) | Where captures land |
| `ANTHROPIC_API_KEY` | **yes for AI features** | Without it, `/api/ai/*` endpoints 503 and the AI buttons stay disabled |
| `CAPTURE_TIMEOUT_MS` | no (default 30000) | Per-state timeout in Playwright |
| `CAPTURE_VIEWPORT_WIDTH` / `_HEIGHT` | no (1440 × 900) | Viewport for captures |

---

## Usage flow

1. **Create a project.** It auto-seeds with 11 FTA themes. Edit / add / remove themes as needed.
2. **Add sites** (URL + display name) on the Sites tab.
3. **Run capture** on each site. The engine visits a default plan — homepage, services catalog, about, contact — and for each one it saves a full-page PNG, the rendered HTML, plus performance metrics (axe accessibility, Core Web Vitals, tech detection, security headers). Currently blocking: expect 30–60s per site.
4. **Annotate.** Click a capture to open the annotation workspace. Draw a rectangle on the screenshot; fill in title + commentary; tag a theme; set sentiment. "Suggest with AI" sends the title+commentary to Claude and gets back a theme + sentiment + rationale suggestion — you're still in control.
5. **Synthesise.** On the Syntheses tab, pick a theme — you see every annotation against it across all sites. Write Learnings / Suggested Features / Summary, or click "Draft with AI" to get Claude to do a first pass from the annotations. Edit and save.
6. **Report** tab assembles everything into a single interactive page.

---

## Honest scope notes

This is a v0.2 **scaffold**. What that means in practice:

**End-to-end working:**
- Full CRUD on projects / themes / sites / captures / annotations / syntheses
- Capture engine (Playwright + axe + Core Web Vitals + tech detection + security headers)
- Annotation workspace — draw rectangles, edit, delete, with AI tag suggestions
- Claude-drafted synthesis from real annotation content
- Web report view with markdown rendering

**Intentionally minimal:**
- **Auth:** a `localStorage` display-name prompt. Anyone who can reach the server is a user. Fine for a trusted small team on a VPN or localhost; not fine for the open internet. Add real auth (e.g. a reverse proxy + SSO, or @fastify/auth with sessions) before exposing this.
- **Concurrency:** last-write-wins. Two people editing the same annotation simultaneously — the later save clobbers. A 2–5 person team can coordinate around this; don't expect Google Docs behaviour.
- **Capture is blocking.** The HTTP request for `POST /api/sites/:id/capture` stays open for the full 30–60s. For production: queue with BullMQ or similar, return a job id, poll or websocket for updates.
- **Lighthouse integration is stubbed.** The engine collects Core Web Vitals directly via the browser's `PerformanceObserver` (which is most of what Lighthouse would tell you anyway), but the formal Lighthouse run with Performance / SEO / Best Practices scores is a TODO — see the comment in `capture/engine.ts`. The plumbing is there; it needs `chrome-launcher` + `lighthouse` wired up.
- **No PPTX export.** Web report only. PowerPoint generation via `pptxgenjs` is sketched as a v2 deliverable — the report-bundle endpoint already returns a shape that's close to what a generator would consume.
- **Tech detection is starter-grade** — known library fingerprints only, no Wappalyzer.
- **Frontend uses Babel in the browser.** ~600ms cold start. Zero build step was the tradeoff. When this becomes annoying, migrate to Vite — the code is idiomatic React, no weird compromises, the port is mechanical.
- **No tests.** Types give you a safety net on the backend; there are no unit or integration tests. First tests to add: `repositories.ts` (pure, easy), then API routes with supertest.
- **Visual polish is functional, not branded.** FTA's report has a gold hex pattern, navy accents, specific typography. This uses a generic dark theme with a purple accent. Brand it when you know the actual customer.

**What this is good for:**
- Kicking off an actual research project: get 2–3 sites captured and annotated in an afternoon, use the AI drafts as a straw man for team discussion.
- Demoing the shape of the tool to stakeholders.
- A foundation to extend — the domain model and API are honest and reasonable.

**What this is not:**
- A production SaaS.
- A replacement for researcher judgement. AI tag suggestions and draft syntheses are starting points. Real researchers catch things Claude won't: ambiguous flows, cultural mismatches, specific regulatory mental models. The tool is there to speed up the rote parts (rectangle-drawing, cross-site aggregation, first-draft summarising), not to replace the work.

---

## Upgrade paths, in rough order of priority

1. **Real auth** — `@fastify/cookie` + session store, or put it behind an SSO reverse proxy.
2. **Background capture jobs** — BullMQ + Redis, or a simple in-process queue + SSE/WS for progress. Unblocks parallel site capture.
3. **Vite frontend** — delete the `<script type="text/babel">` setup, `npm create vite@latest web`, move `app.js` → `src/` split into components. Mechanical port, ~half a day.
4. **Real-time collaboration** — Yjs or Automerge over WS for the annotation doc. Non-trivial but well-trodden.
5. **PPTX export** — `pptxgenjs` with a slide template per theme + per site. The `/api/projects/:id/report` bundle already has the right shape.
6. **Proper Lighthouse integration** — `chrome-launcher` + `lighthouse` node API, write results into the `performance_reports` table under a `lighthouse` payload key.
7. **Tests** — start with repositories, then API routes.

---

## Relationship to v0.1

v0.1 was an automated quantitative UX auditor (Lighthouse + axe + Core Web Vitals + tech stack → composite score → dashboard report). That work lives on inside this platform as the **capture engine** — every site capture now produces a performance report that v0.1 would have produced on its own. The v0.1 dashboard shape feeds the per-site performance panel in the Report tab.

The re-scope from v0.1 to v0.2 happened after reading the FTA report: the actual deliverable for this kind of work is **qualitative and theme-based**, not a number on a dashboard. Performance metrics are context for the qualitative findings, not the headline.
