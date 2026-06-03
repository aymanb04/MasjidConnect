# Sub-verwerkers — MasjidConnect

### Bijlage 3 bij de verwerkersovereenkomst

> **STATUS: CONCEPT — verifieer de gegevens vóór gebruik.**
> Locaties, juridische entiteiten en doorgiftemechanismen hieronder zijn gebaseerd
> op de gebruikte diensten, maar moeten worden **bevestigd aan de hand van de
> actuele DPA en sub-verwerkerslijst van elke leverancier** (deze kunnen wijzigen).
> Vul in het bijzonder de **bevestigde hostingregio van Supabase** in.
>
> **Laatste wijziging: [INVULLEN: maand jaar]**

MasjidConnect schakelt de volgende sub-verwerkers in om de Dienst te leveren. Met
elk van hen bestaat een verwerkersovereenkomst en, waar gegevens buiten de EER
worden verwerkt, een geldig doorgiftemechanisme (modelcontractbepalingen / SCC's).

| # | Sub-verwerker | Dienst voor MasjidConnect | Verwerkte gegevens | Locatie / hostingregio | Doorgiftewaarborg |
|---|---|---|---|---|---|
| 1 | **Supabase** (Supabase, Inc., VS — infrastructuur op AWS) | Database, authenticatie en bestandsopslag (kerninfrastructuur) | Alle account-, onderwijs- en bestandsgegevens | [INVULLEN: bevestig EU-regio, bv. AWS eu-central-1 / eu-west] | DPA van Supabase + SCC's voor zover de moederentiteit in de VS is gevestigd |
| 2 | **Vercel** (Vercel, Inc., VS) | Hosting van de webtoepassing en CDN | Technische gegevens (IP, logs); gegevens passeren via de applicatielaag | Wereldwijd edge-netwerk; verwerking primair EER waar mogelijk | DPA van Vercel + SCC's |
| 3 | **Resend** (Resend, Inc., VS — verzending via Amazon SES, regio eu-west-1, Ierland) | Verzenden van transactionele e-mails (uitnodigingen, wachtwoordherstel) | Naam en e-mailadres van de ontvanger | Verzending via Amazon SES **eu-west-1 (Ierland, EER)**; leverancier-entiteit in de VS | DPA van Resend + SCC's |
| 4 | **Upstash** (Upstash, Inc.) | Rate limiting (beveiliging tegen misbruik) van gevoelige API-handelingen | Identificator van de oproeper + endpoint (geen inhoudelijke persoonsgegevens) | EU-regio (Redis-database aangemaakt in EER) | DPA van Upstash |

> **Domeinregistratie (Combell, België):** Combell beheert de domeinnaam en DNS.
> Hierbij worden in de regel **geen persoonsgegevens van Gebruikers** verwerkt en
> treedt Combell niet op als sub-verwerker voor de gegevens binnen de Dienst.

## Toelichting bij doorgifte buiten de EER

- De **kerngegevens** (database, opslag, authenticatie) worden gehost bij
  **Supabase** in een **EU-regio** [INVULLEN: bevestigen]. De data zelf blijft
  daardoor binnen de EER.
- Enkele leveranciers hebben hun **moederentiteit in de Verenigde Staten**
  (Supabase, Vercel, Resend). Voor zover daarbij toegang vanuit de VS mogelijk is,
  steunt de doorgifte op de **modelcontractbepalingen (SCC's)** van de Europese
  Commissie, aangevuld met passende technische maatregelen (o.a. versleuteling).
- MasjidConnect ondertekent de DPA van elke leverancier en houdt de bewijzen
  daarvan ter beschikking van de School (Art. 28 AVG).

## Wijzigingsbeleid

MasjidConnect informeert de School vooraf over elke toevoeging of vervanging van
een sub-verwerker, zodat de School bezwaar kan maken (zie art. 6.3 van de
verwerkersovereenkomst).
