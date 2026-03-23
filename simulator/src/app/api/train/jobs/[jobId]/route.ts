/**
 * GET /api/train/jobs/[jobId] — fetch a single training job by ID.
 * Returns 404 if no job with that ID exists.
 */
import { NextResponse } from 'next/server';
import { getTrainingJob } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Returns the training job record, or 404 if it is not found. */
export async function GET(_req: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = getTrainingJob(jobId);
  if (!job) {
    return NextResponse.json({ error: 'Training job not found' }, { status: 404 });
  }
  return NextResponse.json(job);
}
