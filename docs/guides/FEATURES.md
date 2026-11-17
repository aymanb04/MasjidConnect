# MasjidConnect — Features & Flows

**Generated 2026-07-06 from the live database schema (migrations 1–19, 37 tables) and the app routes.**
This document is three things at once:

1. **A feature tour** — every module, what it does, and the step-by-step flow per role (§2). Each section is written so it can be lifted directly into a tutorial script or help page.
2. **A database map** — every table, grouped by feature, with what it stores (§3).
3. **A marketing one-pager in Dutch** (§4) — ready to paste into a website or brochure.

---

## 1. What is MasjidConnect?

**MasjidConnect is a complete school-management platform for mosque education (Arabische en islamitische scholen) in Belgium.** One login for the whole school: classes, homework, grades, attendance, report cards, student dossiers, fee tracking, payroll, and parent-teacher meetings — replacing the mix of paper, WhatsApp groups, and Excel sheets most weekend schools run on today.

- **Multi-tenant SaaS** with EU hosting and data isolation enforced in the database itself — the full trust & GDPR story is in §2.14.
- **Dutch-language UI**, bilingual **Arabic/Dutch report cards**; works on any device, installable as a PWA.

### The five roles

| Role | Dutch | What they can do |
|---|---|---|
| `super_admin` | Super Admin | Platform owner. Sees all mosques; manages tenants, reads feedback inbox. |
| `admin` | Beheerder | Runs their own mosque: users, classes, payments, rapports, everything — but only inside their tenant. |
| `teacher` | Leerkracht | Their own classes: homework, grades, attendance, lesson materials, rapport lines, oudercontact slots. |
| `student` | Leerling | Sees own classes, homework, scores, published rapports; submits work; books oudercontact. |
| `leerlingenbegeleiding` | Leerlingbegeleiding | Student counselor: reads every dossier in the tenant, adds notes and documents. No classes of their own, no payment access. |

**Key structural concept — Groep vs Klas/Vak:** a *groep* is an age/level group (e.g. "Groep 3"); a *klas* is one subject within that group (e.g. "Arabisch — Groep 3"). Enrolling a student in a group auto-enrolls them in **all** active classes of that group. Each subject has its own teacher; one teacher can teach multiple subjects.

---

## 2. Feature tour — flows per module

Everything below surfaces on a role-aware **dashboard** (`/dashboard`): today's schedule, announcements meant for you, open homework (student) or ungraded submissions (teacher), attendance alerts (staff), and clickable tiles into each module — admins also see school counts at a glance.

### 2.1 Getting started: school setup (admin)

**Pages:** `/beheer`, `/klassen`

Flow (a new mosque, from zero to running):
1. MasjidConnect (super_admin) creates the **tenant** — mosque name, contact info, subscription.
2. The mosque admin logs in and creates a **schooljaar** (e.g. 2026–2027, start/end date).
3. Admin creates **groepen** (Groep 1, Groep 2, …) inside the school year.
4. Admin creates **klassen/vakken** per group (Arabisch, Islam, Koran, …), each with a color and icon.
5. Admin assigns a **teacher to each subject** — a teacher can hold several subjects.
6. Students are enrolled per group (auto-enrolls into all group classes) or moved per class individually.

### 2.2 User management & invitations (admin)

**Pages:** `/beheer`

- **Invite-only platform** — there is no open sign-up. The admin invites each user by email with a role (student, teacher, admin, or leerlingenbegeleiding) and optional group/class enrollment. The invite creates the account and sends an email; invitations expire after 7 days.
- **CSV import**: bulk-create a whole class list of students in one upload.
- **Archive / reactivate**: deactivating a user bans the account and revokes sessions — fully reversible.
- **GDPR erasure ("anonymize")**: irreversibly scrubs all personal data and uploaded files while keeping an anonymous row so class statistics stay intact. Cannot be reactivated afterwards.

Tutorial script — *"Een leerling toevoegen"*:
1. Ga naar **Beheer** → "Gebruiker uitnodigen".
2. Vul e-mail, voornaam, achternaam in; kies rol **Leerling**.
3. Kies de **groep** — de leerling wordt automatisch in alle vakken van die groep ingeschreven.
4. De leerling ontvangt een e-mail, kiest een wachtwoord en zit meteen in de juiste klassen.

### 2.3 Year transition — jaarovergang (admin)

**Page:** `/beheer/jaarovergang`

At the end of a school year the admin runs the year-transition wizard: create the new school year, recreate the group/class structure, and move students up a group in bulk. No re-typing 200 student names every September.

### 2.4 Rooster & agenda (everyone)

**Pages:** `/rooster`, `/agenda`

- Admin/teacher define the **weekly schedule** per class: day of week, start/end time, location.
- Every user sees their own **rooster** (only the classes they teach or follow) and an **agenda** with homework deadlines and the school's **activities**.
- The **admin** adds activities to the agenda: one day or several, all day or with times, for the whole school, one group, or staff only. Days marked **Geen les** (holidays, Eid) stand out in the calendar.

### 2.5 Announcements — mededelingen (admin/teacher)

**Pages:** dashboard

Targeted school communication with four audiences:
- **Hele school** — everyone in the tenant.
- **Klas** — one subject's students.
- **Groep** — all students of a group (all their subjects).
- **Enkel leerkrachten** — staff-only internal notice.

Flow: staff writes title + message, picks the audience, publishes. Students/teachers see exactly the announcements meant for them on their dashboard — nothing else.

### 2.6 Homework — huiswerk (teacher ↔ student)

**Pages:** `/huiswerk`, `/huiswerk/[id]`

Teacher flow:
1. Create an assignment in one of your classes: title, description, **due date**, optional **max score**.
2. Choose who gets it (the whole class, or selected pupils with an optional task each) and whether it is handed in through the app or on paper.
   Homework can be saved as a **draft** (Concept) and published later; **Bewerken** can change who gets it at any time.
3. As submissions come in, open each one, read/download the work, and give a **score + comment**. Status moves submitted → graded.

Student flow:
1. **Huiswerk** lists every open assignment across all your subjects, with deadlines.
2. Open it, type your answer and/or upload files (stored in private storage — only you, your teacher, and the admin can ever open them via short-lived signed links).
3. After grading you see your score and the teacher's comment. One submission per assignment; you can update it until it's graded.

### 2.7 Lesson materials — lesmodules (teacher → student)

**Pages:** `/lesmodules`, `/lesmodules/[id]`

Teachers organize course material into ordered **modules** per class (e.g. "Thema 1: het alfabet") and upload documents into them (PDFs, worksheets). Visibility can be toggled per module, so material can be prepared ahead and released when ready. Students see the modules of their own classes and download via secure signed links.

### 2.8 Gradebook — puntenlijst & scores (teacher/admin/student)

**Page:** `/klassen/[klasId]/scores`

One grid per class with **three score sources**:
- **Homework scores** — flow in automatically from graded submissions.
- **Manual test columns** — for offline/paper tests: add a column (title, max score, date) and type the scores straight into the grid. Built for schools that grade on paper first.
- **Exam scores** — one exam per student/class/**semester** (score out of a configurable max, default /20), entered on a separate card.

The grid computes a **weighted average** per student (Σ earned / Σ max — a 40-point test counts twice as heavy as a 20-point one). The database guards that scores never exceed their maximum.

**Student view — "Mijn punten":** the *same route* shows students a read-only view of **their own** scores only: every homework and test score, the identical running average the teacher sees, and exams listed separately. Students always know where they stand between rapports.

### 2.9 Attendance — aanwezigheid (teacher/admin)

**Page:** `/aanwezigheid`

Daily flow (takes under a minute):
1. Pick class + date (today, or **backfill a past date** — one session per class per day).
2. Every student defaults to **aanwezig**; tap to switch to **afwezig / te laat / gewettigd**, optionally with a note.
3. Save. Done.

Built-in oversight:
- **Year overview per student** — full attendance history and absence stats.
- **Dashboard alerts** — flags days that were never marked and students absent **two sessions in a row**, so nobody falls through the cracks.
- Last-session absentees are shown when marking, so teachers can follow up.

### 2.10 Report cards — rapporten (admin → teacher → admin → student)

**Pages:** `/rapporten`, `/rapporten/[cardId]`

Two rapports per year (semester 1 & 2), **bilingual Arabic/Dutch**, printed to PDF straight from the browser. The flow mirrors how schools actually work:

1. **Admin generates** the rapport cards — one per student, single or in bulk. Each subject line **auto-fills with the student's gradebook average**, so the rapport starts 90% done.
2. **Each subject teacher** opens the draft and fills in *their own subject only*: adjust the score, write the comment (Vak / Resultaat / Commentaar vakleerkracht). The database itself guarantees a teacher can't touch another teacher's subject.
3. **Admin reviews** — can edit any line (final say) — and **publishes**. Publishing is admin-only, enforced at the database level.
4. **Student sees the published rapport** and prints it: mosque header + logo, student/level/teacher/year block, subject table, and three signature lines (parent, teacher, coordinator). Bulk print concatenates all cards into one multi-page PDF.

Auto-scores are always editable — a school with its own formula just types the final number.

### 2.11 Student dossiers (admin/counselor/teacher)

**Pages:** `/dossiers`, `/dossiers/[studentId]`

One place for everything about a student that isn't a grade:
- **Contact & personal details** — date of birth, address, parent email/phone, emergency contact.
- **Families** — siblings linked into one family record (drives the family fee, §2.12).
- **Notes** — timestamped observations by staff ("gesprek met ouders gehad…").
- **Documents** — contracts and other external PDFs; stored in a private bucket. The platform deliberately offers **no document type for health or care information**: that option was removed in September 2026 after it went unused, so no special-category data is collected by design.

Access model (the selling point): **admin and leerlingenbegeleiding** see all dossiers in the tenant; a **teacher** sees the dossiers of students they actually teach — teach a student in any subject and you can see their whole dossier; **students see none of it** (notes and documents are staff-only).

### 2.12 Payments — betalingen (admin only)

**Page:** `/betalingen`

Two sides, both strictly admin-only (teachers, students, and counselors have zero access):

**Student fees:**
1. Per school year, configure the two fee types and their due dates: **lidgeld** (membership, per student) and **chart** (per family — one sibling pays, the whole family is covered).
2. Register payments as they come in (amount, date, note). The database enforces one membership per student per year and one chart per family per year.
3. KPIs show who has paid and who is outstanding.

**Teacher payroll:**
1. Set an **hourly rate** per staff member.
2. Log **hours per month**; the amount is computed as hours × rate, and the rate is snapshotted so later rate changes never rewrite history. One entry per staff member per month.

### 2.13 Parent-teacher meetings — oudercontact (teacher/admin/student)

**Page:** `/oudercontact`

1. **Teacher (or admin) opens time slots**: start/end time, optional class, capacity per slot.
2. **Students book a slot** for their parents (or the admin books on a parent's behalf — parents don't need an account).
3. One booking per student per slot; capacity is respected; the teacher sees their bookings lined up for the evening.

### 2.14 Platform, trust & GDPR

**Pages:** `/privacy`, `/voorwaarden`, `/akkoord`

- **Terms gate:** every user must accept the current Voorwaarden version before entering; when terms change, everyone is re-prompted (`/akkoord`).
- **GDPR erasure** built in (§2.2): scrub-not-delete keeps statistics honest while removing all PII and files.
- **Student files are private.** Every bucket holding student data — homework uploads, lesson materials, dossier documents, report cards — is private, and links are short-lived signed URLs generated per click. (`tenant-logos` is deliberately public: it holds the school's own logo, which is not personal data. It is the only public bucket — the unused `avatars` bucket was deleted in September 2026.)
- **Tenant isolation in the database**: every table carries the mosque's tenant id and PostgreSQL Row Level Security guarantees no query can cross mosques — even a bug in the app can't leak another school's data.
- **EU-hosted** (AWS eu-west-1, Ireland); the mosque is the data controller, MasjidConnect the processor — the same model as Smartschool.
- **In-app feedback:** every user can report a bug / suggestion / question from any page; it lands in the super_admin inbox (with optional Discord notification).
- **Superadmin panel** (`/superadmin`): platform owner manages tenants and subscriptions (separate from the mosques' internal fee tracking).
- **Rate limiting** on all sensitive operations; **role checks server-side** on every privileged API route.

---

## 3. Database map

Every table is tenant-scoped (directly via `tenant_id` or through its parent) and protected by Row Level Security.

### Core & structure
| Table | What it stores |
|---|---|
| `tenants` | One row per mosque: name, contact, logo, subscription status/price/interval, trial end. |
| `profiles` | One row per user (extends Supabase auth): role, name, contact, `is_active`, `is_anonymized`, terms acceptance. |
| `school_years` | School years per tenant (name, start/end, active flag). |
| `groups` | Age/level groups within a school year (unique name per tenant+year). |
| `classes` | Subjects (vakken) within a group: name, description, color, icon, archive flag. |
| `class_teachers` | Which teacher teaches which subject (unique per pair). |
| `class_students` | Which student follows which subject (unique per pair). |
| `class_sessions` | Weekly rooster: day-of-week, start/end time, location per class. |
| `announcements` | Messages with audience targeting: school / class / group / teachers-only. |
| `calendar_events` | Agenda activities: date range, optional times, audience school / group / staff-only, "Geen les" flag. Only the admin writes. |
| `invitations` | Pending invites: email, role, optional class, secure token, 7-day expiry. |
| `audit_logs` | Audit trail: action, entity, metadata, IP address (super_admin only). |
| `payments` | Tenant→MasjidConnect **subscription** billing (Stripe-style). *Not student fees.* |

### Learning
| Table | What it stores |
|---|---|
| `assignments` | Homework per class: title, description, due date, max score, text/file submission toggles. |
| `submissions` | One submission per student per assignment: text, status (draft/submitted/graded/returned). |
| `submission_files` | Uploaded files per submission (private bucket, path stored). |
| `submission_feedback` | One feedback row per submission: score (≥0) + teacher comment. |
| `lesson_modules` | Ordered course-material modules per class, visibility toggle. |
| `module_documents` | Documents inside a module (private bucket). |

### Scores
| Table | What it stores |
|---|---|
| `class_tests` | Manual/offline test columns: title, max score, date. |
| `test_scores` | One score per student per test. |
| `exam_scores` | One paper-exam score per student/class/**semester** (score ≤ max enforced in DB). |

### Attendance
| Table | What it stores |
|---|---|
| `attendance_sessions` | One session per class per date, with notes. |
| `attendance_records` | Per student per session: present / absent / late / excused + note. |

### Rapport
| Table | What it stores |
|---|---|
| `rapport_cards` | One card per student/school-year/semester: status draft→published, level snapshot, generated_by/published_by. |
| `rapport_lines` | One line per card per subject: result + teacher comment; per-subject-teacher editing enforced by RLS. |

### Dossiers
| Table | What it stores |
|---|---|
| `families` | Family labels grouping siblings (drives the per-family chart fee). |
| `student_details` | 1:1 per student: DOB, gender, address, parent email/phone, emergency contact, family link. |
| `student_notes` | Staff-only timestamped notes on a student. |
| `student_documents` | Staff-only documents (contract / other) in a private bucket. |

### Payments (mosque-internal, admin-only)
| Table | What it stores |
|---|---|
| `fee_config` | Per school year: membership amount + chart amount + due dates. |
| `fee_payments` | Fee registrations — membership rows link a **student**, chart rows link a **family** (DB-enforced; one of each per year). |
| `staff_pay` | Hourly rate per staff member. |
| `payroll_entries` | Hours per month × rate snapshot = amount; one entry per staff/month. |

### Oudercontact
| Table | What it stores |
|---|---|
| `oudercontact_slots` | Teacher time slots: start/end, optional class, capacity. |
| `oudercontact_bookings` | One booking per student per slot; records who booked (student or admin on parent's behalf). |

### Platform
| Table | What it stores |
|---|---|
| `feedback` | In-app bug/suggestie/vraag reports → super_admin inbox, read flag. |

### Storage buckets (all private, signed-URL access only)
| Bucket | Contents |
|---|---|
| `submission-files` | Student homework uploads. |
| `module-documents` | Lesson-material files. |
| `student-documents` | Dossier documents. |

---

## 4. Marketing one-pager (Nederlands)

### MasjidConnect — het schoolplatform voor moskeescholen

**Alles voor uw weekendschool in één app.** Geen papieren puntenboekjes, geen WhatsApp-chaos, geen Excel-lijsten meer. MasjidConnect is gebouwd op maat van Arabische en islamitische scholen in België — in het Nederlands, met tweetalige rapporten (Arabisch/Nederlands).

**Voor het bestuur**
- Leerlingen uitnodigen per e-mail of importeren via CSV — in minuten opgezet.
- Lidgeld en chart per gezin opvolgen: wie betaalde, wie nog niet.
- Lonen van leerkrachten: uren × uurtarief, automatisch berekend per maand.
- Jaarovergang met één wizard: nieuwe klasstructuur, leerlingen stromen door.
- Mededelingen gericht versturen: hele school, één groep, één klas of enkel leerkrachten.

**Voor de leerkracht**
- Huiswerk uitdelen en verbeteren, met bestanden en feedback.
- Aanwezigheden nemen in minder dan een minuut — de app signaleert zelf wie twee lessen na elkaar afwezig was (in de app; er wordt geen e-mail of push verstuurd).
- Digitale puntenlijst voor toetsen op papier én online opdrachten, met automatisch gewogen gemiddelde.
- Rapporten: de punten staan er al ingevuld — enkel nakijken en commentaar schrijven.
- Oudercontact: tijdsloten openzetten; de leerling schrijft zichzelf in of de administratie boekt namens de ouder. Ouders hebben géén account.

**Voor de leerling (en thuis)**
- Eén plek voor lesrooster, huiswerk, lesmateriaal en punten ("Mijn punten").
- Het rapport verschijnt online zodra de school het publiceert — meteen af te drukken, tweetalig.

**Veilig en volgens de regels**
- Elke moskee heeft haar eigen, volledig afgeschermde omgeving — afgedwongen in de database zelf.
- Gegevens in de EU (Ierland). Privacyverklaring, voorwaarden en het recht op vergetelheid (GDPR-wissing) zijn ingebouwd, niet achteraf toegevoegd.
- Ingediende taken, lesmateriaal en dossierdocumenten staan in privéopslag; enkel de juiste rol krijgt toegang. De moskee blijft eigenaar van haar gegevens (verwerkingsverantwoordelijke), MasjidConnect is verwerker — hetzelfde model als Smartschool.

**MasjidConnect** · masjidconnect.be · Antwerpen

---

## 5. Tutorial index (suggested video/help-page scripts)

Each maps 1:1 to a flow above — record the screen while following the steps:

1. **Schooljaar & klassen opzetten** (§2.1)
2. **Leerlingen en leerkrachten uitnodigen (incl. CSV)** (§2.2)
3. **Het lesrooster instellen** (§2.4)
4. **Huiswerk geven en verbeteren** (§2.6) — leerkracht + leerlingperspectief
5. **Aanwezigheden nemen** (§2.9)
6. **De puntenlijst: toetsen, examens en gemiddelden** (§2.8)
7. **Rapporten genereren, invullen en publiceren** (§2.10) — het pronkstuk
8. **Dossiers en leerlingenbegeleiding** (§2.11)
9. **Lidgeld & lonen opvolgen** (§2.12)
10. **Oudercontact inplannen** (§2.13)
