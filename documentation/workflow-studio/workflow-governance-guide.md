# Workflow Studio Governance Guide

Governance policies beschermen maker-checker, auditbaarheid en mutatieveiligheid.
Ze draaien server-side bij review en publicatie en zijn niet door workflowmakers
uit te schakelen.

## Baselines

- Vier-ogen: de starterrol mag niet dezelfde effectieve identitygroep zijn als
  de approvalrol voor mutaties.
- Segregation: een role binding mag niet tegelijk `workflow:start` en
  `workflow:approve` combineren.
- Audit: afwijzen en terugsturen vereisen commentaar; mutaties vereisen
  rationale en ingangsdatum.
- Integraties: niet-sandboxed calls zijn verboden; externe calls vereisen
  review, signing en secret references.
- Scope: tenant, business unit en client IDs moeten binnen de identity-scope
  vallen.

## Reviewproces

1. Maker ontwerpt en simuleert de draft.
2. Maker dient de draft in voor review.
3. Reviewer controleert policy issues, diff, role bindings en mutatiepad.
4. Reviewer keurt goed of wijst terug met concrete bevindingen.
5. Alleen goedgekeurde drafts worden gepubliceerd.

## Uitzonderingen

Een policy-uitzondering is alleen toegestaan via een nieuwe governance policy of
een aangepaste blockconfiguratie. Geen enkele uitzondering wordt in de UI of in
een draftveld als vrije tekst geaccepteerd. Registreer het besluit in de
release-notes en verwijs naar de audit trail.
