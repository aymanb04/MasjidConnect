'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { Euro, Users, Loader2, Check, X, Save, AlertCircle } from 'lucide-react'

type Tab = 'membership' | 'chart' | 'payroll'

const eur = (n: number) => `€ ${Number(n ?? 0).toFixed(2).replace('.', ',')}`

export default function BetalingenPage() {
  const { profile, loading: profileLoading } = useProfile()
  const router = useRouter()

  const [tab, setTab] = useState<Tab>('membership')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [year, setYear] = useState<any>(null)
  const [config, setConfig] = useState<any>(null)
  const [configForm, setConfigForm] = useState({ membership_amount: '', chart_amount: '', membership_due: '', chart_due: '' })
  const [savingConfig, setSavingConfig] = useState(false)

  const [students, setStudents] = useState<any[]>([])
  const [families, setFamilies] = useState<any[]>([])
  const [familyMembers, setFamilyMembers] = useState<Record<string, string[]>>({})
  const [payments, setPayments] = useState<any[]>([])

  const [teachers, setTeachers] = useState<any[]>([])
  const [rates, setRates] = useState<Record<string, string>>({})
  const [hours, setHours] = useState<Record<string, string>>({})
  const [payroll, setPayroll] = useState<any[]>([])
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [savingRow, setSavingRow] = useState<string | null>(null)

  const isAdmin = profile && ['admin', 'super_admin'].includes(profile.role)

  useEffect(() => {
    if (!profile) return
    if (!['admin', 'super_admin'].includes(profile.role)) { router.replace('/dashboard'); return }
    load()
  }, [profile])

  useEffect(() => {
    if (profile && isAdmin && year) loadPayroll()
  }, [month, year])

  async function load() {
    const tid = profile!.tenant_id
    const { data: yr } = await supabase
      .from('school_years').select('id, name')
      .eq('tenant_id', tid).eq('is_active', true)
      .limit(1).maybeSingle()
    if (!yr) { setLoading(false); return }
    setYear(yr)

    const [{ data: cfg }, { data: studs }, { data: fams }, { data: details }, { data: pays }, { data: staff }, { data: staffRates }] =
      await Promise.all([
        supabase.from('fee_config').select('*').eq('school_year_id', yr.id).eq('tenant_id', tid).maybeSingle(),
        supabase.from('profiles').select('id, first_name, last_name').eq('tenant_id', tid).eq('role', 'student').eq('is_active', true).order('last_name'),
        supabase.from('families').select('id, label').eq('tenant_id', tid).order('label'),
        supabase.from('student_details').select('student_id, family_id').eq('tenant_id', tid).not('family_id', 'is', null),
        supabase.from('fee_payments').select('*').eq('school_year_id', yr.id).eq('tenant_id', tid),
        supabase.from('profiles').select('id, first_name, last_name').eq('tenant_id', tid).eq('role', 'teacher').eq('is_active', true).order('last_name'),
        supabase.from('staff_pay').select('staff_id, hourly_rate').eq('tenant_id', tid),
      ])

    setConfig(cfg)
    setConfigForm({
      membership_amount: cfg?.membership_amount?.toString() ?? '',
      chart_amount: cfg?.chart_amount?.toString() ?? '',
      membership_due: cfg?.membership_due ?? '',
      chart_due: cfg?.chart_due ?? '',
    })
    setStudents(studs ?? [])
    setFamilies(fams ?? [])
    const fm: Record<string, string[]> = {}
    for (const d of (details ?? [])) {
      if (!fm[d.family_id]) fm[d.family_id] = []
      fm[d.family_id].push(d.student_id)
    }
    setFamilyMembers(fm)
    setPayments(pays ?? [])
    setTeachers(staff ?? [])
    setRates(Object.fromEntries((staffRates ?? []).map((r: any) => [r.staff_id, r.hourly_rate.toString()])))
    setLoading(false)
  }

  async function loadPayroll() {
    const { data } = await supabase
      .from('payroll_entries').select('*')
      .eq('tenant_id', profile!.tenant_id).eq('period_month', month)
    setPayroll(data ?? [])
    setHours(Object.fromEntries((data ?? []).map((e: any) => [e.staff_id, e.hours.toString()])))
  }

  async function saveConfig() {
    setSavingConfig(true)
    setError('')
    const { error: err } = await supabase.from('fee_config').upsert({
      tenant_id: profile!.tenant_id,
      school_year_id: year.id,
      membership_amount: parseFloat(configForm.membership_amount) || 0,
      chart_amount: parseFloat(configForm.chart_amount) || 0,
      membership_due: configForm.membership_due || null,
      chart_due: configForm.chart_due || null,
    }, { onConflict: 'tenant_id,school_year_id' })
    if (err) setError('Instellingen opslaan mislukt.')
    else {
      const { data: cfg } = await supabase.from('fee_config').select('*')
        .eq('school_year_id', year.id).eq('tenant_id', profile!.tenant_id).maybeSingle()
      setConfig(cfg)
    }
    setSavingConfig(false)
  }

  async function markPaid(feeType: 'membership' | 'chart', targetId: string) {
    setError('')
    const amount = feeType === 'membership'
      ? parseFloat(configForm.membership_amount) || 0
      : parseFloat(configForm.chart_amount) || 0
    const { error: err } = await supabase.from('fee_payments').insert({
      tenant_id: profile!.tenant_id,
      school_year_id: year.id,
      fee_type: feeType,
      student_id: feeType === 'membership' ? targetId : null,
      family_id: feeType === 'chart' ? targetId : null,
      amount,
      paid_at: format(new Date(), 'yyyy-MM-dd'),
    })
    if (err) { setError('Betaling registreren mislukt.'); return }
    const { data: pays } = await supabase.from('fee_payments').select('*')
      .eq('school_year_id', year.id).eq('tenant_id', profile!.tenant_id)
    setPayments(pays ?? [])
  }

  async function undoPayment(paymentId: string) {
    await supabase.from('fee_payments').delete().eq('id', paymentId)
    setPayments(prev => prev.filter(p => p.id !== paymentId))
  }

  async function savePayrollRow(staffId: string) {
    setSavingRow(staffId)
    setError('')
    const rate = parseFloat(rates[staffId] ?? '')
    const hrs = parseFloat(hours[staffId] ?? '')
    if (isNaN(rate) || rate < 0) { setError('Ongeldig uurtarief.'); setSavingRow(null); return }

    // Save the rate so it's remembered next month
    const { error: rateErr } = await supabase.from('staff_pay').upsert({
      staff_id: staffId, tenant_id: profile!.tenant_id, hourly_rate: rate,
    })
    if (rateErr) { setError('Tarief opslaan mislukt.'); setSavingRow(null); return }

    if (!isNaN(hrs) && hrs >= 0) {
      const { error: err } = await supabase.from('payroll_entries').upsert({
        tenant_id: profile!.tenant_id,
        staff_id: staffId,
        period_month: month,
        hours: hrs,
        rate_snapshot: rate,
        amount: Math.round(hrs * rate * 100) / 100,
      }, { onConflict: 'staff_id,period_month' })
      if (err) { setError('Loon opslaan mislukt.'); setSavingRow(null); return }
      await loadPayroll()
    }
    setSavingRow(null)
  }

  if (profileLoading || loading) return <PageLoader />
  if (!isAdmin) return null

  if (!year) {
    return (
      <div className="animate-slide-up max-w-3xl">
        <h1 className="page-title mb-2">Betalingen</h1>
        <div className="card p-8 text-center text-gray-400 text-sm">Geen actief schooljaar gevonden.</div>
      </div>
    )
  }

  const today = format(new Date(), 'yyyy-MM-dd')
  const membershipPaid = new Map(
    payments.filter(p => p.fee_type === 'membership' && p.paid_at).map(p => [p.student_id, p]))
  const chartPaid = new Map(
    payments.filter(p => p.fee_type === 'chart' && p.paid_at).map(p => [p.family_id, p]))
  const membershipOverdue = !!(configForm.membership_due && configForm.membership_due <= today)
  const chartOverdue = !!(configForm.chart_due && configForm.chart_due <= today)

  // KPIs
  const collected = payments.filter(p => p.paid_at).reduce((s, p) => s + Number(p.amount), 0)
  const membershipOutstanding = (students.length - membershipPaid.size) * (parseFloat(configForm.membership_amount) || 0)
  const chartOutstanding = (families.length - chartPaid.size) * (parseFloat(configForm.chart_amount) || 0)
  const payrollTotal = payroll.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div className="animate-slide-up max-w-4xl">
      <div className="page-header mb-6">
        <div>
          <h1 className="page-title">Betalingen</h1>
          <p className="page-subtitle">Lidgeld, Chart-bijdrage en lonen — {year.name}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Ontvangen', value: eur(collected), color: 'bg-primary-50 text-primary-600' },
          { label: 'Openstaand', value: eur(membershipOutstanding + chartOutstanding), color: 'bg-red-50 text-red-500' },
          { label: 'Lidgeld betaald', value: `${membershipPaid.size}/${students.length}`, color: 'bg-blue-50 text-blue-600' },
          { label: `Loon ${month}`, value: eur(payrollTotal), color: 'bg-amber-50 text-amber-600' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className={`stat-icon ${s.color}`}><Euro size={20} /></div>
            <div>
              <div className="text-xl font-semibold text-gray-900">{s.value}</div>
              <div className="text-sm text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600 mb-4">{error}</div>
      )}

      {/* Fee config */}
      <div className="card p-5 mb-6">
        <h2 className="font-semibold text-gray-900 mb-3">Tarieven {year.name}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label">Lidgeld / leerling</label>
            <input type="number" min="0" step="0.01" value={configForm.membership_amount}
              onChange={e => setConfigForm(p => ({ ...p, membership_amount: e.target.value }))} className="input" placeholder="0.00" />
          </div>
          <div>
            <label className="label">Vervaldatum lidgeld</label>
            <input type="date" value={configForm.membership_due}
              onChange={e => setConfigForm(p => ({ ...p, membership_due: e.target.value }))} className="input" />
          </div>
          <div>
            <label className="label">Chart / familie</label>
            <input type="number" min="0" step="0.01" value={configForm.chart_amount}
              onChange={e => setConfigForm(p => ({ ...p, chart_amount: e.target.value }))} className="input" placeholder="0.00" />
          </div>
          <div>
            <label className="label">Vervaldatum Chart</label>
            <input type="date" value={configForm.chart_due}
              onChange={e => setConfigForm(p => ({ ...p, chart_due: e.target.value }))} className="input" />
          </div>
        </div>
        <button onClick={saveConfig} disabled={savingConfig}
          className="btn-primary text-sm mt-3 flex items-center gap-1.5">
          {savingConfig ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Tarieven opslaan
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-4">
        {([['membership', 'Lidgeld'], ['chart', 'Chart (families)'], ['payroll', 'Lonen']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === key ? 'bg-primary-50 text-primary-700' : 'text-gray-500 hover:bg-gray-50'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Membership per student ── */}
      {tab === 'membership' && (
        <div className="card divide-y divide-border overflow-hidden">
          {students.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">Geen leerlingen.</p>}
          {students.map(s => {
            const pay = membershipPaid.get(s.id)
            const overdue = !pay && membershipOverdue
            return (
              <div key={s.id} className="flex items-center gap-3 p-3.5">
                <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                  {s.first_name?.[0]}{s.last_name?.[0]}
                </div>
                <span className="flex-1 text-sm font-medium text-gray-800 truncate">{s.first_name} {s.last_name}</span>
                {pay ? (
                  <>
                    <span className="badge bg-green-100 text-green-700 flex-shrink-0">
                      Betaald {format(new Date(pay.paid_at), 'd MMM', { locale: nl })} · {eur(pay.amount)}
                    </span>
                    <button onClick={() => undoPayment(pay.id)} title="Ongedaan maken"
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    {overdue && (
                      <span className="badge bg-red-100 text-red-600 flex items-center gap-1 flex-shrink-0">
                        <AlertCircle size={11} /> Vervallen
                      </span>
                    )}
                    <button onClick={() => markPaid('membership', s.id)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium transition-colors flex items-center gap-1 flex-shrink-0">
                      <Check size={11} /> Betaald
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Chart per family ── */}
      {tab === 'chart' && (
        <div className="card divide-y divide-border overflow-hidden">
          {families.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">
              Nog geen families. Wijs leerlingen toe aan een familie via hun dossier.
            </p>
          )}
          {families.map(f => {
            const pay = chartPaid.get(f.id)
            const members = familyMembers[f.id]?.length ?? 0
            const overdue = !pay && chartOverdue
            return (
              <div key={f.id} className="flex items-center gap-3 p-3.5">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Users size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-800">{f.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{members} leerling{members === 1 ? '' : 'en'}</span>
                </div>
                {pay ? (
                  <>
                    <span className="badge bg-green-100 text-green-700 flex-shrink-0">
                      Betaald {format(new Date(pay.paid_at), 'd MMM', { locale: nl })} · {eur(pay.amount)}
                    </span>
                    <button onClick={() => undoPayment(pay.id)} title="Ongedaan maken"
                      className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"><X size={14} /></button>
                  </>
                ) : (
                  <>
                    {overdue && (
                      <span className="badge bg-red-100 text-red-600 flex items-center gap-1 flex-shrink-0">
                        <AlertCircle size={11} /> Vervallen
                      </span>
                    )}
                    <button onClick={() => markPaid('chart', f.id)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium transition-colors flex items-center gap-1 flex-shrink-0">
                      <Check size={11} /> Betaald
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Payroll ── */}
      {tab === 'payroll' && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-sm text-gray-500">Maand:</label>
            <input type="month" value={month} onChange={e => e.target.value && setMonth(e.target.value)}
              className="input w-auto text-sm py-1.5" />
            <span className="ml-auto text-sm text-gray-500">
              Totaal: <span className="font-semibold text-gray-800">{eur(payrollTotal)}</span>
            </span>
          </div>
          <div className="card divide-y divide-border overflow-hidden">
            {teachers.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">Geen leerkrachten.</p>}
            {teachers.map(t => {
              const entry = payroll.find(e => e.staff_id === t.id)
              return (
                <div key={t.id} className="flex items-center gap-2 sm:gap-3 p-3.5 flex-wrap">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {t.first_name?.[0]}{t.last_name?.[0]}
                  </div>
                  <span className="flex-1 min-w-[120px] text-sm font-medium text-gray-800 truncate">
                    {t.first_name} {t.last_name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <input type="number" min="0" step="0.01" value={rates[t.id] ?? ''}
                      onChange={e => setRates(p => ({ ...p, [t.id]: e.target.value }))}
                      placeholder="€/u" className="input w-20 text-sm py-1.5" title="Uurtarief" />
                    <span className="text-xs text-gray-400">×</span>
                    <input type="number" min="0" step="0.25" value={hours[t.id] ?? ''}
                      onChange={e => setHours(p => ({ ...p, [t.id]: e.target.value }))}
                      placeholder="uren" className="input w-20 text-sm py-1.5" title={`Uren in ${month}`} />
                  </div>
                  <span className="text-sm font-semibold text-gray-700 w-20 text-right">
                    {entry ? eur(entry.amount) : '—'}
                  </span>
                  <button onClick={() => savePayrollRow(t.id)} disabled={savingRow === t.id}
                    className="text-xs px-2.5 py-1 rounded-lg border border-primary-200 bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium transition-colors flex items-center gap-1 flex-shrink-0">
                    {savingRow === t.id ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />} Opslaan
                  </button>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Het uurtarief wordt bewaard; het loon wordt berekend als uren × tarief op het moment van invoer.
          </p>
        </div>
      )}
    </div>
  )
}
