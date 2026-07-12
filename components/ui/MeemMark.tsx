// The "م" brand mark used inside the small rounded logo boxes (sidebar tenant
// fallback, login, auth pages, error screens). Rendered as text — Inter has no
// Arabic, so it falls back to a system Arabic face. At small sizes with the
// default weight it looked cramped and sat low; Georgia's serif metrics + a
// larger size + a 1px optical lift make it read centered and crisp, matching
// how public/icon.svg draws the same glyph.
export function MeemMark({ size = 22, className = '' }: { size?: number; className?: string }) {
    return (
        <span
            className={className}
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: size, lineHeight: 1, transform: 'translateY(-1px)' }}
            aria-hidden="true"
        >
            م
        </span>
    )
}
