// The "م" brand mark used inside the small rounded logo boxes (sidebar tenant
// fallback, login, auth pages, error screens). Rendered as text — Inter has no
// Arabic so it falls back to a system Arabic face whose meem ink sits well below
// the centre of the line box. Flex-centring the box only centres the line box, not
// the ink, so the glyph reads low. The -0.27em lift optically centres the ink —
// measured empirically from the rendered glyph's bounding box (equal gap above and
// below to ~1px), and in em so it scales with `size`.
export function MeemMark({ size = 22, className = '' }: { size?: number; className?: string }) {
    return (
        <span
            className={className}
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontSize: size, lineHeight: 1, transform: 'translateY(-0.27em)' }}
            aria-hidden="true"
        >
            م
        </span>
    )
}
