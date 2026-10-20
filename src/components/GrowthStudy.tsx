/**
 * GrowthStudy — the "what changes / what doesn't" reference panel.
 * Content lives in src/utils/traits.ts so the science is documented in one place.
 */

import {
  THINGS_THAT_STAY_THE_SAME,
  THINGS_THAT_CHANGE,
  HOW_WE_ANALYZE,
  TRAIT_KB,
  type TraitInfo,
} from '../utils/traits';

export default function GrowthStudy() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white">Growing Up: What Changes, What Doesn’t</h2>
        <p className="text-sm text-gray-400 mt-2 max-w-2xl mx-auto">
          Cross-age face comparison only works if you know which differences are <em>development</em>
          and which are <em>identity</em>. This tool scores every trait accordingly.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stays the same */}
        <section className="bg-gradient-to-br from-emerald-900/30 to-gray-900 rounded-2xl p-6 border border-emerald-700/40">
          <header className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">🔒</span>
            <h3 className="text-base font-semibold text-emerald-300">Stays essentially the same</h3>
          </header>
          <ul className="space-y-3">
            {THINGS_THAT_STAY_THE_SAME.map(p => (
              <li key={p.title} className="text-sm">
                <span className="font-medium text-white">{p.title}</span>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{p.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Changes */}
        <section className="bg-gradient-to-br from-orange-900/30 to-gray-900 rounded-2xl p-6 border border-orange-700/40">
          <header className="flex items-center gap-2 mb-4">
            <span className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center text-orange-400">📈</span>
            <h3 className="text-base font-semibold text-orange-300">Changes predictably with age</h3>
          </header>
          <ul className="space-y-3">
            {THINGS_THAT_CHANGE.map(p => (
              <li key={p.title} className="text-sm">
                <span className="font-medium text-white">{p.title}</span>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{p.detail}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Method */}
      <section className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700">
        <header className="flex items-center gap-2 mb-4">
          <span className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">🧪</span>
          <h3 className="text-base font-semibold text-blue-300">How the analyzer turns this into a verdict</h3>
        </header>
        <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {HOW_WE_ANALYZE.map(p => (
            <li key={p.title} className="bg-gray-900/50 rounded-xl p-4 border border-gray-700/50">
              <span className="text-xs font-semibold text-white block mb-1">{p.title}</span>
              <p className="text-xs text-gray-400 leading-relaxed">{p.detail}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Quick reference table */}
      <TraitReference />

      <p className="text-xs text-gray-500 text-center max-w-3xl mx-auto">
        References: Farkas, <em>Anthropometry of the Head and Face</em> (1994) · Enlow,{' '}
        <em>Facial Growth</em> (1990) · Krogman &amp; İşcan, <em>The Human Skeleton in Forensic
        Medicine</em> (1986) · Single &amp; Baumrind (1976) on inter-ocular stability · Scammon’s
        tissue growth curves. Magnitudes used for age normalization are approximations of published
        mean growth rates and vary between individuals.
      </p>
    </div>
  );
}

function TraitReference() {
  const rows = Object.values(TRAIT_KB) as TraitInfo[];
  const badge = (cls: string) =>
    cls === 'stable'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-600/40'
      : cls === 'moderate'
        ? 'bg-yellow-500/20 text-yellow-300 border-yellow-600/40'
        : 'bg-orange-500/20 text-orange-300 border-orange-600/40';
  const label = (cls: string) =>
    cls === 'stable' ? 'Stable' : cls === 'moderate' ? 'Slight drift' : 'Changes a lot';

  return (
    <section className="bg-gray-800/40 rounded-2xl p-6 border border-gray-700 overflow-x-auto">
      <h3 className="text-base font-semibold text-white mb-1">Per-trait cheat sheet</h3>
      <p className="text-xs text-gray-400 mb-4">
        Hover a row for why that trait behaves the way it does across ages.
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-500 border-b border-gray-700">
            <th className="py-2 pr-3 font-medium">Trait</th>
            <th className="py-2 pr-3 font-medium">Child → adult</th>
            <th className="py-2 font-medium">What to look for</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.key} className="border-b border-gray-700/40 hover:bg-gray-700/20 transition-colors align-top">
              <td className="py-2 pr-3 whitespace-nowrap text-white font-medium">
                <span className="mr-1">{t.emoji}</span>{t.label}
              </td>
              <td className="py-2 pr-3">
                <span className={`px-2 py-0.5 rounded-md border ${badge(t.changeClass)}`}>
                  {label(t.changeClass)}
                </span>
              </td>
              <td className="py-2 text-gray-400 leading-relaxed max-w-md" title={`${t.whyStableOrChanges}\n\nSource: ${t.source}`}>
                {t.howToCompare}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
