import { describe, expect, it } from 'vitest';
import {
  applyOperations,
  createEmptyProject,
  createMediaClip,
  findClip,
  projectDuration,
  redo,
  snapshot,
  splitClip,
  trimClip,
  undo,
} from '@shared/project-ops.js';
import type { MediaAsset } from '@shared/types.js';

function asset(id: string, durationMs = 10000): MediaAsset {
  return {
    id,
    name: `${id}.mp4`,
    kind: 'video',
    mimeType: 'video/mp4',
    sizeBytes: 1024,
    durationMs,
    width: 1920,
    height: 1080,
    hasAudio: true,
    status: 'ready',
    swatch: '#7c3aed',
    source: { type: 'local', storageKey: `media_${id}` },
    createdAt: Date.now(),
  };
}

function projectWithTwoScenes() {
  const project = createEmptyProject('Test');
  const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
  const first = createMediaClip({ trackId: videoTrack.id, asset: asset('a'), startMs: 0 });
  const second = createMediaClip({ trackId: videoTrack.id, asset: asset('b'), startMs: 10000 });
  return { project: { ...project, assets: [asset('a'), asset('b')], clips: [first, second] }, first, second };
}

describe('project operations', () => {
  it('creates a project with the three default tracks', () => {
    const project = createEmptyProject('Demo');
    expect(project.tracks.map((track) => track.kind)).toEqual(['video', 'text', 'audio']);
    expect(project.clips).toHaveLength(0);
    expect(project.schemaVersion).toBe(1);
  });

  it('splits a clip into two at a timeline position', () => {
    const { project, first } = projectWithTwoScenes();
    const split = splitClip(project, first.id, 4000);
    expect(split.clips).toHaveLength(3);
    const head = split.clips.find((clip) => clip.id === first.id)!;
    const tail = split.clips.find((clip) => clip.id !== first.id && clip.trackId === head.trackId)!;
    expect(head.durationMs).toBe(4000);
    expect(tail.startMs).toBe(4000);
    expect(tail.inMs).toBe(4000);
    expect(tail.durationMs).toBe(6000);
  });

  it('refuses to split inside the minimum clip length', () => {
    const { project, first } = projectWithTwoScenes();
    expect(splitClip(project, first.id, 50).clips).toHaveLength(2);
  });

  it('trims a clip and keeps the source in-point aligned', () => {
    const { project, first } = projectWithTwoScenes();
    const trimmed = trimClip(project, first.id, 2000, 6000);
    const clip = findClip(trimmed, first.id)!;
    expect(clip.startMs).toBe(2000);
    expect(clip.durationMs).toBe(4000);
    expect(clip.inMs).toBe(2000);
    expect(clip.outMs).toBe(6000);
  });

  it('moves a clip to a new start time', () => {
    const { project, second } = projectWithTwoScenes();
    const moved = applyOperations(project, [{ op: 'moveClip', clipId: second.id, startMs: 25000 }]);
    expect(findClip(moved, second.id)!.startMs).toBe(25000);
    expect(projectDuration(moved)).toBe(35000);
  });

  it('re-times a clip without changing its source in/out points', () => {
    const { project, first } = projectWithTwoScenes();
    const changed = applyOperations(project, [{ op: 'setClipSpeed', clipId: first.id, speed: 2 }]);
    const clip = findClip(changed, first.id)!;
    expect(clip.speed).toBe(2);
    expect(clip.durationMs).toBe(5000);
    expect(clip.inMs).toBe(0);
    expect(clip.outMs).toBe(10000);
  });

  it('applies AI operations deterministically', () => {
    const { project, second } = projectWithTwoScenes();
    const applied = applyOperations(project, [
      { op: 'setTransition', clipId: second.id, transition: { type: 'fade', durationMs: 800 } },
      { op: 'setClipVolume', clipId: second.id, volume: 0.4 },
    ]);
    const clip = findClip(applied, second.id)!;
    expect(clip.transitionIn).toEqual({ type: 'fade', durationMs: 800 });
    expect(clip.volume).toBe(0.4);
  });

  it('supports undo and redo with snapshots', () => {
    const { project, first } = projectWithTwoScenes();
    const before = snapshot(project);
    const after = snapshot({ ...project, name: 'Renamed' });
    const withHistory = { ...project, history: [{ id: 'h1', label: 'Rename', timestamp: Date.now(), before, after }] };

    const undone = undo(withHistory, 1);
    expect(undone.index).toBe(0);
    expect(undone.project.name).toBe('Test');

    const redone = redo(withHistory, 0);
    expect(redone.index).toBe(1);
    expect(redone.project.name).toBe('Renamed');
    expect(findClip(redone.project, first.id)).toBeTruthy();
  });
});
