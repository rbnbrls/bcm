# Workflow Runtime parallel gateways

Phase 4 introduces explicit parallel control blocks:

- `parallel_split`
- `parallel_join`

The runtime still avoids general BPMN semantics. Parallelism is limited to
acyclic fan-out/fan-in sections that the validator can prove safe.

## Split

`parallel_split` has one incoming flow and one multi-connection outgoing flow.
When executed, it succeeds like an automated control node and activates every
outgoing branch for the selected `out` port. Branch activation is still
idempotent per edge.

## Join

`parallel_join` has a multi-connection incoming flow and one outgoing flow. The
join supports three modes:

- `and`: every incoming predecessor must have a succeeded node-attempt.
- `or`: at least one incoming predecessor must have succeeded.
- `quorum`: at least `quorum` incoming predecessors must have succeeded.

Multiple branches may try to activate the same join. The runtime uses a stable
instance/node idempotency key for join activation, so only one join attempt is
created. If the join condition is not satisfied, the attempt is set to
`waiting`; later branch completion re-evaluates the same join and moves it back
to `ready` exactly once the condition is satisfied. This prevents duplicate
successor activation.

Failed, skipped or cancelled branches count as terminal for observability but
not as successful quorum members. If an AND/quorum join cannot be satisfied, the
instance remains reconstructable through runtime detail and operations can retry,
cancel or intervene according to the normal runtime controls.

## Validator Rules

The validator blocks unsafe parallel graphs:

- a split needs at least two outgoing branches;
- a join needs at least two incoming branches;
- quorum cannot exceed the number of incoming branches;
- every branch from a split must converge on the same first reachable join;
- ambiguous split-to-multiple-join convergence is rejected.

Cycles remain forbidden. Parallel gateways therefore unlock fan-out/fan-in, not
loops.
