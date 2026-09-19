-- 37: verplicht een eigen wachtwoord bij de eerste aanmelding.
--
-- AANLEIDING (2026-09-19), vraag van de school:
--   "bij eerste inlog, kunnen ze automatisch de melding krijgen om wachtwoord
--    te veranderen? Nu moeten ze het manueel doen"
--
-- 105 leerlingen kregen een startwachtwoord dat door het systeem verzonnen is
-- en op een geprint blad in een klaslokaal rondgaat. Zolang niemand dat
-- vervangt, is dat blad het wachtwoord. Tot nu moest een leerling daarvoor uit
-- zichzelf naar Profiel > Wachtwoord, en dat doet een kind van negen niet.
--
-- WERKING: profiles.must_change_password. Staat die op true, dan stuurt de
-- dashboard-layout de gebruiker naar /wachtwoord-instellen en komt hij nergens
-- anders binnen -- dezelfde aanpak als de /akkoord-poort voor de voorwaarden.
-- De vlag wordt gezet zodra iemand ANDERS een wachtwoord uitdeelt
-- (scripts/bulk-onboard.mjs en /api/user/set-password) en gewist zodra de
-- gebruiker er zelf een kiest.
--
-- LET OP: het wissen gebeurt via /api/user/password-changed met de service
-- role, niet client-side. Een profiles.update() door de eigenaar zelf loopt op
-- dit project in een policy-recursie (42P17) -- zie de notitie daarover.
--
-- DE BACKFILL HIERONDER IS HET ENIGE ONOMKEERBARE STUK, en is bewust smal:
-- alleen actieve LEERLINGEN die nog NOOIT ingelogd hebben. Dus:
--   - de 16 personeelsleden die al lang hun eigen wachtwoord kozen: niet geraakt
--   - leerlingen die al eens ingelogd hebben: niet geraakt
-- Wie erna alsnog een wachtwoord uitgedeeld krijgt, krijgt de vlag via de code.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.must_change_password IS
  'true = deze gebruiker draait nog op een wachtwoord dat iemand anders heeft '
  'uitgedeeld en moet er bij de volgende aanmelding zelf een kiezen. '
  'Gezet door bulk-onboard en /api/user/set-password, gewist door '
  '/api/user/password-changed. Migratie 37.';

-- Backfill: leerlingen die nog op hun startwachtwoord zitten.
UPDATE public.profiles p
   SET must_change_password = true
 WHERE p.role = 'student'
   AND p.is_active
   AND EXISTS (
     SELECT 1 FROM auth.users u
      WHERE u.id = p.id
        AND u.last_sign_in_at IS NULL
   );

COMMIT;

-- Nakijken -- verwacht ongeveer 105 leerlingen en 0 personeelsleden:
--   SELECT role, must_change_password, count(*)
--     FROM public.profiles WHERE is_active
--    GROUP BY 1, 2 ORDER BY 1, 2;
--
-- Terugdraaien (de kolom mag blijven staan, die doet niets zolang hij false is):
--   UPDATE public.profiles SET must_change_password = false;
