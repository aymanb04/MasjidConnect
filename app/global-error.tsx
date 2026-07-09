'use client'

// Replaces the root layout when it crashes — globals.css is not loaded here,
// so everything is styled inline.
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <html lang="nl">
            <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#F8F7F4' }}>
                <div style={{ display: 'flex', minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                    <div style={{ maxWidth: 380, textAlign: 'center' }}>
                        <h1 style={{ fontSize: 18, fontWeight: 600, color: '#111827', margin: 0 }}>Er ging iets mis</h1>
                        <p style={{ fontSize: 14, color: '#6B7280', marginTop: 8 }}>
                            De applicatie kon niet geladen worden. Probeer het over een moment opnieuw.
                        </p>
                        <button
                            onClick={reset}
                            style={{
                                marginTop: 24,
                                padding: '10px 24px',
                                borderRadius: 12,
                                border: 'none',
                                backgroundColor: '#1B6B4A',
                                color: '#fff',
                                fontSize: 14,
                                fontWeight: 500,
                                cursor: 'pointer',
                            }}
                        >
                            Opnieuw proberen
                        </button>
                    </div>
                </div>
            </body>
        </html>
    )
}
