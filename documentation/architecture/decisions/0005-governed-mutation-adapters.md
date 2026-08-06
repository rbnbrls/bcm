# ADR-0005: Pas mutaties uitsluitend via vertrouwde adapters toe

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

BCM beschermt client-configmutaties al met databasetriggers en de session setting
`app.change_process_bypass`; alleen bestaande apply strategies activeren die grens.
Een workflowengine mag deze bescherming niet aan gebruikersconfiguratie blootstellen.

## Besluit

- Workflowblokken produceren getypeerde change intents (`CREATE`, `UPDATE` of
  `RETIRE`) en schrijven nooit rechtstreeks naar client-config.
- Een server-side mutation adapter valideert actor, rol, scope, approvals,
  cataloguscontract, businessregels en snapshot/concurrency token.
- De adapter ondersteunt validate en dry-run vóór apply, gebruikt een idempotency
  key en retourneert een getypeerd resultaat met auditreferentie.
- Apply is atomair: domeinmutatie, intentstatus en outbox/event worden samen
  gecommit of niet uitgevoerd.
- Alleen adapters mogen bestaande beveiligde databasefuncties of de bypass-setting
  gebruiken; deze mogelijkheid komt niet in blockconfiguratie of expressions.

## Gevolgen

Foutieve of kwaadaardige workflowconfiguratie kan de databasegrens niet omzeilen.
Adapters zijn security-kritieke code en vereisen tests en review per resource.
Generieke DML-blokken en het direct aanroepen van `client-config-db` vanuit de
workflowruntime zijn afgewezen.
