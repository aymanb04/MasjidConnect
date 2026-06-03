# Legal & GDPR documents — MasjidConnect

This folder holds the GDPR/AVG compliance documents for MasjidConnect, written for
the Belgian context (AVG + wet van 30 juli 2018), modelled on Belgian school
platforms (Smartschool) and the GBA's official guidance.

> ⚠️ **All documents here are CONCEPT drafts and have NOT been reviewed by a
> lawyer.** They are thorough and structured, but anything a mosque or parent
> signs — the DPA especially — must get a final pass from a legal professional
> with Belgian privacy/education-law experience before real-world use.

## Contents

| File | What it is | Audience |
|---|---|---|
| `privacyverklaring.md` | End-user privacy statement | Parents, students, teachers (shown in-app under /privacy) |
| `gebruikersovereenkomst.md` | Terms of Use (user agreement) | Every Gebruiker; accepted on first use |
| `verwerkersovereenkomst.md` | Data Processing Agreement (Art. 28) + 3 annexes | Signed by each mosque (School) and MasjidConnect |
| `sub-verwerkers.md` | Sub-processor list (Annex 3 of the DPA) | Annex; disclosed to each School |
| `verwerkingsregister.md` | Register of processing activities (Art. 30) — processor + controller parts | Internal; shown to GBA on request |
| `ouder-toestemming.md` | Parental information + consent form | Handed by the School to parents/guardians |

> **Reference material:** `../Smartschool-Privacyverklaring.pdf` (Oct 2025) is kept
> in the project root as the structural benchmark. These drafts mirror its
> controller/processor spine but contain MasjidConnect-specific content only.
> Note: Smartschool's DISCIMUS reporting (to the Vlaams Ministerie van Onderwijs)
> is **deliberately omitted** — mosque/Islamic schools are not part of the official
> Flemish onderwijs system, so it does not apply.

## Roles (the spine of all documents)

- **De School (de moskee)** = **verwerkingsverantwoordelijke** (controller). Bepaalt
  doel en middelen; informeert betrokkenen; behandelt rechtenverzoeken.
- **MasjidConnect** = **verwerker** (processor). Verwerkt enkel in opdracht van de
  School. Voor enkele beperkte zaken (support, beveiligingslogs) is MasjidConnect
  zelf verantwoordelijke.
- **Sub-verwerkers** = Supabase, Vercel, Resend, Upstash (zie `sub-verwerkers.md`).

## Master "in te vullen" checklist (before publishing/signing)

- [ ] **Juridische entiteit MasjidConnect** — rechtsvorm, adres, KBO/BTW-nummer
      (komt terug in álle documenten als `[INVULLEN: ...]`)
- [ ] **Privacy-contact e-mailadres** (voorstel: `privacy@masjidconnect.be`)
- [ ] **Hostingregio van Supabase bevestigen** (EU?) — kritisch voor de
      doorgifte-analyse in `sub-verwerkers.md` en `privacyverklaring.md` §3.5
- [ ] **DPA's van alle sub-verwerkers** ondertekenen/archiveren (Supabase, Vercel,
      Resend, Upstash) en SCC-status bevestigen
- [ ] **Retentiebeleid bekrachtigen** (voorstel: archiveren max. 2 jaar →
      anonimiseren) en eventueel automatiseren
- [ ] **Bevoegde rechtbank** invullen in de DPA (art. 12.2)
- [ ] **Datum laatste wijziging** in elk document
- [ ] **Juridische review** van het geheel, met bijzondere aandacht voor:
  - rechtsgrond voor minderjarigen (contract/gerechtvaardigd belang vs. toestemming)
  - of een afzonderlijke ouderlijke toestemming nodig is
  - de DPA-clausules (aansprakelijkheid, audit, sub-verwerkers)

## Open compliance-punten (uit GDPR_NOTES.txt, nog te bouwen/beslissen)

- [ ] **DSAR / data-export** als zelfbedieningsfunctie (nu manueel via beheerder)
- [ ] **Retentie-automatisering** (auto-anonimiseren na X jaar)
- [ ] Overweging: **`text_content` van indieningen scrubben** bij anonimisering
- [ ] Interne **datalek-procedure** (72u-regel) formeel uitschrijven
- [ ] Beslissing rond **ouderlijke toestemming** afronden na juridisch advies

> Zie ook `../GDPR_NOTES.txt` (volledige analyse) en `../SECURITY_TODO.md`.
