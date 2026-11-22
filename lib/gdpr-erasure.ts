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
    email:         `anon-${userId}@deleted.invalid`,
    // Without this an admin e-mail change can stay pending instead of applying.
    email_confirm: true,
    ban_duration:  '876000h',
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

/**
 * Remove the person from Supabase Auth, the last step of an erasure.
 *
 * Why this exists (review 2026-11-21, finding #2): closeAccount() scrubs the
 * profile, but the login record kept the name. Invite and bulk-onboard put
 * first_name/last_name in auth.users.raw_user_meta_data, and the identity kept
 * the original login address in identity_data. A hard delete would remove all
 * of it, but it almost never succeeds: deleting the auth user cascades into
 * profiles, and attendance_records/submissions block that (see the note at the
 * top of this file).
 *
 * So: try the hard delete (`allowHard`), and otherwise use GoTrue's own soft
 * delete (models.User.SoftDeleteUser + SoftDeleteUserIdentities). It keeps the
 * auth.users ROW (no cascade, so the anonymous statistics stay valid) but
 * hashes e-mail and phone, empties user AND app metadata, empties every
 * identity's identity_data, removes the password, revokes all sessions and
 * sets deleted_at. Nothing readable is left. Calling it twice is a no-op.
 *
 * Returns 'hard' | 'soft', or an error message.
 */
export async function retireAuthUser(
  admin: SupabaseClient,
  userId: string,
  opts: { allowHard: boolean },
): Promise<{ removed: 'hard' | 'soft' } | { error: string }> {
  if (opts.allowHard) {
    const { error } = await admin.auth.admin.deleteUser(userId)
    if (!error) return { removed: 'hard' }
    // Expected for anyone with attendance or submissions: fall through.
  }
  const { error } = await admin.auth.admin.deleteUser(userId, true)
  if (error) return { error: `auth soft delete: ${error.message}` }
  return { removed: 'soft' }
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
 * Every object under `<prefix>/`, one folder level down included. Storage's
 * list() is not recursive and returns sub-folders as entries with id null.
 * submission-files is laid out `<user>/<assignment>/<file>`, so one level is
 * exactly what that bucket needs. Pages past the 1000-entry limit.
 */
export async function listUnder(
  admin: SupabaseClient, bucket: string, prefix: string,
): Promise<{ paths: string[]; error?: string }> {
  const paths: string[] = []
  const walk = async (dir: string, depth: number): Promise<string | undefined> => {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset })
      if (error) return `storage/${bucket} list ${depth ? 'sub' : ''}folder: ${error.message}`
      for (const o of data ?? []) {
        if (o.id === null) {
          if (depth === 0) {
            const e = await walk(`${dir}/${o.name}`, 1)
            if (e) return e
          }
        } else {
          paths.push(`${dir}/${o.name}`)
        }
      }
      if (!data || data.length < 1000) return undefined
    }
  }
  const error = await walk(prefix, 0)
  return { paths, error }
}

/**
 * After the pupil's dossier is gone, their family row may name nobody but
 * them (label = family surname). Delete it when no child and no payment points
 * at it any more; when chart payments still do, keep the row (accounting
 * records, 7 years, and fee_payments cascades from families) but drop the name.
 */
async function releaseFamily(
  admin: SupabaseClient, familyId: string, tenantId: string, report: ErasureReport,
): Promise<void> {
  const { count: kids, error: kErr } = await admin.from('student_details')
    .select('student_id', { count: 'exact', head: true }).eq('family_id', familyId)
  if (kErr) { report.errors.push(`families check: ${kErr.message}`); return }
  if ((kids ?? 0) > 0) return   // a brother or sister is still enrolled: the family stays as it is

  const { count: pays, error: pErr } = await admin.from('fee_payments')
    .select('id', { count: 'exact', head: true }).eq('family_id', familyId)
  if (pErr) { report.errors.push(`families payments check: ${pErr.message}`); return }

  const q = (pays ?? 0) > 0
    ? admin.from('families').update({ label: 'Verwijderd' }).eq('id', familyId).eq('tenant_id', tenantId)
    : admin.from('families').delete().eq('id', familyId).eq('tenant_id', tenantId)
  const { error } = await q
  if (error) report.errors.push(`families ${(pays ?? 0) > 0 ? 'scrub' : 'delete'}: ${error.message}`)
  else report.rows[(pays ?? 0) > 0 ? 'families_scrubbed' : 'families'] = 1
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
  const { data: submissions, error: subsErr } = await admin
    .from('submissions')
    .select('id')
    .eq('student_id', userId)
  // A failed read must not look like "no submissions": the files would stay.
  if (subsErr) report.errors.push(`submissions read: ${subsErr.message}`)
  const submissionIds = submissions?.map(s => s.id) ?? []

  if (submissionIds.length) {
    const { data: files, error: filesErr } = await admin
      .from('submission_files')
      .select('id, file_url')
      .in('submission_id', submissionIds)
    if (filesErr) report.errors.push(`submission_files read: ${filesErr.message}`)

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
  // submission-files is laid out `<user_id>/<assignment_id>/<file>` (no tenant
  // in the path; RLS pins the first segment to the uploader since mig 26), so
  // everything under the user's folder is theirs. Catches uploads whose row
  // insert failed, which the submission_files step above can't see.
  // (Review 2026-11-21, finding #7.)
  {
    const { paths, error } = await listUnder(admin, 'submission-files', userId)
    if (error) report.errors.push(error)
    else if (paths.length) await removeObjects(admin, 'submission-files', paths, report)
  }

  // ── Rows that are entirely about this person ───────────────────────────────
  // The table list lives in personal-data-map.ts, shared with the export route:
  // what we can erase must be exactly what we can export (Art. 15/17/20 read the
  // same footprint).
  // The family row (surname) is checked after student_details is gone.
  const { data: det, error: detErr } = await admin
    .from('student_details').select('family_id').eq('student_id', userId).maybeSingle()
  if (detErr) report.errors.push(`student_details family read: ${detErr.message}`)
  const familyId: string | null = det?.family_id ?? null

  for (const { table, key } of OWNED_TABLES) {
    const { error, count } = await admin
      .from(table).delete({ count: 'exact' }).eq(key, userId)
    if (error) report.errors.push(`${table} delete: ${error.message}`)
    else countRows(table, count ?? 0)
  }
  if (familyId && opts.tenantId) await releaseFamily(admin, familyId, opts.tenantId, report)

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
      // An erasure is one school's request: another school's invitation for the
      // same address is not ours to remove.
      .eq('tenant_id', opts.tenantId ?? '00000000-0000-0000-0000-000000000000')
    if (error) report.errors.push(`invitations delete: ${error.message}`)
    else countRows('invitations', count ?? 0)
  }

  return report
}
