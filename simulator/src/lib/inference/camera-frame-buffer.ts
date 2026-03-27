'use client';

export interface CameraFrameSnapshot {
  seq: number;
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  capturedAtMs: number;
  runTimestampMs: number;
}

// Single-frame buffer — the inference runner reads this on each poll tick.
let latestFrame: CameraFrameSnapshot | null = null;
// Monotonically increasing sequence number so the inference runner can detect new frames.
let seqCounter = 0;

/**
 * Stores the latest camera frame snapshot and increments the sequence counter.
 * Called by CarPOVCamera after each WebGL render.
 */
export function publishLatestCameraFrame(input: {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  capturedAtMs: number;
  runTimestampMs: number;
}) {
  latestFrame = {
    seq: ++seqCounter,
    width: input.width,
    height: input.height,
    rgba: new Uint8ClampedArray(input.rgba),
    capturedAtMs: input.capturedAtMs,
    runTimestampMs: input.runTimestampMs,
  };
}

/** Returns the most recently published camera frame, or null if no frame has been captured yet. */
export function getLatestCameraFrame(): CameraFrameSnapshot | null {
  return latestFrame;
}

/** Clears the frame buffer — called when a new run starts to avoid stale inference. */
export function resetLatestCameraFrame() {
  latestFrame = null;
}
