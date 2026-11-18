# Nufflizier

Nufflizier analyzes one Blood Bowl 3 replay at a time. Upload a replay to inspect supported dice odds, category contributions and key moments, then download the evidence as JSON. Reports show partial analysis when evidence is missing and currently abstain from a whole-match verdict.

See [current capabilities](docs/CURRENT_CAPABILITIES.md) for the supported policies and their evidence. The [project plan](docs/PROJECT_PLAN.md), [remediation ledger](docs/REMEDIATION_BACKLOG.md) and [secondary backlog](docs/FOLLOW_UP_BACKLOG.md) track remaining work. The operating guide is [AGENTS.md](AGENTS.md).

## MVP Interfaces

1. Web UI: `/nufflizier` (and `/upload` alias).
2. API: `POST /api/nufflizier/analyze` (multipart `replay` file).
3. CLI: `pnpm nufflizier analyze <replay_file> --format json|text`

The primary API returns HTTP 422 with `UNSUPPORTED_REPLAY_VERSION` for an explicitly unsupported replay version. Malformed replay input returns HTTP 400 with `INVALID_REPLAY`. The CLI uses the same codes on stderr.

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
