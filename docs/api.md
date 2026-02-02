# API Reference

## `fetchMock` (singleton)

A pre-built `FetchMock` instance for standalone use. No setup required — just import and call `activate()`.

```typescript
import { fetchMock } from 'msw-fetch-mock';

beforeAll(() => fetchMock.activate({ onUnhandledRequest: 'error' }));
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

## `new FetchMock(server?)`

Creates a `FetchMock` instance. Pass an existing MSW `SetupServer` to share interceptors; omit to create one internally.

```typescript
import { FetchMock } from 'msw-fetch-mock';

// Standalone (creates internal MSW server)
const fetchMock = new FetchMock();

// With external MSW server
import { setupServer } from 'msw/node';
const server = setupServer();
const fetchMock = new FetchMock(server);
```

| Parameter | Type          | Required | Description                                             |
| --------- | ------------- | -------- | ------------------------------------------------------- |
| `server`  | `SetupServer` | No       | Existing MSW server. Creates one internally if omitted. |

> `createFetchMock(server?)` is also available as a backward-compatible factory function.

---

## `FetchMock`

### Lifecycle

```typescript
fetchMock.activate(options?); // start intercepting (calls server.listen())
fetchMock.deactivate();       // stop intercepting (calls server.close())
```

> If you pass an external server that you manage yourself, `activate()` / `deactivate()` are no-ops.
>
> **Conflict detection:** In standalone mode, `activate()` checks whether `globalThis.fetch` is already patched by MSW. If so, it throws an error guiding you to pass your existing server via `new FetchMock(server)` instead.

#### `ActivateOptions`

| Property             | Type                 | Default   | Description                                         |
| -------------------- | -------------------- | --------- | --------------------------------------------------- |
| `onUnhandledRequest` | `OnUnhandledRequest` | `'error'` | How to handle requests with no matching interceptor |

#### `OnUnhandledRequest`

| Value                      | Behavior                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `'error'`                  | MSW prints an error and `fetch()` rejects with an `InternalError`                                                              |
| `'warn'`                   | MSW prints a warning; the request passes through to the real network                                                           |
| `'bypass'`                 | Silently passes through to the real network                                                                                    |
| `(request, print) => void` | Custom callback. Call `print.error()` to block or `print.warning()` to warn. Return without calling either to silently bypass. |

```typescript
// Default — reject unmatched requests
fetchMock.activate();
fetchMock.activate({ onUnhandledRequest: 'error' });

// Custom callback
fetchMock.activate({
  onUnhandledRequest: (request, print) => {
    if (new URL(request.url).pathname === '/health') return;
    print.error();
  },
});
```

> **Consumed interceptors:** Once a one-shot interceptor has been fully consumed, its MSW handler is removed. Subsequent requests to that URL are treated as unhandled and go through `onUnhandledRequest`. This prevents consumed interceptors from silently passing through.
>
> **Priority:** `enableNetConnect()` takes priority over `onUnhandledRequest` — allowed hosts always pass through regardless of the unhandled request mode.

### `fetchMock.calls`

Returns the `MockCallHistory` instance for inspecting and managing recorded requests.

```typescript
// Check call count
expect(fetchMock.calls.length).toBe(3);

// Inspect last call
const last = fetchMock.calls.lastCall();

// Clear history
fetchMock.calls.clear();
```

### `fetchMock.get(origin)`

Returns a `MockPool` scoped to the given origin.

```typescript
const pool = fetchMock.get('https://api.example.com');
```

### `fetchMock.disableNetConnect()`

Prevents any real network requests. Unmatched requests will throw.

### `fetchMock.enableNetConnect(matcher?)`

Allows real network requests to pass through. Without arguments, all requests are allowed. With a matcher, only matching hosts pass through.

```typescript
// Allow all network requests
fetchMock.enableNetConnect();

// Allow specific host (exact match)
fetchMock.enableNetConnect('api.example.com');

// Allow hosts matching a RegExp
fetchMock.enableNetConnect(/\.example\.com$/);

// Allow hosts matching a function
fetchMock.enableNetConnect((host) => host.endsWith('.test'));
```

| Parameter | Type                                            | Required | Description                          |
| --------- | ----------------------------------------------- | -------- | ------------------------------------ |
| `matcher` | `string \| RegExp \| (host: string) => boolean` | No       | Host matcher. Allows all if omitted. |

### `fetchMock.getCallHistory()`

Returns the `MockCallHistory` instance. Cloudflare-compatible alias for `fetchMock.calls`.

### `fetchMock.clearCallHistory()`

Clears all recorded calls. Cloudflare-compatible alias for `fetchMock.calls.clear()`.

### `fetchMock.assertNoPendingInterceptors()`

Throws an error if any registered interceptor has not been consumed. This is a **pure assertion** — it does not clear call history, interceptors, or handlers. Use `reset()` to clean up state.

```typescript
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

### `fetchMock.reset()`

Clears all interceptors, call history, and MSW handlers. Resets the instance to a clean state without stopping the server. Use in `afterEach` after asserting no pending interceptors.

```typescript
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

### `fetchMock.pendingInterceptors()`

Returns an array of unconsumed interceptors with metadata:

```typescript
interface PendingInterceptor {
  origin: string;
  path: string;
  method: string;
  consumed: boolean;
  times: number;
  timesInvoked: number;
  persist: boolean;
}
```

---

## `MockPool`

### `pool.intercept(options)`

Registers an interceptor for matching requests.

```typescript
pool.intercept({
  path: '/users',
  method: 'GET',
});
```

Returns: `MockInterceptor`

#### `InterceptOptions`

| Property  | Type                                                             | Required | Description                            |
| --------- | ---------------------------------------------------------------- | -------- | -------------------------------------- |
| `path`    | `string \| RegExp \| (path: string) => boolean`                  | Yes      | URL pathname to match                  |
| `method`  | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'`                | No       | HTTP method (default: `'GET'`)         |
| `headers` | `Record<string, string \| RegExp \| (value: string) => boolean>` | No       | Header matchers                        |
| `body`    | `string \| RegExp \| (body: string) => boolean`                  | No       | Request body matcher                   |
| `query`   | `Record<string, string>`                                         | No       | Query parameter matchers (exact match) |

#### Path Matching

```typescript
// Exact string
.intercept({ path: '/users' })

// RegExp
.intercept({ path: /^\/users\/\d+$/ })

// Function
.intercept({ path: (p) => p.startsWith('/users') })
```

#### Header Matching

```typescript
.intercept({
  path: '/api',
  method: 'POST',
  headers: {
    'content-type': 'application/json',         // exact match
    authorization: /^Bearer /,                   // regex
    'x-custom': (v) => v.includes('special'),   // function
  },
})
```

#### Body Matching

```typescript
.intercept({
  path: '/api',
  method: 'POST',
  body: '{"key":"value"}',            // exact match
  // body: /keyword/,                 // regex
  // body: (b) => b.includes('key'),  // function
})
```

#### Query Parameters

```typescript
.intercept({
  path: '/search',
  method: 'GET',
  query: { q: 'test', page: '1' },
})
```

---

## `MockInterceptor`

### `interceptor.reply(status, body?, options?)`

Defines the mock response.

```typescript
// Static body
.reply(200, { users: [] })

// With response headers
.reply(200, { users: [] }, { headers: { 'x-request-id': '123' } })

// Callback (receives request info)
.reply(200, (req) => {
  const input = JSON.parse(req.body!);
  return { echo: input };
})
```

Returns: `MockReplyChain`

| Parameter | Type                                   | Description               |
| --------- | -------------------------------------- | ------------------------- |
| `status`  | `number`                               | HTTP status code          |
| `body`    | `unknown \| (req) => unknown`          | Response body or callback |
| `options` | `{ headers?: Record<string, string> }` | Response headers          |

### `interceptor.replyWithError(error)`

Replies with a network error (simulates a connection failure).

```typescript
.replyWithError(new Error('connection refused'))
```

Returns: `MockReplyChain`

| Parameter | Type    | Description                              |
| --------- | ------- | ---------------------------------------- |
| `error`   | `Error` | The error instance (used for semantics). |

---

## `MockReplyChain`

### `chain.times(n)`

Interceptor will match exactly `n` times, then be consumed.

```typescript
.reply(200, { ok: true }).times(3)
```

### `chain.persist()`

Interceptor will match indefinitely (never consumed).

```typescript
.reply(200, { ok: true }).persist()
```

### `chain.delay(ms)`

Adds a delay before the response is sent.

```typescript
.reply(200, { ok: true }).delay(500)
```

---

## `MockCallHistory`

Tracks all requests that pass through the mock server.

### `history.length`

Returns the number of recorded calls.

```typescript
expect(fetchMock.calls.length).toBe(3);
```

### `history.called(criteria?)`

Returns `true` if any calls match the given criteria, or if any calls exist when no criteria is provided.

```typescript
// Any calls recorded?
expect(fetchMock.calls.called()).toBe(true);

// Calls matching a filter?
expect(fetchMock.calls.called({ method: 'POST' })).toBe(true);
expect(fetchMock.calls.called(/\/users/)).toBe(true);
expect(fetchMock.calls.called((log) => log.path === '/users')).toBe(true);
```

### `history.calls()`

Returns a copy of all recorded `MockCallHistoryLog` entries.

### `history.firstCall(criteria?)`

Returns the first recorded call, or `undefined`. Optionally filters by criteria.

```typescript
const first = fetchMock.calls.firstCall();
const firstPost = fetchMock.calls.firstCall({ method: 'POST' });
```

### `history.lastCall(criteria?)`

Returns the most recent recorded call, or `undefined`. Optionally filters by criteria.

```typescript
const last = fetchMock.calls.lastCall();
const lastPost = fetchMock.calls.lastCall({ method: 'POST' });
```

### `history.nthCall(n, criteria?)`

Returns the nth call (1-indexed), or `undefined`. Optionally filters by criteria.

```typescript
const second = fetchMock.calls.nthCall(2);
const secondPost = fetchMock.calls.nthCall(2, { method: 'POST' });
```

### `history.clear()`

Removes all recorded calls.

### `history.filterCalls(criteria, options?)`

Flexible filtering with three overloads:

```typescript
// Function predicate
history.filterCalls((log) => log.body?.includes('test'));

// RegExp (tested against log.toString())
history.filterCalls(/POST.*\/users/);

// Structured criteria
history.filterCalls(
  { method: 'POST', path: '/users' },
  { operator: 'AND' } // default: 'OR'
);
```

#### `CallHistoryFilterCriteria`

| Property   | Type     | Description  |
| ---------- | -------- | ------------ |
| `method`   | `string` | HTTP method  |
| `path`     | `string` | URL pathname |
| `origin`   | `string` | URL origin   |
| `protocol` | `string` | URL protocol |
| `host`     | `string` | URL host     |
| `port`     | `string` | URL port     |
| `hash`     | `string` | URL hash     |
| `fullUrl`  | `string` | Complete URL |

### `history.filterCallsByMethod(filter)`

```typescript
history.filterCallsByMethod('POST');
history.filterCallsByMethod(/^P/); // POST, PUT, PATCH
```

### `history.filterCallsByPath(filter)`

```typescript
history.filterCallsByPath('/users');
history.filterCallsByPath(/\/users\/\d+/);
```

### `history.filterCallsByOrigin(filter)`

```typescript
history.filterCallsByOrigin('https://api.example.com');
history.filterCallsByOrigin(/example\.com/);
```

### `history.filterCallsByProtocol(filter)`

```typescript
history.filterCallsByProtocol('https:');
```

### `history.filterCallsByHost(filter)`

```typescript
history.filterCallsByHost('api.example.com');
history.filterCallsByHost(/example\.com/);
```

### `history.filterCallsByPort(filter)`

```typescript
history.filterCallsByPort('8787');
```

### `history.filterCallsByHash(filter)`

```typescript
history.filterCallsByHash('#section');
```

### `history.filterCallsByFullUrl(filter)`

```typescript
history.filterCallsByFullUrl('https://api.example.com/users');
history.filterCallsByFullUrl(/\/users\?page=1/);
```

### Iteration

`MockCallHistory` implements `Symbol.iterator`:

```typescript
for (const call of history) {
  console.log(call.method, call.path);
}
```

---

## `MockCallHistoryLog`

Each recorded call is an instance of `MockCallHistoryLog` with the following properties:

| Property       | Type                     | Description                        |
| -------------- | ------------------------ | ---------------------------------- |
| `method`       | `string`                 | HTTP method                        |
| `fullUrl`      | `string`                 | Complete URL                       |
| `origin`       | `string`                 | URL origin (`https://example.com`) |
| `path`         | `string`                 | URL pathname (`/users`)            |
| `searchParams` | `Record<string, string>` | Query parameters                   |
| `headers`      | `Record<string, string>` | Request headers                    |
| `body`         | `string \| null`         | Request body                       |
| `protocol`     | `string`                 | URL protocol (`https:`)            |
| `host`         | `string`                 | URL host                           |
| `port`         | `string`                 | URL port                           |
| `hash`         | `string`                 | URL hash                           |

### `log.json()`

Parses the request body as JSON. Returns `null` if body is `null`.

```typescript
const call = fetchMock.calls.lastCall()!;
const data = call.json() as { name: string };
expect(data.name).toBe('Alice');
```

### `log.toMap()`

Returns a `Map` of all log properties.

```typescript
const map = call.toMap();
expect(map.get('method')).toBe('POST');
```

### `log.toString()`

Returns a pipe-delimited string representation for debugging and RegExp matching.

```typescript
call.toString();
// "method->POST|protocol->https:|host->api.example.com|port->|origin->https://api.example.com|path->/users|hash->|fullUrl->https://api.example.com/users"
```
