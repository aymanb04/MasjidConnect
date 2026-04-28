# MasjidConnect

Digitaal platform voor moskee-onderwijs — gebouwd met Next.js 14 + Supabase.

## Stack

- **Frontend + Backend**: Next.js 14 (App Router)
- **Database + Auth + Storage**: Supabase
- **Styling**: Tailwind CSS
- **Animaties**: Framer Motion
- **Hosting**: Vercel (gratis)

---

## Opstarten (lokaal)

### 1. Repository klonen
```bash
git clone <jouw-repo>
cd masjidconnect
npm install
```

### 2. Supabase project aanmaken
1. Ga naar [supabase.com](https://supabase.com) en maak een gratis project aan
2. Ga naar **SQL Editor** en voer het volledige `supabase/schema.sql` bestand uit
3. Ga naar **Storage** en maak 4 buckets aan:
   - `submission-files` — Private
   - `module-documents` — Private
   - `avatars` — Public
   - `tenant-logos` — Public

### 3. Environment variabelen instellen
```bash
cp .env.example .env.local
```
Vul in `.env.local` jouw Supabase URL en keys in (te vinden in Supabase → Settings → API).

### 4. Dev server starten
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## Eerste Super Admin aanmaken

1. Ga naar Supabase → **Authentication → Users** → **Add user**
2. Maak een gebruiker aan met jouw e-mail
3. Ga naar **Table Editor → profiles** en pas de `role` aan naar `super_admin`
4. Verwijder de `tenant_id` (zet op NULL)
5. Log in via `/login` — je ziet nu het Super Admin dashboard

---

## Structuur

```
app/
  login/              — Loginpagina
  (dashboard)/
    dashboard/        — Rolspecifiek dashboard
    klassen/          — Klasoverzicht + detail
    huiswerk/         — Opdrachten + indieningen
    lesmodules/       — Modules + documenten
    beheer/           — Admin: gebruikers en klassen
    superadmin/       — Super admin: alle moskeeën
components/
  layout/             — Sidebar
  features/
    assignments/      — Huiswerk componenten
    modules/          — Lesmodule componenten
    admin/            — Beheer componenten
lib/
  supabase/           — Client + server helpers
  types.ts            — TypeScript types
  utils.ts            — Hulpfuncties
supabase/
  schema.sql          — Volledig database schema
```

---

## Deployen op Vercel

1. Push naar GitHub
2. Importeer in [vercel.com](https://vercel.com)
3. Voeg environment variabelen toe
4. Deploy — klaar!

---

## Rollen

| Rol | Beschrijving |
|-----|-------------|
| `super_admin` | Jij — ziet alle moskeeën, maakt tenants aan |
| `admin` | Coördinator van een moskee — beheert klassen en gebruikers |
| `teacher` | Leerkracht — geeft huiswerk op, deelt documenten |
| `student` | Leerling — dient taken in, bekijkt lesmateriaal |

---

## V2 features (nog te bouwen)
- Afwezigheidslijsten
- Admin rapportage dashboard
- E-mailnotificaties (Resend)
- Betalingsintegratie (Stripe)
- Progressive Web App (PWA)
- Berichtensysteem
