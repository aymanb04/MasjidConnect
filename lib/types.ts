// ============================================================
// MasjidConnect — TypeScript Types
// ============================================================

export type Role = 'super_admin' | 'admin' | 'teacher' | 'student'
export type SubmissionStatus = 'draft' | 'submitted' | 'graded' | 'returned'
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
  avatar_url?: string
  phone?: string
  is_active: boolean
  last_seen_at?: string
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
  name: string
  description?: string
  color: string
  icon: string
  is_archived: boolean
  created_at: string
  updated_at: string
  // joined
  school_year?: SchoolYear
  teacher_count?: number
  student_count?: number
  teachers?: Profile[]
  students?: Profile[]
}

export interface Assignment {
  id: string
  class_id: string
  created_by: string
  title: string
  description?: string
  due_date?: string
  max_score?: number
  allow_text_submission: boolean
  allow_file_submission: boolean
  is_published: boolean
  created_at: string
  updated_at: string
  // joined
  class?: Class
  creator?: Profile
  submission_count?: number
  my_submission?: Submission
}

export interface Submission {
  id: string
  assignment_id: string
  student_id: string
  text_content?: string
  status: SubmissionStatus
  submitted_at: string
  updated_at: string
  // joined
  assignment?: Assignment
  student?: Profile
  files?: SubmissionFile[]
  feedback?: SubmissionFeedback
}

export interface SubmissionFile {
  id: string
  submission_id: string
  file_name: string
  file_url: string
  file_size?: number
  file_type?: string
  uploaded_at: string
}

export interface SubmissionFeedback {
  id: string
  submission_id: string
  teacher_id: string
  score?: number
  comment?: string
  created_at: string
  updated_at: string
  teacher?: Profile
}

export interface LessonModule {
  id: string
  class_id: string
  created_by: string
  title: string
  description?: string
  is_visible: boolean
  order_index: number
  created_at: string
  updated_at: string
  // joined
  documents?: ModuleDocument[]
  creator?: Profile
}

export interface ModuleDocument {
  id: string
  module_id: string
  title: string
  file_name: string
  file_url: string
  file_size?: number
  file_type?: string
  order_index: number
  uploaded_at: string
}

export interface Invitation {
  id: string
  tenant_id: string
  email: string
  role: 'admin' | 'teacher' | 'student'
  class_id?: string
  token: string
  invited_by: string
  accepted_at?: string
  expires_at: string
  created_at: string
}

export interface Announcement {
  id: string
  tenant_id: string
  class_id?: string
  created_by: string
  title: string
  body?: string
  created_at: string
  // joined
  creator?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  class?: Pick<Class, 'id' | 'name' | 'color'>
}

// ============================================================
// UI / utility types
// ============================================================
export interface NavItem {
  label: string
  href: string
  icon: string
  roles: Role[]
  badge?: number
}

export interface DashboardStat {
  label: string
  value: string | number
  icon: string
  color: string
  change?: string
}
