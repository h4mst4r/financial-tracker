---
failed_layers: '' # set at runtime: comma-separated list of layers that failed or returned empty
---

# Step 2: Review

## RULES

- YOU MUST ALWAYS SPEAK OUTPUT in your Agent communication style with the config `{communication_language}`
- **NEVER spawn subagents, parallel agents, or background tasks for this review. Do NOT use the Agent/Task tool. Do NOT generate prompt files for the user to run elsewhere.** This project runs the review layers **INLINE**, in this same session, performed by you — full stop (the established convention; see the 5f-1/2/3 "3 layers inline" records). Spawning agents is a hard violation.
- Run the three layers as **three distinct, sequential analytical passes you perform yourself**, each with its own deliberately-scoped mindset. Switching scope between passes is a discipline you self-enforce — it is NOT a reason to delegate to a separate agent.

## INSTRUCTIONS

1. If `{review_mode}` = `"no-spec"`, note to the user: "Acceptance Auditor skipped — no spec file provided."

2. Perform each layer **inline yourself**, in order. Keep the passes mentally separate — do not let one pass's knowledge soften another's.

   - **Pass 1 — Blind Hunter.** Judge `{diff_output}` on its own merits ONLY. Deliberately ignore the spec and the wider codebase; hunt for self-evident correctness defects visible in the diff alone (wrong mappings, broken refactors, unsafe casts, null/undefined access, lost props, list keys, type holes). No style nits, no praise.

   - **Pass 2 — Edge Case Hunter.** Now use `{diff_output}` **plus** read access to the project. Walk every branch and boundary the diff touches — unhandled `undefined`/`null` from lookups, keys absent from a map, throws at module-load, lost guards, off-by-one. Read the specific project files needed to confirm each probe; report only genuinely unhandled cases, citing the file you checked.

   - **Pass 3 — Acceptance Auditor** (only if `{review_mode}` = `"full"`). Read the file at `{spec_file}` and any loaded context docs, then audit `{diff_output}` against them: violated acceptance criteria, deviations from spec intent, specified-but-missing behavior, contradictions between spec constraints and the code. For each finding: one-line title, which AC/constraint it violates, evidence from the diff.

3. If a pass legitimately yields no findings, record it as clean (append the layer name to `{failed_layers}` only if you could not perform it at all — not merely because it found nothing).

4. Collect all findings from the three inline passes.


## NEXT

Read fully and follow `./step-03-triage.md`
