/**
 * GET /api/runs/[runId]/artifacts/[kind] — download a run artifact.
 * kind must be 'frames' (ZIP) or 'controls' (CSV).
 * Returns 404 if the run or artifact is not found.
 */
import { NextResponse } from 'next/server';
import { getRunArtifact } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/**
 * Streams the raw artifact bytes back with appropriate Content-Type and
 * Content-Disposition headers so the browser treats it as a file download.
 */
export async function GET(_req: Request, context: { params: Promise<{ runId: string; kind: string }> }) {
  const { runId, kind } = await context.params;
  if (kind !== 'frames' && kind !== 'controls') {
    return NextResponse.json({ error: 'Unsupported artifact kind' }, { status: 400 });
  }
  const artifact = getRunArtifact(runId, kind);
  if (!artifact) {
    return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(artifact), {
    status: 200,
    headers: {
      'Content-Type': kind === 'frames' ? 'application/zip' : 'text/csv',
      'Content-Disposition': `attachment; filename="${kind === 'frames' ? 'frames.zip' : 'controls.csv'}"`,
    },
  });
}
