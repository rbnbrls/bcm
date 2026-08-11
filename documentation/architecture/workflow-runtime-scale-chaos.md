# Workflow runtime scale and chaos recovery

Dit document beschrijft de schaal-, performance- en chaosherstelafspraken voor
Workflow Runtime.

## SLO's

`DEFAULT_WORKFLOW_RUNTIME_SLO` legt de eerste runtime-SLO's vast:

- ready node claim latency: maximaal 250 ms op de workerlaag;
- oudste pending outboxbericht: maximaal 5 minuten;
- pending outboxbacklog: maximaal 5.000 berichten;
- dead letters: 0 open berichten;
- open taken: maximaal 10.000;
- RPO: 0 seconden voor gecommit runtimewerk;
- RTO: 15 minuten voor workerherstel.

Deze SLO's zijn bewust code-level constants zodat tests en dashboards hetzelfde
contract gebruiken.

## Workerconcurrency

`WorkflowOutboxWorker.runBatch` verwerkt bounded batches met configureerbare
concurrency. Elke lane gebruikt dezelfde durable outbox-claimsemantiek als
`runOnce`; PostgreSQL blijft de echte concurrencygrens via
`FOR UPDATE SKIP LOCKED`.

Batchresultaten bevatten aantallen voor claimed, delivered, retry scheduled,
dead-lettered en idle. Daarmee kan operations queue-drainage, poison messages
en backpressure zonder payloadinspectie monitoren.

## Backpressure

`evaluateWorkflowRuntimeBackpressure` classificeert queue- en taakmetrics als:

- `healthy`: binnen SLO;
- `degraded`: waarschuwingen zoals backlog of verlopen leases;
- `blocked`: kritieke condities zoals stale outbox of dead letters.

De evaluatie retourneert stabiele issuecodes voor dashboarding en alarmering:
`outbox_backlog`, `outbox_stale`, `dead_letters`, `expired_leases` en
`task_backlog`.

## DB-indexen

`auditWorkflowRuntimeScaleIndexes` bewaakt dat de runtime-DDL de schaalindexen
voor instance-status, scope, ready nodes, tasks, retryable intents, outboxready
en eventtimeline bevat. De test leest `db/init.sql` direct zodat migraties niet
ongemerkt schaalpaden verliezen.

## Chaosherstel

Een workercrash na claim maar voor delivery laat het bericht `leased` achter met
een expiry. Na lease-expiry wordt het bericht opnieuw claimbaar. Transient
fouten plannen bounded retry met backoff; poison messages gaan naar dead letter
wanneer het attemptbudget is uitgeput. Omdat runtime state, events en outbox
transactioneel en idempotent zijn, is RPO 0 voor gecommit werk.

Grote authoringgraphs worden bewaakt door een unit-level loadtest die een
lineair graph met honderden nodes door de statische validator haalt binnen een
ruime SLO-grens.
