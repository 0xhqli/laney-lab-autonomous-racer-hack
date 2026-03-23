'use client';

import { useEffect } from 'react';
import type * as Ort from 'onnxruntime-web';
import { CAPTURE_CONFIG } from '@/lib/config/capture-config';
import { fetchActiveModelVersion, getModelOnnxDownloadUrl, isApiConfigured } from '@/lib/api/api-client';
import { getLatestCameraFrame } from '@/lib/inference/camera-frame-buffer';
import { useAiDriverStore } from '@/lib/inference/ai-driver-store';
import { useGameStore } from '@/lib/stores/game-store';

const MODEL_REFRESH_MS = 30_000;
const INFERENCE_POLL_MS = 100;
const STALE_PREDICTION_MS = 800;

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Converts an RGBA pixel array (HWC layout, uint8 0–255) to a float32 tensor
 * in NCHW layout (batch=1, channels=3, height, width) normalized to 0–1.
 * This matches the input format expected by the trained PyTorch/ONNX model.
 */
function rgbaToNchwFloat32(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const hw = width * height;
  const out = new Float32Array(3 * hw);
  for (let i = 0; i < hw; i++) {
    const base = i * 4;
    out[i] = rgba[base] / 255;
    out[hw + i] = rgba[base + 1] / 255;
    out[hw * 2 + i] = rgba[base + 2] / 255;
  }
  return out;
}

/**
 * Background ONNX inference runner — renders nothing but drives the AI steering.
 * On each tick (every 100 ms while in autonomous mode) it:
 *   1. Checks if a new camera frame is available.
 *   2. Runs the ONNX model to predict a steering value.
 *   3. Writes the prediction to the AI driver store for Car3D to consume.
 * Also periodically reloads the model from the server (every 30 s) so a
 * newly trained model is picked up without a page reload.
 */
export function ModelInferenceRunner(props: {
  selectionMode: 'active' | 'pinned';
  pinnedModelVersion: string | null;
}) {
  const { selectionMode, pinnedModelVersion } = props;
  useEffect(() => {
    let disposed = false;
    let ort: typeof Ort | null = null;
    let session: Ort.InferenceSession | null = null;
    let loadedVersion: string | null = null;
    let loadPromise: Promise<void> | null = null;
    let lastModelRefreshAt = 0;
    let lastProcessedSeq = -1;
    let inferenceBusy = false;

    const aiStore = useAiDriverStore.getState();
    if (!isApiConfigured()) {
      aiStore.setStatus('disabled');
      aiStore.setActiveModelVersion(null);
      aiStore.setLoadedModelVersion(null);
      aiStore.setError(null);
      return () => undefined;
    }

    /**
     * Downloads and creates the ONNX inference session if it isn't loaded yet,
     * or if the target version has changed. `force` bypasses the refresh interval
     * cache and is used when the target version is known to have changed.
     */
    async function ensureModelSession(force = false) {
      if (loadPromise) {
        return loadPromise;
      }
      loadPromise = (async () => {
        try {
          if (disposed) return;
          if (!ort) {
            ort = await import('onnxruntime-web');
          }

          const pinnedTargetChanged = selectionMode === 'pinned'
            && !!pinnedModelVersion
            && loadedVersion !== pinnedModelVersion;
          const now = Date.now();
          if (!force && !pinnedTargetChanged && now - lastModelRefreshAt < MODEL_REFRESH_MS && session) {
            return;
          }
          lastModelRefreshAt = now;
          useAiDriverStore.getState().setStatus('loading');

          const activeVersion = await fetchActiveModelVersion();
          const aiRuntime = useAiDriverStore.getState();
          aiRuntime.setActiveModelVersion(activeVersion);
          const targetVersion = selectionMode === 'pinned'
            ? (pinnedModelVersion || activeVersion)
            : activeVersion;

          if (!targetVersion) {
            session = null;
            loadedVersion = null;
            useAiDriverStore.getState().setLoadedModelVersion(null);
            useAiDriverStore.getState().setStatus('idle');
            return;
          }

          if (!force && session && loadedVersion === targetVersion) {
            useAiDriverStore.getState().setLoadedModelVersion(targetVersion);
            useAiDriverStore.getState().setStatus('ready');
            return;
          }

          const url = getModelOnnxDownloadUrl(targetVersion);
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Failed to download ONNX model (${res.status})`);
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'] });
          loadedVersion = targetVersion;
          useAiDriverStore.getState().setLoadedModelVersion(targetVersion);
          useAiDriverStore.getState().setError(null);
          useAiDriverStore.getState().setStatus('ready');
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          session = null;
          loadedVersion = null;
          useAiDriverStore.getState().setLoadedModelVersion(null);
          useAiDriverStore.getState().setError(message);
          useAiDriverStore.getState().setControlSource('waypoint');
        } finally {
          loadPromise = null;
        }
      })();
      return loadPromise;
    }

    /**
     * Runs one inference cycle: grabs the latest camera frame, runs the ONNX
     * session, and writes the predicted steering to the AI driver store.
     * Skips silently if the game isn't in autonomous mode, the session isn't ready,
     * or a previous inference is still in-flight.
     */
    async function tick() {
      if (disposed) return;

      const mode = useGameStore.getState().mode;
      if (mode !== 'autonomous') {
        useAiDriverStore.getState().setControlSource('waypoint');
        return;
      }

      const aiStateBeforeLoad = useAiDriverStore.getState();
      const selectedVersion = selectionMode === 'pinned'
        ? (pinnedModelVersion || aiStateBeforeLoad.activeModelVersion)
        : aiStateBeforeLoad.activeModelVersion;
      const mustSwapModel = !!selectedVersion && loadedVersion !== selectedVersion;

      if (mustSwapModel) {
        await ensureModelSession(true);
      } else {
        await ensureModelSession();
      }
      if (disposed || !session || !ort) return;
      if (inferenceBusy) return;

      const frame = getLatestCameraFrame();
      if (!frame) return;
      if (frame.seq === lastProcessedSeq) return;
      if (frame.width !== CAPTURE_CONFIG.width || frame.height !== CAPTURE_CONFIG.height) return;

      inferenceBusy = true;
      try {
        const inputData = rgbaToNchwFloat32(frame.rgba, frame.width, frame.height);
        const inputName = session.inputNames[0] ?? 'input';
        const inputTensor = new ort.Tensor('float32', inputData, [1, 3, frame.height, frame.width]);
        const outputs = await session.run({ [inputName]: inputTensor });
        const firstOutput = outputs[session.outputNames[0] ?? Object.keys(outputs)[0]];
        if (!firstOutput || !('data' in firstOutput)) {
          throw new Error('Model output missing');
        }
        const outData = firstOutput.data as Float32Array | number[];
        const steering = clamp(Number(outData[0] ?? 0), -1, 1);
        useAiDriverStore.getState().setPrediction(steering, frame.seq);
        lastProcessedSeq = frame.seq;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        useAiDriverStore.getState().setError(message);
        useAiDriverStore.getState().setControlSource('waypoint');
      } finally {
        inferenceBusy = false;
      }
    }

    const preload = () => { void ensureModelSession(true); };
    void ensureModelSession(true);
    const interval = window.setInterval(() => { void tick(); }, INFERENCE_POLL_MS);
    const refreshInterval = window.setInterval(preload, MODEL_REFRESH_MS);

    const staleInterval = window.setInterval(() => {
      const s = useAiDriverStore.getState();
      if (s.lastInferenceAtMs && performance.now() - s.lastInferenceAtMs > STALE_PREDICTION_MS) {
        s.setControlSource('waypoint');
      }
    }, 250);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.clearInterval(refreshInterval);
      window.clearInterval(staleInterval);
    };
  }, [selectionMode, pinnedModelVersion]);

  return null;
}
