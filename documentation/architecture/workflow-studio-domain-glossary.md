# Workflow Studio — domeinwoordenlijst

**Status:** geaccepteerd ontwerpcontract
**Datum:** 2026-08-06

Deze termen zijn normatief voor schema's, API's, UI-tekst en events. Waar de
huidige code andere begrippen gebruikt, blijft dat een implementatiedetail totdat
de betreffende migratietaak is uitgevoerd.

## Ontwerp

| Term | Betekenis |
|---|---|
| Workflow definition | De stabiele identiteit en metadata van een proces. De definitie is een container voor drafts en gepubliceerde versies en wordt niet rechtstreeks uitgevoerd. |
| Workflow version | Een onveranderlijke, uitvoerbare snapshot van formulier, nodes, edges, rolbindingen en contractversies. Iedere instance is aan precies één versie gekoppeld. |
| Draft | De wijzigbare werkversie. Opslaan gebruikt optimistic locking; publiceren maakt een nieuwe workflow version. |
| Block definition | Een versiegebonden, door het platform beheerd contract voor een herbruikbaar blok. |
| Node | Eén geconfigureerd gebruik van een block definition binnen een workflow version. Node-ID's zijn binnen die versie stabiel en uniek. |
| Edge | Een gerichte verbinding van een outputpoort naar een compatibele inputpoort, eventueel met een deterministische conditie. Cycli zijn in het MVP verboden. |
| Role binding | De koppeling van een workflowrol aan toegestane identity-groepen en scope. De binding verleent nooit meer rechten dan de ontwerper zelf mag delegeren. |

## Runtime

| Term | Betekenis |
|---|---|
| Workflow instance | Eén uitvoering van een gepubliceerde workflow version. |
| Node instance | Het duurzame uitvoeringsrecord van een node binnen een workflow instance, inclusief attempt en resultaat. |
| Token | Een duurzaam voortgangsmarkeerpunt dat aangeeft welke node uitvoerbaar is. Dit is nadrukkelijk geen sessie-, API- of authenticatietoken. |
| Task | Een menselijke werkopdracht voor een gebruiker of rol, met status, deadline, claim en uitkomst. |
| Variable | Een getypeerde runtimewaarde met scope, herkomst en classificatie. Secrets worden niet als gewone variable opgeslagen. |
| Snapshot | Een onveranderlijke lezing van externe of client-configdata met bron, record-ID, geselecteerde velden, leestijd en concurrency token. |
| Change intent | Een nog niet toegepaste, getypeerde aanvraag om client-configdata te creëren, wijzigen of uit te faseren. Alleen een vertrouwde adapter kan een intent toepassen. |
| Command | Een aangevraagde actie. Een command mag falen en is geen historisch feit. |
| Event | Een onveranderlijk feit over een afgeronde toestandsverandering, met actor, tijd, correlation-ID en causation-ID. |

## Statussen

- Definition: `draft`, `published`, `deprecated`, `archived`. Alleen een draft is
  wijzigbaar; `published` en `deprecated` versies blijven uitvoerbaar voor reeds
  gestarte instances.
- Instance: `pending`, `running`, `waiting`, `completed`, `cancelled`, `failed`,
  `needs_intervention`.
- Node instance: `ready`, `running`, `waiting`, `succeeded`, `skipped`, `failed`,
  `needs_intervention`.
- Task: `open`, `claimed`, `completed`, `cancelled`, `expired`.
- Change intent: `draft`, `validated`, `approved`, `applying`, `applied`,
  `rejected`, `conflicted`, `failed`.

Een technische retry verhoogt alleen het attempt-nummer; hij herhaalt nooit een
menselijke beslissing en creëert geen tweede businessactie. Dezelfde idempotency
key levert hetzelfde geregistreerde resultaat op.

## Foutklassen

| Klasse | Voorbeeld | Runtimebeleid |
|---|---|---|
| Validation | Ongeldige blockconfiguratie | Niet starten of publiceren; gebruiker corrigeert de definitie. |
| Authorization | Actor mist scope | Weigeren en auditen; nooit automatisch retryen. |
| Conflict/stale data | Snapshot wijkt af van huidige data | Intent naar `conflicted`; opnieuw beoordelen met verse snapshot. |
| Transient technical | Tijdelijke database- of netwerkstoring | Begrensde retry met backoff en dezelfde idempotency key. |
| Permanent technical | Onbekend adaptercontract | Stoppen in `needs_intervention`; operationele opvolging. |
| Business rejection | Goedkeurder wijst af | Geldige procesuitkomst, geen technische fout of retry. |

## Determinisme en expressies

Routeringscondities lezen uitsluitend getypeerde inputs en variables via een
beperkte expressietaal. Ze voeren geen code, SQL of netwerkverzoeken uit. Dezelfde
workflow version en dezelfde inputs moeten dezelfde route opleveren.
