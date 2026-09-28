# Workflow Studio — runtime state machine

**Status:** geïmplementeerd ontwerpcontract  
**Versie:** 1  
**Datum:** 2026-08-10

Dit document concretiseert ADR-0006 voor de generieke runtime. Het uitvoerbare
contract staat in `lib/workflow-studio/runtime-state-machine.ts`; de statussen
sluiten één-op-één aan op de constraints in `workflow_instance` en
`workflow_node_instance`.

## Command- en eventregels

Een command bevat altijd een unieke `commandId`, de verwachte actuele status,
actor, tijdstip, correlation-ID en optionele causation-ID. De verwachte status is
de optimistic-lockvoorwaarde. Een geslaagd command:

1. wordt onder de instance-lock verwerkt;
2. produceert precies één state transition;
3. schrijft precies één append-only event met `commandId` als idempotency key;
4. commit state en event in dezelfde databasetransactie.

Een statusconflict, ongeldige transitie of fout commandtijdstip schrijft geen
state en geen success-event. Autorisatieweigeringen worden door de aanroepende
service apart als security-auditfeit vastgelegd.

## Instance-transities

| Command | Van | Naar | Event |
|---|---|---|---|
| `start_instance` | `pending` | `running` | `workflow.instance.started` |
| `wait_instance` | `running` | `waiting` | `workflow.instance.waiting` |
| `resume_instance` | `waiting`, `needs_intervention` | `running` | `workflow.instance.resumed` |
| `complete_instance` | `running` | `completed` | `workflow.instance.completed` |
| `cancel_instance` | `pending`, `running`, `waiting`, `needs_intervention` | `cancelled` | `workflow.instance.cancelled` |
| `fail_instance` | `running`, `waiting` | `failed` | `workflow.instance.failed` |
| `require_instance_intervention` | `running`, `waiting` | `needs_intervention` | `workflow.instance.intervention_required` |

`completed`, `cancelled` en `failed` zijn terminaal. `needs_intervention` is niet
terminaal: een bevoegde beheeractie kan hervatten of annuleren.

## Node-transities

| Command | Van | Naar | Event |
|---|---|---|---|
| `start_node` | `ready` | `running` | `workflow.node.started` |
| `wait_node` | `running` | `waiting` | `workflow.node.waiting` |
| `resume_node` | `waiting` | `running` | `workflow.node.resumed` |
| `succeed_node` | `running` | `succeeded` | `workflow.node.succeeded` |
| `skip_node` | `ready` | `skipped` | `workflow.node.skipped` |
| `fail_node` | `running` | `failed` | `workflow.node.failed` |
| `require_node_intervention` | `running`, `waiting` | `needs_intervention` | `workflow.node.intervention_required` |
| `retry_node` | `failed`, `needs_intervention` | nieuw `ready` attempt | `workflow.node.retry_scheduled` |

`succeeded`, `skipped` en `failed` zijn terminale uitkomsten van één attempt.
Een retry muteert het oude attempt niet terug naar `ready`: de engine moet een
nieuw `workflow_node_instance`-record invoegen met een hoger attemptnummer en een
nieuwe node-instance-ID.

## Locking en idempotency

De lockscope is de volledige workflow instance, met de canonieke sleutel
`workflow-instance:<instanceId>`. De transactionele engine vertaalt dit naar een
row lock op `workflow_instance` voordat hij status, expected status en
idempotency controleert. Hierdoor kunnen twee nodes binnen dezelfde instance
niet tegelijk conflicterende tokens, variabelen of vervolgtransities schrijven.

De event-idempotency key is gelijk aan de command-ID. Een duplicate delivery
leest het eerder opgeslagen commandresultaat terug en voert de handler niet
opnieuw uit. Nodeleases bepalen welke worker een node mag aanbieden; zij
vervangen de transactionele instance-lock niet.

## Retrysemantiek

Alleen `transient_technical` failures van geautomatiseerde nodes mogen
automatisch opnieuw worden aangeboden. De standaardbackoff is 1 seconde,
verdubbelt per mislukt attempt en is begrensd op 15 minuten. `maxAttempts` is een
harde bovengrens.

Menselijke nodes, autorisatie-, validatie-, conflict-, permanente technische en
businessuitkomsten worden nooit technisch automatisch herhaald. Een handmatige
retry vereist een aparte bevoegde commandaanroep, reden en auditactor. Een
menselijke beslissing die al als event bestaat, wordt niet nogmaals toegepast.

## Terminale uitkomsten

- Instance: `completed`, `cancelled`, `failed`.
- Node-attempt: `succeeded`, `skipped`, `failed`.
- `needs_intervention` blijft herstelbaar en behoudt foutclassificatie, code en
  melding voor support.

Deze state machine behandelt uitsluitend het domeincontract. Transactionele
repositorylogica, tokenverwerking en durable delivery volgen in taak 3.2 en 3.11.
