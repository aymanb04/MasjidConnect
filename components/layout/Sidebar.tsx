'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { cn, getInitials } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { LayoutDashboard, BookOpen, FileText, GraduationCap, Settings, LogOut, Shield, ChevronRight } from 'lucide-react'

interface Props { profile: Profile; tenantName?: string }

const navItems = [
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard, roles: ['super_admin','admin','teacher','student'] },
  { label: 'Klassen',     href: '/klassen',     icon: GraduationCap,   roles: ['admin','teacher','student'] },
  { label: 'Huiswerk',    href: '/huiswerk',    icon: FileText,        roles: ['teacher','student'] },
  { label: 'Lesmodules',  href: '/lesmodules',  icon: BookOpen,        roles: ['teacher','student'] },
  { label: 'Beheer',      href: '/beheer',      icon: Settings,        roles: ['admin'] },
  { label: 'Super Admin', href: '/superadmin',  icon: Shield,          roles: ['super_admin'] },
]

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Beheerder', teacher: 'Leerkracht', student: 'Leerling'
}

export default function Sidebar({ profile, tenantName }: Props) {
  const pathname  = usePathname()
  const router    = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const filtered = navItems.filter(item => item.roles.includes(profile.role))

  return (
    <aside className="w-[240px] bg-white border-r border-border flex flex-col h-screen sticky top-0 flex-shrink-0">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#1B6B4A' }}>
            <span className="text-white font-bold text-sm">م</span>
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 text-sm leading-tight">MasjidConnect</div>
            {tenantName && <div className="text-xs text-gray-400 truncate leading-tight mt-0.5">{tenantName}</div>}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {filtered.map(item => {
          const Icon   = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href}
              className={cn('nav-item', active && 'active')}>
              <Icon size={17} className="flex-shrink-0" />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={14} className="text-primary-400" />}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}>
            {getInitials(profile.first_name, profile.last_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">{profile.first_name} {profile.last_name}</div>
            <div className="text-xs text-gray-400">{roleLabels[profile.role]}</div>
          </div>
          <button onClick={handleLogout} className="text-gray-400 hover:text-red-500 transition-colors p-1" title="Afmelden">
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </aside>
  )
}
