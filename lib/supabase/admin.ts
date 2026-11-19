import { createClient } from '@supabase/supabase-js'

// The service-role client: it bypasses every RLS policy, including the tenant
// wall (mig 46). Import it ONLY from app/api/* routes and lib/api-auth.ts, and
// only after the caller's bearer token has been verified (requireRole).
// The client-side counterpart is lib/supabase/singleton.ts.
//
// One shared instance, configured for a server: no session is stored or
// refreshed, so nothing a request does can change whose identity the next
// request runs as. Only call stateless auth methods on it (auth.getUser(token),
// auth.admin.*) — never signInWithPassword/setSession.
if (typeof window !== 'undefined') {
    throw new Error('lib/supabase/admin.ts must never be bundled into the browser')
}

export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    }
)
