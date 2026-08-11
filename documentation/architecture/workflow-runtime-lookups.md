# Workflow Studio — runtime-lookups en snapshots

**Status:** geïmplementeerd ontwerpcontract  
**Versie:** 1  
**Datum:** 2026-08-11

`client_config_lookup` is de runtimebrug tussen een gepubliceerde
workflowdefinitie en actuele client-configdata. De handler voert uitsluitend
beheerde catalogusreads uit, bewaart de gelezen bronstaat als append-only
snapshot en publiceert de geselecteerde waarden als getypeerde
runtimevariabele.

## Execution

Een lookupnode wordt eerst normaal geclaimd via de transactionele engine. Pas
wanneer de node `running` is, mag `executeClientConfigLookup` hem uitvoeren.
De handler laadt binnen dezelfde instance-lock:

1. de gepinde gepubliceerde workflowversie;
2. de onveranderlijke nodeconfiguratie;
3. de actuele instancevariabelen voor variabele filters;
4. de instance-scope voor tenant, businessunit en eventuele clientvernauwing.

De nodeconfiguratie wordt opnieuw gevalideerd met
`workflowLookupConfigurationSchema`. Literal filters worden rechtstreeks aan de
read-adapter doorgegeven. Variabele filters mogen alleen een JSON-primitieve
waarde opleveren. Attribuut-parentbindings lezen hetzelfde attribuut uit de
bronvariabele. Alle reads lopen via `ClientConfigReadService`, waardoor
`workflow:view`, tenant, businessunit, client-scope, catalogusresource,
attributen en filterwaarden opnieuw server-side worden gevalideerd.

`selection: "one"` vereist exact één record. Geen of meerdere resultaten falen
gesloten met `lookup_failed` en rollen node-status, events, snapshots en
variabelen terug. `selection: "many"` schrijft maximaal honderd snapshots in
deterministische adaptervolgorde.

## Snapshotcontract

Voor ieder geselecteerd record wordt één rij in `workflow_data_snapshot`
geschreven met:

- `resource_id` en `source_record_id`;
- `selected_fields`, uitsluitend catalogusattributen;
- `concurrency_token`, berekend over de volledige bronrecordstaat;
- `snapshot_version`, `read_at`, `correlation_id` en `causation_id`;
- een command-afgeleide idempotency key.

De tabel blijft append-only via de bestaande databaseguard. Herlevering van
dezelfde lookupcommand vindt het eerdere command-event en leest de bestaande
resultaten terug zonder een tweede snapshot of variabele te schrijven.

## Runtimevariabele

De outputvariabele gebruikt de `outputVariable` uit de gepubliceerde
lookupconfiguratie en krijgt classificatie `confidential`.

Bij `selection: "one"` is de waarde een object met de geselecteerde velden op
topniveau. Daardoor kunnen latere `change_request`-mappings een IST-attribuut
direct uit de snapshotvariabele lezen. De metadata staat onder `_snapshot`:

```json
{
  "code": "HOR",
  "name": "Horizon",
  "_snapshot": {
    "id": "snapshot-uuid",
    "resourceId": "client",
    "sourceRecordId": "HOR",
    "concurrencyToken": "sha256:...",
    "snapshotVersion": 1,
    "readAt": "2026-08-11T08:00:00.000Z"
  }
}
```

Bij `selection: "many"` is de variabele een array van dezelfde objectvorm.

## Audit

Naast het reguliere `workflow.node.succeeded`-event schrijft de handler
`workflow.lookup.snapshotted`. Dit event bevat nodekey, resource,
outputvariabele, selectiebeleid, snapshot-ID's en bronrecord-ID's. Daardoor
blijft verklaarbaar welke live data een instance heeft gebruikt, ook wanneer
client-config later wijzigt.
