// The order classes are shown in, everywhere.
//
// There is no explicit order column on groups or classes, and there does not
// need to be: `created_at` already carries the order the admin entered them in.
// For De Kroon that is exactly the order the school reads its groups in
// (Tamhiedi, Niveau 1-4, Jongens, Meisjes), and within a group the subjects
// come out Arabisch, Islam, Qur'an -- both because that is how
// rebuild-structuur.mjs created them.
//
// The old behaviour was `.order('name')`, which sorts on the CLASS name
// (Arabisch / Islam / Qur'an) and ignores the group completely, so all seven
// groups interleave: "Arabisch, Arabisch, Arabisch, ..., Islam, Islam, ...".
// De Kroon reported it as "de klassen staan wat dooreen" (2026-09-16).
//
// Deliberately NOT hardcoding subject names: tenant #2 will not call them
// Arabisch or Qur'an, and a hardcoded list would silently push their subjects
// to the end.
//
// The limitation, accepted for now: a group added later always sorts last and
// cannot be moved up. The day a school asks to reorder, that is when a
// sort_order column earns its place -- together with a way for them to set it
// themselves, so it does not become an operator task.

export interface ClassForOrdering {
  name?: string | null
  created_at?: string | null
  group_name?: string | null
  group_created_at?: string | null
}

const t = (v?: string | null) => (v ? Date.parse(v) : Number.MAX_SAFE_INTEGER)

/** Groups in creation order; subjects inside a group alphabetically. */
export function compareClasses(a: ClassForOrdering, b: ClassForOrdering): number {
  const g = t(a.group_created_at) - t(b.group_created_at)
  if (g !== 0) return g
  // Same group, or both without one: fall back to the group name so classes
  // without a group do not scatter.
  const gn = (a.group_name ?? '').localeCompare(b.group_name ?? '', 'nl')
  if (gn !== 0) return gn
  // Within a group, alphabetical -- NOT creation order. De Kroon's Islam
  // classes were added on 15/09 while Arabisch and Qur'an date from August, so
  // creation order buried Islam at the bottom of every group. The school reads
  // them Arabisch, Islam, Qur'an. Alphabetical gives exactly that, and stays
  // predictable for a tenant whose subjects we have never seen.
  const n = (a.name ?? '').localeCompare(b.name ?? '', 'nl')
  if (n !== 0) return n
  return t(a.created_at) - t(b.created_at)
}

export function sortClasses<T extends ClassForOrdering>(rows: T[]): T[] {
  return [...rows].sort(compareClasses)
}
