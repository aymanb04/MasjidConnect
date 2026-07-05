-- Migration 19 — Rapport (report card) generation, teacher-drafts / admin-publishes
-- STATUS: NOT YET APPLIED. Written 2026-07-04, revised 2026-07-05.
-- Apply + verify against a HEALTHY db (not the nano box mid-incident), then commit
-- (house rule: apply-then-commit).
--
-- MODEL (two tables, because editing is per-subject-teacher):
--   rapport_cards  — one per (student, school_year, semester); holds status + publish.
--   rapport_lines  — one per (card, subject/class); holds that subject's score + comment.
-- Splitting lines out lets each subject's teacher save ONLY their own line (no JSON
-- blob clobbering when two subject-teachers edit the same student's card at once).
--
-- SCORING: the per-subject `result` is SNAPSHOT at generation (a straightforward
-- earned/max average, computed app-side) and is freely editable before publish, so a
-- school with a different formula just types their own number. The table is
-- formula-agnostic — it only stores the final value.
--
-- FLOW:  draft (teachers fill) -> admin reviews/edits -> published (student sees).
--        Publish = an admin-only UPDATE of rapport_cards.status; RLS enforces it.
--
-- RLS follows the tenant-scoped, (SELECT helper()) style of migrations 7b/12.

-- ===========================================================================
-- rapport_cards
-- ===========================================================================
create table if not exists public.rapport_cards (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id)       on delete cascade,
  student_id     uuid not null references public.profiles(id)      on delete cascade,
  school_year_id uuid not null references public.school_years(id)  on delete cascade,
  semester       int  not null check (semester in (1, 2)),
  status         text not null default 'draft' check (status in ('draft','published')),
  level_snapshot text,                                   -- e.g. "5M" at generation time
  generated_by   uuid references public.profiles(id),
  published_by   uuid references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_at   timestamptz,
  constraint rapport_cards_unique unique (student_id, school_year_id, semester)
);

create index if not exists idx_rapport_cards_tenant   on public.rapport_cards(tenant_id);
create index if not exists idx_rapport_cards_student  on public.rapport_cards(student_id);
create index if not exists idx_rapport_cards_year_sem on public.rapport_cards(school_year_id, semester);

alter table public.rapport_cards enable row level security;

-- Staff see all cards in their tenant; a student sees only their own, only once published.
create policy rapport_cards_select on public.rapport_cards
  for select to authenticated
  using (
    (select is_super_admin())
    or (
      tenant_id = (select get_my_tenant_id())
      and (
        (select get_my_role())::text in ('admin','teacher','leerlingenbegeleiding')
        or (student_id = (select auth.uid()) and status = 'published')
      )
    )
  );

-- Generate a draft: admin or teacher of the tenant (must start as draft).
create policy rapport_cards_insert on public.rapport_cards
  for insert to authenticated
  with check (
    tenant_id = (select get_my_tenant_id())
    and (select get_my_role())::text in ('admin','teacher')
    and status = 'draft'
  );

-- Card-level edits (incl. publishing) are ADMIN-only — the final say + release gate.
-- Teachers never touch the card row; they work on rapport_lines below.
create policy rapport_cards_update on public.rapport_cards
  for update to authenticated
  using (tenant_id = (select get_my_tenant_id()) and (select get_my_role())::text = 'admin')
  with check (tenant_id = (select get_my_tenant_id()) and (select get_my_role())::text = 'admin');

create policy rapport_cards_delete on public.rapport_cards
  for delete to authenticated
  using (tenant_id = (select get_my_tenant_id()) and (select get_my_role())::text = 'admin');

create trigger set_rapport_cards_updated_at
  before update on public.rapport_cards
  for each row execute function public.update_updated_at();

-- ===========================================================================
-- rapport_lines
-- ===========================================================================
create table if not exists public.rapport_lines (
  id               uuid primary key default gen_random_uuid(),
  rapport_card_id  uuid not null references public.rapport_cards(id) on delete cascade,
  class_id         uuid not null references public.classes(id)       on delete cascade,
  subject_snapshot text,                 -- subject label frozen for print stability
  result           numeric,              -- straightforward avg at generation; editable
  comment          text,
  updated_by       uuid references public.profiles(id),
  updated_at       timestamptz not null default now(),
  constraint rapport_lines_unique unique (rapport_card_id, class_id)
);

create index if not exists idx_rapport_lines_card  on public.rapport_lines(rapport_card_id);
create index if not exists idx_rapport_lines_class on public.rapport_lines(class_id);

alter table public.rapport_lines enable row level security;

-- SELECT: mirror the card's visibility (staff in tenant; student only own + published).
create policy rapport_lines_select on public.rapport_lines
  for select to authenticated
  using (exists (
    select 1 from public.rapport_cards c
    where c.id = rapport_card_id and (
      (select is_super_admin())
      or (
        c.tenant_id = (select get_my_tenant_id())
        and (
          (select get_my_role())::text in ('admin','teacher','leerlingenbegeleiding')
          or (c.student_id = (select auth.uid()) and c.status = 'published')
        )
      )
    )
  ));

-- INSERT: admin, or the teacher of that subject, onto a DRAFT card in their tenant.
create policy rapport_lines_insert on public.rapport_lines
  for insert to authenticated
  with check (exists (
    select 1 from public.rapport_cards c
    where c.id = rapport_card_id
      and c.tenant_id = (select get_my_tenant_id())
      and c.status = 'draft'
      and ((select get_my_role())::text = 'admin' or public.am_i_teacher_of_class(class_id))
  ));

-- UPDATE: admin may edit any line (final say); a teacher may edit ONLY their own
-- subject's line, and only while the card is still a draft.
create policy rapport_lines_update on public.rapport_lines
  for update to authenticated
  using (exists (
    select 1 from public.rapport_cards c
    where c.id = rapport_card_id
      and c.tenant_id = (select get_my_tenant_id())
      and (
        (select get_my_role())::text = 'admin'
        or (public.am_i_teacher_of_class(class_id) and c.status = 'draft')
      )
  ))
  with check (exists (
    select 1 from public.rapport_cards c
    where c.id = rapport_card_id
      and c.tenant_id = (select get_my_tenant_id())
      and (
        (select get_my_role())::text = 'admin'
        or (public.am_i_teacher_of_class(class_id) and c.status = 'draft')
      )
  ));

create policy rapport_lines_delete on public.rapport_lines
  for delete to authenticated
  using (exists (
    select 1 from public.rapport_cards c
    where c.id = rapport_card_id
      and c.tenant_id = (select get_my_tenant_id())
      and (select get_my_role())::text = 'admin'
  ));

create trigger set_rapport_lines_updated_at
  before update on public.rapport_lines
  for each row execute function public.update_updated_at();

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (on a healthy db):
--   * teacher fills only their own subject's line; cannot edit another subject's
--   * teacher cannot publish (card UPDATE is admin-only)
--   * admin can edit any line + publish; student sees card+lines ONLY when published
--   * cross-tenant: admin of mosque A cannot see/edit mosque B's cards or lines
-- ---------------------------------------------------------------------------
