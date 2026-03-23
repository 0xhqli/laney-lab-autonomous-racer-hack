/**
 * GET /api/models/[modelVersion] — fetch metadata for a specific model version.
 * Returns 404 if the version tag is not found.
 */
import { NextResponse } from 'next/server';
import { getModel } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Returns the model record for the given version tag, or 404 if not found. */
export async function GET(_req: Request, context: { params: Promise<{ modelVersion: string }> }) {
  const { modelVersion } = await context.params;
  const model = getModel(modelVersion);
  if (!model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  return NextResponse.json(model);
}
