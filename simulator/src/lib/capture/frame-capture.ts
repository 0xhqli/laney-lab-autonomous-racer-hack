'use client';

import type * as THREE from 'three';
import { CAPTURE_CONFIG } from '@/lib/config/capture-config';
import { useCapturePreviewStore } from '@/lib/capture/capture-preview-store';
import { saveRunCapture, type IndexedRunCaptureMeta } from '@/lib/capture/frame-store';
import { publishLatestCameraFrame, resetLatestCameraFrame } from '@/lib/inference/camera-frame-buffer';

export interface CapturedFrame {
  timestamp_ms: number;
  jpeg: Blob;
  steering: number;
  throttle: number;
  speed: number;
}

export interface CaptureLabel {
  timestamp_ms: number;
  steering: number;
  throttle: number;
  speed: number;
}

export interface FinalizeCaptureInput {
  runId: string;
  trackId: string;
  driveMode: 'manual' | 'ai';
  durationMs: number;
  lapCount: number;
  bestLapMs: number | null;
  offTrackCount: number;
}

type CaptureSessionState = {
  frames: CapturedFrame[];
  busy: boolean;
  previewEveryNFrames: number;
};

const captureSession: CaptureSessionState = {
  frames: [],
  busy: false,
  previewEveryNFrames: 2,
};

let scratchCanvas: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let scratchPixels: Uint8Array | null = null;

/**
 * Lazily creates (or resizes) the single off-screen canvas and pixel buffer used
 * to read pixels out of the WebGL render target. Reusing a single scratch canvas
 * avoids repeated allocations on the hot frame-capture path.
 */
function ensureScratch(width: number, height: number) {
  if (!scratchCanvas) {
    scratchCanvas = document.createElement('canvas');
    scratchCanvas.width = width;
    scratchCanvas.height = height;
    scratchCtx = scratchCanvas.getContext('2d');
  }
  if (!scratchCtx || !scratchCanvas) {
    throw new Error('2D canvas unavailable for frame capture');
  }
  if (scratchCanvas.width !== width || scratchCanvas.height !== height) {
    scratchCanvas.width = width;
    scratchCanvas.height = height;
  }
  const expected = width * height * 4;
  if (!scratchPixels || scratchPixels.length !== expected) {
    scratchPixels = new Uint8Array(expected);
  }
  return { canvas: scratchCanvas, ctx: scratchCtx, pixels: scratchPixels };
}

/**
 * Flips the pixel buffer vertically.
 * WebGL's readPixels returns rows bottom-to-top (OpenGL convention), but
 * ImageData / canvas expects rows top-to-bottom.
 */
function flipRgbaY(src: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  const stride = width * 4;
  for (let y = 0; y < height; y++) {
    const srcStart = (height - 1 - y) * stride;
    const dstStart = y * stride;
    out.set(src.subarray(srcStart, srcStart + stride), dstStart);
  }
  return out;
}

/** Encodes the canvas contents as a JPEG Blob at the given quality (0–1). */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode JPEG frame'))),
      'image/jpeg',
      quality,
    );
  });
}

/** Clears the in-memory frame buffer and resets preview state for a new run. */
export function resetPendingCapturedFrames() {
  captureSession.frames = [];
  captureSession.busy = false;
  resetLatestCameraFrame();
  useCapturePreviewStore.getState().reset();
}

/** Returns the number of JPEG frames currently buffered in memory (not yet flushed to IndexedDB). */
export function getPendingCaptureFrameCount() {
  return captureSession.frames.length;
}

// Test helper: allows integration tests to populate a mocked capture buffer without WebGL.
export function __setPendingCapturedFramesForTest(frames: CapturedFrame[]) {
  captureSession.frames = [...frames];
  captureSession.busy = false;
  useCapturePreviewStore.getState().setBufferedFrames(captureSession.frames.length);
}

/**
 * Reads pixels from the WebGL render target, flips them vertically, encodes as JPEG,
 * and pushes the frame into the in-memory capture buffer.
 * Also publishes the raw RGBA pixels to the inference camera-frame buffer so the
 * ONNX model can consume them in the same tick.
 * Returns false if capture is disabled or if a previous capture is still in progress.
 */
export async function captureFrameFromRenderTarget(
  gl: THREE.WebGLRenderer,
  renderTarget: THREE.WebGLRenderTarget,
  label: CaptureLabel,
): Promise<boolean> {
  if (!CAPTURE_CONFIG.enabled) return false;
  if (captureSession.busy) return false;

  captureSession.busy = true;
  try {
    const width = CAPTURE_CONFIG.width;
    const height = CAPTURE_CONFIG.height;
    const { canvas, ctx, pixels } = ensureScratch(width, height);

    gl.readRenderTargetPixels(renderTarget, 0, 0, width, height, pixels);

    const imageData = ctx.createImageData(width, height);
    const flipped = flipRgbaY(pixels, width, height);
    imageData.data.set(flipped);
    ctx.putImageData(imageData, 0, 0);

    publishLatestCameraFrame({
      width,
      height,
      rgba: flipped,
      capturedAtMs: performance.now(),
      runTimestampMs: label.timestamp_ms,
    });

    const jpeg = await canvasToBlob(canvas, CAPTURE_CONFIG.jpegQuality);
    captureSession.frames.push({
      ...label,
      jpeg,
    });

    const previewStore = useCapturePreviewStore.getState();
    previewStore.setBufferedFrames(captureSession.frames.length);
    previewStore.setLastCaptureAt(performance.now());

    if (captureSession.frames.length % captureSession.previewEveryNFrames === 0) {
      previewStore.setPreview(canvas.toDataURL('image/jpeg', 0.5));
    }

    return true;
  } finally {
    captureSession.busy = false;
  }
}

/**
 * Flushes all buffered JPEG frames to IndexedDB under the given run ID.
 * Should be called when a run ends (from RunComplete). Returns the number of
 * frames saved, or 0 if the buffer was empty.
 */
export async function finalizeCapturedFramesToIndexedDb(input: FinalizeCaptureInput): Promise<number> {
  const frames = captureSession.frames;
  if (frames.length === 0) {
    return 0;
  }

  const meta: IndexedRunCaptureMeta = {
    runId: input.runId,
    createdAt: new Date().toISOString(),
    trackId: input.trackId,
    driveMode: input.driveMode,
    durationMs: input.durationMs,
    lapCount: input.lapCount,
    bestLapMs: input.bestLapMs,
    offTrackCount: input.offTrackCount,
    frameCount: frames.length,
    sourceFrameSize: { width: CAPTURE_CONFIG.width, height: CAPTURE_CONFIG.height },
  };

  await saveRunCapture(
    meta,
    frames.map((frame, frameIdx) => ({
      runId: input.runId,
      frameIdx,
      ...frame,
    })),
  );

  const count = frames.length;
  resetPendingCapturedFrames();
  return count;
}
