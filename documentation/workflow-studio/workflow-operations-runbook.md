# Workflow Studio Operations Runbook

Dit runbook helpt support en operations bij dagelijks beheer van gepubliceerde
workflows en runtime instances.

## Dagelijkse checks

- Open het runtime dashboard en controleer failed, conflicted en blocked items.
- Controleer outbox backlog, dead letters en oudste pending leeftijd tegen de
  SLO uit het scale/chaoscontract.
- Controleer open taken ouder dan hun business deadline.
- Controleer recovery-acties en handmatige compensatieplannen.
- Controleer cutoverstatus: actieve change types moeten naar een gepubliceerde
  `workflow_version_id` verwijzen.

## Standaardherstel

1. Classificeer het probleem: authoring, start, task, integration, mutation,
   outbox of data conflict.
2. Gebruik runtime detail om de instance, node, task, outbox en audit events te
   vinden.
3. Gebruik recovery alleen wanneer de state machine geen automatische retry meer
   uitvoert.
4. Pas compensatie toe volgens het recoveryplan en leg actor, reden en uitkomst
   vast.
5. Escaleer naar incidentprocedure bij RTO-risico, dead letters of mutatiefout.

## SLO

- RPO: 0 seconden voor durable runtime state.
- RTO: 15 minuten voor herstelbare runtime-storingen.
- Outbox dead letters: 0.
- Ready-node claim latency: maximaal 250 ms in nominale omstandigheden.

## Overdracht

Elke supporthandover bevat instance ID, workflow version ID, correlation ID,
laatste audit event, open outbox items, herstelactie en eigenaar.
