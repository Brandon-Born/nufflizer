# Ingestion and execution contract

Updated 2026-11-09. Owning IDs: NUF-002–007, 023–026. Local safeguards are implemented; deployment-wide abuse controls and deployed verification remain open.

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
- HTTP 504 `TIMEOUT` / 499 `CANCELLED`: terminated analysis, no fabricated report. HTTP 503 `BUSY` bounds local concurrency.
- HTTP 413 `REPORT_TOO_LARGE`: serialized JSON exceeds 4,000,000 bytes; use a smaller file or CLI.
- HTTP 429 `RATE_LIMIT` with `Retry-After: 60`: local aggregate ten-request/minute safeguard. It ignores attacker-supplied forwarding headers and stores one bounded bucket. **It is not deployment-wide enforcement (NUF-024).**
- CLI input/execution failures print a descriptive error to stderr and exit nonzero. JSON reports include schema `2.0`, model `dice-only-2`, limitations and explicit verdict status. Unknown odds/results are null, not invented zeros/failures. Weighted numeric contributions are additive dice units; no tactical or calibrated probability claim is made.

## Dependency and deployment evidence

The original production audit had 44 advisories (4 critical, 20 high, 16 moderate, 4 low). Installed patches: Next.js 15.5.29, fast-xml-parser 5.12.0, Zod 4.6.7, React 19.3.1, refreshed transitive packages and a PostCSS 8.5.32 override for the framework's pinned older copy. The refreshed production audit reports zero advisories. Next.js 14 is outside supported LTS; this app does not use the request-time APIs that changed to async in 15. React/types, lint config, build and browser validation accompany the upgrade. The override is API-compatible PostCSS 8; keep it only while needed by the framework dependency.

Primary references checked during remediation:

- [Next.js support policy](https://nextjs.org/support-policy), [14→15 migration](https://nextjs.org/docs/app/guides/upgrading/version-15).
- [Parser advisory inventory](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories), including [repeated DOCTYPE bypass](https://github.com/NaturalIntelligence/fast-xml-parser/security/advisories/GHSA-8r6m-32jq-jx6q).
- [Vercel limits](https://vercel.com/docs/functions/limitations): 4.5 MB request/nonstreamed-response caps. The smaller application limits reserve multipart/error headroom. Browser errors also handle platform-generated non-JSON 413/504 responses.

No deployment account/configuration is present in the checkout. NUF-023 remains open until a deployed near-limit upload, response, timeout and traced-worker smoke succeeds. NUF-024 requires a deployment-wide quota/concurrency backend or verified platform firewall policy; local limits cannot establish that acceptance criterion. No replay persistence has been added. Local quota metadata is one count/reset timestamp, expires after 60 seconds, contains no client identifiers and is not logged; deployment-wide metadata retention must be documented with the eventual backend.
