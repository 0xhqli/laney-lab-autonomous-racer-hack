'use client';

/**
 * AI driver runtime state — Zustand store.
 * Tracks the ONNX model lifecycle (loading, ready, error), the most recent
 * steering prediction, and which control source is currently active
 * (learned model vs waypoint fallback).
 */
import { create } from 'zustand';

export type AiModelStatus = 'disabled' | 'idle' | 'loading' | 'ready' | 'error';
export type AiControlSource = 'waypoint' | 'model';
export type AiModelSelectionMode = 'active' | 'pinned';

interface AiDriverState {
  status: AiModelStatus;
  controlSource: AiControlSource;
  modelSelectionMode: AiModelSelectionMode;
  pinnedModelVersion: string | null;
  activeModelVersion: string | null;
  loadedModelVersion: string | null;
  predictedSteering: number | null;
  predictionFrameSeq: number | null;
  lastInferenceAtMs: number | null;
  error: string | null;
  setStatus: (status: AiModelStatus) => void;
  setActiveModelVersion: (version: string | null) => void;
  setPrediction: (steering: number, frameSeq: number) => void;
  setControlSource: (source: AiControlSource) => void;
  setModelSelectionMode: (mode: AiModelSelectionMode) => void;
  setPinnedModelVersion: (version: string | null) => void;
  setLoadedModelVersion: (version: string | null) => void;
  setError: (message: string | null) => void;
  resetRuntime: () => void;
}

export const useAiDriverStore = create<AiDriverState>((set) => ({
  status: 'idle',
  controlSource: 'waypoint',
  modelSelectionMode: 'active',
  pinnedModelVersion: null,
  activeModelVersion: null,
  loadedModelVersion: null,
  predictedSteering: null,
  predictionFrameSeq: null,
  lastInferenceAtMs: null,
  error: null,
  setStatus: (status) => set({ status }),
  setActiveModelVersion: (activeModelVersion) => set({ activeModelVersion }),
  setPrediction: (predictedSteering, predictionFrameSeq) => set({
    predictedSteering,
    predictionFrameSeq,
    lastInferenceAtMs: performance.now(),
    status: 'ready',
    error: null,
  }),
  setControlSource: (controlSource) => set({ controlSource }),
  setModelSelectionMode: (modelSelectionMode) => set({ modelSelectionMode }),
  setPinnedModelVersion: (pinnedModelVersion) => set({ pinnedModelVersion }),
  setLoadedModelVersion: (loadedModelVersion) => set({ loadedModelVersion }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  resetRuntime: () => set({
    predictedSteering: null,
    predictionFrameSeq: null,
    lastInferenceAtMs: null,
    controlSource: 'waypoint',
    loadedModelVersion: null,
  }),
}));
