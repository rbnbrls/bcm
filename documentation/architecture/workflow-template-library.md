# Workflow Template Library

Phase 4 adds a curated template and fragment library on top of the existing
draft lifecycle. Library entries are immutable versioned references; creating a
workflow from an entry produces an independent draft while preserving source
metadata.

## Entry Metadata

Each library entry contains:

- id and version;
- kind: `template` or `fragment`;
- title and description;
- owner user id;
- tags;
- sample data;
- rating score and count;
- source reference;
- curation status.

The first curated set wraps the existing built-in workflow templates and adds a
reusable risk approval fragment.

## Instantiation

`instantiateWorkflowTemplateLibraryEntry` returns a draft plus explicit source
metadata. The draft can be edited and published independently. Its tags and
catalog description include stable library origin markers such as:

```text
library:risk_gate_fragment.v2
library-version:2
```

That keeps the relationship visible without coupling the new draft to mutable
library state.

## Upgrade Flow

`findWorkflowTemplateUpgradeCandidates` compares entries with the same source
reference and higher version. Studio can use this to offer an upgrade path while
keeping the current draft untouched until the maker chooses to clone or merge
the newer library version.
