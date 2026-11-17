// READ-ONLY timing of RLS-heavy reads as the DEMO accounts (de-kroon-demo).
// Usage: node scripts/rls-bench/live-timing.mjs "$(pwd)"   (needs the gitignored
// scripts/rls-smoke.accounts.json; refuses unless every account is in de-kroon-demo)
import { createRequire } from 'node:module'
import fs from 'node:fs'
const repo = process.argv[2]
const require = createRequire(repo + '/package.json')
const { createClient } = require('@supabase/supabase-js')
const env = Object.fromEntries(fs.readFileSync(repo + '/.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]))
const acc = JSON.parse(fs.readFileSync(repo + '/scripts/rls-smoke.accounts.json', 'utf8'))
const tables = ['attendance_records', 'attendance_sessions', 'submissions', 'submission_feedback', 'assignments']
for (const role of ['admin', 'teacher', 'student']) {
  const c = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  const { data: s, error } = await c.auth.signInWithPassword(acc[role])
  if (error) { console.log(role, 'login failed', error.message); continue }
  const { data: me } = await c.from('profiles').select('tenant_id, role').eq('id', s.user.id).single()
  const { data: t } = await c.from('tenants').select('slug').eq('id', me.tenant_id).single()
  if (t?.slug !== 'de-kroon-demo') { console.log('REFUSING: not the demo tenant'); process.exit(2) }
  for (const tbl of tables) {
    const times = []; let n
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      const r = await c.from(tbl).select('*', { count: 'exact', head: true })
      times.push(performance.now() - t0); n = r.count ?? r.error?.message
    }
    times.sort((a, b) => a - b)
    console.log(`${role.padEnd(8)} ${tbl.padEnd(20)} rows=${String(n).padEnd(6)} best=${times[0].toFixed(0)}ms median=${times[2].toFixed(0)}ms`)
  }
  await c.auth.signOut()
}
