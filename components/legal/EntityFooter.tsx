// Identifies the legal entity behind MasjidConnect on the in-app legal pages
// and the /akkoord acceptance screen, so users know who they're agreeing with.
// Kept deliberately lean (name + KBO + contact, no street address) — the full
// address lives in the formal privacyverklaring and is public via the KBO register.
export function EntityFooter() {
  return (
    <p className="text-xs text-gray-400 text-center mt-8 leading-relaxed">
      MasjidConnect is een dienst van Ayman Boulayoune (eenmanszaak) ·
      KBO BE 1034.397.409 ·{' '}
      <a href="mailto:privacy@masjidconnect.be" className="underline hover:text-gray-600">
        privacy@masjidconnect.be
      </a>
    </p>
  )
}
