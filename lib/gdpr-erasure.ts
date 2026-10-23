import type { SupabaseClient } from '@supabase/supabase-js'
import { OWNED_TABLES, SCRUBBED_TABLES } from './personal-data-map'

// ============================================================
// GDPR erasure — one implementation, both routes
// ============================================================
// Art. 17 erasure has to reach every place a person's data landed, not just the
// profiles row. Until 2026-09-02 it did not: /api/user/delete removed the auth
// user and leaned on FK cascade, which drops DB rows but leaves every uploaded
// file sitting in its bucket. (At the time that included documents of type
// 'disability' — Art. 9 health data; that document type was removed in migration
// 29, but the erasure gap was real while it existed.) Worse, the row pointing at
// the file cascaded away with it, so the orphan was no longer discoverable.
// /api/user/anonymize cleaned submission files only, and left the whole dossier —
// date of birth, address, parent contacts, notes, documents — intact under the
// same UUID.
//
// This module is the single erasure path. Both routes call it, so they cannot
// drift apart again.
//
// DELIBERATELY NOT ERASED — fee_payments and payroll_entries. Accounting records
// carry a statutory retention duty (Belgian bookkeeping law, 7 years), which
// Art. 17(3)(b) carves out of the right to erasure. They key on a UUID whose
// profile is scrubbed, so they hold no readable identity afterwards.
//
// KEPT, WITHOUT A NAME — scores, attendance, rapport cards, submissions: the
// school's statistics. Their free-text columns are cleared (see SCRUBBED_TABLES
// and the rapport comments below).
//
// NOT REACHED — free text that names the pupil somewhere else: a session note
// ("A. was ziek"), an announcement, a note on another pupil's row. Nothing ties
// that text to the person's id, so it cannot be found reliably. Say so to a
// school that asks for an erasure.
//
// A HARD DELETE IS RARE. attendance_records.student_id and
// submissions.student_id have no ON DELETE rule (live, 2026-10-23), so the auth
// user of anyone with a single attendance record or submission cannot be
// deleted. That is why closeAccount() runs first in both routes: the person is
// anonymised whether or not the delete afterwards succeeds.

/**
 * Close the account and scrub the profile: ban + new e-mail, then overwrite
 * the name, e-mail and phone. The UUID stays, so the rows kept
 * for statistics stay valid.
 *
 * The ban comes FIRST so the person can never sign in between the scrub and
 * the account closure. Returns an error message, or null on success.
 */
export async function closeAccount(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    email:        `anon-${userId}@deleted.invalid`,
    ban_duration: '876000h',
  })
  if (authErr) return `auth ban: ${authErr.message}`

  // There is no admin "log this user out" endpoint: the call that used to sit
  // here (/auth/v1/admin/users/<id>/logout) got a 404 every time (checked
  // 2026-10-23). The ban is what works: a session can no longer be refreshed
  // ("User Banned"). An access token already issued stays valid until it
  // expires (max 1 hour), but the app ends any session whose profile is
  // inactive (useProfile) and the API routes refuse it (requireRole).

  // is_anonymized marks the row as erased, so reactivation is blocked (a
  // first name of 'Verwijderd' is not a safe sentinel: it could be real).
  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      first_name:    'Verwijderd',
      last_name:     '',
      email:         `anon-${userId}@deleted.invalid`,
      phone:         null,
      is_active:     false,
      is_anonymized: true,
    })
    .eq('id', userId)
  if (profileErr) return `profile scrub: ${profileErr.message}`
  return null
}

export interface ErasureReport {
  /** bucket → number of objects removed */
  storage: Record<string, number>
  /** table → number of rows deleted */
  rows: Record<string, number>
  /** Non-fatal problems. A non-empty list means the erasure is INCOMPLETE. */
  errors: string[]
}

/** Storage paths are stored as plain paths now; legacy rows kept a full public URL. */
function toStoragePath(bucket: string, fileUrl: string): string {
  const marker = `/object/public/${bucket}/`
  const idx = fileUrl.indexOf(marker)
  return idx !== -1 ? fileUrl.slice(idx + marker.length) : fileUrl
}

async function removeObjects(
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
  report: ErasureReport,
): Promise<void> {
  if (!paths.length) return
  const { error } = await admin.storage.from(bucket).remove(paths)
  if (error) {
    report.errors.push(`storage/${bucket}: ${error.message}`)
    return
  }
  report.storage[bucket] = (report.storage[bucket] ?? 0) + paths.length
}

/**
 * Erase everything belonging to one person, in every table and bucket.
 *
 * Safe to call before an auth-user delete (it removes rows the cascade would
 * have taken anyway) and on its own for an anonymisation. Never throws:
 * problems land in `report.errors` so the caller can tell the operator the
 * erasure is partial instead of silently reporting success.
 *
 * @param opts.email the profile's e-mail BEFORE scrubbing — pending invitations
 *                   key on the address, not the user id, so they outlive it.
 */
export async function eraseUserData(
  admin: SupabaseClient,
  userId: string,
  opts: { tenantId?: string | null; email?: string | null } = {},
): Promise<ErasureReport> {
  const report: ErasureReport = { storage: {}, rows: {}, errors: [] }

  const countRows = (table: string, n: number) => {
    if (n > 0) report.rows[table] = (report.rows[table] ?? 0) + n
  }

  // ── Dossier documents ──────────────────────────────────────────────────────
  const { data: docs, error: docsErr } = await admin
    .from('student_documents')
    .select('id, file_url')
    .eq('student_id', userId)
  if (docsErr) report.errors.push(`student_documents read: ${docsErr.message}`)

  if (docs?.length) {
    await removeObjects(admin, 'student-documents',
      docs.map(d => toStoragePath('student-documents', d.file_url)), report)
    const { error } = await admin.from('student_documents').delete().eq('student_id', userId)
    if (error) report.errors.push(`student_documents delete: ${error.message}`)
    else countRows('student_documents', docs.length)
  }

  // ── Rapport PDFs (carry the pupil's name inside the document itself) ───────
  const { data: reports, error: repErr } = await admin
    .from('student_reports')
    .select('id, file_url')
    .eq('student_id', userId)
  if (repErr) report.errors.push(`student_reports read: ${repErr.message}`)

  if (reports?.length) {
    await removeObjects(admin, 'student-reports',
      reports.map(r => toStoragePath('student-reports', r.file_url)), report)
    const { error } = await admin.from('student_reports').delete().eq('student_id', userId)
    if (error) report.errors.push(`student_reports delete: ${error.message}`)
    else countRows('student_reports', reports.length)
  }

  // ── Submissions: files, text, and the teacher's feedback on them ───────────
  const { data: submissions } = await admin
    .from('submissions')
    .select('id')
    .eq('student_id', userId)
  const submissionIds = submissions?.map(s => s.id) ?? []

  if (submissionIds.length) {
    const { data: files } = await admin
      .from('submission_files')
      .select('id, file_url')
      .in('submission_id', submissionIds)

    if (files?.length) {
      await removeObjects(admin, 'submission-files',
        files.map(f => toStoragePath('submission-files', f.file_url)), report)
      const { error } = await admin
        .from('submission_files').delete().in('id', files.map(f => f.id))
      if (error) report.errors.push(`submission_files delete: ${error.message}`)
      else countRows('submission_files', files.length)
    }

    const { error: fbErr } = await admin
      .from('submission_feedback')
      .update({ comment: null })
      .in('submission_id', submissionIds)
    if (fbErr) report.errors.push(`submission_feedback scrub: ${fbErr.message}`)

    const { error: subErr } = await admin
      .from('submissions')
      .update({ text_content: null })
      .eq('student_id', userId)
    if (subErr) report.errors.push(`submissions scrub: ${subErr.message}`)
  }

  // ── Orphan sweep ───────────────────────────────────────────────────────────
  // Catches files whose DB row was cascaded away by an earlier hard delete, and
  // uploads whose row insert failed. Path convention is
  // `<tenant_id>/<student_id>/<timestamp>_<name>` (see the dossiers page).
  if (opts.tenantId) {
    const prefix = `${opts.tenantId}/${userId}`
    for (const bucket of ['student-documents', 'student-reports'] as const) {
      const { data: leftovers, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
      if (error) { report.errors.push(`storage/${bucket} list: ${error.message}`); continue }
      if (leftovers?.length) {
        await removeObjects(admin, bucket, leftovers.map(o => `${prefix}/${o.name}`), report)
      }
    }
  }

  // ── Rows that are entirely about this person ───────────────────────────────
  // The table list lives in personal-data-map.ts, shared with the export route:
  // what we can erase must be exactly what we can export (Art. 15/17/20 read the
  // same footprint).
  for (const { table, key } of OWNED_TABLES) {
    const { error, count } = await admin
      .from(table).delete({ count: 'exact' }).eq(key, userId)
    if (error) report.errors.push(`${table} delete: ${error.message}`)
    else countRows(table, count ?? 0)
  }

  // ── Free text about this person, on rows kept for statistics ───────────────
  for (const { table, key, column } of SCRUBBED_TABLES) {
    const { error } = await admin.from(table).update({ [column]: null }).eq(key, userId)
    if (error) report.errors.push(`${table} scrub: ${error.message}`)
  }

  // ── The teacher's rapport comments about this pupil ────────────────────────
  // The cards and results stay (statistics); the comment is free text about the
  // pupil. Lines key on the card, not on the pupil, so they need their own step.
  const { data: cards, error: cardsErr } = await admin
    .from('rapport_cards').select('id').eq('student_id', userId)
  if (cardsErr) report.errors.push(`rapport_cards read: ${cardsErr.message}`)
  if (cards?.length) {
    const { error } = await admin
      .from('rapport_lines').update({ comment: null }).in('rapport_card_id', cards.map(c => c.id))
    if (error) report.errors.push(`rapport_lines scrub: ${error.message}`)
  }

  // ── Pending invitations key on the e-mail address, not the user id ─────────
  if (opts.email && !opts.email.endsWith('@deleted.invalid')) {
    const { error, count } = await admin
      .from('invitations').delete({ count: 'exact' }).eq('email', opts.email)
    if (error) report.errors.push(`invitations delete: ${error.message}`)
    else countRows('invitations', count ?? 0)
  }

  return report
}
