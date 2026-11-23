import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The profiles columns the app reads directly.
 *
 * `email` and `phone` are deliberately missing, and so is `select('*')` on
 * profiles anywhere in the app: contact details come only from
 * {@link withContacts}, which asks get_profile_contacts() (migration 51), and
 * that function decides per caller who may see whose (pupils: only their own
 * teachers' e-mail address). Don't name either column in a profiles select or
 * embed (`profiles(email)`).
 *
 * Since migration 52, signed-in users have no SELECT on email/phone at all, so
 * `select('*')` or naming either column fails with "permission denied".
 *
 * A new profiles column needs a GRANT in its migration AND an entry here (the
 * rls-bench compares this list, the grants and the table).
 */
// One literal (not a concatenation) so supabase-js can still type the result.
export const PROFILE_COLUMNS =
  'id, tenant_id, role, first_name, last_name, is_active, is_anonymized, archived_at, terms_accepted_at, terms_version, must_change_password, created_at, updated_at'

export type Contacts = { email: string | null; phone: string | null }

// The function returns a set, so PostgREST's 1000-row cap applies to one call.
const CHUNK = 500

/**
 * Adds `email` and `phone` to each row, as far as the caller may see them
 * (null where they may not). Rows the caller may not see contacts for are
 * returned unchanged apart from the two nulls, so a screen never loses a person
 * because of this lookup.
 */
export async function withContacts<T extends { id: string }>(
  supabase: SupabaseClient,
  rows: T[],
): Promise<{ data: (T & Contacts)[]; error: { message: string } | null }> {
  const ids = Array.from(new Set(rows.map(r => r.id)))
  const found = new Map<string, Contacts>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase.rpc('get_profile_contacts', { p_ids: ids.slice(i, i + CHUNK) })
    if (error) return { data: rows.map(r => ({ ...r, email: null, phone: null })), error }
    for (const c of (data ?? []) as ({ id: string } & Contacts)[]) found.set(c.id, { email: c.email, phone: c.phone })
  }
  return {
    data: rows.map(r => ({ ...r, email: found.get(r.id)?.email ?? null, phone: found.get(r.id)?.phone ?? null })),
    error: null,
  }
}
