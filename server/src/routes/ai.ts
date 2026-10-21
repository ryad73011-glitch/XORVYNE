import { Router } from 'express';
import { commandSchema, editSchema, imageToVideoSchema, textToVideoSchema } from './ai-schemas.js';
import type { CommandRequest } from '@shared/types.js';
import { resolveProviders } from '../providers/registry.js';
import { getUpload } from '../export/media.js';

export const aiRouter = Router();

aiRouter.post('/ai/command', async (request, response) => {
  const parsed = commandSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid command payload.', details: parsed.error.issues });
    return;
  }
  const registry = resolveProviders();
  try {
    const result = await registry.command.parse(parsed.data as CommandRequest);
    response.json(result);
  } catch (error) {
    response.status(500).json({
      error: error instanceof Error ? error.message : 'The assistant provider failed.',
    });
  }
});

aiRouter.post('/ai/text-to-video', async (request, response) => {
  const parsed = textToVideoSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid prompt.', details: parsed.error.issues });
    return;
  }
  const registry = resolveProviders();
  try {
    response.json(await registry.textToVideo.generate(parsed.data));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'The video provider failed.',
    });
  }
});

aiRouter.post('/ai/image-to-video', async (request, response) => {
  const parsed = imageToVideoSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid prompt.', details: parsed.error.issues });
    return;
  }
  const registry = resolveProviders();
  try {
    response.json(await registry.imageToVideo.generate(parsed.data));
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'The image-to-video provider failed.',
    });
  }
});

aiRouter.post('/ai/edit-existing', async (request, response) => {
  const parsed = editSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid request.', details: parsed.error.issues });
    return;
  }
  const registry = resolveProviders();
  const upload = parsed.data.uploadToken ? getUpload(parsed.data.uploadToken) : undefined;
  try {
    response.json(
      await registry.videoEdit.analyse({
        prompt: parsed.data.prompt ?? '',
        fileName: parsed.data.fileName,
        mediaPath: upload?.path,
      }),
    );
  } catch (error) {
    response.status(502).json({
      error: error instanceof Error ? error.message : 'The footage analyser failed.',
    });
  }
});
