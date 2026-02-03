# Cloudflare Workers Migration Guide

If you're migrating tests from Cloudflare Workers' `cloudflare:test` to a standard Node.js test environment, `msw-fetch-mock` provides the same `fetchMock` API you already know.

## API Comparison

| cloudflare:test                                    | msw-fetch-mock                                              |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `import { fetchMock } from 'cloudflare:test'`      | `import { fetchMock } from 'msw-fetch-mock'`                |
| `fetchMock.activate()`                             | `fetchMock.activate()`                                      |
| `fetchMock.disableNetConnect()`                    | `fetchMock.disableNetConnect()`                             |
| `fetchMock.enableNetConnect(matcher?)`             | `fetchMock.enableNetConnect(matcher?)`                      |
| `fetchMock.deactivate()`                           | `fetchMock.deactivate()`                                    |
| `fetchMock.get(origin).intercept(opts).reply(...)` | `fetchMock.get(origin).intercept(opts).reply(...)`          |
| `.replyWithError(error)`                           | `.replyWithError(error)`                                    |
| `.reply(...).delay(ms)`                            | `.reply(...).delay(ms)`                                     |
| `fetchMock.getCallHistory()`                       | `fetchMock.getCallHistory()` or `fetchMock.calls`           |
| `fetchMock.clearCallHistory()`                     | `fetchMock.clearCallHistory()` or `fetchMock.calls.clear()` |
| `fetchMock.assertNoPendingInterceptors()`          | `fetchMock.assertNoPendingInterceptors()`                   |

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
import { fetchMock } from 'msw-fetch-mock';

beforeAll(async () => fetchMock.activate());
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
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

| Aspect               | cloudflare:test                               | msw-fetch-mock                                     |
| -------------------- | --------------------------------------------- | -------------------------------------------------- |
| Import               | `import { fetchMock } from 'cloudflare:test'` | `import { fetchMock } from 'msw-fetch-mock'`       |
| Server lifecycle     | Implicit (managed by test framework)          | Explicit (`activate()` / `deactivate()`)           |
| Call history access  | `fetchMock.getCallHistory()`                  | `fetchMock.getCallHistory()` or `fetchMock.calls`  |
| Call history cleanup | Automatic per test                            | `reset()` in `afterEach`                           |
| Unhandled requests   | Must call `disableNetConnect()`               | `onUnhandledRequest: 'error'` by default (rejects) |
| Runtime              | Cloudflare Workers (workerd)                  | Node.js                                            |

> **Note:** `getCallHistory()` and `clearCallHistory()` are provided as Cloudflare-compatible aliases. You can use either the Cloudflare-style methods or the `fetchMock.calls` getter — they are equivalent.
