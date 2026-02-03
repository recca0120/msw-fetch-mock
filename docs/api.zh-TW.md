# API 參考

## 匯入路徑

| 路徑                     | 環境                          | MSW 版本 |
| ------------------------ | ----------------------------- | -------- |
| `msw-fetch-mock`         | Node.js（re-exports `/node`） | v2       |
| `msw-fetch-mock/node`    | Node.js                       | v2       |
| `msw-fetch-mock/browser` | 瀏覽器                        | v2       |
| `msw-fetch-mock/legacy`  | Node.js（MSW v1）             | v1       |

## `fetchMock`（單例）

預先建立的 `FetchMock` 實例，適用於獨立的 Node.js 使用。無需額外設定 — 匯入後呼叫 `activate()` 即可。

```typescript
import { fetchMock } from 'msw-fetch-mock';

beforeAll(async () => {
  await fetchMock.activate({ onUnhandledRequest: 'error' });
});
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

## `createFetchMock(server?)`（Node）

建立搭配 `NodeMswAdapter` 的 `FetchMock`。可選擇性傳入現有的 MSW server。

```typescript
import { createFetchMock } from 'msw-fetch-mock/node';
import { setupServer } from 'msw/node';

// 獨立模式
const fetchMock = createFetchMock();

// 搭配外部 MSW server
const server = setupServer();
const fetchMock = createFetchMock(server);
```

## `createFetchMock(worker)`（瀏覽器）

建立搭配 `BrowserMswAdapter` 的 `FetchMock`。需要傳入 MSW worker。

```typescript
import { setupWorker } from 'msw/browser';
import { createFetchMock } from 'msw-fetch-mock/browser';

const worker = setupWorker();
const fetchMock = createFetchMock(worker);

beforeAll(async () => {
  await fetchMock.activate({ onUnhandledRequest: 'error' });
});
```

## `createFetchMock(rest, server?)`（Legacy）

建立適用於 MSW v1 環境的 `FetchMock`。詳見 [MSW v1 Legacy 指南](msw-v1-legacy.zh-TW.md)。

```typescript
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { createFetchMock } from 'msw-fetch-mock/legacy';

const server = setupServer();
const fetchMock = createFetchMock(rest, server);
```

## `new FetchMock(adapter?)`

使用明確的 `MswAdapter` 建立 `FetchMock` 實例。

```typescript
import { FetchMock } from 'msw-fetch-mock';
import { NodeMswAdapter } from 'msw-fetch-mock/node';
import { BrowserMswAdapter } from 'msw-fetch-mock/browser';

// Node 搭配外部 server
const fetchMock = new FetchMock(new NodeMswAdapter(server));

// 瀏覽器搭配 worker
const fetchMock = new FetchMock(new BrowserMswAdapter(worker));
```

| 參數      | 型別         | 必要 | 說明                                         |
| --------- | ------------ | ---- | -------------------------------------------- |
| `adapter` | `MswAdapter` | 否   | 環境 adapter。建議改用 `createFetchMock()`。 |

---

## `FetchMock`

### 生命週期

```typescript
await fetchMock.activate(options?); // 開始攔截（非同步 — 瀏覽器需要 worker.start()）
fetchMock.deactivate();             // 停止攔截
```

> `activate()` 回傳 `Promise<void>`。在 Node.js 中，promise 會同步解析。在瀏覽器中，會等待 Service Worker 啟動。Vitest 和 Jest 原生支援非同步的 `beforeAll`。
>
> **衝突偵測（僅 Node）：** 在獨立模式下，`activate()` 會檢查 `globalThis.fetch` 是否已被 MSW 修補。若是，會拋出錯誤，引導你使用 `createFetchMock(server)` 來共用現有 server。

#### `ActivateOptions`

| 屬性                 | 型別                 | 預設值    | 說明                 |
| -------------------- | -------------------- | --------- | -------------------- |
| `onUnhandledRequest` | `OnUnhandledRequest` | `'error'` | 如何處理未匹配的請求 |

#### `OnUnhandledRequest`

| 值                         | 行為                                                                                     |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `'error'`                  | MSW 印出錯誤且 `fetch()` 以 `InternalError` 拒絕                                         |
| `'warn'`                   | MSW 印出警告；請求直接通過到實際網路                                                     |
| `'bypass'`                 | 靜默通過到實際網路                                                                       |
| `(request, print) => void` | 自訂回呼。呼叫 `print.error()` 阻擋或 `print.warning()` 警告。不呼叫任何一個則靜默放行。 |

```typescript
// 預設 — 拒絕未匹配的請求
await fetchMock.activate();
await fetchMock.activate({ onUnhandledRequest: 'error' });

// 自訂回呼
await fetchMock.activate({
  onUnhandledRequest: (request, print) => {
    if (new URL(request.url).pathname === '/health') return;
    print.error();
  },
});
```

> **已消耗的攔截器：** 一次性攔截器完全消耗後，其 MSW handler 會被移除。後續對該 URL 的請求會被視為未處理，並經由 `onUnhandledRequest` 處理。這可防止已消耗的攔截器靜默通過。
>
> **優先順序：** `enableNetConnect()` 的優先順序高於 `onUnhandledRequest` — 允許的主機一律直接通過，不受未處理請求模式影響。

### `fetchMock.calls`

回傳 `MockCallHistory` 實例，用於檢視和管理已記錄的請求。

```typescript
// 檢查呼叫次數
expect(fetchMock.calls.length).toBe(3);

// 檢視最後一次呼叫
const last = fetchMock.calls.lastCall();

// 清除歷史
fetchMock.calls.clear();
```

### `fetchMock.get(origin)`

回傳範圍限定在指定 origin 的 `MockPool`。`origin` 參數接受三種形式：

```typescript
// 字串 — 精確的 origin 匹配
const pool = fetchMock.get('https://api.example.com');

// RegExp — 對 URL origin 進行匹配
const pool = fetchMock.get(/\.example\.com$/);

// 函式 — 自訂 origin 判斷
const pool = fetchMock.get((origin) => origin.startsWith('https://'));
```

| 參數     | 型別                                              | 必要 | 說明          |
| -------- | ------------------------------------------------- | ---- | ------------- |
| `origin` | `string \| RegExp \| (origin: string) => boolean` | 是   | Origin 匹配器 |

### `fetchMock.disableNetConnect()`

阻止所有實際的網路請求。未匹配的請求會拋出錯誤。

### `fetchMock.enableNetConnect(matcher?)`

允許實際的網路請求通過。不帶參數時允許所有請求。帶 matcher 時僅匹配的主機可通過。

```typescript
// 允許所有網路請求
fetchMock.enableNetConnect();

// 允許特定主機（精確匹配）
fetchMock.enableNetConnect('api.example.com');

// 允許匹配 RegExp 的主機
fetchMock.enableNetConnect(/\.example\.com$/);

// 允許匹配函式的主機
fetchMock.enableNetConnect((host) => host.endsWith('.test'));
```

| 參數      | 型別                                            | 必要 | 說明                         |
| --------- | ----------------------------------------------- | ---- | ---------------------------- |
| `matcher` | `string \| RegExp \| (host: string) => boolean` | 否   | 主機匹配器。省略時允許全部。 |

### `fetchMock.defaultReplyHeaders(headers)`

設定每個回應都會包含的預設 headers。每個回應的 headers 會與預設值合併並覆蓋。

```typescript
fetchMock.defaultReplyHeaders({
  'x-request-id': 'test-123',
  'cache-control': 'no-store',
});

// 此回應會同時包含 x-request-id 和 content-type
fetchMock
  .get('https://api.example.com')
  .intercept({ path: '/data' })
  .reply(200, { ok: true }, { headers: { 'content-type': 'application/json' } });
```

> `reset()` 會清除預設回應 headers。

| 參數      | 型別                     | 必要 | 說明                       |
| --------- | ------------------------ | ---- | -------------------------- |
| `headers` | `Record<string, string>` | 是   | 每個回應都要包含的 headers |

### `fetchMock.enableCallHistory()`

啟用呼叫歷史記錄。這是預設狀態。

### `fetchMock.disableCallHistory()`

停用呼叫歷史記錄。請求仍會被攔截和回應，但不會被記錄。適用於效能敏感的測試以減少開銷。

```typescript
fetchMock.disableCallHistory();
// ... 請求被攔截但不被記錄
fetchMock.enableCallHistory();
// ... 請求現在會被記錄
```

### `fetchMock.getCallHistory()`

回傳 `MockCallHistory` 實例。Cloudflare 相容的 `fetchMock.calls` 別名。

### `fetchMock.clearCallHistory()`

清除所有已記錄的呼叫。Cloudflare 相容的 `fetchMock.calls.clear()` 別名。

### `fetchMock.clearAllCallHistory()`

`clearCallHistory()` 的別名。

### `fetchMock.assertNoPendingInterceptors()`

若有任何已註冊的攔截器尚未被消耗，會拋出錯誤。這是一個**純斷言** — 不會清除呼叫歷史、攔截器或 handlers。使用 `reset()` 來清理狀態。

```typescript
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

### `fetchMock.reset()`

清除所有攔截器、呼叫歷史、預設回應 headers 和 MSW handlers。將實例重設為乾淨狀態，但不會停止 server。建議在 `afterEach` 中於斷言無待處理攔截器之後呼叫。

```typescript
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

### `fetchMock.pendingInterceptors()`

回傳未消耗的攔截器陣列，包含中繼資料：

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

註冊一個用於匹配請求的攔截器。

```typescript
pool.intercept({
  path: '/users',
  method: 'GET',
});
```

回傳：`MockInterceptor`

#### `InterceptOptions`

| 屬性      | 型別                                                             | 必要 | 說明                         |
| --------- | ---------------------------------------------------------------- | ---- | ---------------------------- |
| `path`    | `string \| RegExp \| (path: string) => boolean`                  | 是   | 要匹配的 URL 路徑名          |
| `method`  | `'GET' \| 'POST' \| 'PUT' \| 'DELETE' \| 'PATCH'`                | 否   | HTTP 方法（預設：`'GET'`）   |
| `headers` | `Record<string, string \| RegExp \| (value: string) => boolean>` | 否   | Header 匹配器                |
| `body`    | `string \| RegExp \| (body: string) => boolean`                  | 否   | 請求 body 匹配器             |
| `query`   | `Record<string, string>`                                         | 否   | Query 參數匹配器（精確匹配） |

#### 路徑匹配

```typescript
// 精確字串
.intercept({ path: '/users' })

// RegExp
.intercept({ path: /^\/users\/\d+$/ })

// 函式
.intercept({ path: (p) => p.startsWith('/users') })
```

#### Header 匹配

```typescript
.intercept({
  path: '/api',
  method: 'POST',
  headers: {
    'content-type': 'application/json',         // 精確匹配
    authorization: /^Bearer /,                   // 正則
    'x-custom': (v) => v.includes('special'),   // 函式
  },
})
```

#### Body 匹配

```typescript
.intercept({
  path: '/api',
  method: 'POST',
  body: '{"key":"value"}',            // 精確匹配
  // body: /keyword/,                 // 正則
  // body: (b) => b.includes('key'),  // 函式
})
```

#### Query 參數

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

使用靜態 body 定義模擬回應。

```typescript
// 靜態 body
.reply(200, { users: [] })

// 附帶回應 headers
.reply(200, { users: [] }, { headers: { 'x-request-id': '123' } })
```

### `interceptor.reply(status, callback)`

使用動態 body 回呼定義模擬回應。

```typescript
// 回呼（接收請求資訊）
.reply(200, (req) => {
  const input = JSON.parse(req.body!);
  return { echo: input };
})
```

### `interceptor.reply(callback)`

單一回呼形式 — 完全控制狀態碼、body 和回應選項。

```typescript
.reply((req) => {
  const data = JSON.parse(req.body!);
  return {
    statusCode: 201,
    data: { id: '1', ...data },
    responseOptions: { headers: { 'x-created': 'true' } },
  };
})
```

回呼接收 `{ body: string | null }`，必須回傳（或解析為）：

```typescript
interface SingleReplyResult {
  statusCode: number;
  data: unknown;
  responseOptions?: { headers?: Record<string, string> };
}
```

回傳：`MockReplyChain`

| 參數       | 型別                                   | 說明             |
| ---------- | -------------------------------------- | ---------------- |
| `status`   | `number`                               | HTTP 狀態碼      |
| `body`     | `unknown \| (req) => unknown`          | 回應 body 或回呼 |
| `callback` | `SingleReplyCallback`                  | 完全控制回呼     |
| `options`  | `{ headers?: Record<string, string> }` | 回應 headers     |

### `interceptor.replyWithError(error?)`

回應一個網路錯誤（模擬連線失敗）。

```typescript
.replyWithError(new Error('connection refused'))
```

回傳：`MockReplyChain`

| 參數    | 型別    | 必要 | 說明                                                                         |
| ------- | ------- | ---- | ---------------------------------------------------------------------------- |
| `error` | `Error` | 否   | 可選的錯誤實例。為 API 相容性而接受，但內部不使用 — 回應一律為通用網路錯誤。 |

---

## `MockReplyChain`

### `chain.times(n)`

攔截器精確匹配 `n` 次後即被消耗。

```typescript
.reply(200, { ok: true }).times(3)
```

### `chain.persist()`

攔截器無限期匹配（永不消耗）。

```typescript
.reply(200, { ok: true }).persist()
```

### `chain.delay(ms)`

在回應送出前加入延遲。

```typescript
.reply(200, { ok: true }).delay(500)
```

### `chain.replyContentLength()`

根據 JSON 序列化後的 body 大小，自動加入 `Content-Length` header。

```typescript
.reply(200, { ok: true }).replyContentLength()
// 回應會包含 Content-Length: 13
```

---

## `MockCallHistory`

追蹤所有通過模擬 server 的請求。

### `history.length`

回傳已記錄的呼叫數量。

```typescript
expect(fetchMock.calls.length).toBe(3);
```

### `history.called(criteria?)`

若有任何呼叫匹配給定條件則回傳 `true`，未提供條件時則檢查是否有任何呼叫。

```typescript
// 有任何呼叫記錄嗎？
expect(fetchMock.calls.called()).toBe(true);

// 有匹配篩選條件的呼叫嗎？
expect(fetchMock.calls.called({ method: 'POST' })).toBe(true);
expect(fetchMock.calls.called(/\/users/)).toBe(true);
expect(fetchMock.calls.called((log) => log.path === '/users')).toBe(true);
```

### `history.calls()`

回傳所有已記錄的 `MockCallHistoryLog` 條目的副本。

### `history.firstCall(criteria?)`

回傳第一個記錄的呼叫，若無則回傳 `undefined`。可選擇性以條件篩選。

```typescript
const first = fetchMock.calls.firstCall();
const firstPost = fetchMock.calls.firstCall({ method: 'POST' });
```

### `history.lastCall(criteria?)`

回傳最近一次記錄的呼叫，若無則回傳 `undefined`。可選擇性以條件篩選。

```typescript
const last = fetchMock.calls.lastCall();
const lastPost = fetchMock.calls.lastCall({ method: 'POST' });
```

### `history.nthCall(n, criteria?)`

回傳第 n 次呼叫（1-indexed），若無則回傳 `undefined`。可選擇性以條件篩選。

```typescript
const second = fetchMock.calls.nthCall(2);
const secondPost = fetchMock.calls.nthCall(2, { method: 'POST' });
```

### `history.clear()`

移除所有已記錄的呼叫。

### `history.filterCalls(criteria, options?)`

彈性篩選，有三種多載：

```typescript
// 函式謂詞
history.filterCalls((log) => log.body?.includes('test'));

// RegExp（對 log.toString() 測試）
history.filterCalls(/POST.*\/users/);

// 結構化條件
history.filterCalls(
  { method: 'POST', path: '/users' },
  { operator: 'AND' } // 預設：'OR'
);
```

#### `CallHistoryFilterCriteria`

| 屬性       | 型別     | 說明       |
| ---------- | -------- | ---------- |
| `method`   | `string` | HTTP 方法  |
| `path`     | `string` | URL 路徑名 |
| `origin`   | `string` | URL origin |
| `protocol` | `string` | URL 協定   |
| `host`     | `string` | URL 主機   |
| `port`     | `string` | URL 連接埠 |
| `hash`     | `string` | URL hash   |
| `fullUrl`  | `string` | 完整 URL   |

### `history.filterCallsByMethod(filter)`

```typescript
history.filterCallsByMethod('POST');
history.filterCallsByMethod(/^P/); // POST、PUT、PATCH
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

### 迭代

`MockCallHistory` 實作了 `Symbol.iterator`：

```typescript
for (const call of history) {
  console.log(call.method, call.path);
}
```

---

## `MockCallHistoryLog`

每筆記錄的呼叫都是 `MockCallHistoryLog` 實例，包含以下屬性：

| 屬性           | 型別                     | 說明                                |
| -------------- | ------------------------ | ----------------------------------- |
| `method`       | `string`                 | HTTP 方法                           |
| `fullUrl`      | `string`                 | 完整 URL                            |
| `origin`       | `string`                 | URL origin（`https://example.com`） |
| `path`         | `string`                 | URL 路徑名（`/users`）              |
| `searchParams` | `Record<string, string>` | Query 參數                          |
| `headers`      | `Record<string, string>` | 請求 headers                        |
| `body`         | `string \| null`         | 請求 body                           |
| `protocol`     | `string`                 | URL 協定（`https:`）                |
| `host`         | `string`                 | URL 主機                            |
| `port`         | `string`                 | URL 連接埠                          |
| `hash`         | `string`                 | URL hash                            |

### `log.json()`

將請求 body 解析為 JSON。若 body 為 `null` 則回傳 `null`。

```typescript
const call = fetchMock.calls.lastCall()!;
const data = call.json() as { name: string };
expect(data.name).toBe('Alice');
```

### `log.toMap()`

回傳包含所有 log 屬性的 `Map`。

```typescript
const map = call.toMap();
expect(map.get('method')).toBe('POST');
```

### `log.toString()`

回傳以管線符號分隔的字串表示，用於除錯和 RegExp 匹配。

```typescript
call.toString();
// "method->POST|protocol->https:|host->api.example.com|port->|origin->https://api.example.com|path->/users|hash->|fullUrl->https://api.example.com/users"
```
