import { afterEach, describe, expect, it } from 'vitest';
import { cleanupJobs, createJob, failJob, getJob, resolveMediaByAsset } from '@server/export/jobs.js';

afterEach(() => {
  // Jobs are in-memory and their temporary files are removed immediately after each test.
  cleanupJobs(0);
});

describe('export job failure handling', () => {
  it('marks preparation errors as failed and exposes the message to polling clients', () => {
    const job = createJob();

    const failed = failJob(job.id, new Error('Invalid render plan'));
    expect(failed?.status).toBe('failed');
    expect(failed?.message).toBe('Export failed');
    expect(failed?.errorMessage).toBe('Invalid render plan');
    expect(failed?.finishedAt).toBeTypeOf('number');
    expect(getJob(job.id)?.status).toBe('failed');
  });

  it('handles non-Error values without leaving a job stuck', () => {
    const job = createJob();

    const failed = failJob(job.id, 'unexpected failure');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorMessage).toBe('The export could not be prepared.');
  });

  it('does not overwrite an existing failure with a late error', () => {
    const job = createJob();
    // Failure handling should be idempotent once the job reaches a terminal state.
    const internal = failJob(job.id, new Error('first failure'));
    expect(internal?.status).toBe('failed');
    const repeated = failJob(job.id, new Error('late failure'));
    expect(repeated?.status).toBe('failed');
    expect(repeated?.errorMessage).toBe('first failure');
  });
});


describe('export media reference validation', () => {
  it('rejects stale upload tokens instead of silently omitting media from the render', () => {
    expect(() => resolveMediaByAsset([{ assetId: 'asset-1', token: 'missing-upload-token' }]))
      .toThrow('media files are no longer available');
  });

  it('accepts an empty media list for projects that only contain generated text or blank frames', () => {
    expect(resolveMediaByAsset([]).size).toBe(0);
  });
});
