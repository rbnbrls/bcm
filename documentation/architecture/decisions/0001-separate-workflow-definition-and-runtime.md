# ADR-0001: Scheid workflowdefinitie en runtime

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

De huidige `change_type_config.process_flow` beschrijft vooral een proces voor de
UI. Uitvoering wordt bepaald door de hardcoded registry, submit actions en apply
strategies. Een wijzigbare ontwerpstructuur rechtstreeks uitvoeren zou lopende
changes onvoorspelbaar maken en authoringrechten met uitvoeringsrechten mengen.

## Besluit

Workflow authoring en runtime krijgen gescheiden modellen en opslag:

1. Een workflow definition bevat identiteit en wijzigbare drafts.
2. Publicatie valideert en compileert een draft naar één immutable workflow version.
3. Een workflow instance verwijst uitsluitend naar die gepubliceerde versie en
   leest tijdens uitvoering nooit een draft.
4. Runtimegegevens (instances, tokens, taken, variables, snapshots, intents en
   events) worden apart opgeslagen van ontwerpgegevens.
5. Alleen expliciet geversioneerde contracten vormen de grens tussen compiler en runtime.

## Invarianten

- Een draft kan nooit worden gestart.
- Een bestaande instance verandert niet wanneer een nieuwe versie wordt gepubliceerd.
- Ontwerpvalidatie heeft geen side effects in runtime of client-config.
- Runtime-events worden nooit teruggeschreven naar de workflowdefinitie.

## Gevolgen

Een change manager kan veilig itereren en meerdere versies beheren. Daartegenover
staan extra opslag, een compiler/publicatiestap en expliciete migraties van
contractversies. Een enkel mutable JSON-document voor ontwerp én runtime is
afgewezen omdat historie, herstel en audit dan niet betrouwbaar zijn.
