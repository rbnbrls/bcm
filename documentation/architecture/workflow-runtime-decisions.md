# Workflow Runtime Decisions

Decision nodes are automated runtime steps. The worker must first claim the
ready node so the node is in `running` state, then call the decision handler
with a fresh command id.

The handler reloads the pinned workflow version and validates the persisted
decision configuration before evaluating it. Evaluation uses the shared
decision AST and persisted runtime variables only; no dynamic code, SQL, or
network access is allowed.

The evaluation result selects exactly one output port:

- `matched` when the rule evaluates to true.
- `otherwise` when the rule evaluates to false.

The selected port must have exactly one outgoing edge. Zero outgoing edges stop
with `decision_route_not_found`; multiple outgoing edges stop with
`decision_route_ambiguous`. In both cases node state, successor activation and
audit events roll back together.

Successful execution persists the normal node success event, activates the
single selected successor and appends `workflow.decision.evaluated` with:

- node key and label
- matched boolean and selected output port
- typed input values used by the expression
- human-readable explanation
- chosen edge id
- activated workflow node ids

This makes runtime routing reconstructable from audit without querying mutable
live data.
