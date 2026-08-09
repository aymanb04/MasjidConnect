// Turns a failed data-load (a Supabase PostgrestError, a thrown network/timeout
// error, or an HTTP error object) into a short Dutch message + retry copy.
//
// Why this exists: supabase-js `.from()/.rpc()` return `{ data, error }` and do
// NOT throw, so the React error boundaries in app/error.tsx never see a failed
// data load — the page just renders empty. Pages classify the error here and
// render <LoadError> instead. Ties to the nano IO-throttle overload behaviour
// documented in docs/internal/SECURITY_AND_INFRA.md §1: overload shows visible, transient
// errors (522/504/timeout), and we want "probeer opnieuw" instead of a blank page.

export type LoadErrorInfo = {
    title: string
    message: string
}

// Deliberately neutral default. Per the roadmap decision: don't guess
// "te veel gebruikers" unless it's actually detectable (a real 429/503) — a
// neutral retry message is safer.
const GENERIC: LoadErrorInfo = {
    title: 'Kon niet laden',
    message: 'De gegevens konden niet geladen worden. Probeer het opnieuw.',
}

const RATE_LIMITED: LoadErrorInfo = {
    title: 'Even geduld',
    message: 'Even wachten, probeer zo opnieuw.',
}

const UNAVAILABLE: LoadErrorInfo = {
    title: 'Tijdelijk niet beschikbaar',
    message: 'Tijdelijk niet beschikbaar, probeer over een moment opnieuw.',
}

// Pull an HTTP-ish status out of the many shapes an error can arrive in.
function statusOf(err: any): number | null {
    if (!err || typeof err !== 'object') return null
    const raw = err.status ?? err.statusCode ?? err.httpStatus ?? err.originalError?.status
    const n = typeof raw === 'string' ? parseInt(raw, 10) : raw
    return typeof n === 'number' && !Number.isNaN(n) ? n : null
}

/**
 * Classify a load failure. Accepts a Supabase PostgrestError, a thrown Error
 * (network/timeout/abort), or a plain HTTP error object. Returns null for a
 * falsy input so callers can do `classifyLoadError(error)` unconditionally.
 */
export function classifyLoadError(err: any): LoadErrorInfo | null {
    if (!err) return null

    const status = statusOf(err)
    const code = String(err?.code ?? '')
    const msg = String(err?.message ?? err ?? '').toLowerCase()

    // Rate limiting — Upstash on /api/* routes, or an upstream 429.
    if (status === 429 || code === '429' || msg.includes('too many requests') || msg.includes('rate limit')) {
        return RATE_LIMITED
    }

    // Server / gateway errors and the throttle/timeout family. On a depleted
    // nano IO budget PostgREST surfaces 5xx/522/504; statement_timeout is
    // Postgres SQLSTATE 57014 ("canceling statement due to statement timeout").
    if (
        (status !== null && status >= 500) ||
        code === '57014' ||          // statement_timeout
        code === '08006' ||          // connection failure
        code === '08003' ||          // connection does not exist
        msg.includes('timeout') ||
        msg.includes('timed out') ||
        msg.includes('failed to fetch') ||  // Chrome/Firefox network failure
        msg.includes('networkerror') ||     // Firefox
        msg.includes('load failed') ||      // Safari
        msg.includes('network request failed') ||
        msg.includes('fetch failed') ||
        msg.includes('aborted') ||
        err?.name === 'AbortError'
    ) {
        return UNAVAILABLE
    }

    return GENERIC
}
