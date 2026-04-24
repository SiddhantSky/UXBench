import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  Projects, Themes, Sites, Captures, Annotations, Syntheses, PerformanceReports,
} from '../db/repositories';
import { CaptureEngine } from '../capture/engine';
import { suggestTagging, draftThemeSynthesis } from '../ai/client';
import { hasAI } from '../config';

export const apiRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {

  app.get('/health', async () => ({ ok: true, aiEnabled: hasAI }));

  // ===== Projects =====

  app.get('/projects', async () => Projects.list());

  app.get('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = Projects.get(id);
    if (!project) return reply.code(404).send({ error: 'Not found' });
    return project;
  });

  app.post('/projects', async (req, reply) => {
    const schema = z.object({ name: z.string().min(1), description: z.string().optional() });
    const input = schema.parse(req.body);
    return reply.code(201).send(Projects.create(input));
  });

  app.patch('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ name: z.string().optional(), description: z.string().optional(), status: z.enum(['active', 'archived']).optional() });
    const updated = Projects.update(id, schema.parse(req.body));
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  app.delete('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return Projects.remove(id) ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' });
  });

  // ===== Themes =====

  app.get('/projects/:projectId/themes', async (req) => {
    const { projectId } = req.params as { projectId: string };
    return Themes.listByProject(projectId);
  });

  app.post('/projects/:projectId/themes', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const schema = z.object({ name: z.string().min(1), description: z.string().optional(), color: z.string().optional(), orderIndex: z.number().optional() });
    const input = schema.parse(req.body);
    return reply.code(201).send(Themes.create({ projectId, ...input }));
  });

  app.patch('/themes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({ name: z.string().optional(), description: z.string().optional(), color: z.string().optional(), orderIndex: z.number().optional() });
    const updated = Themes.update(id, schema.parse(req.body));
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  app.delete('/themes/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return Themes.remove(id) ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' });
  });

  // ===== Sites =====

  app.get('/projects/:projectId/sites', async (req) => {
    const { projectId } = req.params as { projectId: string };
    return Sites.listByProject(projectId);
  });

  app.get('/sites/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const site = Sites.get(id);
    if (!site) return reply.code(404).send({ error: 'Not found' });
    return site;
  });

  app.post('/projects/:projectId/sites', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const schema = z.object({
      name: z.string().min(1), url: z.string().url(),
      sector: z.string().optional(), country: z.string().optional(), notes: z.string().optional(),
    });
    const input = schema.parse(req.body);
    return reply.code(201).send(Sites.create({ projectId, ...input }));
  });

  app.patch('/sites/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({
      name: z.string().optional(), url: z.string().url().optional(),
      sector: z.string().optional(), country: z.string().optional(), notes: z.string().optional(),
    });
    const updated = Sites.update(id, schema.parse(req.body));
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  app.delete('/sites/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return Sites.remove(id) ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' });
  });

  // ===== Captures =====

  app.get('/sites/:siteId/captures', async (req) => {
    const { siteId } = req.params as { siteId: string };
    return Captures.listBySite(siteId);
  });

  app.get('/captures/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const capture = Captures.get(id);
    if (!capture) return reply.code(404).send({ error: 'Not found' });
    return capture;
  });

  app.delete('/captures/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return Captures.remove(id) ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' });
  });

  /**
   * Run automated capture for a site.
   * This is synchronous from HTTP's perspective, but slow — expect 30-60s per site
   * depending on the capture plan. A production system would run it as a background
   * job with polling/websocket progress. For a 2-5 person team, a spinner is fine.
   */
  app.post('/sites/:siteId/capture', async (req, reply) => {
    const { siteId } = req.params as { siteId: string };
    const site = Sites.get(siteId);
    if (!site) return reply.code(404).send({ error: 'Site not found' });

    const schema = z.object({ includePerformance: z.boolean().optional(), capturedBy: z.string().optional() });
    const input = schema.parse(req.body ?? {});

    const engine = new CaptureEngine();
    try {
      await engine.start();
      const result = await engine.captureSite(site, {
        includePerformance: input.includePerformance ?? true,
        capturedBy: input.capturedBy ?? 'auto',
        onProgress: (msg) => app.log.info(msg),
      });
      return { captures: result.captures, performance: result.performance };
    } finally {
      await engine.stop();
    }
  });

  // ===== Annotations =====

  app.get('/captures/:captureId/annotations', async (req) => {
    const { captureId } = req.params as { captureId: string };
    return Annotations.listByCapture(captureId);
  });

  app.get('/projects/:projectId/annotations', async (req) => {
    const { projectId } = req.params as { projectId: string };
    return Annotations.listByProject(projectId);
  });

  app.post('/captures/:captureId/annotations', async (req, reply) => {
    const { captureId } = req.params as { captureId: string };
    const schema = z.object({
      themeId: z.string(),
      sentiment: z.enum(['positive', 'negative', 'neutral']),
      rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
      title: z.string().min(1),
      commentary: z.string(),
      createdBy: z.string().min(1),
    });
    const input = schema.parse(req.body);
    return reply.code(201).send(Annotations.create({ captureId, ...input }));
  });

  app.patch('/annotations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const schema = z.object({
      themeId: z.string().optional(),
      sentiment: z.enum(['positive', 'negative', 'neutral']).optional(),
      rect: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
      title: z.string().optional(),
      commentary: z.string().optional(),
    });
    const updated = Annotations.update(id, schema.parse(req.body));
    if (!updated) return reply.code(404).send({ error: 'Not found' });
    return updated;
  });

  app.delete('/annotations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return Annotations.remove(id) ? reply.code(204).send() : reply.code(404).send({ error: 'Not found' });
  });

  // ===== Theme syntheses =====

  app.get('/projects/:projectId/syntheses', async (req) => {
    const { projectId } = req.params as { projectId: string };
    return Syntheses.listByProject(projectId);
  });

  app.get('/projects/:projectId/themes/:themeId/synthesis', async (req) => {
    const { projectId, themeId } = req.params as { projectId: string; themeId: string };
    return Syntheses.getByProjectAndTheme(projectId, themeId) ?? {
      id: '', projectId, themeId, learnings: '', suggestedFeatures: '', summary: '', updatedAt: '',
    };
  });

  app.put('/projects/:projectId/themes/:themeId/synthesis', async (req) => {
    const { projectId, themeId } = req.params as { projectId: string; themeId: string };
    const schema = z.object({
      learnings: z.string(), suggestedFeatures: z.string(), summary: z.string(),
      lastEditedBy: z.string().optional(),
    });
    const input = schema.parse(req.body);
    return Syntheses.upsert({ projectId, themeId, ...input });
  });

  // ===== AI-assist =====

  app.post('/ai/suggest-tag', async (req, reply) => {
    if (!hasAI) return reply.code(503).send({ error: 'AI not configured. Set ANTHROPIC_API_KEY in .env.' });
    const schema = z.object({
      projectId: z.string(),
      title: z.string(),
      commentary: z.string(),
      siteContext: z.string().optional(),
    });
    const input = schema.parse(req.body);
    const themes = Themes.listByProject(input.projectId);
    return suggestTagging({ title: input.title, commentary: input.commentary, siteContext: input.siteContext }, themes);
  });

  app.post('/ai/draft-synthesis', async (req, reply) => {
    if (!hasAI) return reply.code(503).send({ error: 'AI not configured. Set ANTHROPIC_API_KEY in .env.' });
    const schema = z.object({ projectId: z.string(), themeId: z.string() });
    const { projectId, themeId } = schema.parse(req.body);
    const theme = Themes.get(themeId);
    if (!theme) return reply.code(404).send({ error: 'Theme not found' });

    const all = Annotations.listByProject(projectId).filter((a) => a.themeId === themeId);
    const draft = await draftThemeSynthesis({
      themeName: theme.name,
      themeDescription: theme.description,
      annotations: all.map((a) => ({
        siteName: a.siteName,
        sentiment: a.sentiment,
        title: a.title,
        commentary: a.commentary,
        captureLabel: a.captureStateLabel,
      })),
    });
    return draft;
  });

  // ===== Report bundle =====

  app.get('/projects/:projectId/report', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const project = Projects.get(projectId);
    if (!project) return reply.code(404).send({ error: 'Not found' });

    const themes = Themes.listByProject(projectId);
    const sites = Sites.listByProject(projectId);
    const syntheses = Syntheses.listByProject(projectId);
    const annotations = Annotations.listByProject(projectId);
    const capturesBySite: Record<string, any[]> = {};
    const performanceBySite: Record<string, any> = {};
    for (const site of sites) {
      capturesBySite[site.id] = Captures.listBySite(site.id);
      const latestPerf = PerformanceReports.latestForSite(site.id);
      if (latestPerf) performanceBySite[site.id] = latestPerf;
    }

    return { project, themes, sites, syntheses, annotations, capturesBySite, performanceBySite };
  });

  // ===== Performance reports =====

  app.get('/sites/:siteId/performance', async (req) => {
    const { siteId } = req.params as { siteId: string };
    return PerformanceReports.listBySite(siteId);
  });
};
