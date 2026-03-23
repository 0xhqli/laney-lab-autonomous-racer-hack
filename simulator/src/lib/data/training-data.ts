/**
 * Training data persistence — saves driving runs to localStorage.
 * Each run captures: track, lap count, control frames, timestamps.
 * This accumulates across sessions and will later sync to the API.
 */

import type { ControlFrame } from '@/lib/stores/game-store';

export interface TrainingRun {
  id: string;
  trackId: string;
  driveMode: 'manual' | 'ai';
  lapCount: number;
  frames: number;
  hasFrameCapture?: boolean;
  captureFrameCount?: number;
  bestLapMs: number | null;
  offTrackCount: number;
  durationMs: number;
  timestamp: string;
  controlLog: ControlFrame[];
}

const STORAGE_KEY = 'deepracer-training-runs';
const STATS_KEY = 'deepracer-stats';

export interface AccumulatedStats {
  totalRuns: number;
  totalLaps: number;
  totalFrames: number;
  totalDriveTimeMs: number;
  bestLapMs: number | null;
}

/** Returns a zeroed-out stats object, used as the initial value or when localStorage is unavailable. */
function getDefaultStats(): AccumulatedStats {
  return { totalRuns: 0, totalLaps: 0, totalFrames: 0, totalDriveTimeMs: 0, bestLapMs: null };
}

/** Reads the accumulated stats object from localStorage, or returns defaults on SSR/parse error. */
export function getStats(): AccumulatedStats {
  if (typeof window === 'undefined') return getDefaultStats();
  try {
    const raw = localStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : getDefaultStats();
  } catch {
    return getDefaultStats();
  }
}

/**
 * Reads all stored training runs from localStorage.
 * Adds default values for newer fields (hasFrameCapture, captureFrameCount) to ensure
 * backwards compatibility with runs saved before those fields existed.
 */
export function getRuns(): TrainingRun[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const runs = raw ? JSON.parse(raw) as TrainingRun[] : [];
    return runs.map((run) => ({
      ...run,
      hasFrameCapture: run.hasFrameCapture ?? false,
      captureFrameCount: run.captureFrameCount ?? 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Saves a completed run to localStorage and updates the accumulated stats.
 * Keeps only the last 100 runs with full control logs; older runs have their
 * logs stripped to conserve storage. Falls back to more aggressive trimming if
 * the write fails due to storage quota.
 */
export function saveRun(run: Omit<TrainingRun, 'id' | 'timestamp'>): TrainingRun {
  const fullRun: TrainingRun = {
    ...run,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  // Save run (keep last 100 runs with control logs, older ones get logs trimmed)
  const runs = getRuns();
  runs.push(fullRun);

  // Keep only last 100 full runs; older ones drop controlLog to save space
  if (runs.length > 100) {
    for (let i = 0; i < runs.length - 100; i++) {
      runs[i].controlLog = [];
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    // Storage full — keep metadata but warn user
    const trimmed = runs.slice(-50).map(r => ({ ...r, controlLog: [] }));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      console.warn('Storage full: control logs trimmed from older runs. Export data regularly to avoid loss.');
    } catch {
      const minimal = runs.slice(-10).map(r => ({ ...r, controlLog: [] }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
    }
  }

  // TODO: Replace localStorage with IndexedDB for larger storage capacity
  // TODO: Implement API upload (POST /api/runs/{id}/upload) — once available,
  //       uploaded runs should be cleared from local storage

  // Update accumulated stats
  const stats = getStats();
  stats.totalRuns += 1;
  stats.totalLaps += run.lapCount;
  stats.totalFrames += run.frames;
  stats.totalDriveTimeMs += run.durationMs;
  if (run.bestLapMs !== null) {
    stats.bestLapMs = stats.bestLapMs === null
      ? run.bestLapMs
      : Math.min(stats.bestLapMs, run.bestLapMs);
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));

  return fullRun;
}

/** Deletes a single run by ID and recalculates the accumulated stats. */
export function deleteRun(id: string): void {
  const runs = getRuns().filter((r) => r.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  recalculateStats(runs);
}

/** Deletes multiple runs by ID in a single localStorage write and recalculates stats. */
export function deleteRuns(ids: string[]): void {
  const idSet = new Set(ids);
  const runs = getRuns().filter((r) => !idSet.has(r.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  recalculateStats(runs);
}

/**
 * Updates the frame capture status flags for a run after image frames have been
 * saved to IndexedDB. Does nothing if the run ID is not found.
 */
export function updateRunCaptureStatus(id: string, values: { hasFrameCapture: boolean; captureFrameCount: number }): void {
  const runs = getRuns();
  let changed = false;
  const updated = runs.map((r) => {
    if (r.id !== id) return r;
    changed = true;
    return { ...r, ...values };
  });
  if (!changed) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Recomputes accumulated stats from scratch by iterating over all provided runs.
 * Called after any delete operation to keep the stats in sync.
 */
function recalculateStats(runs: TrainingRun[]): void {
  const stats: AccumulatedStats = {
    totalRuns: runs.length,
    totalLaps: runs.reduce((s, r) => s + r.lapCount, 0),
    totalFrames: runs.reduce((s, r) => s + r.frames, 0),
    totalDriveTimeMs: runs.reduce((s, r) => s + r.durationMs, 0),
    bestLapMs: null,
  };
  for (const r of runs) {
    if (r.bestLapMs !== null) {
      stats.bestLapMs = stats.bestLapMs === null ? r.bestLapMs : Math.min(stats.bestLapMs, r.bestLapMs);
    }
  }
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export type AnomalyFlag = 'long_duration' | 'no_laps' | 'high_offtrack' | 'no_movement';

export interface FlaggedRun {
  run: TrainingRun;
  flags: { type: AnomalyFlag; label: string; detail: string }[];
}

/**
 * Scans a list of runs for data quality issues and returns only those with flags.
 * Flags include: unusually long duration, zero laps despite many frames,
 * excessive off-track events, and near-zero movement during a long session.
 */
export function flagAnomalies(runs: TrainingRun[]): FlaggedRun[] {
  if (runs.length === 0) return [];

  // Compute median duration for runs with at least 1 lap
  const durations = runs.filter((r) => r.lapCount > 0).map((r) => r.durationMs).sort((a, b) => a - b);
  const medianDuration = durations.length > 0 ? durations[Math.floor(durations.length / 2)] : 60_000;
  // Threshold: 5x median or 5 minutes, whichever is larger
  const durationThreshold = Math.max(medianDuration * 5, 5 * 60_000);

  const flagged: FlaggedRun[] = [];

  for (const run of runs) {
    const flags: FlaggedRun['flags'] = [];

    // Long duration
    if (run.durationMs > durationThreshold) {
      const mins = (run.durationMs / 60_000).toFixed(1);
      flags.push({ type: 'long_duration', label: 'Long run', detail: `${mins} min — ${(durationThreshold / 60_000).toFixed(0)}+ min is unusual` });
    }

    // No laps completed but significant frames
    if (run.lapCount === 0 && run.frames > 100) {
      flags.push({ type: 'no_laps', label: 'No laps', detail: `${run.frames.toLocaleString()} frames captured but 0 laps completed` });
    }

    // High off-track rate (>50% of frames estimated)
    if (run.lapCount > 0 && run.offTrackCount > run.lapCount * 10) {
      flags.push({ type: 'high_offtrack', label: 'High off-track', detail: `${run.offTrackCount} off-track events in ${run.lapCount} laps` });
    }

    // No meaningful movement (very few frames for the duration)
    if (run.durationMs > 30_000 && run.frames < 10) {
      flags.push({ type: 'no_movement', label: 'No movement', detail: `Only ${run.frames} frames in ${(run.durationMs / 1000).toFixed(0)}s` });
    }

    if (flags.length > 0) {
      flagged.push({ run, flags });
    }
  }

  return flagged;
}

/** Serializes all stored training runs to a pretty-printed JSON string. */
export function exportRunsAsJSON(): string {
  const runs = getRuns();
  return JSON.stringify(runs, null, 2);
}

/** Serializes all stored training runs to a flat CSV string (metadata only, no control log). */
export function exportRunsAsCSV(): string {
  const runs = getRuns();
  const lines = ['id,trackId,driveMode,lapCount,frames,bestLapMs,durationMs,timestamp'];
  for (const r of runs) {
    lines.push(`${r.id},${r.trackId},${r.driveMode},${r.lapCount},${r.frames},${r.bestLapMs ?? ''},${r.durationMs},${r.timestamp}`);
  }
  return lines.join('\n');
}
