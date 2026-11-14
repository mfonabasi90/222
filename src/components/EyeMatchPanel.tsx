/**
 * EyeMatchPanel — "Same person from the eyes alone?"
 *
 * Builds an ocular fingerprint per image (canthal tilt + periocular geometry),
 * averages fingerprints across a person's photos, then compares Person 1 vs
 * Person 2 with a weighted log-likelihood-ratio model.
 */

import { useMemo } from 'react';
import { ImageAnalysisResult } from './FaceCanvas';
import {
  EyeFingerprint,
  EyeGeometry,
  OcularArrangement,
  compareEyeFingerprints,
  tiltDescriptor,
} from '../utils/eyeAnalysis';

interface EyeMatchPanelProps {
  results1: ImageAnalysisResult[];
  results2: ImageAnalysisResult[];
  excludeBrows: boolean;
}

export default function EyeMatchPanel({ results1, results2, excludeBrows }: EyeMatchPanelProps) {
  const fp1 = useMemo(() => averageFingerprints(results1.map(r => r.eyeFingerprint)), [results1]);
  const fp2 = useMemo(() => averageFingerprints(results2.map(r => r.eyeFingerprint)), [results2]);

  const match = useMemo(
    () => compareEyeFingerprints(fp1, fp2, { excludeBrows }),
    [fp1, fp2, excludeBrows]
  );

  const color =
    match.score >= 62 ? 'text-emerald-400' : match.score >= 45 ? 'text-yellow-400' : 'text-red-400';
  const ring =
    match.score >= 62 ? '#34d399' : match.score >= 45 ? '#fbbf24' : '#f87171';

  return (
    <div className="bg-gradient-to-br from-indigo-950/40 to-gray-900 rounded-2xl p-6 border border-indigo-700/40 shadow-xl space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            👁️ Ocular Identity Match
            <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-600/40">
              eyes only
            </span>
          </h3>
          <p className="text-xs text-gray-400 mt-1 max-w-xl">
            Compares canthal tilt and surrounding eye geometry (spacing, openness, iris position,
            lid coverage, brow frame, asymmetry signature) in the pose-normalized frame — ignoring
            nose, mouth, jaw, skin and hair entirely.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">{results1.length + results2.length} photo(s) · {match.nFeatures} features</div>
          <div className="text-xs text-gray-500">
            Quality: <span className={fp1.quality === 'poor' || fp2.quality === 'poor' ? 'text-red-400' : 'text-green-400'}>
              {fp1.quality}/{fp2.quality}
            </span>
          </div>
        </div>
      </div>

      {/* Score + verdict */}
      <div className="flex items-center justify-center gap-8 flex-wrap">
        <div className="relative">
          <svg className="w-32 h-32 transform -rotate-90">
            <circle cx="64" cy="64" r="55" fill="none" stroke="#312e81" strokeWidth="9" />
            <circle
              cx="64" cy="64" r="55" fill="none"
              stroke={ring} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${(match.score / 100) * 345} 345`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${color}`}>{match.score}%</span>
            <span className="text-[10px] text-gray-500">CI [{match.confidenceInterval[0]}, {match.confidenceInterval[1]}]</span>
          </div>
        </div>
        <div className="space-y-2 max-w-md">
          <div className={`text-base font-semibold ${color}`}>{match.verdict}</div>
          <div className="text-sm text-gray-400">
            Likelihood ratio: <span className="font-mono text-white">{match.likelihoodRatio.toFixed(2)}</span>
            <span className="text-xs text-gray-500 ml-2">
              ({match.likelihoodRatio >= 1
                ? `${match.likelihoodRatio.toFixed(1)}× more likely if same person`
                : `${(1 / Math.max(match.likelihoodRatio, 1e-6)).toFixed(1)}× more likely if different people`})
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{match.methodNote}</p>
        </div>
      </div>

      {/* Canthal tilt side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TiltCard title="Person 1" fp={fp1} accent="blue" />
        <TiltCard title="Person 2" fp={fp2} accent="purple" />
      </div>

      {/* Feature comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-700">
              <th className="py-2 pr-3 font-medium">Eye feature</th>
              <th className="py-2 pr-3 font-medium text-right">P1</th>
              <th className="py-2 pr-3 font-medium text-right">P2</th>
              <th className="py-2 pr-3 font-medium text-right">Δ / tolerance</th>
              <th className="py-2 font-medium">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {match.rows.map(row => {
              const z = row.delta / row.tolerance;
              const skipped = excludeBrows && row.name.startsWith('Brow');
              return (
                <tr key={row.name} className={`border-b border-gray-700/40 ${skipped ? 'opacity-40' : ''}`}>
                  <td className="py-1.5 pr-3 text-gray-300 whitespace-nowrap">
                    {row.name}
                    {row.weight >= 0.8 && <span className="ml-1 text-[9px] text-indigo-400" title="Highly identity-informative">★</span>}
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-300">{fmt(row.value1, row.name)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-300">{fmt(row.value2, row.name)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-400">
                    {z.toFixed(2)}×
                  </td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${z < 0.8 ? 'bg-emerald-400' : z < 1.15 ? 'bg-gray-500' : 'bg-red-400'}`}
                          style={{ width: `${Math.min(100, z * 50)}%` }}
                        />
                      </div>
                      <span className={row.supportsMatch ? 'text-emerald-400' : 'text-red-400'}>
                        {skipped ? 'excluded (brows)' : z < 0.8 ? 'matches' : z < 1.15 ? 'neutral' : 'differs'}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(fp1.notes.length > 0 || fp2.notes.length > 0) && (
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-3 text-xs text-yellow-200/80 space-y-1">
          {[...new Set([...fp1.notes, ...fp2.notes])].map(n => <div key={n}>⚠️ {n}</div>)}
        </div>
      )}

      <p className="text-[11px] text-gray-500 leading-relaxed">
        How to read this: eye-region geometry is among the most stable identity information a photo
        carries — the orbits reach near-adult size by age 5, so this comparison works even across big
        age gaps. But two unrelated people can share similar eye metrics, and heavy makeup, glasses,
        squinting or one-sided lighting degrade it. Use alongside the full-face score, never as proof.
      </p>
    </div>
  );
}

// ─── Tilt card ───────────────────────────────────────────────────────────────

function TiltCard({ title, fp, accent }: { title: string; fp: EyeFingerprint; accent: string }) {
  const border = accent === 'blue' ? 'border-blue-700/40' : 'border-purple-700/40';
  return (
    <div className={`bg-gray-900/60 rounded-xl p-4 border ${border}`}>
      <div className="text-sm font-semibold text-white mb-3">{title} — canthal tilt profile</div>
      <div className="space-y-3">
        {[fp.left, fp.right].map(eye => (
          <div key={eye.side} className="flex items-center gap-3">
            <TiltGlyph deg={eye.canthalTiltDeg} />
            <div className="min-w-0">
              <div className="text-xs text-gray-400 capitalize">{eye.side} eye</div>
              <div className="text-sm text-white font-medium">
                {eye.canthalTiltDeg >= 0 ? '+' : ''}{eye.canthalTiltDeg.toFixed(1)}° · {eye.classification}
              </div>
              <div className="text-[11px] text-gray-500">{tiltDescriptor(eye.canthalTiltDeg)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-gray-700/50 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-400">
        <Stat label="Tilt asymmetry L−R" value={`${fp.arrangement.tiltAsymmetryDeg.toFixed(1)}°`} />
        <Stat label="Eye width / PD" value={`${(((fp.left.widthToPD + fp.right.widthToPD) / 2)).toFixed(2)}`} />
        <Stat label="Inner canthi / PD" value={fp.arrangement.innerCanthalDistanceRatio.toFixed(2)} />
        <Stat label="Openness L/R" value={`${fp.left.aspectRatio.toFixed(2)}/${fp.right.aspectRatio.toFixed(2)}`} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 truncate">{label}</span>
      <span className="font-mono text-gray-300">{value}</span>
    </div>
  );
}

/** Small SVG showing the eye slant direction at real scale (exaggerated ×2 for legibility). */
function TiltGlyph({ deg }: { deg: number }) {
  const d = Math.max(-24, Math.min(24, deg * 2));
  const color = deg > 1.5 ? '#34d399' : deg < -1.5 ? '#fb923c' : '#38bdf8';
  return (
    <svg width="52" height="34" viewBox="-26 -17 52 34" className="shrink-0">
      {/* almond outline (untilted reference) */}
      <path d="M -20 0 Q 0 -9 20 0 Q 0 9 -20 0 Z" fill="none" stroke="#4b5563" strokeWidth="1" strokeDasharray="2 2" />
      <g transform={`rotate(${-d})`}>
        <line x1="-20" y1="0" x2="20" y2="0" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="-20" cy="0" r="2.4" fill={color} />
        <circle cx="20" cy="0" r="2.4" fill={color} />
      </g>
    </svg>
  );
}

// ─── Fingerprint averaging across multiple photos of one person ──────────────

const DEG_SUFFIX = ['tilt', 'angle', 'asymmetry'];

function fmt(v: number, name: string): string {
  const isDeg = DEG_SUFFIX.some(s => name.toLowerCase().includes(s));
  return isDeg ? `${v >= 0 && !name.includes('symmetry') ? '+' : ''}${v.toFixed(1)}°` : v.toFixed(2);
}

function avgNums(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);
}

function avgEye(eyes: EyeGeometry[]): EyeGeometry {
  const first = eyes[0];
  const canthalTiltDeg = avgNums(eyes.map(e => e.canthalTiltDeg));
  return {
    ...first,
    canthalTiltDeg,
    tiltCI: [
      Math.min(...eyes.map(e => Math.min(...e.tiltCI))),
      Math.max(...eyes.map(e => Math.max(...e.tiltCI))),
    ],
    classification: eyeClassification(canthalTiltDeg),
    severity: eyeSeverity(canthalTiltDeg),
    aspectRatio: avgNums(eyes.map(e => e.aspectRatio)),
    irisVerticalPosition: avgNums(eyes.map(e => e.irisVerticalPosition)),
    lowerScleraRatio: avgNums(eyes.map(e => e.lowerScleraRatio)),
    hoodingIndex: avgNums(eyes.map(e => e.hoodingIndex)),
    browHeight: avgNums(eyes.map(e => e.browHeight)),
    browApexOffset: avgNums(eyes.map(e => e.browApexOffset)),
    browAngleDeg: avgNums(eyes.map(e => e.browAngleDeg)),
    widthToPD: avgNums(eyes.map(e => e.widthToPD)),
    opennessArea: avgNums(eyes.map(e => e.opennessArea)),
  };
}

function eyeClassification(deg: number): EyeGeometry['classification'] {
  if (deg > 1.5) return 'Positive (upturned)';
  if (deg < -1.5) return 'Negative (downturned)';
  return 'Neutral';
}
function eyeSeverity(deg: number): EyeGeometry['severity'] {
  const a = Math.abs(deg);
  return a >= 8 ? 'steep' : a >= 4 ? 'moderate' : 'subtle';
}

function avgArrangement(arrs: OcularArrangement[]): OcularArrangement {
  const first = arrs[0];
  return {
    ...first,
    innerCanthalDistanceRatio: avgNums(arrs.map(a => a.innerCanthalDistanceRatio)),
    outerCanthalSpanRatio: avgNums(arrs.map(a => a.outerCanthalSpanRatio)),
    eyeSeparationToFaceWidth: avgNums(arrs.map(a => a.eyeSeparationToFaceWidth)),
    eyeHeightAsymmetry: avgNums(arrs.map(a => a.eyeHeightAsymmetry)),
    tiltAsymmetryDeg: avgNums(arrs.map(a => a.tiltAsymmetryDeg)),
    eyeWidthAsymmetry: avgNums(arrs.map(a => a.eyeWidthAsymmetry)),
  };
}

export function averageFingerprints(fps: EyeFingerprint[]): EyeFingerprint {
  const usable = fps.filter(Boolean);
  if (usable.length === 0) {
    // Should not happen (panel only renders with results); return neutral zeros.
    const blank = {
      canthalTiltDeg: 0, tiltCI: [0, 0] as [number, number], classification: 'Neutral' as const,
      severity: 'subtle' as const, aspectRatio: 0, irisVerticalPosition: 0.5, lowerScleraRatio: 0,
      hoodingIndex: 0, browHeight: 0, browApexOffset: 0, browAngleDeg: 0, widthToPD: 0, opennessArea: 0,
    };
    return {
      left: { ...blank, side: 'left' }, right: { ...blank, side: 'right' },
      arrangement: {
        innerCanthalDistanceRatio: 0, outerCanthalSpanRatio: 0, eyeSeparationToFaceWidth: 0,
        eyeHeightAsymmetry: 0, tiltAsymmetryDeg: 0, eyeWidthAsymmetry: 0,
      },
      quality: 'poor', notes: ['No usable eye data'],
    };
  }
  const rank = { good: 3, fair: 2, poor: 1 };
  return {
    left: avgEye(usable.map(f => f.left)),
    right: avgEye(usable.map(f => f.right)),
    arrangement: avgArrangement(usable.map(f => f.arrangement)),
    quality: usable.reduce((best, f) => (rank[f.quality] > rank[best] ? f.quality : best), 'poor' as EyeFingerprint['quality']),
    notes: [...new Set(usable.flatMap(f => f.notes))],
  };
}
