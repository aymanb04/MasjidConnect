import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import { classifyLoadError } from '@/lib/loadError'

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
    </div>
  )
}

export function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="card p-12 text-center">
      <div className="flex justify-center mb-3 text-gray-300">{icon}</div>
      <p className="text-gray-500 font-medium">{title}</p>
      {subtitle && <p className="text-gray-400 text-sm mt-1">{subtitle}</p>}
    </div>
  )
}

// Shown in place of page content when a data load fails. supabase-js errors
// don't throw, so the app/error.tsx boundary never catches them — pages track
// an error state and render this instead of an empty page. `error` is passed
// straight through classifyLoadError; `onRetry` re-runs the page's loader.
export function LoadError({ error, onRetry, retrying }: { error: unknown; onRetry: () => void; retrying?: boolean }) {
  const { title, message } = classifyLoadError(error) ?? {
    title: 'Kon niet laden',
    message: 'De gegevens konden niet geladen worden. Probeer het opnieuw.',
  }
  return (
    <div className="card p-12 text-center">
      <div className="flex justify-center mb-3 text-gray-300"><WifiOff size={40} /></div>
      <p className="text-gray-700 font-medium">{title}</p>
      <p className="text-gray-400 text-sm mt-1">{message}</p>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="btn-secondary mx-auto mt-5 h-10 justify-center px-5 disabled:opacity-60"
      >
        <RefreshCw size={15} className={retrying ? 'animate-spin' : ''} />
        Opnieuw proberen
      </button>
    </div>
  )
}
