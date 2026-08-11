# Workflow Studio Block Reference

Deze reference beschrijft de v1 blockcontracten die change managers in de
builder kunnen gebruiken. Block types zijn stabiele contractnamen; labels mogen
per workflow worden aangepast.

| Block type | Doel | Belangrijkste configuratie | Runtime-effect |
|---|---|---|---|
| `manual_start` | Start een instance door een bevoegde rol | `label`, `starterRoleIds`, `dataScope` | Maakt de initiële runtime context en variabelen |
| `end` | Sluit een pad af | `label`, `outcome` | Zet het nodepad op completed, rejected of cancelled |
| `form` | Vraagt gegevens uit | `title`, `description`, `fields` | Valideert formulierdata en schrijft variabelen |
| `role_task` | Wijst handmatig werk toe | `roleId`, `title`, `instructions`, deadlinevelden | Maakt een taak voor `workflow:tasks:execute` |
| `approval` | Legt besluit vast | `roleId`, `decisionLabels`, commentaarregels, quorum | Maakt approvaltaken en bewaakt maker-checker |
| `client_config_lookup` | Leest beheerde catalogdata | resource, filters, parent binding, outputvariabele | Schrijft een gemaskeerde snapshot/lookupvariabele |
| `change_request` | Plant client-configmutatie | resource, operation, mappings, rationale/effective date | Maakt een getypeerde change intent |
| `decision` | Routeert op variabelen | rule group, operatoren, value types | Kiest vervolgpad op basis van runtimevariabelen |
| `notification` | Stuurt bericht | ontvangers, kanaal, safe template, variabelen | Plaatst notificatie in outbox |
| `parallel_split` | Start parallelle paden | splitlabel en padmetadata | Activeert meerdere vervolgpaths |
| `parallel_join` | Wacht op parallelle paden | join mode, vereiste paden | Laat runtime pas door wanneer joinconditie klopt |
| `subworkflow` | Roept gepubliceerde workflow aan | target version, input/output mappings | Start of wacht op onderliggende workflow |
| `integration` | Roept beheerde connector aan | connector, versie, input/output, timeout, signing | Plaatst integration call in sandboxed outbox |

## Ontwerpregels

- Gebruik precies één `manual_start`.
- Laat geen niet-`end` block zonder uitgaande flow achter.
- Gebruik `client_config_lookup` en `change_request` in plaats van vrije SQL.
- Gebruik `integration` alleen met sandbox mode, secret references en signing.
- Gebruik `parallel_join` bij iedere betekenisvolle `parallel_split`.
- Documenteer variabele-ID's in snake_case en hergebruik ze consequent.
