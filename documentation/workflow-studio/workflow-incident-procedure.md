# Workflow Studio Incident Procedure

Gebruik deze procedure bij productie-impact op Workflow Studio of Runtime.

## Severity

- SEV1: mutaties worden verkeerd toegepast, RPO dreigt groter dan 0 of meerdere
  business units kunnen geen kritieke changes uitvoeren.
- SEV2: runtime start, taken of outbox zijn vertraagd en RTO van 15 minuten
  dreigt te worden overschreden.
- SEV3: enkel proces, template of gebruiker geblokkeerd zonder datamutatierisico.

## Eerste 15 minuten

1. Bevries nieuwe publicaties wanneer authoring of governance verdacht is.
2. Zet change catalog cutover terug naar classic fallback wanneer runtime-start
   onveilig is.
3. Pauzeer mutatie-applicatie wanneer change intents conflicted of failed zijn.
4. Verzamel dashboardstatus, outboxstatus, audit events en SIEM-events.
5. Wijs incident commander, communicator en technisch eigenaar toe.

## Herstel

- Gebruik rollback alleen naar een eerder gepubliceerde workflowversie.
- Gebruik runtime recovery voor retry, compensate of manual complete.
- Gebruik databasewijzigingen uitsluitend via goedgekeurde migraties of
  gecontroleerde compensaties.
- Heropen change-managertraining wanneer het incident door procesontwerp kwam.

## Afronding

Binnen twee werkdagen is er een post-incident review met oorzaak, impact,
RPO/RTO, preventieve maatregel, eigenaar en verificatietest.
