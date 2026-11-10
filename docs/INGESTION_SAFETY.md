# Ingestion and execution contract

Updated 2026-11-10. Owning IDs: NUF-002–007, 023–026. Local safeguards and the shared Redis gate are implemented. Both real Redis integration and the isolated hosted Preview verify the shared quota. See the implementation log for measurements and the Preview store's lifetime.

## Shared bounds

HTTP reads at most 4,100,000 bytes, including multipart overhead, before parsing the form. Exactly one `replay` file, no extra fields/files, is accepted. HTTP and CLI files are limited to 4,000,000 bytes. The CLI reads a bounded regular file using an open descriptor. The decoder bounds compressed bytes to 4,000,000 and expanded XML to 15 MiB **during** zlib inflation. Direct XML domain/service input is limited to 15 MiB; the HTTP/CLI transfer cap is deliberately smaller. The legacy compatibility opt-in uses the same reader and worker.

Both XML parsers reject DTD/entity declarations before parsing and disable custom entity processing. Safe built-in/numeric text references are preserved. XML is bounded to depth 64 and 750,000 element nodes, decoded messages to 512 KiB each and 24 MiB total, and extracted source records to 50,000. Limits are in `src/domain/replay/limits.ts`. A quote-aware lexical preflight enforces depth before recursive tree work; XML validation rejects malformed syntax.

Supported envelope elements are `Replay` and `MatchReplay`; two distinct explicit team IDs are required. Version `1-4-0-0` is the captured structured format. Unversioned legacy/synthetic envelopes are recognizable but cannot establish semantic completeness. Other declared versions are rejected pending supported fixtures. Malformed base64/XML and malformed numeric `ResultRoll` contracts reject the file; valid but unverified rules remain visible as excluded evidence. A missing die type is not D6 type zero. No die size is inferred from an observed face. Numeric odds and observed results use the same sum/any-die contract, with contradictions excluded. These arithmetic contracts do not establish BB3 rule mappings or natural-roll rules.

## Execution

Primary HTTP, legacy opt-in and CLI execute analysis in a dedicated Node worker with a 4-second deadline and 256 MiB V8 old-generation limit. An upload has a 10-second read deadline. The parent remains responsive, terminates and awaits worker cleanup on timeout or cancellation, and limits active analysis workers to two per process. Input/work bounds still protect direct synchronous domain/service calls; only worker entry points provide preemptive wall-clock cancellation. Worker limits constrain V8 allocations, not the entire process RSS. Node/zlib buffers and host/runtime overhead require additional memory.

HTTP report serialization now runs inside the same worker deadline and enforces its byte cap before copying a result to the API thread. Heap exhaustion returns a typed resource-limit response. The browser also bounds response/error-body reads and validates the versioned report before rendering/export; see [REPORT_CONTRACT.md](REPORT_CONTRACT.md).

`prepare:analyzer` uses esbuild to bundle the shared services into `.generated/analysis-worker.cjs`. Dev, build, tests and CLI prepare it automatically. Next.js output tracing explicitly includes that bundle. Production-build browser tests exercise the packaged worker; this does not prove Vercel deployment compatibility.

## HTTP and CLI outcomes

- HTTP 400 `INVALID_REPLAY`: invalid root, missing/duplicate teams, unsupported version, malformed nested encoding/XML or roll fields. No verdict is produced.
- HTTP 400 `INVALID_UPLOAD`: invalid multipart/file shape or unsupported extension; 413 for byte limits, 408 for upload timeout, 499 for cancellation.
- HTTP 504 `TIMEOUT` / 499 `CANCELLED`: terminated analysis, no fabricated report. HTTP 503 `BUSY` bounds concurrency.
- HTTP 413 `REPORT_TOO_LARGE`: serialized JSON exceeds 4,000,000 bytes; use a smaller file or CLI.
- HTTP 429 RATE_LIMIT includes the shared quota window remaining in Retry-After. An unavailable required backend returns 503 QUOTA_UNAVAILABLE before body reading.
- CLI input/execution failures print a descriptive error to stderr and exit nonzero. JSON reports include schema `2.0`, model `dice-only-7`, limitations and explicit verdict status. Unknown odds/results are null, not invented zeros/failures. Weighted numeric contributions are additive dice units; no calibrated probability claim is made.

## Dependency and deployment evidence

The original production audit had 44 advisories (4 critical, 20 high, 16 moderate, 4 low). Installed patches: Next.js 15.5.29, fast-xml-parser 5.12.0, Zod 4.6.7, React 19.3.1, refreshed transitive packages and a PostCSS 8.5.32 override for the framework's pinned older copy. The refreshed production audit reports zero advisories. Next.js 14 is outside supported LTS; this app does not use the request-time APIs that changed to async in 15. React/types, lint config, build and browser validation accompany the upgrade. The override is API-compatible PostCSS 8; keep it only while needed by the framework dependency.

Primary references checked during remediation:

- [Next.js support policy](https://nextjs.org/support-policy), [14→15 migration](https://nextjs.org/docs/app/guides/upgrading/version-15).
- [Parser advisory inventory](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories), including [repeated DOCTYPE bypass](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-8r6m-32jq-jx6q).
- [Vercel limits](https://vercel.com/docs/functions/limitations): 4.5 MB request/nonstreamed-response caps. The smaller application limits reserve multipart/error headroom. Browser errors also handle platform-generated non-JSON 413/504 responses.

## Shared quota and preview deployment

The production Vercel environment requires a shared gate. Set server-only NUFFLIZIER_QUOTA_REDIS_REST_URL and NUFFLIZIER_QUOTA_REDIS_REST_TOKEN to an HTTPS Redis REST endpoint supporting JSON-array commands and Lua EVAL. NUFFLIZIER_QUOTA_NAMESPACE optionally isolates project/environment keys; default nufflizier-preview and nufflizier-production namespaces separate the environments. Set NUFFLIZIER_UPLOAD_LIMITER=shared to require it explicitly (including in previews). An incomplete configuration or backend failure returns 503, without falling back to local quotas. Unconfigured local and preview builds use the bounded process gate only.

One atomic Redis script uses the backend clock to enforce ten admitted uploads per 60-second window and two concurrent leases across instances. Slots are acquired before reading multipart bodies, released after analysis/cancellation, and expire in 25 seconds if the request dies. Both APIs share the same gate when legacy is explicitly enabled. Both routes allow 20 seconds of function time; their existing 10-second upload and 4-second worker deadlines are unchanged. A quota call is bounded to 850 ms and a 1 KiB reply. No IP, forwarded header, user ID, replay, report or filename is sent to Redis. It stores one expiring count and at most two random lease IDs, with TTLs of 60 and 25 seconds respectively. Backend persistence/backups are an operator setting, not replay storage.

Run corepack pnpm test:quota with Redis 7 and its CLI on PATH. The integration invokes two independent handler gates using the production Lua against one private Redis Unix socket, verifying admission, forwarded-header resistance, body-read avoidance, cleanup, expiry and fail-closed errors. CI runs it after the unit tests. The [Redis atomic scripting contract](https://redis.io/docs/latest/develop/programmability/) and [JSON command format](https://upstash.com/docs/redis/features/restapi#post-command-in-body) document the backend protocol. A real hosted store remains a separate acceptance check.

The authorized target is a separate nufflizer-preview Vercel project; the legacy bb-trainer project is not used. The preview build uses frozen dependencies and excludes evidence/test replay files. No production alias or persistent replay storage is needed. Record exact deployment observations in the implementation log.
