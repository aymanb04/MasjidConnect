'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/singleton'
import { format, subDays } from 'date-fns'
import { nl } from 'date-fns/locale'
import Link from 'next/link'
import { AlertTriangle, CalendarX, ChevronRight } from 'lucide-react'

interface MissedItem {
  classId: string
  className: string
  date: string // yyyy-MM-dd
}

interface StreakItem {
  classId: string
  className: string
  studentName: string
}

// In-app attendance alerts for teachers/admins (feedback 2026-06-09):
// - rooster days in the past week without a marked attendance session
// - students absent in the last 2 sessions of a class
export function AttendanceAlertsCard({ profile }: { profile: any }) {
  const [missed,  setMissed]  = useState<MissedItem[]>([])
  const [streaks, setStreaks] = useState<StreakItem[]>([])
  const [loaded,  setLoaded]  = useState(false)

  useEffect(() => {
    if (profile) load()
  }, [profile])

  async function load() {
    // 1. Which classes does this user oversee?
    let classIds: string[] = []
    if (profile.role === 'teacher') {
      const { data } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', profile.id)
      classIds = (data ?? []).map((r: any) => r.class_id)
    } else {
      const { data } = await supabase
        .from('classes')
        .select('id')
        .eq('tenant_id', profile.tenant_id)
        .eq('is_archived', false)
      classIds = (data ?? []).map((r: any) => r.id)
    }
    if (classIds.length === 0) { setLoaded(true); return }

    const { data: classRows } = await supabase
      .from('classes')
      .select('id, name')
      .in('id', classIds)
      .eq('is_archived', false)
    const classNames = Object.fromEntries((classRows ?? []).map((c: any) => [c.id, c.name]))
    classIds = (classRows ?? []).map((c: any) => c.id)
    if (classIds.length === 0) { setLoaded(true); return }

    // 2. Marked sessions in the recent window (covers both checks)
    const cutoff = format(subDays(new Date(), 60), 'yyyy-MM-dd')
    const { data: sessions } = await supabase
      .from('attendance_sessions')
      .select('id, class_id, session_date')
      .in('class_id', classIds)
      .gte('session_date', cutoff)
      .order('session_date', { ascending: false })

    // 3. Missed rooster days, past 7 days (today only counts after the lesson ended)
    const { data: rooster } = await supabase
      .from('class_sessions')
      .select('class_id, day_of_week, end_time')
      .in('class_id', classIds)

    const marked = new Set((sessions ?? []).map((s: any) => `${s.class_id}|${s.session_date}`))
    const nowTime = format(new Date(), 'HH:mm:ss')
    const missedItems: MissedItem[] = []
    for (let offset = 0; offset <= 7; offset++) {
      const d = subDays(new Date(), offset)
      const dateStr = format(d, 'yyyy-MM-dd')
      const dow = (d.getDay() + 6) % 7 // JS sunday-first → rooster monday-first
      for (const r of (rooster ?? [])) {
        if (r.day_of_week !== dow) continue
        if (offset === 0 && nowTime < r.end_time) continue
        if (!marked.has(`${r.class_id}|${dateStr}`)) {
          missedItems.push({ classId: r.class_id, className: classNames[r.class_id] ?? '—', date: dateStr })
        }
      }
    }
    missedItems.sort((a, b) => b.date.localeCompare(a.date))

    // 4. Absent in the last 2 sessions of a class
    const lastTwoByClass: Record<string, { id: string }[]> = {}
    for (const s of (sessions ?? [])) {
      if (!lastTwoByClass[s.class_id]) lastTwoByClass[s.class_id] = []
      if (lastTwoByClass[s.class_id].length < 2) lastTwoByClass[s.class_id].push({ id: s.id })
    }
    const pairs = Object.entries(lastTwoByClass).filter(([, v]) => v.length === 2)
    const streakItems: StreakItem[] = []
    if (pairs.length > 0) {
      const sessionIds = pairs.flatMap(([, v]) => v.map(s => s.id))
      const { data: absents } = await supabase
        .from('attendance_records')
        .select('session_id, student_id')
        .eq('status', 'absent')
        .in('session_id', sessionIds)

      const absentSet = new Set((absents ?? []).map((r: any) => `${r.session_id}|${r.student_id}`))
      const flagged: { classId: string; studentId: string }[] = []
      for (const [classId, two] of pairs) {
        const studentsInLatest = (absents ?? [])
          .filter((r: any) => r.session_id === two[0].id)
          .map((r: any) => r.student_id)
        for (const studentId of studentsInLatest) {
          if (absentSet.has(`${two[1].id}|${studentId}`)) flagged.push({ classId, studentId })
        }
      }
      if (flagged.length > 0) {
        const studentIds = Array.from(new Set(flagged.map(f => f.studentId)))
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', studentIds)
        const nameMap = Object.fromEntries(
          (profiles ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`])
        )
        for (const f of flagged) {
          streakItems.push({
            classId: f.classId,
            className: classNames[f.classId] ?? '—',
            studentName: nameMap[f.studentId] ?? 'Onbekende leerling',
          })
        }
      }
    }

    setMissed(missedItems)
    setStreaks(streakItems)
    setLoaded(true)
  }

  if (!loaded || (missed.length === 0 && streaks.length === 0)) return null

  return (
    <div className="card p-5 mb-6 border-amber-200 bg-amber-50/40">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-500" />
          Aanwezigheid — aandachtspunten
        </h2>
        <Link href="/aanwezigheid" className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-0.5">
          Naar aanwezigheid <ChevronRight size={14} />
        </Link>
      </div>
      <div className="space-y-1.5">
        {missed.map(m => (
          <Link
            key={`${m.classId}_${m.date}`}
            href="/aanwezigheid"
            className="flex items-center gap-2.5 text-sm rounded-lg px-3 py-2 bg-white border border-amber-100 hover:border-amber-300 transition-colors"
          >
            <CalendarX size={15} className="text-amber-500 flex-shrink-0" />
            <span className="text-gray-700">
              Niet gemarkeerd: <span className="font-medium">{m.className}</span>
              {' — '}
              <span className="capitalize">{format(new Date(m.date), 'EEEE d MMMM', { locale: nl })}</span>
            </span>
          </Link>
        ))}
        {streaks.map((s, i) => (
          <div
            key={`${s.classId}_${s.studentName}_${i}`}
            className="flex items-center gap-2.5 text-sm rounded-lg px-3 py-2 bg-white border border-red-100"
          >
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
            <span className="text-gray-700">
              <span className="font-medium">{s.studentName}</span> was de laatste 2 sessies afwezig
              {' '}<span className="text-gray-400">({s.className})</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
