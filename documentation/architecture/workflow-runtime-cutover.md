# Workflow Runtime cutover

Gefaseerde runtime cutover schakelt gepubliceerde Workflow Studio-versies per
workflowdefinitie of per gepinde versie naar de nieuwe runtime. De klassieke
changeflows blijven de fallback zolang een cutoverflag uit staat.

## Flags

Runtime-start heeft twee grenzen:

- globale startpoort: `workflow_runtime.start`
- per-workflow of per-versie cutover:
  - `BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_<DEFINITION_ID>`
  - `BCM_FEATURE_WORKFLOW_RUNTIME_VERSION_<VERSION_ID>`

ID-fragmenten worden hoofdletters en alle niet-alfanumerieke tekens worden `_`.
Voorbeeld: `definition-1` wordt
`BCM_FEATURE_WORKFLOW_RUNTIME_WORKFLOW_DEFINITION_1`.

## Startbeslissing

Een gepubliceerde workflowversie wordt alleen als runtime-aanvraag getoond als:

- de globale runtime-startflag aan staat;
- `WorkflowRuntimeStartService.prepare()` slaagt voor identity, scope en
  starterrol;
- de definitie- of versiecutoverflag aan staat.

De startpagina en server action controleren dezelfde policy opnieuw. Directe
links naar een gepubliceerde versie kunnen de cutover dus niet omzeilen. Een
rollback naar classic is een featureflagrollback: zet de per-workflow/per-versie
flag uit en nieuwe aanvragen krijgen geen runtime-startpad meer. Bestaande
runtimeinstances blijven gekoppeld aan hun gepubliceerde versie en blijven via
runtime operations zichtbaar.

## Monitoring

`evaluateWorkflowRuntimeCutoverHealth()` berekent de runtimefoutgraad als:

```text
(failed + needs_intervention) / started
```

De standaarddrempel is 5%. Boven de drempel retourneert de healthcheck
`rollback_recommended`. Operators gebruiken dit naast het runtime-dashboard met
failed/blocked counts, dead letters, SLA-overdue taken en adapterfouten.

## Nieuwe instances

Cutover wijzigt alleen de route voor nieuwe aanvragen. Klassieke historische
requests blijven via de bestaande detailreaders renderen. Lopende runtime-
instances worden niet teruggezet naar classic; rollback voorkomt uitsluitend dat
nieuwe instances via de engine worden gestart.
