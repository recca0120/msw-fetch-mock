# msw-fetch-mock

[![CI](https://github.com/recca0120/msw-fetch-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/recca0120/msw-fetch-mock/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/msw-fetch-mock.svg)](https://www.npmjs.com/package/msw-fetch-mock)
[![license](https://img.shields.io/npm/l/msw-fetch-mock.svg)](https://github.com/recca0120/msw-fetch-mock/blob/main/LICENSE.md)

Undici-style fetch mock API built on [MSW](https://mswjs.io/) (Mock Service Worker).

If you're familiar with Cloudflare Workers' `fetchMock` (from `cloudflare:test`) or Node.js undici's `MockAgent`, you already know this API.

Supports both **Node.js** (`msw/node`) and **Browser** (`msw/browser`) environments via subpath exports.

## Install

```bash
npm install -D msw-fetch-mock msw
```

`msw` is a peer dependency — you provide your own version.

## Quick Start

### Node.js (Vitest, Jest)

```typescript
// Works with default import or explicit /node subpath
import { fetchMock } from 'msw-fetch-mock';
// import { fetchMock } from 'msw-fetch-mock/node';

beforeAll(() => fetchMock.activate({ onUnhandledRequest: 'error' }));
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});

it('mocks a GET request', async () => {
  fetchMock
    .get('https://api.example.com')
    .intercept({ path: '/users', method: 'GET' })
    .reply(200, { users: [{ id: '1', name: 'Alice' }] });

  const res = await fetch('https://api.example.com/users');
  const data = await res.json();

  expect(data.users).toHaveLength(1);
});
```

### Browser (Storybook, Vitest Browser Mode)

```typescript
import { setupWorker } from 'msw/browser';
import { createFetchMock } from 'msw-fetch-mock/browser';

const worker = setupWorker();
const fetchMock = createFetchMock(worker);

beforeAll(async () => {
  await fetchMock.activate({ onUnhandledRequest: 'error' });
});
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

### With an existing MSW server

If you already use MSW, pass your server to share a single interceptor:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { FetchMock } from 'msw-fetch-mock';
import { NodeMswAdapter } from 'msw-fetch-mock/node';

const server = setupServer(http.get('/api/users', () => HttpResponse.json([{ id: 1 }])));
const fetchMock = new FetchMock(new NodeMswAdapter(server));

beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  fetchMock.assertNoPendingInterceptors();
});
```

> **Note:** Only one MSW server can be active at a time. If another server is already listening, standalone `activate()` will throw an error guiding you to use `new FetchMock(new NodeMswAdapter(server))` instead.

## Unhandled Requests

By default `activate()` uses `'error'` mode — unmatched requests cause `fetch()` to reject. This includes requests to **consumed** interceptors (once a one-shot interceptor has been used, its handler is removed from MSW).

```typescript
// Reject unmatched requests (default)
fetchMock.activate();
fetchMock.activate({ onUnhandledRequest: 'error' });

// Log a warning but allow passthrough
fetchMock.activate({ onUnhandledRequest: 'warn' });

// Silently allow passthrough
fetchMock.activate({ onUnhandledRequest: 'bypass' });

// Custom callback
fetchMock.activate({
  onUnhandledRequest: (request, print) => {
    if (request.url.includes('/health')) return; // ignore
    print.error(); // block everything else
  },
});
```

> `enableNetConnect()` takes priority over `onUnhandledRequest` — allowed hosts always pass through.

## API Overview

### Import Paths

| Path                     | Environment                  | MSW dependency |
| ------------------------ | ---------------------------- | -------------- |
| `msw-fetch-mock`         | Node.js (re-exports `/node`) | `msw/node`     |
| `msw-fetch-mock/node`    | Node.js                      | `msw/node`     |
| `msw-fetch-mock/browser` | Browser                      | `msw/browser`  |

### `fetchMock` (singleton)

A pre-built `FetchMock` instance for standalone use. Import and call `activate()` — no setup needed.
Available from `msw-fetch-mock` and `msw-fetch-mock/node`.

### `createFetchMock(server?)` / `createFetchMock(worker)`

Factory function that creates a `FetchMock` with the appropriate adapter.

- Node: `createFetchMock(server?)` — optionally pass an existing MSW `SetupServer`
- Browser: `createFetchMock(worker)` — pass an MSW `SetupWorker` (required)

### `new FetchMock(adapter?)`

Creates a `FetchMock` instance with an explicit `MswAdapter`. Use `NodeMswAdapter` or `BrowserMswAdapter`.

### Intercepting & Replying

```typescript
fetchMock
  .get(origin)                              // select origin
  .intercept({ path, method, headers, body, query })  // match criteria
  .reply(status, body, options)             // define response
  .times(n) / .persist();                   // repeat control
```

### Call History

```typescript
fetchMock.calls.lastCall(); // most recent
fetchMock.calls.firstCall(); // earliest
fetchMock.calls.nthCall(2); // 2nd call (1-indexed)
fetchMock.calls.filterCalls({ method: 'POST', path: '/users' }, { operator: 'AND' });
```

### Assertions & Cleanup

```typescript
fetchMock.assertNoPendingInterceptors(); // throws if unconsumed interceptors remain
fetchMock.reset(); // clears interceptors + call history + handlers
```

## Documentation

- [API Reference](docs/api.md) — full API details, matching options, reply callbacks
- [Cloudflare Workers Migration](docs/cloudflare-migration.md) — migrating from `cloudflare:test` fetchMock

## Development

```bash
pnpm install
pnpm build        # build with tsup
pnpm test         # unit tests (vitest)
pnpm test:e2e     # e2e tests (jest-esm, jest-cjs, node-test, node-cjs)
```

### E2E Tests

E2E tests verify the published package works across different runtimes and module systems. The script builds, packs a tarball via `npm pack`, and installs it into each `e2e/` project — mirroring CI exactly.

```bash
# Run default suites (skip vitest-browser)
pnpm test:e2e

# Run a single suite
pnpm test:e2e -- node-cjs

# Run all suites including vitest-browser (auto-installs Playwright)
pnpm test:e2e -- --all
```

Available suites: `jest-esm`, `jest-cjs`, `node-test`, `node-cjs`, `vitest-browser`

## License

[MIT](LICENSE.md)
