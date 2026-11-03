# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.4] - 2026-11-03

No changes to the public API or to behavior.

### Performance

- Each request URL is now parsed once and shared by all interceptors that try to match it. Before, every interceptor parsed it again. With 200 interceptors, a native GET dropped from about 158 µs to 72 µs.

### Internal

- Test files are now type-checked by `pnpm typecheck`, which runs in CI and in the pre-push hook. This uncovered tests that ran with unintended options (a fetch wrapper with an immediate timeout), and those are now fixed.
- Browser mode is now tested end to end, using a worker backed by a real `setupServer()`. This includes recovering after the user calls `worker.resetHandlers()`.
- Small cleanups: a shared `StringMatcher` type, `recordCall` moved next to the call history, and unhandled-request messages kept in one place.
- e2e script:
  - installs the package tarball with `npm install --no-save` instead of rewriting tracked `package.json` files
  - restores the `mockServiceWorker.js` that msw rewrites on install
  - `e2e/legacy-cjs` pointed at a tarball from another project and now points at this one

## [0.6.3] - 2026-11-03

### ⚠️ Behavior changes

- **`timeout` now applies in MSW (node/browser) mode.** `ActivateOptions.timeout` is documented as a per-request timeout with a default of 30 seconds, but only native mode enforced it. It now applies in every mode, so a reply delayed by more than 30s, or fake time advanced past 30s while a request is pending, rejects with `TimeoutError`. Pass `activate({ timeout: 0 })` to disable it.
- **`createFetchMock(rest)` from `msw-fetch-mock/legacy` now throws when no server is passed.** Before, it either threw or silently used an interceptor registered by another entry point (for example the MSW v2 Node interceptor), depending on import order. That interceptor cannot run MSW v1 handlers. Pass your MSW v1 server: `createFetchMock(rest, setupServer())`.

### Bug Fixes

- **`forceConnectionClose` now applies in MSW (node/browser) mode** too, not only in native mode.
- **`forceConnectionClose` no longer drops the headers of a `Request` passed to `fetch()`** (native mode included).
- **`replyContentLength()` now sets `Content-Length` to the UTF-8 byte length of the body actually sent.** String bodies used to count their JSON quotes (`'hello'` gave 7 instead of 5), and non-ASCII bodies counted characters instead of bytes. For a `ReadableStream` body, whose length is unknown, the header is no longer set (it used to be `2`).
- **Legacy (MSW v1) mode:** a `ReadableStream` reply body is now sent. Before, the client received `"{}"`.
- **Native mode:** an unhandled request now calls a custom `onUnhandledRequest` callback once (it was called twice), and `'warn'` prints one warning instead of two.
- **Importing several entry points in one process no longer breaks them.** For example, importing `msw-fetch-mock/native` after `msw-fetch-mock/node` used to make `/node`'s `createFetchMock()` and `fetchMock` stop mocking. Each entry point now passes its own interceptor and handler factory to every instance it creates.

### Performance

- Each request's body is read at most once and shared across interceptors. Before, the request was cloned once for every registered interceptor (about 13× faster with 200 interceptors).

### Deprecations

- `HandlerFactory.createHandler` is deprecated. FetchMock never calls it, and it will be removed in 0.7.0. To register a single MSW v1 route yourself, call `rest.get(url, resolver)` (or another `rest` method) directly.

### Internal

- Refactored without behavior changes: the matching engine moved into `InterceptorRegistry`, all MSW-server paths now share one `ServerFetchInterceptor`, and dead code was removed.
- The test suite was reworked to follow ATDD rules: no outside network access, assertions that actually fail when the behavior breaks, fake timers instead of wall-clock waits, and a fix for Node 18.
- The release workflow now runs on Node 24, because npm 12 does not support Node 23.

## [0.6.2] - 2026-11-03

### Bug Fixes

- When a server is passed to fetchMock (`createFetchMock(server)` or `new FetchMock(server)`), calling `server.resetHandlers()` — e.g. MSW's recommended `afterEach(() => server.resetHandlers())` — removed fetchMock's internal catch-all handler. Afterwards, registered intercepts stopped matching and `onUnhandledRequest: 'error'` no longer blocked requests, so requests reached the real network. fetchMock now re-installs the catch-all on its next use (e.g. `fetchMock.get(...).intercept(...)`), keeping any handlers you added after the reset. No other behavior changes.

### Known limitations

- If `server.resetHandlers()` is called and a request is made **without any fetchMock call in between**, the catch-all cannot be restored yet, and unmatched requests follow MSW's own unhandled-request handling instead of fetchMock's `onUnhandledRequest`. Prefer `fetchMock.reset()` for cleanup between tests.

## [0.6.1] - 2026-05-09

### Bug Fixes

- Parallel requests (for example via `Promise.all`) could match the same one-time interceptor twice. An interceptor is now claimed synchronously, before its body is matched.
- String reply bodies are sent as-is instead of being JSON-encoded a second time (which wrapped them in extra quotes).

## [0.6.0] - 2026-05-08

### Breaking Changes

- Renamed "Adapter" to "FetchInterceptor" in the public API: `MswAdapter` → `FetchInterceptor`, `NodeMswAdapter` → `NodeFetchInterceptor`, `BrowserMswAdapter` → `BrowserFetchInterceptor`, `NativeFetchAdapter` → `NativeFetchInterceptor`, `isMswAdapter` → `isFetchInterceptor`.
- The default entry point (`msw-fetch-mock`) now detects whether MSW is installed and falls back to native fetch interception when it is not. It no longer re-exports `NodeFetchInterceptor`; import it from `msw-fetch-mock/node`.

## [0.5.0] - 2026-03-14

### Bug Fixes

- `filterCalls({ headers, searchParams })` previously never matched because it compared Record objects with `===`; now uses `JSON.stringify` for correct deep comparison
- `ReadableStream` response body was previously force-serialised with `JSON.stringify`; it is now passed through directly (`handler-factory.ts` / `native-handler-factory.ts`)
- `delay()` previously ignored the request `AbortSignal`; it now resolves immediately and clears the timer when the signal is aborted
- `legacy.ts` `createFetchMock()` previously mutated the global static `FetchMock._handlerFactory`, causing multiple calls to overwrite each other; each instance now holds its own factory

### Features

- Fluent reply chain: `.times()`, `.persist()`, `.delay()`, and `.replyContentLength()` now return a `MockReplyChain`, enabling method chaining:
  ```ts
  fetchMock.get(origin).intercept({ path: '/api' }).reply(200, data).times(3).delay(100);
  ```
- `NodeMswAdapter` now throws a clear error message when it detects that another MSW server is already running

### Refactoring (internal, no API changes)

- Extracted repeated warning strings into `messages.ts`
- Removed `createWorkerAdapter`; unified under `BrowserMswAdapter`
- Removed the `interceptors` parallel array; it is now derived from `handlerFns.keys()`
- Simplified `NativeFetchAdapter.withTimeout` (removed `AbortController`)
- `MockCallHistoryLog` now uses direct field assignment (removed `!` assertions)
- Flattened deep nesting in `matchPath()`; extracted `matchStringPathWithQuery` helper

## [0.4.13] - 2024

### Bug Fixes

- Fixed `biome.json` configuration (`root: true`) to match standalone project semantics

## [0.4.12] - 2024

### Chores

- Migrated from ESLint + Prettier to Biome for linting and formatting

## [0.4.11] - 2024

### Removed

- Removed deprecated `calls()` method; use `all()` instead

## [0.4.10] - 2024

### Features

- Added support for query strings in path for request matching (e.g. `path: '/api?page=1'`)

[0.5.0]: https://github.com/recca0120/msw-fetch-mock/compare/v0.4.13...v0.5.0
[0.4.13]: https://github.com/recca0120/msw-fetch-mock/compare/v0.4.12...v0.4.13
[0.4.12]: https://github.com/recca0120/msw-fetch-mock/compare/v0.4.11...v0.4.12
[0.4.11]: https://github.com/recca0120/msw-fetch-mock/compare/v0.4.10...v0.4.11
[0.4.10]: https://github.com/recca0120/msw-fetch-mock/releases/tag/v0.4.10
