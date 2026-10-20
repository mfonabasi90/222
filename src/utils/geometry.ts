/**
 * geometry.ts — Pose estimation, canonical frame rotation, uncertainty, lens correction
 * 
 * Key insight: all angles/ratios must be computed in a CANONICAL FRONTAL frame,
 * never the image frame. This eliminates pose contamination from similarity scores.
 */

import exifr from 'exifr';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface Pose {
  roll: number;   // degrees, rotation around optical axis
  pitch: number;  // degrees, rotation around horizontal axis
  yaw: number;    // degrees, rotation around vertical axis
  confidence: number; // 0-1
}

export interface LensInfo {
  focalLength35mm: number | null;
  estimatedFocalLength: number | null;
  distortionWarning: boolean;
  distortionFactor: number; // 1.0 = no distortion, >1 = barrel
}

export interface UncertaintyResult {
  mean: number;
  std: number;
  ci95: [number, number];
  nSamples: number;
}

// ─── Canonical 3D Face Model ─────────────────────────────────────────────────
// Based on average adult craniofacial measurements (Farkas 1994)
// Maps to dlib-68 landmark indices

export const CANONICAL_3D_MODEL: { index: number; point: Point3D }[] = [
  { index: 30, point: { x: 0.0, y: 0.0, z: 0.0 } },           // Nose tip
  { index: 8, point: { x: 0.0, y: -63.6, z: -12.5 } },        // Chin
  { index: 36, point: { x: -43.3, y: 32.7, z: -26.0 } },      // Left eye outer
  { index: 45, point: { x: 43.3, y: 32.7, z: -26.0 } },       // Right eye outer
  { index: 39, point: { x: -30.0, y: 32.7, z: -26.0 } },      // Left eye inner
  { index: 42, point: { x: 30.0, y: 32.7, z: -26.0 } },       // Right eye inner
  { index: 48, point: { x: -28.9, y: -28.9, z: -24.1 } },     // Left mouth corner
  { index: 54, point: { x: 28.9, y: -28.9, z: -24.1 } },      // Right mouth corner
];

// ─── Basic Geometry ──────────────────────────────────────────────────────────

export function distance(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function angle2D(from: Point, to: Point): number {
  return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function rotate2D(p: Point, center: Point, angleDeg: number): Point {
  const rad = (-angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

// ─── Pose Estimation ─────────────────────────────────────────────────────────
// Uses 6 key landmarks + canonical 3D model to estimate head pose.
// Simplified approach: roll from inter-ocular line, yaw/pitch from 3D-2D correspondences.

export function estimatePose(landmarks: Point[]): Pose {
  const leftEyeOuter = landmarks[36];
  const rightEyeOuter = landmarks[45];
  const noseTip = landmarks[30];
  const chin = landmarks[8];
  const leftMouth = landmarks[48];
  const rightMouth = landmarks[54];

  // Roll: angle of inter-ocular line from horizontal (screen-space convention,
  // consistent with rotate2D which rotates CW for positive angles)
  const roll = angle2D(leftEyeOuter, rightEyeOuter);

  // Eye center and inter-ocular distance
  const eyeCenter = midpoint(leftEyeOuter, rightEyeOuter);
  const iod = distance(leftEyeOuter, rightEyeOuter);

  if (iod < 10) {
    return { roll, pitch: 0, yaw: 0, confidence: 0.1 };
  }

  // Roll-correct nose position for yaw estimation (rotate by +roll to undo tilt)
  const correctedNose = rotate2D(noseTip, eyeCenter, roll);
  const noseOffsetX = (correctedNose.x - eyeCenter.x) / iod;

  // Yaw: nose horizontal offset. In frontal view, nose is centered.
  // When head turns, nose shifts toward the turned side.
  // Approximate: 1 IOD offset ≈ 60° yaw (empirical)
  const yaw = noseOffsetX * 60;

  // Pitch: vertical relationship between nose, eyes, and chin
  const correctedChin = rotate2D(chin, eyeCenter, roll);
  const eyeToChin = correctedChin.y - eyeCenter.y;
  const eyeToNose = correctedNose.y - eyeCenter.y;

  // In frontal view, nose is ~35-45% of the way from eyes to chin
  // When head tilts up, nose moves up relative to this ratio
  const noseRatio = eyeToNose / eyeToChin;
  const pitch = (noseRatio - 0.4) * 50; // Empirical scaling

  // Confidence based on how well the landmarks fit expected proportions
  const mouthCenter = midpoint(leftMouth, rightMouth);
  const correctedMouth = rotate2D(mouthCenter, eyeCenter, roll);
  const mouthOffsetX = Math.abs((correctedMouth.x - eyeCenter.x) / iod);

  // Lower confidence if landmarks are asymmetric (suggesting extreme pose or detection error)
  const symmetryScore = 1 - Math.min(1, mouthOffsetX * 2);
  const poseScore = 1 - Math.min(1, (Math.abs(yaw) + Math.abs(pitch)) / 90);
  const confidence = Math.max(0.1, symmetryScore * 0.5 + poseScore * 0.5);

  return { roll, pitch, yaw, confidence };
}

// ─── Canonical Frame Rotation ────────────────────────────────────────────────
// Rotates all landmarks into a canonical frontal view by undoing estimated pose.

export function canonicalizeLandmarks(landmarks: Point[], pose: Pose): Point[] {
  const eyeCenter = midpoint(landmarks[36], landmarks[45]);

  // Step 1: Roll correction (exact 2D rotation). pose.roll is the measured screen
  // tilt; rotate2D(p, c, roll) undoes it because rotate2D applies -angle internally.
  let corrected = landmarks.map((p) => rotate2D(p, eyeCenter, pose.roll));

  // Step 1b: Center the face horizontally on the vertical midline through the
  // eye center. After de-rotation this removes residual in-plane offset so the
  // canonical frame is upright AND centered before angles are displayed/measured.
  {
    const jawMid = midpoint(corrected[2], corrected[14]);
    const dx = eyeCenter.x - jawMid.x;
    corrected = corrected.map((p) => ({ x: p.x + dx, y: p.y }));
  }

  // Step 2: Yaw correction (approximate perspective undistortion)
  // When head turns by yaw angle, the face appears compressed on the far side
  // We apply a horizontal expansion to compensate. The correction factor is
  // clamped so extreme/unreliable yaw estimates cannot blow up the geometry.
  const yawRad = (pose.yaw * Math.PI) / 180;
  const yawFactor = Math.min(1.6, 1 / Math.max(0.5, Math.cos(yawRad)));

  corrected = corrected.map((p) => ({
    x: eyeCenter.x + (p.x - eyeCenter.x) * yawFactor,
    y: p.y,
  }));

  // Step 3: Pitch correction (approximate vertical scaling)
  const pitchRad = (pose.pitch * Math.PI) / 180;
  const pitchFactor = 1 / Math.max(0.6, Math.cos(pitchRad));

  corrected = corrected.map((p) => ({
    x: p.x,
    y: eyeCenter.y + (p.y - eyeCenter.y) * pitchFactor,
  }));

  return corrected;
}

// ─── Bootstrap Uncertainty ───────────────────────────────────────────────────
// Adds Gaussian jitter to landmarks and recomputes a metric to estimate uncertainty.

export function bootstrapUncertainty(
  landmarks: Point[],
  metricFn: (landmarks: Point[]) => number,
  sigma: number = 2.0,
  nSamples: number = 100
): UncertaintyResult {
  const values: number[] = [];

  for (let i = 0; i < nSamples; i++) {
    const jittered = landmarks.map((p) => ({
      x: p.x + gaussianRandom() * sigma,
      y: p.y + gaussianRandom() * sigma,
    }));
    values.push(metricFn(jittered));
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  // Sort for percentile-based CI
  const sorted = [...values].sort((a, b) => a - b);
  const ci95: [number, number] = [
    sorted[Math.floor(nSamples * 0.025)],
    sorted[Math.floor(nSamples * 0.975)],
  ];

  return { mean, std, ci95, nSamples };
}

function gaussianRandom(): number {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ─── Precision Rounding ──────────────────────────────────────────────────────
// Round a value to match its confidence interval width (no false precision)

export function roundToPrecision(value: number, ci: [number, number]): number {
  const width = ci[1] - ci[0];
  if (width <= 0 || !isFinite(width)) return value;

  // Find the number of decimal places that match the CI width
  const decimals = Math.max(0, Math.ceil(-Math.log10(width)) + 1);
  const factor = 10 ** Math.min(decimals, 4);
  return Math.round(value * factor) / factor;
}

export function formatWithCI(value: number, ci: [number, number], unit: string = ''): string {
  const rounded = roundToPrecision(value, ci);
  const ciRounded0 = roundToPrecision(ci[0], ci);
  const ciRounded1 = roundToPrecision(ci[1], ci);
  return `${rounded}${unit} [${ciRounded0}, ${ciRounded1}]`;
}

// ─── EXIF / Lens ─────────────────────────────────────────────────────────────

export async function readLensInfo(imageSource: string | File, faceSizeRatio: number): Promise<LensInfo> {
  let focalLength35mm: number | null = null;

  try {
    let source: Blob | string;
    if (typeof imageSource === 'string') {
      // Convert data URL to blob
      const res = await fetch(imageSource);
      source = await res.blob();
    } else {
      source = imageSource;
    }
    const exif = await exifr.parse(source, {
      pick: ['FocalLength', 'FocalLengthIn35mmFormat', 'Model'],
    });
    focalLength35mm = exif?.FocalLengthIn35mmFormat || exif?.FocalLength || null;
  } catch {
    // EXIF not available (common for screenshots, web images)
  }

  // Heuristic: if face takes up >60% of frame, likely a selfie with wide-angle lens
  const estimatedFocalLength = focalLength35mm || estimateFocalFromFaceSize(faceSizeRatio);
  const distortionWarning = estimatedFocalLength !== null && estimatedFocalLength < 28;
  const distortionFactor = estimatedFocalLength !== null
    ? Math.max(1.0, 50 / estimatedFocalLength * 0.1 + 1.0)
    : 1.0;

  return {
    focalLength35mm,
    estimatedFocalLength,
    distortionWarning,
    distortionFactor,
  };
}

function estimateFocalFromFaceSize(faceSizeRatio: number): number | null {
  // If face fills >50% of frame, likely <35mm equivalent (selfie wide-angle)
  if (faceSizeRatio > 0.6) return 24;
  if (faceSizeRatio > 0.4) return 35;
  if (faceSizeRatio > 0.25) return 50;
  if (faceSizeRatio > 0.15) return 85;
  return null;
}

// ─── Lens Undistortion (simplified barrel correction) ────────────────────────

export function undistortPoint(p: Point, center: Point, k: number): Point {
  // Simple barrel distortion correction
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const r2 = dx * dx + dy * dy;
  const factor = 1 + k * r2 * 0.00001; // Normalized
  return {
    x: center.x + dx * factor,
    y: center.y + dy * factor,
  };
}

export function undistortLandmarks(landmarks: Point[], lensInfo: LensInfo, imageSize: { width: number; height: number }): Point[] {
  if (!lensInfo.distortionWarning) return landmarks;

  const center = { x: imageSize.width / 2, y: imageSize.height / 2 };
  const k = (lensInfo.distortionFactor - 1.0) * 5; // Distortion coefficient
  return landmarks.map((p) => undistortPoint(p, center, k));
}
