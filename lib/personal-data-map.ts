// ============================================================
// Where one person's data lives — declared once
// ============================================================
// Used by BOTH the erasure path (lib/gdpr-erasure.ts) and the export route
// (app/api/export). That pairing is deliberate: **what you can erase is exactly
// what you must be able to export.** Art. 15/17/20 read the same footprint. If
// the two lists drift, one of them is silently wrong — an export that misses a
// table answers a subject access request incompletely, and an erasure that
// misses one leaves data behind.
//
// Adding a table that holds personal data? Add it here, and both paths pick it
// up. That is the whole point of this file existing.

/** Rows that are wholly about one person — deleted on erasure, exported in full. */
export const OWNED_TABLES = [
  { table: 'student_details',      key: 'student_id' },
  { table: 'student_notes',        key: 'student_id' },
  { table: 'feedback',             key: 'user_id'    },
  { table: 'tenant_document_acks', key: 'user_id'    },
  // Free text about one pupil's progress ("begonnen bij / doel / nu"). It has
  // no use for the school's statistics once the name is gone.
  { table: 'student_goals',        key: 'student_id' },
  // A staff member's current hourly rate. Not a bookkeeping record: every
  // payroll entry keeps its own rate_snapshot.
  { table: 'staff_pay',            key: 'staff_id'   },
] as const

/**
 * Rows kept for the school's statistics, where only a free-text column is about
 * the person. Erasure nulls the column; export includes the whole row, because
 * the score and the attendance ARE the data subject's data.
 */
export const SCRUBBED_TABLES = [
  { table: 'attendance_records',    key: 'student_id', column: 'note'  },
  { table: 'exam_scores',           key: 'student_id', column: 'notes' },
  { table: 'oudercontact_bookings', key: 'student_id', column: 'note'  },
  { table: 'category_scores',       key: 'student_id', column: 'note'  },
  // Cleared, never deleted: an assignment with no assignment_students rows
  // means "the whole class", so deleting this pupil's row could open a
  // per-pupil task to everyone.
  { table: 'assignment_students',   key: 'student_id', column: 'task_text' },
] as const

/** Tables exported but never erased — see the note below. */
export const EXPORT_ONLY_TABLES = [
  { table: 'class_students',  key: 'student_id' },
  { table: 'test_scores',     key: 'student_id' },
  { table: 'rapport_cards',   key: 'student_id' },
  // Accounting records: 7-year statutory retention (Belgian bookkeeping law),
  // carved out of the right to erasure by Art. 17(3)(b). The data subject can
  // still SEE them under Art. 15 — the right of access has no such carve-out.
  { table: 'fee_payments',    key: 'student_id' },
  { table: 'payroll_entries', key: 'staff_id'   },
] as const

/** Buckets that can hold files belonging to one person. */
export const USER_BUCKETS = [
  'student-documents',
  'student-reports',
  'submission-files',
] as const
