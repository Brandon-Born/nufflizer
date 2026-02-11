# Nufflizier Agent Guide

This file is the canonical operating guide for coding agents working in this repository.

## 1) Project Goal
Build and maintain **Nufflizier**, a Blood Bowl 3 replay luck analyzer that accepts replay `.xml` / `.bbr` input and returns:
1. Team-level luck verdict (who was luckier overall).
2. Category breakdown (block, armor break, injury, dodge, ball handling, argue-call style events).
3. Key timeline moments for unlikely successes and likely failures.

The app is deployable on Vercel and intentionally one-shot (ephemeral results, no required persistence).

## 2) Handoff Docs (Read First)
1. `docs/PROJECT_PLAN.md` - current state, conversion matrix, prioritized backlog, next tasks.
2. `docs/CONVERSION_LOG.md` - append-only migration history from BB Trainer to Nufflizier.
3. `docs/IMPLEMENTATION_LOG.md` - append-only session execution ledger.

## 3) Current Runtime Shape (as of 2026-02-11)
1. Primary UI: `/nufflizier` (with `/upload` alias).
2. Primary API: `POST /api/nufflizier/analyze`.
3. CLI: `pnpm nufflizier analyze <replay_file> --format json|text`.
4. Legacy coaching stack remains in tree as `legacy-kept` (`/api/replay`, `src/domain/analysis/*`, `src/domain/coaching/*`, `src/server/services/analyzeReplay.ts`).

## 4) Required Tech Stack
Use the following unless explicitly changed by the user:
1. Next.js (App Router) + TypeScript.
2. Node.js 20+ runtime behavior.
3. React + Tailwind CSS.
4. Zod for boundary validation.
5. `fast-xml-parser` for replay parsing.
6. Vitest (unit) + Playwright (e2e smoke).
7. ESLint + Prettier.
8. pnpm package management.

## 5) Architecture Boundaries
1. `src/domain/replay` - replay decoding/parsing, mappings, attribution.
2. `src/domain/nufflizer` - luck event normalization, probability logic, scoring, verdict model.
3. `src/server/services/analyzeNufflizer.ts` - orchestration from replay input to luck report.
4. `src/app/api/nufflizier/analyze/route.ts` - upload boundary, validation, rate limiting, HTTP contract.
5. `src/app/nufflizier/*` - report UI and user interactions.
6. `src/cli/nufflizier.ts` + `bin/nufflizier` - CLI contract.
7. `src/domain/analysis/*` and `src/domain/coaching/*` - legacy-kept components, not the primary product pipeline.

## 6) Build and Run Standards
1. Keep domain logic pure and framework-agnostic under `src/domain/*`.
2. Keep route handlers thin; orchestration belongs in `src/server/services/*`.
3. Validate all external inputs (uploads/API params).
4. Treat replay input as untrusted and guard malformed/oversized payloads.
5. Add/adjust fixture-based tests for parser/probability/scoring changes.
6. Keep scoring behavior explainable; avoid opaque magic constants without docs.
7. Prefer deterministic logic over black-box heuristics when replay data supports exactness.
8. Update handoff docs in the same change set whenever milestone state changes.

## 7) Expected Local Commands
1. `pnpm install`
2. `pnpm dev`
3. `pnpm lint`
4. `pnpm typecheck`
5. `pnpm test`
6. `pnpm build`
7. `pnpm test:e2e`

Agents should run lint + typecheck + tests + build before declaring significant work complete.

## 8) Definition of Done (Per Feature)
1. Type-safe implementation aligned with architecture boundaries.
2. Tests cover changed parser/probability/scoring behavior and relevant UI/API states.
3. No lint/typecheck/build failures.
4. Handoff docs updated:
- append entry in `docs/CONVERSION_LOG.md` (migration impact)
- append entry in `docs/IMPLEMENTATION_LOG.md` (session execution)
- update backlog/status in `docs/PROJECT_PLAN.md` when applicable

## 9) Out of Scope (Unless User Requests)
1. Live process hooking or active-match automation.
2. Bot play for online matches.
3. Opaque scoring pipelines without replay-evidence traceability.

## 10) Replay Fixtures
1. Sanitized demo fixtures are in `demo-replays/`.
2. Use fixtures to evolve parser/probability coverage safely.
3. Maintain anonymization and avoid introducing sensitive identifiers in committed replay artifacts.
