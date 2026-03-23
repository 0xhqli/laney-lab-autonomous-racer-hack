/**
 * GET /api/models — list available models.
 * Optional query param: limit (1–200, default 20).
 */
import { NextRequest, NextResponse } from 'next/server';
import { listModels } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Returns a list of models ordered by creation date descending. */
export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : 20;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 20;
  return NextResponse.json(listModels(safeLimit));
}
