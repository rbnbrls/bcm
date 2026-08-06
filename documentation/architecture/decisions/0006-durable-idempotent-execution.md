# ADR-0006: Maak uitvoering duurzaam en idempotent

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

Langlopende processen wachten op mensen, timers en externe systemen. Processen
moeten herstarten na crashes zonder dubbele taken, goedkeuringen of mutaties.

## Besluit

Commands worden transactioneel verwerkt en produceren alleen na een geslaagde
toestandswijziging append-only events. Externe effecten lopen via een durable
outbox. Iedere node-executie en mutatie gebruikt een unieke idempotency key;
dezelfde key geeft hetzelfde opgeslagen resultaat terug.

Alleen geclassificeerde transient technical failures krijgen begrensde exponential
backoff. Validatie-, autorisatie-, business- en conflictuitkomsten worden niet
automatisch herhaald. Na uitgeputte retries gaat de node naar
`needs_intervention`, met handmatige retry/cancel/resume als geautoriseerde en
geaudite acties. Een menselijke beslissing is een eenmalig event en wordt nooit
door een technische retry opnieuw gevraagd of toegepast.

De normatieve statussen en foutklassen staan in de
[domeinwoordenlijst](../workflow-studio-domain-glossary.md).

## Gevolgen

Uitvoering is herstelbaar en auditbaar, maar vereist transacties, leases,
deduplicatie, outboxverwerking en operationele tooling. Fire-and-forget jobs en
onbegrensde retries zijn afgewezen.
