// What goes on a pupil's rapport: one line per class they are in this school
// year, each with its score worked out by lib/grading. Used both to generate a
// card and to recalculate a draft, so the two can never disagree.
//
// A card's scores are a snapshot. Before recalculation existed, a card made in
// September (De Kroon had two) kept its empty scores for good, and "genereer
// voor alle leerlingen zonder rapport" skipped it in January.

import { getSupabase } from '@/lib/supabase/singleton'
import { computeResult } from '@/lib/grading'

// A pupil who simply has nothing to report on (no classes this year). Not an error.
export class SkipError extends Error {}

export interface RapportLineDraft {
  class_id: string
  subject_snapshot: string
  result: number | null
}

export async function computeRapportLines(
  studentId: string, yearId: string, semester: 1 | 2,
): Promise<{ level: string; lines: RapportLineDraft[] }> {
  const supabase = getSupabase()

  // Every read must succeed. A failed read used to come back as "no rows", so
  // the card was saved with that subject's score missing and nobody was told.
  const must = <T,>(r: { data: T | null; error: any }, what: string): T => {
    if (r.error) throw new Error(`${what} laden mislukt: ${r.error.message}`)
    return (r.data ?? []) as T
  }
  const none = { data: [] as any[], error: null }

  const cs = must<any[]>(await supabase.from('class_students').select('class_id').eq('student_id', studentId), 'klassen')
  const enrolled = cs.map((r: any) => r.class_id)
  if (!enrolled.length) throw new SkipError('zit in geen enkele klas')

  const classes = must<any[]>(await supabase.from('classes')
    .select('id, name, group_id').in('id', enrolled).eq('school_year_id', yearId).eq('is_archived', false), 'klassen')
  if (!classes.length) throw new SkipError('heeft geen klassen dit schooljaar')
  const classIds = classes.map((c: any) => c.id)

  // Every group the pupil has a class in, e.g. "Groep 1 / Groep 2". Picking one
  // was a guess (the app records no "main" group) and printed a wrong level for
  // a pupil who takes a subject in another group.
  let level = ''
  const groupIds = Array.from(new Set(classes.map((c: any) => c.group_id).filter(Boolean)))
  if (groupIds.length) {
    const g = must<any[]>(await supabase.from('groups').select('id, name').in('id', groupIds as string[]), 'groep')
    level = g.map((x: any) => String(x.name ?? '')).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'nl', { numeric: true })).join(' / ')
  }

  const assignList = must<any[]>(await supabase.from('assignments')
    .select('id, class_id, max_score').in('class_id', classIds).eq('is_published', true), 'huiswerk')
  const subList = must<any[]>(assignList.length
    ? await supabase.from('submissions').select('id, assignment_id').eq('student_id', studentId).in('assignment_id', assignList.map((a: any) => a.id))
    : none, 'inzendingen')
  const fbList = must<any[]>(subList.length
    ? await supabase.from('submission_feedback').select('submission_id, score').in('submission_id', subList.map((s: any) => s.id))
    : none, 'huiswerkpunten')
  const testList = must<any[]>(await supabase.from('class_tests').select('id, class_id, max_score').in('class_id', classIds), 'toetsen')
  const tsList = must<any[]>(testList.length
    ? await supabase.from('test_scores').select('test_id, score').eq('student_id', studentId).in('test_id', testList.map((t: any) => t.id))
    : none, 'toetspunten')

  // Weighting, if this class has one. A class without categories keeps the
  // old pooled average -- see lib/grading.ts.
  const catList = must<any[]>(await supabase.from('grade_categories')
    .select('id, class_id, name, source, weight, sort_order').in('class_id', classIds).order('sort_order'), 'puntenverdeling')
  const csList = must<any[]>(catList.length
    ? await supabase.from('category_scores').select('category_id, score, max_score')
        .eq('student_id', studentId).in('category_id', catList.map((c: any) => c.id))
    : none, 'punten per onderdeel')
  // Exams were never part of the old average; a weighted class can now count them.
  const examList = must<any[]>(await supabase.from('exam_scores')
    .select('class_id, score, max_score')
    .eq('student_id', studentId).eq('semester', semester).in('class_id', classIds), 'examens')

  function avgForClass(cid: string): number | null {
    let hwEarned = 0, hwMax = 0
    for (const a of assignList.filter((x: any) => x.class_id === cid)) {
      const sub = subList.find((s: any) => s.assignment_id === a.id)
      if (!sub || !a.max_score) continue
      const fb = fbList.find((f: any) => f.submission_id === sub.id)
      if (!fb || fb.score === null || fb.score === undefined) continue
      hwEarned += Number(fb.score); hwMax += Number(a.max_score)
    }
    let tEarned = 0, tMax = 0
    for (const t of testList.filter((x: any) => x.class_id === cid)) {
      const ts = tsList.find((x: any) => x.test_id === t.id)
      if (!ts || !t.max_score) continue
      tEarned += Number(ts.score); tMax += Number(t.max_score)
    }
    const ex = examList.find((e: any) => e.class_id === cid)
    const mine = catList.filter((c: any) => c.class_id === cid)

    return computeResult(mine, {
      huiswerk: hwMax > 0 ? { earned: hwEarned, max: hwMax } : null,
      toetsen:  tMax  > 0 ? { earned: tEarned,  max: tMax  } : null,
      examen:   ex ? { earned: Number(ex.score), max: Number(ex.max_score) } : null,
      handmatig: Object.fromEntries(mine.map((c: any) => {
        const cs = csList.find((x: any) => x.category_id === c.id)
        return [c.id, cs ? { earned: Number(cs.score), max: Number(cs.max_score) } : null]
      })),
    }).result
  }

  return {
    level,
    lines: classes.map((c: any) => ({ class_id: c.id, subject_snapshot: c.name, result: avgForClass(c.id) })),
  }
}

/**
 * Bring a DRAFT card up to date with the gradebook: every score is worked out
 * again, a class the pupil joined since gets a line, and a class they left loses
 * its line unless a teacher already wrote a comment on it. Comments are never
 * touched. A score typed in by hand IS overwritten -- callers must say so.
 */
export async function recalculateCard(
  card: { id: string; student_id: string; school_year_id: string; semester: 1 | 2; status: string },
): Promise<{ updated: number; added: number; removed: number }> {
  // RLS lets an admin edit lines on a published card too; a family may already
  // have read it, so never change one behind their back.
  if (card.status !== 'draft') throw new Error('dit rapport is al gepubliceerd')
  const supabase = getSupabase()
  const { level, lines } = await computeRapportLines(card.student_id, card.school_year_id, card.semester)

  const { data: existing, error: exErr } = await supabase.from('rapport_lines')
    .select('id, class_id, comment').eq('rapport_card_id', card.id)
  if (exErr) throw new Error(`vakken laden mislukt: ${exErr.message}`)

  const have = new Map((existing ?? []).map((l: any) => [l.class_id, l]))
  const want = new Set(lines.map(l => l.class_id))
  let updated = 0, added = 0, removed = 0

  for (const l of lines) {
    const old = have.get(l.class_id)
    if (old) {
      const { error } = await supabase.from('rapport_lines')
        .update({ result: l.result, subject_snapshot: l.subject_snapshot }).eq('id', old.id)
      if (error) throw new Error(`score bijwerken mislukt: ${error.message}`)
      updated++
    } else {
      const { error } = await supabase.from('rapport_lines')
        .insert({ ...l, rapport_card_id: card.id, comment: '' })
      if (error) throw new Error(`vak toevoegen mislukt: ${error.message}`)
      added++
    }
  }
  for (const old of existing ?? []) {
    if (want.has(old.class_id) || (old.comment ?? '').trim()) continue
    const { error } = await supabase.from('rapport_lines').delete().eq('id', old.id)
    if (error) throw new Error(`vak verwijderen mislukt: ${error.message}`)
    removed++
  }

  const { error: cErr } = await supabase.from('rapport_cards').update({ level_snapshot: level }).eq('id', card.id)
  if (cErr) throw new Error(`niveau bijwerken mislukt: ${cErr.message}`)
  return { updated, added, removed }
}

// ---- which parts of a weighted score are still missing ---------------------

/** `missing`: names of the puntenverdeling parts without data; `hasScore`: the line has a result. */
export interface MissingParts { missing: string[]; hasScore: boolean }

const CHUNK = 200     // ids per .in(): a few hundred still fits a URL, more may not
const PAGE = 1000     // PostgREST returns at most this many rows per request

async function readAll<T>(
  ids: string[],
  q: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await q(chunk, from, from + PAGE - 1)
      if (error) throw new Error(error.message)
      out.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
  }
  return out
}

/**
 * For each card and subject: the parts of the class's puntenverdeling that have
 * no data yet for this pupil (e.g. ["Examen"]). A weighted score with a missing
 * part is worked out from the parts that ARE there (lib/grading computeWeighted),
 * so it looks final while it isn't. Classes without a puntenverdeling are left
 * out: their score is the plain average and has no parts.
 *
 * Mirrors computeRapportLines: homework counts once a published assignment with
 * a maximum has a score, a test once a test with a maximum has a score, the exam
 * per semester, a handmatig part once the teacher filled it in.
 *
 * `onlyClasses`: restrict to these classes (a teacher may only read the scores of
 * classes they teach; anything else would show as "missing").
 */
export async function findMissingParts(
  cards: { id: string; student_id: string; semester: 1 | 2 }[],
  onlyClasses?: Set<string>,
): Promise<Map<string, Map<string, MissingParts>>> {
  const supabase = getSupabase()
  const result = new Map<string, Map<string, MissingParts>>()
  if (!cards.length) return result

  const lines = await readAll<any>(cards.map(c => c.id), (ids, from, to) =>
    supabase.from('rapport_lines').select('id, rapport_card_id, class_id, result').in('rapport_card_id', ids).order('id').range(from, to))
  const relevant = lines.filter(l => !onlyClasses || onlyClasses.has(l.class_id))
  const classIds = Array.from(new Set(relevant.map(l => l.class_id as string)))
  if (!classIds.length) return result

  const cats = (await readAll<any>(classIds, (ids, from, to) =>
    supabase.from('grade_categories').select('id, class_id, name, source, weight').in('class_id', ids).order('id').range(from, to)))
    .filter(c => Number(c.weight) > 0)
  if (!cats.length) return result
  const weighted = Array.from(new Set(cats.map(c => c.class_id as string)))
  const bySource = (s: string) => Array.from(new Set(cats.filter(c => c.source === s).map(c => c.class_id as string)))

  const have = new Set<string>()   // "source|student|class" or "handmatig|student|category"

  const hwClasses = bySource('huiswerk')
  if (hwClasses.length) {
    const asg = (await readAll<any>(hwClasses, (ids, from, to) =>
      supabase.from('assignments').select('id, class_id, max_score').in('class_id', ids).eq('is_published', true).order('id').range(from, to)))
      .filter(a => a.max_score)
    const asgClass = new Map(asg.map(a => [a.id, a.class_id]))
    const subs = await readAll<any>(asg.map(a => a.id), (ids, from, to) =>
      supabase.from('submissions').select('id, assignment_id, student_id').in('assignment_id', ids).order('id').range(from, to))
    const subById = new Map(subs.map(s => [s.id, s]))
    const fb = await readAll<any>(subs.map(s => s.id), (ids, from, to) =>
      supabase.from('submission_feedback').select('submission_id, score').in('submission_id', ids).order('id').range(from, to))
    for (const f of fb) {
      if (f.score === null || f.score === undefined) continue
      const s = subById.get(f.submission_id)
      if (s) have.add(`huiswerk|${s.student_id}|${asgClass.get(s.assignment_id)}`)
    }
  }

  const testClasses = bySource('toetsen')
  if (testClasses.length) {
    const tests = (await readAll<any>(testClasses, (ids, from, to) =>
      supabase.from('class_tests').select('id, class_id, max_score').in('class_id', ids).order('id').range(from, to)))
      .filter(t => t.max_score)
    const testClass = new Map(tests.map(t => [t.id, t.class_id]))
    const ts = await readAll<any>(tests.map(t => t.id), (ids, from, to) =>
      supabase.from('test_scores').select('test_id, student_id').in('test_id', ids).order('id').range(from, to))
    for (const t of ts) have.add(`toetsen|${t.student_id}|${testClass.get(t.test_id)}`)
  }

  const examClasses = bySource('examen')
  if (examClasses.length) {
    const ex = await readAll<any>(examClasses, (ids, from, to) =>
      supabase.from('exam_scores').select('class_id, student_id, semester').in('class_id', ids).order('id').range(from, to))
    for (const e of ex) have.add(`examen|${e.student_id}|${e.class_id}|${e.semester}`)
  }

  const manual = cats.filter(c => c.source === 'handmatig')
  if (manual.length) {
    const cs = await readAll<any>(manual.map(c => c.id), (ids, from, to) =>
      supabase.from('category_scores').select('category_id, student_id').in('category_id', ids).order('id').range(from, to))
    for (const x of cs) have.add(`handmatig|${x.student_id}|${x.category_id}`)
  }

  const cardById = new Map(cards.map(c => [c.id, c]))
  for (const l of relevant) {
    if (!weighted.includes(l.class_id)) continue
    const card = cardById.get(l.rapport_card_id)
    if (!card) continue
    const missing = cats.filter(c => c.class_id === l.class_id).filter(c =>
      c.source === 'handmatig' ? !have.has(`handmatig|${card.student_id}|${c.id}`)
      : c.source === 'examen'  ? !have.has(`examen|${card.student_id}|${c.class_id}|${card.semester}`)
      : !have.has(`${c.source}|${card.student_id}|${c.class_id}`),
    ).map(c => String(c.name))
    if (!missing.length) continue
    if (!result.has(card.id)) result.set(card.id, new Map())
    result.get(card.id)!.set(l.class_id, { missing, hasScore: l.result !== null && l.result !== undefined })
  }
  return result
}

/** Cards that will print a score worked out without one of its parts. */
export function countIncompleteCards(found: Map<string, Map<string, MissingParts>>): number {
  let n = 0
  for (const perClass of Array.from(found.values())) if (Array.from(perClass.values()).some(p => p.hasScore)) n++
  return n
}
