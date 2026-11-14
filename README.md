# Nufflizier

Nufflizier is a Blood Bowl 3 replay analyzer under remediation. Its product goals are:

1. Who had better dice overall.
2. Category luck breakdowns (block, armor break, injury, dodge, ball handling, argue-call style rolls).
3. Timeline of high-impact swings (both "blessed" and "shaftaroonie" moments).
4. Transparent, plain-language reasoning so users without statistics training can understand why a verdict was produced.

The app is one-shot and ephemeral: upload -> analyze -> read/download report.

## Current Status and Agent Backlog

The November 2026 remediation adds bounded ingestion, terminating workers, patched dependencies, versioned partial reports, and full-evidence filters. Reports currently abstain from whole-match comparisons. Supported dice contributions include numeric movement and ball handling, source-qualified categorical block and initial-injury tables, verified armor and scoped recovery from the affected team’s side. Raw block symbols, choices and observed consequences remain visible when their luck cannot be qualified. Some Dodge and Pickup events show separate partial context components or ranges. Broader effective-skill and damage policies, referee outcomes, valid tactical successors, calibration and whole-match comparisons still need evidence. Passing the suite does not establish unverified game-rule mappings.

Start remediation with [PROJECT_PLAN.md](docs/PROJECT_PLAN.md) and [REMEDIATION_BACKLOG.md](docs/REMEDIATION_BACKLOG.md). The backlog preserves the 28 original permanent issue IDs and adds NUF-029–034 follow-ups, with source locations, reproduction evidence, dependencies, and acceptance criteria. The operating guide is [AGENTS.md](AGENTS.md).

## MVP Interfaces

1. Web UI: `/nufflizier` (and `/upload` alias).
2. API: `POST /api/nufflizier/analyze` (multipart `replay` file).
3. CLI: `pnpm nufflizier analyze <replay_file> --format json|text`

## Legacy API Status

`POST /api/replay` is deprecated and kept only for temporary compatibility.

1. Successor endpoint: `POST /api/nufflizier/analyze`
2. Runtime gate env vars:
- `NUFFLIZIER_LEGACY_REPLAY_API_MODE=enabled|disabled` (default: `disabled`; missing/invalid values also disable)
- `NUFFLIZIER_LEGACY_REPLAY_API_SUNSET=2026-04-30T00:00:00Z` (default shown)
3. The past sunset is an announced retirement date, not a promise that compatibility remains enabled. Disabled requests return HTTP 410 with the replacement endpoint. Explicit opt-in uses the hardened upload/worker boundary.
4. Deprecated responses include `Deprecation`, `Sunset`, and `Link` headers.

## Tech Stack

1. Next.js (App Router) + TypeScript
2. fast-xml-parser
3. Tailwind CSS
4. Vitest + Playwright

Requires Node.js 22.x and pnpm 9.0.0. HTTP and CLI accept files up to 4,000,000 bytes. See [ingestion and deployment limits](docs/INGESTION_SAFETY.md) for the resource contract and deployment blockers.

## Local Development

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Open [http://localhost:3000/nufflizier](http://localhost:3000/nufflizier).

Checks:

```bash
corepack pnpm verify

# Or individually:
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:quota
corepack pnpm build
corepack pnpm test:e2e
```

`test:e2e` prepares the worker and rebuilds the production app before starting the browser server. `verify` runs lint, typecheck, unit tests, the Redis integration, that build, and browser tests sequentially; no prior `.next` build is reused as proof of current source behavior.

Redis 7 and its CLI are required on PATH for the isolated quota integration. The app can run locally without Redis. See the ingestion contract for the production setup.

## Demo Replays

Use the included sanitized replay fixtures:

1. `demo-replays/demo1.bbr`
2. `demo-replays/demo2.bbr`
3. `demo-replays/demo3.bbr`
