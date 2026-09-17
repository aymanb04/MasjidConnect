// Weighted grading. One implementation, used by the rapport generator, the
// Puntenlijst preview and the pupil's own score view, so the three can never
// quietly disagree about what a pupil's mark is.
//
// Background: De Kroon grades Qur'an as huiswerk 25% / progressie 40% /
// examen 30% / tajweed 5%. Before this, the rapport pooled homework and tests
// into one Sum(earned)/Sum(max) average and left exams out entirely.

export type GradeSource = 'huiswerk' | 'toetsen' | 'examen' | 'handmatig'

export interface GradeCategory {
  id: string
  name: string
  source: GradeSource
  weight: number
  sort_order?: number
}

/** A tally of points. `max` of 0 means "nothing marked yet", not "scored 0". */
export interface Points { earned: number; max: number }

export interface GradeInputs {
  huiswerk?: Points | null
  toetsen?: Points | null
  examen?: Points | null
  /** Keyed by category id, for `handmatig` categories. */
  handmatig?: Record<string, Points | null>
}

export interface GradePart {
  id: string
  name: string
  weight: number
  /** 0-100, or null when nothing has been marked in this category yet. */
  pct: number | null
  /** False when pct is null: the category is skipped and its weight redistributed. */
  counted: boolean
}

export interface GradeResult {
  /** 0-100, or null when nothing at all has been marked. */
  result: number | null
  parts: GradePart[]
  /** Total weight of the categories that actually counted. */
  countedWeight: number
  /** True when some category was skipped, so the result is renormalised. */
  partial: boolean
}

const pct = (p?: Points | null): number | null =>
  p && p.max > 0 ? (p.earned / p.max) * 100 : null

function inputFor(cat: GradeCategory, inputs: GradeInputs): Points | null {
  switch (cat.source) {
    case 'huiswerk':  return inputs.huiswerk ?? null
    case 'toetsen':   return inputs.toetsen ?? null
    case 'examen':    return inputs.examen ?? null
    case 'handmatig': return inputs.handmatig?.[cat.id] ?? null
  }
}

/**
 * Weighted mark for one class.
 *
 * Categories with nothing marked yet are SKIPPED and the remaining weights are
 * renormalised, rather than counted as zero. Progressie is judged at the end of
 * the year: a pupil must not read 40 points short in December because their
 * teacher has not filled it in yet. `partial` says whether that happened, so
 * the UI can show "voorlopig" instead of presenting it as final.
 */
export function computeWeighted(
  categories: GradeCategory[],
  inputs: GradeInputs,
): GradeResult {
  const parts: GradePart[] = categories.map(cat => {
    const p = pct(inputFor(cat, inputs))
    return {
      id: cat.id, name: cat.name, weight: cat.weight,
      pct: p === null ? null : Math.round(p * 10) / 10,
      counted: p !== null && cat.weight > 0,
    }
  })

  let weighted = 0
  let countedWeight = 0
  for (const part of parts) {
    if (!part.counted || part.pct === null) continue
    weighted += part.pct * part.weight
    countedWeight += part.weight
  }

  const declared = categories.reduce((a, c) => a + c.weight, 0)
  return {
    result: countedWeight > 0 ? Math.round((weighted / countedWeight) * 10) / 10 : null,
    parts,
    countedWeight,
    partial: countedWeight > 0 && Math.abs(countedWeight - declared) > 0.01,
  }
}

/**
 * What the app did before categories existed: one pooled average over homework
 * and tests, exams excluded. Still the behaviour for any class that has not
 * configured a weighting, which on the day this shipped was all of them.
 */
export function computePooled(inputs: GradeInputs): number | null {
  const earned = (inputs.huiswerk?.earned ?? 0) + (inputs.toetsen?.earned ?? 0)
  const max    = (inputs.huiswerk?.max ?? 0)    + (inputs.toetsen?.max ?? 0)
  if (max <= 0) return null
  return Math.round((earned / max) * 1000) / 10
}

/** Weighted when the class has categories, pooled when it does not. */
export function computeResult(
  categories: GradeCategory[] | null | undefined,
  inputs: GradeInputs,
): GradeResult {
  if (categories && categories.length > 0) return computeWeighted(categories, inputs)
  return { result: computePooled(inputs), parts: [], countedWeight: 0, partial: false }
}

// ---- helpers for the configuration screen ---------------------------------

export const SOURCE_LABELS: Record<GradeSource, string> = {
  huiswerk:  'Automatisch uit huiswerkpunten',
  toetsen:   'Automatisch uit toetsen',
  examen:    'Automatisch uit het examencijfer',
  handmatig: 'Leerkracht vult zelf een cijfer in',
}

export const SOURCE_SHORT: Record<GradeSource, string> = {
  huiswerk: 'Huiswerk', toetsen: 'Toetsen', examen: 'Examen', handmatig: 'Handmatig',
}

export const totalWeight = (cats: { weight: number }[]) =>
  Math.round(cats.reduce((a, c) => a + (Number(c.weight) || 0), 0) * 10) / 10

/** A source may appear at most once; handmatig may repeat. */
export function duplicateAutoSource(cats: GradeCategory[]): GradeSource | null {
  const seen = new Set<string>()
  for (const c of cats) {
    if (c.source === 'handmatig') continue
    if (seen.has(c.source)) return c.source
    seen.add(c.source)
  }
  return null
}

/** What De Kroon asked for, offered as a starting point in the UI. */
export const PRESETS: { label: string; hint: string; rows: Omit<GradeCategory, 'id'>[] }[] = [
  {
    label: 'Huiswerk en toetsen',
    hint: 'Eenvoudig: alles telt even zwaar mee.',
    rows: [
      { name: 'Huiswerk', source: 'huiswerk', weight: 50, sort_order: 0 },
      { name: 'Toetsen',  source: 'toetsen',  weight: 50, sort_order: 1 },
    ],
  },
  {
    label: 'Met examen',
    hint: 'Huiswerk en toetsen tijdens het jaar, examen op het einde.',
    rows: [
      { name: 'Huiswerk', source: 'huiswerk', weight: 40, sort_order: 0 },
      { name: 'Toetsen',  source: 'toetsen',  weight: 30, sort_order: 1 },
      { name: 'Examen',   source: 'examen',   weight: 30, sort_order: 2 },
    ],
  },
  {
    label: 'Qur’an (voorbeeld De Kroon)',
    hint: 'Met progressie en tajweed als eigen beoordeling.',
    rows: [
      { name: 'Huiswerk',   source: 'huiswerk',  weight: 25, sort_order: 0 },
      { name: 'Progressie', source: 'handmatig', weight: 40, sort_order: 1 },
      { name: 'Examen',     source: 'examen',    weight: 30, sort_order: 2 },
      { name: 'Tajweed',    source: 'handmatig', weight: 5,  sort_order: 3 },
    ],
  },
]
