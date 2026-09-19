// Shared by /wachtwoord (change it whenever you like) and
// /wachtwoord-instellen (the forced first-login step, migration 37), so the two
// screens can never disagree about what a valid password is.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase rejects a password without a lowercase letter, an uppercase letter
 * and a digit. Checking here rather than letting it come back as an English
 * server error the user cannot act on.
 */
export function policyProblem(pw: string): string | null {
  if (pw.length < 8) return 'Gebruik minstens 8 tekens.'
  if (!/[a-z]/.test(pw)) return 'Gebruik minstens één kleine letter.'
  if (!/[A-Z]/.test(pw)) return 'Gebruik minstens één hoofdletter.'
  if (!/[0-9]/.test(pw)) return 'Gebruik minstens één cijfer.'
  return null
}

/**
 * Tell the server this user no longer runs on an issued password, so the
 * first-login gate stops sending them to /wachtwoord-instellen.
 *
 * Goes through an API route on purpose: a profiles.update() by the row's own
 * owner recurses through this project's policies and fails with 42P17.
 *
 * Deliberately non-fatal. The password itself has already been changed by the
 * time this runs; if the flag fails to clear, the worst case is the user is
 * asked once more next time, which is annoying but not broken. Throwing here
 * would tell them the change failed when it did not.
 */
export async function clearMustChangePassword(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/user/password-changed', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (e) {
    console.error('[password] kon de vlag niet wissen', e)
  }
}
