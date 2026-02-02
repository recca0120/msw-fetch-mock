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

```typescript
import { setupServer } from 'msw/node';
import { FetchMock } from 'msw-fetch-mock';

const server = setupServer();
const fetchMock = new FetchMock(server);

beforeAll(() => fetchMock.activate());
afterAll(() => fetchMock.deactivate());
afterEach(() => fetchMock.assertNoPendingInterceptors());

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

## API Overview

### `new FetchMock(server?)`

Creates a `FetchMock` instance. Optionally accepts an existing MSW `SetupServer`; creates one internally if omitted.

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

### Assertions

```typescript
fetchMock.assertNoPendingInterceptors(); // throws if unconsumed interceptors remain
```

## Documentation

- [API Reference](docs/api.md) — full API details, matching options, reply callbacks
- [Cloudflare Workers Migration](docs/cloudflare-migration.md) — migrating from `cloudflare:test` fetchMock

## License

[MIT](LICENSE.md)
