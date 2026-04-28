import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from 'date-fns'
import { nl } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date): string {
  return format(new Date(date), 'd MMMM yyyy', { locale: nl })
}

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'd MMM yyyy, HH:mm', { locale: nl })
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNow(new Date(date), { addSuffix: true, locale: nl })
}

export function getDeadlineLabel(dueDate: string | null | undefined): {
  label: string
  color: string
} {
  if (!dueDate) return { label: 'Geen deadline', color: 'text-gray-400' }
  const d = new Date(dueDate)
  if (isPast(d))    return { label: `Te laat — ${formatDate(d)}`, color: 'text-red-500' }
  if (isToday(d))   return { label: 'Vandaag',    color: 'text-amber-500' }
  if (isTomorrow(d)) return { label: 'Morgen',    color: 'text-amber-400' }
  return { label: formatDate(d), color: 'text-gray-500' }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function getInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
}

export function getRoleBadge(role: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    super_admin: { label: 'Super Admin', color: 'bg-navy-100 text-navy-700' },
    admin:       { label: 'Beheerder',   color: 'bg-primary-100 text-primary-700' },
    teacher:     { label: 'Leerkracht',  color: 'bg-blue-100 text-blue-700' },
    student:     { label: 'Leerling',    color: 'bg-amber-100 text-amber-700' },
  }
  return map[role] ?? { label: role, color: 'bg-gray-100 text-gray-600' }
}

export function getSubmissionStatusBadge(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    draft:     { label: 'Concept',    color: 'bg-gray-100 text-gray-600' },
    submitted: { label: 'Ingediend', color: 'bg-blue-100 text-blue-700' },
    graded:    { label: 'Beoordeeld', color: 'bg-primary-100 text-primary-700' },
    returned:  { label: 'Teruggegeven', color: 'bg-amber-100 text-amber-700' },
  }
  return map[status] ?? { label: status, color: 'bg-gray-100 text-gray-600' }
}

export function getFileIcon(fileType: string | undefined): string {
  if (!fileType) return '📄'
  if (fileType.includes('pdf'))   return '📕'
  if (fileType.includes('word') || fileType.includes('document')) return '📘'
  if (fileType.includes('image')) return '🖼️'
  if (fileType.includes('excel') || fileType.includes('sheet'))   return '📗'
  return '📄'
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]/g, '')
    .replace(/-+/g, '-')
    .trim()
}
