# msw-fetch-mock

[![CI](https://github.com/recca0120/msw-fetch-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/recca0120/msw-fetch-mock/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/msw-fetch-mock.svg)](https://www.npmjs.com/package/msw-fetch-mock)
[![license](https://img.shields.io/npm/l/msw-fetch-mock.svg)](https://github.com/recca0120/msw-fetch-mock/blob/main/LICENSE.md)

Undici-style fetch mock API built on [MSW](https://mswjs.io/) (Mock Service Worker).

If you're familiar with Cloudflare Workers' `fetchMock` (from `cloudflare:test`) or Node.js undici's `MockAgent`, you already know this API.

## Install

```bash
npm install -D msw-fetch-mock msw
```

`msw` is a peer dependency — you provide your own version.

## Quick Start

### Standalone (Cloudflare migration)

```typescript
import { fetchMock } from 'msw-fetch-mock';

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

### With an existing MSW server

If you already use MSW, pass your server to share a single interceptor:

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { FetchMock } from 'msw-fetch-mock';

const server = setupServer(http.get('/api/users', () => HttpResponse.json([{ id: 1 }])));
const fetchMock = new FetchMock(server);

beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  fetchMock.assertNoPendingInterceptors();
});
```

> **Note:** Only one MSW server can be active at a time. If another server is already listening, standalone `activate()` will throw an error guiding you to use `new FetchMock(server)` instead.

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

### `fetchMock` (singleton)

A pre-built `FetchMock` instance for standalone use. Import and call `activate()` — no setup needed.

### `new FetchMock(server?)`

Creates a `FetchMock` instance. Pass an existing MSW `SetupServer` to share interceptors; omit to create one internally.

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

## License

[MIT](LICENSE.md)
