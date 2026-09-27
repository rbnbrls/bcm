# ADR-0007: Migreer bestaande change types incrementeel

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

Bestaande change types gebruiken templates, schema overrides, server actions,
detail renderers en apply strategies uit de code registry. Een big-bangvervanging
zou actieve requests, historische weergave en productiegedrag riskeren.

## Besluit

1. Een compatibiliteitscompiler vertaalt ondersteunde bestaande configuratie naar
   een expliciete workflow draft/version zonder het bronrecord te wijzigen.
2. Per change type vergelijkt shadow mode validatie, rollen, routering en beoogde
   mutaties met het huidige pad; shadow mode voert geen extra mutatie uit.
3. Activatie gebeurt per change type achter een feature flag. Niet-gemigreerde types
   blijven via de bestaande slug registry en apply strategy lopen.
4. Lopende klassieke requests veranderen niet van engine. Historische records
   behouden hun bestaande renderer of een opgeslagen representatiesnapshot.
5. Terugschakelen stopt alleen nieuwe Workflow Studio-instances; reeds gestarte
   instances blijven aan hun gepinde versie gekoppeld en worden afgehandeld.

## Gevolgen

Migratie wordt meetbaar en omkeerbaar, met tijdelijk twee uitvoeringspaden en extra
contracttests. Een automatische omzetting zonder vergelijking en een directe
verwijdering van de registry zijn afgewezen.
