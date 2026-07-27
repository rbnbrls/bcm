# Procesflow diagrammen

Deze map bevat procesflowdiagrammen voor elk change type in de BCM-applicatie.

## Bestanden

Elk change type heeft twee bestanden:
- `*.svg` — Schaalbare vectorafbeelding (geschikt voor embedden in documentatie)
- `*.png` — Rasterafbeelding (geschikt voor embedden in webpagina's)

## Change types

| Change type                 | Slug                    | Stappen | Partijen               |
|-----------------------------|-------------------------|---------|------------------------|
| Nieuwe klant                | customer_onboarding     | 4       | Interne administratie, Asset service provider |
| Benchmarkwissel             | benchmark_switch        | 5       | Interne administratie, Asset service provider, FactSet |
| Nieuwe benchmark            | new_benchmark           | 4       | Interne administratie, Asset service provider |
| Tariefwijziging             | fee_change              | 4       | Interne administratie, Asset service provider, FactSet |
| Mandaatwijziging            | mandate_change          | 4       | Interne administratie, Asset service provider |
| Custodianwijziging          | custodian_change        | 4       | Interne administratie, Asset service provider |
| Herbalanceringsdrempel      | rebalance_trigger       | 4       | Interne administratie, Asset service provider |

## Regenereren

Om de diagrammen opnieuw te genereren (bijvoorbeeld na wijzigingen in de processtappen):

```bash
node scripts/render-flowcharts.mjs
```

Dit script gebruikt Playwright om Mermaid-definities te renderen in een headless browser.
