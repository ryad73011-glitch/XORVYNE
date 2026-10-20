import { Router } from 'express';
import { APP_VERSION, findFfmpeg } from '../config.js';
import { providerList, resolveProviders } from '../providers/registry.js';

export const statusRouter = Router();

statusRouter.get('/status', (_request, response) => {
  const ffmpeg = findFfmpeg();
  const registry = resolveProviders();
  response.json({
    ok: true,
    version: APP_VERSION,
    ffmpeg: {
      available: Boolean(ffmpeg),
      path: ffmpeg?.path ?? null,
      version: ffmpeg?.version ?? null,
    },
    providers: providerList(registry),
    time: new Date().toISOString(),
  });
});

statusRouter.get('/providers', (_request, response) => {
  const registry = resolveProviders();
  response.json({ providers: providerList(registry) });
});
