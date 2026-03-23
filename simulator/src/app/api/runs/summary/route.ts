/** GET /api/runs/summary — aggregate stats across all runs (total laps, runs, etc.). */
import { NextResponse } from 'next/server';
import { getStats } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Returns aggregate run statistics from the shared data store. */
export async function GET() {
  return NextResponse.json(getStats());
}
