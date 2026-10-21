import { z } from 'zod';

const projectSettingsSchema = z.object({
  width: z.number().int().min(16).max(7680),
  height: z.number().int().min(16).max(4320),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(50), z.literal(60)]),
  backgroundColor: z.string().max(20),
  sampleRate: z.number().int().min(8000).max(192000),
  gridMs: z.number().int().min(50).max(5000),
  snapToGrid: z.boolean(),
  zoom: z.number().min(1).max(1000),
  autoSave: z.boolean(),
});

export const commandSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  project: z.object({
    id: z.string().min(1).max(200),
    name: z.string().max(255),
    settings: projectSettingsSchema,
    tracks: z.array(z.unknown()).max(1000),
    clips: z.array(z.unknown()).max(10000),
    assets: z.array(z.unknown()).max(10000),
    selectedClipId: z.string().max(200).nullish(),
  }),
  conversation: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().max(2000),
  })).max(100).optional(),
});

export const textToVideoSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  style: z.string().trim().min(1).max(80).optional(),
  durationMs: z.number().int().min(5000).max(300000).optional(),
});

export const imageToVideoSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  motion: z.string().trim().min(1).max(500).optional(),
  durationMs: z.number().int().min(1000).max(300000).optional(),
});

export const editSchema = z.object({
  prompt: z.string().trim().max(2000).optional(),
  uploadToken: z.string().trim().min(1).max(256).optional(),
  fileName: z.string().trim().max(255).optional(),
});
