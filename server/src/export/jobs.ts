import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExportJob, ExportSettings } from '@shared/types.js';
import { config, ensureTempDir, findFfmpeg, findTextFont } from '../config.js';
import { removeDir, runFfmpeg } from './ffmpeg.js';
import { buildPlan, type RenderProject } from './plan.js';
import { getUpload, type UploadedMedia } from './media.js';

interface InternalJob extends ExportJob {
  workDir: string;
  outputPath: string;
  cancelRequested: boolean;
}

const jobs = new Map<string, InternalJob>();

export function getJob(id: string): ExportJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  return toPublic(job);
}

export function toPublic(job: InternalJob): ExportJob {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    message: job.message,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    errorMessage: job.errorMessage,
    fileName: job.fileName,
    fileSizeBytes: job.fileSizeBytes,
    downloadUrl: job.status === 'complete' ? `/api/export/jobs/${job.id}/file` : undefined,
    durationMs: job.durationMs,
    realRender: job.realRender,
    logTail: job.logTail,
  };
}

export function createJob(): InternalJob {
  const id = `job_${randomBytes(8).toString('hex')}`;
  const workDir = path.join(ensureTempDir(), id);
  fs.mkdirSync(workDir, { recursive: true });
  const job: InternalJob = {
    id,
    status: 'queued',
    progress: 0,
    message: 'Queued…',
    createdAt: Date.now(),
    realRender: false,
    logTail: [],
    workDir,
    outputPath: '',
    cancelRequested: false,
  };
  jobs.set(id, job);
  return job;
}

export function cancelJob(id: string): ExportJob | undefined {
  const job = jobs.get(id);
  if (!job) return undefined;
  job.cancelRequested = true;
  if (job.status === 'queued' || job.status === 'preparing') {
    job.status = 'cancelled';
    job.message = 'Cancelled.';
    job.finishedAt = Date.now();
  }
  return toPublic(job);
}

/** Marks failures that happen before the encoder starts (for example, an invalid render plan). */
export function failJob(id: string, error: unknown): ExportJob | undefined {
  const job = jobs.get(id);
  if (!job || job.status === 'complete' || job.status === 'cancelled' || job.status === 'failed') return job ? toPublic(job) : undefined;
  const message = error instanceof Error ? error.message : 'The export could not be prepared.';
  job.status = 'failed';
  job.errorMessage = message;
  job.message = 'Export failed';
  job.finishedAt = Date.now();
  job.logTail.push(message);
  return toPublic(job);
}

export interface JobInput {
  project: RenderProject;
  settings: ExportSettings;
  media: { assetId: string; token: string }[];
}

export async function runJob(job: InternalJob, input: JobInput): Promise<void> {
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    job.status = 'failed';
    job.errorMessage =
      'No ffmpeg binary was found on this machine, so a real MP4 cannot be produced. Run `npm run setup:ffmpeg` or install ffmpeg and retry.';
    job.message = 'Encoder unavailable';
    job.finishedAt = Date.now();
    job.logTail.push(job.errorMessage);
    return;
  }

  job.status = 'preparing';
  job.message = 'Preparing the render…';

  const requiredAssetIds = new Set(input.project.clips
    .filter((clip) => clip.kind === 'video' || clip.kind === 'image' || clip.kind === 'audio')
    .map((clip) => clip.assetId)
    .filter((assetId): assetId is string => Boolean(assetId)));
  const mediaByAsset = resolveMediaByAsset(input.media, requiredAssetIds);

  const fontFile = findTextFont();
  const plan = buildPlan({
    project: input.project,
    settings: input.settings,
    mediaByAsset,
    fontFile,
    workDir: job.workDir,
  });

  for (const warning of plan.warnings) {
    job.logTail.push(`warning: ${warning}`);
  }
  job.logTail.push(`ffmpeg ${ffmpeg.version}`);
  job.logTail.push(`plan: ${plan.args.length} arguments, ${(plan.durationMs / 1000).toFixed(2)}s of timeline`);

  if (job.cancelRequested) {
    job.status = 'cancelled';
    job.message = 'Cancelled.';
    job.finishedAt = Date.now();
    return;
  }

  job.status = 'rendering';
  job.message = 'Rendering…';
  job.durationMs = plan.durationMs;

  const controller = new AbortController();
  const abortWatcher = setInterval(() => {
    if (job.cancelRequested) controller.abort();
  }, 300);

  try {
    const result = await runFfmpeg({
      commandPath: ffmpeg.path,
      args: ['-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', ...plan.args],
      cwd: job.workDir,
      durationMs: plan.durationMs,
      signal: controller.signal,
      onProgress: (progress) => {
        job.progress = Math.min(0.99, Math.max(0.05, progress.progress));
        job.message = `Rendering… ${Math.round(job.progress * 100)}%`;
      },
    });

    if (result.stderr.trim().length > 0) {
      job.logTail.push(...result.stderr.trim().split('\n').slice(-12));
    }

    if (job.cancelRequested) {
      job.status = 'cancelled';
      job.message = 'Cancelled.';
      job.finishedAt = Date.now();
      return;
    }

    if (result.code !== 0) {
      job.status = 'failed';
      job.errorMessage = `The encoder exited with code ${result.code}.`;
      job.message = 'Render failed';
      job.finishedAt = Date.now();
      return;
    }

    const outputPath = path.join(job.workDir, plan.outputName);
    if (!fs.existsSync(outputPath)) {
      job.status = 'failed';
      job.errorMessage = 'The encoder finished but no output file was produced.';
      job.message = 'Render failed';
      job.finishedAt = Date.now();
      return;
    }

    const stat = fs.statSync(outputPath);
    if (stat.size === 0) {
      job.status = 'failed';
      job.errorMessage = 'The encoder produced an empty file.';
      job.message = 'Render failed';
      job.finishedAt = Date.now();
      return;
    }

    job.outputPath = outputPath;
    job.fileName = plan.outputName;
    job.fileSizeBytes = stat.size;
    job.status = 'complete';
    job.progress = 1;
    job.message = `Export complete — ${(stat.size / 1024 / 1024).toFixed(1)} MB`;
    job.finishedAt = Date.now();
    job.realRender = true;
  } catch (error) {
    job.status = 'failed';
    job.errorMessage = error instanceof Error ? error.message : 'The render failed.';
    job.message = 'Render failed';
    job.finishedAt = Date.now();
  } finally {
    clearInterval(abortWatcher);
  }
}

export function jobFilePath(id: string): string | null {
  const job = jobs.get(id);
  if (!job || job.status !== 'complete' || !job.outputPath) return null;
  return job.outputPath;
}

/** Removes finished jobs (and their artefacts) older than the retention window. */
export function cleanupJobs(maxAgeMs: number): number {
  const now = Date.now();
  let removed = 0;
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > maxAgeMs) {
      removeDir(job.workDir);
      jobs.delete(id);
      removed += 1;
    }
  }
  return removed;
}

export const jobRetentionMs = config.jobRetentionMs;

/** Resolves client asset references before planning; stale tokens must not silently drop clips. */
export function resolveMediaByAsset(
  entries: { assetId: string; token: string }[],
  requiredAssetIds: ReadonlySet<string> = new Set(entries.map((entry) => entry.assetId)),
): Map<string, UploadedMedia> {
  const mediaByAsset = new Map<string, UploadedMedia>();
  for (const entry of entries) {
    const upload = getUpload(entry.token);
    if (!upload) {
      if (requiredAssetIds.has(entry.assetId)) {
        throw new Error('One or more uploaded media files are no longer available. Upload the missing media again and retry the export.');
      }
      continue;
    }
    mediaByAsset.set(entry.assetId, upload);
  }
  return mediaByAsset;
}
