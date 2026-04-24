import { chromium, Browser, Page } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { Captures, PerformanceReports } from '../db/repositories';
import type { CaptureStateName, Capture, PerformanceReport, Site } from '../domain/types';

/**
 * Named-state capture plan. Each site gets these states captured (best-effort).
 * URL resolution uses conventions + sitemap fallback.
 */
export interface CapturePlanEntry {
  stateName: CaptureStateName;
  stateLabel: string;
  /** URL or path; if path, resolved against site.url origin */
  target: string;
  /** Optional pre-capture action, e.g. type into search box then press enter */
  action?: (page: Page) => Promise<void>;
}

export const DEFAULT_CAPTURE_PLAN: CapturePlanEntry[] = [
  { stateName: 'homepage', stateLabel: 'Homepage', target: '/' },
  { stateName: 'services_catalog', stateLabel: 'Services catalogue', target: '/services' },
  { stateName: 'about', stateLabel: 'About', target: '/about' },
  { stateName: 'contact', stateLabel: 'Contact', target: '/contact' },
];

export interface CaptureOptions {
  includePerformance?: boolean;
  plan?: CapturePlanEntry[];
  capturedBy?: string;
  onProgress?: (msg: string) => void;
}

export class CaptureEngine {
  private browser: Browser | null = null;

  async start() {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: config.browser.headless,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });
  }

  async stop() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /** Capture all planned states for a site. Returns captures in creation order. */
  async captureSite(site: Site, opts: CaptureOptions = {}): Promise<{ captures: Capture[]; performance?: PerformanceReport }> {
    if (!this.browser) await this.start();
    const plan = opts.plan ?? DEFAULT_CAPTURE_PLAN;
    const captures: Capture[] = [];
    const progress = opts.onProgress ?? (() => {});

    fs.mkdirSync(path.resolve(config.screenshotsDir), { recursive: true });

    for (const entry of plan) {
      progress(`Capturing ${entry.stateLabel} for ${site.name}`);
      try {
        const cap = await this.captureState(site, entry, opts.capturedBy ?? 'auto');
        if (cap) captures.push(cap);
      } catch (err) {
        progress(`  Failed: ${(err as Error).message}`);
      }
    }

    let performance: PerformanceReport | undefined;
    if (opts.includePerformance) {
      progress(`Collecting performance data for ${site.name}`);
      try {
        performance = await this.collectPerformance(site);
      } catch (err) {
        progress(`  Performance collection failed: ${(err as Error).message}`);
      }
    }

    return { captures, performance };
  }

  private async captureState(site: Site, entry: CapturePlanEntry, capturedBy: string): Promise<Capture | null> {
    const context = await this.browser!.newContext({
      viewport: config.browser.viewport,
      userAgent: 'UXBenchmarkBot/0.2 (+research)',
    });
    const page = await context.newPage();
    page.setDefaultTimeout(config.browser.timeoutMs);

    try {
      const url = this.resolveUrl(site.url, entry.target);
      const response = await page.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
      if (!response || !response.ok()) {
        return null; // State not reachable; skip gracefully
      }
      if (entry.action) await entry.action(page);

      const title = await page.title().catch(() => undefined);
      const viewport = page.viewportSize() ?? config.browser.viewport;
      const filename = `${site.id}-${entry.stateName}-${Date.now()}.png`;
      const absPath = path.join(path.resolve(config.screenshotsDir), filename);
      await page.screenshot({ path: absPath, fullPage: true });

      // Read back dimensions of the full-page screenshot
      const screenshotDims = await page.evaluate(() => ({
        w: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        h: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      }));

      return Captures.create({
        siteId: site.id,
        stateName: entry.stateName,
        stateLabel: entry.stateLabel,
        url,
        title,
        screenshotPath: filename,
        screenshotWidth: screenshotDims.w || viewport.width,
        screenshotHeight: screenshotDims.h || viewport.height,
        capturedBy,
        method: 'automated',
      });
    } finally {
      await context.close();
    }
  }

  /**
   * Performance add-on. Collects Lighthouse scores, Core Web Vitals, axe
   * violations, and tech-stack signals for the homepage only (v1 scope).
   *
   * Lighthouse is lazy-imported because it's heavy and optional.
   */
  private async collectPerformance(site: Site): Promise<PerformanceReport> {
    const context = await this.browser!.newContext({
      viewport: config.browser.viewport,
      userAgent: 'UXBenchmarkBot/0.2 (+research)',
    });
    const page = await context.newPage();
    const errors: string[] = [];

    const report: Omit<PerformanceReport, 'id'> = {
      siteId: site.id,
      capturedAt: new Date().toISOString(),
      errors,
    };

    try {
      await page.goto(site.url, { waitUntil: 'networkidle', timeout: config.browser.timeoutMs });
    } catch (err) {
      errors.push(`navigation: ${(err as Error).message}`);
      await context.close();
      return PerformanceReports.save(report);
    }

    // --- Core Web Vitals (from live page) ---
    try {
      report.coreWebVitals = await this.captureVitals(page);
    } catch (err) {
      errors.push(`vitals: ${(err as Error).message}`);
    }

    // --- axe accessibility ---
    try {
      const axeResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze();
      const violations = axeResults.violations;
      const weights = { critical: 15, serious: 8, moderate: 3, minor: 1 } as const;
      const deduction = violations.reduce(
        (s, v) => s + (weights[(v.impact ?? 'minor') as keyof typeof weights] * Math.min(v.nodes.length, 5)),
        0,
      );
      report.accessibility = {
        violationCount: violations.length,
        criticalCount: violations.filter((v) => v.impact === 'critical').length,
        seriousCount: violations.filter((v) => v.impact === 'serious').length,
        score: Math.max(0, 100 - deduction),
        topRules: violations.slice(0, 10).map((v) => ({
          id: v.id, help: v.help, impact: v.impact ?? 'minor', nodeCount: v.nodes.length,
        })),
      };
    } catch (err) {
      errors.push(`axe: ${(err as Error).message}`);
    }

    // --- Tech stack + security headers ---
    try {
      report.techStack = await this.collectTech(page, site.url);
    } catch (err) {
      errors.push(`techStack: ${(err as Error).message}`);
    }

    // --- Lighthouse (optional; stubbed with clear implementation note) ---
    // TODO: integrate Lighthouse via chrome-launcher in a separate Chrome instance.
    //       The scaffold here leaves lighthouse undefined. See v0.1 notes in
    //       server/src/capture/README.md for the full integration sketch.

    await context.close();
    return PerformanceReports.save(report);
  }

  private async captureVitals(page: Page) {
    return await page.evaluate(() => {
      return new Promise<{ lcp?: number; fcp?: number; cls?: number; ttfb?: number }>((resolve) => {
        const v: { lcp?: number; fcp?: number; cls?: number; ttfb?: number } = {};
        const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (nav) v.ttfb = nav.responseStart;
        const fcp = performance.getEntriesByType('paint').find((e) => e.name === 'first-contentful-paint');
        if (fcp) v.fcp = fcp.startTime;
        let lcp: number | undefined;
        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) lcp = last.startTime;
          }).observe({ type: 'largest-contentful-paint', buffered: true });
        } catch { /* unsupported */ }
        let cls = 0;
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as any[]) {
              if (!entry.hadRecentInput) cls += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });
        } catch { /* unsupported */ }
        setTimeout(() => { v.lcp = lcp; v.cls = cls; resolve(v); }, 1500);
      });
    });
  }

  private async collectTech(page: Page, siteUrl: string) {
    const signals = await page.evaluate(() => {
      const scripts = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
      const checkGlobals = ['React', '__NEXT_DATA__', 'Vue', '__NUXT__', 'angular', 'jQuery', 'Shopify', 'wp', 'Drupal'];
      const globals = checkGlobals.filter((g) => (window as any)[g] !== undefined);
      const origin = location.origin;
      const thirdPartyDomains = Array.from(new Set(
        scripts.map((s) => { try { return new URL(s).hostname; } catch { return ''; } })
               .filter((h) => h && !origin.includes(h)),
      ));
      return { scripts, globals, thirdPartyDomains };
    });

    const detected: Array<{ name: string; category: string }> = [];
    const push = (name: string, category: string) => detected.push({ name, category });

    if (signals.globals.includes('__NEXT_DATA__')) push('Next.js', 'framework');
    if (signals.globals.includes('React')) push('React', 'framework');
    if (signals.globals.includes('__NUXT__')) push('Nuxt', 'framework');
    if (signals.globals.includes('Vue')) push('Vue', 'framework');
    if (signals.globals.includes('angular')) push('Angular', 'framework');
    if (signals.globals.includes('jQuery')) push('jQuery', 'library');
    if (signals.globals.includes('wp')) push('WordPress', 'cms');
    if (signals.globals.includes('Shopify')) push('Shopify', 'cms');
    if (signals.globals.includes('Drupal')) push('Drupal', 'cms');

    const scriptStr = signals.scripts.join(' ');
    const trackerPatterns: Array<{ name: string; pattern: RegExp; category: string }> = [
      { name: 'Google Analytics', pattern: /google-analytics\.com|googletagmanager\.com/, category: 'analytics' },
      { name: 'Facebook Pixel', pattern: /facebook\.(net|com)/, category: 'advertising' },
      { name: 'Segment', pattern: /segment\.(com|io)/, category: 'analytics' },
      { name: 'Mixpanel', pattern: /mixpanel\.com/, category: 'analytics' },
      { name: 'Hotjar', pattern: /hotjar\.com/, category: 'analytics' },
      { name: 'LinkedIn Insight', pattern: /linkedin\.com|licdn\.com/, category: 'advertising' },
    ];
    const trackers = trackerPatterns
      .filter((p) => p.pattern.test(scriptStr) || signals.thirdPartyDomains.some((d) => p.pattern.test(d)))
      .map((p) => ({ name: p.name, category: p.category }));

    // Security headers — re-fetch so we can read them
    let headers: Record<string, string> = {};
    try {
      const res = await page.context().request.get(siteUrl, { failOnStatusCode: false });
      const raw = res.headers();
      for (const [k, val] of Object.entries(raw)) headers[k.toLowerCase()] = val;
    } catch { /* ignore */ }

    const sh = {
      csp: !!headers['content-security-policy'],
      hsts: !!headers['strict-transport-security'],
      xFrameOptions: !!headers['x-frame-options'],
      xContentTypeOptions: !!headers['x-content-type-options'],
      referrerPolicy: !!headers['referrer-policy'],
      permissionsPolicy: !!headers['permissions-policy'],
      score: 0,
    };
    const weights = { csp: 30, hsts: 25, xFrameOptions: 10, xContentTypeOptions: 10, referrerPolicy: 10, permissionsPolicy: 15 };
    (Object.keys(weights) as (keyof typeof weights)[]).forEach((k) => { if (sh[k]) sh.score += weights[k]; });

    return { detected, trackers, securityHeaders: sh };
  }

  private resolveUrl(siteUrl: string, target: string): string {
    try {
      if (target.startsWith('http://') || target.startsWith('https://')) return target;
      return new URL(target, siteUrl).toString();
    } catch {
      return siteUrl;
    }
  }
}
