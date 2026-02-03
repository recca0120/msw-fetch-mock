# msw-fetch-mock

[![CI](https://github.com/recca0120/msw-fetch-mock/actions/workflows/ci.yml/badge.svg)](https://github.com/recca0120/msw-fetch-mock/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/msw-fetch-mock.svg)](https://www.npmjs.com/package/msw-fetch-mock)
[![license](https://img.shields.io/npm/l/msw-fetch-mock.svg)](https://github.com/recca0120/msw-fetch-mock/blob/main/LICENSE.md)

[English](README.md) | [繁體中文](README.zh-TW.md)

基於 [MSW](https://mswjs.io/)（Mock Service Worker）的 Undici 風格 fetch mock API。

如果你熟悉 Cloudflare Workers 的 `fetchMock`（來自 `cloudflare:test`）或 Node.js undici 的 `MockAgent`，你已經會使用這個 API 了。

透過 subpath exports 同時支援 **Node.js**（`msw/node`）和**瀏覽器**（`msw/browser`）環境。

## 系統需求

- **Node.js** >= 18
- **MSW** ^1.0.0（透過 `/legacy`）或 ^2.12.7

## 安裝

```bash
npm install -D msw-fetch-mock msw
```

`msw` 是 peer dependency — 需要自行安裝你的版本。

## 快速開始

### Node.js（Vitest、Jest）

```typescript
// 可使用根路徑匯入或明確的 /node 子路徑
import { fetchMock } from 'msw-fetch-mock';
// import { fetchMock } from 'msw-fetch-mock/node';

beforeAll(() => fetchMock.activate({ onUnhandledRequest: 'error' }));
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});

it('模擬 GET 請求', async () => {
  fetchMock
    .get('https://api.example.com')
    .intercept({ path: '/users', method: 'GET' })
    .reply(200, { users: [{ id: '1', name: 'Alice' }] });

  const res = await fetch('https://api.example.com/users');
  const data = await res.json();

  expect(data.users).toHaveLength(1);
});
```

### 瀏覽器（Storybook、Vitest Browser Mode）

```typescript
import { setupWorker } from 'msw/browser';
import { createFetchMock } from 'msw-fetch-mock/browser';

const worker = setupWorker();
const fetchMock = createFetchMock(worker);

beforeAll(async () => {
  await fetchMock.activate({ onUnhandledRequest: 'error' });
});
afterAll(() => fetchMock.deactivate());
afterEach(() => {
  fetchMock.assertNoPendingInterceptors();
  fetchMock.reset();
});
```

### 搭配現有的 MSW server

如果你已經在使用 MSW，可以傳入你的 server 來共用同一個攔截器：

```typescript
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { createFetchMock } from 'msw-fetch-mock';

const server = setupServer(http.get('/api/users', () => HttpResponse.json([{ id: 1 }])));
const fetchMock = createFetchMock(server);

beforeAll(() => server.listen());
afterAll(() => server.close());
afterEach(() => {
  server.resetHandlers();
  fetchMock.assertNoPendingInterceptors();
});
```

> **注意：** 同一時間只能有一個 MSW server 處於啟動狀態。如果已有 server 在監聽中，獨立模式的 `activate()` 會拋出錯誤。請使用 `createFetchMock(server)` 來共用現有的 server。

### Legacy（MSW v1）

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
```

詳見 [MSW v1 Legacy 指南](docs/msw-v1-legacy.zh-TW.md)。

## 未處理的請求

預設情況下 `activate()` 使用 `'error'` 模式 — 未匹配的請求會導致 `fetch()` 拒絕。這包含對**已消耗**攔截器的請求（一次性攔截器使用後，其 handler 會從 MSW 中移除）。

```typescript
// 拒絕未匹配的請求（預設行為）
fetchMock.activate();
fetchMock.activate({ onUnhandledRequest: 'error' });

// 記錄警告但允許通過
fetchMock.activate({ onUnhandledRequest: 'warn' });

// 靜默允許通過
fetchMock.activate({ onUnhandledRequest: 'bypass' });

// 自訂回呼
fetchMock.activate({
  onUnhandledRequest: (request, print) => {
    if (request.url.includes('/health')) return; // 忽略
    print.error(); // 阻擋其他所有請求
  },
});
```

> `enableNetConnect()` 的優先順序高於 `onUnhandledRequest` — 允許的主機一律直接通過。

## API 概覽

### 匯入路徑

| 路徑                     | 環境                          | MSW 版本 |
| ------------------------ | ----------------------------- | -------- |
| `msw-fetch-mock`         | Node.js（re-exports `/node`） | v2       |
| `msw-fetch-mock/node`    | Node.js                       | v2       |
| `msw-fetch-mock/browser` | 瀏覽器                        | v2       |
| `msw-fetch-mock/legacy`  | Node.js（MSW v1）             | v1       |

### `fetchMock`（單例）

預先建立的 `FetchMock` 實例，適用於獨立使用。匯入後直接呼叫 `activate()` 即可 — 無需額外設定。
可從 `msw-fetch-mock` 和 `msw-fetch-mock/node` 匯入。

### `createFetchMock(server?)` / `createFetchMock(worker)`

建立 `FetchMock` 的工廠函式，會自動搭配對應的 adapter。

- Node：`createFetchMock(server?)` — 可選擇性傳入現有的 MSW `SetupServer`
- 瀏覽器：`createFetchMock(worker)` — 傳入 MSW `SetupWorker`（必要）
- Legacy：`createFetchMock(rest, server?)` — 傳入 MSW v1 的 `rest` 物件

### `new FetchMock(adapter?)`

使用明確的 `MswAdapter` 建立 `FetchMock` 實例。可使用 `NodeMswAdapter` 或 `BrowserMswAdapter`。

### 攔截與回應

```typescript
fetchMock
  .get(origin)                              // string、RegExp 或 function
  .intercept({ path, method, headers, body, query })  // 匹配條件
  .reply(status, body, options)             // 定義回應
  .times(n) / .persist();                   // 重複控制
```

### 呼叫歷史

```typescript
fetchMock.calls.lastCall(); // 最近一次
fetchMock.calls.firstCall(); // 最早一次
fetchMock.calls.nthCall(2); // 第 2 次呼叫（1-indexed）
fetchMock.calls.filterCalls({ method: 'POST', path: '/users' }, { operator: 'AND' });
```

### 斷言與清理

```typescript
fetchMock.assertNoPendingInterceptors(); // 若有未消耗的攔截器則拋出錯誤
fetchMock.reset(); // 清除攔截器 + 呼叫歷史 + handlers
```

## 測試環境

每次 CI 推送都會在以下環境執行 E2E 測試：

| 環境           | 模組系統      | 測試框架            |
| -------------- | ------------- | ------------------- |
| Jest ESM       | ESM (import)  | Jest                |
| Jest CJS       | CJS (require) | Jest                |
| Node.js Test   | ESM (import)  | Node test runner    |
| Node.js CJS    | CJS (require) | Node test runner    |
| Legacy CJS     | CJS (require) | Jest (MSW v1)       |
| Vitest Browser | ESM (import)  | Vitest + Playwright |

## 文件

- [API 參考](docs/api.zh-TW.md) — 完整的 API 細節、匹配選項、回應回呼
- [Cloudflare Workers 遷移指南](docs/cloudflare-migration.zh-TW.md) — 從 `cloudflare:test` fetchMock 遷移
- [MSW v1 Legacy 指南](docs/msw-v1-legacy.zh-TW.md) — 搭配 MSW v1 使用 msw-fetch-mock

## 開發

```bash
pnpm install
pnpm build        # 使用 tsup 建置
pnpm test         # 單元測試（vitest）
pnpm test:e2e     # E2E 測試（jest-esm、jest-cjs、node-test、node-cjs、legacy-cjs）
```

### E2E 測試

E2E 測試驗證已發佈的套件能在不同 runtime 和模組系統下正常運作。腳本會建置、透過 `npm pack` 打包 tarball，然後安裝到每個 `e2e/` 專案中 — 完全模擬 CI 流程。

```bash
# 執行預設套組（跳過 vitest-browser）
pnpm test:e2e

# 執行單一套組
pnpm test:e2e -- node-cjs

# 執行所有套組，包含 vitest-browser（會自動安裝 Playwright）
pnpm test:e2e -- --all
```

可用套組：`jest-esm`、`jest-cjs`、`node-test`、`node-cjs`、`legacy-cjs`、`vitest-browser`

## 授權

[MIT](LICENSE.md)
