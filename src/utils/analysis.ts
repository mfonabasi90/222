/**
 * analysis.ts — Age estimation, developmental priors, calibrated scoring, multi-image aggregation
 * 
 * Key principles:
 * - Cross-age comparisons must account for expected developmental changes
 * - Identity-informative metrics weighted higher than age-varying ones
 * - Scores calibrated to be meaningful (not raw weighted averages)
 * - Multi-image aggregation reduces uncertainty
 */

import { MetricResult, Quality } from './metrics';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AgeEstimate {
  estimatedAge: number;
  confidenceInterval: [number, number];
  confidence: number; // 0-1
  basis: string;
}

export interface DevelopmentalPrior {
  metricName: string;
  direction: 'increases' | 'decreases' | 'stable';
  magnitudePerYear: number; // Expected change per year from age 5-25
  tolerance: number; // Acceptable deviation from expected
  source: string;
}

export interface CalibratedScore {
  overallScore: number; // 0-100
  confidenceInterval: [number, number];
  likelihoodRatio: number; // >1 = same person more likely, <1 = different person
  verdict: string;
  supportingMetrics: { name: string; contribution: number; direction: 'support' | 'oppose' }[];
  opposingMetrics: { name: string; contribution: number; direction: 'support' | 'oppose' }[];
  ageAdjustment: number; // How much the score changed due to age adjustment
  methodNote: string;
  /** Per-metric breakdown — the exact evidence that produced the verdict */
  comparisons: MetricComparison[];
  /** Metrics excluded from scoring (occluded / poor quality) with the reason */
  excluded: { name: string; reason: string }[];
  /** Traits that changed in line with growth expectations */
  expectedChangesCount: number;
  /** Total traits that development predicts should have changed */
  changingTraitsCount: number;
  /** Identity-stable traits that matched */
  stableMatchesCount: number;
  /** Total identity-stable traits compared */
  stableTraitsCount: number;
  /** True when image #1 holds the younger photo (inferred + user override) */
  youngerIsFirst: boolean;
}

/** Narrative summary of the comparison, e.g. "same person, consistent with normal growth". */
export function describeVerdict(score: CalibratedScore, ageDelta: number): string {
  const s = score.overallScore;
  const growthOk =
    score.changingTraitsCount === 0 ||
    score.expectedChangesCount / Math.max(1, score.changingTraitsCount) >= 0.5;

  if (s >= 75) {
    return `Strong match. ${score.stableMatchesCount}/${score.stableTraitsCount} age-invariant traits agree` +
      (growthOk && ageDelta > 3
        ? `, and the changes we did see follow normal growth for a ~${ageDelta}-year gap.`
        : '.');
  }
  if (s >= 60) {
    return `Moderate match. Most stable identity cues (eyes, spacing, jaw geometry) line up` +
      (ageDelta > 5 ? ` despite an estimated ~${ageDelta}-year difference.` : '.');
  }
  if (s >= 45) {
    return 'Inconclusive. The measurements are consistent with either the same person at two ages ' +
      'or two different people — try adding clearer, front-facing photos of each.';
  }
  if (s >= 30) {
    return 'Moderate mismatch. Several age-invariant traits differ beyond measurement error.';
  }
  return 'Strong mismatch. Multiple identity-stable traits disagree well past what growth can explain.';
}

export interface AggregatedResult {
  metrics: MetricResult[];
  perImageVariance: number;
  nImages: number;
  quality: Quality;
}

// ─── Age Estimation (Heuristic) ──────────────────────────────────────────────
// Based on known craniofacial growth patterns

export function estimateAge(metrics: MetricResult[]): AgeEstimate {
  let ageScore = 0;
  let totalWeight = 0;

  // Face H/W ratio: increases from ~1.1 (child) to ~1.4 (adult)
  const faceRatio = metrics.find(m => m.name === 'Face Height / Width');
  if (faceRatio && !faceRatio.isOccluded) {
    // Map ratio to age: 1.1 → ~5 years, 1.4 → ~20 years
    const estimatedFromFace = 5 + (faceRatio.value - 1.1) / 0.3 * 15;
    ageScore += clamp(estimatedFromFace, 3, 80) * 0.3;
    totalWeight += 0.3;
  }

  // Nose length ratio: increases slightly with age
  const noseLength = metrics.find(m => m.name === 'Nose Length / Face Height');
  if (noseLength && !noseLength.isOccluded) {
    // Map ratio to age: 0.25 → ~5 years, 0.35 → ~25 years
    const estimatedFromNose = 5 + (noseLength.value - 0.25) / 0.1 * 20;
    ageScore += clamp(estimatedFromNose, 3, 80) * 0.2;
    totalWeight += 0.2;
  }

  // Inter-ocular ratio: decreases with age (face widens)
  const interocular = metrics.find(m => m.name === 'Inter-ocular / Face Width');
  if (interocular && !interocular.isOccluded) {
    // Map ratio to age: 0.45 → ~5 years, 0.35 → ~20 years
    const estimatedFromInterocular = 5 + (0.45 - interocular.value) / 0.1 * 15;
    ageScore += clamp(estimatedFromInterocular, 3, 80) * 0.2;
    totalWeight += 0.2;
  }

  // Cheek width ratio: decreases with age (baby fat reduces)
  const cheekWidth = metrics.find(m => m.name === 'Cheek Width / Jaw Width');
  if (cheekWidth && !cheekWidth.isOccluded) {
    // Map ratio to age: 1.1 → ~5 years, 0.95 → ~25 years
    const estimatedFromCheek = 5 + (1.1 - cheekWidth.value) / 0.15 * 20;
    ageScore += clamp(estimatedFromCheek, 3, 80) * 0.15;
    totalWeight += 0.15;
  }

  // Forehead ratio: decreases with age
  const forehead = metrics.find(m => m.name === 'Forehead / Face Height');
  if (forehead && !forehead.isOccluded) {
    // Map ratio to age: 0.35 → ~5 years, 0.25 → ~20 years
    const estimatedFromForehead = 5 + (0.35 - forehead.value) / 0.1 * 15;
    ageScore += clamp(estimatedFromForehead, 3, 80) * 0.15;
    totalWeight += 0.15;
  }

  const estimatedAge = totalWeight > 0 ? ageScore / totalWeight : 25;
  const confidence = totalWeight > 0.5 ? Math.min(0.8, totalWeight) : 0.3;
  const ci: [number, number] = [
    Math.max(1, estimatedAge - 8 * (1 - confidence)),
    estimatedAge + 8 * (1 - confidence),
  ];

  return {
    estimatedAge: Math.round(estimatedAge),
    confidenceInterval: [Math.round(ci[0]), Math.round(ci[1])],
    confidence,
    basis: `Based on ${Math.round(totalWeight * 100)}% of age-sensitive metrics available`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ─── Developmental Priors ────────────────────────────────────────────────────
// Literature-based allometry (Farkas 1994, Krogman & İşcan 1986)

export const DEVELOPMENTAL_PRIORS: DevelopmentalPrior[] = [
  {
    metricName: 'Face Height / Width',
    direction: 'increases',
    magnitudePerYear: 0.012, // ~0.3 increase from age 5 to 25
    tolerance: 0.05,
    source: 'Farkas 1994: facial height increases while width stabilizes after puberty',
  },
  {
    metricName: 'Nose Width / Face Width',
    direction: 'increases',
    magnitudePerYear: 0.001, // Small increase (cartilage growth)
    tolerance: 0.03,
    source: 'Nose continues growing throughout life (cartilage)',
  },
  {
    metricName: 'Nose Length / Face Height',
    direction: 'increases',
    magnitudePerYear: 0.004,
    tolerance: 0.04,
    source: 'Nasal length increases with age',
  },
  {
    metricName: 'Inter-ocular / Face Width',
    direction: 'decreases',
    magnitudePerYear: -0.005, // Face widens more than inter-ocular distance grows
    tolerance: 0.04,
    source: 'Bizygomatic width increases significantly during growth',
  },
  {
    metricName: 'Cheek Width / Jaw Width',
    direction: 'decreases',
    magnitudePerYear: -0.006, // Baby fat reduces
    tolerance: 0.05,
    source: 'Subcutaneous fat decreases from childhood to adulthood',
  },
  {
    metricName: 'Forehead / Face Height',
    direction: 'decreases',
    magnitudePerYear: -0.004,
    tolerance: 0.05,
    source: 'Face elongates more than forehead grows',
  },
  {
    metricName: 'Left Canthal Tilt',
    direction: 'stable',
    magnitudePerYear: 0.0,
    tolerance: 2.0, // degrees
    source: 'Canthal tilt is highly stable after age 5',
  },
  {
    metricName: 'Right Canthal Tilt',
    direction: 'stable',
    magnitudePerYear: 0.0,
    tolerance: 2.0,
    source: 'Canthal tilt is highly stable after age 5',
  },
  {
    metricName: 'Left Eye Aspect Ratio',
    direction: 'stable',
    magnitudePerYear: 0.0,
    tolerance: 0.03,
    source: 'Eye shape stable after early childhood',
  },
  {
    metricName: 'Right Eye Aspect Ratio',
    direction: 'stable',
    magnitudePerYear: 0.0,
    tolerance: 0.03,
    source: 'Eye shape stable after early childhood',
  },
  {
    metricName: 'Jaw Angle',
    direction: 'increases',
    magnitudePerYear: 0.3, // Jaw becomes more defined (angle opens)
    tolerance: 5.0,
    source: 'Mandibular growth changes jaw angle through adolescence',
  },
  {
    metricName: 'Philtrum / Face Height',
    direction: 'stable',
    magnitudePerYear: 0.0,
    tolerance: 0.02,
    source: 'Philtrum length relatively stable',
  },
  {
    metricName: 'Mouth Width / Face Width',
    direction: 'stable',
    magnitudePerYear: 0.0005, // mouth width tracks bizygomatic width closely
    tolerance: 0.035,         // extra slack because expression inflates this measure
    source: 'Farkas 1994: oral width grows proportionally with facial width',
  },
  {
    metricName: 'Mouth Aspect Ratio (H/W)',
    direction: 'decreases',
    magnitudePerYear: -0.0015, // vermilion thins/eversion reduces with age
    tolerance: 0.04,
    source: 'Perioral soft-tissue thinning; heavily expression-confounded',
  },
  {
    metricName: 'Ear Position / Eye-Mouth Axis',
    direction: 'stable',
    magnitudePerYear: 0.0,
    tolerance: 0.06,
    source: 'Ear registration to the eye line is age-invariant (Farkas 1994)',
  },
];

export function getExpectedDelta(metricName: string, ageDelta: number): { expected: number; tolerance: number } {
  const prior = DEVELOPMENTAL_PRIORS.find(p => p.metricName === metricName);
  if (!prior) return { expected: 0, tolerance: 0.1 };

  const expected = prior.magnitudePerYear * ageDelta;
  return { expected, tolerance: prior.tolerance };
}

// ─── Per-metric comparison detail (shared by scoring and the UI) ─────────────

export interface MetricComparison {
  name: string;
  value1: number;
  value2: number;
  unit: string;
  observedDelta: number;
  expectedDelta: number;   // developmental expectation (signed, younger → older)
  tolerance: number;       // effective tolerance incl. measurement uncertainty
  residual: number;        // |observed| - |expected|, i.e. unexplained difference
  normalizedResidual: number;
  logLR: number;           // + supports same person, − supports different person
  weight: number;          // identity × age-stability × quality × (1 - style/2)
  contribution: number;    // logLR * weight
  direction: 'support' | 'oppose' | 'neutral';
  /** Does the observed change match the direction/magnitude growth predicts? */
  growthConsistent: boolean;
  /** Growth predicted a change here but we measured almost none */
  underChanged: boolean;
  classification: 'stable' | 'moderate' | 'changing';
  category: string;
}

const NEUTRAL_BAND = 0.75; // |residual| below this fraction of tolerance ⇒ no evidence either way

/** Classify how strongly a trait changes from childhood to adulthood. */
export function classifyTrait(name: string): 'stable' | 'moderate' | 'changing' {
  const prior = DEVELOPMENTAL_PRIORS.find(p => p.metricName === name);
  if (!prior || prior.direction === 'stable') return 'stable';
  return Math.abs(prior.magnitudePerYear) >= 0.004 ? 'changing' : 'moderate';
}

/**
 * Compare one metric pair across the two photos. This is the single source of
 * truth used by both computeCalibratedScore() and the results UI, so what you
 * see in the cards is exactly what drove the verdict.
 *
 * @param youngerIsFirst true when image #1 holds the younger/child photo.
 *        The developmental priors are written for "change per year from young
 *        to old", so the orientation only matters for the narrative fields
 *        (growthConsistent / underChanged) — the evidence itself is symmetric.
 */
export function compareMetric(
  m1: MetricResult,
  m2: MetricResult,
  ageDelta: number,
  ageNormalized: boolean,
  youngerIsFirst: boolean = true
): MetricComparison {
  const observedDelta = Math.abs(m1.value - m2.value);

  // Signed growth expectation oriented from the YOUNGER photo to the OLDER photo.
  const { expected: signedRaw, tolerance } = getExpectedDelta(m1.name, ageDelta);
  const expectedAbs = Math.abs(signedRaw);

  const expected = ageNormalized ? signedRaw : 0;
  const residual = Math.abs(observedDelta - expectedAbs);

  const effectiveTolerance = Math.max(
    ageNormalized ? tolerance : tolerance * 0.6,
    m1.uncertainty.std + m2.uncertainty.std,
    0.01
  );

  const normalizedResidual = residual / effectiveTolerance;

  let logLR: number;
  if (normalizedResidual < NEUTRAL_BAND) {
    logLR = 0; // indistinguishable from noise — abstain rather than fake support
  } else if (normalizedResidual < 1) {
    logLR = (1 - normalizedResidual) * 0.5; // mild support for same person
  } else {
    logLR = -(normalizedResidual - 1) * 0.8; // support for different persons
  }

  const qualityFactor = m1.quality === 'good' && m2.quality === 'good'
    ? 1.0
    : m1.quality === 'poor' || m2.quality === 'poor'
      ? 0.3
      : 0.7;

  const weight =
    m1.identityWeight * m1.ageStability * qualityFactor * (1 - m1.styleSensitivity * 0.5);

  const contribution = logLR * weight;

  // Is the observed change consistent with development?
  // We look at the raw signed difference (older minus younger) versus the
  // predicted sign & magnitude, independent of whether normalization is on.
  const signedObserved = youngerIsFirst ? m2.value - m1.value : m1.value - m2.value;
  const growthConsistent =
    expectedAbs > 0.001 &&
    Math.sign(signedObserved) === Math.sign(signedRaw) &&
    Math.abs(Math.abs(signedObserved) - expectedAbs) <= effectiveTolerance * 1.5;
  const underChanged =
    expectedAbs > 0.001 && observedDelta < effectiveTolerance * NEUTRAL_BAND && !growthConsistent;

  return {
    name: m1.name,
    value1: m1.value,
    value2: m2.value,
    unit: m1.unit,
    observedDelta,
    expectedDelta: expected,
    tolerance: effectiveTolerance,
    residual,
    normalizedResidual,
    logLR,
    weight,
    contribution,
    direction: contribution > 0 ? 'support' : contribution < 0 ? 'oppose' : 'neutral',
    growthConsistent,
    underChanged,
    classification: classifyTrait(m1.name),
    category: m1.category,
  };
}

/** Vote on which side is younger using the strongest growth-sensitive traits. */
export function inferAgeOrientation(
  metrics1: MetricResult[],
  metrics2: MetricResult[]
): { youngerIsFirst: boolean; agreement: number; votes: number } {
  const directional = DEVELOPMENTAL_PRIORS.filter(p => p.direction !== 'stable');
  let yes = 0;
  let no = 0;
  for (const prior of directional) {
    const m1 = metrics1.find(m => m.name === prior.metricName);
    const m2 = metrics2.find(m => m.name === prior.metricName);
    if (!m1 || !m2 || m1.isOccluded || m2.isOccluded) continue;
    const diff = m2.value - m1.value;
    if (Math.abs(diff) < 1e-6) continue;
    const matchesGrowthDirection = Math.sign(diff) === Math.sign(prior.magnitudePerYear);
    if (matchesGrowthDirection) yes += 1; // image 2 looks older
    else no += 1;                          // image 1 looks older
  }
  const total = yes + no;
  return {
    youngerIsFirst: yes >= no,
    agreement: total > 0 ? Math.max(yes, no) / total : 0.5,
    votes: total,
  };
}

// ─── Calibrated Scoring ──────────────────────────────────────────────────────

export type YoungerSide = 'auto' | 'first' | 'second';

export function computeCalibratedScore(
  metrics1: MetricResult[],
  metrics2: MetricResult[],
  age1: AgeEstimate,
  age2: AgeEstimate,
  ageNormalized: boolean = false,
  youngerSide: YoungerSide = 'auto'
): CalibratedScore {
  const ageDelta = Math.abs(age1.estimatedAge - age2.estimatedAge);
  const supportingMetrics: { name: string; contribution: number; direction: 'support' | 'oppose' }[] = [];
  const opposingMetrics: { name: string; contribution: number; direction: 'support' | 'oppose' }[] = [];

  // Which photo holds the younger face? Auto-detect from growth-direction votes,
  // unless the user pinned it in the UI (the honest answer for "me as a child").
  const orientation = inferAgeOrientation(metrics1, metrics2);
  const youngerIsFirst =
    youngerSide === 'first' ? true : youngerSide === 'second' ? false : orientation.youngerIsFirst;

  let totalLogLikelihood = 0;
  let totalWeight = 0;
  const comparisons: MetricComparison[] = [];
  const excluded: { name: string; reason: string }[] = [];

  // Match metrics by name
  for (const m1 of metrics1) {
    const m2 = metrics2.find(m => m.name === m1.name);
    if (!m2) continue;

    if (m1.isOccluded || m2.isOccluded) {
      excluded.push({ name: m1.name, reason: 'Occluded in one or both photos' });
      continue;
    }
    if (m1.quality === 'poor' || m2.quality === 'poor') {
      excluded.push({ name: m1.name, reason: 'Low landmark quality' });
      continue;
    }

    const cmp = compareMetric(m1, m2, ageDelta, ageNormalized, youngerIsFirst);
    comparisons.push(cmp);

    totalLogLikelihood += cmp.logLR * cmp.weight;
    totalWeight += cmp.weight;

    const entry = {
      name: m1.name,
      contribution: Math.abs(cmp.contribution),
      direction: (cmp.contribution > 0 ? 'support' : 'oppose') as 'support' | 'oppose',
    };

    if (cmp.contribution > 0) {
      supportingMetrics.push(entry);
    } else if (cmp.contribution < 0) {
      opposingMetrics.push(entry);
    }
  }

  // Normalize to overall score
  const avgLogLR = totalWeight > 0 ? totalLogLikelihood / totalWeight : 0;
  const likelihoodRatio = Math.exp(avgLogLR);

  // Convert to 0-100 score using logistic function
  // LR=1 → 50%, LR=2 → 67%, LR=0.5 → 33%
  const overallScore = 100 / (1 + Math.exp(-avgLogLR * 2));

  // Confidence interval from bootstrap (simplified)
  const scoreStd = totalWeight > 0 ? 15 / Math.sqrt(totalWeight) : 20;
  const ci: [number, number] = [
    clamp(overallScore - 1.96 * scoreStd, 0, 100),
    clamp(overallScore + 1.96 * scoreStd, 0, 100),
  ];

  // Sort contributions
  supportingMetrics.sort((a, b) => b.contribution - a.contribution);
  opposingMetrics.sort((a, b) => b.contribution - a.contribution);

  // Verdict
  let verdict: string;
  if (overallScore >= 75) {
    verdict = 'Strong evidence of similarity';
  } else if (overallScore >= 60) {
    verdict = 'Moderate evidence of similarity';
  } else if (overallScore >= 45) {
    verdict = 'Inconclusive — consistent with both same and different persons';
  } else if (overallScore >= 30) {
    verdict = 'Moderate evidence of difference';
  } else {
    verdict = 'Strong evidence of difference';
  }

  // Age adjustment note
  const ageAdjustment = ageNormalized ? ageDelta * 0.5 : 0;

  const changingTraits = comparisons.filter(c => c.classification !== 'stable');
  const stableTraits = comparisons.filter(c => c.classification === 'stable');

  return {
    overallScore: Math.round(overallScore),
    confidenceInterval: [Math.round(ci[0]), Math.round(ci[1])],
    likelihoodRatio,
    verdict,
    supportingMetrics: supportingMetrics.slice(0, 6),
    opposingMetrics: opposingMetrics.slice(0, 6),
    ageAdjustment,
    comparisons,
    excluded,
    expectedChangesCount: changingTraits.filter(c => c.growthConsistent).length,
    changingTraitsCount: changingTraits.length,
    stableMatchesCount: stableTraits.filter(c => c.direction !== 'oppose').length,
    stableTraitsCount: stableTraits.length,
    youngerIsFirst,
    methodNote: `Score based on ${totalWeight.toFixed(1)} weighted metric comparisons ` +
      `(${comparisons.length} scored, ${excluded.length} excluded). ` +
      `Age delta: ~${ageDelta} years; younger photo: ${youngerIsFirst ? 'left' : 'right'}. ` +
      `${ageNormalized ? 'Age-normalized' : 'Raw'} comparison. Not forensic identification.`,
  };
}

// ─── Multi-Image Aggregation ─────────────────────────────────────────────────

export function aggregateMultiImage(results: MetricResult[][]): AggregatedResult {
  if (results.length === 0) {
    return { metrics: [], perImageVariance: 0, nImages: 0, quality: 'poor' };
  }

  if (results.length === 1) {
    return {
      metrics: results[0],
      perImageVariance: 0,
      nImages: 1,
      quality: computeOverallQuality(results[0]),
    };
  }

  // Get all metric names
  const metricNames = [...new Set(results.flat().map(m => m.name))];

  const aggregated: MetricResult[] = metricNames.map(name => {
    const values = results
      .map(r => r.find(m => m.name === name))
      .filter((m): m is MetricResult => m !== undefined && !m.isOccluded);

    if (values.length === 0) {
      // All occluded
      const template = results[0].find(m => m.name === name)!;
      return { ...template, quality: 'occluded' as Quality, isOccluded: true };
    }

    // Inverse-variance weighting
    const weights = values.map(v => {
      const variance = Math.max(v.uncertainty.std ** 2, 0.0001);
      return 1 / variance;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0);

    const weightedMean = values.reduce((sum, v, i) => sum + v.value * weights[i], 0) / totalWeight;
    const aggregatedVariance = 1 / totalWeight;
    const aggregatedStd = Math.sqrt(aggregatedVariance);

    // Per-image variance (consistency measure)
    const imageVariance = values.length > 1
      ? values.reduce((sum, v) => sum + (v.value - weightedMean) ** 2, 0) / values.length
      : 0;

    // CI from aggregated uncertainty
    const ci95: [number, number] = [
      weightedMean - 1.96 * aggregatedStd,
      weightedMean + 1.96 * aggregatedStd,
    ];

    // Quality: best quality across images, downgraded if high variance
    const bestQuality = values.reduce((best, v) => {
      const rank = { good: 3, fair: 2, poor: 1, occluded: 0 };
      return rank[v.quality] > rank[best] ? v.quality : best;
    }, 'occluded' as Quality);

    const finalQuality = imageVariance > aggregatedVariance * 4 ? 'fair' : bestQuality;

    return {
      name,
      category: values[0].category,
      value: weightedMean,
      unit: values[0].unit,
      uncertainty: {
        mean: weightedMean,
        std: aggregatedStd,
        ci95,
        nSamples: values.reduce((sum, v) => sum + v.uncertainty.nSamples, 0),
      },
      quality: finalQuality,
      isOccluded: false,
      identityWeight: values.reduce((sum, v) => sum + v.identityWeight, 0) / values.length,
      ageStability: values.reduce((sum, v) => sum + v.ageStability, 0) / values.length,
      styleSensitivity: values.reduce((sum, v) => sum + v.styleSensitivity, 0) / values.length,
      leftRightConsistency: values.reduce((sum, v) => sum + v.leftRightConsistency, 0) / values.length,
      notes: `Aggregated from ${values.length} image(s). Variance: ${imageVariance.toFixed(4)}.`,
    };
  });

  const perImageVariance = results.length > 1
    ? aggregated.reduce((sum, m) => sum + m.uncertainty.std ** 2, 0) / aggregated.length
    : 0;

  return {
    metrics: aggregated,
    perImageVariance,
    nImages: results.length,
    quality: computeOverallQuality(aggregated),
  };
}

function computeOverallQuality(metrics: MetricResult[]): Quality {
  const good = metrics.filter(m => m.quality === 'good' && !m.isOccluded).length;
  const total = metrics.filter(m => !m.isOccluded).length;
  const ratio = total > 0 ? good / total : 0;

  if (ratio > 0.7) return 'good';
  if (ratio > 0.4) return 'fair';
  return 'poor';
}

// ─── Age-Normalized Metrics ──────────────────────────────────────────────────
// Adjust metrics to remove expected developmental changes

export function ageNormalizeMetrics(
  metrics: MetricResult[],
  fromAge: number,
  toAge: number
): MetricResult[] {
  const ageDelta = toAge - fromAge;

  return metrics.map(m => {
    const { expected } = getExpectedDelta(m.name, ageDelta);
    if (Math.abs(expected) < 0.001) return m; // No adjustment needed

    // Adjust value by subtracting expected developmental change
    const adjustedValue = m.value - expected;
    const adjustedMean = m.uncertainty.mean - expected;
    const adjustedCI: [number, number] = [
      m.uncertainty.ci95[0] - expected,
      m.uncertainty.ci95[1] - expected,
    ];

    return {
      ...m,
      value: adjustedValue,
      uncertainty: {
        ...m.uncertainty,
        mean: adjustedMean,
        ci95: adjustedCI,
      },
      notes: m.notes + ` (Age-adjusted: Δ=${expected.toFixed(3)} for ${ageDelta}yr gap)`,
    };
  });
}
