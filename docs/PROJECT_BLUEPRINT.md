# Project Blueprint: Nufflizier (Web + API + CLI)

## Product Summary
Nufflizier is a replay-driven luck analysis tool for Blood Bowl 3.

Input:
1. Replay XML or BB3 `.bbr` payload.

Output:
1. Team-level luck verdict and score gap.
2. Category contribution breakdown.
3. Key moment timeline for low-probability successes and high-probability failures.
4. Human-readable “why” explanations that non-statistics users can follow.

## Canonical Planning and Handoff Docs
1. `docs/PROJECT_PLAN.md` (current status and backlog)
2. `docs/CONVERSION_LOG.md` (append-only migration log)
3. `docs/IMPLEMENTATION_LOG.md` (append-only execution log)

## Baseline Decisions
1. Deployment target: Vercel.
2. App shape: single Next.js TypeScript application.
3. Analysis approach: deterministic replay-derived probability + weighted scoring.
4. Runtime model: one-shot processing, no required persistence.
5. Backward compatibility: legacy coaching pipeline is currently `legacy-kept`.
6. Explainability priority: transparency of weights and assumptions is required, even for a for-fun tool.

## Current Implementation State (2026-02-11)
1. Primary runtime surface is implemented:
- UI route `/nufflizier` (with `/upload` alias)
- API route `POST /api/nufflizier/analyze`
- CLI `nufflizier analyze`
2. Parser + attribution foundation is production-usable for replay fixtures.
3. Luck analysis domain exists (`src/domain/nufflizer/*`) with normalization, probability, and scoring.
4. Legacy coaching modules still exist and are tested but are not the primary product path.
5. CI-quality checks pass for lint, typecheck, test, build, and e2e smoke.

## Runtime Architecture
```text
Replay file (.xml/.bbr)
  -> src/domain/replay/decodeReplay.ts
  -> src/domain/replay/parseXml.ts
  -> src/domain/replay/extractStructuredTurns.ts + attribution
  -> src/domain/nufflizer/analyzeLuck.ts
      -> constants.ts (weights/mappings)
      -> probability.ts (odds model)
      -> types.ts (report contract)
  -> src/server/services/analyzeNufflizer.ts
  -> API/UI/CLI presentation
```

## Primary Interfaces
1. API
- `POST /api/nufflizier/analyze`
- Request: multipart form with `replay` file.
- Response: `LuckReport` payload (`match`, `verdict`, `teams`, `keyMoments`, `events`).

2. UI
- `/nufflizier`: upload, verdict banner, team cards, category scores, filtered key moments, JSON export.
- `/upload`: alias to same analyzer component.

3. CLI
- `pnpm nufflizier analyze <replay_file> --format json|text`

## Milestone Plan

### M0 - Foundation (Completed)
Deliverables:
1. Next.js + TypeScript + Tailwind scaffold.
2. Build/lint/test pipeline.

Acceptance:
1. `pnpm dev`, `pnpm test`, `pnpm lint`, and `pnpm build` run successfully.

### M1 - Replay Parsing and Attribution (Completed)
Deliverables:
1. XML/BBR decode and parser normalization.
2. Structured event extraction and team/player attribution.
3. Fixture-based replay baseline tests.

Acceptance:
1. Parser handles demo fixtures and malformed input gracefully.

### M2 - Nufflizier MVP Conversion (Completed)
Deliverables:
1. Luck analysis domain and scoring contract.
2. Primary API `/api/nufflizier/analyze`.
3. Primary UI `/nufflizier` and CLI command.
4. Initial Nufflizier unit/api/e2e tests.

Acceptance:
1. End-to-end replay upload to luck report works.
2. CLI and API return aligned report structure.

### M3 - Probability Fidelity Hardening (In Progress)
Deliverables:
1. Increase explicit roll-family probability coverage.
2. Reduce fallback approximations in high-impact categories.
3. Add coverage telemetry for explicit-vs-fallback scoring.

Acceptance:
1. Probability behavior documented and backed by deterministic tests.
2. Report explainability includes coverage confidence indicators.

### M4 - Legacy Surface Resolution (Pending)
Deliverables:
1. Explicit decision for legacy coaching stack (`retain`, `gate`, or `remove`).
2. Deprecation/migration plan if removal is selected.

Acceptance:
1. No ambiguity in product path or docs for follow-up agents.

## Non-Functional Requirements
1. Reliability: malformed/oversized uploads fail safely with user-readable errors.
2. Performance: replay analysis stays within serverless runtime constraints.
3. Explainability: verdict traces back to explicit event-level probabilities/deltas and disclosed category weights.
4. Accessibility of reasoning: report copy should be understandable by users without formal statistics training.
5. Privacy: no silent long-term replay storage.

## Replay Fixture Guidance
1. Use `demo-replays/demo1.bbr`, `demo2.bbr`, `demo3.bbr` for parser and scoring evolution.
2. Keep `docs/REPLAY_INVESTIGATION.md` updated when mapping assumptions change.
3. Preserve anonymization for all replay artifacts.

## Versioning and Change Rules
1. Append migration details to `docs/CONVERSION_LOG.md` for conversion-relevant work.
2. Append execution details to `docs/IMPLEMENTATION_LOG.md` for every coding session.
3. Update `docs/PROJECT_PLAN.md` when backlog priorities or status taxonomy changes.
