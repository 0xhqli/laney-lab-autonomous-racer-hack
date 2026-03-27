/**
 * Camera capture preview state — Zustand store.
 * Holds the latest JPEG preview data URL (displayed in the CameraFeed HUD),
 * the number of frames currently buffered in memory, recording status, and
 * whether the picture-in-picture panel is visible.
 */
import { create } from 'zustand';
import { CAPTURE_CONFIG } from '@/lib/config/capture-config';

interface CapturePreviewState {
  previewDataUrl: string | null;
  bufferedFrames: number;
  isRecording: boolean;
  pipVisible: boolean;
  lastCaptureAt: number | null;
  setPreview: (dataUrl: string | null) => void;
  setBufferedFrames: (count: number) => void;
  setRecording: (value: boolean) => void;
  setPipVisible: (value: boolean) => void;
  togglePipVisible: () => void;
  setLastCaptureAt: (value: number | null) => void;
  reset: () => void;
}

export const useCapturePreviewStore = create<CapturePreviewState>((set) => ({
  previewDataUrl: null,
  bufferedFrames: 0,
  isRecording: false,
  pipVisible: CAPTURE_CONFIG.showPIP,
  lastCaptureAt: null,
  setPreview: (previewDataUrl) => set({ previewDataUrl }),
  setBufferedFrames: (bufferedFrames) => set({ bufferedFrames }),
  setRecording: (isRecording) => set({ isRecording }),
  setPipVisible: (pipVisible) => set({ pipVisible }),
  togglePipVisible: () => set((s) => ({ pipVisible: !s.pipVisible })),
  setLastCaptureAt: (lastCaptureAt) => set({ lastCaptureAt }),
  reset: () => set({ previewDataUrl: null, bufferedFrames: 0, isRecording: false, lastCaptureAt: null }),
}));

