'use client'

import { RefreshCw } from 'lucide-react'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    return (
        <div className="flex min-h-dvh items-center justify-center p-6" style={{ backgroundColor: '#F8F7F4' }}>
            <div className="w-full max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: '#1B6B4A' }}>
                    <span className="text-lg font-bold text-white">م</span>
                </div>
                <h1 className="text-lg font-semibold text-gray-900">Er ging iets mis</h1>
                <p className="mt-1.5 text-sm text-gray-500">
                    De pagina kon niet geladen worden. Probeer het over een moment opnieuw.
                </p>
                <button
                    onClick={reset}
                    className="btn-primary mx-auto mt-6 h-11 justify-center px-6"
                >
                    <RefreshCw size={16} />
                    Opnieuw proberen
                </button>
            </div>
        </div>
    )
}
