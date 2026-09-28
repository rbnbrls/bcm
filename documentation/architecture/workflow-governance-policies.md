# Workflow governance policies

Dit document beschrijft de server-side governance policies die als
publicatiepoort gelden voor Workflow Studio.

## Publicatiepoort

`evaluateWorkflowGovernancePolicies` draait na de technische graphvalidatie en
voor `submitForReview` of `publish`. De policies worden niet uit de draft
gelezen en kunnen dus niet door workflowmakers worden uitgezet. Een directe
server-action of API-call loopt door dezelfde servicepoort.

De definitielifecycle blijft hierdoor gescheiden:

1. de validator bewijst dat de graph technisch uitvoerbaar is;
2. governance policies bepalen of de graph enterprise-ready genoeg is om ter
   review of publicatie aangeboden te worden;
3. review en publish blijven revisiegebonden en atomair.

## Policies

De eerste vaste policyset bevat:

- `mutation_approval_required`: iedere `change_request` vereist een upstream
  `approval`.
- `mandatory_four_eyes_required`: starterrollen mogen niet ook de approvalrol
  zijn voor vier-ogencontrole.
- `forbidden_role_combination`: dezelfde workflowrol of identitygroep mag niet
  zowel `workflow:start` als `workflow:approve` krijgen, ook niet via meerdere
  role-bindings.
- `minimum_audit_fields_missing`: approvals moeten commentaar verplichten bij
  afwijzen en terugsturen; mutaties vereisen minimaal één upstream approval met
  verplichte goedkeuringscommentaar.
- `integration_review_required`: niet-sandbox integraties vereisen upstream
  review met verplichte goedkeuringscommentaar en HMAC-signing.

## Uitvoer

Policy-uitvoer is een lijst stabiele issuecodes met pad en bericht. De
definition service vertaalt deze naar dezelfde `validation_failed` servicevorm
als de validator, zodat UI en server actions één publicatieblokkadepad houden.

De issues bevatten geen workflowpayload, secrets, snapshots of runtimegegevens.
Ze verwijzen alleen naar node keys, role binding paden en policycodes.
