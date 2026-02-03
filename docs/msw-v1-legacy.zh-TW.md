# MSW v1 Legacy 指南

如果你正在使用 MSW v1（`msw@^1.x`），請使用 `msw-fetch-mock/legacy` 子路徑匯出。API 與 v2 版本相同 — 只有設定方式不同。

## 安裝

```bash
npm install -D msw-fetch-mock msw@^1
```

## 設定

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

## API 對照

| MSW v2（`msw-fetch-mock`）                   | MSW v1（`msw-fetch-mock/legacy`）              |
| -------------------------------------------- | ---------------------------------------------- |
| `import { fetchMock } from 'msw-fetch-mock'` | 無單例 — 必須使用 `createFetchMock`            |
| `import { createFetchMock } from '.../node'` | `import { createFetchMock } from '.../legacy'` |
| `createFetchMock(server?)`                   | `createFetchMock(rest, server?)`               |
| `import { http } from 'msw'`                 | `import { rest } from 'msw'`                   |

## 主要差異

| 面向             | MSW v2                                    | MSW v1（Legacy）                  |
| ---------------- | ----------------------------------------- | --------------------------------- |
| 匯入             | `msw-fetch-mock` 或 `msw-fetch-mock/node` | `msw-fetch-mock/legacy`           |
| 工廠函式         | `createFetchMock(server?)`                | `createFetchMock(rest, server?)`  |
| 單例             | `fetchMock` 預建實例                      | 不提供 — 使用 `createFetchMock`   |
| Handler 內部實作 | 使用 `http.*` + `HttpResponse`            | 使用 `rest.*` + `(req, res, ctx)` |
| MSW 版本         | `msw@^2.12.7`                             | `msw@^1.0.0`                      |

## 匯出項目

`msw-fetch-mock/legacy` 子路徑匯出：

| 匯出                             | 類型 | 說明                                |
| -------------------------------- | ---- | ----------------------------------- |
| `createFetchMock(rest, server?)` | 函式 | 建立適用於 MSW v1 的 FetchMock 實例 |
| `FetchMock`                      | 類別 | 核心模擬類別（與 v2 相同）          |
| `createLegacyHandlerFactory`     | 函式 | 低階：建立 v1 相容的 handler 工廠   |
| `LegacyRestApi`                  | 型別 | MSW v1 的 `rest` 物件型別           |

## 從 MSW v1 遷移到 v2

當你將 MSW 從 v1 升級到 v2 時，更新你的匯入：

```diff
- import { rest } from 'msw';
- import { createFetchMock } from 'msw-fetch-mock/legacy';
- const fetchMock = createFetchMock(rest, server);
+ import { createFetchMock } from 'msw-fetch-mock/node';
+ const fetchMock = createFetchMock(server);
```

或使用單例進行獨立模式：

```diff
- import { rest } from 'msw';
- import { setupServer } from 'msw/node';
- import { createFetchMock } from 'msw-fetch-mock/legacy';
- const server = setupServer();
- const fetchMock = createFetchMock(rest, server);
+ import { fetchMock } from 'msw-fetch-mock';
```

其餘 API（`get()`、`intercept()`、`reply()`、`calls` 等）維持不變。
