import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPlan, sanitiseName } from '@server/export/plan.js';
import { createEmptyProject, createMediaClip } from '@shared/project-ops.js';
import type { ExportSettings, MediaAsset } from '@shared/types.js';

let workDir: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xorvyne-plan-'));
});
afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

function asset(id: string, kind: 'video' | 'image' | 'audio' = 'video'): MediaAsset {
  return {
    id,
    name: `${id}.${kind === 'video' ? 'mp4' : kind === 'image' ? 'png' : 'wav'}`,
    kind,
    mimeType: kind === 'video' ? 'video/mp4' : kind === 'image' ? 'image/png' : 'audio/wav',
    sizeBytes: 1000,
    durationMs: kind === 'image' ? 0 : 10000,
    width: 1920,
    height: 1080,
    hasAudio: kind !== 'image',
    status: 'ready',
    swatch: '#7c3aed',
    source: { type: 'uploaded', uploadToken: 'token' },
    createdAt: Date.now(),
  };
}

const settings: ExportSettings = {
  format: 'mp4',
  resolution: 'source',
  fps: 'source',
  quality: 0.6,
  includeAudio: true,
  fileName: 'my export',
};

describe('export plan', () => {
  it('chains two scenes with a real xfade transition', () => {
    const project = createEmptyProject('Demo');
    const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
    const first = createMediaClip({ trackId: videoTrack.id, asset: asset('a'), startMs: 0 });
    const second = createMediaClip({ trackId: videoTrack.id, asset: asset('b'), startMs: 10000 });
    second.transitionIn = { type: 'fade', durationMs: 700 };

    const plan = buildPlan({
      project: { ...project, assets: [asset('a'), asset('b')], clips: [first, second] },
      settings,
      mediaByAsset: new Map([
        ['a', { token: 'a', path: '/tmp/a.mp4', hasAudio: true, durationMs: 10000 }],
        ['b', { token: 'b', path: '/tmp/b.mp4', hasAudio: true, durationMs: 10000 }],
      ]),
      fontFile: null,
      workDir,
    });

    const graph = plan.args.join(' ');
    expect(graph).toContain('xfade=transition=fade');
    expect(graph).toContain('libx264');
    expect(graph).toContain('amix');
    expect(plan.durationMs).toBe(20000);
    expect(plan.outputName).toBe('my-export.mp4');
  });

  it('renders text overlays through a real ASS subtitle filter', () => {
    const project = createEmptyProject('Demo');
    const textTrack = project.tracks.find((track) => track.kind === 'text')!;
    const clip = createMediaClip({ trackId: textTrack.id, asset: asset('a'), startMs: 0 });
    const project2 = {
      ...project,
      assets: [asset('a')],
      clips: [
        {
          ...clip,
          kind: 'text' as const,
          assetId: undefined,
          name: 'Title',
          text: {
            content: 'CREATE BEYOND LIMITS',
            fontFamily: 'Inter',
            fontSize: 64,
            fontWeight: 700,
            color: '#ffffff',
            align: 'center' as const,
            x: 0.5,
            y: 0.5,
            uppercase: false,
            letterSpacing: 0,
            shadow: true,
            background: null,
          },
        },
      ],
    };

    const plan = buildPlan({
      project: project2,
      settings,
      mediaByAsset: new Map(),
      fontFile: '/fonts/DejaVuSans.ttf',
      workDir,
    });

    const graph = plan.args.join(' ');
    expect(graph).toContain('subtitles=filename=captions.ass');
    expect(graph).toContain('fontsdir=');
    expect(fs.existsSync(path.join(workDir, 'captions.ass'))).toBe(true);
    const captions = fs.readFileSync(path.join(workDir, 'captions.ass'), 'utf8');
    expect(captions).toContain('CREATE BEYOND LIMITS');
    expect(captions).toContain('Dialogue: 0,0:00:00.00,0:00:10.00');
  });

  it('maps semantic effects onto ffmpeg filters', () => {
    const project = createEmptyProject('Demo');
    const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
    const clip = createMediaClip({ trackId: videoTrack.id, asset: asset('a'), startMs: 0 });
    clip.effects = [
      { id: 'fx1', type: 'cinematic', enabled: false, params: {} },
      { id: 'fx2', type: 'grayscale', enabled: true, params: { amount: 1 } },
      { id: 'fx3', type: 'vignette', enabled: true, params: { amount: 0.5 } },
    ];

    const plan = buildPlan({
      project: { ...project, assets: [asset('a')], clips: [clip] },
      settings,
      mediaByAsset: new Map([['a', { token: 'a', path: '/tmp/a.mp4', hasAudio: false, durationMs: 10000 }]]),
      fontFile: null,
      workDir,
    });

    const graph = plan.args.join(' ');
    expect(graph).toContain('hue=s=0');
    expect(graph).toContain('vignette=angle=');
  });

  it('sanitises unsafe file names', () => {
    expect(sanitiseName('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitiseName('  ')).toBe('xorvyne-export');
  });
});
