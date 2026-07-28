# Clientconfig 3NF-oplossing

## Installatie en generatie
```bash
npm install
npm run generate:testdata -- 100 20260728 clientconfig_test_data.json
```
Argumenten: aantal accounts, seed en uitvoerbestand. Standaard: 25, 20260728 en `clientconfig_test_data.json`.

## Selectielogica
Gebruik `ASSET_CLASS_VALUES` voor de eerste keuzelijst. Filter daarna `ASSET_SUB_ASSET_OPTIONS` op `assetClass` voor de tweede keuzelijst. Valideer de uiteindelijke combinatie met `AssetSubAssetSelection`. De generator gebruikt exact dezelfde catalogus.

## Database
Voer `clientconfig_schema.sql` uit op PostgreSQL 15+. Het script maakt tabellen, laadt de toegestane hiërarchie en activeert de validatietrigger.

## Sleutel
`NEW_PORTFOLIO_CODE + "_" + ASSET_CLASS_CODE + SUB_ASSET_CLASS_CODE + "_" + MANAGER_CODE`. Voorbeeld: `ABA_EQBIO_AIM`.
