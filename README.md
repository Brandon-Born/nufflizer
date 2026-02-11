# Nufflizier

Nufflizier is a Blood Bowl 3 replay luck analyzer. It parses `.xml` and `.bbr` replay files and reports:

1. Who had better dice overall.
2. Category luck breakdowns (block, armor break, injury, dodge, ball handling, argue-call style rolls).
3. Timeline of high-impact swings (both "blessed" and "shaftaroonie" moments).

The app is one-shot and ephemeral: upload -> analyze -> read/download report.

## MVP Interfaces

1. Web UI: `/nufflizier` (and `/upload` alias).
2. API: `POST /api/nufflizier/analyze` (multipart `replay` file).
3. CLI: `pnpm nufflizier analyze <replay_file> --format json|text`

## Tech Stack

1. Next.js (App Router) + TypeScript
2. fast-xml-parser
3. Tailwind CSS
4. Vitest + Playwright

## Local Development

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000/nufflizier](http://localhost:3000/nufflizier).

Checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Demo Replays

Use the included sanitized replay fixtures:

1. `demo-replays/demo1.bbr`
2. `demo-replays/demo2.bbr`
3. `demo-replays/demo3.bbr`
