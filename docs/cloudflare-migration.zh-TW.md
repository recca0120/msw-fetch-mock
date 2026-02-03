# Cloudflare Workers 遷移指南

如果你正在將測試從 Cloudflare Workers 的 `cloudflare:test` 遷移到標準的 Node.js 測試環境，`msw-fetch-mock` 提供了你已經熟悉的相同 `fetchMock` API。

## API 對照

| cloudflare:test                                    | msw-fetch-mock                                              |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `import { fetchMock } from 'cloudflare:test'`      | `import { fetchMock } from 'msw-fetch-mock'`                |
| `fetchMock.activate()`                             | `await fetchMock.activate()`                                |
| `fetchMock.disableNetConnect()`                    | `fetchMock.disableNetConnect()`                             |
| `fetchMock.enableNetConnect(matcher?)`             | `fetchMock.enableNetConnect(matcher?)`                      |
| `fetchMock.deactivate()`                           | `fetchMock.deactivate()`                                    |
| `fetchMock.get(origin).intercept(opts).reply(...)` | `fetchMock.get(origin).intercept(opts).reply(...)`          |
| `.replyWithError(error)`                           | `.replyWithError(error)`                                    |
| `.reply(...).delay(ms)`                            | `.reply(...).delay(ms)`                                     |
| `fetchMock.getCallHistory()`                       | `fetchMock.getCallHistory()` 或 `fetchMock.calls`           |
| `fetchMock.clearCallHistory()`                     | `fetchMock.clearCallHistory()` 或 `fetchMock.calls.clear()` |
| `fetchMock.assertNoPendingInterceptors()`          | `fetchMock.assertNoPendingInterceptors()`                   |

## 遷移前（cloudflare:test）

```typescript
import { fetchMock } from 'cloudflare:test';

beforeEach(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

afterEach(() => fetchMock.assertNoPendingInterceptors());

it('呼叫 API', async () => {
  fetchMock
    .get('https://api.example.com')
    .intercept({ path: '/data', method: 'GET' })
    .reply(200, { result: 'ok' });

  const res = await fetch('https://api.example.com/data');
  expect(await res.json()).toEqual({ result: 'ok' });
});
```

## 遷移後（msw-fetch-mock）

```typescript
import { fetchMock } from 'msw-fetch-mock';

beforeAll(async () => {
  await fetchMock.activate();
});
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});

it('呼叫 API', async () => {
  fetchMock
    .get('https://api.example.com')
    .intercept({ path: '/data', method: 'GET' })
    .reply(200, { result: 'ok' });

  const res = await fetch('https://api.example.com/data');
  expect(await res.json()).toEqual({ result: 'ok' });
});
```

## 主要差異

| 面向            | cloudflare:test                               | msw-fetch-mock                                    |
| --------------- | --------------------------------------------- | ------------------------------------------------- |
| 匯入            | `import { fetchMock } from 'cloudflare:test'` | `import { fetchMock } from 'msw-fetch-mock'`      |
| Server 生命週期 | 隱式（由測試框架管理）                        | 顯式（`activate()` / `deactivate()`）             |
| 呼叫歷史存取    | `fetchMock.getCallHistory()`                  | `fetchMock.getCallHistory()` 或 `fetchMock.calls` |
| 呼叫歷史清理    | 每次測試自動清理                              | 在 `afterEach` 中呼叫 `reset()`                   |
| 未處理的請求    | 必須呼叫 `disableNetConnect()`                | 預設 `onUnhandledRequest: 'error'`（直接拒絕）    |
| 執行環境        | Cloudflare Workers (workerd)                  | Node.js                                           |

> **注意：** `getCallHistory()` 和 `clearCallHistory()` 是為了 Cloudflare 相容性而提供的別名。你可以使用 Cloudflare 風格的方法或 `fetchMock.calls` getter — 兩者是等價的。
