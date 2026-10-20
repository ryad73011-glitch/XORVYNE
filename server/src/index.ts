import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureTempDir } from './config.js';
import { statusRouter } from './routes/status.js';
import { mediaRouter } from './routes/media.js';
import { aiRouter } from './routes/ai.js';
import { exportRouter } from './routes/export.js';
import { cleanupJobs } from './export/jobs.js';
import { cleanupUploads } from './export/media.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use('/api', statusRouter);
app.use('/api', mediaRouter);
app.use('/api', aiRouter);
app.use('/api', exportRouter);

app.use('/api', (_request, response) => {
  response.status(404).json({ error: 'Unknown API route.' });
});

// --- static client --------------------------------------------------------
if (fs.existsSync(config.publicDir)) {
  app.use(
    express.static(config.publicDir, {
      index: false,
      maxAge: '1h',
      setHeaders: (response, filePath) => {
        if (filePath.endsWith('.html')) response.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );
  app.get(/.*/, (request, response, next) => {
    if (request.path.startsWith('/api')) {
      next();
      return;
    }
    const indexPath = path.join(config.publicDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(indexPath);
      return;
    }
    next();
  });
} else {
  app.get('/', (_request, response) => {
    response
      .status(200)
      .type('text/plain')
      .send(
        'XORVYNE API is running. Build the client with `npm run build:client` or use the Vite dev server on port 5173.',
      );
  });
}

// --- error handling --------------------------------------------------------
// Express identifies error middleware by its four-argument signature.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((error: Error, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error('[xorvyne] unhandled error', error);
  response.status(500).json({ error: error.message || 'Unexpected server error.' });
});

ensureTempDir();

const server = app.listen(config.port, config.host, () => {
  console.log(`[xorvyne] API listening on http://${config.host}:${config.port}`);
});

const cleanupTimer = setInterval(() => {
  cleanupJobs(config.jobRetentionMs);
  cleanupUploads(config.jobRetentionMs);
}, 10 * 60 * 1000);
cleanupTimer.unref?.();

const shutdown = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
