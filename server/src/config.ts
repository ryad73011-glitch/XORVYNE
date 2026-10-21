import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export const APP_VERSION = '0.1.0';

/**
 * Server configuration.
 *
 * Every credential is read from the environment and never leaves the server.
 * Nothing here is bundled into the client build.
 */
export interface ServerConfig {
  port: number;
  host: string;
  tempDir: string;
  publicDir: string;
  maxUploadBytes: number;
  jobRetentionMs: number;
  providers: {
    /** Generic OpenAI-compatible chat endpoint used for command parsing. */
    commandEndpoint: string | null;
    commandApiKey: string | null;
    commandModel: string;
    /** Generic REST video generation endpoint (provider specific). */
    videoEndpoint: string | null;
    videoApiKey: string | null;
    videoModel: string;
    /** Optional speech-to-text endpoint (OpenAI compatible /v1/audio/transcriptions). */
    sttEndpoint: string | null;
    sttApiKey: string | null;
    /** Optional translation endpoint. */
    translationEndpoint: string | null;
    translationApiKey: string | null;
  };
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export const config: ServerConfig = {
  port: Number(env('PORT') ?? 8787),
  // Bind locally by default; exposing the unauthenticated API to a LAN must be an explicit choice.
  host: env('HOST') ?? '127.0.0.1',
  tempDir: path.resolve(env('XORVYNE_TEMP_DIR') ?? path.join(process.cwd(), '.tmp')),
  publicDir: path.resolve(env('XORVYNE_PUBLIC_DIR') ?? path.join(process.cwd(), 'dist', 'client')),
  maxUploadBytes: Number(env('XORVYNE_MAX_UPLOAD_BYTES') ?? 200 * 1024 * 1024),
  jobRetentionMs: Number(env('XORVYNE_JOB_RETENTION_MS') ?? 30 * 60 * 1000),
  providers: {
    commandEndpoint: env('XORVYNE_COMMAND_ENDPOINT') ?? null,
    commandApiKey: env('XORVYNE_COMMAND_API_KEY') ?? null,
    commandModel: env('XORVYNE_COMMAND_MODEL') ?? 'gpt-4o-mini',
    videoEndpoint: env('XORVYNE_VIDEO_ENDPOINT') ?? null,
    videoApiKey: env('XORVYNE_VIDEO_API_KEY') ?? null,
    videoModel: env('XORVYNE_VIDEO_MODEL') ?? 'default',
    sttEndpoint: env('XORVYNE_STT_ENDPOINT') ?? null,
    sttApiKey: env('XORVYNE_STT_API_KEY') ?? null,
    translationEndpoint: env('XORVYNE_TRANSLATION_ENDPOINT') ?? null,
    translationApiKey: env('XORVYNE_TRANSLATION_API_KEY') ?? null,
  },
};

export function ensureTempDir(): string {
  fs.mkdirSync(config.tempDir, { recursive: true });
  return config.tempDir;
}

/** Locates a usable ffmpeg binary. Returns null when none is available. */
export function findFfmpeg(): { path: string; version: string } | null {
  const candidates: string[] = [];
  if (env('FFMPEG_PATH')) candidates.push(env('FFMPEG_PATH')!);
  candidates.push(
    path.join(process.cwd(), 'vendor', 'ffmpeg', 'ffmpeg'),
    path.join(process.cwd(), 'vendor', 'ffmpeg', 'ffmpeg.exe'),
    '/usr/bin/ffmpeg',
    '/usr/local/bin/ffmpeg',
  );

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    try {
      const version = execFileSync(candidate, ['-version'], { encoding: 'utf8' }).split('\n')[0]?.trim() ?? 'unknown';
      return { path: candidate, version };
    } catch {
      continue;
    }
  }

  // Last resort: PATH lookup.
  try {
    const version = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0]?.trim() ?? 'unknown';
    return { path: 'ffmpeg', version };
  } catch {
    return null;
  }
}

/** Font file used by the ffmpeg drawtext filter. */
export function findTextFont(): string | null {
  const candidates = [
    path.join(process.cwd(), 'vendor', 'fonts', 'DejaVuSans.ttf'),
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
