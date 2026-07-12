'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase/singleton'
import { cn, getInitials } from '@/lib/utils'
import type { Profile, Tenant } from '@/lib/types'
import { LayoutDashboard, BookOpen, FileText, GraduationCap, Settings, LogOut, Shield, ChevronRight, ExternalLink, CalendarDays, Clock, Lock, ClipboardCheck, FolderOpen, Euro, CalendarClock, ScrollText } from 'lucide-react'

interface Props {
  profile: Profile
  tenant?: Tenant | null
  onClose?: () => void
}

const navItems = [
  { label: 'Dashboard',   href: '/dashboard',   icon: LayoutDashboard, roles: ['super_admin','admin','teacher','student','leerlingenbegeleiding'] },
  { label: 'Klassen',     href: '/klassen',     icon: GraduationCap,   roles: ['admin','teacher','student'] },
  { label: 'Huiswerk',    href: '/huiswerk',    icon: FileText,        roles: ['teacher','student'] },
  { label: 'Lesmodules',  href: '/lesmodules',  icon: BookOpen,        roles: ['teacher','student'] },
  { label: 'Aanwezigheid', href: '/aanwezigheid', icon: ClipboardCheck,  roles: ['admin','teacher','student'] },
  { label: 'Rooster',     href: '/rooster',      icon: Clock,           roles: ['admin','teacher','student'] },
  { label: 'Agenda',      href: '/agenda',       icon: CalendarDays,    roles: ['admin','teacher','student'] },
  { label: 'Oudercontact', href: '/oudercontact', icon: CalendarClock,  roles: ['admin','teacher','student'] },
  { label: 'Rapporten',   href: '/rapporten',    icon: ScrollText,      roles: ['admin','teacher','student','leerlingenbegeleiding'] },
  { label: 'Dossiers',    href: '/dossiers',     icon: FolderOpen,      roles: ['admin','teacher','leerlingenbegeleiding'] },
  { label: 'Betalingen',  href: '/betalingen',   icon: Euro,            roles: ['admin'] },
  { label: 'Beheer',      href: '/beheer',      icon: Settings,        roles: ['admin'] },
  { label: 'Super Admin', href: '/superadmin',  icon: Shield,          roles: ['super_admin'] },
]

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin', admin: 'Beheerder', teacher: 'Leerkracht', student: 'Leerling',
  leerlingenbegeleiding: 'Leerlingenbegeleiding',
}

export default function Sidebar({ profile, tenant, onClose }: Props) {
  const pathname = usePathname()

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const filtered = navItems.filter(item => item.roles.includes(profile.role))

  return (
    <aside
      className="w-[240px] bg-white border-r border-border flex flex-col h-full"
      style={{ paddingLeft: 'env(safe-area-inset-left, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden ${(tenant?.logo_icon_url || tenant?.logo_url) ? 'bg-white border border-border' : ''}`}
            style={(tenant?.logo_icon_url || tenant?.logo_url) ? undefined : { backgroundColor: '#1B6B4A' }}
          >
            {/* Prefer the square icon in this small slot; fall back to containing
                the full (often wide) logo, then the glyph. object-contain so a
                wide logo fits whole instead of being cropped. */}
            {tenant?.logo_icon_url ? (
              <img src={tenant.logo_icon_url} alt="" className="w-full h-full object-contain p-0.5" />
            ) : tenant?.logo_url ? (
              <img src={tenant.logo_url} alt="" className="w-full h-full object-contain p-0.5" />
            ) : (
              <span className="text-white font-bold text-sm">م</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-gray-900 text-sm leading-tight truncate">
              {tenant?.name ?? 'MasjidConnect'}
            </div>
            {tenant?.website_url ? (
              <a
                href={tenant.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-primary-600 transition-colors flex items-center gap-1 leading-tight mt-0.5"
                onClick={e => e.stopPropagation()}
              >
                Website <ExternalLink size={9} />
              </a>
            ) : (
              tenant?.name && (
                <div className="text-xs text-gray-400 leading-tight mt-0.5">MasjidConnect</div>
              )
            )}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        {filtered.map(item => {
          const Icon   = item.icon
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} onClick={onClose}
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
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
            style={{ backgroundColor: '#EEF6F1', color: '#1B6B4A' }}
          >
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
        <div className="flex items-center gap-3 mt-1">
          <Link href="/privacy" onClick={onClose}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <Lock size={11}/> Privacy
          </Link>
          <Link href="/voorwaarden" onClick={onClose}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
            <FileText size={11}/> Voorwaarden
          </Link>
        </div>
      </div>
    </aside>
  )
}
