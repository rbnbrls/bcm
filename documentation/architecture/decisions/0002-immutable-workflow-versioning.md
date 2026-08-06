# ADR-0002: Publiceer onveranderlijke workflowversies

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

Enterprise changeprocessen moeten achteraf exact reproduceerbaar zijn. Mutable
configuratie met alleen een `updated_at`-waarde bewijst niet welke logica een
lopende of afgeronde change heeft gebruikt.

## Besluit

- Een definitie heeft maximaal één wijzigbare draft en nul of meer gepubliceerde versies.
- Publicatie kent een per definitie oplopend versienummer toe en bewaart canonical
  content, schema version, SHA-256 content hash, actor en tijdstip.
- Nodes, edges, rolbindingen en gebruikte block contract-versies behoren tot de
  immutable publicatiesnapshot.
- Iedere instance bewaart `workflow_version_id`; late binding naar “latest” is verboden.
- Een gepubliceerde versie wijzigen betekent: maak een nieuwe draft en publiceer
  een nieuw nummer. Een rollback publiceert oude inhoud opnieuw als nieuw nummer.
- Draft writes gebruiken een revision/concurrency token en weigeren stale updates.

## Voorbeeld

Versie 3 blijft versie 3 en behoudt haar hash. Een herstel naar de inhoud van
versie 2 resulteert in versie 4; bestaande instances op 2 en 3 blijven ongewijzigd.

## Gevolgen

Historie en incidentonderzoek zijn reproduceerbaar en caching wordt veilig.
Opslag groeit en schema-upgrades vereisen expliciete compatibiliteitsregels. Het
muteren of verwijderen van gepubliceerde JSON is afgewezen.
