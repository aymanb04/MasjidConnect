'use client'

import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { Upload, X, Loader2, CheckCircle2, AlertCircle, FileText, ArrowRight } from 'lucide-react'
import { useScrollLock } from '@/lib/hooks/useScrollLock'

interface ImportResult {
    email: string
    status: 'success' | 'error'
    message: string
}

interface Props {
    tenantId: string
    onImported: () => void
}

const MAX_IMPORT_ROWS = 500
const IMPORT_DISABLED = false

const SYSTEM_FIELDS = [
    { key: 'voornaam',   label: 'Voornaam',   required: true  },
    { key: 'achternaam', label: 'Achternaam', required: true  },
    { key: 'email',      label: 'E-mail',     required: true  },
    { key: 'rol',        label: 'Rol',        required: false },
    { key: 'groep',      label: 'Groep',      required: false },
]

export default function CsvImportButton({ tenantId, onImported }: Props) {
    const [open, setOpen]           = useState(false)
    useScrollLock(open)
    const [step, setStep]           = useState<'upload' | 'mapping' | 'preview' | 'done'>('upload')
    const [rawHeaders, setRawHeaders] = useState<string[]>([])
    const [rawRows, setRawRows]     = useState<Record<string, string>[]>([])
    const [mapping, setMapping]     = useState<Record<string, string>>({})
    const [mappedRows, setMappedRows] = useState<any[]>([])
    const [groups, setGroups]       = useState<any[]>([])
    const [loading, setLoading]     = useState(false)
    const [results, setResults]     = useState<ImportResult[]>([])
    const [error, setError]         = useState('')
    const fileRef = useRef<HTMLInputElement>(null)

    // Load groups when modal opens
    useEffect(() => {
        if (!open || !tenantId) return
        supabase.from('groups').select('id, name').eq('tenant_id', tenantId).order('name')
            .then(({ data }) => setGroups(data ?? []))
    }, [open, tenantId])

    function detectSeparator(line: string) {
        if (line.includes(';')) return ';'
        if (line.includes('\t')) return '\t'
        return ','
    }

    function parseRaw(text: string) {
        const clean = text.replace(/^﻿/, '').trim()
        const lines = clean.split('\n').filter(l => l.trim())
        if (!lines.length) return { headers: [], rows: [] }

        const sep = detectSeparator(lines[0])
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''))

        const rows = lines.slice(1).map(line => {
            const values: string[] = []
            let current = ''
            let inQuotes = false
            for (const char of line) {
                if (char === '"') { inQuotes = !inQuotes }
                else if (char === sep && !inQuotes) { values.push(current.trim()); current = '' }
                else { current += char }
            }
            values.push(current.trim())
            const row: Record<string, string> = {}
            headers.forEach((h, i) => { row[h] = values[i]?.replace(/"/g, '').trim() ?? '' })
            return row
        }).filter(r => Object.values(r).some(v => v))

        return { headers, rows }
    }

    function autoMap(headers: string[]): Record<string, string> {
        const map: Record<string, string> = {}
        const aliases: Record<string, string[]> = {
            voornaam:   ['voornaam', 'firstname', 'first_name', 'naam', 'name', 'prenom', 'prénom'],
            achternaam: ['achternaam', 'lastname', 'last_name', 'familienaam', 'surname', 'nom'],
            email:      ['email', 'e-mail', 'emailadres', 'mail', 'courriel'],
            rol:        ['rol', 'role', 'type', 'functie'],
            groep:      ['groep', 'group', 'klas', 'class', 'classe', 'groupe'],
        }
        SYSTEM_FIELDS.forEach(field => {
            const match = headers.find(h => aliases[field.key]?.includes(h.toLowerCase().trim()))
            if (match) map[field.key] = match
        })
        return map
    }

    function handleFile(file: File | null) {
        if (!file) return
        if (!file.name.endsWith('.csv')) { setError('Enkel CSV bestanden zijn toegestaan.'); return }
        setError('')
        const reader = new FileReader()
        reader.onload = e => {
            try {
                const { headers, rows } = parseRaw(e.target?.result as string)
                if (!rows.length) { setError('Geen geldige rijen gevonden.'); return }
                setRawHeaders(headers)
                setRawRows(rows)
                setMapping(autoMap(headers))
                setStep('mapping')
            } catch { setError('Fout bij het lezen van het bestand.') }
        }
        reader.readAsText(file)
    }

    function applyMapping() {
        const missing = SYSTEM_FIELDS
            .filter(f => f.required && !mapping[f.key])
            .map(f => f.label)
        if (missing.length) { setError(`Verplichte velden niet gekoppeld: ${missing.join(', ')}`); return }

        const mapped = rawRows.map(row => ({
            voornaam:   mapping.voornaam   ? row[mapping.voornaam]   || '' : '',
            achternaam: mapping.achternaam ? row[mapping.achternaam] || '' : '',
            email:      mapping.email      ? row[mapping.email]      || '' : '',
            rol:        mapping.rol        ? row[mapping.rol]        || 'student' : 'student',
            groep:      mapping.groep      ? row[mapping.groep]      || '' : '',
        })).filter(r => r.email && r.email.includes('@'))

        if (!mapped.length) { setError('Geen geldige e-mailadressen gevonden.'); return }

        if (mapped.length > MAX_IMPORT_ROWS) {
            setError(`Te veel rijen (${mapped.length}). Maximum is ${MAX_IMPORT_ROWS} per import. Splits het bestand op in meerdere bestanden.`)
            return
        }

        setMappedRows(mapped)
        setError('')
        setStep('preview')
    }

    function normalizeRole(rol: string) {
        const r = rol.toLowerCase()
        if (['teacher','leerkracht','prof','leraar'].includes(r)) return 'teacher'
        if (['admin','beheerder'].includes(r)) return 'admin'
        if (['leerlingenbegeleiding','begeleider','begeleiding','counselor'].includes(r)) return 'leerlingenbegeleiding'
        return 'student'
    }

    function findGroup(name: string) {
        return groups.find(g => g.name.toLowerCase() === name.toLowerCase())
    }

    async function handleImport() {
        setLoading(true)
        const importResults: ImportResult[] = []

        // Fetch the session once before the loop — calling getSession() per row
        // is unnecessary overhead and risks using a stale token mid-import if the
        // tab is open long enough for a token refresh to occur between calls.
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) {
            setError('Sessie verlopen. Herlaad de pagina en probeer opnieuw.')
            setLoading(false)
            return
        }

        for (const row of mappedRows) {
            try {
                const role  = normalizeRole(row.rol)
                const group = row.groep ? findGroup(row.groep) : null

                const res = await fetch('/api/invite', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        email:      row.email.toLowerCase(),
                        first_name: row.voornaam,
                        last_name:  row.achternaam,
                        role,
                        tenant_id:  tenantId,
                        group_id:   role === 'student' ? (group?.id ?? null) : null,
                        class_role: role,
                    }),
                })

                const data = await res.json()
                if (!res.ok) {
                    importResults.push({ email: row.email, status: 'error', message: data.error })
                    continue
                }

                importResults.push({
                    email: row.email,
                    status: 'success',
                    message: group ? `Ingeschreven in groep ${group.name}` : 'Account aangemaakt',
                })

                await new Promise(r => setTimeout(r, 300))
            } catch (e: any) {
                importResults.push({ email: row.email, status: 'error', message: e.message })
            }
        }

        setResults(importResults)
        setStep('done')
        setLoading(false)
        onImported()
    }

    function reset() {
        setStep('upload')
        setRawHeaders([])
        setRawRows([])
        setMapping({})
        setMappedRows([])
        setResults([])
        setError('')
    }

    const successCount = results.filter(r => r.status === 'success').length
    const errorCount   = results.filter(r => r.status === 'error').length

    return (
        <>
            <button onClick={() => setOpen(true)} className="btn-secondary text-xs py-1.5 px-3">
                <Upload size={13}/> CSV importeren
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                         onClick={() => { if (!loading) { setOpen(false); reset() } }}/>
                    <div className="relative bg-white rounded-2xl shadow-modal w-full max-w-2xl animate-slide-up">

                        {/* Header */}
                        <div className="flex items-center justify-between p-6 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
                                    <Upload size={16} className="text-primary-600"/>
                                </div>
                                <div>
                                    <h2 className="font-semibold text-gray-900">Gebruikers importeren</h2>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {['Upload','Kolommen','Controleer','Klaar'].map((s, i) => (
                                            <div key={s} className="flex items-center gap-1.5">
                                                <span className={`text-xs ${
                                                    ['upload','mapping','preview','done'].indexOf(step) >= i
                                                        ? 'text-primary-600 font-medium' : 'text-gray-400'
                                                }`}>{s}</span>
                                                {i < 3 && <span className="text-gray-300 text-xs">›</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {!loading && (
                                <button onClick={() => { setOpen(false); reset() }}
                                        className="text-gray-400 hover:text-gray-600"><X size={18}/></button>
                            )}
                        </div>

                        {/* Step: Upload */}
                        {step === 'upload' && (
                            <div className="p-6">
                                <div onClick={() => fileRef.current?.click()}
                                     className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary-300 hover:bg-gray-50 transition-all">
                                    <FileText size={28} className="mx-auto text-gray-400 mb-3"/>
                                    <p className="text-sm font-medium text-gray-700">Sleep een CSV bestand of klik om te bladeren</p>
                                    <p className="text-xs text-gray-400 mt-1">Komma of puntkomma als scheidingsteken, UTF-8 encoding</p>
                                    <input ref={fileRef} type="file" accept=".csv" className="hidden"
                                           onChange={e => handleFile(e.target.files?.[0] ?? null)}/>
                                </div>
                                {error && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
                                <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-border">
                                    <p className="text-xs font-medium text-gray-600 mb-2">Voorbeeldformaat — kolomnamen worden in de volgende stap gekoppeld:</p>
                                    <code className="text-xs text-gray-500 block leading-relaxed">
                                        Voornaam;Naam;Email;Groep<br/>
                                        Ahmed;Hassan;ahmed@email.be;Groep 1<br/>
                                        Fatima;Nour;fatima@email.be;Groep 2
                                    </code>
                                    <p className="text-xs text-gray-400 mt-2">
                                        Leerlingen worden automatisch ingeschreven in alle vakken van hun groep.
                                        {groups.length > 0 && ` Beschikbare groepen: ${groups.map(g => g.name).join(', ')}.`}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Step: Mapping */}
                        {step === 'mapping' && (
                            <div className="p-6">
                                <p className="text-sm text-gray-600 mb-4">
                                    Koppel de kolommen uit uw bestand aan de velden van het systeem.
                                    <span className="ml-1 text-primary-600 font-medium">{rawRows.length} rijen gevonden.</span>
                                </p>
                                <div className="space-y-3">
                                    {SYSTEM_FIELDS.map(field => (
                                        <div key={field.key} className="flex items-center gap-3">
                                            <div className="w-32 flex-shrink-0">
                                                <span className="text-sm font-medium text-gray-700">{field.label}</span>
                                                {field.required
                                                    ? <span className="ml-1 text-red-500 text-xs">*</span>
                                                    : <span className="ml-1 text-gray-400 text-xs">(optioneel)</span>
                                                }
                                            </div>
                                            <ArrowRight size={14} className="text-gray-300 flex-shrink-0"/>
                                            <select
                                                value={mapping[field.key] || ''}
                                                onChange={e => setMapping(p => ({ ...p, [field.key]: e.target.value }))}
                                                className="input flex-1"
                                            >
                                                <option value="">— Niet koppelen —</option>
                                                {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                                            </select>
                                            {mapping[field.key] && (
                                                <span className="text-xs text-gray-400 flex-shrink-0 max-w-24 truncate">
                                                    bijv. {rawRows[0]?.[mapping[field.key]] || '—'}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                {error && <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}
                                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700">
                                    <strong>Rol:</strong> gebruik "student", "leerling", "teacher" of "leerkracht". Onbekende waarden → leerling.<br/>
                                    <strong>Groep:</strong> naam moet exact overeenkomen met een bestaande groep. Leerlingen worden automatisch ingeschreven in alle vakken.
                                </div>
                            </div>
                        )}

                        {/* Step: Preview */}
                        {step === 'preview' && (
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm text-gray-600">
                                        <span className="font-semibold text-gray-900">{mappedRows.length} gebruikers</span> klaar om te importeren
                                    </p>
                                    <button onClick={() => setStep('mapping')} className="text-xs text-gray-400 hover:text-gray-600">
                                        Mapping aanpassen
                                    </button>
                                </div>
                                <div className="border border-border rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-gray-50 border-b border-border">
                                        <tr>
                                            {['Voornaam','Achternaam','E-mail','Rol','Groep'].map(h => (
                                                <th key={h} className="text-left px-3 py-2.5 font-medium text-gray-600">{h}</th>
                                            ))}
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                        {mappedRows.map((r, i) => {
                                            const group = r.groep ? findGroup(r.groep) : null
                                            return (
                                                <tr key={i} className="hover:bg-gray-50">
                                                    <td className="px-3 py-2">{r.voornaam || <span className="text-red-400">—</span>}</td>
                                                    <td className="px-3 py-2">{r.achternaam || <span className="text-red-400">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500">{r.email}</td>
                                                    <td className="px-3 py-2">
                                                        <span className={`badge ${normalizeRole(r.rol) === 'teacher' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                                            {normalizeRole(r.rol) === 'teacher' ? 'Leerkracht' : 'Leerling'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        {r.groep
                                                            ? group
                                                                ? <span className="text-green-600">{r.groep}</span>
                                                                : <span className="text-amber-500" title="Groep niet gevonden">{r.groep} ⚠</span>
                                                            : <span className="text-gray-400">—</span>
                                                        }
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                                {IMPORT_DISABLED && (
                                    <div className="mt-3 p-3 bg-orange-50 border border-orange-300 rounded-xl text-xs text-orange-700 font-medium">
                                        Import is tijdelijk uitgeschakeld tijdens de demofase. Er worden geen accounts aangemaakt of uitnodigingsmails verstuurd.
                                    </div>
                                )}
                                {!IMPORT_DISABLED && (
                                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                                        Elke gebruiker ontvangt een uitnodigingsmail. Oranje groepsnamen worden niet herkend — maak eerst de groep aan in Beheer.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Step: Done */}
                        {step === 'done' && (
                            <div className="p-6">
                                <div className="grid grid-cols-2 gap-4 mb-5">
                                    <div className="p-4 bg-green-50 border border-green-200 rounded-xl text-center">
                                        <div className="text-2xl font-semibold text-green-700">{successCount}</div>
                                        <div className="text-xs text-green-600 mt-1">Succesvol aangemaakt</div>
                                    </div>
                                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
                                        <div className="text-2xl font-semibold text-red-700">{errorCount}</div>
                                        <div className="text-xs text-red-600 mt-1">Mislukt</div>
                                    </div>
                                </div>
                                {errorCount > 0 && (
                                    <div className="border border-border rounded-xl overflow-hidden max-h-48 overflow-y-auto mb-4">
                                        <div className="px-4 py-2.5 bg-gray-50 border-b border-border">
                                            <p className="text-xs font-medium text-gray-600">Mislukte accounts</p>
                                        </div>
                                        {results.filter(r => r.status === 'error').map((r, i) => (
                                            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0">
                                                <AlertCircle size={14} className="text-red-500 flex-shrink-0"/>
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-xs font-medium text-gray-800">{r.email}</div>
                                                    <div className="text-xs text-red-500">{r.message}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div className="flex items-center gap-2 text-sm text-green-700">
                                    <CheckCircle2 size={16}/>
                                    Import voltooid — nieuwe gebruikers ontvangen een uitnodigingsmail.
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex gap-3 p-6 border-t border-border">
                            {step === 'upload' && (
                                <button onClick={() => { setOpen(false); reset() }} className="btn-secondary flex-1 justify-center">Annuleren</button>
                            )}
                            {step === 'mapping' && (
                                <>
                                    <button onClick={reset} className="btn-secondary flex-1 justify-center">Terug</button>
                                    <button onClick={applyMapping} className="btn-primary flex-1 justify-center">Doorgaan naar preview</button>
                                </>
                            )}
                            {step === 'preview' && (
                                <>
                                    <button onClick={() => setStep('mapping')} className="btn-secondary flex-1 justify-center">Terug</button>
                                    {IMPORT_DISABLED ? (
                                        <button disabled className="btn-primary flex-1 justify-center opacity-50 cursor-not-allowed" title="Tijdelijk uitgeschakeld tijdens demofase">
                                            Import uitgeschakeld
                                        </button>
                                    ) : (
                                        <button onClick={handleImport} disabled={loading} className="btn-primary flex-1 justify-center">
                                            {loading
                                                ? <><Loader2 size={15} className="animate-spin"/> Importeren… ({mappedRows.length} accounts)</>
                                                : `${mappedRows.length} gebruikers importeren`
                                            }
                                        </button>
                                    )}
                                </>
                            )}
                            {step === 'done' && (
                                <button onClick={() => { setOpen(false); reset() }} className="btn-primary flex-1 justify-center">Sluiten</button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
