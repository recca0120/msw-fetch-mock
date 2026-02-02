# Cloudflare Workers Migration Guide

If you're migrating tests from Cloudflare Workers' `cloudflare:test` to a standard Node.js test environment, `msw-fetch-mock` provides the same `fetchMock` API you already know.

## API Comparison

| cloudflare:test                                    | msw-fetch-mock                                     |
| -------------------------------------------------- | -------------------------------------------------- |
| `import { fetchMock } from 'cloudflare:test'`      | `const fetchMock = createFetchMock(server)`        |
| `fetchMock.activate()`                             | `fetchMock.activate()`                             |
| `fetchMock.disableNetConnect()`                    | `fetchMock.disableNetConnect()`                    |
| `fetchMock.deactivate()`                           | `fetchMock.deactivate()`                           |
| `fetchMock.get(origin).intercept(opts).reply(...)` | `fetchMock.get(origin).intercept(opts).reply(...)` |
| `fetchMock.getCallHistory()`                       | `fetchMock.getCallHistory()`                       |
| `fetchMock.assertNoPendingInterceptors()`          | `fetchMock.assertNoPendingInterceptors()`          |

## Before (cloudflare:test)

```typescript
import { fetchMock } from 'cloudflare:test';

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

it('calls API', async () => {
  fetchMock
    .get('https://api.example.com')
    .intercept({ path: '/data', method: 'GET' })
    .reply(200, { result: 'ok' });

  const res = await fetch('https://api.example.com/data');
  expect(await res.json()).toEqual({ result: 'ok' });
});
```

## After (msw-fetch-mock)

```typescript
import { setupServer } from 'msw/node';
import { createFetchMock } from 'msw-fetch-mock';

const server = setupServer();
const fetchMock = createFetchMock(server);

beforeAll(() => fetchMock.activate());
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.clearCallHistory();
  fetchMock.assertNoPendingInterceptors();
});

it('calls API', async () => {
  fetchMock
    .get('https://api.example.com')
    .intercept({ path: '/data', method: 'GET' })
    .reply(200, { result: 'ok' });

  const res = await fetch('https://api.example.com/data');
  expect(await res.json()).toEqual({ result: 'ok' });
});
```

## Key Differences

| Aspect               | cloudflare:test                      | msw-fetch-mock                               |
| -------------------- | ------------------------------------ | -------------------------------------------- |
| Server lifecycle     | Implicit (managed by test framework) | Explicit (`activate()` / `deactivate()`)     |
| Call history cleanup | Automatic per test                   | Manual (`clearCallHistory()` in `afterEach`) |
| Network connect      | Must call `disableNetConnect()`      | MSW blocks unhandled requests by default     |
| Runtime              | Cloudflare Workers (workerd)         | Node.js                                      |
