-- 42: activiteiten in de agenda.
--
-- AANLEIDING (2026-10-11), de school: "Ik kan als Beheer geen activiteiten
-- toevoegen aan de agenda." Klopt: de agenda toonde enkel huiswerkdeadlines en
-- er bestond geen tabel om iets anders in te zetten.
--
-- Een activiteit is een dag of een reeks dagen (starts_on .. ends_on), met of
-- zonder uur. Geen uur = de hele dag. Datum + lokaal uur in plaats van
-- timestamptz: "Suikerfeest, 30/3 tot 1/4" is een kalenderdag in Brussel, geen
-- tijdstip, en mag niet verschuiven met een tijdzone.
--
-- `audience` volgt het patroon van de aankondigingen (migratie 17):
--   'school'   -> iedereen van de school
--   'group'    -> leerlingen en leerkrachten van een klas in group_id
--   'teachers' -> enkel personeel (bv. personeelsvergadering)
--
-- `is_closure` = er is geen les (vakantie, feestdag). Wordt in de agenda anders
-- getoond. Later ook bruikbaar voor de aanwezigheden (ROADMAP: vakantiedagen).
--
-- Schrijven: enkel beheer (admin) van de eigen school, en super_admin.
--
-- Idempotent. RUN IN: Supabase SQL editor.

BEGIN;

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id          uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id   uuid NOT NULL,
  title       text NOT NULL,
  description text,
  starts_on   date NOT NULL,
  ends_on     date NOT NULL,
  -- Beide null = de hele dag.
  start_time  time,
  end_time    time,
  audience    text NOT NULL DEFAULT 'school',
  group_id    uuid,
  is_closure  boolean NOT NULL DEFAULT false,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_pkey PRIMARY KEY (id),
  CONSTRAINT calendar_events_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT calendar_events_group_fkey FOREIGN KEY (group_id)
    REFERENCES public.groups(id) ON DELETE CASCADE,
  CONSTRAINT calendar_events_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT calendar_events_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT calendar_events_dates_check CHECK (ends_on >= starts_on),
  CONSTRAINT calendar_events_audience_check CHECK (audience IN ('school', 'group', 'teachers')),
  -- Een groep hoort bij 'group' en enkel daar.
  CONSTRAINT calendar_events_group_check CHECK ((audience = 'group') = (group_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_tenant_dates
  ON public.calendar_events(tenant_id, starts_on);
CREATE INDEX IF NOT EXISTS idx_calendar_events_group
  ON public.calendar_events(group_id);

DROP TRIGGER IF EXISTS calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

-- De groepen waarin ik les volg of lesgeef. SECURITY DEFINER, zoals
-- assignment_is_targeted() (migratie 32): een policy die zelf class_students en
-- class_teachers joint, betaalt hun RLS bij elke rij en kan bij het plannen al
-- vastlopen (zie de 42P17-storing van migratie 31).
CREATE OR REPLACE FUNCTION public.my_group_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.group_id FROM classes c
  JOIN class_students cs ON cs.class_id = c.id
  WHERE cs.student_id = auth.uid() AND c.group_id IS NOT NULL
  UNION
  SELECT c.group_id FROM classes c
  JOIN class_teachers ct ON ct.class_id = c.id
  WHERE ct.teacher_id = auth.uid() AND c.group_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.my_group_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.my_group_ids() TO authenticated;

-- ---- Lezen -----------------------------------------------------------
DROP POLICY IF EXISTS calendar_events_read ON public.calendar_events;
CREATE POLICY calendar_events_read ON public.calendar_events
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = 'admin'
        OR audience = 'school'
        OR (audience = 'teachers'
            AND (SELECT get_my_role())::text = ANY (ARRAY['teacher', 'leerlingenbegeleiding']))
        OR (audience = 'group' AND group_id IN (SELECT public.my_group_ids()))
      )
    )
  );

-- ---- Schrijven: enkel beheer van de eigen school ---------------------
-- Een groep moet van dezelfde school zijn: anders kon een admin een activiteit
-- aan andermans groep hangen (dezelfde soort lek als migratie 26 dichtte).
DROP POLICY IF EXISTS calendar_events_admin_write ON public.calendar_events;
CREATE POLICY calendar_events_admin_write ON public.calendar_events
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (tenant_id = (SELECT get_my_tenant_id()) AND (SELECT get_my_role())::text = 'admin')
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (SELECT get_my_role())::text = 'admin'
      AND (group_id IS NULL OR EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id = calendar_events.group_id AND g.tenant_id = (SELECT get_my_tenant_id())
      ))
    )
  );

COMMIT;

-- ---- Verificatie -----------------------------------------------------
-- Als admin:     INSERT werkt in de eigen school, niet met andermans tenant_id
--                of group_id (0 rijen / RLS-fout).
-- Als leerkracht/leerling: INSERT geweigerd.
-- Als leerling:  'teachers' zie je nooit; 'group' enkel voor je eigen groep.
-- SELECT polname FROM pg_policy WHERE polrelid = 'public.calendar_events'::regclass;
