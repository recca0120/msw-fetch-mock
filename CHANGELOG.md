# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.6.2] - 2026-11-03

### Bug Fixes

- When a server is passed to fetchMock (`createFetchMock(server)` or `new FetchMock(server)`), calling `server.resetHandlers()` — e.g. MSW's recommended `afterEach(() => server.resetHandlers())` — removed fetchMock's internal catch-all handler. Afterwards, registered intercepts stopped matching and `onUnhandledRequest: 'error'` no longer blocked requests, so requests reached the real network. fetchMock now re-installs the catch-all on its next use (e.g. `fetchMock.get(...).intercept(...)`), keeping any handlers you added after the reset. No other behavior changes.

### Known limitations

- If `server.resetHandlers()` is called and a request is made **without any fetchMock call in between**, the catch-all cannot be restored yet, and unmatched requests follow MSW's own unhandled-request handling instead of fetchMock's `onUnhandledRequest`. Prefer `fetchMock.reset()` for cleanup between tests.

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
