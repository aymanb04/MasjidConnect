// Fails (exit 1) when Supabase would accept a sign-up from the public internet.
//
// Why: "Allow new users to sign up" is a dashboard switch. No migration records
// it, and for months it was the only thing standing between a stranger and an
// admin account (review 2026-11-21, finding #1; migration 49 removes the
// escalation, this keeps the switch itself watched). A project restore, a
// support action or one wrong click turns it back on silently.
//
// Read-only: GET /auth/v1/settings is the public endpoint every Supabase client
// reads. Needs SUPABASE_URL and SUPABASE_ANON_KEY (public values; kept as repo
// secrets anyway so the project ref isn't spelled out in a public repo).
//
//   SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/check-auth-settings.mjs
// Runs daily in CI: .github/workflows/auth-settings.yml

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_ANON_KEY
if (!url || !key) {
  // Not green-by-default: a check that silently skips is how this went unwatched.
  console.error('FAIL  SUPABASE_URL / SUPABASE_ANON_KEY not set, so nothing was checked')
  process.exit(1)
}

const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/settings`, { headers: { apikey: key } })
if (!res.ok) {
  console.error(`FAIL  /auth/v1/settings answered ${res.status}`)
  process.exit(1)
}
const s = await res.json()

const checks = [
  ['public sign-ups are off (disable_signup)', s.disable_signup === true],
  ['anonymous sign-ins are off', s.external?.anonymous_users !== true],
]
let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}
if (failed) {
  console.error('\nSupabase → Authentication → Sign In / Providers: switch public sign-ups back off.')
  process.exit(1)
}
