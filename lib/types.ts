// ============================================================
// MasjidConnect — TypeScript Types
// ============================================================

export type Role = 'super_admin' | 'admin' | 'teacher' | 'student' | 'leerlingenbegeleiding'
export type SubscriptionStatus = 'trial' | 'active' | 'inactive' | 'cancelled'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

export interface Tenant {
  id: string
  name: string
  slug: string
  address?: string
  city?: string
  phone?: string
  email?: string
  logo_url?: string
  logo_icon_url?: string
  website_url?: string
  is_active: boolean
  subscription_status: SubscriptionStatus
  subscription_price: number
  subscription_interval: 'monthly' | 'yearly'
  trial_ends_at?: string
  notes?: string
  created_at: string
  updated_at: string
}

export interface Group {
  id: string
  tenant_id: string
  school_year_id: string
  name: string
  created_at: string
}

export interface SchoolYear {
  id: string
  tenant_id: string
  name: string
  start_date: string
  end_date: string
  is_active: boolean
  created_at: string
}

export interface Profile {
  id: string
  tenant_id?: string
  role: Role
  first_name: string
  last_name: string
  phone?: string
  is_active: boolean
  // GDPR erasure flag — set by /api/user/anonymize. Irreversible.
  is_anonymized: boolean
  // Start of the retention clock published in the privacyverklaring.
  // Set by /api/user/archive, cleared by /api/user/reactivate (migration 27).
  archived_at?: string | null
  // Voorwaarden acceptance — see lib/terms.ts + /akkoord gate
  terms_accepted_at?: string
  terms_version?: number
  // true = still on a password somebody else issued. The dashboard layout sends
  // them to /wachtwoord-instellen until they choose their own (migration 37).
  must_change_password?: boolean
  created_at: string
  updated_at: string
  // computed
  full_name?: string
  email?: string
}

export interface Class {
  id: string
  tenant_id: string
  school_year_id: string
  group_id?: string
  name: string
  description?: string
  color: string
  icon: string
  is_archived: boolean
  created_at: string
  updated_at: string
  // joined
  school_year?: SchoolYear
  group?: Group
  teacher_count?: number
  student_count?: number
  teachers?: Profile[]
  students?: Profile[]
}

export type AnnouncementAudience = 'school' | 'class' | 'group' | 'teachers'

export interface Announcement {
  id: string
  tenant_id: string
  class_id?: string
  group_id?: string
  audience: AnnouncementAudience
  created_by: string
  title: string
  content?: string
  created_at: string
  // joined
  creator?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  class?: Pick<Class, 'id' | 'name' | 'color'>
  group?: Pick<Group, 'id' | 'name'>
}
