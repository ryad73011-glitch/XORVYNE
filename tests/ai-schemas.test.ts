import { describe, expect, it } from 'vitest';
import { commandSchema, editSchema, imageToVideoSchema, textToVideoSchema } from '../server/src/routes/ai-schemas.js';

const validProject = {
  id: 'project-1',
  name: 'Test project',
  settings: {
    width: 1920,
    height: 1080,
    fps: 30,
    backgroundColor: '#000000',
    sampleRate: 48000,
    gridMs: 500,
    snapToGrid: true,
    zoom: 60,
    autoSave: true,
  },
  tracks: [],
  clips: [],
  assets: [],
};

describe('AI API request schemas', () => {
  it('trims a command and accepts valid project settings', () => {
    const parsed = commandSchema.safeParse({ message: '  trim the intro  ', project: validProject });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.message).toBe('trim the intro');
  });

  it('rejects oversized project collections and invalid frame rates', () => {
    expect(commandSchema.safeParse({
      message: 'edit',
      project: { ...validProject, settings: { ...validProject.settings, fps: 29 } },
    }).success).toBe(false);
    expect(commandSchema.safeParse({
      message: 'edit',
      project: { ...validProject, clips: Array.from({ length: 10001 }, () => ({})) },
    }).success).toBe(false);
  });

  it('accepts bounded text-to-video requests and rejects fractional durations', () => {
    expect(textToVideoSchema.safeParse({ prompt: 'A quiet city', durationMs: 30000 }).success).toBe(true);
    expect(textToVideoSchema.safeParse({ prompt: 'A quiet city', durationMs: 30000.5 }).success).toBe(false);
    expect(textToVideoSchema.safeParse({ prompt: '  ', durationMs: 30000 }).success).toBe(false);
  });

  it('allows a short image animation but rejects unsafe duration and motion sizes', () => {
    expect(imageToVideoSchema.safeParse({ prompt: 'Animate this image', durationMs: 4000 }).success).toBe(true);
    expect(imageToVideoSchema.safeParse({ prompt: 'Animate this image', durationMs: -1 }).success).toBe(false);
    expect(imageToVideoSchema.safeParse({ prompt: 'Animate this image', motion: 'x'.repeat(501) }).success).toBe(false);
  });

  it('bounds edit-existing identifiers and filenames', () => {
    expect(editSchema.safeParse({ uploadToken: 'token-1', fileName: 'clip.mp4' }).success).toBe(true);
    expect(editSchema.safeParse({ uploadToken: 'x'.repeat(257) }).success).toBe(false);
    expect(editSchema.safeParse({ fileName: 'x'.repeat(256) }).success).toBe(false);
  });
});
