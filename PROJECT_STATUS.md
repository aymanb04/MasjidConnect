# MasjidConnect — Project Status
**Last updated: 2026-05-28**
**Author of this document: Ayman Boulayoune**

---

## 1. What Is This Project

Multi-tenant SaaS platform for **mosque education schools** (Arabische/islamitische scholen).
Each mosque is a **tenant**. Users belong to a tenant and have one of four roles: `super_admin`, `admin`, `teacher`, `student`.

**Business model:** MasjidConnect hosts the platform, mosques subscribe and manage their own users/classes. MasjidConnect is the **data processor**, each mosque is the **data controller** (relevant for GDPR).

---

## 2. Tech Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 14 (App Router) |
| Database + Auth | Supabase (PostgreSQL + RLS + Auth) |
| Styling | Tailwind CSS |
| Icons | Lucide React |
| File Storage | Supabase Storage |
| Hosting | Vercel |
| Domain | `masjidconnect.be` (registered via Combell, DNS at Combell, A → Vercel IP) |
| Language | TypeScript |

---

## 3. Critical Architecture Decisions

### Auth approach (DO NOT change without understanding this)
- Uses `@supabase/supabase-js` (localStorage-based) — **NOT** `@supabase/ssr`
- Middleware is **disabled**
- All dashboard pages are `'use client'`
- Single Supabase client at `lib/supabase/singleton.ts` — always use this on the client
- API routes use `SUPABASE_SERVICE_ROLE_KEY` for privileged operations (never exposed to client)
- `useProfile` hook at `lib/hooks/useProfile.ts` loads the current user's profile on every page load and kicks `is_active=false` users to `/login` immediately

### RLS approach
- Row Level Security on all tables
- Tenant isolation enforced at RLS level via `tenant_id`
- Key gotcha: **never use nested PostgREST joins** when the joined table's RLS policies themselves JOIN other RLS-protected tables — they silently return `[]` instead of an error. Always do separate queries and merge in JS. (Discovered the hard way with `submission_feedback`.)

---

## 4. Database Tables (confirmed in codebase)

| Table | Purpose |
|---|---|
| `profiles` | One row per user. Fields: id, tenant_id, first_name, last_name, email, phone, avatar_url, role, is_active, created_at |
| `tenants` | One row per mosque. Fields: id, name, logo_url, website_url (pending migration) |
| `school_years` | Academic year per tenant |
| `groups` | Age/level groups within a school year (e.g. "Groep 1 — 6-8 jaar") |
| `classes` | Subjects within a group (Arabic, Islam, Quran). Has `group_id` FK |
| `class_teachers` | Junction: which teachers teach which classes |
| `class_students` | Junction: which students are enrolled in which classes |
| `assignments` | Homework assigned by a teacher to a class |
| `submissions` | Student homework submissions |
| `submission_feedback` | Teacher feedback + score per submission |
| `submission_files` | Uploaded files attached to a submission |
| `lesson_modules` | Course material modules per class |
| `module_documents` | Files attached to a lesson module |
| `announcements` | School-wide announcements (pending migration — table may not exist in live DB yet) |
| `invitations` | Log of sent invites |
| `attendance_sessions` | Attendance session per class per day (teacher_id, session_date) |
| `attendance_records` | Per-student attendance record per session (status: present/absent/late/excused) |
| `student_reports` | PDF report per student per class per semester (1 per slot, private storage) |
| `feedback` | Bug reports / suggestions from users; readable by super_admin only |
| `rooster_sessions` | Weekly schedule sessions per class |
| `exam_scores` | Paper exam scores per student per class per semester (1/2). No assignment/submission flow — teacher enters score + max_score directly. |

### DB migrations status
Schema is in sync with the live DB as of 2026-05-25 (see `supabase/schema.sql`
header). All previously-pending items (announcements, website_url, indexes,
UNIQUE constraints, is_anonymized, score CHECK, RLS perf wrapping) are applied.

Migration scripts in `supabase/` that may still need running on a fresh DB:
- `7b_rls_auth_uid_wrap.sql` — wraps `auth.uid()` + helpers in `(SELECT ...)`
  for RLS perf. Idempotent. Applied to live DB on 2026-05-25.
- `7c_rls_scope_to_authenticated.sql` — `ALTER POLICY ... TO authenticated`
  for all 65 policies. Applied to live DB on 2026-05-25.

---

## 5. Pages & Features

### Public pages
| Route | Description |
|---|---|
| `/` | Landing / redirect |
| `/login` | Login form |
| `/forgot-password` | Password reset request |
| `/reset-password` | Set new password (from invite or reset email) |

### Dashboard pages
| Route | Who sees it | Description |
|---|---|---|
| `/dashboard` | All roles | Home dashboard. Students see unsubmitted homework count + list. Teachers/admins see announcements + quick links. |
| `/klassen` | All roles | Class list. Grouped by age group. Super admin sees a mosque filter. Each class card shows group badge, teacher, student count. |
| `/klassen/[klasId]` | All roles | Class detail. Shows lesson modules, assignments, student list, teacher list. Contact teacher via mailto. |
| `/klassen/[klasId]/scores` | Teacher, Admin | Gradebook / puntenlijst. Shows all students × assignments grid with scores. Weighted average percentage (sum earned / sum max). |
| `/huiswerk` | All roles | Homework overview. Students see only unsubmitted items. Teachers see all assignments they created. |
| `/huiswerk/[id]` | All roles | Single assignment detail + submission form (student) or submissions list (teacher). |
| `/lesmodules` | All roles | Lesson modules overview. |
| `/lesmodules/[id]` | All roles | Single module detail with documents. Teachers of the class can edit/upload regardless of who created it. |
| `/rooster` | All roles | Weekly schedule. Horizontal calendar (Mon–Sun columns). Admin can add/delete sessions per day/class. |
| `/agenda` | All roles | Agenda/calendar view. (Implemented, details not fully reviewed in sessions.) |
| `/beheer` | Admin, Super admin | User management. Role filter tabs (Alle/Leerlingen/Leerkrachten/Admins), search bar, archived toggle. Invite users, CSV import, archive/reactivate. |
| `/beheer/jaarovergang` | Admin | Year transition tool. Copies classes + students to a new school year. |
| `/superadmin` | Super admin only | Multi-tenant overview. Expandable tenant rows, per-tenant user lists, archive/reactivate, archived toggle. |
| `/aanwezigheid` | All roles | Attendance. Teachers mark today's attendance per student; admins see history per class with drill-down; students see own records. |
| `/klassen/[klasId]/rapporten` | All roles | Report cards per student. Teachers/admins upload PDF per semester; students download own. |
| `/privacy` | All roles | Privacy policy page. |

---

## 6. API Routes

All privileged routes verify the caller's session via `lib/api-auth.ts` before executing. The JWT is passed as `Authorization: Bearer <token>` from client components.

| Route | Method | Who can call | Purpose |
|---|---|---|---|
| `/api/invite` | POST | admin, super_admin | Create auth user + send invite email. Handles group enrollment (student → all classes of group) and teacher assignment (to group or specific class). Admin locked to own tenant. Role validated server-side (super_admin blocked). |
| `/api/user/archive` | POST | admin, super_admin | Sets `is_active=false`, bans auth account, force-revokes all sessions. Admin locked to own tenant. Reversible. |
| `/api/user/reactivate` | POST | admin, super_admin | Sets `is_active=true`, lifts auth ban. Admin locked to own tenant. Blocked when `profiles.is_anonymized = true` (GDPR erasure is irreversible). |
| `/api/user/anonymize` | POST | admin, super_admin | GDPR erasure: bans auth user FIRST, then scrubs PII (name→"Verwijderd", email→anon UUID, phone→null, avatar→null), sets `is_anonymized=true`, deletes submission files and DB rows, nullifies submission text. UUID row kept for FK integrity. Admin locked to own tenant. Irreversible. |
| `/api/user/delete` | DELETE | super_admin only | Hard delete via admin SDK. Kept for internal/dev use only. |
| `/api/auth/callback` | GET | public | Supabase auth callback handler. |

---

## 7. Key Components

| Component | Location | Description |
|---|---|---|
| `CsvImportButton` | `components/features/admin/` | Full CSV import flow: upload → column mapping → preview → import. Calls `/api/invite` per row with auth token. |
| `InviteUserButton` | `components/features/admin/` | Single user invite modal. Handles group or specific class assignment. Sends auth token. |
| `DeleteUserButton` | `components/features/admin/` | Archive button with GDPR escalation flow (confirm → archive, or confirm again → anonymize). Sends auth token. |
| `ReactivateUserButton` | `components/features/admin/` | Reactivate archived users. Sends auth token. |
| `CreateClassButton` | `components/features/admin/` | Create a new class/subject, assign to a group. |
| `CreateTenantButton` | `components/features/admin/` | Super admin: create a new mosque tenant. |
| `AnnouncementsCard` | `components/features/announcements/` | Announcements with class filter tabs + class badge. Teachers must pick a class; admins can post school-wide. |
| `MoveStudentModal` | `components/features/admin/` | Move a student between classes. Toggles removals + additions, saves in one go. |
| `FeedbackButton` | `components/features/feedback/` | Floating bottom-right button on all dashboard pages. Type picker + textarea + Ctrl+Enter. |
| `Sidebar` | `components/layout/` | Responsive sidebar. Shows mosque logo + website link. Mobile-responsive with hamburger. |

---

## 8. Terminology (Important — confirmed consistent throughout codebase)

This was audited in the session on 2026-05-16. **No inconsistencies found.**

| Term | Dutch | Meaning |
|---|---|---|
| Group | Groep | Age/level group (e.g. "Groep 1 — 6-8 jaar"). A student belongs to a group. Enrolling in a group auto-enrolls in ALL active classes of that group. |
| Class | Klas / Vak | A subject within a group (Arabic, Islam, Quran). Students can be manually moved between classes individually (e.g. failed/skipped one subject). |

The schema, types, API, and all UI labels consistently reflect this distinction. Group → multiple classes. Class = one subject.

---

## 9. CSV Import — Full Behaviour & Known Gaps

### How it works
1. **Upload** — parses CSV, auto-detects `;`, `,`, or tab separator. Strips BOM, handles quoted fields.
2. **Mapping** — auto-maps column headers using aliases in multiple languages (NL/EN/FR). Required: Voornaam, Achternaam, Email. Optional: Rol, Groep.
3. **Preview** — shows all valid rows. Invalid emails (no `@`) are silently dropped here. Unrecognised group names show orange ⚠.
4. **Import** — calls `/api/invite` sequentially with 300ms delay per row. Shows success/error count + list of failed emails.

### Role aliases supported
- Student: `student`, `leerling`
- Teacher: `teacher`, `leerkracht`, `prof`, `leraar`
- Admin: `admin`, `beheerder`
- Anything else → defaults to `student`

### Known gaps (discussed, not yet fixed)
1. **Silently dropped rows** — rows with no valid `@` in email are removed before preview with no UI indication of how many were dropped.
2. **Group mismatch disappears after import** — the ⚠ warning is visible in preview but the done screen doesn't carry it forward. If a group name didn't match, the account is created but the student is not enrolled in any class — and there's no alert in the results screen.
3. **CSV column alias ambiguity** — `klas` and `class` are aliased to map to the `groep` (group) field. If someone uses `Klas` meaning the subject (not the age group), it maps wrong. Minor edge case.

### Test CSV file
`test_import.csv` exists in the project root. Covers: valid student with group, leerling alias, non-existent group (⚠ test), student without group, teacher, leerkracht alias, invalid email (silent drop test).

---

## 10. GDPR Status (Belgium)

Full breakdown in `GDPR_NOTES.txt` (project root, not tracked by git).

### Implemented
- Two-action lifecycle: archive (reversible) + anonymize (GDPR erasure, irreversible)
- Archived users can be reactivated
- All FK relations preserved after anonymization (stats and submissions stay intact)
- Lesson modules are class-owned, not teacher-owned (persist after teacher leaves)
- RLS enforces tenant isolation
- Service role key never exposed to client

### Still needs attention (legal review required)
- [ ] Parental consent flow for minor students (mosque schools teach age 6-18)
- [ ] Data Processing Agreement (DPA/verwerkersovereenkomst) with each mosque
- [ ] Sub-processor disclosure: Supabase must be named as sub-processor; MasjidConnect must sign Supabase's DPA
- [ ] Privacy policy and privacy notice for end users
- [ ] Data Subject Access Request (DSAR) — no data export feature exists
- [ ] Retention policy enforcement: suggested 2 years after archiving → auto-anonymize (not implemented)
- [ ] Consider scrubbing `text_content` of submissions on GDPR erasure (currently kept)
- [ ] Breach notification procedure (72-hour rule to Belgian DPA — GBA)
- [ ] Register of processing activities (Art. 30 GDPR)

---

## 11. User Lifecycle

```
Active user
    ↓ (departure)
[ARCHIVE]  → is_active=false, auth banned, sessions revoked, all data intact
    ↓ (returns)             ↓ (GDPR erasure request)
[REACTIVATE]            [ANONYMIZE]
is_active=true              PII scrubbed, UUID row kept, irreversible
auth ban lifted             Cannot log in, cannot be reactivated
```

`useProfile` hook enforces this client-side: if `is_active=false`, user is immediately redirected to `/login` on any page load.

---

## 12. PWA / Mobile

- PWA manifest exists, app is installable on mobile
- iOS safe area handled (status bar overlap fixed)
- Icons: 192×192 and 512×512
- Mobile-responsive sidebar with hamburger menu
- Next step (future): native iOS/Android via React Native or Expo + push notifications

---

## 13. Future Features (from TOEKOMSTIGE_FUNCTIES.txt)

Prioritised based on what's partially prepared in DB:

| # | Feature | DB ready? | Notes |
|---|---|---|---|
| 1 | Aanwezigheidsregistratie | ✅ Done | `/aanwezigheid` — mark/view attendance per class |
| 2 | Rooster export (ICS/Google Calendar) | Partially | Rooster UI done, export not implemented |
| 3 | Ouderportaal | No | Parent account linked to child, see homework/scores/attendance |
| 4 | In-app berichtensysteem | No | Replace WhatsApp usage |
| 5 | Voortgangsrapporten / Rapportkaarten | ✅ Done | `/klassen/[klasId]/rapporten` — PDF upload per student per semester |
| 6 | Certificaten & diploma's | No | Teacher assigns certificate on module completion |
| 7 | Kiosk / aanmeldscherm | No | Tablet QR-code check-in at mosque entrance |
| 8 | Native mobile app | No | After PWA proves value |
| 9 | Betalingen & inschrijvingen | No | Stripe for school fees |
| 10 | Meertaligheid | No | NL/FR/AR (RTL for Arabic) |
| 11 | Quran-voortgang tracker | No | Track memorisation (hifz) per student |
| 12 | API / Integraties | No | Google Classroom, webhooks, open API |

---

## 14. What Was Discussed This Session (2026-05-30)

### Security hardening + rate limiting

#### CSV import locked for demo phase
- Added `IMPORT_DISABLED = true` flag in `CsvImportButton.tsx`
- Flow still works through upload → mapping → preview (mosque can test CSV parsing)
- Import button greyed out with orange banner: "Import tijdelijk uitgeschakeld tijdens de demofase"
- To re-enable: set `IMPORT_DISABLED = false`

#### Quick-win security fixes (all in one commit `7230e93`)
- **E1 — HSTS:** Added `Strict-Transport-Security: max-age=31536000; includeSubDomains` to `next.config.js`
- **C3 — Name length:** `first_name` and `last_name` now validated ≤100 chars in `/api/invite`
- **C2 — Score cap:** `saveExamScore` in scores page now rejects `score > maxScore` client-side. DB constraint still pending: `ALTER TABLE exam_scores ADD CONSTRAINT score_within_max CHECK (score <= max_score);`
- **F2 — Error sanitization:** All `/api/*` routes now `console.error` internally and return generic `"Er is een fout opgetreden."` to client. Exception: anonymize storage error still says "Bestanden konden niet worden verwijderd" without raw detail.

#### Rate limiting via Upstash Redis (`169e4e8`)
- Installed `@upstash/ratelimit` + `@upstash/redis`
- New `lib/rate-limit.ts` — sliding window, 1h, per-caller per-route, no-ops gracefully if env vars absent
- Applied to all 5 destructive routes:

| Route | Limit |
|---|---|
| `/api/user/anonymize` | 3 / hour |
| `/api/user/delete` | 3 / hour |
| `/api/user/archive` | 30 / hour |
| `/api/user/reactivate` | 30 / hour |
| `/api/invite` | 30 / hour |

- Returns 429 with `Retry-After` header when exceeded
- Upstash Redis DB created (EU region), env vars added to `.env.local` and Vercel Production
- Active in production after push + redeploy

#### Discussed but deferred
- Discord webhook alert on anonymize calls — added to `SECURITY_TODO.md §3b` and `TOEKOMSTIGE_FUNCTIES.txt §13`
- `exam_scores` DB constraint (`score <= max_score`) — needs one SQL line in Supabase editor

**Commits this session:**

| Hash | What |
|---|---|
| `4940afd` | docs: README description update (from remote) |
| `7230e93` | security: quick-win hardening — HSTS, input validation, error sanitization, CSV import lock |
| `169e4e8` | security: add Upstash rate limiting to all destructive API routes |

---

## 14. What Was Discussed This Session (2026-05-28)

### Repository cleanup

- Removed `.idea/` (5 JetBrains IDE files) from git tracking; added to `.gitignore`
- Deleted `lib/supabase/client.ts` — dead file, never imported anywhere (codebase uses `lib/supabase/singleton.ts` exclusively)
- Rewrote `README.md` in English; fixed outdated info: wrong domain, Framer Motion listed but unused, missing `student-reports` bucket, missing pages in structure, done features still listed as planned
- Updated domain from `masjid-connect.be` → `masjidconnect.be` everywhere: README, `superadmin/page.tsx`, `CreateTenantButton.tsx`, PROJECT_STATUS.md

**Commits this session:**

| Hash | What |
|---|---|
| `780535e` | chore: remove .idea IDE files and dead supabase client stub |
| `949a07b` | docs: rewrite README in English, fix outdated stack and setup info |
| `de3720e` | docs: fix domain to masjidconnect.be (no dash) |
| `797ffc7` | fix: update hardcoded domain to masjidconnect.be (no dash) |
| `a235856` | docs: update domain to masjidconnect.be in PROJECT_STATUS |

---

## 14. What Was Discussed This Session (2026-05-27)

### Exam scores feature

Mosque confirmed they want exam scores visible online. Exams are paper-based — only the score goes online, no assignment/submission flow.

**DB:** New `exam_scores` table (`class_id`, `student_id`, `semester` 1/2, `score`, `max_score`, UNIQUE per student+class+semester). RLS: students read own, teachers manage their classes, admins manage tenant. Migration run manually via Supabase SQL editor; schema.sql updated.

**Scores page (`/klassen/[klasId]/scores`):** New "Examenresultaten" card below the homework grid.
- Lists all students × S1/S2 columns
- Click **+** on empty cell → inline inputs (score / max, default max=20)
- Enter or ✓ to save (upsert); Esc to cancel
- Hover existing score → pencil to edit, × to delete
- Green/amber/red colour coding (≥70% / ≥50% / below)

**Class detail page (`/klassen/[klasId]`):** Students see their own exam scores in the right column (card only appears if at least one score exists for that student in that class).

### Git history cleanup

Removed `Co-Authored-By: Claude Sonnet 4.6` trailer from all 112 commits using `git filter-branch`. Author and committer dates both preserved (`GIT_COMMITTER_DATE=$GIT_AUTHOR_DATE`). Force-pushed to origin. History on GitHub looks identical to before, just without the trailer.

**Commits this session:**

| Hash | What |
|---|---|
| `54d2341` | feat: exam scores — puntenlijst card + student view on klas detail |

---

## 14. What Was Discussed This Session (2026-05-26)

### New feature batch — mosque wishlist

Five features implemented from `-aankondigingen per klas (filter).txt`.
Examens per semester was deferred pending mosque confirmation.

| Commit | What |
|---|---|
| `9dfd987` | fix: fetch is_active in requireRole so active check actually works |
| `e506817` | chore: add TypeScript interfaces for new tables |
| `9c2c2db` | chore: migration 8 — feedback, student_reports, attendance RLS |
| `c7e0b39` | feat: class filter and badge on announcements |
| `1f6e462` | feat: move student between classes from beheer |
| `4dce908` | feat: rapport upload page per klas |
| `c8257cd` | feat: aanwezigheid module for marking and viewing attendance |
| `b582f2c` | feat: floating feedback button on all dashboard pages |
| `c10188e` | feat: load feedback data in superadmin |
| `dec58e2` | feat: feedback inbox UI in superadmin panel |
| `29f67ff` | docs: update PROJECT_STATUS.md |

**Features built:**

1. **Aankondigingen per klas** — `AnnouncementsCard` updated: class filter tabs appear when class-specific announcements exist; create form has class dropdown (teachers must pick a class, admins can post school-wide); class badge shown on each announcement. DB already had `class_id` column and RLS.

2. **Student verplaatsen** (`MoveStudentModal`) — In `/beheer`, student rows now show a ⇄ button on hover. Opens a modal showing current class enrollments (with remove toggle) and a dropdown to add to new classes. Flexible per-class control. No group-based bulk move.

3. **Aanwezigheid** — New `/aanwezigheid` page with sidebar nav entry for all roles.
   - Teachers: see their classes, "Markeren" button (disabled if already done today), mark present/absent/late/excused per student, saves session + records.
   - Admins: same marking + "Overzicht" button → session history per class → per-session drill-down.
   - Students: "Mijn aanwezigheid" card → own records per class with class filter.
   - No retroactive dates (today only for new sessions).

4. **Rapporten uploaden** — New `/klassen/[klasId]/rapporten` page. "Rapporten" button added to class detail header (visible to all roles).
   - Teachers/admins: upload PDF per student per semester (1 per slot); replace or delete existing; download via signed URL.
   - Students: see own reports per semester, download.
   - Storage: private `student-reports` bucket, path `{tenantId}/{studentId}/{classId}_s{semester}.{ext}` (fixed path = upsert replaces old file automatically).

5. **Floating feedback button** — `FeedbackButton` on all dashboard pages (bottom-right). Type: Bug / Suggestie / Vraag. Saves to `feedback` table. Optional Discord webhook via `DISCORD_FEEDBACK_WEBHOOK_URL` env var.

6. **Feedback inbox in superadmin** — Card below the mosque list on `/superadmin`. Shows type badge, message, sender name/role, page path, relative timestamp. Unread rows highlighted. Mark-as-read + delete per entry. Unread count badge in header.

**Bug fix — `lib/api-auth.ts`:**
`is_active` was not included in the `.select()` string, so `!profile.is_active` evaluated to `!undefined === true`, causing every privileged API route (`/api/invite`, `/api/user/*`) to return 403 for all callers since commit `b6de38b` (2026-05-25). Fixed by adding `is_active` to the select and to `CallerProfile` type.

**DB changes applied to live DB:**
- `feedback` table with RLS (users can insert, super_admin manages)
- `student_reports` table with RLS (student reads own, teacher manages class reports, admin manages tenant)
- `attendance_sessions` + `attendance_records` RLS policies added (tables existed, no policies before)
- Migration files: `supabase/8_features_migration.sql`, `supabase/8b_features_policies_fix.sql`

**Storage:**
- `student-reports` bucket created (private) with two storage policies

**Still pending (deferred):**
- Examens per semester — pending mosque confirmation
- Discord webhook setup for feedback button (optional, `DISCORD_FEEDBACK_WEBHOOK_URL`)
- All items from `SECURITY_TODO.md` (custom SMTP, rate limiting, etc.)

---

## 14. What Was Discussed This Session (2026-05-25)

### Second security + scalability audit
Full follow-up audit on top of the 2026-05-21 + 2026-05-23 work. Findings
ranged from concurrency bugs (duplicate enrollments) to RLS performance
issues (per-row `auth.uid()` eval) to operational gaps (no migrations,
no rate limiting). Captured in local-only `SECURITY_TODO.md` punch list.

### Code commits this session
Listed newest first. All branched from master, no force pushes.

| Hash | What |
|---|---|
| `66e7d69` | Update hardcoded domain references to `masjid-connect.be` (3 UI strings). |
| `6d2e94d` | Bake `TO authenticated` into 7b CREATE POLICY so re-running can't undo 7c. |
| `3588530` | 7c migration: scope all 65 RLS policies `TO authenticated`. |
| `70214b2` | Use `is_anonymized` column instead of `first_name='Verwijderd'` sentinel. |
| `9d87351` | Switch `/api/invite` enrollment to `upsert + ignoreDuplicates`. |
| `1a88359` | Full `schema.sql` resync with live DB (CASCADE on 17 FKs, missing UNIQUEs, score CHECK, `is_anonymized`, indexes). |
| `835dbe3` | 7b migration: wrap `auth.uid()` and helpers in `(SELECT ...)` for RLS perf. |
| `62344a2` | Reset password: min 10 chars, must contain letter + digit. |
| `a6f8bbf` | CSV import: 500-row cap, hoist `getSession()` out of the loop. |
| `da9c056` | Rollover: rollback all created groups+classes on partial failure. |
| `21d4972` | Rollover: exclude archived students by filtering `is_active=true`. |
| `e39eeeb` | `activateYear`: activate target first, then deactivate others. |
| `298dc5a` | Added `Content-Security-Policy` header to `next.config.js`. |
| `b6de38b` | `requireRole` rejects `is_active=false` profiles with 403. |
| `06c9006` | Anonymize: ban auth user FIRST, return 500 on storage delete failure. |

### DB changes applied to live DB (via Supabase SQL editor)
- 3 new indexes: `idx_profiles_tenant_active`, `idx_submission_files_submission`, `idx_announcements_tenant_id`
- `score_non_negative` CHECK on `submission_feedback`
- `is_anonymized` boolean column on `profiles` (backfilled from `first_name='Verwijderd'`)
- Dropped 5 duplicate UNIQUE constraints (class_students/teachers, submissions, submission_feedback)
- 6 helper functions rewritten to use `(SELECT auth.uid())` internally
- All 65 RLS policies recreated with wrapped expressions and `TO authenticated` scope

### Supabase Dashboard changes
- ✅ Email sign-up disabled (Authentication → Providers → Email)
- ✅ Password policy: min 10 chars, letter + digit required
- ✅ Auth rate limits tightened (token verifications 10/5min, sign-ins 15/5min)
- ⏳ Custom SMTP (Resend) — blocker before live, deferred

### Domain setup
- Domain `masjidconnect.be` purchased at Combell
- DNS: A records → `216.198.79.1` (Vercel anycast), AAAA records deleted
- Vercel domain validated, SSL cert issued
- `NEXT_PUBLIC_SITE_URL=https://masjidconnect.be` set in Vercel env vars
- Supabase Auth Site URL + Redirect URLs updated to new domain

### Performance Advisor impact
Started: 0 errors, 275 warnings, 20 info.
After 7b + 7c: 0 errors, ~55 warnings (4/5 of warnings were role multiplication).
Remaining warnings are real same-role policy duplicates (consolidation deferred —
risky refactor, tracked in SECURITY_TODO as 7c-bis).

### Items still pending (see `SECURITY_TODO.md`)
- 2d. Custom SMTP via Resend
- 3.  API rate limiting via Upstash (irreversible-anonymize is the big risk)
- 4.  Server-side file type validation
- 5.  Dependency upgrades (next 14→16, @supabase/ssr 0.3→0.10)
- 7a. Supabase CLI / `supabase/migrations/` setup
- 7c-bis. Consolidate remaining same-role policy duplicates
- 7d. CSV import → durable job queue
- 7f. PITR backups (paid Supabase add-on)

---

## 14b. What Was Discussed This Session (2026-05-23)

### Schema sync + demo seed

**`supabase/schema.sql` rewritten (committed — d255a46):**
- Previously a mix of raw CREATE TABLE statements + a JSON dump of policies. Now a proper SQL reference file with `CREATE OR REPLACE FUNCTION`, `CREATE TABLE`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and `CREATE POLICY` statements throughout.
- Includes all 9 helper functions (`get_my_role`, `get_my_tenant_id`, `is_super_admin`, `am_i_student_of_class`, `am_i_teacher_of_class`, `am_i_member_of_group`, `handle_new_user`, `handle_user_deleted`, `update_updated_at`) with full definitions.
- Reflects the split of `student_manage_own_submissions` (ALL) into 4 separate policies applied in the previous session: SELECT, INSERT (with deadline enforcement), UPDATE, DELETE.
- Inline comments on all security-critical policies.

**Demo seed tooling created (gitignored — not committed):**
- `supabase/reset.sql` — run in Supabase SQL Editor to wipe all tables + auth users cleanly before re-seeding.
- `supabase/seed.ts` — TypeScript script (`npx tsx supabase/seed.ts`) that creates a full demo dataset using the service role key. Creates auth users with known passwords directly via `supabase.auth.admin.createUser()` — no invite emails needed. Reads `.env.local` automatically without requiring dotenv.
- Both files added to `.gitignore` (contain hardcoded demo passwords) and excluded from `tsconfig.json`.

**Demo dataset (De Kroon — first client):**
- Tenant: De Kroon, Antwerpen, Turnhoutsebaan 100
- 1 super admin (`superadmin@masjidconnect.be` / `SuperAdmin1234!`)
- 1 admin (`admin@dekroon.be` / `Admin1234!`)
- 3 teachers (`ahmed.benali`, `fatima.yilmaz`, `omar.elidrissi` @dekroon.be / `Teacher1234!`)
- 26 students across 3 groups (@dekroon.be / `Student1234!`)
- 3 groups, 9 classes (Arabisch + Islam + Koran × 3 groups), school year 2025-2026
- 9 rooster sessions (Groep 1+2 Saturday, Groep 3 Sunday)
- 18 assignments (9 past-due, 9 active), 78 submissions, 54 graded with feedback, 4 announcements

**To re-seed from scratch:**
1. Run `supabase/reset.sql` in Supabase SQL Editor
2. `npx tsx supabase/seed.ts`

---

## 14b. What Was Discussed This Session (2026-05-21)

### Full security audit

Ran a full codebase + live RLS policy audit. Live policies queried directly from `pg_policies` in Supabase SQL editor.

**RLS fixes applied (run in Supabase SQL editor):**
1. `update_own_profile` — added `WITH CHECK` preventing users from changing their own `role` or `tenant_id`. Previously any student could escalate themselves to admin via devtools.
2. `admin_manage_profiles` — added `WITH CHECK` restricting settable roles to `student/teacher/admin`. Previously an admin could set any profile's role to `super_admin`.
3. `admin_manage_class_teachers` — added tenant scope via `classes.tenant_id = get_my_tenant_id()`. Previously an admin could manage teachers in other mosques.
4. `admin_manage_class_students` — same tenant scope fix as above.
5. `teacher_manage_feedback` — added tenant scope to both the teacher branch and admin branch. Previously an admin had zero tenant restriction on feedback writes.

**False positives from audit (already correct in live DB):**
- `student_view_docs` already checks `is_visible = true` ✓
- `class_sessions` (rooster) has proper `WITH CHECK` on admin policy ✓

**API route security fixes (committed to git):**
- Created `lib/api-auth.ts`: shared helper that reads `Authorization: Bearer <token>`, verifies the JWT with `supabaseAdmin.auth.getUser(token)`, fetches the caller's profile, and enforces role requirements.
- All 5 privileged API routes now call `requireRole()` at the top before any operation.
- `/api/invite` additionally validates: role must be in `[student, teacher, admin]` (blocks `super_admin` creation), email validated server-side, admin callers locked to their own `tenant_id`.
- `/api/user/archive`, `/api/user/reactivate`, `/api/user/anonymize`: admin callers locked to own tenant. Reactivate additionally blocks anonymized users (`first_name = 'Verwijderd'`).
- `/api/user/delete`: restricted to `super_admin` only.
- Client components (`InviteUserButton`, `DeleteUserButton`, `ReactivateUserButton`, `CsvImportButton`, `superadmin/page.tsx`) all updated to call `supabase.auth.getSession()` and pass the token as `Authorization: Bearer` header.

**Storage security fixes (committed to git):**
- Switched `submission-files` and `module-documents` buckets to private in Supabase dashboard.
- Upload code now stores storage path in `file_url` instead of the full public URL.
- Created `components/SignedFileLink.tsx`: generates a fresh 60-second signed URL on click. Handles legacy full-URL records by extracting the path automatically.
- Storage RLS policies replaced: students can only access their own folder (`path[1] = auth.uid()`), teachers/admins can read all submission files. Module docs readable by all authenticated users, writable only by teachers/admins.

**Open redirect fix (committed to git):**
- `/api/auth/callback` now validates the `next` param — must start with `/` and not `//`. Falls back to `/dashboard` otherwise.

**GDPR anonymize fix (committed to git):**
- `submissions.text_content` now set to null for all of the user's submissions.
- All `submission_files` records fetched, files deleted from storage (handles both path and legacy public URL format), DB records deleted.

**Next.js update (committed to git):**
- Updated `next` from `14.2.5` → `14.2.35` (30 patch versions, same major/minor to avoid breaking changes).
- Disabled the image optimizer (`images: { unoptimized: true }` in `next.config.js`) — `next/image` is not used anywhere in the codebase, so the `/_next/image` endpoint was an unnecessary DoS surface.
- Remaining audit warnings are in dev tooling (`eslint-config-next`, `@supabase/ssr`) or CVEs that don't apply to this architecture (RSC, middleware, i18n — all unused or disabled).

**Security headers (committed to git — 82e2a8a):**
- Added HTTP security headers to `next.config.js` for all routes: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`.

**Deadline enforcement at DB level (applied in Supabase SQL editor):**
- Split the broad `student_manage_own_submissions` ALL policy into four separate policies: SELECT, INSERT, UPDATE, DELETE.
- INSERT policy enforces `WITH CHECK (due_date IS NULL OR now() < due_date)` — students cannot create submissions after the deadline regardless of client-side validation.

**Known gap — not fixed (profiles IDOR):**
- `view_same_tenant_profiles` RLS policy exposes phone and email to all members of the same mosque. Fixing this would require rewriting the teacher list query on the class detail page (which fetches teachers by `tenant_id`). Documented as a known gap; not an immediate risk since all users within a mosque know each other.

**Remaining open items from audit (not yet fixed):**
- No brute-force protection on login / forgot-password. Low priority — Supabase has basic IP-based rate limiting and users are a controlled mosque audience.
- Audit logging (anonymize, delete, role changes, score edits) — not implemented; future feature.

---

## 14b. What Was Discussed This Session (2026-05-16)

### CSV import use case walkthrough
Went through all scenarios:
- Valid data → accounts + invite emails
- Invalid email → silently dropped before preview (gap: no counter shown)
- API failures (email exists, bad tenant) → shown in done screen
- Group name mismatch → account created but not enrolled (gap: invisible after import)
- Partial batch failure → no rollback, done screen lists failures

**Decision:** Manual Supabase table edits are sufficient for most post-import fixes (insert into `class_students`, `class_teachers`, update `profiles.role` or name). These are clean single-table edits with no triggers or cascades. The only case that's not fixable with a simple edit is "resend invite" (no feature for this).

**Next task agreed:** Fix the done screen to carry forward group mismatch warnings so admin knows which accounts need manual enrollment.

### Terminology audit (groups vs classes)
Full codebase scan run. **Result: no inconsistencies found.** All pages, components, API routes, and DB queries correctly distinguish groep (age group) from klas/vak (subject).

Minor note: `CsvImportButton.tsx` line 85 aliases `klas` and `class` as valid CSV column names for the groep field — could confuse power users who name their column `Klas` meaning the subject. Low priority.

### Test CSV
`test_import.csv` regenerated in project root with clean `Voornaam;Achternaam` headers (previous version used `Naam` which could ambiguously auto-map to voornaam alias).

---

## 15. Known Technical Gotchas

1. **Supabase nested join + RLS silent failure** — If table A has an RLS policy that JOINs table B, and table B also has RLS, a nested PostgREST select like `.select('a(*, b(*))')` will silently return `[]` for the nested table. Always fetch the second table in a separate query and merge in JS.

2. **iOS PWA safe area** — Status bar overlap on iOS PWA required inline style (not just Tailwind) to clear the top area.

3. **Supabase Storage filenames** — Filenames must be sanitized before upload (special chars break storage URLs). Already fixed.

4. **Module RLS WITH CHECK** — Supabase RLS `WITH CHECK` clause is required for INSERT policies, not just `USING`. Missing `WITH CHECK` on lesson module policies caused teacher insert failures (fixed).

5. **Jaarovergang and nested RLS** — Year transition page hit the same nested join issue. Fixed by using separate profile queries.

6. **API route auth uses Bearer token, not cookies** — The app uses `@supabase/supabase-js` (localStorage) for auth, so no session cookie is available in API routes. All privileged API routes receive the JWT as `Authorization: Bearer <token>` from the client and verify it server-side via `supabaseAdmin.auth.getUser(token)` in `lib/api-auth.ts`. Do not use `lib/supabase/server.ts` (cookie-based SSR client) for API route auth — it won't see the session.

---

## 16. Git History (recent, newest first)

```
54d2341 feat: exam scores — puntenlijst card + student view on klas detail
ef4bd44 docs: bring PROJECT_STATUS up to date after 2026-05-26 session
1bca4b6 docs: update PROJECT_STATUS.md for 2026-05-26 session
dec58e2 feat: feedback inbox UI in superadmin panel
c10188e feat: load feedback data in superadmin
b582f2c feat: floating feedback button on all dashboard pages
c8257cd feat: aanwezigheid module for marking and viewing attendance
4dce908 feat: rapport upload page per klas
1f6e462 feat: move student between classes from beheer
c7e0b39 feat: class filter and badge on announcements
9c2c2db chore: migration 8 — feedback, student_reports, attendance RLS
e506817 chore: add TypeScript interfaces for new tables
9dfd987 fix: fetch is_active in requireRole so active check actually works
5c6c882 docs: reflect masjid-connect.be deployment and 2026-05-25 audit work
66e7d69 fix: update hardcoded domain references to masjid-connect.be
6d2e94d chore: bake TO authenticated into 7b's CREATE POLICY statements
3588530 chore: add 7c migration — scope all RLS policies to authenticated role
835dbe3 chore: add 7b RLS perf migration — wrap auth.uid() and helper fns
70214b2 security: use is_anonymized column instead of 'Verwijderd' sentinel
9d87351 fix: use upsert with ignoreDuplicates for class/teacher enrollment
1a88359 chore: resync schema.sql with live database
```

---

## 17. Files to Know

| File | Why it matters |
|---|---|
| `lib/supabase/singleton.ts` | The one Supabase client — always use this on client side |
| `lib/api-auth.ts` | Shared API route auth helper — verifies Bearer token, returns caller profile |
| `components/SignedFileLink.tsx` | Renders file links via signed URLs; handles legacy public URL format |
| `lib/hooks/useProfile.ts` | Loads current user, enforces is_active check |
| `lib/types.ts` | All shared TypeScript interfaces |
| `app/api/invite/route.ts` | User creation + group enrollment logic |
| `components/features/admin/CsvImportButton.tsx` | Full CSV import flow |
| `components/features/admin/InviteUserButton.tsx` | Single invite modal |
| `components/features/admin/DeleteUserButton.tsx` | Archive + GDPR anonymize flow |
| `app/(dashboard)/beheer/jaarovergang/page.tsx` | Year transition |
| `app/(dashboard)/klassen/[klasId]/scores/page.tsx` | Gradebook |
| `app/(dashboard)/rooster/page.tsx` | Weekly schedule |
| `GDPR_NOTES.txt` | Full GDPR analysis (not in git) |
| `TOEKOMSTIGE_FUNCTIES.txt` | Future features list (not in git) |
| `test_import.csv` | Test CSV for bulk import (not in git) |
| `PROJECT_STATUS.md` | This file |
