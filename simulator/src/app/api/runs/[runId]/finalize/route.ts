/**
 * POST /api/runs/[runId]/finalize — mark a run as complete and record final stats.
 * Accepts ended_at, duration_s, frame_count, lap_count, off_track_count, best_lap_ms.
 * Returns 404 if the run does not exist.
 */
import { NextResponse } from 'next/server';
import { finalizeRun } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/**
 * Coerces an unknown value to a finite number, returning undefined for
 * null / empty-string / NaN so optional numeric fields can be omitted.
 */
function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** Finalizes the run and returns the updated run record. */
export async function POST(req: Request, context: { params: Promise<{ runId: string }> }) {
  const { runId } = await context.params;
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Body must be an object' }, { status: 400 });
  }
  const input = payload as Record<string, unknown>;

  try {
    const run = finalizeRun(runId, {
      ended_at: typeof input.ended_at === 'string' ? input.ended_at : undefined,
      duration_s: toOptionalNumber(input.duration_s),
      frame_count: toOptionalNumber(input.frame_count),
      lap_count: toOptionalNumber(input.lap_count),
      off_track_count: toOptionalNumber(input.off_track_count),
      best_lap_ms: input.best_lap_ms === null ? null : toOptionalNumber(input.best_lap_ms),
    });
    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Run not found')) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to finalize run' }, { status: 500 });
  }
}
