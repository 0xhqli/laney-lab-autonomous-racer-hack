/**
 * Camera capture configuration — controls the resolution, frame rate, and
 * physical placement of the car's front-facing POV camera used for training data collection.
 * These values must match what the Python training pipeline expects (160×120 input).
 */
export const CAPTURE_CONFIG = {
  /** Enable or disable image capture entirely. Set to false for pure telemetry runs. */
  enabled: true,
  /** Output image width in pixels — must match the model's input size. */
  width: 160,
  /** Output image height in pixels — must match the model's input size. */
  height: 120,
  /** Target capture rate in frames per second. Actual rate may be lower at high physics load. */
  fps: 10,
  /** JPEG compression quality (0–1). 0.7 balances file size and visual fidelity. */
  jpegQuality: 0.7,
  /** Horizontal field of view of the simulated camera in degrees. */
  cameraFOV: 70,
  /** Camera height above the ground plane (in scene units). */
  cameraHeight: 0.28,
  /** How far forward from the car's origin the camera is placed (in scene units). */
  cameraForwardOffset: 0.45,
  /** Whether to show the picture-in-picture camera feed overlay by default. */
  showPIP: true,
} as const;

