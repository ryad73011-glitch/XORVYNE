import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface FfmpegRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface FfmpegProgress {
  /** 0..1 */
  progress: number;
  outTimeMs: number;
  frame: number;
  fps: number;
  speed: string;
}

export interface FfmpegOptions {
  args: string[];
  cwd: string;
  commandPath?: string;
  durationMs: number;
  onProgress?: (progress: FfmpegProgress) => void;
  signal?: AbortSignal;
}

/**
 * Runs ffmpeg and reports real progress by parsing `-progress pipe:1`.
 * This is a genuine encoder run — there is no simulated mode here.
 */
export function runFfmpeg(options: FfmpegOptions): Promise<FfmpegRunResult> {
  const { args, cwd, commandPath = 'ffmpeg', durationMs, onProgress, signal } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(commandPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let buffer = '';

    const handleChunk = (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      let outTimeMs = 0;
      let frame = 0;
      let fps = 0;
      let speed = '';
      for (const line of lines) {
        const [key, value] = line.split('=');
        if (!key || value === undefined) continue;
        if (key === 'out_time_us' || key === 'out_time_ms') {
          // ffmpeg reports out_time_ms in microseconds despite the name.
          const parsed = Number(value);
          if (Number.isFinite(parsed)) outTimeMs = parsed / 1000;
        } else if (key === 'frame') {
          frame = Number(value) || 0;
        } else if (key === 'fps') {
          fps = Number(value) || 0;
        } else if (key === 'speed') {
          speed = value.trim();
        } else if (key === 'progress' && onProgress) {
          onProgress({
            progress: durationMs > 0 ? Math.max(0, Math.min(1, outTimeMs / durationMs)) : 0,
            outTimeMs,
            frame,
            fps,
            speed,
          });
        }
      }
    };

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
      handleChunk(data.toString());
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-120_000);
    });

    const onAbort = () => {
      child.kill('SIGTERM');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(error);
    });

    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      resolve({ code: code ?? -1, stdout, stderr });
    });
  });
}

/** Probes a media file for duration, resolution, fps and audio presence. */
export interface ProbeResult {
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

export async function probeMedia(filePath: string, ffmpegPath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-i', filePath, '-t', '0.1', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('error', () =>
      resolve({ durationMs: 0, width: 0, height: 0, fps: 0, hasAudio: false }),
    );
    child.on('close', () => {
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
      const durationMs = durationMatch
        ? (Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])) * 1000
        : 0;
      const videoMatch = stderr.match(/Stream #\d+:\d+.*Video:.*?(\d{2,5})x(\d{2,5})/);
      const fpsMatch = stderr.match(/(\d+(?:\.\d+)?)\s*fps/);
      const hasAudio = /Stream #\d+:\d+.*Audio:/.test(stderr);
      resolve({
        durationMs: Math.round(durationMs),
        width: videoMatch ? Number(videoMatch[1]) : 0,
        height: videoMatch ? Number(videoMatch[2]) : 0,
        fps: fpsMatch ? Number(fpsMatch[1]) : 0,
        hasAudio,
      });
    });
  });
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function removeDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
}

export function joinWorkDir(workDir: string, name: string): string {
  return path.join(workDir, name);
}
