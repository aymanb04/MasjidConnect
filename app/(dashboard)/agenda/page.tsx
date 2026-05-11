'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase/singleton'
import { useProfile } from '@/lib/hooks/useProfile'
import { PageLoader } from '@/components/ui/PageShell'
import { getDeadlineLabel } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

const DAY_HEADERS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function daysInMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

function mondayOffset(d: Date) {
  const day = d.getDay()
  return day === 0 ? 6 : day - 1
}

export default function AgendaPage() {
  const { profile, loading: profileLoading } = useProfile()
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!profile) return
    setLoading(true)
    loadAssignments()
  }, [profile])

  async function loadAssignments() {
    const supabase = getSupabase()
    let data: any[] = []

    if (profile!.role === 'student') {
      const { data: enr } = await supabase
        .from('class_students')
        .select('class_id')
        .eq('student_id', profile!.id)
      const ids = enr?.map((e: any) => e.class_id) ?? []
      if (ids.length > 0) {
        const { data: a } = await supabase
          .from('assignments')
          .select('*, classes(name, color)')
          .in('class_id', ids)
          .eq('is_published', true)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        data = a ?? []
      }
    } else if (profile!.role === 'teacher') {
      const { data: t } = await supabase
        .from('class_teachers')
        .select('class_id')
        .eq('teacher_id', profile!.id)
      const ids = t?.map((x: any) => x.class_id) ?? []
      if (ids.length > 0) {
        const { data: a } = await supabase
          .from('assignments')
          .select('*, classes(name, color)')
          .in('class_id', ids)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        data = a ?? []
      }
    } else {
      const { data: cls } = await supabase
        .from('classes')
        .select('id')
        .eq('tenant_id', profile!.tenant_id)
        .eq('is_archived', false)
      const ids = cls?.map((c: any) => c.id) ?? []
      if (ids.length > 0) {
        const { data: a } = await supabase
          .from('assignments')
          .select('*, classes(name, color)')
          .in('class_id', ids)
          .not('due_date', 'is', null)
          .order('due_date', { ascending: true })
        data = a ?? []
      }
    }

    setAssignments(data)
    setLoading(false)
  }

  if (profileLoading || loading) return <PageLoader />

  const today = new Date()
  const totalDays = daysInMonth(currentMonth)
  const offset = mondayOffset(currentMonth)

  const assignmentsByDay: Record<number, any[]> = {}
  assignments.forEach(a => {
    if (!a.due_date) return
    const d = new Date(a.due_date)
    if (d.getFullYear() === currentMonth.getFullYear() && d.getMonth() === currentMonth.getMonth()) {
      const day = d.getDate()
      if (!assignmentsByDay[day]) assignmentsByDay[day] = []
      assignmentsByDay[day].push(a)
    }
  })

  const monthLabel = currentMonth.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  const monthLabelCapitalized = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  function prevMonth() {
    setSelectedDay(null)
    setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() - 1, 1)))
  }
  function nextMonth() {
    setSelectedDay(null)
    setCurrentMonth(m => startOfMonth(new Date(m.getFullYear(), m.getMonth() + 1, 1)))
  }
  function toggleDay(day: number) {
    setSelectedDay(prev => (prev === day ? null : day))
  }

  const todayYear = today.getFullYear()
  const todayMonth = today.getMonth()
  const todayDay = today.getDate()
  const isCurrentMonthView = todayYear === currentMonth.getFullYear() && todayMonth === currentMonth.getMonth()

  let listAssignments: any[]
  if (selectedDay !== null) {
    listAssignments = (assignmentsByDay[selectedDay] ?? [])
  } else {
    const todayStr = today.toISOString().slice(0, 10)
    listAssignments = assignments
      .filter(a => a.due_date && a.due_date >= todayStr)
      .slice(0, 25)
  }

  const cells = Array.from({ length: offset + totalDays })

  return (
    <div className="animate-slide-up">
      <div className="page-header">
        <h1 className="page-title">Agenda</h1>
        <p className="page-subtitle">Overzicht van geplande deadlines</p>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-center justify-between mb-5">
          <button onClick={prevMonth} className="btn-secondary p-2" aria-label="Vorige maand">
            <ChevronLeft size={18} />
          </button>
          <span className="font-semibold text-gray-900 text-base">{monthLabelCapitalized}</span>
          <button onClick={nextMonth} className="btn-secondary p-2" aria-label="Volgende maand">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-2">
          {DAY_HEADERS.map(h => (
            <div key={h} className="text-center text-xs font-medium text-gray-400 py-1">{h}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {cells.map((_, i) => {
            const day = i - offset + 1
            if (day < 1) return <div key={i} />
            const isToday = isCurrentMonthView && day === todayDay
            const isSelected = selectedDay === day
            const hasDot = !!assignmentsByDay[day]?.length
            return (
              <button
                key={i}
                onClick={() => toggleDay(day)}
                className={[
                  'flex flex-col items-center justify-center rounded-xl h-10 w-full text-sm font-medium transition-colors',
                  isSelected
                    ? 'bg-primary-600 text-white'
                    : isToday
                    ? 'bg-primary-50 text-primary-700'
                    : 'hover:bg-gray-100 text-gray-700',
                ].join(' ')}
              >
                <span>{day}</span>
                {hasDot && (
                  <span
                    className={[
                      'w-1 h-1 rounded-full mt-0.5',
                      isSelected ? 'bg-white' : 'bg-primary-500',
                    ].join(' ')}
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card p-6">
        <h2 className="font-semibold text-gray-900 mb-4">
          {selectedDay !== null
            ? `${selectedDay} ${currentMonth.toLocaleDateString('nl-BE', { month: 'long' })}`
            : 'Komende taken'}
        </h2>
        {listAssignments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Geen taken gepland.</p>
        ) : (
          <div className="space-y-2">
            {listAssignments.map(a => {
              const dl = getDeadlineLabel(a.due_date)
              const color = a.classes?.color ?? '#1B6B4A'
              return (
                <Link
                  key={a.id}
                  href={`/huiswerk/${a.id}`}
                  className="flex items-center gap-3 p-3.5 rounded-xl border border-border hover:border-primary-200 hover:bg-primary-50/30 transition-all group"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-800 group-hover:text-primary-700 truncate">
                      {a.title}
                    </div>
                    <div className="text-xs text-gray-400">{a.classes?.name}</div>
                  </div>
                  <span className={`text-xs font-medium flex-shrink-0 ${dl.color}`}>{dl.label}</span>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
