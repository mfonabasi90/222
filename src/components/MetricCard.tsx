import { MetricResult } from '../utils/metrics';
import { formatWithCI, roundToPrecision } from '../utils/geometry';
import { getExpectedDelta } from '../utils/analysis';

interface MetricCardProps {
  metric1: MetricResult;
  metric2: MetricResult;
  ageDelta: number;
  ageNormalized: boolean;
  showUncertainty: boolean;
}

export default function MetricCard({ metric1, metric2, ageDelta, ageNormalized, showUncertainty }: MetricCardProps) {
  const observedDelta = Math.abs(metric1.value - metric2.value);
  const { expected: expectedDelta, tolerance } = ageNormalized
    ? getExpectedDelta(metric1.name, ageDelta)
    : { expected: 0, tolerance: 0 };

  const residual = Math.abs(observedDelta - Math.abs(expectedDelta));
  const effectiveTolerance = Math.max(tolerance, metric1.uncertainty.std + metric2.uncertainty.std, 0.01);
  const normalizedResidual = residual / effectiveTolerance;

  // Score this metric: <1 = supports same person, >1 = supports different
  const isSupporting = normalizedResidual < 1;
  const scoreColor = isSupporting
    ? normalizedResidual < 0.5 ? 'text-green-400' : 'text-yellow-400'
    : normalizedResidual > 2 ? 'text-red-400' : 'text-orange-400';

  const qualityColor = metric1.quality === 'good' && metric2.quality === 'good'
    ? 'bg-green-500'
    : metric1.quality === 'occluded' || metric2.quality === 'occluded'
    ? 'bg-gray-500'
    : metric1.quality === 'poor' || metric2.quality === 'poor'
    ? 'bg-red-500'
    : 'bg-yellow-500';

  const effectiveWeight = metric1.identityWeight * metric1.ageStability * (1 - metric1.styleSensitivity * 0.5);

  return (
    <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${qualityColor}`}></span>
          <span className="text-sm font-medium text-gray-200">{metric1.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {metric1.isOccluded || metric2.isOccluded ? (
            <span className="text-xs px-2 py-0.5 bg-gray-700 text-gray-400 rounded">EXCLUDED</span>
          ) : (
            <span className={`text-sm font-bold ${scoreColor}`}>
              {isSupporting ? '≈' : '≠'}
            </span>
          )}
        </div>
      </div>

      {/* Values */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-800/50 rounded-lg p-2">
          <div className="text-xs text-gray-500 mb-1">Person 1</div>
          <div className="text-sm text-white font-mono">
            {showUncertainty
              ? formatWithCI(metric1.value, metric1.uncertainty.ci95, metric1.unit)
              : `${roundToPrecision(metric1.value, metric1.uncertainty.ci95)}${metric1.unit}`
            }
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Quality: <span className={metric1.quality === 'good' ? 'text-green-400' : metric1.quality === 'fair' ? 'text-yellow-400' : 'text-red-400'}>{metric1.quality}</span>
          </div>
        </div>
        <div className="bg-gray-800/50 rounded-lg p-2">
          <div className="text-xs text-gray-500 mb-1">Person 2</div>
          <div className="text-sm text-white font-mono">
            {showUncertainty
              ? formatWithCI(metric2.value, metric2.uncertainty.ci95, metric2.unit)
              : `${roundToPrecision(metric2.value, metric2.uncertainty.ci95)}${metric2.unit}`
            }
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Quality: <span className={metric2.quality === 'good' ? 'text-green-400' : metric2.quality === 'fair' ? 'text-yellow-400' : 'text-red-400'}>{metric2.quality}</span>
          </div>
        </div>
      </div>

      {/* Delta comparison */}
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-gray-400">Observed Δ:</span>
          <span className="text-white font-mono">{observedDelta.toFixed(3)}{metric1.unit}</span>
        </div>
        {ageNormalized && Math.abs(expectedDelta) > 0.001 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Expected developmental Δ:</span>
            <span className="text-blue-400 font-mono">{expectedDelta.toFixed(3)}{metric1.unit}</span>
          </div>
        )}
        {ageNormalized && Math.abs(expectedDelta) > 0.001 && (
          <div className="flex justify-between">
            <span className="text-gray-400">Residual (observed - expected):</span>
            <span className={`font-mono ${scoreColor}`}>{residual.toFixed(3)}{metric1.unit}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-400">L/R consistency:</span>
          <span className={`font-mono ${metric1.leftRightConsistency > 0.7 ? 'text-green-400' : metric1.leftRightConsistency > 0.3 ? 'text-yellow-400' : 'text-red-400'}`}>
            {(metric1.leftRightConsistency * 100).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Weight bar */}
      <div className="mt-3 pt-3 border-t border-gray-700/50">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-gray-500">Contribution weight</span>
          <span className="text-xs text-gray-400 font-mono">{(effectiveWeight * 100).toFixed(0)}%</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full ${isSupporting ? 'bg-green-500' : 'bg-red-500'}`}
            style={{ width: `${effectiveWeight * 100}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-600">
          <span>ID: {(metric1.identityWeight * 100).toFixed(0)}%</span>
          <span>Age-stable: {(metric1.ageStability * 100).toFixed(0)}%</span>
          <span>Style-sens: {(metric1.styleSensitivity * 100).toFixed(0)}%</span>
        </div>
      </div>

      {/* Notes */}
      {metric1.notes && (
        <div className="mt-2 text-xs text-gray-500 italic">{metric1.notes}</div>
      )}
    </div>
  );
}
