import { ImageAnalysisResult } from './FaceCanvas';
import { MetricResult } from '../utils/metrics';
import {
  estimateAge, computeCalibratedScore, aggregateMultiImage,
  ageNormalizeMetrics, AgeEstimate, CalibratedScore, AggregatedResult
} from '../utils/analysis';
import MetricCard from './MetricCard';

interface AnalysisResultsProps {
  results1: ImageAnalysisResult[];
  results2: ImageAnalysisResult[];
  ageNormalized: boolean;
  showUncertainty: boolean;
}

export default function AnalysisResults({ results1, results2, ageNormalized, showUncertainty }: AnalysisResultsProps) {
  if (results1.length === 0 || results2.length === 0) return null;

  // Aggregate multi-image results
  const agg1 = aggregateMultiImage(results1.map(r => r.metrics));
  const agg2 = aggregateMultiImage(results2.map(r => r.metrics));

  // Age estimates (from aggregated metrics)
  const age1 = results1.length === 1
    ? results1[0].ageEstimate
    : estimateAge(agg1.metrics);
  const age2 = results2.length === 1
    ? results2[0].ageEstimate
    : estimateAge(agg2.metrics);

  const ageDelta = Math.abs(age1.estimatedAge - age2.estimatedAge);

  // Optionally age-normalize the younger person's metrics toward the older
  let metrics1 = agg1.metrics;
  let metrics2 = agg2.metrics;
  if (ageNormalized && ageDelta > 3) {
    if (age1.estimatedAge < age2.estimatedAge) {
      metrics1 = ageNormalizeMetrics(agg1.metrics, age1.estimatedAge, age2.estimatedAge);
    } else {
      metrics2 = ageNormalizeMetrics(agg2.metrics, age2.estimatedAge, age1.estimatedAge);
    }
  }

  // Compute calibrated score
  const score = computeCalibratedScore(metrics1, metrics2, age1, age2, ageNormalized);

  // Match metrics by name for display
  const pairedMetrics = metrics1.map(m1 => {
    const m2 = metrics2.find(m => m.name === m1.name);
    return m2 ? [m1, m2] as [MetricResult, MetricResult] : null;
  }).filter(Boolean) as [MetricResult, MetricResult][];

  return (
    <div className="w-full max-w-5xl mx-auto mt-8 space-y-6">
      {/* Disclaimer */}
      <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-yellow-400 text-lg">⚠️</span>
          <div>
            <h4 className="text-sm font-semibold text-yellow-400 mb-1">Research Tool — Not Forensic Identification</h4>
            <p className="text-xs text-yellow-200/70">
              This tool uses geometric facial proportions and statistical models. It cannot definitively identify individuals.
              Results are sensitive to image quality, pose, lighting, and expression. Never use for legal, security, or
              identification purposes. All processing occurs locally in your browser — no images are uploaded.
            </p>
          </div>
        </div>
      </div>

      {/* Headline Score */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl">
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white mb-1">Calibrated Similarity Score</h2>
          <p className="text-gray-400 text-xs">Log-likelihood ratio mapped to probability. Not a raw percentage match.</p>
        </div>

        <div className="flex items-center justify-center gap-8 mb-6">
          <div className="relative">
            <svg className="w-36 h-36 transform -rotate-90">
              <circle cx="72" cy="72" r="62" fill="none" stroke="#374151" strokeWidth="10" />
              <circle
                cx="72" cy="72" r="62" fill="none"
                stroke={score.overallScore >= 60 ? '#4ade80' : score.overallScore >= 40 ? '#fbbf24' : '#f87171'}
                strokeWidth="10"
                strokeDasharray={`${(score.overallScore / 100) * 390} 390`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-white">{score.overallScore}%</span>
              <span className="text-xs text-gray-400">±{(score.confidenceInterval[1] - score.confidenceInterval[0]).toFixed(0)}%</span>
            </div>
          </div>
          <div className="text-left space-y-2">
            <div className={`text-lg font-semibold ${score.overallScore >= 60 ? 'text-green-400' : score.overallScore >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
              {score.verdict}
            </div>
            <div className="text-sm text-gray-400">
              Likelihood ratio: <span className="font-mono text-white">{score.likelihoodRatio.toFixed(2)}</span>
            </div>
            <div className="text-sm text-gray-400">
              95% CI: <span className="font-mono text-white">[{score.confidenceInterval[0]}%, {score.confidenceInterval[1]}%]</span>
            </div>
            {ageNormalized && ageDelta > 3 && (
              <div className="text-sm text-blue-400">
                Age-adjusted: +{score.ageAdjustment.toFixed(1)} pts for {ageDelta}yr age gap
              </div>
            )}
          </div>
        </div>

        {/* Why this score */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <div>
            <h4 className="text-sm font-medium text-green-400 mb-2">Supporting similarity</h4>
            {score.supportingMetrics.length > 0 ? (
              <div className="space-y-1">
                {score.supportingMetrics.map((m, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-300">{m.name}</span>
                    <span className="text-green-400 font-mono">+{m.contribution.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No strong supporting metrics</p>
            )}
          </div>
          <div>
            <h4 className="text-sm font-medium text-red-400 mb-2">Opposing similarity</h4>
            {score.opposingMetrics.length > 0 ? (
              <div className="space-y-1">
                {score.opposingMetrics.map((m, i) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span className="text-gray-300">{m.name}</span>
                    <span className="text-red-400 font-mono">-{m.contribution.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">No strong opposing metrics</p>
            )}
          </div>
        </div>

        <p className="text-xs text-gray-500 mt-4 text-center">{score.methodNote}</p>
      </div>

      {/* Age Estimates */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Age Estimation</h3>
        <div className="grid grid-cols-2 gap-4">
          <AgeCard label="Person 1" age={age1} nImages={results1.length} />
          <AgeCard label="Person 2" age={age2} nImages={results2.length} />
        </div>
        <div className="mt-3 text-sm text-gray-400 text-center">
          Age delta: <span className="text-white font-mono">{ageDelta} years</span>
          {ageDelta > 10 && (
            <span className="ml-2 text-yellow-400">
              (Large gap — developmental changes expected. {ageNormalized ? 'Age-normalized view active.' : 'Enable age normalization for fairer comparison.'})
            </span>
          )}
        </div>
      </div>

      {/* Multi-image Summary */}
      {(results1.length > 1 || results2.length > 1) && (
        <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
          <h3 className="text-lg font-semibold text-white mb-4">Multi-Image Aggregation</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Person 1:</span>
              <span className="text-white ml-2">{agg1.nImages} image(s)</span>
              <span className="text-gray-500 ml-2">Variance: {agg1.perImageVariance.toFixed(4)}</span>
            </div>
            <div>
              <span className="text-gray-400">Person 2:</span>
              <span className="text-white ml-2">{agg2.nImages} image(s)</span>
              <span className="text-gray-500 ml-2">Variance: {agg2.perImageVariance.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Per-Metric Detail Cards */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">
          Per-Metric Analysis
          <span className="text-xs text-gray-400 ml-2">({pairedMetrics.length} metrics compared)</span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pairedMetrics.map(([m1, m2], i) => (
            <MetricCard
              key={i}
              metric1={m1}
              metric2={m2}
              ageDelta={ageDelta}
              ageNormalized={ageNormalized}
              showUncertainty={showUncertainty}
            />
          ))}
        </div>
      </div>

      {/* Methodology */}
      <div className="bg-gray-800/30 rounded-2xl p-6 border border-gray-700/50">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Methodology & Limitations</h3>
        <div className="text-xs text-gray-500 space-y-2">
          <p>
            <strong className="text-gray-400">Pose normalization:</strong> All angles and ratios are computed after
            estimating head pose (roll/pitch/yaw) and rotating landmarks into a canonical frontal frame.
            Head tilt is NOT scored as similarity — it is pose, not identity.
          </p>
          <p>
            <strong className="text-gray-400">Occlusion detection:</strong> Landmark anomalies (abnormal eye aspect ratios,
            jaw line irregularities, nose position) trigger region-level quality flags.
            Occluded metrics are excluded from scoring, never silently averaged.
          </p>
          <p>
            <strong className="text-gray-400">Uncertainty:</strong> Each metric includes a 95% confidence interval from
            Monte Carlo landmark jitter (σ=2px, 100 samples). All displayed values are rounded to match CI width.
          </p>
          <p>
            <strong className="text-gray-400">Age normalization:</strong> When enabled, expected developmental changes
            (based on Farkas 1994 craniofacial anthropometry) are subtracted before comparison.
            Growth-related differences are labeled "expected" not penalized.
          </p>
          <p>
            <strong className="text-gray-400">Scoring:</strong> Calibrated log-likelihood ratio mapped to probability.
            Metrics weighted by identity-informativeness × age-stability × (1 - style sensitivity).
            Not a simple weighted average.
          </p>
          <p>
            <strong className="text-gray-400">Limitations:</strong> This tool uses 2D landmarks from a single image.
            It cannot capture 3D facial structure, skin texture, or fine details. Accuracy depends on image quality,
            pose, lighting, and expression. Cross-age comparisons are inherently less reliable.
          </p>
        </div>
      </div>
    </div>
  );
}

function AgeCard({ label, age, nImages }: { label: string; age: AgeEstimate; nImages: number }) {
  return (
    <div className="bg-gray-900/50 rounded-xl p-4">
      <div className="text-sm text-gray-400 mb-1">{label} {nImages > 1 && `(${nImages} images)`}</div>
      <div className="text-2xl font-bold text-white">{age.estimatedAge} <span className="text-sm text-gray-400">years</span></div>
      <div className="text-xs text-gray-500 mt-1">
        95% CI: [{age.confidenceInterval[0]}, {age.confidenceInterval[1]}]
      </div>
      <div className="text-xs text-gray-500 mt-1">
        Confidence: {(age.confidence * 100).toFixed(0)}%
      </div>
      <div className="text-xs text-gray-600 mt-1 italic">{age.basis}</div>
    </div>
  );
}
