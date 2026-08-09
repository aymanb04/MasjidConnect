import Link from 'next/link'
import { MeemMark } from '@/components/ui/MeemMark'

// Public mirror of the in-app /privacy and /voorwaarden pages. Those live inside
// the (dashboard) group and are therefore login-gated, but the landing page and
// the privacy statement itself have to be readable by someone who has no account
// yet — a prospect's board, or a parent checking what we store. Same content
// components, so the two versions can never drift apart.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-dvh bg-surface-warm">
            <header className="border-b border-border bg-surface-warm/85 backdrop-blur">
                <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5 sm:px-8">
                    <Link href="/" className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500">
                            <MeemMark className="text-white" size={22} />
                        </span>
                        <span className="font-semibold text-gray-900">MasjidConnect</span>
                    </Link>
                    <Link href="/login" className="btn-secondary">Inloggen</Link>
                </div>
            </header>

            <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8">{children}</main>

            <footer className="mx-auto max-w-3xl px-5 pb-12 sm:px-8">
                {/* flex-wrap, not inline text with · separators: JSX strips the
                    newline whitespace between sibling elements, so an inline row
                    has no break opportunity and overflowed a 390px screen. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-6 text-sm text-gray-500">
                    <Link href="/" className="hover:text-primary-600">← Terug naar de startpagina</Link>
                    <span className="text-gray-300">·</span>
                    <Link href="/legal/privacy" className="hover:text-primary-600">Privacyverklaring</Link>
                    <span className="text-gray-300">·</span>
                    <Link href="/legal/voorwaarden" className="hover:text-primary-600">Gebruiksvoorwaarden</Link>
                </div>
            </footer>
        </div>
    )
}
