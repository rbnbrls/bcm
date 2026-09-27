# Workflow Studio accessibility and UX completion

Workflow Studio authoring must remain usable for change managers who do not use
drag-and-drop, prefer reduced motion, need high contrast, or work in large
workflow definitions.

## Contract

- Every graph mutation exposed through drag-and-drop also has a keyboard path:
  add blocks from the palette, select blocks through the outline/search, move
  the selected block with arrow-key controls, connect blocks through port
  buttons, remove blocks/edges through named buttons, and undo/redo from the
  toolbar.
- The editor publishes a polite screenreader summary with block count, edge
  count, selected block and active search result count.
- The outline is the primary navigation structure for screenreaders and large
  workflows. It is sorted by visual position and includes incoming/outgoing
  connection counts.
- Search matches label, node key and block type. Filtering the outline must not
  hide the full minimap, so users keep context while narrowing the task.
- The minimap is a compact overview with normalized coordinates and selected
  node state. It is non-authoritative: the canvas and outline remain the editing
  sources of truth.
- The stylesheet includes explicit `prefers-reduced-motion` and
  `forced-colors` handling. Focus indicators remain visible in normal and forced
  color modes.

## Verification

Automated coverage lives in `tests/workflow-accessibility.test.ts`:

- outline order, connection counts and selected node announcement;
- label/node-key/block-type search behavior;
- minimap normalization for 250-node workflows;
- stylesheet hooks for focus, high contrast, reduced motion, minimap and
  keyboard movement controls.

Before broad rollout, the acceptance gate remains a task-based usability test
with change managers: create or edit a draft, find a block in a large workflow,
move it without a pointer device, connect it, resolve validation feedback, and
submit the draft for review.
