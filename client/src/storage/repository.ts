/**
 * Project repository: the only place that knows how a project is persisted.
 * Screens talk to this module, never to IndexedDB directly.
 */
import {
  addAsset,
  cloneProject,
  createEmptyProject,
  createId,
  projectDuration,
  restoreSnapshot,
  snapshot,
} from '@shared/project-ops.js';
import type { MediaAsset, ProjectSettings, ProjectSummary, XORVYNEProject } from '@shared/types.js';
import {
  deleteMedia,
  deleteProjectRecord,
  getProjectRecord,
  listProjectRecords,
  pruneOrphanMedia,
  putMedia,
  saveProjectRecord,
  type ProjectRecord,
} from './db.js';

function toRecord(project: XORVYNEProject): ProjectRecord {
  const snap = snapshot(project);
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    snapshot: snap,
    history: project.history,
    historyIndex: project.historyIndex ?? project.history.length,
    thumbnail: null,
    durationMs: projectDuration(project),
    clipCount: project.clips.length,
    trackCount: project.tracks.length,
    createdFrom: project.meta.createdFrom,
  };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await listProjectRecords();
  return records.map((record) => ({
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    durationMs: record.durationMs,
    clipCount: record.clipCount,
    trackCount: record.trackCount,
    thumbnail: record.thumbnail,
    createdFrom: record.createdFrom,
  }));
}

export async function loadProject(id: string): Promise<XORVYNEProject | null> {
  const record = await getProjectRecord(id);
  if (!record) return null;
  const base = createEmptyProject(record.name);
  return {
    ...base,
    id: record.id,
    name: record.name,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    settings: record.snapshot.settings,
    assets: record.snapshot.assets,
    tracks: record.snapshot.tracks,
    clips: record.snapshot.clips,
    meta: record.snapshot.meta,
    history: record.history ?? [],
    historyIndex: record.historyIndex ?? record.history?.length ?? 0,
  };
}

export async function saveProject(project: XORVYNEProject): Promise<void> {
  const stored = { ...project, updatedAt: Date.now() };
  await saveProjectRecord(toRecord(stored));
}

export async function renameProject(id: string, name: string): Promise<void> {
  const record = await getProjectRecord(id);
  if (!record) return;
  await saveProjectRecord({ ...record, name, updatedAt: Date.now() });
}

export async function removeProject(id: string): Promise<void> {
  const record = await getProjectRecord(id);
  if (record) {
    for (const asset of record.snapshot.assets) {
      if (asset.source.type === 'local') await deleteMedia(asset.source.storageKey);
    }
  }
  await deleteProjectRecord(id);
}

export async function createProject(name?: string, settings?: Partial<ProjectSettings>): Promise<XORVYNEProject> {
  const project = createEmptyProject(name ?? 'Untitled Project', settings);
  await saveProject(project);
  return project;
}

export async function storeMediaBlob(blob: Blob, name: string, mimeType: string): Promise<string> {
  const key = `media_${createId('m')}`;
  await putMedia(key, blob, name, mimeType);
  return key;
}

export async function attachAsset(project: XORVYNEProject, asset: MediaAsset): Promise<XORVYNEProject> {
  return addAsset(project, asset);
}

export async function cleanupStorage(): Promise<number> {
  return pruneOrphanMedia();
}

export { restoreSnapshot, cloneProject };
