#!/usr/bin/env node
// ============================================================
// One-off repair: empty the login record of people erased BEFORE 2026-11-22
// ============================================================
// Until then an erasure (/api/user/anonymize, /api/user/delete) scrubbed the
// profile but left auth.users holding the person's name (raw_user_meta_data)
// and their original login address (auth.identities.identity_data).
// Review 2026-11-21, finding #2. The routes now finish with GoTrue's soft
// delete (lib/gdpr-erasure.ts retireAuthUser); this script applies the same
// soft delete to the accounts erased the old way.
//
// Scope: ONE school (by slug), profiles with is_anonymized = true only.
// Default is a DRY RUN that changes nothing and prints counts and ids only --
// never a name or an address.
//
//   node scripts/retire-erased-auth.mjs --tenant de-kroon            # dry run
//   node scripts/retire-erased-auth.mjs --tenant de-kroon --apply    # after Ayman's go
//
// There is no undo file, deliberately: an undo would have to keep the names,
// i.e. be the very copy this removes. The soft delete only touches people the
// school has already erased, and is idempotent (GoTrue skips users that are
// already soft-deleted).
//
// Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* rely on the real environment */ }
  return env
}

const args = process.argv.slice(2)
const slug = args[args.indexOf('--tenant') + 1]
const apply = args.includes('--apply')
if (!args.includes('--tenant') || !slug || slug.startsWith('--')) {
  console.error('usage: node scripts/retire-erased-auth.mjs --tenant <slug> [--apply]')
  process.exit(2)
}

const env = loadEnv()
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const { data: tenant, error: tErr } = await sb.from('tenants').select('id, slug').eq('slug', slug).maybeSingle()
if (tErr) throw tErr
if (!tenant) { console.error(`no tenant with slug "${slug}"`); process.exit(2) }

// Every erased profile of this school, paged (PostgREST stops at 1000 silently).
const ids = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('profiles').select('id')
    .eq('tenant_id', tenant.id).eq('is_anonymized', true).order('id').range(from, from + 999)
  if (error) throw error
  ids.push(...data.map(r => r.id))
  if (data.length < 1000) break
}

const rows = []
for (const id of ids) {
  const { data, error } = await sb.auth.admin.getUserById(id)
  if (error || !data?.user) { rows.push({ id, state: 'no auth user (already hard-deleted)' }); continue }
  const u = data.user
  const nameKept = Object.values(u.user_metadata ?? {}).some(v => v)
  const identityKept = (u.identities ?? []).some(i => Object.keys(i.identity_data ?? {}).length)
  if (!nameKept && !identityKept && !(u.email ?? '').includes('@')) { rows.push({ id, state: 'already clean' }); continue }
  if (!apply) { rows.push({ id, state: `would soft-delete (name kept: ${nameKept}, identity kept: ${identityKept})` }); continue }
  const { error: dErr } = await sb.auth.admin.deleteUser(id, true)
  rows.push({ id, state: dErr ? `FAILED: ${dErr.message}` : 'soft-deleted' })
}

const tally = rows.reduce((t, r) => ({ ...t, [r.state.split(' (')[0]]: (t[r.state.split(' (')[0]] ?? 0) + 1 }), {})
console.log(`${apply ? 'APPLIED' : 'DRY RUN'} on ${tenant.slug}: ${ids.length} erased profile(s)`)
for (const [k, v] of Object.entries(tally)) console.log(`  ${v} × ${k}`)
const out = `retire-erased-auth-${tenant.slug}-${apply ? 'applied' : 'dryrun'}-${new Date().toISOString().slice(0, 10)}.json`
writeFileSync(out, JSON.stringify(rows, null, 2))   // ids + state only
console.log(`ids and states: ${out} (no names in it; delete when done)`)
if (rows.some(r => r.state.startsWith('FAILED'))) process.exit(1)
