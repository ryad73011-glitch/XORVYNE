import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { cancelJob, createJob, failJob, getJob, jobFilePath, runJob, toPublic } from '../export/jobs.js';
import { getUpload } from '../export/media.js';

export const exportRouter = Router();

const textSchema = z.object({
  content: z.string().max(10000),
  fontFamily: z.string().max(200),
  fontSize: z.number().min(8).max(500),
  fontWeight: z.number().min(100).max(900),
  color: z.string().max(20),
  align: z.enum(['left', 'center', 'right']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  uppercase: z.boolean(),
  letterSpacing: z.number().min(-100).max(100),
  shadow: z.boolean(),
  background: z.string().max(100).nullable(),
});

const effectSchema = z.object({
  id: z.string().max(100),
  type: z.string().max(40),
  enabled: z.boolean(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
});

const clipSchema = z.object({
  id: z.string().min(1).max(100),
  trackId: z.string().min(1).max(100),
  assetId: z.string().max(100).optional(),
  kind: z.enum(['video', 'image', 'audio', 'text']),
  name: z.string().max(255),
  startMs: z.number().finite().min(0).max(1_800_000),
  durationMs: z.number().finite().min(200).max(1_800_000),
  inMs: z.number().finite().min(0).max(86_400_000),
  outMs: z.number().finite().min(0).max(86_400_000),
  speed: z.number().finite().min(0.1).max(16),
  opacity: z.number().min(0).max(1),
  volume: z.number().min(0).max(2),
  transform: z.object({ x: z.number().finite(), y: z.number().finite(), scale: z.number().positive().max(20), rotation: z.number().finite(), opacity: z.number().min(0).max(1) }),
  effects: z.array(effectSchema).max(32),
  transitionIn: z.object({ type: z.string().max(32), durationMs: z.number().min(0).max(10000) }).optional(),
  text: textSchema.optional(),
  swatch: z.string().max(20),
});

const projectSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(255),
  settings: z.object({
    width: z.number().int().min(16).max(7680),
    height: z.number().int().min(16).max(4320),
    fps: z.number().min(1).max(120),
    backgroundColor: z.string().max(20),
    sampleRate: z.number().positive().max(192000),
    gridMs: z.number().positive().max(60000),
    snapToGrid: z.boolean(),
    zoom: z.number().positive().max(1000),
    autoSave: z.boolean(),
  }),
  tracks: z.array(z.object({
    id: z.string().max(100),
    kind: z.enum(['video', 'audio', 'text']),
    name: z.string().max(255),
    order: z.number().int().min(0).max(64),
    muted: z.boolean(),
    locked: z.boolean(),
    hidden: z.boolean(),
    height: z.number().min(16).max(500),
  })).max(64),
  clips: z.array(clipSchema).max(2000),
  assets: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().max(255),
    kind: z.enum(['video', 'image', 'audio']),
    mimeType: z.string().max(100),
    sizeBytes: z.number().min(0).max(200 * 1024 * 1024),
    durationMs: z.number().min(0).max(86_400_000),
    width: z.number().min(0).max(20000),
    height: z.number().min(0).max(20000),
    hasAudio: z.boolean(),
    status: z.enum(['ready', 'processing', 'error']),
    errorMessage: z.string().max(1000).optional(),
    swatch: z.string().max(20),
    source: z.any(),
    createdAt: z.number(),
  })).max(2000),
});
const settingsSchema = z.object({
  format: z.enum(['mp4', 'webm']),
  resolution: z.enum(['source', '1080p', '720p', '480p', 'vertical']),
  fps: z.enum(['source', '24', '30', '60']),
  quality: z.number().min(0).max(1),
  includeAudio: z.boolean(),
  fileName: z.string().max(120),
});

const jobSchema = z.object({
  project: projectSchema,
  settings: settingsSchema,
  media: z.array(z.object({ assetId: z.string(), token: z.string() })).max(2000),
});

exportRouter.post('/export/jobs', (request, response) => {
  const parsed = jobSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid export request.', details: parsed.error.issues });
    return;
  }

  const job = createJob();
  response.status(202).json(toPublic(job));

  // The render runs in the background; the client polls for progress.
  void runJob(job, {
    project: parsed.data.project as never,
    settings: parsed.data.settings,
    media: parsed.data.media,
  }).catch((error: unknown) => {
    failJob(job.id, error);
    console.error('[export] job failed', error);
  });
});

exportRouter.get('/export/jobs/:id', (request, response) => {
  const job = getJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Unknown export job.' });
    return;
  }
  response.json(job);
});

exportRouter.post('/export/jobs/:id/cancel', (request, response) => {
  const job = cancelJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Unknown export job.' });
    return;
  }
  response.json(job);
});

exportRouter.get('/export/jobs/:id/file', (request, response) => {
  const job = getJob(request.params.id);
  if (!job) {
    response.status(404).json({ error: 'Unknown export job.' });
    return;
  }
  const filePath = jobFilePath(request.params.id);
  if (!filePath || !fs.existsSync(filePath)) {
    response.status(410).json({ error: 'The export file is no longer available. Run the export again.' });
    return;
  }
  const stat = fs.statSync(filePath);
  response.setHeader('Content-Type', job.fileName?.endsWith('.webm') ? 'video/webm' : 'video/mp4');
  response.setHeader('Content-Length', String(stat.size));
  response.setHeader('Content-Disposition', `attachment; filename="${job.fileName ?? 'xorvyne-export.mp4'}"`);
  fs.createReadStream(filePath).pipe(response);
});

/** Guard so a client cannot reference uploads that were never registered. */
export function isKnownToken(token: string): boolean {
  return Boolean(getUpload(token));
}
