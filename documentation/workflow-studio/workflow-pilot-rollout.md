# Workflow Studio Pilot and Rollout

Dit dossier beschrijft hoe Workflow Studio van beperkte pilot naar brede
businessunit-uitrol gaat. Het is de G4-releasepoort bovenop security,
governance, observability, toegankelijkheid en het operating handbook.

## Pilot scope

- 1 tot 3 pilotclients.
- 1 tot 3 processen.
- Minimaal 5 gestarte runtime instances.
- Alleen gepubliceerde workflowversies met actieve `workflow_version_id`
  cutoverkoppeling.
- Klassieke detailreaders blijven read-only beschikbaar voor historische
  requests.

## Succescriteria

- Completion rate minimaal 90%.
- Runtime failure plus needs-intervention rate maximaal 5%.
- Geen open kritieke incidenten.
- Geen open high/critical securitybevindingen.
- Onafhankelijke securityreview afgerond.
- Operating handbook readiness groen.
- Cutover-audit groen voor actieve change types.
- Alle pilotgebruikers hebben training afgerond.
- Taakgebaseerde usabilitytest minimaal 90% geslaagd.

## Meetplan

Meet per pilotproces:

| Metric | Bron | Drempel |
|---|---|---:|
| Gestarte instances | Runtime dashboard | >= 5 totaal |
| Voltooide instances | Runtime analytics | >= 90% |
| Failed/needs intervention | Runtime cutover health | <= 5% |
| Outbox dead letters | Runtime dashboard | 0 |
| Open critical incidents | Incidentregister | 0 |
| Open high/critical findings | Securityreview | 0 |
| Training completion | Trainingsrooster | 100% |
| Usability task pass rate | Change-managertraining | >= 90% |

## Bevindingen herstellen

1. Classificeer bevinding als procesontwerp, runtime, security, operations,
   training of data.
2. Koppel eigenaar en deadline.
3. Los high/critical securitybevindingen voor rollout op.
4. Herhaal de relevante simulatie, runtime test of usabilitytaak.
5. Documenteer het herstel in het pilotlog.

## Rollback

Rollback voor nieuwe aanvragen gebeurt via runtime cutoverflags of door de
change-type `workflow_version_id` tijdelijk niet als startbaar te behandelen.
Bestaande runtimeinstances blijven via dashboard/detail en recovery beheersbaar.
Gebruik klassieke apply/writepaden alleen wanneer het incident runbook dat
expliciet toestaat.

## Sign-off

Brede uitrol vereist expliciete sign-off van:

- Product owner.
- Security.
- Operations.
- Proceseigenaren van de pilotprocessen.

Iedere sign-off bevat naam, rol, datum, scope, resterende risico's en verwijzing
naar het pilotlog. Zonder alle sign-offs blijft de status `blocked`.

## Businessunit-uitrol

Rol per businessunit uit:

1. Activeer builder en training voor change managers.
2. Publiceer of koppel alleen gevalideerde workflowversies.
3. Zet runtime cutover per workflowtype aan.
4. Monitor eerste instances dagelijks.
5. Sluit klassieke actieve routes pas wanneer historische readers voldoende zijn.
