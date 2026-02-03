# MSW v1 Legacy Guide

If you're using MSW v1 (`msw@^1.x`), use the `msw-fetch-mock/legacy` subpath export. The API is the same as the v2 version — only the setup differs.

## Install

```bash
npm install -D msw-fetch-mock msw@^1
```

## Setup

```typescript
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { createFetchMock } from 'msw-fetch-mock/legacy';

const server = setupServer();
const fetchMock = createFetchMock(rest, server);

beforeAll(() => fetchMock.activate());
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

## API Comparison

| MSW v2 (`msw-fetch-mock`)                    | MSW v1 (`msw-fetch-mock/legacy`)                |
| -------------------------------------------- | ----------------------------------------------- |
| `import { fetchMock } from 'msw-fetch-mock'` | N/A (no singleton — must use `createFetchMock`) |
| `import { createFetchMock } from '.../node'` | `import { createFetchMock } from '.../legacy'`  |
| `createFetchMock(server?)`                   | `createFetchMock(rest, server?)`                |
| `import { http } from 'msw'`                 | `import { rest } from 'msw'`                    |

## Key Differences

| Aspect            | MSW v2                                    | MSW v1 (Legacy)                       |
| ----------------- | ----------------------------------------- | ------------------------------------- |
| Import            | `msw-fetch-mock` or `msw-fetch-mock/node` | `msw-fetch-mock/legacy`               |
| Factory           | `createFetchMock(server?)`                | `createFetchMock(rest, server?)`      |
| Singleton         | `fetchMock` pre-built instance            | Not available — use `createFetchMock` |
| Handler internals | Uses `http.*` + `HttpResponse`            | Uses `rest.*` + `(req, res, ctx)`     |
| MSW version       | `msw@^2.12.7`                             | `msw@^1.0.0`                          |

## Exports

The `msw-fetch-mock/legacy` subpath exports:

| Export                           | Type     | Description                                       |
| -------------------------------- | -------- | ------------------------------------------------- |
| `createFetchMock(rest, server?)` | Function | Create a FetchMock instance for MSW v1            |
| `FetchMock`                      | Class    | Core mock class (same as v2)                      |
| `createLegacyHandlerFactory`     | Function | Low-level: create a v1-compatible handler factory |
| `LegacyRestApi`                  | Type     | Type for MSW v1's `rest` object                   |

## Migrating from MSW v1 to v2

When you upgrade MSW from v1 to v2, update your imports:

```diff
- import { rest } from 'msw';
- import { createFetchMock } from 'msw-fetch-mock/legacy';
- const fetchMock = createFetchMock(rest, server);
+ import { createFetchMock } from 'msw-fetch-mock/node';
+ const fetchMock = createFetchMock(server);
```

Or use the singleton for standalone mode:

```diff
- import { rest } from 'msw';
- import { setupServer } from 'msw/node';
- import { createFetchMock } from 'msw-fetch-mock/legacy';
- const server = setupServer();
- const fetchMock = createFetchMock(rest, server);
+ import { fetchMock } from 'msw-fetch-mock';
```

The rest of the API (`get()`, `intercept()`, `reply()`, `calls`, etc.) stays the same.
