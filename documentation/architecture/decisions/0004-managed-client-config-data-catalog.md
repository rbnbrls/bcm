# ADR-0004: Ontsluit client-config via een beheerde data catalogus

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

De Workflow Studio moet bestaande client-configwaarden kunnen zoeken en selecteren,
maar vrije tabel-, kolom- of querynamen zouden schema-details lekken en
autorisatie, dataclassificatie en toekomstige migraties omzeilen.

## Besluit

Een beheerde catalogus exposeert stabiele logische resource- en attribute-ID's.
Per resource legt hij vast: types, relaties, zoekvelden, scope, classificatie,
toegestane read/mutation operations en de adapter die naar fysieke opslag vertaalt.
Workflowconfiguratie verwijst alleen naar deze logische ID's.

Een read levert een getypeerde snapshot met bronresource, record-ID, geselecteerde
velden, `readAt` en een opaque concurrency token. Secrets en niet-toegestane velden
worden vóór opslag en logging verwijderd. Catalogusversies blijven beschikbaar
zolang gepubliceerde workflowversies ze gebruiken.

## Gevolgen

Schemawijzigingen en autorisatie blijven achter een stabiele grens. Iedere
bruikbare client-configresource moet wel bewust worden gecatalogiseerd. Directe
SQL, vrije REST-URL's en het opslaan van fysieke tabelnamen in workflows zijn afgewezen.
