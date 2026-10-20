import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config, ensureTempDir } from '../config.js';
import { probeMedia } from './ffmpeg.js';

export class MediaValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MediaValidationError';
  }
}

export interface UploadedMedia {
  token: string;
  path: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  createdAt: number;
}

const uploads = new Map<string, UploadedMedia>();

const HEADER_SIGNATURES: Record<string, (header: Buffer) => boolean> = {
  'video/mp4': (header) => header.subarray(4, 8).toString() === 'ftyp',
  'video/quicktime': (header) => header.subarray(4, 8).toString() === 'ftyp',
  'video/3gpp': (header) => header.subarray(4, 8).toString() === 'ftyp',
  'audio/mp4': (header) => header.subarray(4, 8).toString() === 'ftyp',
  'audio/x-m4a': (header) => header.subarray(4, 8).toString() === 'ftyp',
  'video/webm': (header) => header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'video/x-matroska': (header) => header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'video/ogg': (header) => header.subarray(0, 4).toString() === 'OggS',
  'audio/ogg': (header) => header.subarray(0, 4).toString() === 'OggS',
  'audio/webm': (header) => header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])),
  'image/jpeg': (header) => header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff,
  'image/png': (header) => header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (header) => header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WEBP',
  'image/gif': (header) => ['GIF87a', 'GIF89a'].includes(header.subarray(0, 6).toString()),
  'image/avif': (header) => header.subarray(4, 8).toString() === 'ftyp',
  'image/bmp': (header) => header.subarray(0, 2).toString() === 'BM',
  'audio/wav': (header) => header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WAVE',
  'audio/x-wav': (header) => header.subarray(0, 4).toString() === 'RIFF' && header.subarray(8, 12).toString() === 'WAVE',
  'audio/flac': (header) => header.subarray(0, 4).toString() === 'fLaC',
  'audio/mpeg': (header) => header.subarray(0, 3).toString() === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0),
  'audio/aac': (header) => header[0] === 0xff && (header[1] & 0xf6) === 0xf0,
};

function hasValidHeader(filePath: string, mimeType: string): boolean {
  const check = HEADER_SIGNATURES[mimeType.toLowerCase()];
  if (!check) return false;
  const fd = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(16);
  try {
    fs.readSync(fd, header, 0, header.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return check(header);
}

const EXTENSIONS: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/3gpp': '.3gp',
  'video/ogg': '.ogv',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/bmp': '.bmp',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'audio/flac': '.flac',
  'audio/x-m4a': '.m4a',
};

export function uploadDir(): string {
  const dir = path.join(ensureTempDir(), 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function registerUpload(
  tempPath: string,
  originalName: string,
  mimeType: string,
  sizeBytes: number,
  ffmpegPath: string,
): Promise<UploadedMedia> {
  if (!hasValidHeader(tempPath, mimeType)) {
    try { fs.rmSync(tempPath, { force: true }); } catch { /* best effort */ }
    throw new MediaValidationError(`The uploaded file contents do not match the declared media type (${mimeType}).`);
  }
  const token = randomBytes(12).toString('hex');
  const extension = EXTENSIONS[mimeType.toLowerCase()] ?? path.extname(originalName).toLowerCase() ?? '';
  const target = path.join(uploadDir(), `${token}${extension}`);
  fs.renameSync(tempPath, target);

  let probe = { durationMs: 0, width: 0, height: 0, fps: 0, hasAudio: false };
  if (ffmpegPath) {
    probe = await probeMedia(target, ffmpegPath);
  }

  const record: UploadedMedia = {
    token,
    path: target,
    originalName,
    mimeType,
    sizeBytes,
    durationMs: probe.durationMs,
    width: probe.width,
    height: probe.height,
    hasAudio: probe.hasAudio,
    createdAt: Date.now(),
  };
  uploads.set(token, record);
  return record;
}

export function getUpload(token: string): UploadedMedia | undefined {
  return uploads.get(token);
}

export function removeUpload(token: string): void {
  const record = uploads.get(token);
  if (!record) return;
  uploads.delete(token);
  try {
    fs.rmSync(record.path, { force: true });
  } catch {
    /* best effort */
  }
}

/** Removes uploads and render artefacts older than the retention window. */
export function cleanupUploads(maxAgeMs: number): number {
  const now = Date.now();
  let removed = 0;
  for (const [token, record] of uploads) {
    if (now - record.createdAt > maxAgeMs) {
      removeUpload(token);
      removed += 1;
    }
  }
  const dir = uploadDir();
  try {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (now - stat.mtimeMs > maxAgeMs) {
        fs.rmSync(full, { force: true });
        removed += 1;
      }
    }
  } catch {
    /* directory may not exist */
  }
  return removed;
}

export const maxUploadBytes = config.maxUploadBytes;
