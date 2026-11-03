# Upgrading to 0.7

0.7.0 adds support for MSW v3 and keeps MSW v1 and v2 working. The msw-fetch-mock API itself doesn't change: `activate()`, `get().intercept().reply()`, call history and the `onUnhandledRequest` option are used the same way with every MSW version. msw-fetch-mock handles the differences between MSW versions internally. For example, MSW v3 renamed `onUnhandledRequest` to `onUnhandledFrame`, but you keep passing `onUnhandledRequest`.

The sections below cover what to check for the MSW version you use. If you are upgrading from **0.6.2 or earlier**, also read [Changes since 0.6.3](#changes-since-063).

## Quick reference

| You use | What to do when upgrading to 0.7 |
| --- | --- |
| MSW v2 | Usually nothing |
| MSW v3 (new) | Install `msw@^3`, use Node.js >= 22.12, regenerate the browser worker script. Awaiting `deactivate()` is recommended |
| MSW v1 (`/legacy`) | Make sure you pass the server: `createFetchMock(rest, server)` |
| No MSW (`/native`) | Nothing |

## MSW v3

```bash
npm install -D msw@^3 msw-fetch-mock
```

- **Node.js >= 22.12.** MSW v3 requires it. msw-fetch-mock itself still supports Node.js >= 18 with MSW v1, v2 or native mode.
- **Same import paths:** `msw-fetch-mock` (auto-detect), `msw-fetch-mock/node`, `msw-fetch-mock/browser`.
- **CommonJS projects work** with Node.js >= 22.12. MSW v3 is ESM-only, and Node.js loads it through `require(esm)`. Jest (CJS and ESM) is covered by the e2e tests.
- **Browser: regenerate the worker script** after installing v3, because MSW requires the script to match the installed version:

  ```bash
  npx msw init public
  ```

- **A worker you start yourself is fine.** If your setup calls `worker.start()` before `fetchMock.activate()`, msw-fetch-mock doesn't start it again. In MSW v3 a second `start()` throws. msw-fetch-mock also doesn't stop that worker on `deactivate()`, so its catch-all handler stays installed until you reset the worker's handlers, the same as with an external server.
- **Await `deactivate()` in the browser.** MSW v3's `worker.stop()` is asynchronous:

  ```ts
  afterAll(async () => {
    await fetchMock.deactivate();
  });
  ```

  Not awaiting it still works. The cleanup runs synchronously; you just don't wait for the worker to finish stopping.
- **Fake timers:** MSW v3 no longer patches `setTimeout`. With fake timers, advance time as usual, e.g. `await vi.advanceTimersByTimeAsync(ms)`, so delayed replies (`.delay(ms)`) resolve.

For changes in MSW v3 itself (handlers, cookies, GraphQL and so on), see the [MSW v3 release notes](https://github.com/mswjs/msw/releases/tag/v3.0.0).

## MSW v2

Usually no changes are needed. Check these two points:

- **`deactivate()` now returns a `Promise<void>`.** You can `await` it, but you don't have to: existing calls without `await` behave as before. If `worker.stop()` fails, only callers who await `deactivate()` see the error; callers who don't await it get no unhandled rejection. TypeScript code that relied on the `void` return type, or lint rules against floating promises, may need an `await` or a `void`.
- **`HandlerFactory.createHandler` was removed.** This only affects you if you called it directly, which is a low-level API that FetchMock never used. To register a single MSW route yourself, use MSW directly: `http.get(url, resolver)` in v2/v3, `rest.get(url, resolver)` in v1. Custom `HandlerFactory` implementations can drop the method.

## MSW v1 (`msw-fetch-mock/legacy`)

- Keep using `createFetchMock(rest, server)`. **The `server` argument is required.** Since 0.6.3, calling it without a server throws a clear error. Before 0.6.3, it either threw or silently did not mock, depending on import order.
- The `createHandler` removal described above also applies to `createLegacyHandlerFactory(rest)`.

## Changes since 0.6.3

If you are coming from 0.6.2 or earlier, these 0.6.3 changes also apply:

- **`timeout` applies in MSW (node/browser) mode.** The documented 30-second default used to be enforced only in native mode. A reply delayed by more than 30 seconds, or fake time advanced past 30 seconds while a request is pending, now rejects with `TimeoutError`. To turn the timeout off:

  ```ts
  await fetchMock.activate({ timeout: 0 });
  ```

- **`forceConnectionClose` applies in MSW mode** too.
- **`replyContentLength()` reports the UTF-8 byte length of the body that is actually sent.** It used to add 2 for the JSON quotes of a string body, and to count characters instead of bytes. For a stream body, the header is no longer set.

The full list is in [CHANGELOG.md](../CHANGELOG.md).
