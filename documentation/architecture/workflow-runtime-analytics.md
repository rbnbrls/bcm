# Workflow runtime analytics

Dit document beschrijft het procesanalytics-contract voor de Workflow Studio.

## Doel

Procesanalytics is een read-only dashboardmodel naast het operationele
runtime-dashboard. Het model rapporteert uitsluitend aggregaten en bevat geen
workflowinput, variabelen, snapshotvelden, task-ID's, instance-ID's, actor-ID's
of clientgeheimen.

`WorkflowRuntimeAnalyticsService` levert:

- volume, afgeronde instances, failures, failure rate en gemiddelde doorlooptijd
  per workflowversie;
- executies, gemiddelde nodeduur, failure rate en rework per node;
- taakvolume, wachttijd, doorlooptijd, rejection count en SLA-overdue per rol;
- samenvattende totalen voor volume, failures, rework, rejecties en SLA.

## Filters en autorisatie

Alle queries worden uitgevoerd met `WorkflowRuntimeAnalyticsFilters`:

- `scope.tenant`;
- `scope.businessUnit`;
- optioneel `scope.clientIds`;
- periode `from` tot `to`;
- optioneel een lijst `workflowVersionIds`.

De service valideert de periode en lege versionfilters voordat de reader wordt
aangeroepen. Daarna vereist de service `workflow:view` en toetst hij de scope
met dezelfde Workflow Studio-autorisatie als runtime-details.

De PostgreSQL-reader dwingt dezelfde filters opnieuw af in SQL. Bij een
clientfilter worden alleen instances meegenomen waarvan `client_ids` volledig
binnen de aangevraagde clientscope vallen. Businessunit-brede instances worden
daardoor niet in clientgebonden analytics getoond.

## Dashboardweergave

`/workflow-runtime` toont naast operationele counts nu een procesanalyticsblok
met server-side filters voor periode, workflowversie en client. De pagina leidt
fail-closed om wanneer database, feature flag, `workflow:view` of identity-scope
ontbreekt.

De dashboardtabellen gebruiken uitsluitend labels, versienummers, node keys,
blocktypes, rollen en geaggregeerde aantallen/tijden. Detailonderzoek naar een
specifieke instance blijft in de runtime-detailweergave en valt buiten het
analyticsmodel.
