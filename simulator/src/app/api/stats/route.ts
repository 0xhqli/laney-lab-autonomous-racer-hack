/** GET /api/stats — top-level aggregate stats (total runs, laps, users, models). */
import { NextResponse } from 'next/server';
import { getStats } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Returns aggregate statistics from the shared SQLite data store. */
export async function GET() {
  return NextResponse.json(getStats());
}
