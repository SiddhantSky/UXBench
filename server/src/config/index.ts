import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_PATH: z.string().default('./server/data/platform.db'),
  SCREENSHOTS_DIR: z.string().default('./server/data/screenshots'),
  BROWSER_HEADLESS: z.coerce.boolean().default(true),
  CAPTURE_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  CAPTURE_VIEWPORT_WIDTH: z.coerce.number().int().positive().default(1440),
  CAPTURE_VIEWPORT_HEIGHT: z.coerce.number().int().positive().default(900),
  ANTHROPIC_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

const parsed = schema.parse(process.env);

export const config = {
  port: parsed.PORT,
  dbPath: parsed.DATABASE_PATH,
  screenshotsDir: parsed.SCREENSHOTS_DIR,
  browser: {
    headless: parsed.BROWSER_HEADLESS,
    timeoutMs: parsed.CAPTURE_TIMEOUT_MS,
    viewport: {
      width: parsed.CAPTURE_VIEWPORT_WIDTH,
      height: parsed.CAPTURE_VIEWPORT_HEIGHT,
    },
  },
  anthropicApiKey: parsed.ANTHROPIC_API_KEY,
  logLevel: parsed.LOG_LEVEL,
};

export const hasAI = !!parsed.ANTHROPIC_API_KEY;
