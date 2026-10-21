import { describe, expect, it } from 'vitest';
import { MUSIC_CATALOG, SFX_CATALOG } from '@shared/catalog.js';
import { renderMusicBlob, renderSfxBlob } from '@client/lib/audio.js';

describe('procedural audio library', () => {
  it('creates a valid, non-empty PCM WAV sound effect locally', async () => {
    const blob = renderSfxBlob(SFX_CATALOG.find((item) => item.id === 'whoosh')!);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(1000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
  });

  it('creates a playable procedural music bed', async () => {
    const blob = renderMusicBlob(MUSIC_CATALOG.find((item) => item.id === 'ambient-drone')!, 1200);
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBeGreaterThan(10000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
  });
});
