import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function loadProvider() {
  vi.stubEnv('XORVYNE_VIDEO_ENDPOINT', 'https://provider.example/storyboard');
  vi.stubEnv('XORVYNE_VIDEO_API_KEY', 'test-key');
  vi.stubEnv('XORVYNE_VIDEO_MODEL', 'test-model');
  vi.resetModules();
  const module = await import('../server/src/providers/live.js');
  return module.liveTextToVideo;
}

describe('live storyboard provider contract', () => {
  it('validates shots and never claims storyboard output is rendered footage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      shots: [{ title: 'Opening', description: 'A wide establishing shot', durationMs: 4000 }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const provider = await loadProvider();
    const result = await provider.generate({ prompt: 'A quiet city at dawn', style: 'cinematic', durationMs: 4000 });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer test-key' },
    });
    expect(result.shots).toHaveLength(1);
    expect(result.footageGenerated).toBe(false);
    expect(result.notes.join(' ')).toContain('storyboard only');
  });

  it('rejects malformed provider output rather than returning an empty or fabricated plan', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ shots: [{ title: 'Missing fields' }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));

    const provider = await loadProvider();
    await expect(provider.generate({ prompt: 'A quiet city at dawn' })).rejects.toThrow('invalid response');
  });

  it('rejects provider plans longer than the supported five-minute maximum', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      shots: [
        { title: 'A', description: 'Shot A', durationMs: 180000 },
        { title: 'B', description: 'Shot B', durationMs: 180000 },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    const provider = await loadProvider();
    await expect(provider.generate({ prompt: 'A quiet city at dawn' })).rejects.toThrow('longer than the 5-minute maximum');
  });

  it('returns a safe status-only error when the provider responds unsuccessfully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('sensitive provider internals', { status: 500 })));

    const provider = await loadProvider();
    await expect(provider.generate({ prompt: 'A quiet city at dawn' })).rejects.toThrow('HTTP 500');
  });
});
