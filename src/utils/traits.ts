/**
 * traits.ts — The developmental science layer: what changes and what stays
 * the same as a person grows from child to adult.
 *
 * Sources (craniofacial anthropometry & growth literature):
 * - Farkas LG. "Anthropometry of the Face and Head" (1981) & "Humanoid Anthropometry" (1994)
 * - Krogman WM, İşcan MY. "The Human Skeleton in Forensic Medicine" (1986)
 * - Enlow DH. "Human Growth and Development / Facial Growth" (1975, 1990)
 * - Scammon RE. Growth curves of different body tissues (neural early, genital late, general intermediate)
 * - Single & Baumrind (1976): inter-ocular distance is one of the most stable facial dimensions
 * - Carlson et al. (1982): mandibular growth continues through adolescence; gonial angle decreases
 * - Sperber GH (2001): craniofacial growth patterns
 *
 * Summary of the biology this module encodes:
 *
 * STAYS THE SAME (identity-carrying, largely genetically fixed after ~age 5):
 *   • Eye spacing (interocular distance barely grows — the orbits reach near-adult
 *     size very early because the neurocranium matures first)
 *   • Eye shape / canthal tilt / orbital aperture proportions
 *   • Relative position of features along the vertical face axis (the "thirds")
 *   • Ear length ratio relative to eye-to-mouth distance (ears grow but stay proportional)
 *   • Philtrum (philtral column height/width pattern)
 *   • Bone-based horizontal ratios measured against bizygomatic width
 *   • General left-right layout, asymmetry signature
 *
 * CHANGES (developmental, expected — should NOT be treated as evidence of difference):
 *   • Vertical facial dominance: the face grows DOWNWARD (maxilla & mandible), so the
 *     lower third elongates while the upper third (forehead) stays proportionally large
 *     in children → child faces look "all forehead and eyes"
 *   • Cheek roundness: infantile buccal fat pads (Bichat's fat) create chubby cheeks that
 *     regress around puberty → cheek/jaw width ratio drops
 *   • Chin definition: mandibular growth spurt creates a chin where a young child has none
 *   • Jaw angle: gonial angle is wide/open in toddlers (~140-150°) and becomes more defined
 *     (~120-130°) with adolescent mandibular growth
 *   • Nose: cartilaginous nose keeps growing — appears smaller and upturned in kids,
 *     longer/narrower bridge in adults; nasal projection increases
 *   • Lips: vermilion border thins with age; relative lip height decreases
 *   • Overall head size vs body, skin texture, hairline recession, facial hair, eyebrows
 *     grooming, makeup, weight-related volume changes
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChangeClass = 'stable' | 'moderate' | 'changing';

export interface TraitInfo {
  key: string;              // matches MetricResult.name
  label: string;            // short human label
  emoji: string;
  changeClass: ChangeClass; // how much this trait changes child → adult
  /** Plain-language explanation of WHY it does/doesn't change */
  whyStableOrChanges: string;
  /** What specifically to look for when comparing a child photo to an adult photo */
  howToCompare: string;
  /** Literature source note */
  source: string;
}

// ─── Trait knowledge base (keyed by metric name) ─────────────────────────────

export const TRAIT_KB: Record<string, TraitInfo> = {
  'Left Canthal Tilt': {
    key: 'Left Canthal Tilt',
    label: 'Canthal tilt (L)',
    emoji: '👁️',
    changeClass: 'stable',
    whyStableOrChanges:
      'The slant of the line between the inner and outer eye corners is set by the bony orbit and lid anatomy. It is essentially fixed after about age 5.',
    howToCompare:
      'Strong identity signal. A matching tilt on both sides across the two photos is one of the best pieces of evidence that you are looking at the same person.',
    source: 'Farkas 1994; orbital anatomy stabilizes early (neurocranial growth curve — Scammon).',
  },
  'Right Canthal Tilt': {
    key: 'Right Canthal Tilt',
    label: 'Canthal tilt (R)',
    emoji: '👁️',
    changeClass: 'stable',
    whyStableOrChanges:
      'Same as the left side — bony-orbit driven and highly heritable. People also keep their own left/right asymmetry signature.',
    howToCompare:
      'Compare both not just average: if the adult has one eye tilted slightly differently, the child should show the same asymmetry.',
    source: 'Farkas 1994.',
  },
  'Left Eye Aspect Ratio': {
    key: 'Left Eye Aspect Ratio',
    label: 'Eye openness (L)',
    emoji: '👁️',
    changeClass: 'stable',
    whyStableOrChanges:
      'Palpebral fissure height-to-width ratio changes very little once childhood passes. Eyes are the only feature that looks "adult-sized" in a toddler.',
    howToCompare:
      'Watch out for expressions and squinting (a kid mid-smile has a very different lid shape). Neutral or similar expressions make this comparison trustworthy.',
    source: 'Eye size grows only ~1-2 mm from age 3 to adulthood (Tyers & Harper).',
  },
  'Right Eye Aspect Ratio': {
    key: 'Right Eye Aspect Ratio',
    label: 'Eye openness (R)',
    emoji: '👁️',
    changeClass: 'stable',
    whyStableOrChanges: 'Mirror of the left eye — lid anatomy is genetically fixed early.',
    howToCompare: 'Use together with the left side; consistent L/R values on both people strengthen the match.',
    source: 'Tyers & Harper eye-growth data.',
  },
  'Inter-ocular / Face Width': {
    key: 'Inter-ocular / Face Width',
    label: 'Eye spacing vs face width',
    emoji: '↔️',
    changeClass: 'moderate',
    whyStableOrChanges:
      'The absolute distance between the eyes is one of the MOST stable facial measurements in human growth (it grows only a few millimetres from childhood to adulthood). But the face WIDENS around it (cheekbones/bizygomatic breadth keeps growing), so the RATIO slowly decreases.',
    howToCompare:
      'A small decrease in this ratio from the child photo to the adult photo is exactly what growth predicts. Only a LARGE unexplained drop argues against a match.',
    source: 'Single & Baumrind 1976: interocular distance is remarkably stable during growth.',
  },
  'Nose Width / Face Width': {
    key: 'Nose Width / Face Width',
    label: 'Nose breadth',
    emoji: '👃',
    changeClass: 'changing',
    whyStableOrChanges:
      'Alar (nostril-wing) breadth grows steadily through adolescence and even into the twenties because the nose is largely cartilage.',
    howToCompare:
      'Expect the adult nose to look broader relative to the face. Weak identity signal on its own.',
    source: 'Farkas 1994 longitudinal nasal growth data.',
  },
  'Nose Length / Face Height': {
    key: 'Nose Length / Face Height',
    label: 'Nose length',
    emoji: '👃',
    changeClass: 'changing',
    whyStableOrChanges:
      'The nose is famously the feature that "keeps growing". Children have a short, upturned nose with a low bridge; the nasal length increases disproportionately during the pubertal growth spurt.',
    howToCompare:
      'A longer-looking adult nose is EXPECTED and should never count as evidence of a different person. Shape cues (tip rotation, bridge height) matter more than raw numbers here.',
    source: 'Farkas 1994; Behrents nasal growth research.',
  },
  'Mouth Width / Face Width': {
    key: 'Mouth Width / Face Width',
    label: 'Mouth width',
    emoji: '👄',
    changeClass: 'moderate',
    whyStableOrChanges:
      'Mouth width grows roughly with the face, so its ratio to face width is fairly constant — but it is sensitive to expression (smiling widens the mouth a lot).',
    howToCompare:
      'Only compare when both photos have similar expressions. Matching mouth-width ratio despite different ages is a decent supporting signal.',
    source: 'Farkas 1994; expression sensitivity well documented.',
  },
  'Mouth Aspect Ratio (H/W)': {
    key: 'Mouth Aspect Ratio (H/W)',
    label: 'Lip fullness',
    emoji: '👄',
    changeClass: 'changing',
    whyStableOrChanges:
      'Children tend to have relatively fuller, everted lips; the vermilion border thins and flattens from puberty onward. On top of that, this measure swings wildly with expression.',
    howToCompare:
      'Treat as weak evidence in both directions. Thinner-looking adult lips alone must not be used to reject a match.',
    source: 'Perioral soft-tissue growth studies; thinning of vermilion with age.',
  },
  'Face Height / Width': {
    key: 'Face Height / Width',
    label: 'Face lengthening',
    emoji: '▯',
    changeClass: 'changing',
    whyStableOrChanges:
      'THE headline change of human facial growth: the face grows downward. The maxilla and mandible descend, so the lower third elongates while width stabilises earlier. Children have short, round faces; adults have longer faces.',
    howToCompare:
      'This is the classic "baby face vs grown-up face" effect. The tool expects a measurable increase from the child image to the adult image; a value close to the predicted growth delta supports the match.',
    source: 'Enlow 1990 facial growth; Farkas 1994 allometric data.',
  },
  'Jaw Angle': {
    key: 'Jaw Angle',
    label: 'Jaw / chin definition',
    emoji: '⬟',
    changeClass: 'moderate',
    whyStableOrChanges:
      'The mandible has a late pubertal growth spurt. Toddlers have a wide, open gonial angle and almost no chin; adolescents develop a more defined angulated jaw and prominent chin.',
    howToCompare:
      'Expect the adult jaw to look more angular and the chin stronger. The underlying geometry (how far back the jaw corner sits relative to the chin) still carries identity information.',
    source: 'Carlson et al. 1982 mandibular growth; Solow 1980 gonial angle.',
  },
  'Cheek Width / Jaw Width': {
    key: 'Cheek Width / Jaw Width',
    label: 'Baby-fat roundness',
    emoji: '🌕',
    changeClass: 'changing',
    whyStableOrChanges:
      'Infants and young children carry prominent buccal fat pads (Bichat\u2019s fat) that give the round "chubby cheek" look. These pads regress around puberty and the underlying bone structure shows through.',
    howToCompare:
      'A reduction in cheek roundness from child to adult is completely normal. If anything, matching cheek SHAPE placement (where the fullest point sits) is the informative part.',
    source: 'Farkas 1994 subcutaneous tissue changes; buccal fat pad regression literature.',
  },
  'Left Eyebrow Angle': {
    key: 'Left Eyebrow Angle',
    label: 'Brow shape (L)',
    emoji: '🤨',
    changeClass: 'moderate',
    whyStableOrChanges:
      'Brow POSITION above the orbital rim is skeletal and stable, but the visible eyebrow is heavily altered by grooming, makeup, and ptosis with ageing. Brow ridge prominence also increases in males at puberty.',
    howToCompare:
      'Low-confidence signal: useful only when both photos show natural, ungroomed brows. Never let a brow mismatch veto a match.',
    source: 'Farkas 1994; styling sensitivity.',
  },
  'Right Eyebrow Angle': {
    key: 'Right Eyebrow Angle',
    label: 'Brow shape (R)',
    emoji: '🤨',
    changeClass: 'moderate',
    whyStableOrChanges: 'Same reasoning as the left brow — position stable, appearance mutable.',
    howToCompare: 'Down-weight automatically in scoring due to high style-sensitivity.',
    source: 'Farkas 1994.',
  },
  'Philtrum / Face Height': {
    key: 'Philtrum / Face Height',
    label: 'Philtrum (nose-to-lip)',
    emoji: '🔞',
    changeClass: 'moderate',
    whyStableOrChanges:
      'The philtrum (distance from nose base to top lip) lengthens somewhat as the maxilla descends, but its proportion relative to total lower-face height is comparatively stable.',
    howToCompare:
      'A good mid-strength signal: the adult value may drift slightly upward, but a big deviation is unusual for the same person.',
    source: 'Farkas 1994 perioral growth.',
  },
  'Forehead / Face Height': {
    key: 'Forehead / Face Height',
    label: 'Forehead share of face',
    emoji: '🧠',
    changeClass: 'changing',
    whyStableOrChanges:
      'The braincase (and forehead) reaches near-adult size very early, while the lower face keeps growing down. So the FOREHEAD dominates a child\u2019s face and shrinks in RELATIVE share for the adult — plus hairlines recede and fringes/bangs change over time.',
    howToCompare:
      'Expect the child forehead to look proportionally bigger. Hair coverage makes this noisy; treat mostly as an age cue, not an identity cue.',
    source: 'Scammon neural growth curve; Enlow 1990.',
  },
  'Ear Position / Eye-Mouth Axis': {
    key: 'Ear Position / Eye-Mouth Axis',
    label: 'Ear placement',
    emoji: '👂',
    changeClass: 'stable',
    whyStableOrChanges:
      'Ears do keep growing in absolute size for decades, BUT their vertical placement relative to the eye-to-mouth axis stays remarkably constant — the ear-top-to-eye line and ear-bottom-to-nose-line relationships are among the most reliable anthropometric guides at any age.',
    howToCompare:
      'If both photos show ears, check whether the ear spans the same eye→nose band. Consistent placement supports same-person; it is nearly immune to ageing.',
    source: 'Farkas 1994 ear anthropometry; classic eye-ear/nose-ear alignment rules.',
  },
};

export function getTraitInfo(metricName: string): TraitInfo | undefined {
  return TRAIT_KB[metricName];
}

// ─── Study panel content ─────────────────────────────────────────────────────

export interface StudyPoint {
  title: string;
  detail: string;
}

export const THINGS_THAT_STAY_THE_SAME: StudyPoint[] = [
  {
    title: 'Eyes: size, spacing and shape',
    detail:
      'The eyeball and the orbits are built early (braincase-first growth). Inter-ocular distance grows only a few millimetres from childhood to adulthood, and eye width/height ratios barely budge. That is why babies’ eyes look "grown-up" — and why eye geometry is the strongest cross-age identity signal we can measure.',
  },
  {
    title: 'Relative positions of the features (facial thirds)',
    detail:
      'Hairline→brow, brow→nose-base, nose-base→chin divide the face into thirds whose boundaries move only modestly. Where the nose tip sits between the lips and the eyes is largely preserved.',
  },
  {
    title: 'Ear placement on the eye–mouth axis',
    detail:
      'Ear length increases with age, but the ear’s vertical registration (top near the eye line, bottom near the nose base) stays constant throughout life.',
  },
  {
    title: 'Bone-based horizontal ratios',
    detail:
      'Feature widths measured against bizygomatic (cheekbone) width — mouth width, eye spacing — are comparatively conservative even as the head gets bigger overall.',
  },
  {
    title: 'Asymmetry signature',
    detail:
      'Faces are never perfectly symmetric, and each person’s idiosyncratic left/right differences (one brow higher, one eye slightly more tilted) persist from childhood into adulthood.',
  },
];

export const THINGS_THAT_CHANGE: StudyPoint[] = [
  {
    title: 'The face grows DOWNWARD (vertical elongation)',
    detail:
      'Maxillary and mandibular descent add height to the middle and lower face. Round child faces become longer adult faces — the single biggest reason old photos "don’t look like" the same person.',
  },
  {
    title: 'Baby fat disappears',
    detail:
      'Infant buccal fat pads give full, rounded cheeks. They regress around puberty, revealing cheekbone and jaw definition underneath.',
  },
  {
    title: 'The nose keeps growing',
    detail:
      'Mostly cartilage, the nose lengthens and its bridge rises through adolescence (and slightly beyond). Kids’ short, upturned noses become longer and more projected.',
  },
  {
    title: 'The chin arrives',
    detail:
      'Human beings are unique in having a projecting chin, and it forms late — a distinct menton often appears only after the pubertal mandibular spurt. Toddlers effectively have no chin.',
  },
  {
    title: 'Forehead share shrinks (and hair changes)',
    detail:
      'Because the neural part is finished early, the forehead occupies a large fraction of a child’s face and a smaller fraction of an adult’s. Hairlines also mature and hairstyles vary — a major visual-but-non-skeletal change.',
  },
  {
    title: 'Soft tissue and surface texture',
    detail:
      'Lips thin, skin texture and pigmentation change, facial hair appears, brow grooming and makeup differ. None of these are skeletal identity cues, so they are down-weighted.',
  },
];

export const HOW_WE_ANALYZE: StudyPoint[] = [
  {
    title: '1. Pose-normalize before measuring',
    detail:
      'Head roll, yaw and pitch are estimated from landmarks and mathematically removed. A tilted child photo and a straight adult photo then measure comparable angles. Head tilt itself is never scored — it is pose, not identity.',
  },
  {
    title: '2. Measure ratios, not pixels',
    detail:
      'Every metric is a dimensionless ratio or angle, so photo resolution, camera distance and absolute head size are irrelevant. This is essential because a child’s head really is smaller.',
  },
  {
    title: '3. Subtract expected growth',
    detail:
      'For each trait we know the direction and rough magnitude of development (e.g. face height/width +0.012/year, cheek/jaw ratio −0.006/year). With age normalization on, the expected developmental delta is subtracted first, and only the RESIDUAL counts as evidence.',
  },
  {
    title: '4. Weight by identity value × stability',
    detail:
      'Canthal tilt and eye geometry dominate the verdict; nose length, lips and forehead contribute little; eyebrows are penalised for styling sensitivity. Occluded or poor-quality regions are excluded rather than averaged in.',
  },
  {
    title: '5. Report uncertainty honestly',
    detail:
      'Monte-Carlo landmark jitter (σ≈2 px, 100 samples) gives every number a 95% confidence interval, and multiple photos per person are inverse-variance combined. Big age gaps widen the intervals — the tool says so instead of pretending certainty.',
  },
];
