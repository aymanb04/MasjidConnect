#!/usr/bin/env node
// ============================================================
// Retention report — who is due for erasure, and what is left of them
// ============================================================
// The privacyverklaring (v2, 2026-09-02) publishes retention periods:
//
//   · dossier (adres, contactgegevens, notities, documenten)  → 12 months
//     after uitschrijving
//   · onderwijsresultaten (scores, rapporten, aanwezigheden)  → 2 years,
//     then anonymised
//   · betalingsgegevens                                        → 7 years
//     (statutory bookkeeping duty — NEVER deleted by this process)
//
// A published period with no way to see who is past it is a promise, not a
// policy. This script is the way to see it. It is STRICTLY READ-ONLY: it
// deletes nothing and changes nothing. Erasure itself stays in the app, so
// there is exactly one erasure code path (lib/gdpr-erasure.ts) rather than a
// second one drifting out here.
//
// Usage:  node scripts/retention-report.mjs
// Needs:  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, read from
//         .env.local automatically, or from the environment.
//
// Run it at the start of each school year, and whenever a school asks how long
// you keep things. Act on the output through the app: Gebruikers → de leerling
// → Anonimiseren (or Verwijderen), which purges storage as well.

import { readFileSync } from 'node:fs'

const DOSSIER_MONTHS = 12
const RESULTS_MONTHS = 24

function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch { /* no .env.local — rely on the real environment */ }
  return env
}

const env = loadEnv()
const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

async function q(path) {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: 'count=exact' },
  })
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`)
  return res.json()
}

const monthsSince = iso =>
  (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44)

const archived = await q(
  'profiles?is_active=eq.false&is_anonymized=eq.false&archived_at=not.is.null' +
  '&select=id,first_name,last_name,role,tenant_id,archived_at&order=archived_at.asc'
)

if (!archived.length) {
  console.log('No archived users with a retention clock running. Nothing due.')
  process.exit(0)
}

const tenants = Object.fromEntries(
  (await q('tenants?select=id,name')).map(t => [t.id, t.name])
)

let due = 0
console.log(`\nArchived users: ${archived.length}\n`)

for (const p of archived) {
  const months = monthsSince(p.archived_at)
  const dossierDue = months >= DOSSIER_MONTHS
  const resultsDue = months >= RESULTS_MONTHS
  if (!dossierDue && !resultsDue) continue
  due++

  const [details, notes, docs, reports] = await Promise.all([
    q(`student_details?student_id=eq.${p.id}&select=student_id`),
    q(`student_notes?student_id=eq.${p.id}&select=id`),
    q(`student_documents?student_id=eq.${p.id}&select=id,doc_type`),
    q(`student_reports?student_id=eq.${p.id}&select=id`),
  ])

  const health = docs.filter(d => d.doc_type === 'disability').length

  console.log(`── ${p.first_name} ${p.last_name}  (${p.role})`)
  console.log(`   school       : ${tenants[p.tenant_id] ?? p.tenant_id}`)
  console.log(`   archived     : ${p.archived_at.slice(0, 10)}  (${months.toFixed(1)} months ago)`)
  console.log(`   over termijn : ${[
    dossierDue ? `dossier (${DOSSIER_MONTHS}m)` : null,
    resultsDue ? `resultaten (${RESULTS_MONTHS}m)` : null,
  ].filter(Boolean).join(' + ')}`)
  console.log(`   still stored : details=${details.length} notes=${notes.length} ` +
              `documents=${docs.length}${health ? ` (waarvan ${health} zorg/gezondheid!)` : ''} ` +
              `rapporten=${reports.length}`)
  console.log(`   id           : ${p.id}\n`)
}

console.log(due === 0
  ? 'Nobody is past a retention period yet.'
  : `${due} user(s) past a published retention period. Erase them through the app ` +
    `(Gebruikers → Anonimiseren), which also purges their files from storage.\n` +
    `Payments are deliberately excluded: 7-year statutory retention.`)
