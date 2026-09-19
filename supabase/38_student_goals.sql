-- 38: een doel per leerling per vak.
--
-- AANLEIDING (2026-09-19), vraag van de school:
--   "Zouden we ook de doelstellingen per leerling ergens kunnen inzetten?
--    Bv leerling x begonnen bij surah 1 - doel is surah 10"
--
-- Wat er al was dekt dit niet. assignment_students.task_text is "je taak van
-- deze week" -- migratie 31 zegt er zelf bij dat het NIET de Hifz-opvolging is.
-- Een doel is iets anders: een vertrekpunt, een eindpunt, en waar de leerling
-- nu staat, over het hele jaar heen.
--
-- BEWUST VRIJE TEKST. Een surah-nummer lijkt een getal, tot een leerkracht
-- "soera 78, vers 1-20" of "3de blad van Hashr" wil schrijven, en tot het vak
-- Arabisch is en het doel "les 1 tot les 20" heet. Van/naar/nu zijn dus tekst.
-- `progress` is het enige getal, optioneel, puur om er een balk van te kunnen
-- tekenen voor een ouder die geen soera-nummers kent.
--
-- Meerdere doelen per leerling per klas mogen: een doel dat behaald is blijft
-- staan als geschiedenis, en er komt een nieuw naast. Daarom geen UNIQUE op
-- (class_id, student_id) -- de UI toont het actieve doel.

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_goals (
  id         uuid NOT NULL DEFAULT uuid_generate_v4(),
  tenant_id  uuid NOT NULL,
  class_id   uuid NOT NULL,
  student_id uuid NOT NULL,
  -- Leeg laten mag: dan is het vak zelf het doel ("Qur'an").
  title      text,
  start_point   text,
  target_point  text,
  current_point text,
  -- 0-100, optioneel. NULL = geen balk tonen, niet 0%.
  progress   integer CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
  status     text NOT NULL DEFAULT 'actief'
               CHECK (status IN ('actief', 'behaald', 'gestopt')),
  note       text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT student_goals_pkey PRIMARY KEY (id),
  CONSTRAINT student_goals_tenant_fkey FOREIGN KEY (tenant_id)
    REFERENCES public.tenants(id) ON DELETE CASCADE,
  CONSTRAINT student_goals_class_fkey FOREIGN KEY (class_id)
    REFERENCES public.classes(id) ON DELETE CASCADE,
  CONSTRAINT student_goals_student_fkey FOREIGN KEY (student_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT student_goals_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_student_goals_class   ON public.student_goals(class_id);
CREATE INDEX IF NOT EXISTS idx_student_goals_student ON public.student_goals(student_id);

DROP TRIGGER IF EXISTS student_goals_updated_at ON public.student_goals;
CREATE TRIGGER student_goals_updated_at
  BEFORE UPDATE ON public.student_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.student_goals ENABLE ROW LEVEL SECURITY;

-- ---- RLS ------------------------------------------------------------------
-- class_id staat op de rij zelf, dus geen joins nodig en dus ook geen
-- planner-explosie zoals in migratie 33 en 36. De helpers zijn al
-- SECURITY DEFINER.

DROP POLICY IF EXISTS student_goals_read ON public.student_goals;
CREATE POLICY student_goals_read ON public.student_goals
  FOR SELECT TO authenticated
  USING (
    (SELECT is_super_admin())
    OR student_id = (SELECT auth.uid())
    OR (
      tenant_id = (SELECT get_my_tenant_id())
      AND (
        (SELECT get_my_role())::text = ANY (ARRAY['admin', 'leerlingenbegeleiding'])
        OR am_i_teacher_of_class(class_id)
      )
    )
  );

-- Een leerling leest zijn doel maar schrijft het niet: het is de leerkracht die
-- bepaalt waar de lat ligt.
DROP POLICY IF EXISTS student_goals_write ON public.student_goals;
CREATE POLICY student_goals_write ON public.student_goals
  FOR ALL TO authenticated
  USING (
    (SELECT is_super_admin())
    OR (tenant_id = (SELECT get_my_tenant_id())
        AND ((SELECT get_my_role())::text = 'admin' OR am_i_teacher_of_class(class_id)))
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR (tenant_id = (SELECT get_my_tenant_id())
        AND ((SELECT get_my_role())::text = 'admin' OR am_i_teacher_of_class(class_id)))
  );

COMMIT;

-- Nakijken:
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.student_goals'::regclass;
--   SELECT count(*) FROM public.student_goals;   -- verwacht 0
