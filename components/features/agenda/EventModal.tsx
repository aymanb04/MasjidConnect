'use client'

// Activiteit toevoegen of bewerken in de agenda (migratie 42). Enkel beheer
// komt hier; RLS weigert het voor iedereen anders.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useScrollLock } from '@/lib/hooks/useScrollLock'
import { CalendarPlus, Loader2, Trash2, X } from 'lucide-react'

export interface CalendarEvent {
  id: string
  tenant_id: string
  title: string
  description: string | null
  starts_on: string
  ends_on: string
  start_time: string | null
  end_time: string | null
  audience: 'school' | 'group' | 'teachers'
  group_id: string | null
  is_closure: boolean
}

interface Props {
  tenantId: string
  userId: string
  /** Bestaande activiteit om te bewerken; leeg = nieuwe. */
  event: CalendarEvent | null
  /** Voorgestelde datum voor een nieuwe activiteit (de aangeklikte dag). */
  defaultDate: string
  groups: { id: string; name: string }[]
  onClose: () => void
  onSaved: () => void
}

export default function EventModal({ tenantId, userId, event, defaultDate, groups, onClose, onSaved }: Props) {
  useScrollLock(true)
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    title:       event?.title ?? '',
    description: event?.description ?? '',
    starts_on:   event?.starts_on ?? defaultDate,
    ends_on:     event?.ends_on ?? defaultDate,
    all_day:     event ? !event.start_time : true,
    start_time:  event?.start_time?.slice(0, 5) ?? '',
    end_time:    event?.end_time?.slice(0, 5) ?? '',
    audience:    event?.audience ?? 'school',
    group_id:    event?.group_id ?? '',
    is_closure:  event?.is_closure ?? false,
  })

  // Een einddatum voor de begindatum is nooit bedoeld: schuif ze mee.
  useEffect(() => {
    if (form.ends_on < form.starts_on) setForm(p => ({ ...p, ends_on: p.starts_on }))
  }, [form.starts_on, form.ends_on])

  const invalid =
    !form.title.trim() || !form.starts_on || !form.ends_on ||
    (form.audience === 'group' && !form.group_id) ||
    (!form.all_day && !form.start_time) ||
    (!form.all_day && !!form.end_time && form.starts_on === form.ends_on && form.end_time < form.start_time)

  async function save() {
    if (invalid) return
    setBusy(true); setError('')
    const row = {
      tenant_id:   tenantId,
      title:       form.title.trim(),
      description: form.description.trim() || null,
      starts_on:   form.starts_on,
      ends_on:     form.ends_on,
      start_time:  form.all_day ? null : form.start_time,
      end_time:    form.all_day || !form.end_time ? null : form.end_time,
      audience:    form.audience,
      group_id:    form.audience === 'group' ? form.group_id : null,
      // Een dag zonder les geldt voor iedereen; ze aan personeel alleen tonen
      // zou leerlingen laten opdagen voor een gesloten school.
      is_closure:  form.audience === 'teachers' ? false : form.is_closure,
    }
    const { data, error: err } = event
      ? await supabase.from('calendar_events').update(row).eq('id', event.id).select('id')
      : await supabase.from('calendar_events').insert({ ...row, created_by: userId }).select('id')
    // Een RLS-weigering bij update geeft geen fout maar nul rijen.
    if (err || !data?.length) {
      console.error(err)
      setError('Opslaan mislukt. Probeer het opnieuw.')
      setBusy(false)
      return
    }
    onSaved()
  }

  async function remove() {
    if (!event) return
    setBusy(true); setError('')
    const { data, error: err } = await supabase.from('calendar_events').delete().eq('id', event.id).select('id')
    if (err || !data?.length) {
      console.error(err)
      setError('Verwijderen mislukt.')
      setBusy(false)
      return
    }
    onSaved()
  }

  const choice = (on: boolean) => `flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${on
    ? 'border-primary-500 bg-primary-50 font-medium text-primary-700'
    : 'border-border text-gray-600 hover:bg-gray-50'}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-modal animate-slide-up">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border p-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
              <CalendarPlus size={16} className="text-primary-600" />
            </div>
            <h2 className="font-semibold text-gray-900">{event ? 'Activiteit bewerken' : 'Activiteit toevoegen'}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Sluiten"><X size={18} /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label htmlFor="ev-titel" className="label">Titel *</label>
            <input id="ev-titel" className="input" value={form.title} maxLength={200}
              placeholder="Bijv. Oudercontact, Suikerfeest, Uitstap"
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label htmlFor="ev-oms" className="label">Omschrijving <span className="text-gray-400">(optioneel)</span></label>
            <textarea id="ev-oms" rows={3} className="input resize-none" value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ev-van" className="label">Van *</label>
              <input id="ev-van" type="date" className="input" value={form.starts_on}
                onChange={e => setForm(p => ({ ...p, starts_on: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="ev-tot" className="label">Tot en met *</label>
              <input id="ev-tot" type="date" className="input" value={form.ends_on} min={form.starts_on}
                onChange={e => setForm(p => ({ ...p, ends_on: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.all_day}
                onChange={e => setForm(p => ({ ...p, all_day: e.target.checked }))} />
              De hele dag
            </label>
            {!form.all_day && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label htmlFor="ev-begin" className="label">Begin *</label>
                  <input id="ev-begin" type="time" className="input" value={form.start_time}
                    onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div>
                  <label htmlFor="ev-einde" className="label">Einde <span className="text-gray-400">(optioneel)</span></label>
                  <input id="ev-einde" type="time" className="input" value={form.end_time}
                    onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))} />
                </div>
              </div>
            )}
          </div>
          <div>
            <span className="label">Voor wie</span>
            <div className="flex gap-2">
              <button type="button" className={choice(form.audience === 'school')}
                onClick={() => setForm(p => ({ ...p, audience: 'school' }))}>Hele school</button>
              <button type="button" className={choice(form.audience === 'group')} disabled={groups.length === 0}
                onClick={() => setForm(p => ({ ...p, audience: 'group' }))}>Eén groep</button>
              <button type="button" className={choice(form.audience === 'teachers')}
                onClick={() => setForm(p => ({ ...p, audience: 'teachers' }))}>Enkel personeel</button>
            </div>
            {form.audience === 'group' && (
              <select className="input mt-2" value={form.group_id} aria-label="Groep"
                onChange={e => setForm(p => ({ ...p, group_id: e.target.value }))}>
                <option value="">Kies een groep…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
            <p className="mt-1.5 text-xs text-gray-500">
              {form.audience === 'school' && 'Iedereen van de school ziet deze activiteit.'}
              {form.audience === 'group' && 'Enkel de leerlingen en leerkrachten van deze groep zien ze.'}
              {form.audience === 'teachers' && 'Leerlingen zien deze activiteit niet.'}
            </p>
          </div>
          {form.audience !== 'teachers' && (
            <label className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" checked={form.is_closure}
                onChange={e => setForm(p => ({ ...p, is_closure: e.target.checked }))} />
              <div>
                <div className="text-sm font-medium text-gray-800">Geen les</div>
                <div className="text-xs text-gray-500">Vakantie, feestdag of een andere dag dat de school dicht is.</div>
              </div>
            </label>
          )}
          {event && (
            confirmDelete ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                &ldquo;{event.title}&rdquo; verwijderen?
                <div className="mt-2 flex gap-2">
                  <button onClick={remove} disabled={busy}
                    className="text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg px-3 py-1.5">Ja, verwijderen</button>
                  <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-600 px-2">Annuleren</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="text-xs text-gray-400 hover:text-red-600 flex items-center gap-1.5">
                <Trash2 size={13} /> Activiteit verwijderen
              </button>
            )
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
        )}
        <div className="flex flex-shrink-0 gap-3 border-t border-border p-6">
          <button onClick={onClose} className="btn-secondary flex-1 justify-center">Annuleren</button>
          <button onClick={save} disabled={busy || invalid} className="btn-primary flex-1 justify-center">
            {busy ? <><Loader2 size={15} className="animate-spin" /> Opslaan…</> : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  )
}
