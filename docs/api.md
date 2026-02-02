# API Reference

## `createFetchMock(server?)`

Creates a `FetchMock` instance.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `server` | `SetupServer` | No | Existing MSW server. Creates one internally if omitted. |

Returns: `FetchMock`

---

## `FetchMock`

### Lifecycle

```typescript
fetchMock.activate();    // start intercepting (calls server.listen())
fetchMock.deactivate();  // stop intercepting (calls server.close())
```

> If you pass an external server that you manage yourself, `activate()` / `deactivate()` are no-ops.

### `fetchMock.get(origin)`

Returns a `MockPool` scoped to the given origin.

```typescript
const pool = fetchMock.get('https://api.example.com');
```

### `fetchMock.disableNetConnect()`

Prevents any real network requests. Unmatched requests will throw.

### `fetchMock.assertNoPendingInterceptors()`

Throws an error if any registered interceptor has not been consumed. Use in `afterEach` to catch missing requests.

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

### `fetchMock.getCallHistory()`

Returns the `MockCallHistory` instance for inspecting recorded requests.

### `fetchMock.clearCallHistory()`

Clears all recorded call history.

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

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | `string \| RegExp \| (path: string) => boolean` | Yes | URL pathname to match |
| `method` | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'` | No | HTTP method (default: `'GET'`) |
| `headers` | `Record<string, string \| RegExp \| (value: string) => boolean>` | No | Header matchers |
| `body` | `string \| RegExp \| (body: string) => boolean` | No | Request body matcher |
| `query` | `Record<string, string>` | No | Query parameter matchers (exact match) |

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

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | `number` | HTTP status code |
| `body` | `unknown \| (req) => unknown` | Response body or callback |
| `options` | `{ headers?: Record<string, string> }` | Response headers |

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

---

## `MockCallHistory`

Tracks all requests that pass through the mock server.

### `history.calls()`

Returns a copy of all recorded `MockCallHistoryLog` entries.

### `history.firstCall()`

Returns the first recorded call, or `undefined`.

### `history.lastCall()`

Returns the most recent recorded call, or `undefined`.

### `history.nthCall(n)`

Returns the nth call (1-indexed), or `undefined`.

### `history.clear()`

Removes all recorded calls.

### `history.filterCalls(criteria, options?)`

Flexible filtering with three overloads:

```typescript
// Function predicate
history.filterCalls((log) => log.body?.includes('test'));

// RegExp (tested against "METHOD fullUrl")
history.filterCalls(/POST.*\/users/);

// Structured criteria
history.filterCalls(
  { method: 'POST', path: '/users' },
  { operator: 'AND' }  // default: 'OR'
);
```

### `history.filterCallsByMethod(filter)`

```typescript
history.filterCallsByMethod('POST');
history.filterCallsByMethod(/^P/);  // POST, PUT, PATCH
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

### Iteration

`MockCallHistory` implements `Symbol.iterator`:

```typescript
for (const call of history) {
  console.log(call.method, call.path);
}
```

---

## `MockCallHistoryLog`

Each recorded call contains:

| Property | Type | Description |
|----------|------|-------------|
| `method` | `string` | HTTP method |
| `fullUrl` | `string` | Complete URL |
| `origin` | `string` | URL origin (`https://example.com`) |
| `path` | `string` | URL pathname (`/users`) |
| `searchParams` | `Record<string, string>` | Query parameters |
| `headers` | `Record<string, string>` | Request headers |
| `body` | `string \| null` | Request body |
| `protocol` | `string` | URL protocol (`https:`) |
| `host` | `string` | URL host |
| `port` | `string` | URL port |
| `hash` | `string` | URL hash |
