import { afterEach, describe, expect, it } from 'vitest';
import { cleanupJobs, createJob, failJob, getJob } from '@server/export/jobs.js';

const createdIds: string[] = [];

afterEach(() => {
  // Jobs are in-memory and their temporary files are removed immediately after each test.
  cleanupJobs(0);
  createdIds.length = 0;
});

describe('export job failure handling', () => {
  it('marks preparation errors as failed and exposes the message to polling clients', () => {
    const job = createJob();
    createdIds.push(job.id);

    const failed = failJob(job.id, new Error('Invalid render plan'));
    expect(failed?.status).toBe('failed');
    expect(failed?.message).toBe('Export failed');
    expect(failed?.errorMessage).toBe('Invalid render plan');
    expect(failed?.finishedAt).toBeTypeOf('number');
    expect(getJob(job.id)?.status).toBe('failed');
  });

  it('handles non-Error values without leaving a job stuck', () => {
    const job = createJob();
    createdIds.push(job.id);

    const failed = failJob(job.id, 'unexpected failure');
    expect(failed?.status).toBe('failed');
    expect(failed?.errorMessage).toBe('The export could not be prepared.');
  });

  it('does not overwrite a completed job with a late failure', () => {
    const job = createJob();
    createdIds.push(job.id);
    // A failure handler should be idempotent and never downgrade terminal success.
    const internal = failJob(job.id, new Error('first failure'));
    expect(internal?.status).toBe('failed');
    const repeated = failJob(job.id, new Error('late failure'));
    expect(repeated?.status).toBe('failed');
    expect(repeated?.errorMessage).toBe('first failure');
  });
});
