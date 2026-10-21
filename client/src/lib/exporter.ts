import type { ExportJob, ExportSettings, XORVYNEProject } from '@shared/types.js';
import { api, ApiError } from './api.js';
import { getMedia } from '../storage/db.js';

export type ExportPhase = 'idle' | 'uploading' | 'queued' | 'rendering' | 'complete' | 'failed';

export interface ExportProgress {
  phase: ExportPhase;
  progress: number;
  message: string;
  job?: ExportJob;
}

const POLL_INTERVAL_MS = 700;

/**
 * Runs a real export:
 *  1. imported media is uploaded to the local render server,
 *  2. the server encodes a genuine file with ffmpeg,
 *  3. progress is polled until the file is ready.
 */
export async function runExport(
  project: XORVYNEProject,
  settings: ExportSettings,
  onProgress: (progress: ExportProgress) => void,
  signal?: AbortSignal,
): Promise<ExportJob> {
  onProgress({ phase: 'uploading', progress: 0.02, message: 'Preparing media…' });

  const localAssets = project.assets.filter((asset) => asset.source.type === 'local');
  const media: { assetId: string; token: string }[] = [];

  for (const [index, asset] of localAssets.entries()) {
    if (signal?.aborted) throw new ApiError('Export cancelled.', 0);
    const record =
      asset.source.type === 'local' ? await getMedia(asset.source.storageKey) : null;
    if (!record) {
      onProgress({
        phase: 'failed',
        progress: 0,
        message: `“${asset.name}” is missing from local storage and cannot be rendered.`,
      });
      throw new ApiError(`Missing media: ${asset.name}`, 0);
    }
    const uploaded = await api.uploadMedia(record.blob, record.name, (ratio) => {
      const overall = 0.02 + ((index + ratio) / Math.max(1, localAssets.length)) * 0.18;
      onProgress({ phase: 'uploading', progress: overall, message: `Uploading ${record.name}…` });
    });
    media.push({ assetId: asset.id, token: uploaded.token });
  }

  onProgress({ phase: 'queued', progress: 0.2, message: 'Queued for rendering…' });

  const job = await api.createExportJob({
    project: {
      id: project.id,
      name: project.name,
      settings: project.settings,
      tracks: project.tracks,
      clips: project.clips,
      assets: project.assets.map((asset) => ({ ...asset, source: { type: 'uploaded' as const, uploadToken: '' } })),
    },
    settings,
    media,
  });

  let current = job;
  while (current.status === 'queued' || current.status === 'preparing' || current.status === 'rendering') {
    if (signal?.aborted) {
      await api.cancelExportJob(current.id).catch(() => undefined);
      throw new ApiError('Export cancelled.', 0);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    current = await api.exportJob(current.id);
    onProgress({
      phase: current.status === 'rendering' ? 'rendering' : 'queued',
      progress: current.progress,
      message: current.message,
      job: current,
    });
  }

  if (current.status === 'complete') {
    onProgress({ phase: 'complete', progress: 1, message: current.message, job: current });
  } else {
    onProgress({
      phase: 'failed',
      progress: current.progress,
      message: current.errorMessage ?? current.message,
      job: current,
    });
  }
  return current;
}
