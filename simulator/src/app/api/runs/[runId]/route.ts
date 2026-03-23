/**
 * GET /api/runs/[runId] — fetch a single run by ID.
 * Returns 404 if the run does not exist.
 */
import { NextResponse } from 'next/server';
import { getRunOrNull } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Returns the run object, or 404 if it is not found. */
export async function GET(_req: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  const run = getRunOrNull(runId);
  if (!run) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 });
  }
  return NextResponse.json(run);
}
