# Workflow Runtime dashboard

Het operationele runtime-dashboard is een read-only supportweergave achter de
feature flag `workflow_runtime.start` en de permissie `workflow:view`.

## Scope

Het dashboard toont:

- aantallen actieve, wachtende, geblokkeerde en mislukte workflowinstances;
- dezelfde statusbucket voor runtime-nodes;
- de oudste open of geclaimde taken;
- taken waarvan de SLA-deadline is verlopen;
- outboxberichten met status `dead_letter`;
- change intents met status `conflicted` of `failed`.

Alle rijen linken door naar de runtime-detailpagina van de instance. Herstelacties
blijven in die detailpagina en vragen daar `workflow:manage`.

## Labelcontract

Metrics en alerts bevatten uitsluitend operationele labels:

- workflownaam;
- workflowversie-ID en versienummer;
- node key en block type;
- technische status, foutcode of laatste deliveryfout;
- taak-, intent-, bericht- en instance-ID's.

Het dashboardmodel neemt geen workflowinput, variabelen, snapshotvelden,
change-intentpayloads, preconditions of outboxpayloads op. Adapteralerts gebruiken
alleen adapter-ID, resource-ID, operatie, status en optionele foutcode/-melding.
Daardoor kunnen operators falende uitvoering vinden zonder gevoelige SOLL-/IST-
waarden of notificatie-inhoud te lezen.

## Querygrenzen

`PostgresWorkflowRuntimeDashboardReader` bouwt het readmodel rechtstreeks uit de
runtime-tabellen en joint alleen naar definitie-, versie- en node-tabellen voor
labels. Lijsten zijn begrensd:

- oudste taken: 10;
- verlopen SLA-taken: 25;
- dead letters: 25;
- adapterfouten: 25.

De service deriveert alerts uit deze begrensde lijsten plus de globale status-
tellingen. Alerts zijn dus bedoeld voor triage, niet als auditlog. De volledige
reconstructie blijft beschikbaar via de instance-detailweergave en de append-only
runtime-events.
