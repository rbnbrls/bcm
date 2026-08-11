# Workflow Studio — starten en runtimeformulieren

**Status:** geïmplementeerd ontwerpcontract  
**Versie:** 1  
**Datum:** 2026-08-11

Deze runtimegrens maakt gepubliceerde Studio-workflows zichtbaar in de
changecatalogus en start ze via een server-side gevalideerd formulier. De
functionaliteit blijft volledig gesloten zolang `workflow_runtime.start` niet
is ingeschakeld.

## Autorisatie en scope

De catalogus toont alle gepubliceerde workflows binnen het bestaande
workflow-overzicht, maar biedt alleen een startactie wanneer `prepare` slaagt.
Diezelfde controle wordt opnieuw uitgevoerd bij het tonen én verzenden van het
formulier:

1. de aangevraagde versie bestaat en heeft status `published`;
2. de bijbehorende definitie is nog `published` en dus niet uitgefaseerd;
3. de ondertekende identiteit heeft `workflow:start` binnen tenant,
   business-unit en de doorsnede van identity- en workflowscope;
4. wanneer de gepubliceerde `manual_start` expliciete starterrollen bevat, is
   de gebruiker via de onveranderlijke role bindings aan zo'n rol gekoppeld;
5. de gepubliceerde versie bevat minstens één geldig formuliercontract.

Deze dubbele controle voorkomt dat een eerder geopend formulier na intrekking
van rechten of uitfasering alsnog kan starten. De browser levert nooit
autoritatieve rollen, scope, formulieren of versiegegevens aan.

## Formuliercontract

Elk veld wordt gerenderd uit de onveranderlijke configuratie van een
gepubliceerde `form`-node. HTML-attributen geven directe feedback, maar de
server parseert en valideert iedere inzending opnieuw met hetzelfde
`workflowFormBlockConfigurationSchema` en
`validateWorkflowFormSubmission`-contract.

Veldnamen hebben de vorm `<nodeKey>.<fieldId>`, zodat velden uit meerdere
formulieren niet in de browser botsen. Alleen gedeclareerde velden worden
gelezen. Getallen, valuta, booleans en multiselects worden expliciet naar hun
runtime-type geconverteerd. Een dubbele schrijver naar dezelfde
instancevariabele wordt geweigerd. Gevalideerde waarden worden als
`confidential` getypeerde instancevariabelen opgeslagen; onbekende formdata
wordt genegeerd.

## Pinnen en idempotency

De startactie gebruikt uitsluitend het gepubliceerde versie-ID dat op de pagina
is voorbereid. `WorkflowRuntimeEngine.start` laadt dit graphcontract opnieuw en
weigert niet-gepubliceerde of uitgefaseerde definities. De instance bewaart
daardoor altijd het exacte `workflow_version_id`, ook wanneer later een nieuwe
versie wordt gepubliceerd.

Per gerenderd formulier worden server-side UUID's voor idempotency en
correlation aangemaakt. Herhaalde levering van dezelfde startactie retourneert
de bestaande instance via de unieke `(tenant, idempotency_key)`-grens en maakt
geen tweede instance, startnode, event of variabele aan.

## Foutgedrag

- drafts, ontbrekende versies en uitgefaseerde definities geven geen
  startpagina;
- ontbrekende rechten, rollen of gemeenschappelijke scope leveren geen
  instance op;
- veldfouten worden per collision-safe veldnaam teruggegeven;
- iedere databasefout rolt instance, start-event, node-activatie en variabelen
  gezamenlijk terug via de transactionele engine-store;
- zonder database of feature flag blijft de klassieke catalogus bruikbaar.
