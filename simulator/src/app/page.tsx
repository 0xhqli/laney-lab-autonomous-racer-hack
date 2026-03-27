'use client';

import dynamic from 'next/dynamic';
import { useGameStore } from '@/lib/stores/game-store';
import { TrackSelect } from '@/components/game/TrackSelect';
import { GameHUD } from '@/components/hud/GameHUD';
import { Minimap } from '@/components/minimap/Minimap';
import { KeyboardHandler } from '@/components/game/KeyboardHandler';
import { PauseOverlay } from '@/components/game/PauseOverlay';
import { AutoControls } from '@/components/game/AutoControls';
import { RunComplete } from '@/components/game/RunComplete';
import { SpeedLimiter } from '@/components/hud/SpeedLimiter';
import { ManualDriveControls } from '@/components/hud/ManualDriveControls';
import { ControlsHUD } from '@/components/hud/ControlsHUD';
import { CameraFeed } from '@/components/hud/CameraFeed';
import { ModelInferenceRunner } from '@/components/ai/ModelInferenceRunner';
import { AiModelPanel } from '@/components/ai/AiModelPanel';

// GameScene uses Three.js/WebGL so it must be loaded client-side only (no SSR).
const GameScene = dynamic(
  () => import('@/components/game/GameScene').then((m) => ({ default: m.GameScene })),
  { ssr: false },
);

/**
 * Main simulator page — switches between the track selection menu and the in-game view.
 * All HUD overlays, the 3D scene, and background workers are mounted here when in-game.
 */
export default function Home() {
  const mode = useGameStore((s) => s.mode);
  const aiModelSelectionMode = useGameStore((s) => s.aiModelSelectionMode);
  const aiPinnedModelVersion = useGameStore((s) => s.aiPinnedModelVersion);

  // Any mode other than 'menu' means a game session is active.
  const inGame = mode !== 'menu';

  return (
    <>
      {/* Global keyboard listener — always mounted regardless of page state */}
      <KeyboardHandler />
      {!inGame ? (
        <TrackSelect />
      ) : (
        <div className="relative w-screen h-screen overflow-hidden bg-black">
          {/* Background ONNX inference runner — polls the camera buffer and writes predicted steering */}
          <ModelInferenceRunner
            selectionMode={aiModelSelectionMode}
            pinnedModelVersion={aiPinnedModelVersion}
          />
          {/* Three.js 3D scene: track, car, cameras, particles */}
          <GameScene />
          {/* 2D overlays layered on top of the canvas */}
          <GameHUD />
          <Minimap />
          <PauseOverlay />
          <AutoControls />
          <SpeedLimiter />
          <ManualDriveControls />
          <ControlsHUD />
          <CameraFeed />
          <AiModelPanel />
          <RunComplete />
        </div>
      )}
    </>
  );
}
