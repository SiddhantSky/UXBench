import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import path from 'node:path';
import { config } from './config';
import { initDb } from './db/schema';
import { apiRoutes } from './routes/api';

async function main() {
  initDb(config.dbPath);

  const app = Fastify({
    logger: {
      level: config.logLevel,
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } },
    },
    bodyLimit: 20 * 1024 * 1024, // 20MB — manual screenshot uploads
  });

  await app.register(cors, { origin: true });

  // Serve screenshots from disk at /screenshots/<filename>
  await app.register(staticPlugin, {
    root: path.resolve(config.screenshotsDir),
    prefix: '/screenshots/',
    decorateReply: false,
  });

  // Serve the web UI
  await app.register(staticPlugin, {
    root: path.resolve(process.cwd(), 'web', 'public'),
    prefix: '/',
  });

  // Register API routes
  await app.register(apiRoutes, { prefix: '/api' });

  const port = config.port;
  try {
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Platform running at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
