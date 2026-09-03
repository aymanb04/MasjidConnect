import type { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// GDPR erasure — one implementation, both routes
// ============================================================
// Art. 17 erasure has to reach every place a person's data landed, not just the
// profiles row. Until 2026-09-02 it did not: /api/user/delete removed the auth
// user and leaned on FK cascade, which drops DB rows but leaves every uploaded
// file sitting in its bucket — including student_documents of type 'disability'
// (Art. 9 health data). Worse, the row pointing at the file cascaded away with
// it, so the orphan was no longer discoverable. /api/user/anonymize cleaned
// submission files only, and left the whole dossier — date of birth, address,
// parent contacts, notes, documents — intact under the same UUID.
//
// This module is the single erasure path. Both routes call it, so they cannot
// drift apart again.
//
// DELIBERATELY NOT ERASED — payments and fee_payments. Accounting records carry
// a statutory retention duty (Belgian bookkeeping law, 7 years), which
// Art. 17(3)(b) carves out of the right to erasure. They key on a UUID whose
// profile is scrubbed, so they hold no readable identity afterwards.

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

  // ── Dossier documents (may be Art. 9 health data) ──────────────────────────
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
  for (const [table, column] of [
    ['student_notes', 'student_id'],
    ['student_details', 'student_id'],
    ['feedback', 'user_id'],
  ] as const) {
    const { error, count } = await admin
      .from(table).delete({ count: 'exact' }).eq(column, userId)
    if (error) report.errors.push(`${table} delete: ${error.message}`)
    else countRows(table, count ?? 0)
  }

  // ── Free text about this person, on rows kept for statistics ───────────────
  for (const [table, column] of [
    ['attendance_records', 'note'],
    ['exam_scores', 'notes'],
    ['oudercontact_bookings', 'note'],
  ] as const) {
    const { error } = await admin.from(table).update({ [column]: null }).eq('student_id', userId)
    if (error) report.errors.push(`${table} scrub: ${error.message}`)
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
