# BMad Output Artifacts

Navigation guide for the Financial Tracker project artifacts.

## Artifact Map

```
_bmad-output/
├── README.md                          ← You are here (navigation guide)
│
├── planning-artifacts/                ← Strategic documents (read before coding)
│   ├── architecture.md                ← Technical decisions, system design, data models
│   │                                   Cross-ref: PRD §6.1, implementation-tracker.md §1
│   ├── epics.md                       ← Requirements inventory (47 FRs, 12 NFRs), epic & story list
│   │                                   Cross-ref: Brief MVP scope, sprint-status.yaml
│   ├── ux-design-specification.md     ← UX patterns, design system, shared component architecture
│   │                                   Cross-ref: architecture.md §Frontend, implementation-tracker.md §8
│   ├── update-tracking.md             ← (legacy) Chronological updates → see implementation-tracker.md
│   ├── implementation-delta-report.md ← (legacy) Thematic analysis → see implementation-tracker.md
│   │
│   ├── briefs/brief-*/brief.md        ← Problem statement, product vision, core requirements
│   │                                   Cross-ref: epics.md (scope), sprint-status.yaml (progress)
│   ├── prds/prd-*/prd.md             ← Feature requirements, user stories, acceptance criteria
│   │                                   Cross-ref: architecture.md §6.1 (tech spec), epics.md (stories)
│   └── archive/                       ← Superseded documents kept for history
│       └── implementation-readiness-report-*.md
│
└── implementation-artifacts/          ← Tactical tracking (updated during development)
    ├── sprint-status.yaml             ← ★ CANONICAL source for implementation progress ★
    │                                   Tracks: epic status, story status, completion dates
    ├── implementation-tracker.md      ← Delta analysis + changelog (merged from delta-report + update-tracking)
    │                                   Cross-ref: architecture.md (deltas), sprint-status.yaml (progress)
    └── stories/                       ← Individual story specs (filled by create-story skill)
        ├── 1-1-google-oauth-login.md
        ├── 1-2-household-member-management.md
        ├── 1-3-session-timeout-and-csrf-protection.md
        ├── 2-1-default-category-seeding.md
        ├── 2-2-category-crud-operations.md
        ├── 2-3-subcategory-support.md
        ├── 2-4-merge-duplicate-categories.md
        └── 2-5-import-category-mapping.md
```

## Document Purposes

### Planning Artifacts (Strategic)

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **brief.md** | Problem statement, vision, assumptions | Before starting new epic |
| **prd.md** | Feature requirements, user stories, acceptance criteria | Before writing story specs |
| **architecture.md** | Technical decisions, data models, API contracts | Before implementing features |
| **epics.md** | Epic breakdown, story list, requirements inventory | Sprint planning |
| **ux-design-specification.md** | UX patterns, design system, component architecture | Building UI components |

### Implementation Artifacts (Tactical)

| Document | Purpose | When to Read |
|----------|---------|--------------|
| **sprint-status.yaml** ★ | **Canonical implementation progress** | Any status check |
| **implementation-tracker.md** | Delta analysis, changelog, documentation gaps | Syncing docs with code |
| **stories/*.md** | Individual story specs with acceptance criteria | Before implementing a story |

## Cross-Reference Matrix

| Question | Primary Source | Secondary Sources |
|----------|---------------|-------------------|
| What's the implementation progress? | `sprint-status.yaml` | — |
| What features are planned? | `prd.md` §5 (User Stories) | `epics.md` |
| How should this be built? | `architecture.md` | `ux-design-specification.md` |
| What changed during implementation? | `implementation-tracker.md` | `sprint-status.yaml` story notes |
| What's the UX for this feature? | `ux-design-specification.md` | `prd.md` acceptance criteria |
| What are the data models? | `architecture.md` Step 5 | `implementation-tracker.md` §1 |
| What stories are in this epic? | `epics.md` | `sprint-status.yaml` |

## Conventions

- **sprint-status.yaml is the single source of truth** for implementation progress. All other documents cross-reference it rather than duplicating status.
- **Legacy files:** `update-tracking.md` and `implementation-delta-report.md` are superseded by `implementation-tracker.md`. Kept temporarily for reference.
- **Archive:** Superseded validation reports move to `planning-artifacts/archive/` with an archival note.
