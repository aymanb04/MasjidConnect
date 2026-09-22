-- 39: een nota die het gezin mag lezen.
--
-- AANLEIDING (2026-09-21), vraag van de school:
--   "Hoe kunnen we nota's/opmerkingen geven aan leerlingen? Kunnen we dat doen
--    via masjidconnect zodat de ouders het kunnen lezen en mee opvolgen?"
--
-- Wat er al was dekt dit niet. `student_notes` (migratie 14) staat er letterlijk
-- bij: "students have NO access". Dat is een intern opvolgingslogboek van het
-- schoolteam, en dat MOET het ook blijven -- een leerkracht die noteert dat een
-- kind thuis iets meemaakt, schrijft dat niet voor de ouders.
--
-- Daarom geen omschakeling maar een KEUZE PER NOTA. De leerkracht duidt zelf
-- aan of een nota naar het gezin mag. Twee soorten nota's in een tabel, met
-- de zichtbaarheid expliciet per rij.
--
-- `DEFAULT false` is het hele punt van deze migratie. Elke nota die sinds juni
-- geschreven is, is geschreven onder de belofte dat alleen het schoolteam ze
-- leest. Die beloofde vertrouwelijkheid mag een ALTER TABLE niet met
-- terugwerkende kracht intrekken. Bestaande rijen blijven dus verborgen, en
-- alleen een mens die het vinkje aanzet maakt een nota zichtbaar.
--
-- LET OP wat "de ouders kunnen het lezen" vandaag betekent: er zijn GEEN
-- ouderlogins (migratie 18 zegt dat met zoveel woorden). Zichtbaar voor de
-- leerling = zichtbaar voor wie op de login van de leerling zit. Bij een kind
-- van acht is dat de ouder; bij een leerling van zeventien is dat de leerling
-- zelf. De schermtekst zegt dat er daarom uitdrukkelijk bij.

BEGIN;

ALTER TABLE public.student_notes
  ADD COLUMN IF NOT EXISTS visible_to_student boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.student_notes.visible_to_student IS
  'Per nota aangeduid door de auteur. false = intern (standaard). true = de '
  'leerling ziet ze op zijn dashboard, en dus ook de ouder die met die login '
  'meekijkt. Migratie 39.';

-- De leerling leest zijn eigen zichtbare nota's, meer niet.
--
-- Bewust ZONDER join naar een andere RLS-tabel: `student_id = auth.uid()` is
-- al strenger dan een tenant-check (je eigen id zit per definitie in je eigen
-- tenant), en een EXISTS naar class_students zou hier de planning-bom van
-- migratie 36 opnieuw binnenhalen.
DROP POLICY IF EXISTS student_read_own_visible_notes ON public.student_notes;
CREATE POLICY student_read_own_visible_notes ON public.student_notes
  FOR SELECT TO authenticated
  USING (
    student_id = (SELECT auth.uid())
    AND visible_to_student
  );

-- UPDATE bestond nog niet op deze tabel: een nota kon enkel gemaakt of
-- verwijderd worden. Nu er een vinkje op staat moet een auteur zich kunnen
-- bedenken -- zichtbaar zetten, of weer intern. Dezelfde kring als DELETE:
-- de auteur zelf, of een beheerder van de school.
--
-- WITH CHECK spiegelt USING, zodat een UPDATE een nota niet naar een andere
-- leerling, tenant of auteur kan verhuizen.
DROP POLICY IF EXISTS staff_update_student_notes ON public.student_notes;
CREATE POLICY staff_update_student_notes ON public.student_notes
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_super_admin())
    OR author_id = (SELECT auth.uid())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
    )
  )
  WITH CHECK (
    (SELECT is_super_admin())
    OR author_id = (SELECT auth.uid())
    OR (
      (SELECT get_my_role())::text = 'admin'
      AND tenant_id = (SELECT get_my_tenant_id())
    )
  );

-- Het dashboard van de leerling haalt hier elke keer de laatste paar nota's op.
CREATE INDEX IF NOT EXISTS idx_student_notes_visible
  ON public.student_notes (student_id, created_at DESC)
  WHERE visible_to_student;

-- Het beheerdersoverzicht ("welke nota's zijn er deze week geschreven")
-- filtert op tenant + datum.
CREATE INDEX IF NOT EXISTS idx_student_notes_tenant_created
  ON public.student_notes (tenant_id, created_at DESC);

COMMIT;

-- Nakijken:
--   SELECT count(*) FROM public.student_notes WHERE visible_to_student;  -- verwacht 0
--   SELECT polname, polcmd FROM pg_policy
--    WHERE polrelid = 'public.student_notes'::regclass ORDER BY polname;
--   -- verwacht: delete_student_notes, staff_insert_student_notes,
--   --           staff_read_student_notes, staff_update_student_notes,
--   --           student_read_own_visible_notes
