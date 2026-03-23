'use client';

import { createRemoteRun, finalizeRemoteRun, getApiBaseUrl, isApiConfigured, uploadRunArtifact } from '@/lib/api/api-client';
import { getRunCaptureFileBlobs } from '@/lib/capture/frame-store';
import { getRuns, type TrainingRun } from '@/lib/data/training-data';
import { getOrCreateUserId } from '@/lib/user/user-identity';

const SYNC_QUEUE_KEY = 'deepracer-run-sync-queue';

type SyncStatus = 'pending' | 'syncing' | 'synced' | 'error';

export interface RunSyncEntry {
  localRunId: string;
  remoteRunId?: string;
  status: SyncStatus;
  attempts: number;
  lastError?: string;
  updatedAt: string;
}

interface SyncQueueState {
  entries: RunSyncEntry[];
}

// Guard against concurrent flush calls — only one flush is allowed in-flight at a time.
let flushInFlight: Promise<void> | null = null;

/** Returns the current UTC time as an ISO 8601 string. */
function nowIso() {
  return new Date().toISOString();
}

/** Reads the sync queue from localStorage, returning an empty queue if it doesn't exist or is corrupt. */
function loadQueue(): SyncQueueState {
  if (typeof window === 'undefined') return { entries: [] };
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw) as SyncQueueState;
    return { entries: Array.isArray(parsed.entries) ? parsed.entries : [] };
  } catch {
    return { entries: [] };
  }
}

/** Persists the sync queue state back to localStorage. */
function saveQueue(state: SyncQueueState) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(state));
}

/**
 * Inserts or updates an entry in the sync queue.
 * If an entry for localRunId already exists, the patch is merged on top of it.
 */
function upsertEntry(localRunId: string, patch?: Partial<RunSyncEntry>) {
  const state = loadQueue();
  const idx = state.entries.findIndex((e) => e.localRunId === localRunId);
  if (idx >= 0) {
    state.entries[idx] = {
      ...state.entries[idx],
      ...patch,
      updatedAt: nowIso(),
    };
  } else {
    state.entries.push({
      localRunId,
      status: 'pending',
      attempts: 0,
      updatedAt: nowIso(),
      ...patch,
    });
  }
  saveQueue(state);
  return state;
}

/** Looks up a training run in localStorage by its local ID. Returns null if not found. */
function getLocalRunById(localRunId: string): TrainingRun | null {
  return getRuns().find((r) => r.id === localRunId) ?? null;
}

/** Converts durationMs to seconds, clamped to 0 so the server never receives a negative value. */
function toDurationSeconds(run: TrainingRun): number {
  return Math.max(0, run.durationMs / 1000);
}

/**
 * Builds a CSV Blob from a run's control log.
 * Used as the fallback controls artifact when no image capture is available.
 */
function buildControlsCsvBlob(run: TrainingRun): Blob {
  const lines = ['frame_idx,timestamp_ms,steering,throttle,speed,x,z'];
  for (let idx = 0; idx < run.controlLog.length; idx++) {
    const frame = run.controlLog[idx];
    lines.push([
      idx,
      frame.t,
      frame.steering,
      frame.throttle,
      frame.speed,
      frame.x,
      frame.z,
    ].join(','));
  }
  return new Blob([lines.join('\n')], { type: 'text/csv' });
}

/**
 * Uploads a single run to the remote API:
 *   1. Creates the remote run record and gets upload URLs.
 *   2. Uploads image frames ZIP (if available) and the controls CSV.
 *   3. Finalizes the run with metadata (duration, lap count, etc.).
 * Updates the sync queue entry with the result (synced or error).
 */
async function syncSingleEntry(entry: RunSyncEntry): Promise<void> {
  const run = getLocalRunById(entry.localRunId);
  if (!run) {
    upsertEntry(entry.localRunId, { status: 'error', lastError: 'Local run not found', attempts: entry.attempts + 1 });
    return;
  }

  upsertEntry(entry.localRunId, { status: 'syncing', attempts: entry.attempts + 1, lastError: undefined });

  try {
    let remoteRunId = entry.remoteRunId;
    let uploadUrls: { frames: string; controls: string } | null = null;

    if (!remoteRunId) {
      const created = await createRemoteRun({
        user_id: getOrCreateUserId(),
        track_id: run.trackId,
        mode: run.driveMode === 'ai' ? 'autonomous' : 'manual',
        model_version: null,
        sim_build: 'simulator-local',
        client_build: 'next-web',
        local_run_id: run.id,
        started_at: run.timestamp,
      });
      remoteRunId = created.run_id;
      uploadUrls = created.upload_urls;
      upsertEntry(entry.localRunId, { remoteRunId });
    }

    let controlsCsv = buildControlsCsvBlob(run);
    if (run.hasFrameCapture) {
      const captureBlobs = await getRunCaptureFileBlobs(run.id);
      controlsCsv = captureBlobs.controlsCsv;
      await uploadRunArtifact(uploadUrls?.frames ?? `${getApiBaseUrl()}/api/runs/${remoteRunId}/frames`, captureBlobs.framesZip, 'frames.zip');
    }

    if (!uploadUrls) {
      const base = getApiBaseUrl() ?? '';
      uploadUrls = {
        frames: `${base}/api/runs/${remoteRunId}/frames`,
        controls: `${base}/api/runs/${remoteRunId}/controls`,
      };
    }

    await uploadRunArtifact(uploadUrls.controls, controlsCsv, 'controls.csv');
    await finalizeRemoteRun(remoteRunId, {
      ended_at: run.timestamp,
      duration_s: toDurationSeconds(run),
      frame_count: run.frames,
      lap_count: run.lapCount,
      off_track_count: run.offTrackCount,
      best_lap_ms: run.bestLapMs,
    });

    upsertEntry(entry.localRunId, { status: 'synced', remoteRunId, lastError: undefined });
  } catch (error) {
    upsertEntry(entry.localRunId, {
      status: 'error',
      lastError: error instanceof Error ? error.message : 'Unknown sync error',
    });
    throw error;
  }
}

/** Adds a run to the sync queue (or resets it to 'pending' if it previously errored). */
export function enqueueRunForSync(localRunId: string) {
  if (!isApiConfigured()) return;
  upsertEntry(localRunId, { status: 'pending', lastError: undefined });
}

/** Returns all entries currently in the sync queue (used by the dashboard to show sync status). */
export function listRunSyncQueue(): RunSyncEntry[] {
  return loadQueue().entries;
}

/**
 * Processes all pending/errored entries in the sync queue one at a time.
 * Stops on the first failure to avoid hammering a downed API.
 * If a flush is already in progress, returns the same promise (no concurrent flushes).
 */
export async function flushRunSyncQueue(): Promise<void> {
  if (!isApiConfigured()) return;
  if (flushInFlight) return flushInFlight;

  flushInFlight = (async () => {
    const state = loadQueue();
    const candidates = state.entries.filter((e) => e.status === 'pending' || e.status === 'error');
    for (const entry of candidates) {
      try {
        await syncSingleEntry(entry);
      } catch {
        // keep processing later attempts; stop current flush on first failure to avoid spamming a down API
        break;
      }
    }
  })().finally(() => {
    flushInFlight = null;
  });

  return flushInFlight;
}
