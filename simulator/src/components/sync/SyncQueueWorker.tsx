'use client';

import { useEffect } from 'react';
import { flushRunSyncQueue } from '@/lib/api/run-sync-queue';

/**
 * Background sync worker — renders nothing but keeps the run-sync queue draining.
 * Flushes on mount (for runs queued during a previous session), whenever the
 * browser comes back online, and on a 30-second polling interval.
 */
export function SyncQueueWorker() {
  useEffect(() => {
    // Attempt to flush any runs that were queued in a previous session.
    void flushRunSyncQueue();

    // Re-flush as soon as the browser regains network connectivity.
    const onOnline = () => {
      void flushRunSyncQueue();
    };
    window.addEventListener('online', onOnline);

    // Periodic flush in case the run was queued during this session.
    const timer = window.setInterval(() => {
      void flushRunSyncQueue();
    }, 30_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
