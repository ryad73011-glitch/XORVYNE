import { describe, expect, it } from 'vitest';
import { parseCommand, parseDurationToMs, type CommandContext } from '@shared/ai-commands.js';
import { createEmptyProject, createMediaClip } from '@shared/project-ops.js';
import type { MediaAsset } from '@shared/types.js';

function asset(id: string): MediaAsset {
  return {
    id,
    name: `${id}.mp4`,
    kind: 'video',
    mimeType: 'video/mp4',
    sizeBytes: 100,
    durationMs: 10000,
    width: 1920,
    height: 1080,
    hasAudio: true,
    status: 'ready',
    swatch: '#7c3aed',
    source: { type: 'local', storageKey: `media_${id}` },
    createdAt: Date.now(),
  };
}

function context(): CommandContext {
  const project = createEmptyProject('Demo');
  const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
  const first = createMediaClip({ trackId: videoTrack.id, asset: asset('a'), startMs: 0 });
  const second = createMediaClip({ trackId: videoTrack.id, asset: asset('b'), startMs: 10000 });
  return {
    clips: [first, second],
    tracks: project.tracks,
    assets: [asset('a'), asset('b')],
    settings: project.settings,
    selectedClipId: null,
  };
}

describe('duration parsing', () => {
  it('parses digits, words and clock notation', () => {
    expect(parseDurationToMs('3 seconds')).toBe(3000);
    expect(parseDurationToMs('three seconds')).toBe(3000);
    expect(parseDurationToMs('2.5 seconds')).toBe(2500);
    expect(parseDurationToMs('1:30')).toBe(90000);
    expect(parseDurationToMs('500ms')).toBe(500);
    expect(parseDurationToMs('deux secondes')).toBe(2000);
  });
});

describe('natural language commands', () => {
  it('understands "Trim the first three seconds."', () => {
    const result = parseCommand('Trim the first three seconds.', context());
    expect(result.understood).toBe(true);
    expect(result.proposal).toBeTruthy();
    const operation = result.proposal!.operations[0];
    expect(operation.op).toBe('trimClip');
    if (operation.op === 'trimClip') {
      expect(operation.startMs).toBe(3000);
    }
  });

  it('understands "Add subtitles in Arabic and French."', () => {
    const result = parseCommand('Add subtitles in Arabic and French.', context());
    expect(result.proposal).toBeTruthy();
    const operations = result.proposal!.operations;
    expect(operations.length).toBeGreaterThanOrEqual(2);
    expect(operations.every((operation) => operation.op === 'addTextClip')).toBe(true);
    expect(result.proposal!.warnings.join(' ')).toMatch(/speech-to-text/i);
  });

  it('understands "Make this scene more cinematic."', () => {
    const result = parseCommand('Make this scene more cinematic.', context());
    expect(result.proposal!.operations[0]).toMatchObject({ op: 'applyPreset', presetId: 'cinematic' });
  });

  it('understands "Change the transition in scene two only."', () => {
    const result = parseCommand('Change the transition in scene two only to a fade.', context());
    const operation = result.proposal!.operations[0];
    expect(operation.op).toBe('setTransition');
    if (operation.op === 'setTransition') {
      expect(operation.transition.type).toBe('fade');
    }
  });

  it('proposes a scoped default when no transition style is named', () => {
    const ctx = context();
    const result = parseCommand('Change the transition in scene two only.', ctx);
    const operation = result.proposal!.operations[0];
    expect(operation.op).toBe('setTransition');
    if (operation.op === 'setTransition') {
      expect(operation.clipId).toBe(ctx.clips[1].id);
      expect(operation.transition).toEqual({ type: 'fade', durationMs: 700 });
    }
    expect(result.proposal!.warnings.join(' ')).toMatch(/default/i);
  });

  it('resolves "this scene" to the selected clip', () => {
    const ctx = context();
    ctx.selectedClipId = ctx.clips[1].id;
    const result = parseCommand('Make this scene more cinematic.', ctx);
    expect(result.proposal!.operations[0]).toMatchObject({ op: 'applyPreset', clipId: ctx.clips[1].id });
  });

  it('reports unknown requests honestly', () => {
    const result = parseCommand('Bake me a lasagne.', context());
    expect(result.understood).toBe(false);
    expect(result.proposal).toBeNull();
    expect(result.suggestions.length).toBeGreaterThan(0);
  });
});
