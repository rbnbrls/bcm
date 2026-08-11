# Workflow Studio — transactionele engine-kern

**Status:** geïmplementeerd ontwerpcontract  
**Versie:** 1  
**Datum:** 2026-08-11

De engine-kern voert het state-machinecontract uit tegen een transactionele
store. De productieadapter gebruikt PostgreSQL; tests kunnen dezelfde engine
tegen een in-memory store uitvoeren.

## Duurzaam uitvoeringsmodel

Een `workflow_node_instance` met status `ready` is het duurzame token uit de
domeinwoordenlijst. Er is daarom geen tweede tokentabel: de ready node-instance
legt tegelijk workflowversie, definitienode, attempt, beschikbaarheid,
idempotency en correlation vast.

De basisflow is:

1. laad uitsluitend een gepubliceerde, onveranderlijke workflowversie;
2. maak de gepinde instance in status `pending`;
3. verwerk `start_instance` en het bijbehorende event in dezelfde transactie;
4. activeer precies één `manual_start` als ready node-attempt;
5. claim ready attempts met een workerlease;
6. persisteer het commandresultaat en append-only event;
7. activeer targets van de gekozen outputpoort met edge-afgeleide
   idempotency keys;
8. voltooi de instance wanneer een `end`-node slaagt.

De engine voert nog geen block-specifieke businesslogica uit. Formulieren,
lookups, menselijke taken, approvals, decisions en change intents bouwen in de
volgende taken bovenop dezelfde command- en storegrens.

## Transactie- en lockvolgorde

Alle muterende engine-operaties lopen via `WorkflowRuntimeStore.transaction`.
De PostgreSQL-adapter neemt eerst `SELECT ... FOR UPDATE` op
`workflow_instance`. Nodeclaims nemen daarnaast `FOR UPDATE ... SKIP LOCKED` op
het gekozen ready attempt. De vaste lockvolgorde instance → node voorkomt dat
twee deliveries binnen één instance tegelijk edges, variabelen of toekomstige
side effects materialiseren.

State-update, nieuw node-attempt, edge-activatie en events committen samen. Een
fout tijdens edgeverwerking rolt dus ook de eerder uitgevoerde node-transitie en
het event terug.

## Idempotency

- Instance-start: uniek op `(tenant, idempotency_key)`.
- Commandresultaat: uniek event op `(workflow_instance_id, idempotency_key)`.
- Node-activatie: uniek op `(workflow_instance_id, idempotency_key)`.
- Edge-delivery: key `<commandId>:edge:<edgeId>`.
- Activation-event: eigen afgeleide key met suffix `:event`.

De instance-rowlock wordt vóór de command-eventcontrole genomen. Twee gelijke
gelijktijdige deliveries worden daardoor geserialiseerd: de eerste commit het
resultaat, de tweede leest het bestaande event en maakt geen tweede node, taak
of mutatie. De bestaande unieke constraints op `workflow_task` en
`workflow_change_intent` blijven de laatste DB-technische verdedigingslaag voor
de latere blockhandlers.

## Hervatten

Ready attempts blijven na een procescrash in PostgreSQL staan. Een nieuwe
engine/worker kan ze via `claimNext` opnieuw vinden, atomair claimen en van een
begrensde lease voorzien. Herclaimen van verlopen, reeds `running` leases hoort
bij de durable worker en outbox van taak 3.11; de kern verliest geen werk dat nog
niet geclaimd was.

## Expressiegrens

Conditionele edges worden door de getypeerde variabele- en expressieruntime
geëvalueerd. De gekozen outputpoort is onderdeel van `succeed_node`, zodat
decisions en approvals deterministisch kunnen routeren zonder dynamische code.
De uitgebreide beslis-audit en controle op nul of meerdere matches volgen in
taak 3.8.
