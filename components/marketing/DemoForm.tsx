'use client'

// The landing page's only conversion action. It replaced a `mailto:` link, which
// silently does nothing on a phone with no mail client bound and produces no
// signal we can measure — so a school could bounce off the one button on the
// page and we would never know.
//
// Sits in a white card on the green CTA band: the .input/.label classes are
// built for a light ground, and the contrast on green would not survive AA.

import { useState } from 'react'
import { CheckCircle2, Loader2, Mail } from 'lucide-react'

const EMPTY = { naam: '', school: '', email: '', telefoon: '', bericht: '', website: '' }

export function DemoForm() {
    const [form, setForm] = useState(EMPTY)
    const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
    const [error, setError] = useState('')

    const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }))

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setState('sending')
        setError('')

        try {
            const res = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            })
            const data = await res.json().catch(() => ({}))

            if (!res.ok) {
                setError(data.error ?? 'Versturen mislukt. Probeer het opnieuw.')
                setState('idle')
                return
            }
            setState('done')
        } catch {
            // Offline, or the request never left the device.
            setError('Geen verbinding. Probeer het opnieuw of mail ons rechtstreeks.')
            setState('idle')
        }
    }

    if (state === 'done') {
        return (
            <div className="card p-8 text-center sm:p-10" role="status">
                <span className="stat-icon mx-auto bg-primary-50">
                    <CheckCircle2 size={22} className="text-primary-600" />
                </span>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">Bedankt — uw aanvraag is verstuurd.</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-600">
                    We nemen binnen twee werkdagen contact op met {form.naam.split(' ')[0] || 'u'} om een
                    moment af te spreken. Geen antwoord gekregen? Mail gerust{' '}
                    <a href="mailto:ayman@masjidconnect.be" className="font-medium text-primary-600 hover:underline">
                        ayman@masjidconnect.be
                    </a>.
                </p>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="card p-6 text-left sm:p-8" noValidate>
            {/* Honeypot: off-screen rather than display:none, which some bots skip.
                aria-hidden + tabIndex keep it out of the reading and tab order. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
                <label htmlFor="website">Laat dit veld leeg</label>
                <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off"
                    value={form.website} onChange={set('website')} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <div>
                    <label htmlFor="naam" className="label">Uw naam</label>
                    <input id="naam" name="name" className="input" required autoComplete="name"
                        value={form.naam} onChange={set('naam')} />
                </div>
                <div>
                    <label htmlFor="school" className="label">School of moskee</label>
                    <input id="school" name="organization" className="input" required autoComplete="organization"
                        value={form.school} onChange={set('school')} />
                </div>
                <div>
                    <label htmlFor="email" className="label">E-mailadres</label>
                    <input id="email" name="email" type="email" className="input" required autoComplete="email"
                        value={form.email} onChange={set('email')} />
                </div>
                <div>
                    <label htmlFor="telefoon" className="label">
                        Telefoon <span className="font-normal text-gray-500">(optioneel)</span>
                    </label>
                    <input id="telefoon" name="tel" type="tel" className="input" autoComplete="tel"
                        value={form.telefoon} onChange={set('telefoon')} />
                </div>
            </div>

            <div className="mt-4">
                <label htmlFor="bericht" className="label">
                    Bericht <span className="font-normal text-gray-500">(optioneel)</span>
                </label>
                <textarea id="bericht" name="message" rows={3} className="input resize-y"
                    placeholder="Hoeveel klassen heeft uw school? Waar loopt het nu vast?"
                    value={form.bericht} onChange={set('bericht')} />
            </div>

            {error && (
                <p role="alert" className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
                    {error}
                </p>
            )}

            <button type="submit" disabled={state === 'sending'}
                className="btn-primary mt-5 h-11 w-full justify-center px-5 text-base">
                {state === 'sending'
                    ? <><Loader2 size={17} className="animate-spin" /> Versturen…</>
                    : <><Mail size={17} /> Demo aanvragen</>}
            </button>

            <p className="mt-3 text-center text-xs leading-relaxed text-gray-500">
                We gebruiken uw gegevens enkel om op deze aanvraag te antwoorden. Liever zelf mailen?{' '}
                <a href="mailto:ayman@masjidconnect.be" className="font-medium text-primary-600 hover:underline">
                    ayman@masjidconnect.be
                </a>
            </p>
        </form>
    )
}
