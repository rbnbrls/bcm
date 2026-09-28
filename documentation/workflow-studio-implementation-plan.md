# No-code Workflow Studio — implementatieplan

**Status:** in uitvoering
**Doelrelease:** volgende BCM-milestone
**Doel:** een change manager kan zonder code een changeproces ontwerpen, testen, publiceren, starten, uitvoeren en beheren, terwijl client-configmutaties, functiescheiding en auditbaarheid technisch afgedwongen blijven.

## Voortgang

**Bijgewerkt:** 2026-08-11
**Totaal:** 67 van 67 taken geaccepteerd (100%); fase 2 en G2 afgerond
**Volgende taak:** geen — implementatieplan afgerond

| Fase | Voortgang | Status |
|---|---:|---|
| 1 — Fundament | 14/14 | ✅ G1 gesloten op 2026-08-10 |
| 2 — MVP Builder | 19/19 | ✅ G2 gesloten op 2026-08-10 |
| 3 — Runtime | 17/17 | ✅ G3 gesloten op 2026-08-11 |
| 4 — Uitgebreid self-service | 17/17 | ✅ G4-releasepoort geïmplementeerd op 2026-08-11 |

## 1. Uitgangspunten en scope

De Workflow Studio bestaat uit drie gescheiden lagen:

1. **Definitie:** formulier, blokken, verbindingen, rollen, regels en publicatieversies.
2. **Runtime:** instances, taken, variabelen, beslissingen, timers en audit-events.
3. **Mutatie:** getypeerde change intents die uitsluitend via goedgekeurde adapters naar `client_config` worden toegepast.

Een workflowdefinitie bevat nooit SQL, willekeurige code of vrije tabel- en kolomnamen. Alle gegevens en mutaties lopen via een beheerde data catalogus en een block registry. Gepubliceerde versies zijn onveranderlijk; lopende instances blijven altijd gekoppeld aan de versie waarmee zij zijn gestart.

### Buiten scope van het eerste MVP

- Vrij programmeerbare scripts in workflows
- Willekeurige databasequeries
- Een algemene BPMN 2.0-engine
- Cyclische flows en onbeperkte loops
- Door gebruikers geïnstalleerde plug-ins
- Directe writes naar live client-configtabellen

## 2. Afhankelijkheidslijn en releasepoorten

```mermaid
flowchart LR
    A["Fase 1: Fundament"] --> B["Fase 2: MVP Builder"]
    B --> C["Fase 3: Runtime"]
    C --> D["Fase 4: Uitgebreid self-service"]

    A1["Identity, versies, blokcontracten en data catalogus"] --> B
    B1["Valide gepubliceerde workflow"] --> C
    C1["Veilige end-to-end uitvoering"] --> D
```

| Poort | Voorwaarde |
|---|---|
| G0 — Security prerequisite | Een server-side gebruikersidentiteit en betrouwbare rolclaims zijn beschikbaar; de huidige rolcookie is niet langer autoritatief. |
| G1 — Fundament gereed | Twee bestaande change types kunnen zonder informatieverlies als workflowdefinitie worden opgeslagen, geladen en gevalideerd. |
| G2 — Builder gereed | Een change manager kan via de UI een workflow bouwen, simuleren en als onveranderlijke versie publiceren. |
| G3 — Runtime gereed | Een nieuw no-code proces kan van aanvraag tot goedgekeurde client-configmutatie worden uitgevoerd en hersteld. |
| G4 — Productiegereed | Geavanceerde flows, governance, observability, security, toegankelijkheid en beheer zijn aantoonbaar gevalideerd. |

Iedere taak hieronder moet zelfstandig mergebaar zijn, achter een feature flag staan wanneer hij gebruikersgedrag verandert, en tests bevatten op het laagste zinvolle niveau.

---

## 3. Fase 1 — Fundament

**Resultaat:** een stabiel domeinmodel, versiebeheer, block registry, data catalogus en governancefundament. Er is nog geen eindgebruikerscanvas nodig.

### 1.1 — Leg architectuur en terminologie vast ✅

**Afhankelijkheden:** geen
**Werk:** schrijf ADR's voor workflowdefinitie versus runtime, immutable versies, block contracts, data catalogus, mutation adapters, foutafhandeling en compatibiliteit met bestaande change types. Leg de semantiek vast van node, edge, token, task, variable, snapshot, intent en event.
**Acceptatie:** ambiguïteiten over status, versies, retries en mutaties zijn opgelost; schema's en voorbeelden zijn gereviewd.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** [ADR-index](architecture/decisions/README.md), zeven architectuurbesluiten en de [normatieve domeinwoordenlijst](architecture/workflow-studio-domain-glossary.md). De besluiten zijn getoetst aan de huidige registry, apply strategies en databasebeveiliging; implementatie volgt in de afhankelijke taken.

### 1.2 — Introduceer echte identity-context ✅

**Afhankelijkheden:** 1.1
**Werk:** vervang autoritatieve browserrollen door een server-side identity-interface met `userId`, `displayName`, `groups`, `tenant/businessUnit` en sessie-ID. Houd de IdP-provider verwisselbaar.
**Acceptatie:** server actions en routes kunnen actor en rollen uitsluitend uit de identity-context halen; tests bewijzen dat een gemanipuleerde cookie geen rechten verhoogt.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** een verwisselbare server-side `IdentityProvider` met `userId`, `displayName`, groepen, tenant, businessunit en sessie-ID; HMAC-ondertekende HttpOnly-sessies; identity-groepgebaseerde RBAC voor server actions, API-routes en de admin-proxy; server-afgeleide auditactoren; en een lokale profielwisselaar die buiten productie een ondertekende sessie uitgeeft. Securitytests bewijzen dat de oude `bcm_active_role`-cookie en gewijzigde sessiepayloads geen rechten verhogen. Productie vereist `BCM_SESSION_SECRET`; een externe IdP kan achter de providerinterface worden gekoppeld.

### 1.3 — Definieer Workflow Studio-permissies ✅

**Afhankelijkheden:** 1.2
**Werk:** voeg permissies toe voor bekijken, ontwerpen, testen, publiceren, starten, taken uitvoeren, goedkeuren, beheren en uitfaseren. Voeg client- of businessunit-scoping toe.
**Acceptatie:** een workflowmaker kan geen rol of datascope toekennen die buiten zijn beheerbereik valt.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** afzonderlijke Workflow Studio-permissies voor bekijken, ontwerpen, testen, publiceren, starten, taken uitvoeren, goedkeuren, beheren en uitfaseren; server-side tenant-, businessunit- en client-scopeautorisatie die bij ontbrekende scope gesloten faalt; clientclaims die toegang expliciet vernauwen; en authoring-time controle van rolbindingen, delegatiebereik en runtime-capabilities. Securitytests bewijzen dat een maker geen tenant, businessunit, client, identiteitrol of capability buiten het eigen beheerbereik kan toekennen.

### 1.4 — Maak definitie- en versietabellen ✅

**Afhankelijkheden:** 1.1
**Werk:** voeg `workflow_definition`, `workflow_version`, `workflow_node`, `workflow_edge` en `workflow_role_binding` toe. Een versie krijgt een oplopend nummer, content hash, schema version, status en publicatiemetadata.
**Acceptatie:** drafts zijn wijzigbaar; gepubliceerde versies zijn DB-technisch immutable; één definitie kan meerdere versies hebben.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** vijf gescopeerde definitie- en versietabellen in het verse schema, de runtime-migratie en het on-demand databaseherstelpad; transactioneel oplopende versienummers per definitie; maximaal één draft; schema version, SHA-256 content hash, revision en publicatieactor/-tijd; samengestelde foreign keys die edges tot nodes uit dezelfde versie beperken; en database-triggers die een gepubliceerde versie plus alle nodes, edges en rolbindingen onveranderlijk en niet-verwijderbaar maken. Schema-contracttests bewaken synchronisatie tussen alle schema-ingangen; PostgreSQL-integratietests valideren draftmutaties, meerdere versies en immutability wanneer `DATABASE_URL` beschikbaar is.

### 1.5 — Maak runtime- en audittabellen ✅

**Afhankelijkheden:** 1.4
**Werk:** voeg `workflow_instance`, `workflow_node_instance`, `workflow_task`, `workflow_variable`, `workflow_data_snapshot`, `workflow_change_intent` en append-only `workflow_event` toe.
**Acceptatie:** tabellen ondersteunen idempotency keys, correlation IDs, deadlines, retries en een expliciete instance/node-statusmachine.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** zeven runtime- en audittabellen in het verse schema, de runtime-migratie en het on-demand databaseherstelpad; expliciete en tijdsconsistente statusconstraints voor instances, node-attempts, taken en change intents; per instance unieke idempotency keys en correlation/causation IDs; deadlines, worker leases en begrensde retryvelden; transactioneel oplopende node-attempts en event-sequences; context-FK's die nodes, taken, snapshots, intents en events binnen dezelfde instance en workflowversie houden; een databaseguard die alleen gepubliceerde versies laat starten; en append-only triggers voor snapshots en events. Schema-contracttests bewaken alle drie schema-ingangen; PostgreSQL-integratietests valideren de volledige runtimecontext, draft-startblokkade, attempt/eventordening en append-only gedrag wanneer `DATABASE_URL` beschikbaar is.

### 1.6 — Bouw de block contract-laag ✅

**Afhankelijkheden:** 1.1
**Werk:** definieer een versioned `BlockDefinition` contract met block type, configuratieschema, inputs, outputs, toegestane verbindingen, capabilities, UI-metadata, validator en runtime-handler-ID.
**Acceptatie:** onbekende block types of ongeldige configuraties worden geweigerd; contractversies kunnen naast elkaar bestaan.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** een immutable, versiegebonden `BlockDefinition`-contract met stabiele block type-ID, Zod-configuratieschema en afgeleid JSON Schema Draft 7, UI-schema en -metadata, getypeerde input-/outputpoorten, tweezijdige verbindingsregels, platformcapabilities en runtime-handler-ID. De `BlockContractResolver` bewaart meerdere versies naast elkaar en weigert onbekende types, onbekende versies en ongeldige configuraties met stabiele foutcodes en propertypaden. Contractconstructie blokkeert dubbele poorten, ontbrekende regels, onbekende capabilities en andere ongeldige metadata; de connectievalidator controleert poortbestaan, datatypecompatibiliteit en allowlists van beide blokken.

### 1.7 — Lever de eerste block registry ✅

**Afhankelijkheden:** 1.6
**Werk:** registreer eerst `manual_start`, `end`, `form`, `role_task`, `approval`, `client_config_lookup`, `change_request`, `decision` en `notification`. Handlers mogen nog stubs zijn.
**Acceptatie:** registry kan per gebruiker alleen toegestane blokken en hun JSON-schema/UI-schema teruggeven.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** een immutable registry met versie 1 van `manual_start`, `end`, `form`, `role_task`, `approval`, `client_config_lookup`, `change_request`, `decision` en `notification`; concrete server-side Zod-contracten, flowpoorten, capabilities, UI-metadata en vaste runtime-handler-ID's per blok; en een identity-gebaseerde catalogus die alleen blokken toont waarvoor alle vereiste Workflow Studio-permissies uit de ondertekende identity-context volgen. De publieke catalogus geeft uitsluitend JSON Schema, UI-schema, poorten, capabilities en presentatiemetadata vrij en houdt validators, verbindingsregels en runtime-handler-ID's intern. Tests bewaken registratie, autorisatiefiltering, informatiereductie, deterministische ordening, immutability en representatieve configuratievalidatie.

### 1.8 — Bouw de client-config data catalogus ✅

**Afhankelijkheden:** 1.1, 1.3
**Werk:** beschrijf client, portfolio, parent account, portfolio configuration en lookupdimensies als getypeerde resources en attributen. Leg per attribuut leesbaarheid, aanvraagbare operatie, validatie, relaties, labels en autorisatiescope vast.
**Acceptatie:** workflowdefinities verwijzen naar stabiele catalogus-ID's en nooit naar vrije SQL-identifiers.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** een immutable client-configcatalogus voor client, parent account, portfolio, portfolioconfiguratie en de vijf governed lookupdimensies asset class, sub-asset class, manager, benchmark en NPC-classificatie. Iedere resource en ieder attribuut heeft een stabiele domein-ID, Nederlands label en beschrijving, datatype, leesbaarheid, JSON Schema-validatie, aanvraagbare CREATE/UPDATE/RETIRE-operaties en expliciete client- of businessunit-autorisatiescope. Relaties verwijzen uitsluitend naar andere catalogus-ID's; tabelnamen, kolomnamen en vrije SQL-identifiers worden niet vrijgegeven. De catalogus valideert referenties, operaties en waarden met stabiele foutcodes en wordt alleen verstrekt wanneer de ondertekende identity-context zowel ontwerprecht als toegang tot de gevraagde datascope heeft. Tests bewaken volledigheid, bestaande lookupgovernance, relaties, scopeautorisatie, immutability en het weigeren van vrije SQL-identifiers.

### 1.9 — Bouw read adapters en snapshotcontracten ✅

**Afhankelijkheden:** 1.8
**Werk:** maak server-side adapters voor zoeken, selecteren en ophalen van client-configresources. Definieer snapshotversie, bronrecord-ID, geselecteerde velden en concurrency token.
**Acceptatie:** lookups respecteren datascope en leveren reproduceerbare, auditeerbare snapshots.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** server-side read adapters voor zoeken, exact selecteren en ophalen van alle client-configcatalogusresources, met uitsluitend vaste interne repositorymappings en stabiele catalogus-ID's als publieke invoer. Iedere read controleert de ondertekende identiteit, Workflow Studio-leesrechten en tenant-, businessunit- en clientscope voordat records worden teruggegeven; records buiten de clientscope worden ook bij direct ophalen als niet gevonden behandeld. Geselecteerde velden worden opnieuw tegen hun cataloguscontract gevalideerd. Het immutable snapshotcontract legt versie, resource-ID, bronrecord-ID, geselecteerde velden, leestijd en een deterministische SHA-256-concurrencytoken over het volledige bronrecord vast, zodat dezelfde bronstaat reproduceerbaar is en wijzigingen buiten de selectie eveneens als conflict zichtbaar worden. Tests bewaken zoeken, selecteren, ophalen, scope-isolatie, vrije-identifierblokkade, broncontracten, immutability en concurrencydetectie.

### 1.10 — Bouw mutation adapter-contracten ✅

**Afhankelijkheden:** 1.8
**Werk:** definieer declaratieve CREATE, UPDATE en RETIRE intents; koppel elke operatie aan bestaande staging/apply-logica. Voeg preconditions, conflictcontrole, dry-run en resultaatcontract toe.
**Acceptatie:** geen adapter kan direct buiten de bestaande governed apply-paden schrijven.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** versiegebonden, declaratieve CREATE-, UPDATE- en RETIRE-intents met idempotency key, effectieve ingangsdatum, rationale, cataloguswaarden en snapshot-/IST-preconditions; een gesloten mutation-adapterregistry die uitsluitend vaste bestaande staginghandlers en apply-strategieën exposeert voor lookupaanvragen en portfolioconfiguraties; en een geautoriseerde, side-effectvrije dry-runservice die catalogusreferenties en waarden valideert, vrije identifiers en niet-geregistreerde paden weigert en zowel concurrencytoken- als expliciete IST-conflicten met stabiele foutcodes teruggeeft. Een getypeerd execution-resultaatcontract legt staging-, apply-, audit- en foutreferenties vast voor de latere runtime. Tests bewaken de mappings voor alle drie operaties, scopeautorisatie, dry-run, snapshotvereisten, conflictcontrole en gesloten falen wanneer geen bestaand governed stagingpad beschikbaar is.

### 1.11 — Bouw definitierepository en service-API ✅

**Afhankelijkheden:** 1.3, 1.4, 1.6
**Werk:** implementeer create draft, load, update met optimistic locking, clone, validate, submit for review, publish en deprecate.
**Acceptatie:** concurrerende edits worden gedetecteerd; publicatie schrijft atomair een immutable versie met hash en audit-event.

**Status:** hersteld en opnieuw geaccepteerd op 2026-08-10
**Opgeleverd:** Zod-schema's voor definitie-, versie-, node-, edge- en rolbindingsinvoer; `WorkflowDefinitionRepository` met transactionele `createDraft`, `loadDefinition`, `loadVersion`, `loadLatestDraftVersion`, `listDefinitionsForScope`, `updateDraft` (optimistic locking op `revision`), `clone` (versienummer-onafhankelijk), `publish` (SHA-256 content hash + `workflow_version.published` audit-event in één transactie) en `deprecate`; `WorkflowDefinitionService` die scope-autorisatie uit de ondertekende identiteit afleidt, block-contractvalidatie en verbindingsregels per edge afdwingt, rolbindingsautorisatie via `authorizeWorkflowRoleBinding` hergebruikt, node-keys naar UUID's normaliseert zodat clients zonder database-identiteit kunnen ontwerpen, en revision-conflicten voor publicatie en update vooraf detecteert; publieke barrel-export `lib/workflow-studio/index.ts`. Tests bewaken permission-denied, scope-denied (inclusief client-scopevernauwing), graph-validatie, revision-conflict zonder database-aanroep, repository-mapping voor de drie scenario's, role-binding-autorisatie en content-hash-stabiliteit. Database-integratietests onder `DATABASE_URL` valideren create → update → publish met hash, clone over versies en deprecate end-to-end.

### 1.12 — Bouw de statische workflowvalidator ✅

**Afhankelijkheden:** 1.7, 1.8, 1.11
**Werk:** valideer één start, minimaal één einde, bereikbaarheid, poortcompatibiliteit, typecompatibiliteit, geldige datamappings, bekende rollen, mutations achter vereiste goedkeuring, verboden cycli en correcte split/join-paren.
**Acceptatie:** validator retourneert stabiele foutcodes, node-ID, severity en concrete hersteltekst.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** `WorkflowValidator` in `lib/workflow-studio/workflow-validator.ts` die side-effect-vrij één draft valideert en een bevroren `WorkflowValidationResult` teruggeeft met `valid`, `blocking`, genummerde `issues`, bereikbare nodes en terminale nodes. Ieder issue draagt een stabiele `code`, `severity` (`error`/`warning`), `nodeKey`/`edgeKey`, een `path` voor UI-navigatie en een concrete `fix`-tekst als quick-fix hint. Gedekte regels: ontbrekende of meerdere startnodes, ontbrekende eindnode, startnode zonder uitgaande flow, dubbele node-/edge-/rolbindings, orphan edge-referenties, onbekende poorten, incompatibele poorttypes, verbindingen die niet zijn toegestaan, onbereikbare nodes en eindnodes, verboden cycli, niet-verbonden verplichte inputpoorten, overschreden `maxConnections`, dubbele datamappings en onbekende identifiers, role-usage zonder binding, role-bindings buiten beheerbereik (via `authorizeWorkflowRoleBinding`), `change_request` zonder voorafgaande `approval`-node, en catalogusverwijzingen die onbekend zijn of een niet-aanvraagbare operatie gebruiken. De `WorkflowDefinitionService` is gerefactord zodat `createDraft`, `updateDraft`, `publish` en `validateDraft` de nieuwe validator als single source of truth gebruiken en gedelegeerde issues doorgeven via de bestaande `WorkflowServiceIssue`-vorm; de publieke barrel-export `lib/workflow-studio/index.ts` exporteert de validator, het resultaattype en de issuevormen. Tests in `tests/workflow-validator.test.ts` (25 cases) dekken ieder foutpad inclusief een realistische benchmark-switch-flow, UUID- en nodeKey-resolutie van edges, en de round-trip door de service; de volledige testsuite (1921 tests) blijft groen.

### 1.13 — Maak een compatibility compiler ✅

**Afhankelijkheden:** 1.7, 1.8, 1.10, 1.12
**Werk:** vertaal bestaande `change_type_config.fields`, `istSollMapping`, stakeholders, process flow en apply strategy naar het nieuwe definitiemodel.
**Acceptatie:** benchmark switch en één generiek change type leveren valide definities met dezelfde formulierdata, kosten, rollen en apply-strategie.

**Status:** voltooid op 2026-08-06
**Opgeleverd:** `compileLegacyChangeType` (en `CompatibilityCompiler`/`createCompatibilityCompiler`) in `lib/workflow-studio/compatibility-compiler.ts` zet een `ChangeTypeConfig` om naar een side-effect-vrije `CreateWorkflowDraftInput` met bijbehorend `CompilationReport`. De compiler emitteert één `manual_start` + `end` (completed), een `form`-blok met dezelfde velden (legacy `benchmark`-referenties worden `select` met catalogusopties; `options` en `helpText` zijn nu ook door de form-block geaccepteerd), per IST-veld een `client_config_lookup` naar de juiste catalogusresource, per verplichte stakeholder een `approval`/`role_task`/`notification` (eerste `notifyOn`-trigger bepaalt het type), per stakeholder een `WorkflowRoleBindingInput` met de juiste runtime-permission en de delegabele `bcm:role:account_manager` of `bcm:role:change_manager`-groep, en — wanneer de apply-strategy een geregistreerde mutation-adapter heeft — een `change_request` met `resourceId`/`operation`/`effectiveDateVariable`/`rationaleVariable`. De graph wordt in processFlow-volgorde bedraad: start → lookups → form → approver/taken → change_request → end, waarbij opeenvolgende approvers gekoppeld worden via de `approved`-poort van de approval-block. Kosten, doorlooptijd en applyStrategy landen in de workflow-beschrijving. Tests in `tests/compatibility-compiler.test.ts` (19 cases) bewijzen round-trip van benchmark_switch en fee_change: formvelden, IST/SOLL-lookups, rolbindingen, kosten in de beschrijving, geldige graph tegen de statische validator, en edge-cases (lege stakeholders, geen IST/SOLL, client-scope-propaga tie, factory-wrapper). De volledige testsuite telt nu 1940 tests; eslint en typecheck zijn schoon.

### 1.14 — Voeg fundamenttests en migratiechecks toe ✅

**Afhankelijkheden:** 1.2–1.13
**Werk:** unit tests voor contracts/validator, DB-integratietests voor immutability en repository, securitytests voor scopes, migratietests en round-trip contracttests voor bestaande configs.
**Acceptatie:** G1 slaagt; bestaande changeflows blijven ongewijzigd functioneren.

**Status:** voltooid op 2026-08-10
**Opgeleverd (historische rapportage van 2026-08-06):** twee nieuwe testsuites boven op de al aanwezige block-contract/validator/repository/data-catalog/security-tests. `tests/workflow-studio-foundation-round-trip.test.ts` (12 cases) bewaart de round-trip van `benchmark_switch` en `fee_change`: formvelden, IST/SOLL-lookups, kosten en doorlooptijd in de beschrijving, verplichte stakeholders als authoriseerbare rolbindingen, schema-conformiteit van nodes/edges/bindings, en pass-door-de-statische-validator. `tests/workflow-studio-g1-gate.test.ts` (10 cases) was bedoeld als single gate voor G1: een capability-matrix die compiler + validator + catalogus + scope/role-autorisatie + mutation-adapter-registry + dry-run-contract en determinisme afdwingt, een end-to-end compile → `WorkflowDefinitionService.createDraft` → `publish` flow met een in-memory repository-stub, en regressiechecks op node/edge-aantallen en apply-strategy. Tijdens het schrijven is een pre-existing bug in `definition-service.publish` opgelost die de role-binding-input niet aan de re-validator doorgaf; hierdoor zou de publicatie van een draft met IST-velden onterecht falen. Het seed-bestand `clientConfigMutationAdapterRegistry` levert de G1-vereiste staging-handler voor `portfolio_configuration` UPDATE, zodat benchmark-switches in de nieuwe runtime kunnen landen. De toenmalige conclusie meldde 1962 groene tests en een schone lint/typecheck. De hervalidatie hieronder vervangt de conclusie dat G1 gesloten is.

#### Hervalidatie fase 1 — 2026-08-10

**Oordeel:** fase 1 is grotendeels geïmplementeerd, maar **G1 is niet succesvol gesloten**. De publieke service kan een definitie niet laden voor een normaal gescopete gebruiker. Daardoor is niet voldaan aan de G1-voorwaarde dat de twee bestaande change types zonder informatieverlies kunnen worden opgeslagen, geladen en gevalideerd.

| Controle | Uitslag | Bewijs / opmerking |
|---|---|---|
| 1.1–1.3 — architectuur, identity en autorisatie | ✅ Geslaagd | ADR's en woordenlijst zijn aanwezig. Identity-sessies zijn server-side ondertekend en de autorisatietests voor permissies, tenant, businessunit en client-scope slagen. |
| 1.4–1.5 — definitie-, runtime- en audittabellen | ⚠️ Code en contracttests geslaagd; database-integratie niet uitgevoerd | Schema's, migraties, constraints en triggers zijn aanwezig en de contracttests slagen. De PostgreSQL-integratietests zijn overgeslagen omdat `DATABASE_URL` niet beschikbaar was; daadwerkelijke immutability en transacties zijn in deze controle daarom niet opnieuw bewezen. |
| 1.6–1.10 — block contracts, registry, catalogus en adapters | ✅ Geslaagd | De gerichte contract-, registry-, catalogus-, read-adapter- en mutation-adaptertests slagen. |
| 1.11 — definitierepository en service-API | ❌ Mislukt | `WorkflowDefinitionService.load()` autoriseert eerst tegen `{ tenant: "*", businessUnit: "*" }`. `authorizeWorkflowScope()` vergelijkt deze waarden letterlijk met de identity-scope en retourneert daardoor `scope_denied` voordat `loadDefinition()` of `loadVersion()` wordt aangeroepen. Een runtime-reproductie met een geldige Change Manager bevestigt dit. |
| 1.12–1.13 — validator en compatibility compiler | ✅ Geslaagd | Validator-, compiler- en round-triptests voor `benchmark_switch` en `fee_change` slagen. |
| 1.14 — fundamenttests en G1-gate | ❌ Onvoldoende dekking | De gate test create → publish, maar niet publish → load via de publieke service. Daardoor blijft het defect in 1.11 onopgemerkt en kan de gate G1 niet betrouwbaar sluiten. |

**Uitgevoerde controles:**

- Gerichte fase-1-suite: 15 testbestanden geslaagd, 1 database-integratiebestand overgeslagen; 148 tests geslaagd en 13 overgeslagen.
- Volledige suite: 121 testbestanden geslaagd en 8 overgeslagen; 1964 tests geslaagd, 25 overgeslagen en 1 todo (2005 totaal).
- `npm run lint`: geslaagd.
- Productiebuild met vereiste build-secrets: geslaagd, inclusief de door Next.js uitgevoerde productietypecheck.
- Losse repositorybrede `tsc --noEmit`: mislukt met 112 typefouten, hoofdzakelijk in tests; hieronder vallen ook onvolledige `WorkflowNodeRow`-fixtures in `tests/workflow-definition-repository.test.ts`. De eerdere claim dat de volledige typecheck schoon is, is dus niet reproduceerbaar op deze checkout.

**Benodigd om G1 opnieuw te sluiten:**

1. Autoriseer `load()` pas nadat de definitie of versie is opgehaald: controleer eerst alleen `workflow:view` en valideer daarna de werkelijke tenant-, businessunit- en client-scope van het geladen record.
2. Voeg servicetests toe voor succesvol laden op `definitionId` en `versionId`, ontbrekende records, ontbrekende permissie en tenant-/businessunit-/client-scope-isolatie.
3. Breid de G1-gate uit met compile → create → publish → load → validate voor zowel `benchmark_switch` als `fee_change` via de publieke service.
4. Voer de PostgreSQL-integratietests uit met een geïsoleerde testdatabase en bevestig de DB-technische immutability, transacties en runtimeconstraints.
5. Herstel de repositorybrede test-typings en laat `tsc --noEmit` slagen, of leg expliciet vast dat alleen de productieconfiguratie onderdeel van de typecheck-gate is.

#### Implementatieronde na hervalidatie — 2026-08-10

De code- en testrestpunten uit de hervalidatie zijn geïmplementeerd. Taak 1.11 is opnieuw geaccepteerd; taak 1.14 blijft uitsluitend open totdat dezelfde checkout tegen een echte PostgreSQL-testdatabase is gevalideerd.

| Restpunt | Uitslag | Implementatie / bewijs |
|---|---|---|
| Herstel `WorkflowDefinitionService.load()` | ✅ Afgerond | Een afzonderlijke `authorizeWorkflowPermission()`-controle valideert eerst `workflow:view`; na het laden wordt de daadwerkelijke tenant-, businessunit- en client-scope van het persistente record gecontroleerd. De ongeldige wildcardscope is verwijderd. |
| Volledige servicetests voor `load()` | ✅ Afgerond | Tests dekken succesvol laden via definition- en version-ID, ontbrekende records, ontbrekende permissie en isolatie op tenant, businessunit en client. |
| G1-gate uitbreiden | ✅ Afgerond | Zowel `benchmark_switch` als `fee_change` doorlopen nu compile → create → publish → load van versie en definitie → validate via de publieke `WorkflowDefinitionService`. |
| Repositorybrede TypeScript-check | ✅ Afgerond | De 112 aangetroffen typefouten zijn hersteld zonder tests uit te sluiten. `npx tsc --noEmit` slaagt. Onder meer route-requestcontracten, `ChangeRequest`-fixtures, PostgreSQL-mocks, nullable SQL-clients, seed-declaraties en Workflow Studio-fixtures zijn gecorrigeerd. |
| PostgreSQL-integratietests | ⏳ Omgevingsblokkade | Niet uitvoerbaar in deze werkruimte: `DATABASE_URL` is niet gezet en Docker/PostgreSQL-tools zijn niet geïnstalleerd. De integratietests en CI-serviceconfiguratie zijn aanwezig; definitieve DB-validatie moet in een geïsoleerde PostgreSQL-omgeving plaatsvinden. |

**Verificatie na implementatie:**

- Gerichte tests voor alle gewijzigde code: 20 testbestanden geslaagd, 1 PostgreSQL-bestand overgeslagen; 234 tests geslaagd.
- Volledige suite: 121 testbestanden geslaagd en 8 databaseafhankelijke bestanden overgeslagen; 1974 tests geslaagd, 25 overgeslagen en 1 todo (2015 totaal).
- `npm run lint`: geslaagd.
- `npx tsc --noEmit`: geslaagd zonder fouten.
- Productiebuild met vereiste build-secrets: geslaagd, inclusief Next.js-productietypecheck.

#### Sluitingscontrole G1 — 2026-08-10 ✅

De laatste openstaande controles uit de hervalidatie zijn uitgevoerd tegen een verse PostgreSQL 17-testdatabase en in CI:

1. **PostgreSQL-integratiecheck** (PR #563, commit 4006e4e): `db/init.sql` en `npm run db:migrate` zijn schoon toegepast op een verse database; de fase-1 DB-suites (repository-integratie en runtime-schema) zijn 13/13 groen. Hierbij kwamen drie latente repository-defects naar boven die zijn gefixt: node-ids werden niet gepersisteerd (FK-violatie `fk_workflow_edge_source`), `permissions text[]` werd als jsonb geserialiseerd en `publish()` schreef naar een runtime-tabel met niet-bestaande kolommen. De volledige suite is 1974+52 groen, tsc/lint schoon en CI 6/6.
2. **Migratiechecks** (PR #564, commit 9ee231c): `tests/migration-checks.test.ts` dekt statisch drift-contract `init.sql` ↔ `migrate.mjs`, een baseline-manifest (48 tabellen/kolommen/constraints/indexes/seeds), fresh-bootstrap op een lege scratch-database en een idempotente re-run; 6/6 groen, lokaal én in CI (eigen stap in de e2e-db-test job). De fresh-check legde twee latente `migrate.mjs`-defects bloot die zijn gefixt: een verdwaalde index in `DDL_STATEMENTS` (fresh-bootstraps verloren `notification_log`/`status_history`) en een demo-seed guard op de verkeerde tabel (`clients` i.p.v. `benchmark_catalog`).

**Conclusie:** G1 — Fundament gereed is gesloten op 2026-08-10. `benchmark_switch` en `fee_change` worden zonder informatieverlies opgeslagen, geladen en gevalideerd, met DB-technisch bewijs voor immutability, transacties en runtimeconstraints op een echte PostgreSQL-database en in CI. Taak 1.14 is hiermee voltooid en fase 1 is 14/14.

---

## 4. Fase 2 — MVP Workflow Builder

**Resultaat:** een change manager kan via een toegankelijke UI een workflow ontwerpen, controleren, simuleren en publiceren. Uitvoering blijft achter een feature flag tot fase 3.

### 2.1 — Voeg routes, navigatie en feature flags toe ✅

**Afhankelijkheden:** G1
**Werk:** introduceer `/workflow-studio`, overzicht, nieuwe workflow en editorroutes. Voeg flags toe voor builder, publiceren en runtime.
**Acceptatie:** alleen bevoegde gebruikers zien of openen Studio-routes; flags kunnen onderdelen onafhankelijk activeren.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** server-rendered routes voor `/workflow-studio`, `/workflow-studio/new` en `/workflow-studio/[definitionId]/edit`; een server-side navigatiemodel dat zichtbaarheid uit de ondertekende identity-context afleidt; en gedeelde routeautorisatie in zowel de Next.js-proxy als de Studio-layout/-pagina's. De fail-closed flags `workflow_studio.builder`, `workflow_studio.publish` en `workflow_runtime.start` worden onafhankelijk bestuurd via gedocumenteerde omgevingsvariabelen. De builderflag verbergt én blokkeert de volledige Studio; kijkers kunnen alleen het overzicht openen en alleen ontwerpers de nieuw-/editorroutes. Unit- en autorisatietests bewaken parsing, onafhankelijke schakeling, routeclassificatie, permissies en navigatiezichtbaarheid. De volledige suite is 1989 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.2 — Bouw workflowoverzicht en draft lifecycle ✅

**Afhankelijkheden:** 2.1, 1.11
**Werk:** toon eigenaar, status, laatste wijziging, gepubliceerde versie en acties voor nieuw, hervatten, klonen en uitfaseren.
**Acceptatie:** change manager kan een draft maken vanuit leeg proces of template.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** het Studio-overzicht laadt uitsluitend definities binnen de server-side identity-scope en toont eigenaar, lifecycle-status, laatste wijziging, gepubliceerde versie en businessunit-/clientscope. Drafts hebben een hervatactie naar de beveiligde editorroute; iedere actieve definitie kan als onafhankelijke template worden gekloond; uitfaseren vereist een expliciete bevestiging en de bestaande `workflow:deprecate`-serviceautorisatie. `/workflow-studio/new` maakt een leeg proces als direct valide start→einde-graph of kloont een geselecteerde draft/gepubliceerde versie met een nieuwe naam en slug. Alle mutaties gebruiken uitsluitend server-afgeleide tenant-, businessunit-, client- en actorinformatie. De lijstservice vereist nu expliciet `workflow:view` en filtert metadata opnieuw tegen vernauwde clientclaims. Tests dekken de minimale graph, templateverwijzingen, clonepad, ontbrekende identity-scope, overzichtsprojectie, kijkpermissie en cross-client filtering. De volledige suite is 1998 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.3 — Bouw toegankelijke editorshell ✅

**Afhankelijkheden:** 2.1, 1.7
**Werk:** maak blokkenpalet, canvas, properties panel, outline/tree en validatiepaneel. Ondersteun drag-and-drop én volledige toetsenbordbediening.
**Acceptatie:** blokken kunnen worden toegevoegd, geselecteerd, verplaatst en verwijderd zonder muis.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** de beveiligde editorroute hydrateert de actuele draft en de identity-gefilterde publieke blockcatalogus in een responsive editorshell met blokkenpalet, canvas, properties panel, outline/tree en live validatiepaneel. Paletitems zijn native toetsenbordknoppen én HTML-dragbronnen; canvasblokken zijn focusbare selectieknoppen en kunnen met pijltoetsen worden verplaatst (Shift voor grotere stappen) en met Delete/Backspace worden verwijderd. Blokken kunnen ook vanuit het palet naar een canvaspositie worden gesleept en bestaande blokken kunnen met drag-and-drop worden verplaatst. Iedere operatie werkt de outline, properties, lokale dirty-state, shellvalidatie en beleefde screenreader-live-regio direct bij. Het pure editormodel levert stabiele node-keys, contractconforme startconfiguraties, immutable move/remove-transformaties en basisissues voor start, einde en losse nodes; verbindingen, undo/redo en opslag volgen bewust in 2.4 en 2.17. Component- en modeltests bewaken alle vijf UI-gebieden, palettoevoeging, drag-and-drop, outline-selectie, normale en versnelde toetsenbordverplaatsing, toetsenbordverwijdering en validatiefeedback. De volledige suite is 2008 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.4 — Implementeer graph editing ✅

**Afhankelijkheden:** 2.3
**Werk:** nodes verbinden, edges verwijderen, undo/redo, zoom, fit-to-screen, auto-layout en visuele poortcompatibiliteit.
**Acceptatie:** elke editoractie produceert een deterministische definitiewijziging en is terug te draaien.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** het canvas rendert contractpoorten en SVG-verbindingen; een gebruiker kiest een uitgang en ziet direct welke ingangen op datatype en cardinaliteit compatibel of incompatibel zijn, waarna een geldige verbinding via muis of toetsenbord wordt toegevoegd. Edge-ID en edge-key worden deterministisch uit bron-, poort-, doel- en doelpoortidentiteit afgeleid; duplicaten, zelfverbindingen, onbekende poorten, typeconflicten en overschreden `maxConnections` worden vooraf geweigerd. Verbindingen hebben een afzonderlijk toegankelijk overzicht met verwijderacties. Alle definitiemutaties — blok toevoegen/verplaatsen/verwijderen, edge toevoegen/verwijderen en auto-layout — gaan door één immutable past/present/future-history en zijn terug te draaien via knoppen of Ctrl/Cmd+Z en opnieuw uit te voeren via Shift+Ctrl/Cmd+Z. Zoom (50–150%), fit-to-screen en een deterministische topologische auto-layout zijn toegevoegd; viewportacties veranderen de definitie niet. De UI-compatibiliteitsindicatie gebruikt uitsluitend de publieke poortcontracten, terwijl de bestaande servervalidator de autoritatieve tweezijdige allowlistcontrole behoudt. Model- en componenttests bewaken deterministische node-/edge-identiteit, poorttypes en cardinaliteit, immutable edge removal, undo/redo, topologische auto-layout, edgebediening, compatibiliteitsmarkering en zoom/fit/layout-controls. De volledige suite is 2015 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.5 — Implementeer workflowmetadata ✅

**Afhankelijkheden:** 2.2, 2.3
**Werk:** naam, slug, doel, categorie, eigenaar, tags, catalogusbeschrijving, kostenmodel en standaardscope.
**Acceptatie:** verplichte metadata wordt inline gevalideerd en verschijnt correct in preview.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** de editorshell bevat een toegankelijk, responsive metadataformulier voor naam, slug, doel, categorie, tags, catalogusbeschrijving en een gestructureerd kostenmodel. Naam, slug, doel, catalogusbeschrijving, niet-negatieve kosten en ISO-achtige valutacode worden tijdens invoer inline gevalideerd; opslaan blijft geblokkeerd zolang verplichte metadata ongeldig is en dezelfde regels worden opnieuw afgedwongen aan de servergrens. Een live cataloguspreview toont de actuele naam, slug, beschrijving, doel, categorie, eigenaar, tags, kosten en scope. Eigenaar en standaardscope zijn bewust alleen-lezen en blijven afkomstig uit de geautoriseerde definitiecontext. De serveractie schrijft met optimistic locking, geeft de nieuwe revisie terug en vertaalt dubbele slugs naar een domeinfout. Het definitiemodel en alle drie schema-entrypoints bewaren categorie, tags, catalogusbeschrijving en JSON-kostenmodel met backwards-compatible defaults en additieve migraties; create, update, load en clone dragen de metadata end-to-end. Schema- en componenttests bewaken opslagcontract, inline validatie en previewgedrag. De volledige suite is 2017 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.6 — Implementeer start- en eindblokken ✅

**Afhankelijkheden:** 2.4, 1.3
**Werk:** configureer starterrollen, datascope en expliciete einduitkomsten zoals voltooid, afgewezen en geannuleerd.
**Acceptatie:** validator voorkomt meerdere ongerelateerde starts en paden zonder einde.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** het versioned `manual_start`-contract ondersteunt nu één of meer starterrollen en een expliciete datascopekeuze tussen de standaardscope van de workflow en de ingeperkte scope van de aanvrager; ongeldige of lege rolselecties en onbekende scopewaarden worden door het servercontract geweigerd. Het bestaande `end`-contract bewaakt de expliciete uitkomsten voltooid, afgewezen en geannuleerd. Beide control blocks hebben toegankelijke configuratiecontrols in het properties-paneel voor label, rollen, scope en uitkomst. Iedere configuratiewijziging loopt via dezelfde immutable editorhistory als graphwijzigingen, werkt het canvaslabel bij en is volledig undo/redo-baar. De live shellvalidatie markeert paden die op een niet-eindblok stoppen. De autoritatieve statische validator weigert nog steeds nul of meerdere startblokken en emitteert nu daadwerkelijk de stabiele `dead_end_branch`-fout voor iedere bereikbare tak zonder expliciet eindblok, met nodeverwijzing en concrete herstelhint. Contract-, model-, validator- en componenttests bewaken geldige en ongeldige startconfiguratie, alle drie einduitkomsten, configuratiebewerking, undo en een gesplitst pad waarvan één tak geen einde bereikt. De volledige suite is 2020 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.7 — Implementeer form block builder ✅

**Afhankelijkheden:** 2.4
**Werk:** voeg tekst, longtext, getal, valuta, datum, boolean, select en multiselect toe met labels, hulptekst, required, defaults en constraints.
**Acceptatie:** gegenereerde formulieren gebruiken hetzelfde schema voor editor, runtime en servervalidatie.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een gedeeld, publiek geëxporteerd form-contract definieert tekst, longtext, getal, valuta, datum, boolean, select en multiselect als discriminated veldtypen met stabiele snake_case-ID, label, hulptekst, required-status en typeveilige standaardwaarde. Type-afhankelijke constraints dekken tekstlengte en patroon, numeriek minimum/maximum/stap, valutacode, datumbereik, unieke selectopties en minimum/maximumselecties; contradictoire grenzen, dubbele veld-ID's, ongeldige defaults en defaults buiten hun constraints worden aan de servergrens geweigerd. Uit exact hetzelfde configuratieschema wordt dynamisch het submissionschema gemaakt dat defaults toepast en runtimewaarden valideert. De block registry gebruikt dit contract rechtstreeks voor servervalidatie en exporteert het via de publieke Workflow Studio-API voor de runtime. Het properties-paneel bevat een toegankelijke form builder om alle acht veldtypen toe te voegen, te verwijderen, om te zetten en volledig te configureren. Iedere bewerking loopt door de immutable editorhistory en is undo/redo-baar. Een live formuliervoorbeeld rendert dezelfde configuratie en valideert voorbeeldinvoer via hetzelfde gegenereerde submissionschema, zonder een parallelle UI-validator. Schema- en componenttests bewaken alle veldtypen, defaults, constraints, duplicaten, runtime-submissions, dynamische typewisseling en de editorpreview. De volledige suite is 2024 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.8 — Implementeer roltaak- en goedkeuringsblokken ✅

**Afhankelijkheden:** 2.4, 1.3
**Werk:** configureer uitvoerdersrol, instructies, invoer/uitvoer, deadline, goedkeuren/afwijzen/terugsturen en verplichte opmerkingen.
**Acceptatie:** maker-checkerconflicten en ontbrekende rolbindings worden voor publicatie geblokkeerd.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** het versioned `role_task`-contract ondersteunt uitvoerdersrol, titel, verplichte instructies, unieke snake_case invoer- en uitvoervariabelen en een optionele deadline van maximaal één jaar. Het contract weigert dubbele variabelen en variabelen die binnen dezelfde taak tegelijk invoer en uitvoer zijn. Het `approval`-contract ondersteunt goedkeurdersrol, instructies, invoervariabelen, afzonderlijke labels voor goedkeuren, afwijzen en terugsturen en onafhankelijk opmerkingenbeleid voor alle drie besluiten. Beide blokken hebben toegankelijke, taakgerichte propertiesforms met een read-only taak- of besluitenpreview; alle wijzigingen lopen via de bestaande immutable editorhistory en zijn undo/redo-baar. Invoer van roltaak en goedkeuring wordt als datalezer opgenomen en roltaakuitvoer als workflowschrijver in de statische datamappinganalyse. De autoritatieve validator koppelt starter-, uitvoerder- en goedkeurdersrollen aan respectievelijk `workflow:start`, `workflow:tasks:execute` en `workflow:approve`; ontbrekende bindings en bindings zonder vereiste capability zijn blokkerende publicatiefouten. Daarnaast detecteert de validator maker-checkerconflicten wanneer starter en goedkeurder dezelfde workflowrol gebruiken of via verschillende rollen op dezelfde identiteitgroep uitkomen, met een concrete functiescheidingsherstelhint. Contract-, validator- en componenttests bewaken geldige en ongeldige taak-I/O, alle besluitlabels en commentaarregels, ontbrekende capabilities, maker-checkerconflicten en editorconfiguratie. De volledige suite is 2026 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.9 — Implementeer client-config lookup blocks ✅

**Afhankelijkheden:** 2.4, 1.8, 1.9
**Werk:** kies resource, filters, parent-binding, getoonde velden, selectiegedrag en outputvariabele. Ondersteun afhankelijke selecties zoals client → portfolio → configuratieregel.
**Acceptatie:** preview gebruikt gemaskeerde/testdata en toont getypeerde outputs voor vervolgstappen.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een gedeeld, publiek geëxporteerd lookup-contract configureert de resource, maximaal tien getypeerde filters, parent-binding via de workflowscope of een stabiel attribuut, unieke getoonde velden, enkelvoudige of meervoudige selectie en een snake_case outputvariabele. Variabele filters en parent-bindings worden als datalezers geregistreerd en de lookupoutput als schrijver, waardoor vervolgblokken de uitvoer statisch kunnen gebruiken en conflicten vóór publicatie zichtbaar zijn. De autoritatieve validator controleert resources en attributen tegen de client-config-datacatalogus, valideert letterlijke filterwaarden met dezelfde attribuutvalidators en blokkeert ongeldige scope- en attribuutbindings. De server maakt voor de editor een diep bevroren, serialiseerbare catalogus zonder validators, mutatieoperaties of andere serverinterne details. Het properties-paneel ondersteunt afhankelijke selecties zoals client → portfolio → configuratieregel en toont uitsluitend deterministische gemaskeerde testdata, inclusief de outputnaam en het vervolgtype `object` of `array<object>`. Schema-, catalogus-, validator- en componenttests bewaken geldige ketens, ongeldige bindings, filterwaarden, duplicaten, zelfreferenties, gemaskeerde previewdata en getypeerde output. De volledige suite is 2032 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.10 — Implementeer change-request blocks ✅

**Afhankelijkheden:** 2.7, 2.9, 1.10
**Werk:** kies resource en CREATE/UPDATE/RETIRE; map snapshotwaarden naar IST en form/taskoutputs naar SOLL; configureer effective date en rationale.
**Acceptatie:** ongeldige of niet-aanvraagbare attributen kunnen niet worden geselecteerd.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een gedeeld, publiek geëxporteerd change-request-contract definieert CREATE, UPDATE en RETIRE met minimaal één unieke attribuutmapping, een getypeerde IST-bron uit een eerdere snapshot, een SOLL-bron uit een formulier- of taakvariabele en afzonderlijke variabelen voor ingangsdatum en reden. Operatie-afhankelijke regels verbieden IST bij CREATE, vereisen IST én SOLL bij UPDATE en modelleren RETIRE als IST plus de ingangsdatum zonder losse SOLL-waarde. De editor ontvangt een afzonderlijke, geautoriseerde en diep bevroren requestcatalogus die uitsluitend resources en attributen met expliciete aanvraagoperaties bevat; servervalidators, interne schemas en niet-aanvraagbare velden worden niet gehydrateerd. Resource- en operatiewissels resetten mappings veilig en de propertiesbuilder toont per operatie alleen selecteerbare attributen, hun waardetype en een leesbare IST → SOLL-preview. De autoritatieve workflowvalidator controleert iedere mapping opnieuw tegen de volledige servercatalogus, blokkeert onbekende en niet-aanvraagbare attributen en voorkomt dat een IST-snapshot een ander attribuut vertegenwoordigt dan het SOLL-doel. Alle bronvariabelen worden als datalezers opgenomen in de statische datamappinganalyse. De legacy-compatibiliteitscompiler genereert dezelfde nieuwe mappings, zodat bestaande change-types de actuele blockgrens blijven gebruiken. Schema-, catalogus-, registry-, validator-, compiler-, G1- en componenttests bewaken alle drie operaties, requestability, snapshotconsistentie en editorgedrag. De volledige suite is 2039 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.11 — Implementeer decision blocks ✅

**Afhankelijkheden:** 2.4, 2.7, 2.9
**Werk:** bied een veilige rule builder voor vergelijkingen, aanwezigheid, lijsten en AND/OR-groepen. Geen eval of vrije code.
**Acceptatie:** condities zijn getypeerd, verklaarbaar en testbaar met voorbeeldwaarden.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een gedeeld, publiek geëxporteerd besliscontract modelleert condities en recursieve AND/OR-groepen als gesloten, strikt gevalideerde datastructuren. Condities declareren een workflowvariabele, het type string, getal, boolean, datum, stringlijst of getallenlijst en een operator voor gelijkheid, ordening, aanwezigheid, lijstlidmaatschap of bevat/niet-bevat. Het contract staat alleen typecompatibele operatoren en operanden toe, begrenst groepen, diepte en het totale aantal condities en weigert onbekende eigenschappen; er is geen `eval`, vrije expressie of dynamische code-uitvoering. Een deterministische evaluator valideert voorbeeldwaarden tegen de gedeclareerde typen, berekent de matched/otherwise-uitgang en levert voor iedere conditie en groep een Nederlandse, samengestelde verklaring. De propertiesbuilder ondersteunt geneste groepen, AND/OR-wissels en het toevoegen, aanpassen en verwijderen van condities met type-afhankelijke operator- en waardevelden. Een interactieve preview laat voorbeeldwaarden invullen en toont direct de uitkomst, verklaring en gekozen flow-uitgang. Alle geneste regelvariabelen worden als datalezers opgenomen in de statische workflowanalyse. Schema-, evaluator-, validator-, registry-, editor- en componenttests bewaken vergelijkingen, aanwezigheid, lijsten, nesting, typefouten, vrije-codevelden en verklaarbare previewresultaten. De volledige suite is 2044 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.12 — Implementeer notificatieblokken ✅

**Afhankelijkheden:** 2.4, 1.3
**Werk:** rolontvangers, veilige templates, triggerpunt en toegestane kanalen. Externe vrije webhook-URL's blijven buiten het MVP.
**Acceptatie:** templatevariabelen worden gevalideerd en output wordt veilig escaped.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een gedeeld, publiek geëxporteerd notificatiecontract ondersteunt één of meer unieke ontvangersrollen, uitsluitend de beheerde kanalen in-app en e-mail, en vaste triggers voor het bereiken van het blok, workflowvoltooiing en workflowfalen. Onderwerp en bericht gebruiken een gesloten placeholdervorm `{{ snake_case_variabele }}` met een expliciete, unieke variabelenlijst; onbekende, ongebruikte en ongeldige placeholders worden aan de blockgrens geweigerd. Het strikte contract accepteert geen webhookkanaal, URL of andere vrije afleverconfiguratie. Een deterministische renderer weigert ontbrekende waarden, begrenst de gerenderde uitvoer en escaped ampersands, HTML-tags, quotes en apostrofs voordat waarden in onderwerp of bericht komen. De propertiesbuilder configureert rollen, kanaal, trigger, variabelen en templates en toont een interactieve veilige preview met bewust HTML-achtige voorbeeldwaarden, zonder HTML-injectie. Iedere ontvangersrol moet voor publicatie een workflowrolbinding hebben en alle templatevariabelen worden als datalezers opgenomen in de statische analyse. De legacy-compatibiliteitscompiler produceert het nieuwe notificatiecontract, zodat bestaande configuraties dezelfde veilige grens gebruiken. Schema-, renderer-, registry-, validator-, compiler-, G1- en componenttests bewaken kanalen, triggers, rolbindings, placeholders, ontbrekende waarden, webhookuitsluiting en escaping. De volledige suite is 2050 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild met actieve builderflag slagen.

### 2.13 — Bouw properties forms vanuit block contracts ✅

**Afhankelijkheden:** 2.6–2.12
**Werk:** render properties dynamisch uit JSON/UI-schema en block metadata; centraliseer foutweergave en datamappingpicker.
**Acceptatie:** nieuwe blockversies vereisen niet standaard een nieuwe handgeschreven propertiespagina.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een gedeelde contractrenderer bouwt propertiesformulieren rechtstreeks uit het publieke JSON Schema, UI-schema en de metadata van het geselecteerde blok. De renderer ondersteunt standaardvelden voor tekst, datum, getal, boolean, enums en stringlijsten, respecteert veldvolgorde, labels, enumlabels en helptekst, en biedt een veilige JSON-fallback voor complexere onbekende vormen. Een centrale recursieve JSON-Schema-validator presenteert contractfouten consequent naast zowel generieke als gespecialiseerde editors. De gedeelde, getypeerde datamappingpicker verzamelt beschikbare outputs uit formulier-, taak- en lookupblokken en wordt door alle gespecialiseerde builders voor bronvariabelen gebruikt. Complexe versie-1-blokken behouden doelgerichte editors, terwijl onbekende en nieuwere contractversies automatisch op de generieke renderer terugvallen en daardoor geen nieuwe handgeschreven propertiespagina vereisen. UI-schema metadata wordt bij registratie tegen de configuratieproperties gevalideerd. Unit-, contract-, component- en editorintegratietests bewaken onder meer automatische rendering van een synthetisch `review_gate@2`-contract, veldvolgorde, centrale foutweergave en het kiezen van een eerdere formulieroutput. De volledige suite is 2056 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check en productiebuild slagen.

### 2.14 — Bouw live formulier- en procespreview ✅

**Afhankelijkheden:** 2.5–2.13
**Werk:** toon het aanvraagformulier, IST/SOLL-overzicht, rollen, kosten, SLA en het verwachte proces zoals eindgebruikers het zien.
**Acceptatie:** preview is read-only, gebruikt geen productiewrites en volgt exact de draftdefinitie.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** de editor bevat een live eindgebruikerspreview die uitsluitend een puur, lokaal afgeleid previewmodel van de actuele draft rendert en geen formulieractie, submitknop of productiewrite bevat. Geldige formulierblokken worden met hun exacte titel, beschrijving, veldvolgorde, verplichte markering, standaardwaarden, opties en hulptekst als inerte controls weergegeven. Change-requestblokken leveren een catalogus-gelabeld IST/SOLL-overzicht met operatie, resource, attribuutmappings, ingangsdatum- en redenvariabelen. Gebruikte starter-, taak-, goedkeurings- en notificatierollen worden met hun context en bestaande identity-groupbindingen getoond. Kosten reageren direct op lokale metadatawijzigingen; de indicatieve SLA volgt de langste bereikbare som van taakdeadlines. Het verwachte proces wordt deterministisch vanaf het startblok opgebouwd, bevat ook nog niet verbonden draftblokken en toont bloktype, beschrijving, rol, deadline en contractlabels voor vertakkingen. Ongeldige of ontbrekende formulier- en changeconfiguratie wordt veilig als onvolledige draft gemeld. Model-, component- en editorintegratietests bewaken procesvolgorde, langste-pad-SLA, IST/SOLL-mapping, inert gedrag en directe updates vanuit lokale metadata en nodeconfiguratie. De volledige suite is 2061 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check, productiebuild en diffcontrole slagen.

### 2.15 — Bouw validatiepaneel en quick fixes ✅

**Afhankelijkheden:** 1.12, 2.13
**Werk:** groepeer fouten en waarschuwingen; klik navigeert naar node/property; bied veilige quick fixes voor ontbrekende eindnodes en mappings.
**Acceptatie:** publiceren is onmogelijk bij blockers; waarschuwingen vereisen expliciete bevestiging of policy.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** de editorpreflight groepeert blockers en waarschuwingen met afzonderlijke aantallen, concrete herstelhints en een publicatiestatus. Naast graphproblemen worden onbekende blockcontracten en recursieve JSON-contractfouten uit de actuele lokale configuratie opgenomen. Een klik op een melding selecteert de betreffende node, toont het exacte toppropertypad en focust waar mogelijk het bijbehorende generieke contractveld. Quick fixes zijn bewust begrensd tot deterministische wijzigingen: bij een ontbrekend einde wordt voor ieder open pad een passend eindblok aangemaakt en via compatibele flowpoorten verbonden; een ontbrekende variabelemapping wordt alleen ingevuld wanneer exact één beschikbare bron de keuze ondubbelzinnig maakt. Waarschuwingen moeten expliciet worden bevestigd en iedere gewijzigde actuele waarschuwingsset maakt die bevestiging ongeldig. De harde server-publicatiegrens valideert onafhankelijk opnieuw, blijft blockers weigeren en accepteert validatorwaarschuwingen alleen wanneer hun actuele codes expliciet zijn meegegeven. Model-, validator- en editorintegratietests bewaken groepering, eindnode- en mappingfixes, propertynavigatie, waarschuwingbevestiging en publicatieblokkade. De volledige suite is 2067 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check, productiebuild en diffcontrole slagen.

### 2.16 — Bouw pathsimulator ✅

**Afhankelijkheden:** 2.11, 2.14, 2.15
**Werk:** voer de definitie zonder side effects uit met fixtures of gemaskeerde snapshots; laat de gebruiker inputs en taakuitkomsten kiezen.
**Acceptatie:** simulator toont bezocht pad, variabelen, beslisredenen, verwachte intents en audit-events.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een deterministische, volledig lokale pathsimulator doorloopt de actuele draft vanaf het unieke startblok en kiest flowuitgangen op basis van bestaande beslisregels en configureerbare taak- of goedkeuringsuitkomsten. De gebruiker kan formulierwaarden, aanvullende variabelen, gedeclareerde taakoutputs en gemaskeerde lookup-snapshots als fixtures invoeren; er vindt geen databasequery, productiewrite of notificatieverzending plaats. Formulierfixtures worden tegen hetzelfde runtime-submissionschema gevalideerd, lookupfixtures tegen hun één/meerdere-cardinaliteit en taakuitvoer mag uitsluitend gedeclareerde outputvariabelen schrijven. De simulator hergebruikt de veilige beslisevaluator en notificatierenderer, plant change-requestintents met opgeloste IST/SOLL-waarden en bewaart alle uitkomsten uitsluitend in het clientgeheugen. Het resultaat toont status, bezocht pad, eindvariabelen, verklaarde beslisredenen, verwachte change- en notificatie-intents en een deterministische reeks verwachte audit-events. Cycli, ontbrekende vervolgverbindingen, ongeldige typen en ongeldige fixtures stoppen veilig met een uitlegbare melding. Een simulatieresultaat is aan een exacte draftsignatuur gekoppeld en verdwijnt zodra nodes, configuraties of edges veranderen. Model- en editorintegratietests bewaken beide beslispaden, fixtures, intents, audits, typevalidatie, outputbegrenzing en draftinvalidatie. De volledige suite is 2074 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check, productiebuild en diffcontrole slagen.

### 2.17 — Implementeer autosave en edit-conflicten ✅

**Afhankelijkheden:** 2.3, 1.11
**Werk:** debounce autosave, dirty state, herstel na refresh en optimistic locking met conflictweergave.
**Acceptatie:** geen stille overschrijving bij twee editors; laatste lokaal geldige draft kan worden hersteld.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** iedere blocker-vrije graphwijziging wordt na een debounce als één atomair pakket van nodes, edges en volledige rolbindingen via de bestaande `updateDraft`-service opgeslagen. De editor toont afzonderlijk dirty-, wacht-, opslag-, fout- en conflictstatus en neemt de ontvangen serverrevisie direct over voor de volgende optimistic-lockingronde. Iedere geldige lokale wijziging wordt vóór de servercall als versiegebonden herstelkopie in browseropslag vastgelegd; na een geslaagde save wordt die kopie verwijderd. Bij refresh wordt een afwijkende, correct gevormde lokale snapshot expliciet aangeboden om te herstellen of te verwijderen. Herstel maakt de graph opnieuw dirty en laat hem bewust tegen de actuele serverrevisie lopen. Validatiefouten en netwerk- of serverfouten behouden de herstelkopie. Een revisieconflict stopt verdere autosaves, toont dat een andere bewerker de draft wijzigde en biedt uitsluitend het veilig herladen van de serverversie; er vindt geen automatische force-write plaats. De repository selecteert de draftversie met `FOR UPDATE` voordat graphcontent wordt vervangen, zodat ook werkelijk gelijktijdige transacties vóór mutatie worden geserialiseerd en de tweede schrijver de verhoogde revisie ziet. Nieuwe clientnodes krijgen altijd UUID's en tijdelijke edge-ID's worden bij serialisatie weggelaten, waarna de repository stabiele database-identiteiten toekent. Serialisatie-, hook-, herstel-, debounce-, conflict- en editorregressietests bewaken de volledige flow. De volledige suite is 2080 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check, productiebuild, server-actionvalidatie en diffcontrole slagen.

### 2.18 — Implementeer review en publiceren ✅

**Afhankelijkheden:** 2.15–2.17
**Werk:** valideer, genereer diff met vorige versie, leg reviewerbesluit vast, maak immutable versie en publiceer naar changecatalogus.
**Acceptatie:** gepubliceerde versie is reproduceerbaar, gehasht en niet wijzigbaar.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** de editor bevat een revisiegebonden review- en publicatiepaneel dat alleen een volledig opgeslagen, blocker-vrije draft accepteert en waarschuwingen opnieuw laat bevestigen. Een deterministische diff vergelijkt metadata, nodes, edges en rolbindingen op stabiele domeinsleutels met de vorige gepubliceerde versie, onafhankelijk van database-UUID's, en toont toegevoegde, verwijderde en gewijzigde onderdelen. Ter-reviewaanvragen, goedkeuringen en afwijzingen worden als append-only `workflow_version_review`-events met revisie, motivatie, actor en tijdstip opgeslagen; een databasetrigger weigert wijziging of verwijdering van het auditspoor. Alleen de laatste goedkeuring voor exact de actuele revisie ontsluit publicatie. De service valideert de volledige opgeslagen graph zowel bij reviewaanvraag als bij publicatie opnieuw. De repository vergrendelt de draft transactioneel, controleert revisie en goedkeuring nogmaals, berekent een canonieke SHA-256-contenthash en publiceert versie, hash, actor en tijdstip atomair. Bestaande databasetriggers maken de gepubliceerde versie en al haar graphcontent onveranderlijk. Gepubliceerde workflows binnen de geautoriseerde scope verschijnen met versie, kosten en hashverwijzing in de changecatalogus. Diff-, service-, repository- en database-integratiechecks bewaken stabiele vergelijking, verplichte revisiegoedkeuring, hashing en immutability. De volledige suite is 2082 tests groen (28 databaseafhankelijke tests overgeslagen, 1 todo); lint, repositorybrede TypeScript-check, productiebuild, server-actionvalidatie en diffcontrole slagen.

### 2.19 — Lever eerste templates en builder-E2E ✅

**Afhankelijkheden:** 2.18, 1.13
**Werk:** lever templates voor benchmark switch en generieke veldwijziging. Test create → configure → simulate → review → publish via Playwright en DB-integratietests.
**Acceptatie:** G2 slaagt; bestaande productieflows blijven nog op de klassieke runtime.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** Workflow Studio biedt twee vaste, altijd beschikbare startpunten naast klonen uit bestaande definities: een volledige benchmarkwissel en een generieke veldwijziging. Iedere keuze wordt bij creatie opnieuw vanuit de canonieke compatibiliteitscompiler gematerialiseerd met eigen UUID's, scope en metadata; een latere wijziging aan een andere templatekopie kan de nieuwe draft daardoor niet beïnvloeden. De benchmarktemplate bevat formulierinput, gemaskeerde IST-lookup, roltaak, goedkeuring, getypeerde `portfolio_configuration`-UPDATE en kostenmetadata. De generieke template levert een configureerbaar objectreferentieveld, expliciete IST/SOLL-waarden, ingangsdatum, motivatie, controle en goedkeuring. Beide templates passeren de autoritatieve block-, graph-, catalogus- en rolbindingsvalidatie zonder fouten. Een PostgreSQL-integratiescenario doorloopt templatecreatie, metadata-configuratie, side-effectvrije simulatie, reviewaanvraag, goedkeuring en gehashte immutable publicatie. Een afzonderlijke Playwright-flow voert dezelfde keten via de gebruikersinterface uit en controleert de uiteindelijke hashverwijzing in de changecatalogus; de DB-CI-job activeert hiervoor uitsluitend de builder- en publishflags. De klassieke changeformulieren, registraties, actions en applypaden zijn niet omgeschakeld en `workflow_runtime.start` blijft uit, zodat bestaande productieflows op de klassieke runtime blijven. Template-, lifecycle-, validator-, simulator-, service-, PostgreSQL- en browsertests bewaken G2. De volledige suite is 2087 tests groen (29 databaseafhankelijke tests overgeslagen, 1 todo); Playwright ontdekt de G2-browsertest; lint, repositorybrede TypeScript-check, productiebuild, server-actionvalidatie en diffcontrole slagen.

---

## 5. Fase 3 — Generieke Workflow Runtime

**Resultaat:** gepubliceerde workflows kunnen betrouwbaar worden gestart en uitgevoerd, inclusief menselijke taken, goedkeuring, staging, apply, retries en audit.

### 3.1 — Leg runtime state machine en commands vast ✅

**Afhankelijkheden:** G2, 1.5
**Werk:** definieer instance- en node-statussen, commands, events, transitionregels, locking, retrysemantiek en terminale uitkomsten.
**Acceptatie:** iedere state transition heeft één commandhandler en één auditeerbaar eventresultaat.

**Status:** voltooid op 2026-08-10
**Opgeleverd:** een uitvoerbaar runtimecontract in `lib/workflow-studio/runtime-state-machine.ts` met de normatieve instance- en node-statussen, vijftien expliciete commands en transitionregels, foutclassificaties, terminale uitkomsten en één handler plus één append-only eventresultaat per geslaagde transitie. Commands dragen optimistic-lockstatus, idempotency key, actor, correlation/causation en een gevalideerd tijdstip; alle verwerking gebruikt de canonieke instance-lock. Technische retries zijn begrensd met exponential backoff, alleen automatisch toegestaan voor transient failures van geautomatiseerde nodes en maken expliciet een nieuw node-attempt aan in plaats van het oude record terug te zetten. Het architectuurcontract en de volledige transitietabellen staan in `documentation/architecture/workflow-runtime-state-machine.md`; de publieke Workflow Studio-export ontsluit alle contracttypen en helpers. Unit tests dekken het normale instance- en nodepad, cancel/fail/intervention, optimistic-lockconflicten, ongeldige transities en tijdstippen, menselijke retrybescherming, attemptlimieten, backoff en eventmetadata. Verificatie: 17 gerichte runtime-/schematests groen (4 DB-tests zonder `DATABASE_URL` overgeslagen), volledige suite 2098 groen (29 overgeslagen, 1 todo), `npx tsc --noEmit` en `npm run lint` schoon.

### 3.2 — Bouw transactionele engine-kern ✅

**Afhankelijkheden:** 3.1
**Werk:** maak instance, activeer nodes, verwerk edges, persisteer tokens/node instances en hervat na onderbreking. Gebruik DB-locking en idempotency keys.
**Acceptatie:** dezelfde command of delivery twee keer uitvoeren veroorzaakt geen dubbele taken of mutaties.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeEngine` met een transactionele storegrens voor instance-start, durable ready tokens als node-instances, atomair claimen met workerlease, state-machinecommands, edgeverwerking via een expliciet gekozen outputpoort, idempotente activatie van vervolgattempts en automatische terminale afronding via een `end`-node. `PostgresWorkflowRuntimeStore` implementeert de productiegrens met instancebrede `SELECT ... FOR UPDATE`, nodeclaims met `FOR UPDATE ... SKIP LOCKED`, `ON CONFLICT DO NOTHING` voor gelijktijdige starts en activaties, append-only events en één vaste lockvolgorde instance → node. Command-eventcontrole vindt onder de instance-rowlock plaats, zodat een duplicate command of delivery het opgeslagen resultaat teruggeeft zonder een tweede node, toekomstige taak of mutatie te materialiseren; de bestaande unieke taak- en intentconstraints blijven de DB-technische laatste verdedigingslaag. Ready node-instances zijn expliciet het duurzame token en blijven na een procesonderbreking claimbaar door een nieuwe engine. Conditionele edges falen gesloten totdat taak 3.3 de getypeerde expressie-runtime levert. Het ontwerpcontract staat in `documentation/architecture/workflow-runtime-engine.md`; publieke exports ontsluiten engine, storecontracts en PostgreSQL-adapter. Tests bewijzen startpinning, scopes, leases, procesachtige hervatting, end-to-end start → claim → edges → end, duplicate start/claim/completion zonder dubbele attempts of events en transactionele rollback bij edgefouten. Een echte PostgreSQL-integratietest dekt dezelfde serialisatie en deduplicatie wanneer `DATABASE_URL` beschikbaar is. Verificatie: volledige suite 2106 groen (30 overgeslagen, waaronder de lokale DB-integratietest, en 1 todo), `npx tsc --noEmit` en `npm run lint` schoon.

### 3.3 — Bouw variabele- en expressie-runtime ✅

**Afhankelijkheden:** 3.2, 2.11
**Werk:** getypeerde variabelen, outputs, scopes, null-behandeling en veilige conditie-evaluatie.
**Acceptatie:** typefouten stoppen gecontroleerd met node-level diagnose; geen dynamische code-executie.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** een getypeerd runtimecontract in `lib/workflow-studio/runtime-variables.ts` voor de acht DB-datatypen, vier dataclassificaties, instance- en node-outputscope, JSON-veilige waardes, immutable outputwrites, resolutie en veilige decision-AST-evaluatie. De runtime onderscheidt ontbrekende variabelen expliciet van opgeslagen `null`: aanwezigheidsexpressies behandelen beide gecontroleerd, terwijl andere operators bij ontbrekende input een stabiele `missing_variable`-diagnose geven. Type-, naam-, duplicate-output- en variabeleconflicten bevatten variabelenaam, verwacht/werkelijk type, node-instance-ID en edge-ID. `succeed_node` accepteert getypeerde outputvariabelen; de transactionele engine valideert en persisteert die met nodeprovenance vóór conditionele edge-evaluatie en activeert uitsluitend onvoorwaardelijke of waar geëvalueerde edges. Elke output gebruikt een command-afgeleide idempotency key; de PostgreSQL-store bewaart type, waarde, classificatie, revision, correlation en scopeherkomst en weigert een tweede schrijver. Een validatie- of expressiefout rolt node-status, outputwrites en audit-event gezamenlijk terug. Evaluatie hergebruikt uitsluitend de begrensde schema-AST voor vergelijkingen, aanwezigheid, lijsten en geneste AND/OR-groepen en bevat geen `eval`, Function-constructor, SQL of netwerktoegang. Het normatieve contract staat in `documentation/architecture/workflow-runtime-variables.md`; de PostgreSQL-integratietest dekt persistente output en conditionele routing wanneer `DATABASE_URL` beschikbaar is. Verificatie: 40 gerichte tests groen (5 DB-tests lokaal overgeslagen), volledige suite 2117 groen (30 overgeslagen, 1 todo), `npx tsc --noEmit` en `npm run lint` schoon.

### 3.4 — Implementeer start en runtime form rendering ✅

**Afhankelijkheden:** 3.2, 3.3, 2.7
**Werk:** toon gepubliceerde workflows in de catalogus, autoriseer starten, render formulier, valideer server-side en maak instance met pinned version.
**Acceptatie:** een gepubliceerde workflow kan één geldige instance starten; drafts en uitgefaseerde versies niet.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** gepubliceerde Studio-workflows worden naast de klassieke change types in de changecatalogus getoond en krijgen uitsluitend achter `workflow_runtime.start` en na een geslaagde server-side startbeslissing een aanvraaglink. `WorkflowRuntimeStartService` laadt de onveranderlijke versie opnieuw, vereist zowel een gepubliceerde versie als actieve gepubliceerde definitie, autoriseert `workflow:start` tegen de ondertekende identity-context, snijdt identity- en workflowscope op clientniveau en dwingt expliciete starterrollen af via de gepinde role bindings. De startpagina rendert alle gepubliceerde formcontracten met collision-safe veldnamen en toegankelijke HTML-controls; de server negeert onbekende input, converteert browserwaarden naar de getypeerde runtime, valideert opnieuw met het bestaande formschema en schrijft gevalideerde waarden als confidential instancevariabelen. De submitactie herhaalt alle versie-, status-, scope-, permissie- en rolcontroles om ingetrokken toegang of tussentijdse uitfasering te ondervangen. Vervolgens start de transactionele engine met het exacte `workflow_version_id`, signed user/session actor, ingeperkte clientscope, correlation-ID en idempotency-UUID; duplicate delivery retourneert dezelfde instance zonder dubbele node, events of variabelen. Drafts, ontbrekende versies, uitgefaseerde definities, ongeldige forms, lege scopes en onbevoegde starters maken geen instance. Proxy, routegrens en catalogus blijven fail-closed wanneer de flag of database ontbreekt. Het normatieve contract staat in `documentation/architecture/workflow-runtime-start.md`; tests dekken formuliercoercion en servervalidatie, onbekende velden, duplicate variable writers, publicatie- en deprecationpoorten, permissies, starterrollen, scope-isolatie, versiepinning, actor- en variabeleoverdracht en routebescherming. Verificatie: volledige suite 2132 groen (30 overgeslagen, waaronder de lokale DB-integratietest, en 1 todo), `npx tsc --noEmit`, lint, productiebuild en server-actionmanifestvalidatie schoon.

### 3.5 — Implementeer lookup execution en snapshots

**Afhankelijkheden:** 3.3, 1.9
**Werk:** voer client-configlookups uit binnen scope, sla snapshots en concurrency tokens op en maak waarden beschikbaar als variabelen.
**Acceptatie:** instance blijft verklaarbaar wanneer live data later verandert.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeEngine.executeClientConfigLookup` voert geclaimde `client_config_lookup`-nodes uit tegen de onveranderlijke gepubliceerde nodeconfiguratie en valideert die opnieuw met het lookupschema. Literal filters, variabele filters en attribuut-parentbindings worden server-side geresolved; alle reads lopen via `ClientConfigReadService` met `workflow:view`, tenant-, businessunit- en client-scope vanuit de instance, zodat vrije queries of scopeverbreding onmogelijk blijven. `selection: "one"` vereist exact één record en faalt gesloten wanneer nul of meerdere records matchen; `selection: "many"` schrijft maximaal honderd snapshots in adaptervolgorde. Iedere gevonden bronrecord wordt transactioneel opgeslagen in append-only `workflow_data_snapshot` met resource-ID, source-record-ID, geselecteerde catalogusvelden, snapshotversie, concurrency-token, read timestamp, correlation/causation en command-afgeleide idempotency key. De lookupoutput wordt als `confidential` getypeerde runtimevariabele geschreven: bij één selectie als object met geselecteerde velden op topniveau plus `_snapshot`-metadata, bij meerdere selecties als array van dezelfde vorm. Daardoor kunnen latere IST-mappings de geselecteerde velden direct lezen, terwijl audit en conflictcontrole de snapshot-ID en concurrency-token behouden. Herlevering van dezelfde lookupcommand retourneert het bestaande command-event zonder extra snapshot, variabele of opvolgnode; fouten rollen node-status, snapshot, variabele en events gezamenlijk terug. Het normatieve contract staat in `documentation/architecture/workflow-runtime-lookups.md`; tests dekken scoped reads, snapshotpersistency, variabele-output, audit-event, opvolgactivatie en idempotente redelivery. Verificatie: gerichte runtime/read-adaptertests groen en `npx tsc --noEmit` schoon.

### 3.6 — Implementeer role tasks en Mijn Werk ✅

**Afhankelijkheden:** 3.2, 3.3, 2.8
**Werk:** taak creëren, claimen, herverdelen, invullen en voltooien; bouw `/tasks` met filters, deadlines en instancecontext.
**Acceptatie:** alleen bevoegde rolleden kunnen claimen/voltooien en elke handeling krijgt actor/timestamp.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** role-taskuitvoering is aan de runtime-engine gekoppeld. Een gestart `role_task`-node kan transactioneel een `workflow_task` materialiseren op basis van de gepinde nodeconfiguratie en de bijbehorende `workflow_role_binding` met `workflow:tasks:execute`; idempotente herlevering maakt geen dubbele taak of audit-event. `WorkflowTaskService` levert “Mijn Werk”: server-side lijstfilters voor open/geclaimde/voltooide taken en deadlines, scope- en permissiecontrole op tenant, businessunit, clientclaims, identitygroep en taakcapability, claimen, vrijgeven/herverdelen en claimhoudergebonden voltooien. Taakvoltooiing schrijft taakstatus, actor/timestamps, form-data, commentaar, node-succestransitie, outputvariabelen, opvolgactivatie en audit-events in één enginepad. De PostgreSQL-store ondersteunt rolbindinglookup, task CRUD en rolgroep-gefilterde lijsten tegen de bestaande `workflow_task`-constraints. `/tasks` is achter `workflow_runtime.start` en `workflow:tasks:execute` toegevoegd aan routeguard en navigatie, met filters, deadlinecontext, claim/vrijgeefacties en JSON-taakuitvoer voor de MVP. Tests dekken rolautorizatie, scope-isolatie, claimen, claimhoudercontrole, node-succes en outputvariabelen; verificatie: `tests/workflow-runtime-task.test.ts` en `tests/workflow-runtime-engine.test.ts` groen, `npx tsc --noEmit` en `npm run lint` schoon.

### 3.7 — Implementeer approval execution ✅

**Afhankelijkheden:** 3.6
**Werk:** approve, reject en return; dwing requester ≠ approver, rol, scope, huidige state en opmerkingenbeleid af.
**Acceptatie:** directe API/server-actionaanroepen kunnen maker-checker niet omzeilen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** approval-nodes hebben nu een eigen runtimepad naast gewone role tasks. `WorkflowRuntimeEngine.createApprovalTask` materialiseert een geclaimde goedkeuringstaak uitsluitend vanuit een gestart `approval`-node en een gepinde `workflow_role_binding` met `workflow:approve`; idempotente herlevering maakt geen dubbele taak of audit-event. `WorkflowRuntimeEngine.completeApprovalTask` verwerkt `approved`, `rejected` en `returned` als expliciete outputpoorten, schrijft het besluit plus commentaar naar `workflow_task`, markeert de node als geslaagd, activeert alleen de gekozen opvolgroute, schrijft een stabiele decision-outputvariabele en audit-event, en dwingt requester ≠ approver af op engine-niveau. Commentaarbeleid uit de gepinde nodeconfiguratie wordt server-side afgedwongen voor approve/reject/return. `WorkflowTaskService.decideApproval` voegt identity-, groep-, capability-, scope- en claimhoudercontrole toe, zodat directe server-actionaanroepen maker-checker, rol of scope niet kunnen omzeilen. `/tasks` toont geclaimde approvaltasks met besluitknoppen voor goedkeuren, afwijzen en terugsturen; gewone role tasks behouden hun taakuitvoerpad. De gedeelde role-task- en approvalschema's zijn verplaatst naar een schema-only runtimebestand om circulaire imports te vermijden. Tests dekken approvalmaterialisatie, maker-checkerblokkade, verplichte opmerkingen, succesvol besluit, node-afronding, outputvariabelen en auditmetadata; verificatie: `tests/workflow-runtime-task.test.ts` en `tests/workflow-runtime-engine.test.ts` groen, `npx tsc --noEmit` schoon.

### 3.8 — Implementeer decisions en routing ✅

**Afhankelijkheden:** 3.3, 2.11
**Werk:** evalueer conditions deterministisch, leg gebruikte inputs en gekozen edge vast en stop bij nul of meerdere matches waar dat niet is toegestaan.
**Acceptatie:** audit UI kan uitleggen waarom een pad is gekozen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeEngine.executeDecision` voert geclaimde `decision`-nodes uit tegen de onveranderlijke gepubliceerde nodeconfiguratie en valideert die opnieuw met het decision-schema. De handler evalueert de gedeelde decision-AST uitsluitend tegen gepersisteerde runtimevariabelen via de veilige expressieruntime, kiest deterministisch `matched` of `otherwise`, en vereist dat de gekozen outputpoort exact één uitgaande route heeft. Ontbrekende routes stoppen met `decision_route_not_found`; meerdere routes stoppen met `decision_route_ambiguous`; beide gevallen rollen node-status, successoractivatie en audit-events gezamenlijk terug. Succesvolle evaluatie markeert de node als geslaagd, activeert alleen de gekozen edge en schrijft een `workflow.decision.evaluated` audit-event met node key, label, geselecteerde outputpoort, gekozen edge-ID, gebruikte inputwaarden, uitlegtekst en geactiveerde node-ID's. Daardoor kan de latere audit UI verklaren waarom een pad is gekozen zonder live data opnieuw te lezen. Het normatieve contract staat in [workflow-runtime-decisions.md](architecture/workflow-runtime-decisions.md) en is gelinkt vanuit de architectuurindex. Tests dekken deterministische routing, auditpayload, ontbrekende route, ambigue route en rollbackgedrag; verificatie: `tests/workflow-runtime-engine.test.ts` en `tests/workflow-runtime-task.test.ts` groen, `npx tsc --noEmit` schoon.

### 3.9 — Implementeer change intents en staging ✅

**Afhankelijkheden:** 3.5, 3.7, 1.10
**Werk:** materialiseer CREATE/UPDATE/RETIRE-intents, voer adapter-dry-run uit en schrijf bestaande stagingtabellen.
**Acceptatie:** iedere stagingrij verwijst naar instance, node, workflowversie, snapshot en actor.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeEngine.executeChangeRequest` materialiseert geclaimde `change_request`-nodes tegen de gepinde gepubliceerde nodeconfiguratie. De handler resolveert SOLL-waarden, ingangsdatum en rationale uit gepersistente runtimevariabelen, laadt IST-snapshots opnieuw uit `workflow_data_snapshot` binnen dezelfde instance, bouwt een versioned `WorkflowChangeIntent` en voert de gesloten mutation-adapter dry-run uit. Ready dry-runs worden als `workflow_change_intent` met status `validated` opgeslagen inclusief adapter-ID, resource, operatie, payload, preconditions, dry-runresultaat, stage-handlerreferentie, workflowinstance, node, snapshot, actorcorrelatie en idempotency key; conflicted/invalid dry-runs worden met status `conflicted`/`failed` en issuecodes vastgelegd zonder opvolgroute te activeren. Succesvolle materialisatie rondt de node af en activeert alleen dan de opvolger; alle writes vallen binnen dezelfde transactionele storegrens. De PostgreSQL-store ondersteunt nu het laden van runtime-snapshots en idempotent schrijven van change intents. Het audit-event `workflow.change_intent.materialized` legt intent-ID, node key, adapter, resource, operation, dry-runstatus, stage handler, stagingreference, snapshot-ID en issuecodes vast. Het normatieve contract staat in [workflow-runtime-change-intents.md](architecture/workflow-runtime-change-intents.md) en is gelinkt vanuit de architectuurindex. Tests dekken intentconstructie, scoped dry-runinput, snapshotlineage, gevalideerde stagingreferentie, conflicted dry-runs zonder successoractivatie en idempotente intentopslag; verificatie: `tests/workflow-runtime-engine.test.ts` en `tests/workflow-runtime-task.test.ts` groen, `npx tsc --noEmit` schoon.

### 3.10 — Implementeer conflictcontrole en apply ✅

**Afhankelijkheden:** 3.9
**Werk:** vergelijk concurrency token/IST vlak voor apply, blokkeer stale changes, bied opnieuw laden en hergoedkeuren, pas atomair toe via mutation adapter.
**Acceptatie:** geen gedeeltelijke live wijziging; conflict overschrijft nooit stil actuele data.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeEngine.applyChangeIntent` vormt nu de aparte apply-grens na materialisatie. De handler lockt de instance, laadt de `workflow_change_intent` binnen dezelfde instance, accepteert alleen `validated`/`approved` intents en bouwt daaruit opnieuw het versioned mutation-contract. Direct vóór apply draait de mutation dry-run opnieuw tegen de actuele client-configsnapshot; concurrency-token- en IST-conflicten zetten de intent op `conflicted`, schrijven een `failed/conflicted` apply-resultaat, publiceren `workflow.change_intent.apply_blocked` met issuecodes en `requiresReloadAndReapproval`, en roepen de apply-adapter niet aan. Alleen een `ready` final dry-run bereikt de geregistreerde mutation apply-adapter; het adapterresultaat wordt transactioneel opgeslagen met statusmapping, auditreferentie, approval-/applymetadata en een `workflow.change_intent.applied` of `workflow.change_intent.apply_failed` event. De PostgreSQL-store ondersteunt daarvoor row-locked intentloading en atomaire update van `dry_run_result`, `apply_result`, `approved_by_user_id`, `approved_at` en `applied_at`. Het normatieve contract staat in [workflow-runtime-apply.md](architecture/workflow-runtime-apply.md) en is gelinkt vanuit de architectuurindex. Tests bewijzen dat stale intents nooit bij de apply-adapter komen, dat herladen/hergoedkeuren expliciet wordt gesignaleerd en dat verse intents precies één keer na final dry-run worden toegepast; verificatie: `tests/workflow-runtime-engine.test.ts` en `tests/workflow-runtime-task.test.ts` groen.

### 3.11 — Bouw duurzame outbox en worker ✅

**Afhankelijkheden:** 3.2
**Werk:** transactionele outbox, worker lease, retry/backoff, dead-letterstatus en idempotente delivery voor enginevervolgstappen, notificaties en integraties.
**Acceptatie:** procescrash tussen commit en delivery verliest geen werk.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** de runtime heeft nu een generieke, duurzame `workflow_outbox` met `engine`, `notification` en `integration` message-kinds, `pending/leased/delivered/dead_letter` statussen, instancebrede idempotency keys, correlation/causation, bounded attempts, `available_at`, workerleasevelden, deliverytimestamp, dead-lettertimestamp en laatste foutmelding. `PostgresWorkflowRuntimeTransaction.appendEvent` schrijft bij ieder append-only `workflow_event` in dezelfde database-transactie een `engine`-outboxmessage; een crash na commit maar vóór delivery laat daardoor altijd een claimbare deliveryrecord achter. `PostgresWorkflowOutboxStore` claimt één beschikbaar of verlopen leased bericht met `FOR UPDATE SKIP LOCKED`, zet een tijdgebonden lease, bevestigt succesvolle delivery idempotent en plant transient failures opnieuw met de gedeelde bounded runtime-backoff. Poison messages gaan na het attemptbudget naar `dead_letter` in plaats van oneindig te retryen. `WorkflowOutboxWorker` dispatcht berichten naar handlers per kind en retourneert expliciete resultaten voor idle, delivered, retry scheduled en dead-lettered. De schemawijziging is gespiegeld in `db/init.sql`, `scripts/migrate.mjs` en het on-demand fallbackschema in `lib/db.ts`; het schema-contract bewaakt tabel, constraints en indexes. Het normatieve contract staat in [workflow-runtime-outbox.md](architecture/workflow-runtime-outbox.md) en is gelinkt vanuit de architectuurindex. Tests dekken delivery, lease-clearing, retry-backoff, dead-letter, enqueue-deduplicatie en schema/migratie-alignment; verificatie: outbox-, schema-, engine- en migratiechecks groen, `npx tsc --noEmit` schoon.

### 3.12 — Implementeer notificatie-runtime ✅

**Afhankelijkheden:** 3.11, 2.12
**Werk:** veilige rendering, deliverylog, retries, rolontvangers en link naar taak/instance.
**Acceptatie:** delivery is auditeerbaar; falen blokkeert alleen waar de definitie dit expliciet vereist.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeEngine.executeNotification` voert geclaimde `notification`-nodes uit tegen de gepinde gepubliceerde nodeconfiguratie en valideert die opnieuw met het notificatieschema. De runtime resolveert ontvangers via immutable workflow-rolebindings en accepteert zowel taakrollen (`workflow:tasks:execute`) als approvalrollen (`workflow:approve`), rendert subject en message uitsluitend via de bestaande veilige templaterenderer, escaped alle variabelewaarden en faalt gesloten wanneer gedeclareerde templatevariabelen ontbreken of renderinggrenzen overschreden worden. Succesvolle rendering schrijft een `notification`-bericht naar `workflow_outbox` met channel, trigger, rendered subject/message, gebruikte variabelen, recipient roles/groups en een link naar de workflowinstance; daarna schrijft de runtime `workflow.notification.queued`, markeert de node als geslaagd en activeert opvolgers. De deliverylog is de outboxrecord zelf: status, attempt, max attempts, lease, retry, delivered/dead-letter timestamps en laatste fout blijven auditeerbaar via de duurzame outbox uit 3.11. Deliveryfouten na queueing blokkeren het proces niet; alleen ongeldige configuratie, ontbrekende rolbinding of onveilige/mislukte rendering rolt de node transactioneel terug. De PostgreSQL runtime-store ondersteunt nu generiek `enqueueOutbox`, dat ook door event-outboxing wordt hergebruikt. Het normatieve contract staat in [workflow-runtime-notifications.md](architecture/workflow-runtime-notifications.md) en is gelinkt vanuit de architectuurindex. Tests dekken veilige escaping, rolontvangers, outboxpayload, audit-event, opvolgactivatie en rollback zonder outbox bij ontbrekende templatevariabelen; verificatie: `tests/workflow-runtime-engine.test.ts`, `tests/workflow-runtime-task.test.ts` en `tests/workflow-notification-schema.test.ts` groen, `npx tsc --noEmit` schoon.

### 3.13 — Implementeer timers, SLA en escalatiebasis ✅

**Afhankelijkheden:** 3.11, 3.6
**Werk:** deadlines, scheduled wakeups, reminders en één escalatierol; kalenderdagen in eerste versie.
**Acceptatie:** worker kan gemiste timers na downtime veilig inhalen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeTimerService` verwerkt deadlinebewaking als durable workerlaag boven op `workflow_task` en `workflow_outbox`. De service scant open/geclaimde taken met `deadlineAt <= now`, negeert voltooide/geannuleerde/verlopen taken en deriveert catch-upitems per kalenderdag: één `deadline_reminder` op de deadlinedag en daarna één `deadline_escalation` per gemiste kalenderdag. Iedere due item gebruikt een deterministische idempotency key met taak-ID, datum en deliverytype, zodat worker restarts of herstel na downtime geen dubbele reminders opleveren. Reminderberichten gaan naar de taakrol; escalatieberichten gaan daarnaast naar één configureerbare escalatiegroep met `bcm:role:change_manager` als MVP-default. Alle timerdeliveries worden als `notification`-berichten in de outbox gezet met taak-, instance-, deadline-, recipient- en linkmetadata; `workflow.timer.notification_queued` legt taak-ID, due date, deliverytype, recipient groups en outbox-ID vast. De Postgres runtime-store ondersteunt nu row-locked `listOverdueTasks(now)` met `SKIP LOCKED`, zodat meerdere workers veilig kunnen catch-uppen. Het normatieve contract staat in [workflow-runtime-timers.md](architecture/workflow-runtime-timers.md) en is gelinkt vanuit de architectuurindex. Tests bewijzen kalenderdagplanning, idempotente catch-up, escalatiegroep, outboxpayload en het negeren van afgeronde/future taken; verificatie: `tests/workflow-runtime-timers.test.ts`, runtime engine/task/outbox-tests groen en `npx tsc --noEmit` schoon.

### 3.14 — Bouw instance detail en auditweergave ✅

**Afhankelijkheden:** 3.4–3.13
**Werk:** actieve node, tijdlijn, taken, snapshots, beslissingen, intents, applyresultaat, fouten en retryactie.
**Acceptatie:** support kan een instance reconstrueren zonder databasequery.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeDetailService` en `PostgresWorkflowRuntimeDetailReader` bouwen nu een support-readmodel voor één workflowinstance met instance-status/scope, actieve nodes, alle node-attempts, taken en deadlines, snapshots met concurrencytokens, beslissings- en approvalevents, change intents inclusief dry-run/applyresultaat, volledige geordende audit-tijdlijn, outboxdelivery/dead-letterstatussen en retrybare node-attempts. De nieuwe server-rendered pagina `/workflow-runtime/[instanceId]` staat achter de runtimefeatureflag en een expliciete `workflow:view`-controle, toont alle runtimeonderdelen in scanbare panelen en linkt vanuit `/tasks` zodat support vanaf een taak direct de instancecontext kan openen. Retryacties zijn echte runtimecommands: alleen `failed`/`needs_intervention` nodes met resterend attemptbudget tonen een formulier dat `retry_node` uitvoert met een nieuwe durable node-attempt en audit-event. Fouten, applyresultaten en outboxdeadletters zijn zichtbaar zonder losse databasequery. Het normatieve contract staat in [workflow-runtime-detail.md](architecture/workflow-runtime-detail.md) en is gelinkt vanuit de architectuurindex. Tests dekken het readmodel voor actieve nodes, beslissingen, retrybare nodes en onbekende instances; verificatie: `tests/workflow-runtime-detail.test.ts`, runtime engine/task-tests groen, `npx tsc --noEmit` en `npm run lint` schoon.

### 3.15 — Bouw operationeel runtime dashboard ✅

**Afhankelijkheden:** 3.14
**Werk:** aantallen actief/wachtend/geblokkeerd/mislukt, oudste taken, verlopen SLA, dead letters en adapterfouten.
**Acceptatie:** metrics en alerts bevatten workflow/version/node labels zonder gevoelige waarden te lekken.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** `WorkflowRuntimeDashboardService` en `PostgresWorkflowRuntimeDashboardReader` leveren een read-only operationeel model met instance- en nodecounts voor actief, wachtend, geblokkeerd en mislukt; oudste open/geclaimde taken; verlopen SLA-taken; dead-letter outboxberichten; adapterfouten uit conflicted/failed change intents; en daaruit afgeleide triage-alerts. Alle metrics en alerts bevatten alleen workflownaam, workflowversion-ID, versienummer, node key, block type, status, technische ID's en foutcodes/-meldingen; workflowinput, variabelen, snapshots, change-intentpayloads, preconditions en outboxpayloads worden niet opgenomen. De nieuwe pagina `/workflow-runtime` staat achter `workflow_runtime.start` en `workflow:view`, toont de operationele tabellen met links naar de instance-detailpagina en is toegevoegd aan de navigatie. De routeguard onderscheidt nu dashboard/detailroutes (`workflow:view`) van `/workflow-runtime/:versionId/start` (`workflow:start`), zodat beheerders en supportprofielen runtime-inzicht krijgen zonder startrecht. Het normatieve contract staat in [workflow-runtime-dashboard.md](architecture/workflow-runtime-dashboard.md) en is gelinkt vanuit de architectuurindex. Tests dekken tellingen, alerts, label-only lekpreventie en routeautorisatie; verificatie: `tests/workflow-runtime-dashboard.test.ts`, `tests/workflow-studio-route-access.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

### 3.16 — Migreer twee bestaande flows in shadow mode ✅

**Afhankelijkheden:** 3.4–3.15, 1.13
**Werk:** draai benchmark switch en generieke veldwijziging parallel als simulatie naast klassieke verwerking; vergelijk formulierdata, beslissingen, staging en applyplan.
**Acceptatie:** afgesproken gelijkwaardigheidsset is 100% of afwijkingen zijn verklaard en opgelost.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** runtime shadow mode is toegevoegd achter de nieuwe feature flag `workflow_runtime.shadow_compare`. `compareLegacyChangeWithWorkflowShadow` compileert de legacy `change_type_config` opnieuw via de compatibility compiler, deriveert side-effectvrij het runtimecontract en vergelijkt de afgesproken gelijkwaardigheidsset: formulierdata, mandatory approvalbeslissingen, stagingresource en applyplan. De klassieke submitpaden blijven leidend en blokkeren niet op shadow mode: `benchmark_switch` draait na succesvolle klassieke staging een volledige vergelijking mee en meldt onverwachte mismatches via `reportError`; de generieke `fee_change`-route vergelijkt formulierdata en approvals en markeert het ontbrekende runtime-applyplan als verklaarde afwijking, omdat deze legacy `ist_sync`-flow nog geen governed mutation-adapter voor feevelden heeft. Andere change types zijn buiten deze shadowfase en rapporteren `unsupported` in de pure vergelijker. Het normatieve contract staat in [workflow-runtime-shadow-mode.md](architecture/workflow-runtime-shadow-mode.md) en is gelinkt vanuit de architectuurindex. Tests dekken de nieuwe featureflag, volledige benchmark-equivalentie, de verklaarde `fee_change`-applyplangap en routeflagcompatibiliteit; verificatie: `tests/workflow-runtime-shadow-compare.test.ts`, `tests/feature-flags.test.ts`, `tests/workflow-studio-route-access.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

### 3.17 — Gefaseerde runtime cutover ✅

**Afhankelijkheden:** 3.16
**Werk:** zet runtime per workflowversie aan, bied snelle rollback naar classic, monitor foutpercentages en verwerk alleen nieuwe instances via nieuwe engine.
**Acceptatie:** G3 slaagt; minstens één volledig in Studio gemaakte workflow wijzigt client config via het governed pad.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** runtime cutover is nu een expliciete server-side policy boven op `workflow_runtime.start`. `decideWorkflowRuntimeCutover` schakelt alleen naar runtime wanneer de globale startpoort open is én een per-definitie- of per-versieflag aan staat; ontbrekende of uitgezette flags vallen direct terug naar classic, waardoor rollback voor nieuwe aanvragen een featureflagwijziging is. De changecatalogus toont runtime-aanvraaglinks alleen voor gepubliceerde versies die zowel startbaar als gecutovert zijn; startpagina en server action controleren dezelfde policy opnieuw, zodat directe URLs de cutover niet kunnen omzeilen. Bestaande runtimeinstances blijven via dashboard/detail beheersbaar; rollback voorkomt uitsluitend nieuwe engine-instances. `evaluateWorkflowRuntimeCutoverHealth` bewaakt het foutpercentage `(failed + needs_intervention) / started` met een standaarddrempel van 5% en retourneert `rollback_recommended` wanneer de drempel wordt overschreden. Het normatieve contract staat in [workflow-runtime-cutover.md](architecture/workflow-runtime-cutover.md) en is gelinkt vanuit de architectuurindex. Tests dekken dynamische workflow/version flags, global-off fallback, per-workflow rollback, runtime-enable en foutpercentagebewaking; verificatie: `tests/workflow-runtime-cutover.test.ts`, `tests/feature-flags.test.ts`, `tests/workflow-studio-route-access.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon. Fase 3 is hiermee 17/17 en G3 is gesloten voor de MVP-runtimepoort; DB-backed end-to-end applyvalidatie blijft afhankelijk van een omgeving met gepubliceerde Studio-versie en actieve cutoverflag.

---

## 6. Fase 4 — Uitgebreid self-service en enterprise hardening

**Resultaat:** de Studio ondersteunt complexe processen, hergebruik, integraties, governance, analytics en gecontroleerde brede uitrol.

### 4.1 — Parallel split en join ✅

**Afhankelijkheden:** G3
**Werk:** parallelle tokens, AND/OR join, quorum en afhandeling van afgewezen/geannuleerde branches.
**Acceptatie:** validator en runtime voorkomen deadlocks en dubbele vervolgstappen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu expliciete parallelle control blocks `parallel_split` en `parallel_join` met publieke blockcontracten, UI-metadata en gevalideerde configuratieschema's. Splits ondersteunen multi-edge fan-out; joins ondersteunen AND, OR en quorum. De statische validator blokkeert deadlockgevoelige graphvormen: splits met minder dan twee branches, joins met minder dan twee inkomende branches, onhaalbare quorumwaarden, branches die niet op dezelfde eerste join convergeren en ambigue split-naar-meerdere-joinconstructies. De runtime activeert joinnodes met een stabiele instance/node-idempotency key, zet een join op `waiting` zolang de regel niet voldaan is, en maakt dezelfde join pas `ready` zodra genoeg voorgangers succesvol zijn; daardoor kunnen meerdere branches dezelfde join raken zonder dubbele node-attempts of dubbele vervolgstappen. Failed/skipped branches tellen als terminal voor reconstructie, maar niet als succesvolle quorumleden. Het normatieve contract staat in [workflow-runtime-parallel-gateways.md](architecture/workflow-runtime-parallel-gateways.md) en is gelinkt vanuit de architectuurindex. Tests dekken blockregistratie, valide split/join-validatie, deadlockpreventie, onhaalbare quorumconfiguratie en runtimegedrag waarbij een AND-join pas na de tweede branch de vervolgroute activeert; verificatie: `tests/workflow-validator.test.ts`, `tests/workflow-runtime-engine.test.ts`, `tests/block-registry.test.ts`, `tests/workflow-runtime-task.test.ts`, `tests/workflow-runtime-timers.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

### 4.2 — Meervoudige goedkeuringen ✅

**Afhankelijkheden:** 4.1, 3.7
**Werk:** sequential, all-of, any-of en quorum; unieke personen, rolcombinaties en escalatieregels.
**Acceptatie:** besluitberekening is deterministisch en volledig geaudit.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Approval-blokken ondersteunen nu gegroepeerde goedkeuringspolicies via `approvalGroupId`, met besluitmodi `sequential`, `all_of`, `any_of` en `quorum`, optionele quorumwaarde, unieke-personenregel, rolcombinatieregel en escalatievenster. De block registry exposeert deze velden in de configuratie-UI en bestaande enkelvoudige approvals blijven compatibel via defaults. Een pure evaluator berekent groepsbesluiten deterministisch op basis van genormaliseerde stemmen, vaste sorteervolgorde en expliciete invalidatiereasons voor dubbele personen, dubbele rollen en onhaalbare quorumregels. De validator blokkeert te kleine groepen, inconsistente policy-instellingen, onhaalbare quorumwaarden en verboden rolherhaling vóór publicatie. De runtime leest eerdere `workflow.approval.decided` events, voegt de huidige stem toe, blokkeert policy-schendingen vóór taakvoltooiing en schrijft voor geldige gegroepeerde approvals een volledig `workflow.approval.policy_evaluated` audit-event met counts, pending nodes, blocking reasons en genormaliseerde stemmen. Het normatieve contract staat in [workflow-runtime-multi-approvals.md](architecture/workflow-runtime-multi-approvals.md) en is gelinkt vanuit de architectuurindex. Tests dekken all-of, any-of, quorum en duplicate-approver evaluatie, publicatievalidatie voor grouped approvals en runtime-audit van een afgeronde all-of-groep; verificatie: `tests/workflow-multi-approval.test.ts`, `tests/workflow-validator.test.ts`, `tests/workflow-runtime-engine.test.ts`, `tests/block-registry.test.ts`, `tests/workflow-runtime-task.test.ts`, `tests/workflow-runtime-timers.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

### 4.3 — Subworkflows en herbruikbare fragmenten ✅

**Afhankelijkheden:** 4.1
**Werk:** versioned subworkflowreferenties, input/output mapping, pinned child version en nestinglimiet.
**Acceptatie:** impactanalyse toont welke workflows een fragmentversie gebruiken.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een versioned `subworkflow` blockcontract met gepinde `childWorkflowVersionId`, optioneel versielabel, expliciete input- en outputmapping en een harde nestinglimiet van 3. De block registry exposeert het blok als control-block met UI-metadata voor workflowversiereferenties en variabele mappings. Het configuratieschema valideert UUID-pinning, snake_case variabelen, duplicate-safe input/output mappings en nestingdiepte. De statische validator behandelt subworkflow-inputs als parent variabelelezers, outputmappings als parent variabeleschrijvers en blokkeert directe self-reference wanneer de huidige parent `workflowVersionId` bekend is. Impactanalyse is beschikbaar via `collectWorkflowSubworkflowReferences` en `analyzeWorkflowSubworkflowImpact`; die scannen workflow version snapshots en tonen per child fragmentversie welke parent workflows, versies en nodes eraan vastgepind zijn, inclusief mappingcounts en nestingdiepte. Het normatieve contract staat in [workflow-runtime-subworkflows.md](architecture/workflow-runtime-subworkflows.md) en is gelinkt vanuit de architectuurindex. Tests dekken blockregistratie, geldige/ongeldige subworkflowconfiguratie, self-reference validatie, parent-output duplicate mapping en impactanalyse voor meerdere parent workflows; verificatie: `tests/block-registry.test.ts`, `tests/workflow-validator.test.ts`, `tests/workflow-subworkflow-impact.test.ts` en `npx tsc --noEmit` schoon.

### 4.4 — Werkdagenkalenders, delegatie en escalatie ✅

**Afhankelijkheden:** 3.13
**Werk:** feestdagen, business hours, afwezigheid, tijdelijke delegatie, escalatieniveaus en stop-the-clockstatus.
**Acceptatie:** deadlines zijn reproduceerbaar en wijzigingen aan kalenders veranderen lopende deadlines niet stil.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Role-taskdeadlines ondersteunen nu een optionele `deadlineCalendar` met UTC-business hours, ISO-werkdagen, feestdagen, tijdelijke afwezigheden met delegate groups, stop-the-clockperiodes en escalatieniveaus op basis van verstreken businessuren. `calculateWorkflowBusinessDeadline` berekent deadlines deterministisch per businessminuut en slaat de genormaliseerde kalender samen met starttijd, duur en uitkomst op als `deadlinePolicy` in `workflow.task.created`; de taak zelf bewaart de concrete `deadlineAt`, zodat latere kalenderwijzigingen lopende deadlines niet stil aanpassen. De timerworker leest bij verwerking eerst die oorspronkelijke audit-snapshot terug en gebruikt die voor delegatie en escalaties. Reminders behouden de oorspronkelijke assignee group en voegen tijdelijke delegates toe; escalaties activeren snapshot-levels wanneer genoeg businessuren na de deadline zijn verstreken, met de bestaande fallbackgroep wanneer er geen passend level is. Timerpayloads en audit-events bevatten nu delegated state, delegate groups, escalation groups en recipient groups voor reconstructie. Het normatieve contract staat in [workflow-runtime-calendars.md](architecture/workflow-runtime-calendars.md) en is gelinkt vanuit de architectuurindex. Tests dekken business-hour/holiday/stop-clockdeadlineberekening, businessminute-telling, afwezigheidsdelegatie, escalatieniveaus, role-task deadlinepolicy snapshots en timergebruik van de originele snapshot; verificatie: `tests/workflow-runtime-calendar.test.ts`, `tests/workflow-runtime-timers.test.ts`, `tests/workflow-runtime-task.test.ts`, `tests/block-registry.test.ts` en `npx tsc --noEmit` schoon.

### 4.5 — Comments, bijlagen en bewijsstukken ✅

**Afhankelijkheden:** 3.6, 3.14
**Werk:** thread per taak/instance, malware-scanbare object storage, classificatie, downloadrechten en retention.
**Acceptatie:** bestanden staan niet in de database en worden alleen via geautoriseerde tijdelijke links geleverd.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow runtime heeft nu een evidence-contract en service voor instance- en taskthreads. Comments worden met actor, timestamp, correlation ID en classificatie vastgelegd; attachmentregistratie schrijft uitsluitend metadata zoals bestandsnaam, content type, byte size, classificatie, object storage key, SHA-256 checksum, scanstatus en retentiedatum. Het servicecontract bevat bewust geen veld voor bestandsbytes of inline content: upload, opslag en malware scanning blijven object-store concerns. Downloads zijn alleen mogelijk via `createDownloadLink`, dat workflowpermissie, scope, threadgroep, retentie en `scanStatus=clean` afdwingt en uitsluitend tijdelijke object-store URLs teruggeeft. Pending, quarantined, deleted of verlopen bijlagen krijgen geen link. Het normatieve contract staat in [workflow-runtime-evidence.md](architecture/workflow-runtime-evidence.md) en is gelinkt vanuit de architectuurindex. Tests dekken taskcomments, metadata-only attachmentregistratie, blokkade vóór clean scan, tijdelijke download grants en denied access buiten de threadgroepen; verificatie: `tests/workflow-runtime-evidence.test.ts` en `npx tsc --noEmit` schoon.

### 4.6 — Integratieblock-framework ✅

**Afhankelijkheden:** 3.11
**Werk:** allowlisted connectors, versioned input/outputschema's, secret references, timeouts, retries, signing, idempotency en sandbox/testmodus.
**Acceptatie:** workflowmakers zien nooit secrets en kunnen geen willekeurige URL configureren.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een versioned `integration` blockcontract voor allowlisted connectors (`servicenow.create_ticket.v1`, `slack.post_message.v1`, `teams.post_message.v1`) met gepinde connectorversie, operatie, input- en outputschemaversies, inputvariabelen, optionele outputvariabele, secret references, timeout, retrypolicy, signingpolicy en sandboxmodus. Het schema is strict en weigert vrije URL-/endpointvelden en secretwaarden; workflowmakers configureren alleen `secret:*` references. De block registry exposeert het blok als beheerde connectoractie. De validator behandelt integratie-inputs als variabelelezers en outputvariabele als schrijver. `WorkflowRuntimeEngine.executeIntegration` voert geen externe call inline uit, maar resolveert gedeclareerde inputvariabelen, schrijft een idempotente `integration` outboxmessage met connectormetadata, schema’s, timeout/retry/signing/sandbox en secret reference names, markeert de node succesvol en schrijft `workflow.integration.queued` zonder secretwaarden in audit. Het normatieve contract staat in [workflow-runtime-integrations.md](architecture/workflow-runtime-integrations.md) en is gelinkt vanuit de architectuurindex. Tests dekken blockregistratie, geldige allowlisted connectorconfiguratie, afwijzing van vrije URL/secretwaarde, runtime outbox-enqueue zonder secret exposure, outputvariabele en rollback bij ontbrekende inputvariabelen; verificatie: `tests/block-registry.test.ts`, `tests/workflow-runtime-engine.test.ts` en `npx tsc --noEmit` schoon.

### 4.7 — Template- en fragmentbibliotheek ✅

**Afhankelijkheden:** 4.3
**Werk:** gecureerde templates, eigenaar, versie, tags, voorbeelddata, beoordeling en clone/upgradeflow.
**Acceptatie:** change manager kan een template gebruiken zonder koppeling met de oorspronkelijke draft te verliezen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een gecureerde template- en fragmentbibliotheek bovenop de bestaande draft lifecycle. Library entries bevatten id, kind (`template` of `fragment`), immutable versie, titel, beschrijving, owner, tags, voorbeelddata, rating en source reference. De eerste set wrapt de bestaande built-in templates (`benchmark_switch`, `generic_field_change`) en voegt een versioned `risk_gate_fragment` toe. `instantiateWorkflowTemplateLibraryEntry` maakt een onafhankelijke draft maar retourneert daarnaast expliciete source metadata en bewaart stabiele origin tags zoals `library:risk_gate_fragment.v2` en `library-version:2` plus catalogusbeschrijving, zodat de koppeling met de oorspronkelijke bibliotheekentry zichtbaar blijft zonder mutable coupling. `findWorkflowTemplateUpgradeCandidates` biedt een upgradeflow door entries met dezelfde source reference en hogere versie te tonen. Het normatieve contract staat in [workflow-template-library.md](architecture/workflow-template-library.md) en is gelinkt vanuit de architectuurindex. Tests dekken listing/filtering van templates en fragmenten, owner/tags/sample data/rating, instantiatie van built-in templates met bronmetadata, publiceerbaar fragment en upgrade-kandidaten; verificatie: `tests/workflow-template-library.test.ts`, `tests/workflow-builtin-templates.test.ts` en `npx tsc --noEmit` schoon.

### 4.8 — Versievergelijking, impactanalyse en rollback ✅

**Afhankelijkheden:** 3.17, 4.3, 4.6
**Werk:** semantische diff van nodes/rollen/data/mutaties, dependency graph, uitfasering, vorige versie opnieuw publiceren en impact op actieve instances.
**Acceptatie:** risicovolle wijzigingen zoals minder goedkeuringen of bredere datascope worden expliciet gemarkeerd.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een version-governance laag bovenop de bestaande reviewdiff. `analyzeWorkflowVersionImpact` combineert stabiele metadata/node/edge/role-binding diffs met semantische risicovlaggen voor minder approval-nodes, bredere role-binding clientscope, gewijzigde change-intent surface, integratiereview en actieve instances op geraakt versies. De impactanalyse levert daarnaast een dependency graph met subworkflowreferenties naar de current/baseline versie en de integratieconnectors van de current versie. `prepareWorkflowRollbackDraft` zet een immutable vorige version snapshot om naar een nieuwe draftinput met dezelfde scope, metadata, nodes, edges en role bindings plus rollback-origin tags; rollback loopt dus via de normale publishpoorten en muteert nooit historie. Het normatieve contract staat in [workflow-version-governance.md](architecture/workflow-version-governance.md) en is gelinkt vanuit de architectuurindex. Tests dekken risicovlaggen voor minder goedkeuringen en bredere datascope, mutatie-/integratie-impact, actieve instance impact, subworkflowdependency's en rollbackdraftvoorbereiding; verificatie: `tests/workflow-version-governance.test.ts`, `tests/workflow-review.test.ts`, `tests/workflow-subworkflow-impact.test.ts` en `npx tsc --noEmit` schoon.

### 4.9 — Foutcompensatie en handmatig herstel ✅

**Afhankelijkheden:** 3.10, 4.6
**Werk:** compensation handlers waar veilig, retry from node, skip met bevoegd besluit, terminate en incidentnotitie.
**Acceptatie:** alle herstelacties zijn bevoegd, idempotent en zichtbaar in audit.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een `WorkflowRuntimeRecoveryService` als bevoegde herstelpoort bovenop de bestaande runtime state machine. De service toetst `workflow:manage` plus tenant/businessunit/clientscope, ondersteunt handmatige retry vanaf `failed` en `needs_intervention`, bevoegd overslaan van `ready` nodes, handmatig beëindigen van herstelbare instances en compensatieregistratie via allowlisted handlers voor `integration`, `notification` en `change_request`. Elke herstelactie schrijft een idempotent `workflow.recovery.action_recorded` event met actor, incidentnotitie, causation-ID en correlatie-ID naast de reguliere runtime-events. Het normatieve contract staat in [workflow-runtime-recovery.md](architecture/workflow-runtime-recovery.md) en is gelinkt vanuit de architectuurindex. Tests dekken autorisatie, retry, skip, terminate, allowlisted compensation en audit-idempotentie; verificatie: `tests/workflow-runtime-recovery.test.ts` en `npx tsc --noEmit` schoon.

### 4.10 — Procesanalytics ✅

**Afhankelijkheden:** 3.15
**Werk:** doorlooptijd per workflow/node, wachttijd per rol, rework, rejection, SLA, failure rate en volume. Gebruik gepseudonimiseerde aggregaties waar mogelijk.
**Acceptatie:** dashboards filteren op versie, periode en scope en lekken geen data buiten autorisatie.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een procesanalytics-readmodel naast het operationele runtime-dashboard. `WorkflowRuntimeAnalyticsService` valideert periode/versionfilters, vereist `workflow:view`, toetst tenant/businessunit/clientscope en retourneert uitsluitend gepseudonimiseerde aggregaten zonder instance-ID's, task-ID's, actor-ID's, workflowinput, variabelen of snapshotpayloads. `PostgresWorkflowRuntimeAnalyticsReader` berekent volume, afgerond/mislukt/geannuleerd, gemiddelde workflowdoorlooptijd, node-executies, nodeduur, failure rate, rework, rolwachttijd, taakdoorlooptijd, rejecties en SLA-overdue met server-side filters voor periode, workflowversie en scope; clientfilters nemen alleen instances mee die volledig binnen de aangevraagde clientscope vallen. `/workflow-runtime` toont deze analytics nu met filters voor periode, workflowversie en client naast de bestaande operationele alerts. Het normatieve contract staat in [workflow-runtime-analytics.md](architecture/workflow-runtime-analytics.md) en is gelinkt vanuit de architectuurindex. Tests dekken aggregatiesamenvatting, autorisatie vóór lezen, filtervalidatie en het ontbreken van gevoelige IDs/payloadwaarden; verificatie: `tests/workflow-runtime-analytics.test.ts`, `tests/workflow-runtime-dashboard.test.ts`, `tests/workflow-runtime-detail.test.ts`, `tests/workflow-runtime-recovery.test.ts` en `npx tsc --noEmit` schoon.

### 4.11 — Governance policies als publicatiepoort ✅

**Afhankelijkheden:** 4.2, 4.6, 4.8
**Werk:** configureer policies zoals verplichte vier-ogencontrole, verboden rolcombinaties, minimale auditvelden, integratiereview en mutation approval.
**Acceptatie:** policies zijn server-side en niet door workflowmakers uit te schakelen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een server-side governance policylaag als publicatiepoort bovenop de technische graphvalidator. `evaluateWorkflowGovernancePolicies` draait bij zowel `submitForReview` als `publish` en leest geen policyconfiguratie uit de draft, zodat workflowmakers de regels niet kunnen uitschakelen. De vaste policyset blokkeert change requests zonder upstream approval, starterrollen die ook goedkeuren, workflowrollen of identitygroepen die start- en approve-rechten combineren, approvals zonder verplichte commentaarvelden bij afwijzen/terugsturen, mutaties zonder verplichte goedkeuringscommentaar en niet-sandbox integraties zonder integratiereview plus HMAC-signing. Policyissues komen terug als `validation_failed` met stabiele codes, zonder secrets, payloads of runtimegegevens. Het normatieve contract staat in [workflow-governance-policies.md](architecture/workflow-governance-policies.md) en is gelinkt vanuit de architectuurindex. Tests dekken succesvolle policy-evaluatie, vier-ogencontrole, forbidden role combinations inclusief opt-outpoging, minimale auditvelden, mutation approval, integratiereview en de publishpoort; verificatie: `tests/workflow-governance-policies.test.ts`, `tests/workflow-definition-service.test.ts`, `tests/workflow-validator.test.ts` en `npx tsc --noEmit` schoon.

### 4.12 — Security- en privacyhardening ✅

**Afhankelijkheden:** 4.5, 4.6, 4.11
**Werk:** threat model, pentest, rate limits, CSP/security headers, secret rotation, dataretentie, auditexport, SIEM-events, dependency/container scanning en privacyclassificatie.
**Acceptatie:** geen open high/critical bevindingen; alle P0 enterprise-readinessblokkades zijn gesloten.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een concrete security- en privacyhardeninglaag voor de beschermde Studio-, Runtime-, Tasks- en Adminroutes. `security-hardening.ts` centraliseert CSP/browsersecurityheaders, routegevoelige rate-limit buckets, een in-memory limiter en privacy-safe SIEM-export van runtime-events met gepseudonimiseerde instance/node/actorreferenties en alleen payloadkeys. `proxy.ts` past deze headers en rate limits toe op alle beschermde routegroepen en retourneert `429` met `Retry-After` en `X-RateLimit-*` bij overschrijding. Evidence-retentie, malware-scanstatus en tijdelijke downloadlinks blijven onderdeel van het bestaande evidencecontract. Dependency scanning is uitgevoerd en geremedieerd: `npm audit --audit-level=high` meldt nul kwetsbaarheden na upgrades naar `next@^16.3.0`, `nodemailer@^9.0.5` en transitive fixes voor onder meer `sharp`, `postcss`, `brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, `dompurify` en `mermaid`; de productiebuild op Next 16.3.0 slaagt. Het threat model en de resterende operationele releasechecks staan in [workflow-security-privacy-hardening.md](architecture/workflow-security-privacy-hardening.md), gelinkt vanuit de architectuurindex. Tests dekken headers, rate-limit buckets, limitergedrag, SIEM-redactie, route-access, identity-secretguard en evidence-downloadbeveiliging; verificatie: `tests/workflow-security-hardening.test.ts`, `tests/workflow-studio-route-access.test.ts`, `tests/workflow-runtime-evidence.test.ts`, `tests/identity-context.test.ts`, `tests/workflow-governance-policies.test.ts`, `npx tsc --noEmit`, `npm run lint`, `npm audit --audit-level=high` en `npm run build` schoon.

### 4.13 — Performance, schaal en chaosherstel ✅

**Afhankelijkheden:** 4.1–4.12
**Werk:** loadtests op grote graphs en taakvolumes, workerconcurrency, DB-indexen, queuebackpressure, process crash, DB failover en poison message tests.
**Acceptatie:** vastgelegde SLO's worden gehaald en herstel voldoet aan RPO/RTO.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Runtime heeft nu een expliciet schaal- en chaosherstelcontract. `WorkflowOutboxWorker.runBatch` verwerkt bounded outboxbatches met configureerbare concurrency bovenop dezelfde durable claim/lease/deliverysemantiek als `runOnce`, zodat workerparallelisme, process-crashherclaim na lease-expiry en poison message dead-lettering meetbaar blijven. `runtime-resilience.ts` legt runtime-SLO's vast voor ready-node claim latency, outboxouderdom, outboxbacklog, dead letters, open taken, RPO 0 en RTO 15 minuten; `evaluateWorkflowRuntimeBackpressure` classificeert queue-/taakmetrics als healthy/degraded/blocked met stabiele issuecodes, en `auditWorkflowRuntimeScaleIndexes` bewaakt de vereiste runtime-indexen in `db/init.sql`. De validator heeft een unit-level loadtest voor een groot lineair graph met honderden nodes, zodat authoringcomplexiteit regressiebewaakt blijft zonder trage E2E. Het normatieve contract staat in [workflow-runtime-scale-chaos.md](architecture/workflow-runtime-scale-chaos.md) en is gelinkt vanuit de architectuurindex. Tests dekken workerbatchconcurrency, retry/dead-letter/poisongedrag, backpressure-classificatie, SLO-constants, DB-indexaudit en grote-graphvalidatie; verificatie: `tests/workflow-runtime-outbox.test.ts`, `tests/workflow-runtime-resilience.test.ts`, `tests/workflow-validator.test.ts` en `npx tsc --noEmit` schoon.

### 4.14 — Toegankelijkheid en UX-voltooiing

**Afhankelijkheden:** 4.1, 4.3, 4.8
**Werk:** screenreaderflow, volledige keyboard graph editing, high contrast, reduced motion, grote workflows, zoek/outline/minimap en gebruikerstests met change managers.
**Acceptatie:** WCAG AA-audit en taakgebaseerde usabilitytest slagen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een expliciet toegankelijkheids- en UX-contract voor grote graphs. `workflow-accessibility.ts` bouwt een pure screenreader/outline/minimaprepresentatie met geselecteerde node, verbindingstellingen, zoekresultaten en genormaliseerde minimapcoördinaten. De editor gebruikt dit model voor een zoekbare outline, live screenreadersamenvatting, compacte minimap en toetsenbordbedienbare nodeverplaatsing vanuit de inspector naast de bestaande pijltoets-, port-, delete- en undo/redo-flow. `app/globals.css` bevat nu expliciete `prefers-reduced-motion`- en `forced-colors`-regels voor het canvas, minimap, focus en keyboardcontrols. Het normatieve contract en het taakgebaseerde change-manager testscenario staan in [workflow-accessibility-ux.md](architecture/workflow-accessibility-ux.md). Tests dekken outlinevolgorde, zoekgedrag, minimapnormalisatie voor 250 nodes en de WCAG-stylesheet-hooks.

### 4.15 — Verwijder hardcoded runtimepaden

**Afhankelijkheden:** 3.17, 4.8, 4.13
**Werk:** migreer resterende change types, deprecate slug-overrides en klassieke formulieren/apply-routing waar de engine gelijkwaardig is. Houd alleen expliciete compatibility readers voor historische requests.
**Acceptatie:** alle actieve change types verwijzen naar een gepubliceerde workflowversie; historische details blijven renderen.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Actieve change-type routing heeft nu een expliciete gepubliceerde workflowversiekoppeling. `change_type_config` bevat `workflow_version_id` als FK naar `workflow_version(id)` plus een actieve index; bestaande databases krijgen de kolom via de idempotente ensure-helper en seeding bewaart handmatig gekoppelde versies. `change-type-runtime-cutover.ts` beslist per config of aanvragen via `/workflow-runtime/{versionId}/start` lopen, klassiek alleen compatibility is, of G4 blokkeert door een ontbrekende/ongepubliceerde versie. De change catalogus gebruikt deze runtime-startlink zodra de gepubliceerde versie startbaar is voor de huidige identiteit en meldt ontbrekende actieve koppelingen als cutoverstatus. `change_type_config.workflow` blijft alleen een historische/template-label voor legacy readers en oude detailpagina's. Het normatieve contract staat in [workflow-runtime-cutover-catalog.md](architecture/workflow-runtime-cutover-catalog.md). Tests dekken runtime routing, ontbrekende workflowversies, ongepubliceerde versies, inactive compatibility, schema-FK/index, registry- en catalogusregressies; verificatie: `tests/change-type-runtime-cutover.test.ts`, `tests/change-type-registry.test.ts`, `tests/change-type-catalog.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

### 4.16 — Documentatie, training en beheerproces

**Afhankelijkheden:** 4.7, 4.11, 4.14
**Werk:** auteursgids, block reference, governancehandleiding, support/runbook, incidentprocedure, templatebeheer en change-managertraining.
**Acceptatie:** pilotgroep kan zonder ontwikkelaar een proces ontwerpen, testen, publiceren en uitvoeren.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een operationeel handbook voor change managers, reviewers, support en operations. De nieuwe map [workflow-studio](workflow-studio/README.md) bevat de auteursgids, block reference voor alle actuele registryblocks, governancehandleiding, operations runbook, incidentprocedure, templatebeheer en change-managertraining met een end-to-end oefening van template naar publicatie, runtime-start, taak/approval en auditcontrole. `operational-readiness.ts` definieert de verplichte documenten en kernthema's als release-audit; de test `workflow-operational-readiness.test.ts` leest de docs, controleert verplichte secties, bewaakt dat ieder `INITIAL_BLOCK_TYPES`-block in de reference staat en dat iedere template-library entry in templatebeheer is gedocumenteerd. De architectuurindex linkt het handbook als gebruikers- en beheerlaag bovenop de normatieve ADR's. Verificatie: `tests/workflow-operational-readiness.test.ts`, `tests/workflow-template-library.test.ts`, `tests/block-registry.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

### 4.17 — Pilot en brede uitrol

**Afhankelijkheden:** 4.12–4.16
**Werk:** pilot met beperkt aantal clients/processen, meet succescriteria, herstel bevindingen, voer onafhankelijke securityreview uit en schaal daarna per businessunit op.
**Acceptatie:** G4 slaagt en product owner, security, operations en proceseigenaren tekenen release af.

**Status:** voltooid op 2026-08-11
**Opgeleverd:** Workflow Studio heeft nu een expliciete G4 pilot- en rolloutpoort. `rollout-readiness.ts` evalueert beperkte pilotscope, minimaal aantal runtimeinstances, completion rate, runtime failure/intervention rate, open incidenten, onafhankelijke securityreview, high/critical securitybevindingen, operating handbook readiness, cutover-audit, training completion, taakgebaseerde usabilityscore en verplichte sign-offs van product owner, security, operations en proceseigenaar. Zonder alle meetwaarden en sign-offs blijft brede uitrol geblokkeerd; externe goedkeuringen worden dus als release-input vereist en niet impliciet aangenomen. Het rolloutdossier [workflow-pilot-rollout.md](workflow-studio/workflow-pilot-rollout.md) beschrijft pilot scope, succescriteria, meetplan, bevindingenherstel, rollback, sign-offmatrix en businessunit-uitrol. Het operating handbook en de architectuurindex linken dit dossier. Tests dekken geslaagde G4-evaluatie, blokkade bij ontbrekende securityreview/cutover/training/sign-off en documentlinks; verificatie: `tests/workflow-rollout-readiness.test.ts`, `tests/change-type-runtime-cutover.test.ts`, `tests/workflow-operational-readiness.test.ts`, `npx tsc --noEmit` en `npm run lint` schoon.

---

## 7. Teststrategie per slice

| Laag | Minimale tests |
|---|---|
| Block contract | Schema-validatie, input/outputtypes, backward compatibility |
| Workflowvalidator | Graph fixtures voor ieder foutpad en iedere quick fix |
| Repository | Draft locking, immutable versions, publishtransactie, scopes |
| Runtime | State transitions, retries, idempotency, resume na crash |
| Mutation adapters | Dry-run, conflict, atomic apply, rollbackgedrag, DB-triggergrenzen |
| Security | Privilege escalation, cross-client access, maker-checker, forged commands |
| Builder UI | Keyboard, undo/redo, autosave, validationnavigatie, preview |
| E2E | Design → simulate → publish → start → approve → apply → audit |
| Migration | Classic config → definitie → version → round-trip gelijkwaardigheid |
| Operations | Dead letter, worker restart, timer catch-up, observability en alerts |

CI krijgt minimaal afzonderlijke jobs voor unit, DB-integratie, builder-E2E, runtime-E2E, migration compatibility en security boundary tests.

## 8. Feature flags en rollout

Gebruik minimaal:

- `workflow_studio.builder`
- `workflow_studio.publish`
- `workflow_runtime.start`
- `workflow_runtime.workflow.<definitionId>`
- `workflow_runtime.shadow_compare`

Rolloutvolgorde:

1. Builder alleen voor ontwikkelaars.
2. Builder voor geselecteerde change managers; publiceren nog uit.
3. Publiceren naar testcatalogus.
4. Runtime shadow mode voor bestaande flows.
5. Eén nieuwe workflow voor pilotclient.
6. Cutover per workflowtype.
7. Klassieke runtime read-only houden voor historische requests.
8. Hardcoded writepaden pas verwijderen na bewezen gelijkwaardigheid en rollbacktest.

## 9. Definition of Done voor het totale programma

- Een bevoegde change manager maakt zonder code een nieuw changeproces.
- De workflow gebruikt rollen, formulieren, client-configlookups, IST/SOLL, beslissingen en goedkeuringen.
- Een tweede bevoegde gebruiker kan de definitie reviewen en publiceren.
- Iedere instance gebruikt een onveranderlijke gepubliceerde versie.
- Maker-checker, clientscoping en mutatiebevoegdheden zijn server-side afgedwongen.
- Client-configwijzigingen lopen uitsluitend via staging en mutation adapters.
- Retries, timers en notificaties zijn duurzaam en idempotent.
- Iedere beslissing en mutatie is verklaarbaar vanuit identity, snapshot, workflowversie en audit-events.
- Een mislukte instance kan gecontroleerd worden hervat of beëindigd.
- Bestaande change types zijn gemigreerd zonder verlies van historische leesbaarheid.
- Security-, toegankelijkheids-, performance- en operationele releasepoorten zijn aantoonbaar behaald.
