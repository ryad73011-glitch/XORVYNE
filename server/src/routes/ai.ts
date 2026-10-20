import { Router } from 'express';
import { z } from 'zod';
import type { CommandRequest } from '@shared/types.js';
import { resolveProviders } from '../providers/registry.js';
import { getUpload } from '../export/media.js';

export const aiRouter = Router();

const commandSchema = z.object({
  message: z.string().min(1).max(2000),
  project: z.object({
    id: z.string(),
    name: z.string(),
    settings: z.object({
      width: z.number(),
      height: z.number(),
      fps: z.number(),
      backgroundColor: z.string(),
      sampleRate: z.number(),
      gridMs: z.number(),
      snapToGrid: z.boolean(),
      zoom: z.number(),
      autoSave: z.boolean(),
    }),
    tracks: z.array(z.any()),
    clips: z.array(z.any()),
    assets: z.array(z.any()),
    selectedClipId: z.string().nullish(),
  }),
  conversation: z.array(z.any()).optional(),
});

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

const textToVideoSchema = z.object({
  prompt: z.string().min(3).max(2000),
  style: z.string().optional(),
  durationMs: z.number().min(5000).max(300000).optional(),
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

const imageToVideoSchema = z.object({
  prompt: z.string().min(3).max(2000),
  motion: z.string().optional(),
  durationMs: z.number().optional(),
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

const editSchema = z.object({
  prompt: z.string().max(2000).optional(),
  uploadToken: z.string().optional(),
  fileName: z.string().optional(),
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
