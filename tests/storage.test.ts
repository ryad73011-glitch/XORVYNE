import { describe, expect, it } from 'vitest';
import { formatBytes, kindFromMime, swatchForKind, validateMediaFile, MAX_FILE_BYTES } from '@client/storage/db.js';

function fakeFile(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

describe('media validation', () => {
  it('accepts supported video, image and audio types', () => {
    expect(validateMediaFile(fakeFile('a.mp4', 'video/mp4', 1000)).ok).toBe(true);
    expect(validateMediaFile(fakeFile('a.png', 'image/png', 1000)).kind).toBe('image');
    expect(validateMediaFile(fakeFile('a.mp3', 'audio/mpeg', 1000)).kind).toBe('audio');
  });

  it('rejects unsupported types with a helpful message', () => {
    const result = validateMediaFile(fakeFile('a.exe', 'application/x-msdownload', 1000));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('type');
    expect(result.error).toContain('not a supported media type');
  });

  it('rejects empty files', () => {
    const result = validateMediaFile(fakeFile('a.mp4', 'video/mp4', 0));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('empty');
  });

  it('rejects files above the size limit', () => {
    const result = validateMediaFile(fakeFile('big.mp4', 'video/mp4', MAX_FILE_BYTES + 1));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('size');
    expect(result.error).toContain('limit');
  });
});

describe('formatting helpers', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB');
  });

  it('detects the media kind from a mime type', () => {
    expect(kindFromMime('video/mp4')).toBe('video');
    expect(kindFromMime('image/jpeg')).toBe('image');
    expect(kindFromMime('audio/wav')).toBe('audio');
    expect(swatchForKind('audio')).toBe('#22d3ee');
  });
});
