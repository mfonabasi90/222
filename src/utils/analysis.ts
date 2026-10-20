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
];

export function getExpectedDelta(metricName: string, ageDelta: number): { expected: number; tolerance: number } {
  const prior = DEVELOPMENTAL_PRIORS.find(p => p.metricName === metricName);
  if (!prior) return { expected: 0, tolerance: 0.1 };

  const expected = prior.magnitudePerYear * ageDelta;
  return { expected, tolerance: prior.tolerance };
}

// ─── Calibrated Scoring ──────────────────────────────────────────────────────

export function computeCalibratedScore(
  metrics1: MetricResult[],
  metrics2: MetricResult[],
  age1: AgeEstimate,
  age2: AgeEstimate,
  ageNormalized: boolean = false
): CalibratedScore {
  const ageDelta = Math.abs(age1.estimatedAge - age2.estimatedAge);
  const supportingMetrics: { name: string; contribution: number; direction: 'support' | 'oppose' }[] = [];
  const opposingMetrics: { name: string; contribution: number; direction: 'support' | 'oppose' }[] = [];

  let totalLogLikelihood = 0;
  let totalWeight = 0;

  // Match metrics by name
  for (const m1 of metrics1) {
    const m2 = metrics2.find(m => m.name === m1.name);
    if (!m2) continue;

    // Skip occluded metrics
    if (m1.isOccluded || m2.isOccluded) continue;

    // Skip low-quality metrics
    if (m1.quality === 'poor' || m2.quality === 'poor') continue;

    // Compute observed delta
    const observedDelta = Math.abs(m1.value - m2.value);

    // Compute expected delta (from developmental priors if age-normalized)
    const { expected, tolerance } = ageNormalized
      ? getExpectedDelta(m1.name, ageDelta)
      : { expected: 0, tolerance: m1.uncertainty.std * 2 };

    // Residual: how far is observed from expected
    const residual = Math.abs(observedDelta - Math.abs(expected));

    // Effective tolerance: combine measurement uncertainty with prior tolerance
    const effectiveTolerance = Math.max(
      tolerance,
      m1.uncertainty.std + m2.uncertainty.std,
      0.01
    );

    // Compute log-likelihood ratio
    // If residual < tolerance: supports same person
    // If residual > 3*tolerance: supports different person
    const normalizedResidual = residual / effectiveTolerance;
    let logLR: number;
    if (normalizedResidual < 1) {
      logLR = (1 - normalizedResidual) * 0.5; // Supports same person
    } else {
      logLR = -(normalizedResidual - 1) * 0.8; // Supports different person
    }

    // Weight by identity-informativeness × age-stability × quality
    const qualityFactor = m1.quality === 'good' ? 1.0 : m1.quality === 'fair' ? 0.7 : 0.3;
    const weight = m1.identityWeight * m1.ageStability * qualityFactor * (1 - m1.styleSensitivity * 0.5);

    totalLogLikelihood += logLR * weight;
    totalWeight += weight;

    // Track contributions
    const contribution = logLR * weight;
    const entry = {
      name: m1.name,
      contribution: Math.abs(contribution),
      direction: (contribution > 0 ? 'support' : 'oppose') as 'support' | 'oppose',
    };

    if (contribution > 0) {
      supportingMetrics.push(entry);
    } else {
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

  return {
    overallScore: Math.round(overallScore),
    confidenceInterval: [Math.round(ci[0]), Math.round(ci[1])],
    likelihoodRatio,
    verdict,
    supportingMetrics: supportingMetrics.slice(0, 5),
    opposingMetrics: opposingMetrics.slice(0, 5),
    ageAdjustment,
    methodNote: `Score based on ${totalWeight.toFixed(1)} weighted metric comparisons. ` +
      `Age delta: ${ageDelta} years. ` +
      `${ageNormalized ? 'Age-normalized' : 'Raw'} comparison. ` +
      `Not forensic identification.`,
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
