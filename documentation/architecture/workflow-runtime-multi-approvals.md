# Workflow Runtime multi-approvals

Phase 4 adds grouped approval policies on top of the existing approval task
runtime. A normal approval node remains a single maker-checker task. When
multiple approval nodes share `approvalGroupId`, the runtime evaluates them as
one deterministic policy.

## Policy Fields

Approval blocks support these additional fields:

- `approvalGroupId`: stable group id that links approval nodes.
- `approvalMode`: `sequential`, `all_of`, `any_of` or `quorum`.
- `quorum`: required only for `quorum` mode.
- `uniqueApprovers`: blocks the same user from deciding twice in the group.
- `roleCombination`: `distinct_roles` or `allow_repeated_roles`.
- `escalationHours`: positive escalation window captured in the policy.

The graph still models the process shape explicitly. Sequential approvals are
chained with normal edges. Parallel all-of, any-of and quorum approvals can be
combined with the phase 4 parallel gateways.

## Decision Evaluation

The evaluator is pure and stable:

- votes are ordered by `occurredAt`, `nodeKey` and `taskId`;
- only the first vote per participant node counts;
- `returned` dominates the group status;
- `all_of` and `sequential` require every participant to approve;
- `any_of` approves on the first approval;
- `quorum` approves when approved votes reach the configured quorum.

If `uniqueApprovers` is true, duplicate approvers make the policy invalid. If
`roleCombination` is `distinct_roles`, repeated workflow roles make the policy
invalid. The validator catches invalid group configuration before publication;
the runtime also checks the policy before completing an approval task.

## Audit

Every approval decision still writes `workflow.approval.decided`. Grouped
approvals additionally write `workflow.approval.policy_evaluated` with:

- group id, mode and required count;
- participant, decided, approved, rejected and returned counts;
- pending node keys;
- blocking reasons;
- normalized votes with node key, task id, workflow role, actor and decision.

The audit payload deliberately excludes comments; comments stay on the task
completion record and single decision output.
