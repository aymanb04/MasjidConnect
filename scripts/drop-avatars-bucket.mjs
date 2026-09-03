#!/usr/bin/env node
// ============================================================
// Remove the unused `avatars` bucket — via the Storage API
// ============================================================
// Part 2 of migration 27. It cannot be done in SQL: Supabase blocks
// `DELETE FROM storage.objects` with
//
//   ERROR: 42501 Direct deletion from storage tables is not allowed.
//          Use the Storage API instead.  (storage.protect_delete())
//
// and the guard is correct — deleting object rows in SQL orphans the actual
// files in the backing store.
//
// Why the bucket goes: nothing in app/, components/ or lib/ reads or writes
// avatars. There is no upload UI and no display. `profiles.avatar_url` is
// dropped by migration 27; this removes the storage that went with it.
//
// Safety: refuses to delete unless the bucket is empty. If it is not, the
// design assumption (a feature that was never built) is wrong and that needs
// explaining before anything is destroyed.
//
// Usage:  node scripts/drop-avatars-bucket.mjs          # dry run, lists only
//         node scripts/drop-avatars-bucket.mjs --delete # actually removes it

import { readFileSync } from 'node:fs'

const BUCKET = 'avatars'
const DO_IT = process.argv.includes('--delete')

const env = { ...process.env }
try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* rely on the real environment */ }

const URL = env.NEXT_PUBLIC_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` }

const buckets = await (await fetch(`${URL}/storage/v1/bucket`, { headers: auth })).json()
const bucket = buckets.find(b => b.id === BUCKET)
if (!bucket) {
  console.log(`Bucket "${BUCKET}" does not exist — nothing to do.`)
  process.exit(0)
}
console.log(`Bucket "${BUCKET}" exists — ${bucket.public ? 'PUBLIC' : 'private'}.`)

const objects = await (await fetch(`${URL}/storage/v1/object/list/${BUCKET}`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ prefix: '', limit: 1000 }),
})).json()

if (!Array.isArray(objects)) {
  console.error('Could not list the bucket:', JSON.stringify(objects))
  process.exit(1)
}

if (objects.length > 0) {
  console.error(`\nREFUSING TO DELETE — ${objects.length} object(s) found:`)
  for (const o of objects.slice(0, 20)) console.error('   ', o.name)
  console.error('\nThis bucket was believed to be unused. Find out what wrote to it before removing it.')
  process.exit(1)
}

console.log('Bucket is empty (0 objects).')

if (!DO_IT) {
  console.log('\nDry run. Re-run with --delete to remove the bucket.')
  process.exit(0)
}

const res = await fetch(`${URL}/storage/v1/bucket/${BUCKET}`, { method: 'DELETE', headers: auth })
if (!res.ok) {
  console.error(`Delete failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
console.log(`Deleted bucket "${BUCKET}".`)

const after = await (await fetch(`${URL}/storage/v1/bucket`, { headers: auth })).json()
console.log('Remaining buckets:',
  after.map(b => `${b.id}${b.public ? ' (PUBLIC)' : ''}`).join(', '))
