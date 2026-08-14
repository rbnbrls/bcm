# Workflow Studio Template Management

Templatebeheer bepaalt welke processen en fragmenten change managers veilig
kunnen hergebruiken.

## Bibliotheek

De template library bevat curated templates en fragmenten. Huidige bronnen:

- `benchmark_switch.v1`
- `generic_field_change.v1`
- `manager_switch.v1`
- `portfolio_configuration_create.v1`
- `risk_gate_fragment.v1`
- `risk_gate_fragment.v2`
- `sub_asset_class_switch.v1`

Curated items zijn actief voor nieuwe drafts. Deprecated items blijven leesbaar
voor bestaande drafts en upgradevergelijking, maar mogen niet meer als nieuwe
standaard worden gepromoot.

## Beheerproces

1. Maak of wijzig een template in een aparte draft.
2. Simuleer met sample data.
3. Controleer governance policies en block reference.
4. Publiceer als immutable workflowversie of registreer als fragmentversie.
5. Markeer oudere varianten deprecated wanneer een upgradepad bestaat.
6. Communiceer breaking changes in de change-managertraining.

## Upgrade

Een upgrade is veilig wanneer role bindings, verplichte variabelen, mutatiepad,
cost model en publicatiescope gelijkwaardig of expliciet gewijzigd zijn. Gebruik
upgrade candidates uit de library om draft-eigenaren gericht te informeren.
