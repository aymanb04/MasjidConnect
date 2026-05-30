# Security Audit Report — MasjidConnect
**Period:** 2026-05-21 → 2026-05-30
**Audited by:** Ayman Boulayoune + Claude Code
**Status:** All critical and high findings resolved. Two medium gaps documented and accepted.

---

## Summary

| Severity | Total found | Fixed | Accepted gap |
|---|---|---|---|
| 🔴 Critical | 3 | 3 | 0 |
| 🟠 High | 4 | 4 | 0 |
| 🟡 Medium | 6 | 4 | 2 |
| 🔵 Low | 6 | 6 | 0 |
| **Total** | **19** | **17** | **2** |

---

## 1. Authentication & Authorization

### 1.1 Unrestricted self-registration — FIXED 🔴 Critical
**Risk:** Anyone on the internet could call the Supabase sign-up endpoint with `{ data: { role: "super_admin" } }` and become a platform super-admin, bypassing the invite-only flow entirely.
**Fix:** Email sign-up disabled in Supabase Dashboard (Authentication → Providers → Email → off). All accounts are now created exclusively via the invite API.

### 1.2 Role escalation via profile update — FIXED 🔴 Critical
**Risk:** Any authenticated user could call the Supabase REST API directly and update their own `role` or `tenant_id` in the `profiles` table, escalating themselves to admin or moving to another mosque's tenant.
**Fix:** Added `WITH CHECK (role = OLD.role AND tenant_id = OLD.tenant_id)` to the `update_own_profile` RLS policy.

### 1.3 Admin could create super_admin accounts — FIXED 🔴 Critical
**Risk:** A mosque admin could invite a new user with `role: "super_admin"` via the invite API, creating a platform-level admin outside of MasjidConnect's control.
**Fix:** `/api/invite` validates server-side that `role` is one of `[student, teacher, admin]`. `super_admin` is explicitly blocked.

### 1.4 No authentication on API routes — FIXED 🟠 High
**Risk:** All `/api/*` routes accepted requests from anyone — no session verification, no role check. Any unauthenticated caller could invite users, archive accounts, or delete data.
**Fix:** Created `lib/api-auth.ts` — shared helper that reads `Authorization: Bearer <token>`, verifies the JWT via `supabaseAdmin.auth.getUser(token)`, fetches the caller's profile, and enforces role requirements. All 5 privileged API routes call `requireRole()` before any operation.

### 1.5 Archived users could still call API routes — FIXED 🟡 Medium
**Risk:** After archiving a user (setting `is_active = false`), the auth ban takes effect but `requireRole` previously did not check `is_active`, so a user who obtained a token before the ban could still call privileged routes.
**Fix:** `requireRole` now fetches `is_active` from the profile and returns 403 if false. Defense-in-depth on top of the Supabase auth ban.

### 1.6 Weak password policy — FIXED 🔵 Low
**Risk:** Users could set passwords as short as 6 characters with no complexity requirements, making brute-force trivial.
**Fix:** Minimum 10 characters, must contain at least one letter and one digit — enforced both client-side (reset-password page) and server-side (Supabase Dashboard → Authentication → Password Settings).

---

## 2. Row Level Security (RLS)

### 2.1 Cross-tenant class management — FIXED 🟠 High
**Risk:** The `admin_manage_class_teachers` and `admin_manage_class_students` RLS policies had no tenant scope. A mosque admin could manage teachers and students in other mosques' classes.
**Fix:** Both policies now enforce `classes.tenant_id = get_my_tenant_id()` in both `USING` and `WITH CHECK` clauses.

### 2.2 Admin could set any role including super_admin — FIXED 🟠 High
**Risk:** `admin_manage_profiles` had no restriction on which roles an admin could assign. An admin could promote any user to `super_admin`.
**Fix:** `WITH CHECK` clause added, restricting settable roles to `student`, `teacher`, and `admin` only.

### 2.3 Feedback had no tenant scope — FIXED 🟡 Medium
**Risk:** The `teacher_manage_feedback` RLS policy had no tenant restriction on the admin branch, meaning an admin could read or write feedback from other mosques.
**Fix:** Tenant scope added to both the teacher and admin branches of the policy.

### 2.4 All RLS policies evaluated `auth.uid()` per row — FIXED 🔵 Low
**Risk:** PostgreSQL was calling `auth.uid()` and helper functions (`get_my_role()`, `get_my_tenant_id()`, `is_super_admin()`) once per row rather than once per query, causing severe performance degradation as data grows. Supabase Performance Advisor showed 275 warnings.
**Fix:** All 6 helper functions rewritten to use `(SELECT auth.uid())` internally. All 65 RLS policies recreated with wrapped expressions. Performance Advisor warnings dropped from 275 to ~55.

### 2.5 RLS policies applied to unauthenticated (public) role — FIXED 🔵 Low
**Risk:** All 65 policies had no role restriction (`TO public`), meaning unauthenticated requests would evaluate the USING clause before being rejected by PostgREST. Unnecessary compute per unauthenticated request.
**Fix:** All 65 policies recreated with `TO authenticated` scope via migration `7c_rls_scope_to_authenticated.sql`.

### 2.6 Submission deadline not enforced at DB level — FIXED 🔵 Low
**Risk:** The submission deadline was enforced only client-side. A student could bypass it via DevTools or a direct API call and submit after the deadline.
**Fix:** Split the broad `student_manage_own_submissions` ALL policy into 4 separate policies (SELECT, INSERT, UPDATE, DELETE). The INSERT policy enforces `WITH CHECK (due_date IS NULL OR now() < due_date)`.

---

## 3. API Route Security

### 3.1 Admins not locked to own tenant in user management — FIXED 🟠 High
**Risk:** A compromised admin account could archive, reactivate, or anonymize users from other mosques.
**Fix:** All `/api/user/*` routes fetch the target user's `tenant_id` and return 403 if it doesn't match the caller's `tenant_id` (for admin role). Super admins are unrestricted.

### 3.2 No rate limiting on destructive routes — FIXED 🟠 High
**Risk:** A compromised admin could call `/api/user/anonymize` in a tight loop, irreversibly erasing every user in a mosque before anyone notices. Anonymization is permanent (GDPR erasure — PII scrubbed, files deleted, `is_anonymized = true`).
**Fix:** Upstash Redis rate limiting (sliding window, per caller per route, per hour):
- `/api/user/anonymize` — 3 / hour
- `/api/user/delete` — 3 / hour
- `/api/user/archive` — 30 / hour
- `/api/user/reactivate` — 30 / hour
- `/api/invite` — 30 / hour

Returns HTTP 429 with `Retry-After` header when exceeded. Implemented in `lib/rate-limit.ts`.

### 3.3 Raw internal errors returned to client — FIXED 🔵 Low
**Risk:** All API routes returned `error.message` verbatim in 500 responses. Supabase errors include internal details: table names, constraint names, column names. Low impact (admin-only routes) but violates least-information-disclosure.
**Fix:** All catch blocks and internal error returns now `console.error` the detail to Vercel logs and return a generic `"Er is een fout opgetreden."` to the client. Exception: the anonymize storage error still says "Bestanden konden niet worden verwijderd" (without raw detail) so the admin knows the GDPR erasure is incomplete.

### 3.4 Open redirect in auth callback — FIXED 🔵 Low
**Risk:** `/api/auth/callback` passed the `next` query parameter directly to the redirect without validation. An attacker could craft a link that redirects to an external phishing site after login.
**Fix:** `next` parameter is now validated — must start with `/` and must not start with `//`. Falls back to `/dashboard` if invalid.

---

## 4. Input Validation

### 4.1 No server-side email validation — FIXED 🔵 Low
**Risk:** The invite API accepted any string as email, passing it directly to Supabase Auth. Malformed emails could cause unexpected errors or account issues.
**Fix:** Email validated server-side with `EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/` before any auth operation.

### 4.2 No length limit on user names — FIXED 🔵 Low
**Risk:** `first_name` and `last_name` in the invite API had no length validation. PostgreSQL TEXT columns are unbounded. An admin could create a user with a 100 KB name, causing DB row bloat and UI rendering issues.
**Fix:** `first_name` and `last_name` now validated ≤ 100 characters in `/api/invite` before any operation.

### 4.3 Exam score had no upper bound — FIXED 🔵 Low
**Risk:** A teacher could enter `score: 9999, max_score: 20` (500% grade), corrupting class averages. Client-side validation was bypassable.
**Fix:** Client-side guard in `saveExamScore` rejects `score > maxScore`. DB-level constraint applied: `ALTER TABLE exam_scores ADD CONSTRAINT score_within_max CHECK (score <= max_score)`.

### 4.4 CSV import ran unbounded in the browser — FIXED 🔵 Low
**Risk:** An admin could upload a CSV with thousands of rows, running thousands of invite API calls from the browser tab for hours. No cap, no session management.
**Fix:** Hard cap of 500 rows enforced at preview step. Auth session fetched once before the loop (not per row) to avoid stale token mid-import.

---

## 5. Storage Security

### 5.1 File buckets were public — FIXED 🟠 High
**Risk:** `submission-files` and `module-documents` were public buckets — anyone with the URL could download any student's homework or course material without authentication.
**Fix:** Both buckets switched to private in Supabase dashboard. `SignedFileLink` component generates fresh 60-second signed URLs on click. Storage RLS policies restrict access by role and tenant.

### 5.2 Files served via permanent public URLs — FIXED 🟡 Medium
**Risk:** File URLs stored in the DB were full public URLs. Even after switching buckets to private, old URLs would remain accessible until the signed URL infrastructure was in place.
**Fix:** Upload code now stores only the storage path (not the full URL). `SignedFileLink` handles both new paths and legacy full URLs automatically.

### 5.3 Filenames not sanitized before upload — FIXED 🔵 Low
**Risk:** Special characters in filenames broke storage URLs and could cause unexpected behavior.
**Fix:** Filenames sanitized before upload.

---

## 6. GDPR & Data Protection

### 6.1 Anonymized users could be reactivated — FIXED 🟡 Medium
**Risk:** The anonymize route detected previously-erased users by checking `first_name = 'Verwijderd'`. A legitimate user with that name could not be reactivated, and changing the anonymize format would silently make anonymized users reactivatable — a serious GDPR regression.
**Fix:** Added `is_anonymized boolean NOT NULL DEFAULT false` column to `profiles`. Anonymize sets it to `true`. Reactivate checks `is_anonymized` instead of the string sentinel.

### 6.2 Auth account not banned before data scrubbing — FIXED 🟡 Medium
**Risk:** The anonymize route previously scrubbed PII first, then banned the auth account. During the window between the two operations, the user's auth session was still valid — they could log in and see their profile already erased.
**Fix:** Auth account banned and sessions revoked *first*, then PII scrubbed.

### 6.3 Submission text not erased on anonymize — FIXED 🔵 Low
**Risk:** GDPR erasure deleted submission files and scrubbed the profile, but `submissions.text_content` retained the student's written answers.
**Fix:** Anonymize route now nulls `text_content` for all of the user's submissions.

### 6.4 Active sessions not revoked on archive/anonymize — FIXED 🔵 Low
**Risk:** Archiving or anonymizing a user set `is_active = false` and banned the auth account, but existing JWTs remained valid until expiry (up to 1 hour). The user could stay logged in.
**Fix:** All archive and anonymize operations now call the Supabase admin logout endpoint to force-revoke all active sessions immediately.

---

## 7. HTTP Security Headers

All headers added to `next.config.js` and applied to every route:

| Header | Value | Fix |
|---|---|---|
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `X-Content-Type-Options` | `nosniff` | Prevents MIME sniffing |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unused browser APIs |
| `Content-Security-Policy` | script/style/connect/img/font/frame/form directives | Restricts resource loading |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS on all future visits |

---

## 8. Operational Security

### 8.1 Next.js outdated with known CVEs — FIXED
Updated `next` from `14.2.5` → `14.2.35` (30 patch versions). The image optimizer (`/_next/image`) was disabled — it was unused and represented an unnecessary DoS surface.

### 8.2 Duplicate enrollment rows possible — FIXED
Concurrent CSV imports or double-clicks could create duplicate rows in `class_students` and `class_teachers`, causing duplicate students in gradebook. All enrollment inserts switched to `upsert` with `ignoreDuplicates: true` backed by UNIQUE constraints.

### 8.3 Year rollover could leave all years deactivated — FIXED
If the rollover operation failed mid-way, it could deactivate the previous active year without successfully activating the new one — leaving the platform with no active year. Fix: activate the new year first, then deactivate others.

### 8.4 Year rollover did not roll back on partial failure — FIXED
If group or class creation failed mid-rollover, already-created groups and classes were left orphaned. Fix: all created entities tracked and deleted in FK-safe order on any failure.

### 8.5 Archived students included in year rollover — FIXED
The year rollover copied all students including archived ones into the new year. Fix: `is_active = true` filter applied to the profile fetch.

---

## 9. Known Remaining Gaps (Accepted)

### 9.1 Phone + email visible to all same-tenant users — ACCEPTED MEDIUM
The `view_same_tenant_profiles` RLS policy exposes all profile fields — including `phone` and `email` — to every authenticated member of the same mosque. Fixing this requires a significant rewrite of the teacher list query on the class detail page. Accepted risk: all users within a mosque know each other; this is a contact-info exposure to known parties, not strangers.

### 9.2 Client-side only MIME validation on file uploads — ACCEPTED MEDIUM
File type is validated via browser-reported MIME type only (`f.type`), which is trivially spoofed by renaming a file. Both submission-files and student-reports buckets are affected. Mitigated by the fact that both buckets are private (signed URLs only). A full fix requires either an API route that reads magic bytes server-side or a Supabase Edge Function.

---

## 10. Still Pending (Not Yet Implemented)

| Item | Priority | Notes |
|---|---|---|
| Discord webhook alert on anonymize | High | ~30 min. See `SECURITY_TODO.md §3b` |
| Custom SMTP via Resend | **Blocker for launch** | In progress — DNS propagating, Supabase configured, awaiting domain verification |
| Server-side file type validation | Medium | Magic byte check in API route or Edge Function |
| Atomic invite via Postgres RPC | Medium | Auth user created before DB writes — orphan risk on failure |
| PITR backups | Medium | Daily snapshots only; ~€100/month add-on |
| Supabase CLI migrations | Low | All schema changes currently applied manually |
| Parental consent flow | Legal requirement | GDPR — mosque schools teach minors age 6–18 |
| Data Processing Agreements | Legal requirement | DPA with each mosque + Supabase sub-processor |
