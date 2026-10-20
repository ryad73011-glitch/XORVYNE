import type { MediaAsset } from '@shared/types.js';
import { getMedia } from '../storage/db.js';

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Returns (and caches) an object URL for a locally stored asset. */
export async function getAssetUrl(asset: MediaAsset): Promise<string | null> {
  const cached = urls.get(asset.id);
  if (cached) return cached;
  if (asset.source.type !== 'local') return null;
  const inFlight = pending.get(asset.id);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const record = await getMedia(asset.source.type === 'local' ? asset.source.storageKey : '');
      if (!record) return null;
      const url = URL.createObjectURL(record.blob);
      urls.set(asset.id, url);
      return url;
    } catch {
      return null;
    } finally {
      pending.delete(asset.id);
    }
  })();

  pending.set(asset.id, promise);
  return promise;
}

export function releaseAssetUrl(assetId: string): void {
  const url = urls.get(assetId);
  if (url) {
    URL.revokeObjectURL(url);
    urls.delete(assetId);
  }
}

export function releaseAllAssetUrls(): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear();
}

export interface MediaProbe {
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/** Reads intrinsic metadata straight from the browser media pipeline. */
export function probeMedia(blob: Blob, kind: 'video' | 'image' | 'audio'): Promise<MediaProbe> {
  if (kind === 'image') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        resolve({ durationMs: 0, width: image.naturalWidth, height: image.naturalHeight, hasAudio: false });
        URL.revokeObjectURL(url);
      };
      image.onerror = () => {
        resolve({ durationMs: 0, width: 0, height: 0, hasAudio: false });
        URL.revokeObjectURL(url);
      };
      image.src = url;
    });
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const element = document.createElement(kind === 'video' ? 'video' : 'audio');
    element.preload = 'metadata';
    const cleanup = () => URL.revokeObjectURL(url);
    element.onloadedmetadata = () => {
      const video = element as HTMLVideoElement;
      const durationMs = Number.isFinite(element.duration) ? Math.round(element.duration * 1000) : 0;
      const width = kind === 'video' ? video.videoWidth || 0 : 0;
      const height = kind === 'video' ? video.videoHeight || 0 : 0;
      const hasAudio = kind === 'audio' ? true : true;
      cleanup();
      resolve({ durationMs, width, height, hasAudio });
    };
    element.onerror = () => {
      cleanup();
      resolve({ durationMs: 0, width: 0, height: 0, hasAudio: false });
    };
    element.src = url;
  });
}
