# ADR-0003: Gebruik versioned block contracts

**Status:** Geaccepteerd
**Datum:** 2026-08-06

## Context

Herbruikbare blokken moeten ontwerp, validatie en uitvoering hetzelfde laten
interpreteren zonder dat een change manager code, SQL of vrije handlernamen invoert.

## Besluit

Het platform beheert een registry van `BlockDefinition`-contracten met ten minste:

```text
type + contractVersion + category
configSchema + inputPorts + outputPorts
capabilities + uiMetadata
validatorId + runtimeHandlerId
```

Een node verwijst naar een exacte combinatie van type en contractVersion en bevat
alleen declaratieve configuratie die tegen `configSchema` valideert. De compiler
controleert poorttypen, vereiste rolbindingen, capabilities, bereikbaarheid en
acycliciteit. Onbekende types, vrije code, SQL en niet-geregistreerde handlers
worden geweigerd. Meerdere contractversies mogen naast elkaar bestaan zolang er
gepubliceerde workflows naar verwijzen.

## Gevolgen

UI en runtime delen één expliciet contract en upgrades worden beheersbaar. Nieuwe
capabilities vereisen wel platformcode, review en versiebeheer. Een generiek
“script block” en een impliciet contract afgeleid uit UI-componenten zijn afgewezen.
