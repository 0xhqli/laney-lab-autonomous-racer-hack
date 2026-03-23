'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAPTURE_CONFIG } from '@/lib/config/capture-config';
import { useGameStore } from '@/lib/stores/game-store';
import { useCapturePreviewStore } from '@/lib/capture/capture-preview-store';
import { captureFrameFromRenderTarget, resetPendingCapturedFrames } from '@/lib/capture/frame-capture';

/**
 * Renders a forward-facing car camera to an offscreen render target and captures
 * image frames for training data export.
 */
export function CarPOVCamera() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  // Offscreen render target sized to match the capture resolution (e.g. 160×120).
  // Linear filtering keeps pixel readback accurate for the JPEG encoder.
  const renderTarget = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(CAPTURE_CONFIG.width, CAPTURE_CONFIG.height);
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.texture.minFilter = THREE.LinearFilter;
    target.texture.magFilter = THREE.LinearFilter;
    target.depthBuffer = true;
    return target;
  }, []);
  // Dedicated perspective camera for the car's forward-facing POV.
  // Not attached to the scene graph — positioned manually each frame.
  const povCamera = useMemo(
    () => new THREE.PerspectiveCamera(CAPTURE_CONFIG.cameraFOV, CAPTURE_CONFIG.width / CAPTURE_CONFIG.height, 0.01, 250),
    [],
  );

  const lastCaptureMs = useRef(0);
  const lastRunStartTime = useRef(0);

  useEffect(() => () => {
    renderTarget.dispose();
  }, [renderTarget]);

  useFrame(() => {
    const store = useGameStore.getState();
    const isRecording = store.mode === 'driving' || store.mode === 'autonomous';
    const inRunSession = store.mode !== 'menu';
    useCapturePreviewStore.getState().setRecording(isRecording);

    if (inRunSession && store.runStartTime > 0 && store.runStartTime !== lastRunStartTime.current) {
      resetPendingCapturedFrames();
      lastCaptureMs.current = 0;
      lastRunStartTime.current = store.runStartTime;
    }

    const car = store.car;
    const forward = new THREE.Vector3(Math.sin(car.rotation), 0, Math.cos(car.rotation));
    const camPos = new THREE.Vector3(
      car.x + forward.x * CAPTURE_CONFIG.cameraForwardOffset,
      CAPTURE_CONFIG.cameraHeight,
      car.z + forward.z * CAPTURE_CONFIG.cameraForwardOffset,
    );
    const lookAt = new THREE.Vector3(
      car.x + forward.x * (CAPTURE_CONFIG.cameraForwardOffset + 2.0),
      CAPTURE_CONFIG.cameraHeight + 0.02,
      car.z + forward.z * (CAPTURE_CONFIG.cameraForwardOffset + 2.0),
    );

    povCamera.position.copy(camPos);
    povCamera.lookAt(lookAt);
    povCamera.updateMatrixWorld();

    if (!CAPTURE_CONFIG.enabled) return;

    const prevTarget = gl.getRenderTarget();
    gl.setRenderTarget(renderTarget);
    gl.clear();
    gl.render(scene, povCamera);
    gl.setRenderTarget(prevTarget);

    if (!isRecording) return;

    const now = performance.now();
    const minInterval = 1000 / CAPTURE_CONFIG.fps;
    if (now - lastCaptureMs.current < minInterval) return;
    lastCaptureMs.current = now;

    void captureFrameFromRenderTarget(gl, renderTarget, {
      timestamp_ms: Math.max(0, now - store.runStartTime),
      steering: store.car.steering,
      throttle: store.car.throttle,
      speed: store.car.speed,
    });
  });

  return null;
}
