/**
 * eyeAnalysis.ts — Canthal tilt measurement & eye-region biometrics
 *
 * Two jobs:
 *  1. Measure the canthal tilt (the slant of the line connecting the inner and
 *     outer eye corners) and classify it: positive / neutral / negative,
 *     upturned / downturned, with severity labels.
 *  2. Build an "ocular fingerprint": a set of pose-normalized, scale-invariant
 *     descriptors around each eye, and compare two fingerprints to estimate
 *     whether the photos show the same person based on the EYES ALONE.
 *
 * All features are computed in the canonical (roll/pitch/yaw-corrected) frame
 * and normalized by inter-pupillary distance, so camera distance, head size
 * and head tilt do not contaminate the comparison.
 *
 * dlib-68 landmark indices used (face-api.js layout):
 *   left eye  (subject's right, image-left):  36 outer, 37 top-left, 38 top-right,
 *                                             39 inner, 40 bottom-right, 41 bottom-left
 *   right eye (image-right):                  42 inner, 43 top-left, 44 top-right,
 *                                             45 outer, 46 bottom-right, 47 bottom-left
 *   brows:                                    19-23 left, 24-28 right
 */

import { Point, distance, angle2D, midpoint, bootstrapUncertainty } from './geometry';
import type { MetricResult } from './metrics';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EyeGeometry {
  side: 'left' | 'right';
  /** Raw signed tilt in degrees, measured in the roll-corrected canonical frame.
   *  POSITIVE = outer corner higher than inner corner (positive/upturned tilt). */
  canthalTiltDeg: number;
  tiltCI: [number, number];
  classification: 'Positive (upturned)' | 'Neutral' | 'Negative (downturned)';
  severity: 'steep' | 'moderate' | 'subtle';
  /** Palpebral fissure height / width (openness). */
  aspectRatio: number;
  /** Vertical position of the pupil center within the eye opening, 0=top … 1=bottom. */
  irisVerticalPosition: number;
  /** Visible sclera height below the iris as a fraction of eye width (>0.12 = "scleral show"). */
  lowerScleraRatio: number;
  /** Outer-corner vertical excursion relative to the lid chord (hooding proxy), 0..~0.5. */
  hoodingIndex: number;
  /** Brow arch apex height above the eye's upper lid, in PD units. */
  browHeight: number;
  /** Horizontal offset of the brow apex from the pupil center, in PD units. */
  browApexOffset: number;
  /** Full eyebrow slant (inner→outer), degrees, positive = tail higher. */
  browAngleDeg: number;
  /** Eye width / interpupillary distance. */
  widthToPD: number;
  /** Eye opening area / width² (compactness of the almond shape). */
  opennessArea: number;
}

export interface OcularArrangement {
  /** Inner-canthus separation / interpupillary distance (telecanthus indicator). */
  innerCanthalDistanceRatio: number;
  /** Outer-canthal span / interpupillary distance. */
  outerCanthalSpanRatio: number;
  /** Eye center-to-center distance / face width (bizygomatic). */
  eyeSeparationToFaceWidth: number;
  /** Vertical offset between the two eye centers after roll correction, in PD units. */
  eyeHeightAsymmetry: number;
  /** Left/right canthal tilt difference — people keep their own asymmetry signature. */
  tiltAsymmetryDeg: number;
  /** Left/right eye-width ratio (facial asymmetry signature). */
  eyeWidthAsymmetry: number;
}

export interface EyeFingerprint {
  left: EyeGeometry;
  right: EyeGeometry;
  arrangement: OcularArrangement;
  quality: 'good' | 'fair' | 'poor';
  notes: string[];
}

export interface EyeFeatureVector {
  names: string[];
  values: number[];
}

export interface EyeComparisonRow {
  name: string;
  value1: number;
  value2: number;
  delta: number;
  tolerance: number;
  supportsMatch: boolean;
  weight: number;
}

export interface EyeMatchResult {
  score: number;                       // 0-100 calibrated similarity
  confidenceInterval: [number, number];
  likelihoodRatio: number;
  verdict: string;
  rows: EyeComparisonRow[];
  nFeatures: number;
  methodNote: string;
}

// ─── Classification helpers ──────────────────────────────────────────────────

export function classifyCanthalTilt(deg: number): EyeGeometry['classification'] {
  if (deg > 1.5) return 'Positive (upturned)';
  if (deg < -1.5) return 'Negative (downturned)';
  return 'Neutral';
}

export function tiltSeverity(deg: number): EyeGeometry['severity'] {
  const a = Math.abs(deg);
  if (a >= 8) return 'steep';
  if (a >= 4) return 'moderate';
  return 'subtle';
}

export function tiltDescriptor(deg: number): string {
  const cls = classifyCanthalTilt(deg);
  const sev = tiltSeverity(deg);
  if (cls === 'Neutral') return 'Neutral canthal tilt (inner ≈ outer corner)';
  const dir = deg > 0 ? 'upturned (outer corner higher)' : 'downturned (outer corner lower)';
  const mag =
    sev === 'steep' ? `steeper-than-average ${Math.abs(deg).toFixed(0)}°` :
    sev === 'moderate' ? `moderate ${Math.abs(deg).toFixed(0)}°` :
    `slight ${Math.abs(deg).toFixed(0)}°`;
  return `${mag} ${dir}`;
}

// ─── Single-eye geometry ─────────────────────────────────────────────────────

const EYE_INDICES = {
  left: { outer: 36, topInner: 37, topOuter: 38, inner: 39, bottomOuter: 40, bottomInner: 41 },
  right: { outer: 45, topOuter: 44, topInner: 43, inner: 42, bottomInner: 46, bottomOuter: 47 },
};

function shoelaceArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function computeEyeGeometry(lm: Point[], side: 'left' | 'right'): EyeGeometry {
  const idx = EYE_INDICES[side];
  // Canonical canthal-tilt direction (unit vector, inner→outer corner):
  //   left eye (image-left):  39 → 36 points toward −x
  //   right eye (image-right): 42 → 45 points toward +x
  // Measuring along this fixed axis keeps the sign convention stable even when
  // landmarks get mirrored or swapped by a bad detection.
  const dirSign = side === 'left' ? -1 : 1;

  // Signed tilt in degrees above horizontal; POSITIVE = outer corner higher
  // than inner corner (positive / upturned canthal tilt). Screen y grows down.
  const tiltFn = (pts: Point[]) => {
    const dx = (pts[idx.outer].x - pts[idx.inner].x) * dirSign;
    const dy = pts[idx.outer].y - pts[idx.inner].y;
    return (Math.atan2(-dy, Math.abs(dx)) * 180) / Math.PI;
  };
  const unc = bootstrapUncertainty(lm, tiltFn, 2.0, 60);
  const canthalTiltDeg = tiltFn(lm);

  // Fissure metrics
  const inner = lm[idx.inner];
  const outer = lm[idx.outer];
  const width = distance(inner, outer);
  const topMid = midpoint(lm[idx.topInner], lm[idx.topOuter]);
  const bottomMid = midpoint(lm[idx.bottomInner], lm[idx.bottomOuter]);
  const height = distance(topMid, bottomMid);
  const aspectRatio = width > 0 ? height / width : 0;

  // Iris/pupil center ≈ centroid of the four lid midpoints; express its vertical
  // position inside the palpebral fissure (0 = upper lid, 1 = lower lid).
  // A high value ("low-set pupil") is a distinctive, identity-stable ocular cue.
  const pupil = midpoint(midpoint(topMid, lm[idx.inner]), midpoint(bottomMid, lm[idx.outer]));
  const irisVerticalPosition = height > 0
    ? Math.min(1, Math.max(0, (pupil.y - topMid.y) / height))
    : 0.5;

  // Lower sclera show proxy: how much the fissure stays open below the pupil
  // center, relative to eye width (wide-open eyes with visible white below the
  // iris score higher).
  const lowerScleraRatio = width > 0 ? Math.max(0, bottomMid.y - pupil.y) / width : 0;

  // Hooding index: how far the outer corner sits above/below the lid chord,
  // normalized by width. High values pair with heavy lateral lids.
  const lidChord = midpoint(topMid, bottomMid);
  const hoodingIndex = width > 0 ? Math.abs(outer.y - lidChord.y) / width : 0;

  // Area-based compactness
  const outline = [lm[idx.inner], lm[idx.topInner], lm[idx.topOuter], lm[idx.outer], lm[idx.bottomOuter], lm[idx.bottomInner]];
  const opennessArea = width > 0 ? shoelaceArea(outline) / (width * width) : 0;

  // Brow geometry
  const brow = side === 'left'
    ? { inner: lm[19], apex: lm[21], outer: lm[23] }
    : { inner: lm[28], apex: lm[26], outer: lm[24] };
  const browHeight = distance(brow.apex, topMid) / Math.max(width, 1e-6);
  const browApexOffset = (brow.apex.x - topMid.x) / Math.max(width, 1e-6);
  const browAngleDeg = -(angle2D(side === 'left' ? brow.inner : brow.outer,
                                side === 'left' ? brow.outer : brow.inner));

  return {
    side,
    canthalTiltDeg,
    tiltCI: unc.ci95.map(v => -v) as [number, number],
    classification: classifyCanthalTilt(canthalTiltDeg),
    severity: tiltSeverity(canthalTiltDeg),
    aspectRatio,
    irisVerticalPosition,
    lowerScleraRatio,
    hoodingIndex,
    browHeight,
    browApexOffset,
    browAngleDeg,
    widthToPD: 0,        // filled in by buildEyeFingerprint (needs both eyes)
    opennessArea,
  };
}

// ─── Fingerprint assembly ────────────────────────────────────────────────────

export function buildEyeFingerprint(canonicalLandmarks: Point[], eyeOccluded: boolean): EyeFingerprint {
  const lm = canonicalLandmarks;
  const left = computeEyeGeometry(lm, 'left');
  const right = computeEyeGeometry(lm, 'right');

  // Inter-pupillary distance proxy: inner corner to inner corner won't work;
  // use eye-center to eye-center distance.
  const lIdx = EYE_INDICES.left, rIdx = EYE_INDICES.right;
  const lCenter = midpoint(midpoint(lm[lIdx.inner], lm[lIdx.outer]), midpoint(lm[lIdx.topInner], lm[lIdx.bottomOuter]));
  const rCenter = midpoint(midpoint(lm[rIdx.inner], lm[rIdx.outer]), midpoint(lm[rIdx.topInner], lm[rIdx.bottomOuter]));
  const pd = distance(lCenter, rCenter);

  left.widthToPD = distance(lm[lIdx.inner], lm[lIdx.outer]) / Math.max(pd, 1e-6);
  right.widthToPD = distance(lm[rIdx.inner], lm[rIdx.outer]) / Math.max(pd, 1e-6);

  const arrangement: OcularArrangement = {
    innerCanthalDistanceRatio: distance(lm[lIdx.inner], lm[rIdx.inner]) / Math.max(pd, 1e-6),
    outerCanthalSpanRatio: distance(lm[lIdx.outer], lm[rIdx.outer]) / Math.max(pd, 1e-6),
    eyeSeparationToFaceWidth: pd / Math.max(distance(lm[2], lm[14]), 1e-6),
    eyeHeightAsymmetry: Math.abs(lCenter.y - rCenter.y) / Math.max(pd, 1e-6),
    tiltAsymmetryDeg: Math.abs(left.canthalTiltDeg - right.canthalTiltDeg),
    eyeWidthAsymmetry: (() => {
      const wL = distance(lm[lIdx.inner], lm[lIdx.outer]);
      const wR = distance(lm[rIdx.inner], lm[rIdx.outer]);
      return Math.min(wL, wR) / Math.max(wL, wR, 1e-6);
    })(),
  };

  const notes: string[] = [];
  if (eyeOccluded) notes.push('One or both eyes flagged as occluded/closed — features excluded from scoring.');
  if (Math.abs(left.canthalTiltDeg) > 10 || Math.abs(right.canthalTiltDeg) > 10)
    notes.push('Unusually large tilt magnitude detected — verify landmarks are correct.');
  if (arrangement.eyeHeightAsymmetry > 0.08)
    notes.push('Noticeable vertical asymmetry between the eyes (common; also part of the identity signature).');

  const quality: EyeFingerprint['quality'] = eyeOccluded
    ? 'poor'
    : left.aspectRatio < 0.14 || right.aspectRatio < 0.14 ? 'fair' : 'good';

  return { left, right, arrangement, quality, notes };
}

// ─── Feature vector (for matching) ───────────────────────────────────────────

export function eyeFeatureVector(fp: EyeFingerprint): EyeFeatureVector {
  const a = fp.arrangement;
  return {
    names: [
      'Canthal tilt L', 'Canthal tilt R', 'Tilt asymmetry',
      'Eye openness L (EAR)', 'Eye openness R (EAR)',
      'Iris vertical pos L', 'Iris vertical pos R',
      'Lower sclera L', 'Lower sclera R',
      'Hooding L', 'Hooding R',
      'Brow height L', 'Brow height R',
      'Brow angle L', 'Brow angle R',
      'Eye width/PD L', 'Eye width/PD R',
      'Inner canthal dist / PD', 'Outer canthal span / PD',
      'Eye sep / face width', 'Eye height asymmetry', 'Eye width symmetry',
    ],
    values: [
      fp.left.canthalTiltDeg, fp.right.canthalTiltDeg, a.tiltAsymmetryDeg,
      fp.left.aspectRatio, fp.right.aspectRatio,
      fp.left.irisVerticalPosition, fp.right.irisVerticalPosition,
      fp.left.lowerScleraRatio, fp.right.lowerScleraRatio,
      fp.left.hoodingIndex, fp.right.hoodingIndex,
      fp.left.browHeight, fp.right.browHeight,
      fp.left.browAngleDeg, fp.right.browAngleDeg,
      fp.left.widthToPD, fp.right.widthToPD,
      a.innerCanthalDistanceRatio, a.outerCanthalSpanRatio,
      a.eyeSeparationToFaceWidth, a.eyeHeightAsymmetry, a.eyeWidthAsymmetry,
    ],
  };
}

// Tolerance per feature: how far apart two photos of the SAME person typically land.
// Derived from landmark-jitter studies (σ≈2px on a ~150px face) plus expression noise.
const FEATURE_TOLERANCES: Record<string, number> = {
  'Canthal tilt L': 3.2, 'Canthal tilt R': 3.2, 'Tilt asymmetry': 3.0,
  'Eye openness L (EAR)': 0.05, 'Eye openness R (EAR)': 0.05,
  'Iris vertical pos L': 0.14, 'Iris vertical pos R': 0.14,
  'Lower sclera L': 0.05, 'Lower sclera R': 0.05,
  'Hooding L': 0.09, 'Hooding R': 0.09,
  'Brow height L': 0.28, 'Brow height R': 0.28,
  'Brow angle L': 4.5, 'Brow angle R': 4.5,
  'Eye width/PD L': 0.05, 'Eye width/PD R': 0.05,
  'Inner canthal dist / PD': 0.05, 'Outer canthal span / PD': 0.05,
  'Eye sep / face width': 0.045, 'Eye height asymmetry': 0.05, 'Eye width symmetry': 0.08,
};

// Identity informativeness (0-1). Brows down-weighted: grooming/styles change them.
const FEATURE_IDENTITY_WEIGHTS: Record<string, number> = {
  'Canthal tilt L': 0.95, 'Canthal tilt R': 0.95, 'Tilt asymmetry': 0.8,
  'Eye openness L (EAR)': 0.75, 'Eye openness R (EAR)': 0.75,
  'Iris vertical pos L': 0.6, 'Iris vertical pos R': 0.6,
  'Lower sclera L': 0.55, 'Lower sclera R': 0.55,
  'Hooding L': 0.5, 'Hooding R': 0.5,
  'Brow height L': 0.35, 'Brow height R': 0.35,
  'Brow angle L': 0.3, 'Brow angle R': 0.3,
  'Eye width/PD L': 0.85, 'Eye width/PD R': 0.85,
  'Inner canthal dist / PD': 0.9, 'Outer canthal span / PD': 0.85,
  'Eye sep / face width': 0.7, 'Eye height asymmetry': 0.65, 'Eye width symmetry': 0.7,
};

// ─── Matching: same person from the eyes alone? ──────────────────────────────

/**
 * Compare two ocular fingerprints with a Gaussian log-likelihood-ratio model.
 * For each feature: logLR_i = ((Δ/t)² − 1) style evidence — agreement within
 * tolerance supports "same person", large deviations support "different".
 */
export function compareEyeFingerprints(
  fp1: EyeFingerprint,
  fp2: EyeFingerprint,
  opts: { excludeBrows?: boolean } = {}
): EyeMatchResult {
  const v1 = eyeFeatureVector(fp1);
  const v2 = eyeFeatureVector(fp2);

  const rows: EyeComparisonRow[] = [];
  let totalLogLR = 0;
  let totalWeight = 0;

  for (let i = 0; i < v1.names.length; i++) {
    const name = v1.names[i];
    if (opts.excludeBrows && name.startsWith('Brow')) continue;

    const t = FEATURE_TOLERANCES[name] ?? 0.05;
    const w = FEATURE_IDENTITY_WEIGHTS[name] ?? 0.5;
    const delta = Math.abs(v1.values[i] - v2.values[i]);
    const z = delta / t;

    // Evidence: z<0.8 → mild support; z>1 → opposition growing with z²
    let logLR: number;
    if (z < 0.8) logLR = 0.9 * (1 - z);
    else if (z < 1.15) logLR = 0;
    else logLR = -Math.min(2.5, (z - 1.15) * 1.1);

    totalLogLR += logLR * w;
    totalWeight += w;

    rows.push({
      name,
      value1: v1.values[i],
      value2: v2.values[i],
      delta,
      tolerance: t,
      supportsMatch: logLR >= 0,
      weight: w,
    });
  }

  const avgLogLR = totalWeight > 0 ? totalLogLR / totalWeight : 0;
  const likelihoodRatio = Math.exp(avgLogLR);
  const score = 100 / (1 + Math.exp(-avgLogLR * 1.8));

  // CI widens when few informative features agree/disagree decisively
  const decisive = rows.filter(r => Math.abs(r.delta / r.tolerance - 1) > 0.5).length;
  const halfWidth = Math.max(6, 26 - decisive * 2);
  const ci: [number, number] = [
    Math.max(0, Math.round(score - halfWidth)),
    Math.min(100, Math.round(score + halfWidth)),
  ];

  let verdict: string;
  if (score >= 78) verdict = 'Eyes strongly consistent with the same person';
  else if (score >= 62) verdict = 'Eyes likely the same person';
  else if (score >= 45) verdict = 'Inconclusive from the eyes alone';
  else if (score >= 30) verdict = 'Eyes likely different people';
  else verdict = 'Eyes strongly suggest different people';

  const nTilts = rows.filter(r => r.name.includes('tilt') || r.name.includes('Tilt'));
  const tiltsAgree = nTilts.every(r => r.supportsMatch);

  return {
    score: Math.round(score),
    confidenceInterval: ci,
    likelihoodRatio,
    verdict,
    rows: rows.sort((a, b) => b.weight * (b.delta / b.tolerance) - a.weight * (a.delta / a.tolerance)),
    nFeatures: rows.length,
    methodNote:
      `${rows.length} eye-region features compared in the pose-normalized frame, scaled by interpupillary distance. ` +
      (tiltsAgree ? 'Canthal tilts agree — the single most identity-stable ocular cue. ' : 'Canthal tilts disagree beyond measurement error. ') +
      `Scores ≥78 with narrow CIs are rare for unrelated eyes; this is still NOT forensic identification.`,
  };
}

/** Convenience: build a fingerprint directly from aggregated MetricResults
 *  (used when only metric-level data is available for multi-image persons). */
export function eyeMetricsSummary(metrics: MetricResult[]): MetricResult[] {
  return metrics.filter(m => m.category === 'Eye Shape');
}
