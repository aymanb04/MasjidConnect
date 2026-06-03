# Register van de verwerkingsactiviteiten (Art. 30 AVG)

> **STATUS: CONCEPT — gebaseerd op het model van de Gegevensbeschermingsautoriteit (GBA).**
> De AVG verplicht elke verwerkingsverantwoordelijke én elke verwerker een register
> bij te houden (Art. 30). Dit document bevat **twee delen**:
>
> - **Deel A — Register als VERWERKER** (Art. 30.2): houdt MasjidConnect bij. Dit
>   is het register dat MasjidConnect zelf moet onderhouden.
> - **Deel B — Register als VERWERKINGSVERANTWOORDELIJKE** (Art. 30.1): een sjabloon
>   dat (1) elke School voor haar eigen verwerkingen invult, en (2) MasjidConnect
>   invult voor de beperkte gevallen waarin zij zelf verantwoordelijke is.
>
> Het register moet schriftelijk (elektronisch volstaat) worden bijgehouden en op
> verzoek aan de GBA worden voorgelegd.
>
> **Laatste bijwerking: [INVULLEN: datum]** · **Bijgehouden door: [INVULLEN: naam/functie]**

---
---

# DEEL A — Register als VERWERKER (MasjidConnect) — Art. 30.2

## A.1 Identiteit van de verwerker

| Veld | Invulling |
|---|---|
| Naam verwerker | [INVULLEN: juridische naam MasjidConnect] |
| Adres | [INVULLEN] |
| KBO/BTW | [INVULLEN] |
| Contactpersoon | [INVULLEN: naam + e-mail] |
| Functionaris gegevensbescherming (DPO) | [INVULLEN: indien aangesteld — niet wettelijk verplicht, maar aanbevolen] |

## A.2 Verwerkingsverantwoordelijken voor wie MasjidConnect optreedt

| # | Verwerkingsverantwoordelijke (School) | Contactpersoon | Sinds |
|---|---|---|---|
| 1 | [INVULLEN: naam moskee/School] | [INVULLEN] | [INVULLEN] |
| … | *(één rij per aangesloten School)* | | |

## A.3 Categorieën van verwerkingen uitgevoerd in opdracht van elke verantwoordelijke

Voor alle Scholen voert MasjidConnect dezelfde categorieën van verwerkingen uit:

- aanmaken en beheren van gebruikersaccounts (leerlingen, leerkrachten, beheerders);
- beheren van klassen, groepen en inschrijvingen;
- registreren en bewaren van taken, indieningen, scores, feedback en examenresultaten;
- registreren van aanwezigheden;
- opslaan en delen van rapporten (pdf) en lesmateriaal;
- verspreiden van aankondigingen;
- verzenden van transactionele e-mails (uitnodigingen, wachtwoordherstel);
- bewaren van technische logs ten behoeve van beveiliging.

## A.4 Doorgifte naar derde landen

| Sub-verwerker | Derde land? | Waarborg |
|---|---|---|
| Supabase | Hosting in EU-regio [INVULLEN bevestigen]; moederentiteit VS | SCC's + DPA |
| Vercel | Moederentiteit VS | SCC's + DPA |
| Resend | Verzending via Amazon SES EU (Ierland); entiteit VS | SCC's + DPA |
| Upstash | EU-regio | DPA |

> Zie `sub-verwerkers.md` voor het volledige overzicht.

## A.5 Algemene beschrijving van de beveiligingsmaatregelen (Art. 32)

Zie **Bijlage 2** van de verwerkersovereenkomst (`verwerkersovereenkomst.md`):
RLS, tenant-isolatie, versleuteling in transit (TLS/HSTS) en at rest, privé-opslag
met ondertekende links, rolgebaseerde toegang, wachtwoordbeleid, rate limiting,
service-sleutel uitsluitend server-side, dagelijkse back-ups.

---
---

# DEEL B — Register als VERWERKINGSVERANTWOORDELIJKE — Art. 30.1

> **Voor de School:** vul één blok in per verwerkingsactiviteit. Hieronder staan
> de typische activiteiten van een moskeeschool die MasjidConnect gebruikt, als
> voorbeeld al ingevuld. Pas aan naar je eigen situatie.
>
> **Voor MasjidConnect zelf:** vul de activiteiten in waarvoor MasjidConnect
> verwerkingsverantwoordelijke is (support, beveiligingslogs, feedback,
> personeels-/klantadministratie).

## B.0 Identiteit van de verwerkingsverantwoordelijke

| Veld | Invulling |
|---|---|
| Naam | [INVULLEN: naam School of MasjidConnect] |
| Adres | [INVULLEN] |
| KBO-nummer | [INVULLEN] |
| Contactpersoon | [INVULLEN] |
| DPO (indien aangesteld) | [INVULLEN] |

---

### Activiteit 1 — Leerlingenadministratie

| Veld | Invulling |
|---|---|
| **Doeleinde(n)** | Inschrijving en opvolging van leerlingen; beheer van klassen en groepen |
| **Rechtsgrond** | Art. 6(1)(b) overeenkomst en/of 6(1)(f) gerechtvaardigd belang (onderwijsopdracht) |
| **Categorieën betrokkenen** | Leerlingen (doorgaans minderjarig), ouders/voogden (contact) |
| **Categorieën gegevens** | Naam, e-mail, telefoon, profielfoto, klasinschrijvingen |
| **Ontvangers** | Leerkrachten en beheerders van de School; verwerker MasjidConnect; sub-verwerkers (zie `sub-verwerkers.md`) |
| **Doorgifte buiten EER** | Via sub-verwerkers, met SCC's (zie `sub-verwerkers.md`) |
| **Bewaartermijn** | Zolang ingeschreven; daarna archivering; voorstel max. 2 jaar → anonimisering |
| **Beveiligingsmaatregelen** | Zie Bijlage 2 verwerkersovereenkomst |

### Activiteit 2 — Opvolging van taken, scores en examenresultaten

| Veld | Invulling |
|---|---|
| **Doeleinde(n)** | Pedagogische opvolging en evaluatie van leerlingen |
| **Rechtsgrond** | Art. 6(1)(b) / 6(1)(f) |
| **Categorieën betrokkenen** | Leerlingen |
| **Categorieën gegevens** | Ingediende taken (tekst + bestanden), scores, feedback, examenresultaten |
| **Ontvangers** | Betrokken leerkracht(en), beheerders, leerling zelf; verwerker + sub-verwerkers |
| **Doorgifte buiten EER** | Via sub-verwerkers, met SCC's |
| **Bewaartermijn** | Voor de duur van het schooldossier / abonnement |
| **Beveiligingsmaatregelen** | Zie Bijlage 2 verwerkersovereenkomst |

### Activiteit 3 — Aanwezigheidsregistratie

| Veld | Invulling |
|---|---|
| **Doeleinde(n)** | Opvolgen van aanwezigheid van leerlingen |
| **Rechtsgrond** | Art. 6(1)(b) / 6(1)(f) |
| **Categorieën betrokkenen** | Leerlingen |
| **Categorieën gegevens** | Aanwezigheidsstatus (aanwezig/afwezig/te laat/gewettigd) per sessie |
| **Ontvangers** | Leerkracht(en), beheerders, leerling zelf; verwerker + sub-verwerkers |
| **Doorgifte buiten EER** | Via sub-verwerkers, met SCC's |
| **Bewaartermijn** | Voor de duur van het schooldossier / abonnement |
| **Beveiligingsmaatregelen** | Zie Bijlage 2 verwerkersovereenkomst |

### Activiteit 4 — Communicatie (aankondigingen, e-mails)

| Veld | Invulling |
|---|---|
| **Doeleinde(n)** | Communicatie tussen School, leerkrachten en leerlingen; uitnodigingen en wachtwoordherstel |
| **Rechtsgrond** | Art. 6(1)(b) / 6(1)(f) |
| **Categorieën betrokkenen** | Leerlingen, leerkrachten, beheerders |
| **Categorieën gegevens** | Naam, e-mailadres, inhoud van aankondigingen |
| **Ontvangers** | Geadresseerden binnen de School; e-mailverwerker (Resend) |
| **Doorgifte buiten EER** | Via sub-verwerkers, met SCC's |
| **Bewaartermijn** | Voor de duur van het abonnement |
| **Beveiligingsmaatregelen** | Zie Bijlage 2 verwerkersovereenkomst |

### Activiteit 5 *(MasjidConnect als verantwoordelijke)* — Support, beveiliging en feedback

| Veld | Invulling |
|---|---|
| **Doeleinde(n)** | Beantwoorden van support-/feedbackvragen; beveiliging en misbruikdetectie |
| **Rechtsgrond** | Art. 6(1)(b) (support) en 6(1)(f) (beveiliging) |
| **Categorieën betrokkenen** | Gebruikers die contact opnemen of het platform gebruiken |
| **Categorieën gegevens** | Naam, rol, bericht, paginapad; technische logs (IP, tijdstip) |
| **Ontvangers** | Super-beheerder MasjidConnect; sub-verwerkers (hosting, rate limiting) |
| **Doorgifte buiten EER** | Via sub-verwerkers, met SCC's |
| **Bewaartermijn** | Beperkt; logs voor beveiligingsdoeleinden |
| **Beveiligingsmaatregelen** | Zie Bijlage 2 verwerkersovereenkomst |

---

> **Tip:** de GBA stelt een officieel Excel-model ter beschikking
> (uitgebreide en vereenvoudigde versie) via
> www.gegevensbeschermingsautoriteit.be → "Register van verwerkingsactiviteiten".
> Dit Markdown-register dekt dezelfde verplichte velden en kan desgewenst naar dat
> Excel-model worden overgezet.
