# MasjidConnect

Digital platform for mosque education schools — built with Next.js 14 + Supabase.

**Production:** [https://masjid-connect.be](https://masjid-connect.be)

## Stack

- **Frontend + Backend**: Next.js 14 (App Router)
- **Database + Auth + Storage**: Supabase
- **Styling**: Tailwind CSS
- **Hosting**: Vercel
- **Domain**: `masjid-connect.be` (Combell registrar, DNS via Combell, A-records → Vercel)

---

## Local setup

### 1. Clone the repository
```bash
git clone <your-repo>
cd masjidconnect
npm install
```

### 2. Create a Supabase project
1. Go to [supabase.com](https://supabase.com) and create a free project
2. Open the **SQL Editor** and run the full `supabase/schema.sql` file
3. Go to **Storage** and create 5 buckets:
   - `submission-files` — Private
   - `module-documents` — Private
   - `student-reports` — Private
   - `avatars` — Public
   - `tenant-logos` — Public

### 3. Set environment variables
```bash
cp .env.example .env.local
```
Fill in your Supabase URL and keys (found in Supabase → Settings → API).

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (server-only, never exposed to client) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` for local dev |
| `DISCORD_FEEDBACK_WEBHOOK_URL` | Optional — posts user feedback to a Discord channel |

### 4. Start the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Creating the first Super Admin

1. Go to Supabase → **Authentication → Users** → **Add user**
2. Create a user with your email
3. Go to **Table Editor → profiles** and set the `role` column to `super_admin`
4. Set `tenant_id` to NULL
5. Log in at `/login` — you'll see the Super Admin dashboard

---

## Project structure

```
app/
  login/                    — Login page
  (dashboard)/
    dashboard/              — Role-specific home dashboard
    klassen/                — Class list + detail + grades + reports
    huiswerk/               — Assignments + submissions
    lesmodules/             — Course modules + documents
    aanwezigheid/           — Attendance marking and history
    rooster/                — Weekly schedule
    agenda/                 — Calendar view
    beheer/                 — Admin: user management, year transition
    superadmin/             — Super admin: all mosques overview
components/
  layout/                   — Sidebar
  features/
    assignments/            — Homework components
    modules/                — Course module components
    admin/                  — Management components
    announcements/          — Announcements card
    feedback/               — Feedback button
lib/
  supabase/                 — Supabase client helpers
  hooks/                    — useProfile and other hooks
  types.ts                  — TypeScript interfaces
  utils.ts                  — Utility functions
supabase/
  schema.sql                — Full database schema with RLS policies
```

---

## Deploying to Vercel

Production runs on Vercel at `masjid-connect.be`.

### Environment variables (Vercel production)
| Key | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only) |
| `NEXT_PUBLIC_SITE_URL` | `https://masjid-connect.be` |
| `DISCORD_FEEDBACK_WEBHOOK_URL` | Optional Discord webhook for feedback notifications |

### DNS (Combell)
A-records for both apex and `www` pointing to Vercel's anycast IP (see Vercel
Domains panel for the current address). **No AAAA records** — they point to
Combell servers and break IPv6 clients. Mail records (MX, SPF, DKIM, CNAMEs
for `autoconfig`/`autodiscover`/`mail`) remain on Mailprotect.

### Supabase Auth
- Site URL: `https://masjid-connect.be`
- Redirect URLs: `https://masjid-connect.be/**` and `http://localhost:3000/**` for local dev

---

## Roles

| Role | Description |
|---|---|
| `super_admin` | MasjidConnect operator — sees all mosques, creates tenants |
| `admin` | Mosque coordinator — manages classes and users within their mosque |
| `teacher` | Teacher — assigns homework, shares course materials, marks attendance |
| `student` | Student — submits assignments, views course materials and grades |

---

## Planned features
- Schedule export (ICS / Google Calendar)
- Parent portal (linked to child account)
- In-app messaging (replace WhatsApp usage)
- Email notifications (Resend)
- Payment integration (Stripe — school fees)
- Multilingual support (NL / FR / AR)
- Quran memorisation tracker (hifz progress)
- Native mobile app (after PWA proves value)
