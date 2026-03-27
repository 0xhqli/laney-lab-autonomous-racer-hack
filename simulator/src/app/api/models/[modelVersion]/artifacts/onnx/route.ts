/**
 * GET /api/models/[modelVersion]/artifacts/onnx — placeholder ONNX artifact download.
 * The simulator does not store ONNX files itself; the real training server provides them.
 * This endpoint verifies the model exists and then returns 404 with a helpful message.
 */
import { NextResponse } from 'next/server';
import { getModel } from '@/lib/server/shared-data-store';

export const runtime = 'nodejs';

/** Confirms the model version exists, then returns 404 — ONNX artifacts are served by the trainer. */
export async function GET(_req: Request, context: { params: Promise<{ modelVersion: string }> }) {
  const { modelVersion } = await context.params;
  const model = getModel(modelVersion);
  if (!model) {
    return NextResponse.json({ error: 'Model not found' }, { status: 404 });
  }
  return NextResponse.json({ error: 'ONNX artifact is not available for this model version' }, { status: 404 });
}
