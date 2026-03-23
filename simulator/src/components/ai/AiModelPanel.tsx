'use client';

import { useEffect, useState } from 'react';
import { Bot, RefreshCcw } from 'lucide-react';
import { isApiConfigured, listModels, type ModelRecordPayload } from '@/lib/api/api-client';
import { useAiDriverStore } from '@/lib/inference/ai-driver-store';
import { useGameStore } from '@/lib/stores/game-store';

/**
 * In-game AI model selector panel — lets the user choose between the server's
 * currently active model and a manually pinned version, and toggle between
 * the learned ONNX model and the waypoint demo AI.
 * Only shown when driveMode is 'ai'.
 */
export function AiModelPanel() {
  const driveMode = useGameStore((s) => s.driveMode);
  const mode = useGameStore((s) => s.mode);
  const selectionMode = useGameStore((s) => s.aiModelSelectionMode);
  const pinnedModelVersion = useGameStore((s) => s.aiPinnedModelVersion);
  const aiSteeringMode = useGameStore((s) => s.aiSteeringMode);
  const setSelectionMode = useGameStore((s) => s.setAiModelSelectionMode);
  const setPinnedModelVersion = useGameStore((s) => s.setAiPinnedModelVersion);
  const setAiSteeringMode = useGameStore((s) => s.setAiSteeringMode);
  const status = useAiDriverStore((s) => s.status);
  const source = useAiDriverStore((s) => s.controlSource);
  const activeModelVersion = useAiDriverStore((s) => s.activeModelVersion);
  const loadedModelVersion = useAiDriverStore((s) => s.loadedModelVersion);
  const error = useAiDriverStore((s) => s.error);

  const [models, setModels] = useState<ModelRecordPayload[]>([]);
  const [loading, setLoading] = useState(false);

  const visible = mode !== 'menu' && driveMode === 'ai';

  /** Fetches the latest model list from the server and updates local state. */
  async function refreshModels() {
    if (!isApiConfigured()) return;
    setLoading(true);
    try {
      setModels(await listModels(20));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    void refreshModels();
    const timer = window.setInterval(() => { void refreshModels(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [visible]);

  if (!visible) return null;

  const effectiveLabel = selectionMode === 'active'
    ? (activeModelVersion ?? 'none')
    : (pinnedModelVersion ?? 'none');

  return (
    <div className="absolute top-20 left-4 z-20 w-[310px] pointer-events-auto">
      <div className="rounded-2xl border border-gray-700/70 bg-black/65 backdrop-blur-sm p-4 text-white">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-400" />
            <div>
              <div className="text-xs uppercase tracking-wider text-gray-400">AI Model</div>
              <div className="text-sm font-medium text-gray-100">{effectiveLabel}</div>
            </div>
          </div>
          <button
            onClick={() => { void refreshModels(); }}
            className="p-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300"
            title="Refresh models"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <button
            onClick={() => setSelectionMode('active')}
            className={`px-2 py-1.5 rounded-lg border transition-colors ${
              selectionMode === 'active'
                ? 'border-blue-500/50 bg-blue-600/20 text-blue-300'
                : 'border-gray-700 bg-gray-900/60 text-gray-400 hover:text-white'
            }`}
          >
            Use Active
          </button>
          <button
            onClick={() => setSelectionMode('pinned')}
            className={`px-2 py-1.5 rounded-lg border transition-colors ${
              selectionMode === 'pinned'
                ? 'border-purple-500/50 bg-purple-600/20 text-purple-300'
                : 'border-gray-700 bg-gray-900/60 text-gray-400 hover:text-white'
            }`}
          >
            Pin Version
          </button>
        </div>

        <div className="mt-2">
          <select
            value={pinnedModelVersion ?? ''}
            onChange={(e) => setPinnedModelVersion(e.target.value || null)}
            disabled={models.length === 0}
            className="w-full rounded-lg border border-gray-700 bg-gray-900/80 px-3 py-2 text-sm text-gray-200 disabled:opacity-50"
          >
            <option value="">Select model version...</option>
            {models.map((m) => (
              <option key={m.model_version} value={m.model_version}>
                {m.model_version} · {m.status}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3">
          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-gray-500">Autonomy Source</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <button
              onClick={() => setAiSteeringMode('learned')}
              className={`px-2 py-1.5 rounded-lg border transition-colors ${
                aiSteeringMode === 'learned'
                  ? 'border-emerald-500/50 bg-emerald-600/20 text-emerald-300'
                  : 'border-gray-700 bg-gray-900/60 text-gray-400 hover:text-white'
              }`}
            >
              Learned Model
            </button>
            <button
              onClick={() => setAiSteeringMode('waypoint')}
              className={`px-2 py-1.5 rounded-lg border transition-colors ${
                aiSteeringMode === 'waypoint'
                  ? 'border-amber-500/50 bg-amber-600/20 text-amber-300'
                  : 'border-gray-700 bg-gray-900/60 text-gray-400 hover:text-white'
              }`}
            >
              Waypoint Demo
            </button>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Active API Model</span>
            <span className="font-mono text-gray-300">{activeModelVersion ?? 'none'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Loaded in Browser</span>
            <span className="font-mono text-purple-300">{loadedModelVersion ?? 'none'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Runtime</span>
            <span className={status === 'ready' ? 'text-green-300' : status === 'loading' ? 'text-yellow-300' : status === 'error' ? 'text-red-300' : 'text-gray-400'}>
              {status}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Steering Source</span>
            <span className={source === 'model' ? 'text-purple-300' : 'text-gray-300'}>
              {source === 'model' ? 'learned model' : 'waypoint fallback'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Mode Preference</span>
            <span className={aiSteeringMode === 'learned' ? 'text-emerald-300' : 'text-amber-300'}>
              {aiSteeringMode === 'learned' ? 'learned model' : 'waypoint demo'}
            </span>
          </div>
          {error && (
            <div className="mt-2 rounded-lg border border-red-900/40 bg-red-950/30 px-2 py-1.5 text-[11px] text-red-300 line-clamp-3" title={error}>
              {error}
            </div>
          )}
          {!isApiConfigured() && (
            <div className="mt-2 rounded-lg border border-yellow-900/40 bg-yellow-950/20 px-2 py-1.5 text-[11px] text-yellow-200">
              `NEXT_PUBLIC_API_URL` not configured
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
