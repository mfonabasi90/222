import { FacialMetrics, calculateSimilarity } from '../utils/faceAnalysis';

interface AnalysisResultsProps {
  metrics1: FacialMetrics | null;
  metrics2: FacialMetrics | null;
}

export default function AnalysisResults({ metrics1, metrics2 }: AnalysisResultsProps) {
  if (!metrics1 || !metrics2) return null;

  const similarity = calculateSimilarity(metrics1, metrics2);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    if (score >= 40) return 'text-orange-400';
    return 'text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getLikenessLabel = (score: number) => {
    if (score >= 85) return 'Extremely Similar';
    if (score >= 70) return 'Very Similar';
    if (score >= 55) return 'Moderately Similar';
    if (score >= 40) return 'Somewhat Similar';
    if (score >= 25) return 'Low Similarity';
    return 'Very Different';
  };

  return (
    <div className="w-full max-w-4xl mx-auto mt-8">
      {/* Overall Score */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 shadow-2xl mb-6">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Similarity Analysis</h2>
          <p className="text-gray-400 text-sm">Based on facial proportions, angles, and structural measurements</p>
        </div>

        <div className="flex items-center justify-center mb-6">
          <div className="relative">
            <svg className="w-40 h-40 transform -rotate-90">
              <circle
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke="#374151"
                strokeWidth="12"
              />
              <circle
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke={similarity.overall >= 70 ? '#4ade80' : similarity.overall >= 50 ? '#fbbf24' : '#f87171'}
                strokeWidth="12"
                strokeDasharray={`${(similarity.overall / 100) * 440} 440`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-4xl font-bold ${getScoreColor(similarity.overall)}`}>
                {similarity.overall}%
              </span>
              <span className="text-xs text-gray-400 mt-1">Match</span>
            </div>
          </div>
        </div>

        <div className="text-center">
          <span className={`text-lg font-semibold ${getScoreColor(similarity.overall)}`}>
            {getLikenessLabel(similarity.overall)}
          </span>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700">
        <h3 className="text-lg font-semibold text-white mb-4">Detailed Breakdown</h3>
        <div className="space-y-4">
          {similarity.breakdown.map((item, index) => (
            <div key={index} className="bg-gray-900/50 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-200">{item.category}</span>
                <span className={`text-sm font-bold ${getScoreColor(item.score)}`}>
                  {item.score.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${getScoreBg(item.score)}`}
                  style={{ width: `${item.score}%` }}
                />
              </div>
              <p className="text-xs text-gray-500">{item.details}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Metrics Comparison Table */}
      <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 mt-6">
        <h3 className="text-lg font-semibold text-white mb-4">Raw Measurements</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 border-b border-gray-700">
                <th className="text-left py-2 px-3">Metric</th>
                <th className="text-center py-2 px-3">Person 1</th>
                <th className="text-center py-2 px-3">Person 2</th>
                <th className="text-center py-2 px-3">Diff</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Left Eye Angle</td>
                <td className="text-center py-2 px-3">{metrics1.leftEyeAngle.toFixed(1)}°</td>
                <td className="text-center py-2 px-3">{metrics2.leftEyeAngle.toFixed(1)}°</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.leftEyeAngle - metrics2.leftEyeAngle).toFixed(1)}°</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Right Eye Angle</td>
                <td className="text-center py-2 px-3">{metrics1.rightEyeAngle.toFixed(1)}°</td>
                <td className="text-center py-2 px-3">{metrics2.rightEyeAngle.toFixed(1)}°</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.rightEyeAngle - metrics2.rightEyeAngle).toFixed(1)}°</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Eye Aspect Ratio</td>
                <td className="text-center py-2 px-3">{metrics1.eyeAspectRatio.toFixed(3)}</td>
                <td className="text-center py-2 px-3">{metrics2.eyeAspectRatio.toFixed(3)}</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.eyeAspectRatio - metrics2.eyeAspectRatio).toFixed(3)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Head Tilt</td>
                <td className="text-center py-2 px-3">{metrics1.headTilt.toFixed(1)}°</td>
                <td className="text-center py-2 px-3">{metrics2.headTilt.toFixed(1)}°</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.headTilt - metrics2.headTilt).toFixed(1)}°</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Face Ratio (H/W)</td>
                <td className="text-center py-2 px-3">{metrics1.faceRatio.toFixed(3)}</td>
                <td className="text-center py-2 px-3">{metrics2.faceRatio.toFixed(3)}</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.faceRatio - metrics2.faceRatio).toFixed(3)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Nose Width Ratio</td>
                <td className="text-center py-2 px-3">{(metrics1.noseWidth / metrics1.faceWidth * 100).toFixed(1)}%</td>
                <td className="text-center py-2 px-3">{(metrics2.noseWidth / metrics2.faceWidth * 100).toFixed(1)}%</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.noseWidth / metrics1.faceWidth - metrics2.noseWidth / metrics2.faceWidth).toFixed(3)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Mouth Aspect Ratio</td>
                <td className="text-center py-2 px-3">{metrics1.mouthAspectRatio.toFixed(3)}</td>
                <td className="text-center py-2 px-3">{metrics2.mouthAspectRatio.toFixed(3)}</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.mouthAspectRatio - metrics2.mouthAspectRatio).toFixed(3)}</td>
              </tr>
              <tr className="border-b border-gray-700/50">
                <td className="py-2 px-3">Jaw Angle</td>
                <td className="text-center py-2 px-3">{metrics1.jawAngle.toFixed(1)}°</td>
                <td className="text-center py-2 px-3">{metrics2.jawAngle.toFixed(1)}°</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.jawAngle - metrics2.jawAngle).toFixed(1)}°</td>
              </tr>
              <tr>
                <td className="py-2 px-3">Cheek Width Ratio</td>
                <td className="text-center py-2 px-3">{(metrics1.cheekWidth / metrics1.faceWidth * 100).toFixed(1)}%</td>
                <td className="text-center py-2 px-3">{(metrics2.cheekWidth / metrics2.faceWidth * 100).toFixed(1)}%</td>
                <td className="text-center py-2 px-3 text-yellow-400">{Math.abs(metrics1.cheekWidth / metrics1.faceWidth - metrics2.cheekWidth / metrics2.faceWidth).toFixed(3)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
