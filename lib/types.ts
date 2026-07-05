// ============================================================
// MasjidConnect — TypeScript Types
// ============================================================

export type Role = 'super_admin' | 'admin' | 'teacher' | 'student' | 'leerlingenbegeleiding'
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
  avatar_url?: string
  phone?: string
  is_active: boolean
  // GDPR erasure flag — set by /api/user/anonymize. Irreversible.
  is_anonymized: boolean
  // Voorwaarden acceptance — see lib/terms.ts + /akkoord gate
  terms_accepted_at?: string
  terms_version?: number
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

export interface AttendanceSession {
  id: string
  class_id: string
  teacher_id: string
  session_date: string
  notes?: string
  created_at: string
  // joined
  class?: Pick<Class, 'id' | 'name' | 'color'>
  teacher?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  records?: AttendanceRecord[]
}

export interface AttendanceRecord {
  id: string
  session_id: string
  student_id: string
  status: AttendanceStatus
  note?: string
  // joined
  student?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
}

export interface StudentReport {
  id: string
  tenant_id: string
  student_id: string
  class_id: string
  school_year_id: string
  uploaded_by: string
  semester: 1 | 2
  file_name: string
  file_url: string
  file_size?: number
  file_type?: string
  created_at: string
  // joined
  student?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  uploader?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
}

export interface ExamScore {
  id: string
  class_id: string
  student_id: string
  semester: 1 | 2
  score: number
  max_score: number
  notes?: string
  created_at: string
  updated_at: string
}

export type RapportStatus = 'draft' | 'published'

export interface RapportCard {
  id: string
  tenant_id: string
  student_id: string
  school_year_id: string
  semester: 1 | 2
  status: RapportStatus
  level_snapshot?: string
  generated_by?: string
  published_by?: string
  created_at: string
  updated_at: string
  published_at?: string
  // joined
  student?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  lines?: RapportLine[]
}

export interface RapportLine {
  id: string
  rapport_card_id: string
  class_id: string
  subject_snapshot?: string
  result?: number | null
  comment?: string
  updated_by?: string
  updated_at: string
  // joined
  class?: Pick<Class, 'id' | 'name' | 'color'>
}

export interface Family {
  id: string
  tenant_id: string
  label: string
  created_at: string
}

export interface StudentDetails {
  student_id: string
  tenant_id: string
  date_of_birth?: string
  gender?: 'm' | 'f'
  address?: string
  parent_email?: string
  parent_phone?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  family_id?: string
  created_at: string
  updated_at: string
  // joined
  family?: Family
}

export interface StudentNote {
  id: string
  tenant_id: string
  student_id: string
  author_id: string
  body: string
  created_at: string
  // joined
  author?: Pick<Profile, 'id' | 'first_name' | 'last_name' | 'role'>
}

export interface StudentDocument {
  id: string
  tenant_id: string
  student_id: string
  doc_type: 'contract' | 'disability' | 'other'
  file_name: string
  file_url: string
  note?: string
  uploaded_by: string
  created_at: string
}

export interface OudercontactSlot {
  id: string
  tenant_id: string
  teacher_id: string
  class_id?: string
  starts_at: string
  ends_at: string
  capacity: number
  note?: string
  created_at: string
  // joined
  teacher?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
  class?: Pick<Class, 'id' | 'name' | 'color'>
  bookings?: OudercontactBooking[]
}

export interface OudercontactBooking {
  id: string
  slot_id: string
  student_id: string
  booked_by: string
  note?: string
  created_at: string
  // joined
  student?: Pick<Profile, 'id' | 'first_name' | 'last_name'>
}

export interface Feedback {
  id: string
  tenant_id?: string
  user_id: string
  user_name?: string
  user_role?: string
  type: 'bug' | 'suggestie' | 'vraag'
  message: string
  page_url?: string
  is_read: boolean
  created_at: string
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
