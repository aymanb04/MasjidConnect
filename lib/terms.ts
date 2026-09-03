// ============================================================
// Terms & privacy acceptance
// ============================================================
// Bump this number whenever the Voorwaarden or the privacy statement materially
// change (legal/gebruikersovereenkomst.md, legal/privacyverklaring.md and the
// components/legal/*Content.tsx that render them). On their next login, every
// user whose profiles.terms_version is lower than this value is routed to
// /akkoord to re-accept. No schema change needed for a version bump.
//
// v2 (2026-09-02, legal review): controller role for website visitors, named
// sub-processors, retention periods, Art. 14 source disclosure, full access
// list incl. leerlingenbegeleiding and MasjidConnect's own technical account,
// consent withdrawal, a liability cap that survives Belgian law, and pupils
// acknowledging the rules rather than signing a contract they cannot sign.
// Free to make: no profile had ever accepted v1 (nobody had logged in yet).
export const CURRENT_TERMS_VERSION = 2

/** Printed under the published documents. Keep in step with the version above. */
export const LEGAL_LAST_UPDATED = 'versie 2 · september 2026'

/** True when this profile still needs to (re)accept the Voorwaarden. */
export function needsTermsAcceptance(
  profile: { terms_accepted_at?: string | null; terms_version?: number | null } | null,
): boolean {
  if (!profile) return false
  if (!profile.terms_accepted_at) return true
  return (profile.terms_version ?? 0) < CURRENT_TERMS_VERSION
}

/**
 * Minors cannot validly enter into a contract under Belgian law, and the school
 * — not the pupil — is MasjidConnect's licensee. Pupils therefore acknowledge
 * that they have read the rules; they do not sign them. Staff still accept.
 * See docs/internal/LEGAL_REVIEW_2026-09-02.md §B.
 */
export function isAcknowledgementOnly(role?: string | null): boolean {
  return role === 'student'
}
