# MasjidConnect

School administration platform for mosque weekend schools. Coordinators manage classes and enrolment, teachers set homework, share course material and mark attendance, and students submit work and see their grades. It runs in production at [masjidconnect.be](https://www.masjidconnect.be) and is in daily use by a paying client.

Built and operated solo: product, schema, application code, deployment and support.

## Screenshots

> Replace these three with real images. Dashboard, attendance marking, class detail. Put the files in `docs/img/`.

![Dashboard](docs/img/dashboard.png)
![Attendance](docs/img/attendance.png)
![Class detail](docs/img/class-detail.png)

## Multi tenancy

Every mosque is a tenant. Tenant isolation is enforced in Postgres through row level security rather than in application code, so a missing filter in a query cannot leak another school's data. Policies live in `supabase/schema.sql`.

Four roles:

| Role | Scope |
| --- | --- |
| `super_admin` | Platform operator. Sees all tenants, creates new ones. |
| `admin` | Mosque coordinator. Manages classes and users inside one tenant. |
| `teacher` | Sets homework, shares modules, marks attendance. |
| `student` | Submits work, reads material, sees grades. |

Storage follows the same rule. Submission files, module documents and student reports sit in private buckets behind signed access. Avatars and tenant logos are public.

The school year is the other axis. A year transition rolls classes forward, archives the previous year's grades and attendance, and keeps historical records readable without leaving them editable.

> Add two or three sentences on how the year transition actually works. It is one of the few operations that touches every table at once and it is worth explaining.

## What broke against real data

Most of the interesting work happened after the first school started using it. These are the problems that only appear once there are real rows, real files and real concurrent users.

**Row level security cost.** Policies that read correctly turned out to be expensive, because a policy expression is evaluated per row and a subquery inside one runs per row as well.

> Say what you changed. Hoisting the tenant lookup, an index that made the policy sargable, whatever it was, plus a before and after timing if you have one.

**N plus one queries.** Listing a class with its students, assignments and submissions fanned out into one query per child record.

> Name the pages this hit and how you fixed it, embedded selects, a view, batching.

**Bulk CSV import timeouts.** Importing a full school's student list exceeded the serverless function limit on the first attempt.

> Batch size, chunking, background processing, whichever it was, and what the ceiling is now.

**Connection pooling.** Serverless functions open a connection per invocation, and Postgres runs out long before traffic looks heavy. Routed through Supavisor in transaction mode.

> Add the failure symptom you actually saw, so the reader knows this was a real incident and not a precaution.

**GDPR endpoints.** The platform holds minors' names, attendance and grades, so data subject access and erasure had to be real operations rather than a policy document.

> One or two sentences on what these endpoints do and how erasure interacts with tenant data you are legally required to keep.

## Stack

Next.js 14 with the App Router, doing both frontend and API routes. Supabase for Postgres, auth and storage. Tailwind for styling. Hosted on Vercel.

## Project structure

```
app/
  login/                  Login
  (dashboard)/
    dashboard/            Role specific home
    klassen/              Classes, grades, reports
    huiswerk/             Assignments and submissions
    lesmodules/           Course modules and documents
    aanwezigheid/         Attendance
    rooster/              Weekly schedule
    agenda/               Calendar
    beheer/               Admin, user management, year transition
    superadmin/           Cross tenant overview
components/
  layout/                 Sidebar
  features/               Assignments, modules, admin, announcements, feedback
lib/
  supabase/               Client helpers
  hooks/                  useProfile and others
  types.ts                Shared interfaces
  utils.ts
supabase/
  schema.sql              Schema and RLS policies
```

## Roadmap

Schedule export to ICS and Google Calendar, a parent portal linked to a child account, and Quran memorisation tracking.

## Running locally

```bash
git clone <repo>
cd masjidconnect
npm install
cp .env.example .env.local
npm run dev
```

Then create a Supabase project, run `supabase/schema.sql` in the SQL editor, and create the storage buckets listed above with the privacy settings shown.

Environment variables:

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key, server only, never sent to the client |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` in development |
| `DISCORD_FEEDBACK_WEBHOOK_URL` | Optional, posts in app feedback to Discord |

Operator setup, production DNS and deployment notes are kept out of this repo.
