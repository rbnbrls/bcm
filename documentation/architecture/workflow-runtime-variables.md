# Workflow Studio — variabele- en expressieruntime

**Status:** geïmplementeerd ontwerpcontract  
**Versie:** 1  
**Datum:** 2026-08-11

Dit contract beschrijft hoe runtimewaarden uit node-outputs worden gevalideerd,
opgeslagen en door conditionele edges worden gelezen.

## Getypeerde waarden

De runtime ondersteunt exact de databasetypen `string`, `number`, `boolean`,
`date`, `datetime`, `object`, `array` en `reference`. Waarden moeten JSON-veilig
zijn: geen functies, symbols, bigint, niet-eindige getallen, class-instances of
cyclische objecten. Datums gebruiken `YYYY-MM-DD`; datetimes vereisen ISO 8601
met tijdzone. Een reference bevat alleen `resourceId`, `recordId` en optioneel
een label.

Iedere variabele draagt daarnaast classificatie `public`, `internal`,
`confidential` of `restricted`, revision, idempotency en correlation.

## Scope en herkomst

De fysieke tabel bewaart waarden per workflowinstance en staat per naam precies
één record toe. De logische scopes zijn:

- `instance`: waarde zonder producerende node, bijvoorbeeld latere gevalideerde
  startinput;
- `node_output`: immutable output met `source_node_instance_id` als herkomst.

De statische validator voorkomt meerdere schrijvers voor dezelfde naam. De
runtime weigert daarnaast een tweede write met een andere idempotency key. Een
technische redelivery met dezelfde key leest het bestaande record terug.

## Ontbrekend en null

Een ontbrekende variabele en JSON `null` zijn verschillende toestanden:

- ontbrekend: er bestaat geen record;
- null: er bestaat een getypeerd record met expliciet lege waarde;
- value: er bestaat een record met een waarde van het gedeclareerde type.

`exists` is alleen waar voor een niet-null waarde; `not_exists` is waar voor
ontbrekend én null. Een andere operator op een ontbrekende variabele geeft een
gecontroleerde `missing_variable`-diagnose. Een vergelijking met null matcht
niet impliciet en voert nooit typecoercion uit.

## Veilige expressies

Edgecondities gebruiken uitsluitend de begrensde decision-AST uit
`decision-schema.ts`: vergelijkingen, aanwezigheid, lijstoperators en geneste
AND/OR-groepen. Evaluatie leest een immutable map van vooraf geladen
runtimevariabelen. Er is geen `eval`, Function-constructor, SQL, netwerktoegang
of willekeurige code-executie.

Een fout retourneert stabiele diagnosecontext met issuecode, variabelenaam,
verwacht en werkelijk type, node-instance-ID en edge-ID. De engine werpt deze
diagnose binnen dezelfde transactie waarin de node zou slagen. Daardoor rollen
node-output, statuswijziging en audit-event gezamenlijk terug.

## Routingvolgorde

Bij `succeed_node`:

1. valideert de engine alle outputnamen, typen, classificaties en JSON-waarden;
2. schrijft hij iedere output idempotent met de node-attempt als herkomst;
3. laadt hij de volledige instancevariabelenset;
4. evalueert hij iedere conditie op de gekozen outputpoort;
5. activeert hij alleen edges met `null`-conditie of resultaat `true`.

Controle op exact één toegestane decisionmatch en uitgebreide uitleg-events
volgen in taak 3.8; de evaluatie zelf is vanaf taak 3.3 deterministisch en
typeveilig.
