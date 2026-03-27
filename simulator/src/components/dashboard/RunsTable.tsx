'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, Trash2, CheckSquare, Square, Download } from 'lucide-react';
import { flagAnomalies, type TrainingRun, type FlaggedRun } from '@/lib/data/training-data';

/**
 * Compact table of all training runs with anomaly flags,
 * row selection checkboxes, and batch delete.
 * Shows 6 default columns; Capture column only when at least one run has captures.
 */
export function RunsTable({
  runs,
  onSelect,
  selectedRun,
  onDeleteRuns,
  onDownloadRun,
}: {
  runs: TrainingRun[];
  onSelect: (run: TrainingRun) => void;
  selectedRun: TrainingRun | null;
  onDeleteRuns?: (ids: string[]) => void;
  onDownloadRun?: (run: TrainingRun) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const sorted = useMemo(() => [...runs].reverse(), [runs]);

  // Build a map of run id -> flags
  const flaggedMap = useMemo(() => {
    const flagged = flagAnomalies(runs);
    const map = new Map<string, FlaggedRun['flags']>();
    for (const f of flagged) map.set(f.run.id, f.flags);
    return map;
  }, [runs]);

  const flaggedIds = useMemo(() => new Set(flaggedMap.keys()), [flaggedMap]);
  const flaggedCount = flaggedIds.size;

  // Only show capture column when at least one run has captures
  const hasCaptureRuns = useMemo(() => runs.some((r) => r.hasFrameCapture), [runs]);

  /** Toggles the checkbox state for a single run row. */
  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  /** Selects all runs that have been flagged as potential anomalies. */
  function selectAllFlagged() {
    setChecked(new Set(flaggedIds));
  }

  /** Clears all row selections. */
  function selectNone() {
    setChecked(new Set());
  }

  /**
   * Confirms and deletes all checked runs.
   * Clears the selection after deletion regardless of outcome.
   */
  function handleDeleteChecked() {
    if (checked.size === 0) return;
    if (!confirm(`Delete ${checked.size} run(s)? This removes their training data permanently.`)) return;
    onDeleteRuns?.(Array.from(checked));
    setChecked(new Set());
  }

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 space-y-4">
      {/* Header + actions */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">All Training Runs</h3>
          <span className="text-xs text-gray-500">{runs.length} runs -- click a row to inspect</span>
        </div>
        <div className="flex items-center gap-2">
          {flaggedCount > 0 && (
            <button
              onClick={selectAllFlagged}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400 border border-yellow-800/40 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Select {flaggedCount} flagged
            </button>
          )}
          {checked.size > 0 && (
            <>
              <button
                onClick={selectNone}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={handleDeleteChecked}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/40 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete {checked.size}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Flagged runs banner */}
      {flaggedCount > 0 && (
        <div className="bg-yellow-900/15 border border-yellow-800/30 rounded-xl px-4 py-2.5 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
          <div className="text-xs text-yellow-300/80">
            <strong className="text-yellow-300">{flaggedCount} run(s) flagged</strong> as potentially bad training data.
            Review and delete if they would hurt model quality.
          </div>
        </div>
      )}

      {/* Table -- slimmed to 6 default columns + optional capture */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-900 z-10">
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="py-2 pr-2 w-8"></th>
              <th className="text-left py-2 pr-3">#</th>
              <th className="text-left py-2 pr-3">Track</th>
              <th className="text-left py-2 pr-3">Mode</th>
              <th className="text-right py-2 pr-3">Laps</th>
              <th className="text-right py-2 pr-3">Best Lap</th>
              {hasCaptureRuns && <th className="text-right py-2 pr-3">Capture</th>}
              <th className="text-right py-2">Time</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isSelected = selectedRun?.id === r.id;
              const isChecked = checked.has(r.id);
              const flags = flaggedMap.get(r.id);
              const isFlagged = !!flags;
              return (
                <tr
                  key={r.id}
                  className={`border-b border-gray-800/50 transition-colors cursor-pointer ${
                    isChecked ? 'bg-red-900/15' : isFlagged ? 'bg-yellow-900/10' : isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-800/30'
                  }`}
                  onClick={() => onSelect(r)}
                >
                  <td className="py-2.5 pr-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => toggleCheck(r.id)}
                      className="text-gray-500 hover:text-white transition-colors"
                    >
                      {isChecked
                        ? <CheckSquare className="w-4 h-4 text-red-400" />
                        : <Square className="w-4 h-4" />
                      }
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">
                    <span className="flex items-center gap-1.5">
                      {runs.length - i}
                      {isFlagged && (
                        <span title={flags!.map((f) => f.detail).join('; ')}>
                          <AlertTriangle className="w-3 h-3 text-yellow-400" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 capitalize text-gray-300">{r.trackId.replace('-', ' ')}</td>
                  <td className="py-2.5 pr-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      r.driveMode === 'ai' ? 'bg-purple-900/40 text-purple-400' : 'bg-blue-900/40 text-blue-400'
                    }`}>
                      {r.driveMode === 'ai' ? 'AI' : 'Manual'}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-gray-300">{r.lapCount}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-green-400">
                    {r.bestLapMs ? `${(r.bestLapMs / 1000).toFixed(2)}s` : '--'}
                  </td>
                  {hasCaptureRuns && (
                    <td className="py-2.5 pr-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => onDownloadRun?.(r)}
                        disabled={!r.hasFrameCapture || !onDownloadRun}
                        title={r.hasFrameCapture ? 'Download camera capture zip' : 'No image capture for this run'}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors disabled:opacity-30 disabled:cursor-not-allowed border-cyan-800/40 text-cyan-400 bg-cyan-900/20 enabled:hover:bg-cyan-900/40"
                      >
                        <Download className="w-3 h-3" />
                        {r.captureFrameCount ? r.captureFrameCount.toLocaleString() : '0'}
                      </button>
                    </td>
                  )}
                  <td className="py-2.5 text-right text-gray-500 text-xs whitespace-nowrap">
                    {new Date(r.timestamp).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
