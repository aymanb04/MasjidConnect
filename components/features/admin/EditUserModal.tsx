'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { X, Loader2, CheckCircle2, GraduationCap } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/useScrollLock'

// Editing an existing user was missing entirely: a typo in a name could not be
// corrected, a teacher could not be made leerlingenbegeleider, and — the report
// that surfaced it (Ilias, 2026-09-04) — there was no way to reach a teacher's
// class assignments from the person. Assigning a teacher to a class DID already
// exist, but only from the other direction (Klassen → class → Leerkrachten →
// "+"), which is why it read as missing. This modal covers the person-side view.
//
// It also closes a promise: the published privacyverklaring grants "recht op
// verbetering" (Art. 16 AVG), and until now no admin could actually rectify
// anyone's name.
//
// No API route needed. The `admin_manage_profiles` policy (schema.sql) already
// lets an admin write any profile in their own tenant, and its WITH CHECK
// refuses to set role = 'super_admin'. The guardrail lives in the database, so
// the client cannot talk its way past it.
//
// E-MAIL IS DELIBERATELY NOT EDITABLE HERE. `profiles.email` is display-only;
// the real login lives in `auth.users`, and changing it needs the admin API
// with email_confirm. Editing only the profiles copy would produce an account
// whose displayed address is not the one it signs in with — worse than not
// offering it. Route address changes through the operator.

type Role = 'student' | 'teacher' | 'admin' | 'leerlingenbegeleiding'

const ROLE_LABELS: Record<Role, string> = {
  student: 'Leerling',
  teacher: 'Leerkracht',
  admin: 'Beheerder',
  leerlingenbegeleiding: 'Leerlingenbegeleiding',
}

interface Props {
  user: { id: string; first_name: string; last_name: string; email?: string; phone?: string; role: string }
  tenantId: string
  onClose: () => void
  onSaved: () => void
}

// Class names repeat by design — a school runs three "Arabisch" classes at once,
// one per group. Without the group the checkbox list is unpickable, which the
// browser check caught immediately and the type checker never would.
interface ClassOption { id: string; name: string; group_name?: string; school_year_name?: string }

export function EditUserModal({ user, tenantId, onClose, onSaved }: Props) {
  useScrollLock()

  const [firstName, setFirstName] = useState(user.first_name ?? '')
  const [lastName,  setLastName]  = useState(user.last_name ?? '')
  const [phone,     setPhone]     = useState(user.phone ?? '')
  const [role,      setRole]      = useState<Role>((user.role as Role) ?? 'student')

  const [classes,   setClasses]   = useState<ClassOption[]>([])
  const [assigned,  setAssigned]  = useState<Set<string>>(new Set())
  const [initialAssigned, setInitialAssigned] = useState<Set<string>>(new Set())

  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [done,    setDone]    = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [{ data: cls }, { data: ct }] = await Promise.all([
      supabase.from('classes')
        .select('id, name, school_years(name), groups(name)')
        .eq('tenant_id', tenantId)
        .order('name'),
      supabase.from('class_teachers').select('class_id').eq('teacher_id', user.id),
    ])
    setClasses((cls ?? []).map((c: any) => ({
      id: c.id,
      name: c.name,
      group_name: c.groups?.name,
      school_year_name: c.school_years?.name,
    })))
    const current = new Set<string>((ct ?? []).map((r: any) => r.class_id))
    setAssigned(current)
    setInitialAssigned(new Set(current))
    setLoading(false)
  }

  function toggleClass(id: string) {
    setAssigned(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function save() {
    setSaving(true)
    setError('')

    if (!firstName.trim() || !lastName.trim()) {
      setError('Voornaam en achternaam zijn verplicht.')
      setSaving(false)
      return
    }

    const { error: profErr } = await supabase.from('profiles').update({
      first_name: firstName.trim(),
      last_name:  lastName.trim(),
      phone:      phone.trim() || null,
      role,
    }).eq('id', user.id)

    // Surface the failure instead of closing as if it worked: a 0-row update
    // under RLS returns no error, but a refused one does, and silently
    // reporting success is the bug class this app has been burned by before.
    if (profErr) {
      console.error('[EditUserModal] profile update:', profErr)
      setError('Opslaan mislukt. Je hebt mogelijk geen rechten op deze gebruiker.')
      setSaving(false)
      return
    }

    // Teaching assignments only mean anything for a teacher. Changing someone
    // out of the teacher role drops their class links rather than leaving a
    // non-teacher silently attached to classes.
    if (role !== 'teacher') {
      if (initialAssigned.size > 0) {
        const { error: delErr } = await supabase
          .from('class_teachers').delete().eq('teacher_id', user.id)
        if (delErr) {
          console.error('[EditUserModal] clearing class_teachers:', delErr)
          setError('Profiel opgeslagen, maar de klastoewijzingen konden niet worden aangepast.')
          setSaving(false)
          return
        }
      }
    } else {
      // Array.from rather than spread: the tsconfig target predates
      // downlevelIteration, so spreading a Set does not compile here.
      const toAdd    = Array.from(assigned).filter(id => !initialAssigned.has(id))
      const toRemove = Array.from(initialAssigned).filter(id => !assigned.has(id))

      if (toAdd.length) {
        const { error: addErr } = await supabase.from('class_teachers')
          .insert(toAdd.map(class_id => ({ class_id, teacher_id: user.id })))
        if (addErr) {
          console.error('[EditUserModal] assigning classes:', addErr)
          setError('Profiel opgeslagen, maar niet alle klassen konden worden toegewezen.')
          setSaving(false)
          return
        }
      }
      if (toRemove.length) {
        const { error: remErr } = await supabase.from('class_teachers')
          .delete().eq('teacher_id', user.id).in('class_id', toRemove)
        if (remErr) {
          console.error('[EditUserModal] removing classes:', remErr)
          setError('Profiel opgeslagen, maar niet alle klassen konden worden losgekoppeld.')
          setSaving(false)
          return
        }
      }
    }

    setSaving(false)
    setDone(true)
    onSaved()
    setTimeout(onClose, 900)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
         role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
      <div className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="edit-user-title" className="font-semibold text-gray-900">Gebruiker bewerken</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Sluiten">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <CheckCircle2 size={28} className="mx-auto text-primary-600" />
            <p className="mt-3 text-sm text-gray-700">Opgeslagen.</p>
          </div>
        ) : loading ? (
          <div className="py-10 text-center"><Loader2 size={22} className="mx-auto animate-spin text-primary-600" /></div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="eu-first" className="label">Voornaam</label>
                <input id="eu-first" className="input" value={firstName}
                       onChange={e => setFirstName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="eu-last" className="label">Achternaam</label>
                <input id="eu-last" className="input" value={lastName}
                       onChange={e => setLastName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="eu-phone" className="label">
                  Telefoon <span className="font-normal text-gray-500">(optioneel)</span>
                </label>
                <input id="eu-phone" type="tel" className="input" value={phone}
                       onChange={e => setPhone(e.target.value)} />
              </div>
              <div>
                <label htmlFor="eu-role" className="label">Rol</label>
                <select id="eu-role" className="input" value={role}
                        onChange={e => setRole(e.target.value as Role)}>
                  {(Object.keys(ROLE_LABELS) as Role[]).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            {user.email && (
              <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-500">
                Aanmelden gebeurt met <span className="font-medium text-gray-700">{user.email}</span>.
                Een e-mailadres wijzigen kan hier niet: dat verandert de login zelf en
                gebeurt door MasjidConnect. Vraag het aan via een bericht.
              </p>
            )}

            {role === 'teacher' && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2">
                  <GraduationCap size={15} className="text-primary-600" />
                  <h3 className="text-sm font-semibold text-gray-800">Klassen</h3>
                </div>
                {classes.length === 0 ? (
                  <p className="text-sm text-gray-400">Er zijn nog geen klassen.</p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
                    {classes.map(c => (
                      <label key={c.id}
                             className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                        <input type="checkbox" className="h-4 w-4 accent-primary-600"
                               checked={assigned.has(c.id)} onChange={() => toggleClass(c.id)} />
                        <span className="text-sm text-gray-800">{c.name}</span>
                        {c.group_name && (
                          <span className="badge bg-gray-100 text-gray-500">{c.group_name}</span>
                        )}
                        {c.school_year_name && (
                          <span className="ml-auto flex-shrink-0 text-xs text-gray-400">{c.school_year_name}</span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-6 flex items-center justify-end gap-2">
              <button onClick={onClose} className="btn-secondary">Annuleren</button>
              <button onClick={save} disabled={saving} className="btn-primary min-w-28 justify-center">
                {saving ? <><Loader2 size={15} className="animate-spin" /> Opslaan…</> : 'Opslaan'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
