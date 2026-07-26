# Phase 5: Redesign Startpage & Menu — Context

**Gathered:** 2026-07-26
**Status:** Ready for UI design
**Mode:** User-provided requirements

<domain>
## Phase Boundary

Redesign the frontpage and menu structure. The homepage should be organized as a workflow-driven dashboard for the "change manager" user persona, presenting all tool features grouped by customer journey categories in chronological order (pension fund client lifecycle).

</domain>

<decisions>
## Design Decisions

- **Target user:** Change manager (internal user managing benchmark switches for pension fund clients)
- **IA principle:** Customer journey of the pension fund client → chronological flow
- **Homepage structure:** Feature categories → user picks goal → shows relevant next steps
- **Menu:** Updated to match new information architecture
- **Scope includes:** Homepage redesign, menu/navigation restructure, feature discovery
- **Scope excludes:** Backend changes, new feature development (only reorganization)
</decisions>

<code_context>
## Existing Code Insights

- Current homepage (`app/page.tsx`) is a static marketing-style landing page with hero section, stat cards, change type catalog, and recent changes
- Navigation in `app/layout.tsx` with links: Changes, Nieuwe change, Benchmark catalogus, Beheer, Wijzigingshistorie, Rapportages
- Existing pages: `/changes`, `/changes/new`, `/changes/[id]`, `/benchmarks`, `/benchmark-aanvraag`, `/verwerkt`, `/updates`, `/admin/*`, `/reports/*`, `/changes/history`
- Design system uses CSS custom properties, `.page-shell`, `.button`, `.card` patterns
</code_context>

<specifics>
## Specific Requirements

1. Homepage should show feature categories grouped by customer journey stage
2. Categories should be in chronological order matching the pension fund client lifecycle
3. User selects "what they want to achieve" → system shows relevant next steps
4. All existing features should be discoverable from the homepage
5. Menu should reflect the new information architecture
6. Keep existing functionality — this is a reorganization/redesign only
</specifics>
