/**
 * Tiny promise wrapper around IndexedDB.
 * Everything the studio persists (project data + imported media) lives here so
 * the app works fully offline and never sends user media to a third party.
 */
import type { HistoryEntry, MediaAsset, ProjectSnapshot, ProjectSummary } from '@shared/types.js';

const DB_NAME = 'xorvyne';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_MEDIA = 'media';

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  snapshot: ProjectSnapshot;
  /** Persisted undo/redo snapshots and the cursor at save time. */
  history?: HistoryEntry[];
  historyIndex?: number;
  thumbnail: string | null;
  durationMs: number;
  clipCount: number;
  trackCount: number;
  createdFrom: ProjectSummary['createdFrom'];
}

export interface MediaRecord {
  key: string;
  blob: Blob;
  name: string;
  mimeType: string;
  createdAt: number;
}

export class StorageError extends Error {
  constructor(message: string, readonly code: 'quota' | 'unavailable' | 'not-found' | 'unknown') {
    super(message);
    this.name = 'StorageError';
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new StorageError('This browser has no IndexedDB support, so projects cannot be stored locally.', 'unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_MEDIA)) {
        db.createObjectStore(STORE_MEDIA, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new StorageError('Could not open the local project database.', 'unavailable'));
  });
  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, mode);
  const request = run(transaction.objectStore(storeName));
  const result = await requestToPromise(request);
  return result;
}

/* ----------------------------------------------------------------- media */

export async function putMedia(key: string, blob: Blob, name: string, mimeType: string): Promise<void> {
  try {
    await withStore(STORE_MEDIA, 'readwrite', (store) =>
      store.put({ key, blob, name, mimeType, createdAt: Date.now() } satisfies MediaRecord),
    );
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function getMedia(key: string): Promise<MediaRecord | null> {
  try {
    const record = await withStore<MediaRecord | undefined>(STORE_MEDIA, 'readonly', (store) => store.get(key));
    return record ?? null;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteMedia(key: string): Promise<void> {
  try {
    await withStore(STORE_MEDIA, 'readwrite', (store) => store.delete(key));
  } catch {
    /* deleting media is best-effort */
  }
}

export async function listMediaKeys(): Promise<string[]> {
  try {
    const keys = await withStore<IDBValidKey[]>(STORE_MEDIA, 'readonly', (store) => store.getAllKeys());
    return keys.map(String);
  } catch {
    return [];
  }
}

/* -------------------------------------------------------------- projects */

export async function saveProjectRecord(record: ProjectRecord): Promise<void> {
  try {
    await withStore(STORE_PROJECTS, 'readwrite', (store) => store.put(record));
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function getProjectRecord(id: string): Promise<ProjectRecord | null> {
  try {
    const record = await withStore<ProjectRecord | undefined>(STORE_PROJECTS, 'readonly', (store) => store.get(id));
    return record ?? null;
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function listProjectRecords(): Promise<ProjectRecord[]> {
  try {
    const records = await withStore<ProjectRecord[]>(STORE_PROJECTS, 'readonly', (store) => store.getAll());
    return records.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (error) {
    throw toStorageError(error);
  }
}

export async function deleteProjectRecord(id: string): Promise<void> {
  try {
    await withStore(STORE_PROJECTS, 'readwrite', (store) => store.delete(id));
  } catch (error) {
    throw toStorageError(error);
  }
}

/** Removes media blobs that are no longer referenced by any project. */
export async function pruneOrphanMedia(): Promise<number> {
  const records = await listProjectRecords();
  const referenced = new Set<string>();
  for (const record of records) {
    for (const asset of record.snapshot.assets) {
      if (asset.source.type === 'local') referenced.add(asset.source.storageKey);
    }
  }
  const keys = await listMediaKeys();
  let removed = 0;
  for (const key of keys) {
    if (!referenced.has(key)) {
      await deleteMedia(key);
      removed += 1;
    }
  }
  return removed;
}

export async function estimateUsage(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}

function toStorageError(error: unknown): StorageError {
  const name = (error as { name?: string })?.name ?? '';
  const message = (error as { message?: string })?.message ?? 'Storage operation failed.';
  if (name === 'QuotaExceededError') {
    return new StorageError('The browser storage quota is full. Delete a project or export your work to free space.', 'quota');
  }
  return new StorageError(message, 'unknown');
}

/* ------------------------------------------------------------- utilities */

export const ACCEPTED_MEDIA_TYPES = {
  video: ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/3gpp', 'video/ogg'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-m4a'],
} as const;

export const ACCEPT_ATTRIBUTE = [
  ...ACCEPTED_MEDIA_TYPES.video,
  ...ACCEPTED_MEDIA_TYPES.image,
  ...ACCEPTED_MEDIA_TYPES.audio,
].join(',');

export const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB

export interface FileValidationResult {
  ok: boolean;
  kind?: 'video' | 'image' | 'audio';
  error?: string;
  code?: 'type' | 'size' | 'empty';
}

export function validateMediaFile(file: File): FileValidationResult {
  if (file.size === 0) return { ok: false, code: 'empty', error: 'That file is empty.' };
  if (file.size > MAX_FILE_BYTES) {
    return {
      ok: false,
      code: 'size',
      error: `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} — try a smaller file.`,
    };
  }
  const type = file.type.toLowerCase();
  if ((ACCEPTED_MEDIA_TYPES.video as readonly string[]).includes(type)) return { ok: true, kind: 'video' };
  if ((ACCEPTED_MEDIA_TYPES.image as readonly string[]).includes(type)) return { ok: true, kind: 'image' };
  if ((ACCEPTED_MEDIA_TYPES.audio as readonly string[]).includes(type)) return { ok: true, kind: 'audio' };
  return {
    ok: false,
    code: 'type',
    error: `“${file.name}” is not a supported media type (${type || 'unknown'}). Use MP4, WebM, MOV, PNG, JPEG, MP3, WAV or AAC.`,
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  const rounded = index === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[index]}`;
}

export function kindFromMime(mimeType: string): 'video' | 'image' | 'audio' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('image/')) return 'image';
  return 'audio';
}

export function swatchForKind(kind: 'video' | 'image' | 'audio'): string {
  if (kind === 'video') return '#7c3aed';
  if (kind === 'audio') return '#22d3ee';
  return '#f97316';
}

export function assetStorageKey(asset: MediaAsset): string | null {
  return asset.source.type === 'local' ? asset.source.storageKey : null;
}
