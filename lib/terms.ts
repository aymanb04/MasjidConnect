// ============================================================
// Terms & privacy acceptance
// ============================================================
// Bump this number whenever the Voorwaarden materially change
// (privacyverklaring.md / gebruikersovereenkomst.md in /legal). On their next
// login, every user whose profiles.terms_version is lower than this value is
// routed to /akkoord to re-accept. No schema change needed for a version bump.
export const CURRENT_TERMS_VERSION = 1

/** True when this profile still needs to (re)accept the Voorwaarden. */
export function needsTermsAcceptance(
  profile: { terms_accepted_at?: string | null; terms_version?: number | null } | null,
): boolean {
  if (!profile) return false
  if (!profile.terms_accepted_at) return true
  return (profile.terms_version ?? 0) < CURRENT_TERMS_VERSION
}
