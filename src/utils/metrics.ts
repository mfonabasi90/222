/**
 * metrics.ts — Facial metric computation in canonical frame
 * 
 * All metrics computed AFTER pose normalization.
 * Each metric includes: value, CI, quality flag, identity weight, age stability.
 * Occluded metrics are flagged and excluded from scoring.
 */

import { Point, distance, angle2D, midpoint, bootstrapUncertainty, UncertaintyResult } from './geometry';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Quality = 'good' | 'fair' | 'poor' | 'occluded';

export interface MetricResult {
  name: string;
  category: string;
  value: number;
  unit: string;
  uncertainty: UncertaintyResult;
  quality: Quality;
  isOccluded: boolean;
  identityWeight: number;  // 0-1: how informative for identity
  ageStability: number;    // 0-1: how stable across ages
  styleSensitivity: number; // 0-1: how affected by styling/makeup
  leftRightConsistency: number; // 0-1: 1=perfect match, 0=very different
  notes: string;
}

export interface OcclusionMap {
  leftEye: boolean;
  rightEye: boolean;
  nose: boolean;
  mouth: boolean;
  leftBrow: boolean;
  rightBrow: boolean;
  jaw: boolean;
  overallConfidence: number;
}

// ─── Occlusion Detection ─────────────────────────────────────────────────────
// Heuristic: detect anomalies in landmark positions that suggest occlusion

export function detectOcclusion(landmarks: Point[]): OcclusionMap {
  const result: OcclusionMap = {
    leftEye: false,
    rightEye: false,
    nose: false,
    mouth: false,
    leftBrow: false,
    rightBrow: false,
    jaw: false,
    overallConfidence: 1.0,
  };

  // Check eye aspect ratios (abnormally small = possibly occluded)
  const leftEAR = computeEyeAspectRatio(landmarks, 'left');
  const rightEAR = computeEyeAspectRatio(landmarks, 'right');

  // Normal EAR is ~0.25-0.35. Below 0.15 suggests occlusion or closed eye
  if (leftEAR < 0.1) { result.leftEye = true; result.overallConfidence *= 0.7; }
  if (rightEAR < 0.1) { result.rightEye = true; result.overallConfidence *= 0.7; }

  // Check inter-eye distance consistency
  const leftEyeWidth = distance(landmarks[36], landmarks[39]);
  const rightEyeWidth = distance(landmarks[42], landmarks[45]);
  const ratio = leftEyeWidth / rightEyeWidth;
  if (ratio < 0.5 || ratio > 2.0) {
    // Very asymmetric - one eye might be occluded
    if (ratio < 0.5) { result.leftEye = true; }
    if (ratio > 2.0) { result.rightEye = true; }
    result.overallConfidence *= 0.8;
  }

  // Check jaw line smoothness (jagged = possibly occluded by hand)
  const jawSmoothness = computeJawSmoothness(landmarks);
  if (jawSmoothness > 15) { // High curvature variance
    result.jaw = true;
    result.overallConfidence *= 0.8;
  }

  // Check if landmarks are in physically plausible positions
  // Nose should be between eyes horizontally
  const noseX = landmarks[30].x;
  const leftEyeX = landmarks[36].x;
  const rightEyeX = landmarks[45].x;
  if (noseX < Math.min(leftEyeX, rightEyeX) || noseX > Math.max(leftEyeX, rightEyeX)) {
    result.nose = true;
    result.overallConfidence *= 0.6;
  }

  // Mouth width vs eye width ratio (should be ~1.0-1.5)
  const mouthWidth = distance(landmarks[48], landmarks[54]);
  const eyeWidth = distance(landmarks[36], landmarks[45]);
  const mouthEyeRatio = mouthWidth / eyeWidth;
  if (mouthEyeRatio < 0.4 || mouthEyeRatio > 2.5) {
    result.mouth = true;
    result.overallConfidence *= 0.7;
  }

  return result;
}

function computeEyeAspectRatio(landmarks: Point[], side: 'left' | 'right'): number {
  const offset = side === 'left' ? 0 : 6;
  const p1 = landmarks[37 + offset]; // top
  const p2 = landmarks[40 + offset]; // bottom
  const p3 = landmarks[36 + offset]; // outer
  const p4 = landmarks[39 + offset]; // inner

  const vertical = distance(p1, p2);
  const horizontal = distance(p3, p4);
  return horizontal > 0 ? vertical / horizontal : 0;
}

function computeJawSmoothness(landmarks: Point[]): number {
  // Compute curvature variance along jaw line (landmarks 0-16)
  let totalCurvature = 0;
  for (let i = 1; i < 16; i++) {
    const prev = landmarks[i - 1];
    const curr = landmarks[i];
    const next = landmarks[i + 1];
    const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
    const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
    let diff = angle2 - angle1;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    totalCurvature += Math.abs(diff);
  }
  return totalCurvature / 15; // Average curvature
}

// ─── Metric Computation ──────────────────────────────────────────────────────
// All metrics computed in CANONICAL frame (after pose normalization)

export function computeAllMetrics(
  canonicalLandmarks: Point[],
  occlusion: OcclusionMap
): MetricResult[] {
  const metrics: MetricResult[] = [];

  // 1. Canthal Tilt (inner-to-outer eye angle, in canonical frame)
  // This is an IDENTITY-STABLE trait
  metrics.push(computeCanthalTilt(canonicalLandmarks, 'left', occlusion.leftEye));
  metrics.push(computeCanthalTilt(canonicalLandmarks, 'right', occlusion.rightEye));

  // 2. Eye Aspect Ratio
  metrics.push(computeEyeAspectRatioMetric(canonicalLandmarks, 'left', occlusion.leftEye));
  metrics.push(computeEyeAspectRatioMetric(canonicalLandmarks, 'right', occlusion.rightEye));

  // 3. Inter-ocular Distance / Face Width ratio
  metrics.push(computeInterocularRatio(canonicalLandmarks, occlusion));

  // 4. Nose Width / Face Width ratio
  metrics.push(computeNoseWidthRatio(canonicalLandmarks, occlusion));

  // 5. Nose Length / Face Height ratio
  metrics.push(computeNoseLengthRatio(canonicalLandmarks, occlusion));

  // 6. Mouth Width / Face Width ratio
  metrics.push(computeMouthWidthRatio(canonicalLandmarks, occlusion));

  // 7. Mouth Aspect Ratio (height/width)
  metrics.push(computeMouthAspectRatio(canonicalLandmarks, occlusion));

  // 8. Face Height / Width ratio
  metrics.push(computeFaceRatio(canonicalLandmarks, occlusion));

  // 9. Jaw Angle
  metrics.push(computeJawAngle(canonicalLandmarks, occlusion));

  // 10. Cheek Width / Face Width ratio
  metrics.push(computeCheekWidthRatio(canonicalLandmarks, occlusion));

  // 11. Eyebrow Angle (in canonical frame)
  metrics.push(computeBrowAngle(canonicalLandmarks, 'left', occlusion.leftBrow));
  metrics.push(computeBrowAngle(canonicalLandmarks, 'right', occlusion.rightBrow));

  // 12. Philtrum Length (nose bottom to lip top) / Face Height
  metrics.push(computePhiltrumRatio(canonicalLandmarks, occlusion));

  // 13. Forehead Height (brow to hairline estimate) / Face Height
  metrics.push(computeForeheadRatio(canonicalLandmarks, occlusion));

  // 14. Ear placement on the eye–mouth vertical axis (stable across ages).
  //     face-api's 68-point model has no ear landmarks, so this is only
  //     available when an extended landmark set is present (>68 points).
  if (canonicalLandmarks.length > 68) {
    metrics.push(computeEarPositionRatio(canonicalLandmarks, occlusion));
  }

  // Add L/R consistency checks
  addLeftRightConsistency(metrics);

  return metrics;
}

// ─── Individual Metric Functions ─────────────────────────────────────────────

function computeCanthalTilt(lm: Point[], side: 'left' | 'right', occluded: boolean): MetricResult {
  const innerIdx = side === 'left' ? 39 : 42;
  const outerIdx = side === 'left' ? 36 : 45;

  const metricFn = (pts: Point[]) => angle2D(pts[innerIdx], pts[outerIdx]);
  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: `${side === 'left' ? 'Left' : 'Right'} Canthal Tilt`,
    category: 'Eye Shape',
    value: uncertainty.mean,
    unit: '°',
    uncertainty,
    quality: occluded ? 'occluded' : uncertainty.std < 3 ? 'good' : 'fair',
    isOccluded: occluded,
    identityWeight: 0.9,   // Very identity-informative
    ageStability: 0.95,    // Very stable across ages
    styleSensitivity: 0.1, // Not affected by styling
    leftRightConsistency: 1.0, // Filled in later
    notes: 'Angle from inner to outer eye corner in canonical frame. Highly identity-stable.',
  };
}

function computeEyeAspectRatioMetric(lm: Point[], side: 'left' | 'right', occluded: boolean): MetricResult {
  const offset = side === 'left' ? 0 : 6;
  const metricFn = (pts: Point[]) => {
    const vertical = distance(pts[37 + offset], pts[40 + offset]);
    const horizontal = distance(pts[36 + offset], pts[39 + offset]);
    return horizontal > 0 ? vertical / horizontal : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: `${side === 'left' ? 'Left' : 'Right'} Eye Aspect Ratio`,
    category: 'Eye Shape',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occluded ? 'occluded' : uncertainty.std < 0.03 ? 'good' : 'fair',
    isOccluded: occluded,
    identityWeight: 0.7,
    ageStability: 0.9,
    styleSensitivity: 0.2,
    leftRightConsistency: 1.0,
    notes: 'Vertical/horizontal eye ratio. Stable across ages.',
  };
}

function computeInterocularRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const iod = distance(pts[39], pts[42]); // inner corners
    const fw = distance(pts[2], pts[14]);   // jaw width
    return fw > 0 ? iod / fw : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);
  const occluded = occ.leftEye || occ.rightEye || occ.jaw;

  return {
    name: 'Inter-ocular / Face Width',
    category: 'Face Proportions',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occluded ? 'occluded' : uncertainty.std < 0.02 ? 'good' : 'fair',
    isOccluded: occluded,
    identityWeight: 0.8,
    ageStability: 0.7, // Decreases slightly with age
    styleSensitivity: 0.05,
    leftRightConsistency: 1.0,
    notes: 'Decreases slightly from child to adult as face widens.',
  };
}

function computeNoseWidthRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const noseW = distance(pts[31], pts[35]);
    const fw = distance(pts[2], pts[14]);
    return fw > 0 ? noseW / fw : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Nose Width / Face Width',
    category: 'Nose',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occ.nose ? 'occluded' : uncertainty.std < 0.02 ? 'good' : 'fair',
    isOccluded: occ.nose,
    identityWeight: 0.6,
    ageStability: 0.75, // Increases slightly with age
    styleSensitivity: 0.1,
    leftRightConsistency: 1.0,
    notes: 'Nose width increases slightly with age (cartilage growth).',
  };
}

function computeNoseLengthRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const noseL = distance(pts[27], pts[30]);
    const fh = distance(pts[27], pts[8]);
    return fh > 0 ? noseL / fh : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Nose Length / Face Height',
    category: 'Nose',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occ.nose ? 'occluded' : uncertainty.std < 0.03 ? 'good' : 'fair',
    isOccluded: occ.nose,
    identityWeight: 0.65,
    ageStability: 0.7,
    styleSensitivity: 0.05,
    leftRightConsistency: 1.0,
    notes: 'Nose grows throughout life; ratio increases from child to adult.',
  };
}

function computeMouthWidthRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const mw = distance(pts[48], pts[54]);
    const fw = distance(pts[2], pts[14]);
    return fw > 0 ? mw / fw : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Mouth Width / Face Width',
    category: 'Mouth',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occ.mouth ? 'occluded' : uncertainty.std < 0.02 ? 'good' : 'fair',
    isOccluded: occ.mouth,
    identityWeight: 0.5,
    ageStability: 0.8,
    styleSensitivity: 0.3, // Can be affected by expression/makeup
    leftRightConsistency: 1.0,
    notes: 'Relatively stable but can vary with expression.',
  };
}

function computeMouthAspectRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const mh = distance(pts[51], pts[57]);
    const mw = distance(pts[48], pts[54]);
    return mw > 0 ? mh / mw : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Mouth Aspect Ratio (H/W)',
    category: 'Mouth',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occ.mouth ? 'occluded' : uncertainty.std < 0.03 ? 'good' : 'fair',
    isOccluded: occ.mouth,
    identityWeight: 0.35,
    ageStability: 0.6,
    styleSensitivity: 0.5, // Very affected by expression, makeup
    leftRightConsistency: 1.0,
    notes: 'Low reliability: highly expression-dependent. Use with caution.',
  };
}

function computeFaceRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const fh = distance(pts[27], pts[8]);
    const fw = distance(pts[2], pts[14]);
    return fw > 0 ? fh / fw : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Face Height / Width',
    category: 'Face Shape',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occ.jaw ? 'occluded' : uncertainty.std < 0.03 ? 'good' : 'fair',
    isOccluded: occ.jaw,
    identityWeight: 0.5,
    ageStability: 0.5, // Changes significantly with age
    styleSensitivity: 0.1,
    leftRightConsistency: 1.0,
    notes: 'Changes significantly child→adult. Must be age-adjusted.',
  };
}

function computeJawAngle(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const left = pts[2];
    const chin = pts[8];
    const right = pts[14];
    const a1 = Math.atan2(left.y - chin.y, left.x - chin.x);
    const a2 = Math.atan2(right.y - chin.y, right.x - chin.x);
    let angle = (a2 - a1) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    return angle;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Jaw Angle',
    category: 'Jaw',
    value: uncertainty.mean,
    unit: '°',
    uncertainty,
    quality: occ.jaw ? 'occluded' : uncertainty.std < 5 ? 'good' : 'fair',
    isOccluded: occ.jaw,
    identityWeight: 0.75,
    ageStability: 0.65,
    styleSensitivity: 0.1,
    leftRightConsistency: 1.0,
    notes: 'Jaw becomes more angular with age. Moderately identity-informative.',
  };
}

function computeCheekWidthRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const cheekW = distance(pts[1], pts[15]);
    const fw = distance(pts[2], pts[14]);
    return fw > 0 ? cheekW / fw : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Cheek Width / Jaw Width',
    category: 'Cheeks',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occ.jaw ? 'occluded' : uncertainty.std < 0.02 ? 'good' : 'fair',
    isOccluded: occ.jaw,
    identityWeight: 0.5,
    ageStability: 0.6, // Baby fat decreases with age
    styleSensitivity: 0.15,
    leftRightConsistency: 1.0,
    notes: 'Decreases from child to adult as baby fat reduces.',
  };
}

function computeBrowAngle(lm: Point[], side: 'left' | 'right', occluded: boolean): MetricResult {
  const innerIdx = side === 'left' ? 17 : 22;
  const outerIdx = side === 'left' ? 21 : 26;

  const metricFn = (pts: Point[]) => angle2D(pts[innerIdx], pts[outerIdx]);
  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: `${side === 'left' ? 'Left' : 'Right'} Eyebrow Angle`,
    category: 'Eyebrows',
    value: uncertainty.mean,
    unit: '°',
    uncertainty,
    quality: occluded ? 'occluded' : uncertainty.std < 4 ? 'good' : 'fair',
    isOccluded: occluded,
    identityWeight: 0.4,
    ageStability: 0.7,
    styleSensitivity: 0.6, // Heavily affected by grooming/makeup
    leftRightConsistency: 1.0,
    notes: 'Moderately identity-informative but styling-sensitive.',
  };
}

function computePhiltrumRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    const philtrum = distance(pts[33], pts[51]); // nose bottom to upper lip
    const fh = distance(pts[27], pts[8]);
    return fh > 0 ? philtrum / fh : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);
  const occluded = occ.nose || occ.mouth;

  return {
    name: 'Philtrum / Face Height',
    category: 'Mid-face',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: occluded ? 'occluded' : uncertainty.std < 0.02 ? 'good' : 'fair',
    isOccluded: occluded,
    identityWeight: 0.6,
    ageStability: 0.8,
    styleSensitivity: 0.1,
    leftRightConsistency: 1.0,
    notes: 'Relatively stable across ages. Identity-informative.',
  };
}

function computeForeheadRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  const metricFn = (pts: Point[]) => {
    // Approximate forehead: distance from brow center to top of face (estimated)
    const browCenter = midpoint(pts[21], pts[22]);
    const faceTop = pts[27]; // bridge of nose (approximate top reference)
    const forehead = Math.abs(faceTop.y - browCenter.y);
    const fh = distance(pts[27], pts[8]);
    return fh > 0 ? forehead / fh : 0;
  };

  const uncertainty = bootstrapUncertainty(lm, metricFn);

  return {
    name: 'Forehead / Face Height',
    category: 'Face Shape',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: uncertainty.std < 0.03 ? 'good' : 'fair',
    isOccluded: false,
    identityWeight: 0.4,
    ageStability: 0.5, // Decreases with age as face elongates
    styleSensitivity: 0.2, // Hair can affect
    leftRightConsistency: 1.0,
    notes: 'Forehead proportion decreases child→adult.',
  };
}

/**
 * Ear placement ratio — vertical position of the earlobe/ear span relative to the
 * eye-to-mouth axis. Anthropologically one of the most age-invariant registrations
 * on the head (the ear top tracks the eye line, the ear bottom tracks the nose base),
 * which makes it a useful cross-age identity cue when ears are visible.
 *
 * Requires an extended landmark set (>68 points); face-api's 68-point model has no
 * ear points, so this metric is simply absent for standard detections.
 */
function computeEarPositionRatio(lm: Point[], occ: OcclusionMap): MetricResult {
  // Extended indices beyond 67 are assumed to be [left tragus, left helix top,
  // right tragus, right helix top] in that order.
  const base = 68;
  const hasPoints = lm.length >= base + 4;

  const metricFn = (pts: Point[]) => {
    if (pts.length < base + 4) return 0;
    const eyeLineY = (pts[39].y + pts[42].y) / 2;            // inner canthi
    const mouthLineY = (pts[51].y + pts[57].y) / 2;          // lip midlines
    const earTopY = (pts[base + 1].y + pts[base + 3].y) / 2; // helix tops
    const span = mouthLineY - eyeLineY;
    return Math.abs(span) > 1 ? (earTopY - eyeLineY) / span : 0;
  };

  const uncertainty = hasPoints
    ? bootstrapUncertainty(lm, metricFn)
    : { mean: 0, std: 0, ci95: [0, 0] as [number, number], nSamples: 0 };

  return {
    name: 'Ear Position / Eye-Mouth Axis',
    category: 'Ears',
    value: uncertainty.mean,
    unit: '',
    uncertainty,
    quality: !hasPoints || occ.jaw ? 'occluded' : uncertainty.std < 0.05 ? 'good' : 'fair',
    isOccluded: !hasPoints,
    identityWeight: 0.7,
    ageStability: 0.9, // registration stays constant even though the ear grows
    styleSensitivity: 0.3, // hair coverage
    leftRightConsistency: 1.0,
    notes:
      'Ear-top vs eye→mouth band. Nearly immune to ageing, but needs both ears visible and uncovered.',
  };
}

// ─── Left/Right Consistency ──────────────────────────────────────────────────

function addLeftRightConsistency(metrics: MetricResult[]): void {
  // Find paired metrics (left/right of same type)
  const pairs: [string, string][] = [
    ['Left Canthal Tilt', 'Right Canthal Tilt'],
    ['Left Eye Aspect Ratio', 'Right Eye Aspect Ratio'],
    ['Left Eyebrow Angle', 'Right Eyebrow Angle'],
  ];

  for (const [leftName, rightName] of pairs) {
    const left = metrics.find((m) => m.name === leftName);
    const right = metrics.find((m) => m.name === rightName);
    if (!left || !right) continue;

    // Compute consistency: how close are the two values relative to their uncertainty
    const diff = Math.abs(left.value - right.value);
    const combinedStd = Math.sqrt(left.uncertainty.std ** 2 + right.uncertainty.std ** 2);
    const consistency = combinedStd > 0 ? Math.max(0, 1 - diff / (3 * combinedStd)) : 1;

    left.leftRightConsistency = consistency;
    right.leftRightConsistency = consistency;

    // Flag if very inconsistent
    if (consistency < 0.3 && !left.isOccluded && !right.isOccluded) {
      left.notes += ' ⚠️ L/R mismatch detected — possible detection error or genuine asymmetry.';
      right.notes += ' ⚠️ L/R mismatch detected — possible detection error or genuine asymmetry.';
      if (left.quality === 'good') left.quality = 'fair';
      if (right.quality === 'good') right.quality = 'fair';
    }
  }
}
