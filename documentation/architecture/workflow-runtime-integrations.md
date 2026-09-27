# Workflow Runtime integrations

Phase 4 adds a managed `integration` block for external connector calls. The
block does not accept arbitrary URLs and does not expose secret values to
workflow authors.

## Connector Contract

Integration blocks reference an allowlisted `connectorId`:

- `servicenow.create_ticket.v1`
- `slack.post_message.v1`
- `teams.post_message.v1`

The configuration pins connector version, operation, input/output schema
versions, input variables, optional output variable, timeout, retry policy,
signing mode and sandbox mode. Configuration is strict; fields such as
`endpointUrl` or `secretValue` are rejected by the block contract.

## Secrets

Secrets are represented only as references:

```text
secret:slack.bot_token
```

The workflow definition and runtime outbox payload never contain secret values.
Connector workers resolve references outside Workflow Studio according to their
own secret-store permissions.

## Runtime

`executeIntegration` validates the pinned node configuration, resolves declared
input variables, and enqueues an `integration` outbox message. The engine does
not call the external service inline. The outbox payload includes connector
metadata, schema versions, input values, secret references, timeout, retry
policy, signing policy, sandbox flag and idempotency metadata.

The node then succeeds and can write a local output variable with queued
delivery metadata. Actual connector response handling belongs to the connector
worker and later compensation/recovery slices.

## Audit

Every queued integration writes `workflow.integration.queued` with connector id,
operation, timeout, retry attempts, signing mode, sandbox mode, input variable
names and secret reference names. Secret reference values are never expanded in
audit.
