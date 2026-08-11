# Workflow runtime recovery

Dit document beschrijft het contract voor foutcompensatie en handmatig herstel in
de Workflow Studio runtime.

## Herstelacties

`WorkflowRuntimeRecoveryService` is de enige publieke herstelpoort bovenop de
state machine. De service voert eerst server-side autorisatie uit met
`workflow:manage` en toetst daarna de tenant, businessunit en clientscope van de
workflowinstance.

Ondersteunde acties:

- `manual_retry`: plant een nieuwe poging vanaf een node met status `failed` of
  `needs_intervention`. De oude poging blijft historisch zichtbaar; de nieuwe
  poging krijgt een nieuw `nodeInstanceId`.
- `skip_node`: slaat uitsluitend een `ready` node over met een bevoegd besluit en
  incidentnotitie.
- `terminate_instance`: beëindigt een instance met status `pending`, `running`,
  `waiting` of `needs_intervention`.
- `compensate_node`: registreert een compensatiebesluit voor blocktypes met een
  allowlisted handler.

Alle acties schrijven naast de bestaande runtime-events een
`workflow.recovery.action_recorded` event met actor, incidentnotitie,
correlatie-ID en causation-ID.

## Compensation handlers

Compensatie is opt-in per veilig blocktype. De runtime voert geen vrije code uit
en accepteert geen handler-ID uit gebruikersinput. De handler wordt afgeleid uit
een interne allowlist:

| Blocktype | Handler |
|---|---|
| `integration` | `workflow.integration.compensate.v1` |
| `notification` | `workflow.notification.compensate.v1` |
| `change_request` | `workflow.change_request.compensate.v1` |

Voor alle andere blocktypes retourneert de service `not_recoverable`.

## Idempotentie en audit

Runtime-mutaties gebruiken het command-ID als idempotency key. Het recovery audit
event gebruikt hetzelfde command-ID met het suffix `:recovery-event`, zodat een
herhaalde aanvraag geen dubbele auditregel maakt.

Een herstelactie is pas succesvol wanneer zowel de state-machine transitie als
het recovery audit event zijn verwerkt of wanneer het audit event aantoonbaar al
bestond. Hierdoor blijven herstelacties bevoegd, idempotent en zichtbaar in de
runtime audit trail.
