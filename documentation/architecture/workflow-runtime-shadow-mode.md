# Workflow Runtime shadow mode

Runtime shadow mode vergelijkt twee legacy changeflows side-effectvrij met hun
Workflow Studio-equivalent, terwijl de klassieke aanvraagroute leidend blijft.
De vergelijking draait alleen wanneer `workflow_runtime.shadow_compare` aan staat.

## Ondersteunde flows

- `benchmark_switch`
- `fee_change`

Andere change types rapporteren `unsupported` en worden niet vanuit de klassieke
server actions aangeroepen.

## Vergelijkingsset

De afgesproken gelijkwaardigheidsset bestaat uit vier checks:

- `form_data`: de door classic gevalideerde formulierwaarden tegenover de
  variabelen die het gecompileerde workflowformulier zou opleveren.
- `decisions`: mandatory approval-stakeholders tegenover gecompileerde
  approval-nodes. Klassieke statusovergangen blijven buiten scope van deze
  shadowcheck.
- `staging`: het klassieke stagingresource tegenover het resource in het
  gecompileerde `change_request`-blok.
- `apply_plan`: resource, operatie en attribuutdiffs tegenover het runtime
  change-intentplan.

De vergelijking gebruikt geen live writes, runtime-instance-start of outboxdelivery.
Hij leest alleen de klassieke `change_type_config`, compileert deze via de
compatibility compiler en deriveert het runtimeplan uit het gecompileerde contract.

## Resultaatsemantiek

- `equivalent`: alle checks zijn gelijk.
- `explained_deviation`: er is een bekend migratiegat met uitleg, maar geen
  onverwachte mismatch.
- `mismatch`: minimaal één check wijkt onverwacht af of de shadowvergelijking
  heeft issues.
- `unsupported`: de change type slug hoort niet bij deze shadowfase.

Voor `benchmark_switch` moet de vergelijking volledig equivalent zijn: dezelfde
formulierdata, approvalbeslissing, stagingresource en `portfolio_configuration`
UPDATE op `benchmark_code`.

Voor `fee_change` zijn formulierdata en approvalbeslissing equivalent. Het
applyplan is bewust `explained_deviation`, omdat de legacy flow via `ist_sync`
loopt en nog geen governed Workflow Studio mutation-adapter voor feevelden heeft.
Die afwijking is het expliciete migratierestpunt voor latere self-service.

## Observability

De klassieke submitacties blokkeren niet op shadow mode. Bij een onverwachte
`mismatch` of een exception wordt `reportError()` aangeroepen met:

- change type slug;
- change request ID;
- shadowstatus.

Een verklaarde `fee_change`-afwijking wordt niet als fout gemeld. Daarmee kan de
runtimevergelijking veilig in productie meelopen zonder gebruikersimpact.
