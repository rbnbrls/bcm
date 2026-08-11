# Workflow Studio Author Guide

Deze gids beschrijft hoe een change manager een workflow ontwerpt, test,
publiceert en start zonder codewijziging.

## Voorbereiding

1. Bepaal de scope: tenant, business unit en optionele clientrestrictie.
2. Kies een bestaande template of start met een lege draft.
3. Verzamel de verplichte gegevens: aanvraagvelden, betrokken rollen,
   goedkeuringsregels, data catalog resource en gewenste runtime-uitkomst.
4. Controleer of iedere rolbinding binnen de eigen beheerscope valt.

## Ontwerpen

Gebruik `manual_start` als enige ingang en eindig ieder pad met een `end` block.
Plaats formulier-, lookup-, taak-, beslissing- en mutatieblocks in de volgorde
waarin de change wordt afgehandeld. Gebruik de outline en zoekfunctie bij grote
workflows; gebruik de minimap om het totaalbeeld te bewaken.

## Simulatie

Voer voor publicatie minimaal deze simulatie uit:

1. Geldige happy path met realistische formulierwaarden.
2. Afwijzing of terugsturen bij een approval.
3. Ontbrekende verplichte variabele.
4. Mutatiepad met verwachte change intent.

Los alle blockers op. Warnings mogen alleen worden geaccepteerd wanneer de
governancehandleiding uitlegt waarom ze verantwoord zijn.

## Publicatie

Een publicatie maakt een immutable workflowversie. Controleer voor publicatie:

- validatie heeft nul blockers;
- governance policy issues zijn opgelost;
- role bindings scheiden starten, uitvoeren en goedkeuren;
- catalog description en cost model zijn ingevuld;
- runtime cutover koppelt het actieve change type aan de gepubliceerde versie.

## Runtime

Na publicatie start de change via `/workflow-runtime/{versionId}/start` of via
de change catalogus wanneer `workflow_version_id` gekoppeld is. Monitor de
eerste instances in het runtime dashboard en leg afwijkingen vast volgens het
operations runbook.
