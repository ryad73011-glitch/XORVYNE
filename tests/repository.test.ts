import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createMediaClip, createEmptyProject, snapshot } from '@shared/project-ops.js';
import type { MediaAsset } from '@shared/types.js';
import {
  createProject,
  listProjects,
  loadProject,
  removeProject,
  saveProject,
  storeMediaBlob,
} from '@client/storage/repository.js';
import { getMedia, getProjectRecord } from '@client/storage/db.js';

const createdIds: string[] = [];

afterEach(async () => {
  for (const id of createdIds.splice(0)) await removeProject(id);
});

function videoAsset(id: string, key: string): MediaAsset {
  return {
    id,
    name: 'offline.mp4',
    kind: 'video',
    mimeType: 'video/mp4',
    sizeBytes: 128,
    durationMs: 8000,
    width: 1280,
    height: 720,
    hasAudio: true,
    status: 'ready',
    swatch: '#8b5cf6',
    source: { type: 'local', storageKey: key },
    createdAt: Date.now(),
  };
}

describe('local project repository', () => {
  it('creates, saves, closes and reopens project data without losing the timeline', async () => {
    const project = await createProject('Offline cut', { width: 1280, height: 720, fps: 24 });
    createdIds.push(project.id);
    const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
    const mediaBlob = new Blob([new Uint8Array([0, 1, 2, 3])], { type: 'video/mp4' });
    const storageKey = await storeMediaBlob(mediaBlob, 'clip.mp4', 'video/mp4');
    const asset = videoAsset('asset-test', storageKey);
    const clip = createMediaClip({ trackId: videoTrack.id, asset, startMs: 1200, durationMs: 3800 });
    project.assets = [asset];
    project.clips = [clip];
    project.settings = { ...project.settings, zoom: 90, snapToGrid: false };
    await saveProject(project);

    const reopened = await loadProject(project.id);
    expect(reopened).not.toBeNull();
    expect(reopened!.id).toBe(project.id);
    expect(reopened!.name).toBe('Offline cut');
    expect(reopened!.settings).toMatchObject({ width: 1280, height: 720, fps: 24, zoom: 90, snapToGrid: false });
    expect(reopened!.assets).toHaveLength(1);
    expect(reopened!.clips).toHaveLength(1);
    expect(reopened!.clips[0]).toMatchObject({ startMs: 1200, durationMs: 3800, assetId: 'asset-test' });
    expect((await getMedia(storageKey))?.blob.size).toBe(4);
    expect((await listProjects()).some((item) => item.id === project.id)).toBe(true);
  });

  it('persists a renamed project summary', async () => {
    const project = createEmptyProject('Before');
    createdIds.push(project.id);
    const before = snapshot(project);
    const after = snapshot({ ...project, name: 'After' });
    project.history = [{ id: 'hist-test', label: 'Rename', timestamp: Date.now(), before, after }];
    project.historyIndex = 0;
    await saveProject(project);
    const record = await getProjectRecord(project.id);
    expect(record?.name).toBe('Before');
    await saveProject({ ...project, name: 'After' });
    const reopened = await loadProject(project.id);
    expect(reopened?.name).toBe('After');
    expect(reopened?.history).toHaveLength(1);
    expect(reopened?.historyIndex).toBe(0);
    expect((await listProjects()).some((item) => item.id === project.id)).toBe(true);
  });
});
