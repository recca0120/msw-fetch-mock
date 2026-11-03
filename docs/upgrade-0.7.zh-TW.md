# 升級到 0.7

0.7.0 新增了對 MSW v3 的支援，MSW v1 和 v2 也照常可以使用。msw-fetch-mock 本身的 API 沒有改變：`activate()`、`get().intercept().reply()`、call history，以及 `onUnhandledRequest` 選項，在每個 MSW 版本下的用法都一樣。MSW 各版本之間的差異由 msw-fetch-mock 內部處理。例如 MSW v3 把 `onUnhandledRequest` 改名成 `onUnhandledFrame`，你照樣傳 `onUnhandledRequest` 就好。

以下依照你使用的 MSW 版本，列出升級時要確認的地方。如果你是從 **0.6.2 或更早的版本**升級，也請一併閱讀[0.6.3 起的改變](#063-起的改變)。

## 快速對照

| 你使用的是 | 升級到 0.7 時要做的事 |
| --- | --- |
| MSW v2 | 通常不用改 |
| MSW v3（新支援） | 安裝 `msw@^3`、使用 Node.js 22.12 以上、重新產生瀏覽器的 worker 檔。建議 await `deactivate()` |
| MSW v1（`/legacy`） | 確認有傳入 server：`createFetchMock(rest, server)` |
| 不使用 MSW（`/native`） | 不用改 |

## MSW v3

```bash
npm install -D msw@^3 msw-fetch-mock
```

- **需要 Node.js 22.12 以上**：這是 MSW v3 本身的要求。msw-fetch-mock 搭配 MSW v1、v2 或 native 模式時，仍然支援 Node.js 18 以上。
- **import 路徑不變**：`msw-fetch-mock`（自動偵測）、`msw-fetch-mock/node`、`msw-fetch-mock/browser`。
- **CommonJS 專案可以使用**：需要 Node.js 22.12 以上。MSW v3 只提供 ESM，Node.js 會透過 `require(esm)` 載入它。Jest 的 CJS 和 ESM 都有 e2e 測試涵蓋。
- **瀏覽器：要重新產生 worker 檔**。安裝 v3 之後，MSW 要求 worker 檔的版本和安裝的版本一致：

  ```bash
  npx msw init public
  ```

- **可以自己先啟動 worker**：如果你的 setup 在 `fetchMock.activate()` 之前就呼叫了 `worker.start()`，msw-fetch-mock 不會再啟動一次。在 MSW v3 下，第二次呼叫 `start()` 會丟錯。msw-fetch-mock 在 `deactivate()` 時也不會停掉這個 worker，所以它的 catch-all handler 會留在 worker 上，直到你 reset worker 的 handler 為止，和外部 server 的處理方式相同。
- **瀏覽器模式下建議 await `deactivate()`**：MSW v3 的 `worker.stop()` 是非同步的：

  ```ts
  afterAll(async () => {
    await fetchMock.deactivate();
  });
  ```

  不 await 也照樣能用，清理動作會同步完成，只是不會等到 worker 完全停止。
- **fake timers**：MSW v3 不再修改 `setTimeout`。使用 fake timers 時，照常推進時間就好，例如 `await vi.advanceTimersByTimeAsync(ms)`，延遲的回應（`.delay(ms)`）就會送出。

MSW v3 本身的改變（handler、cookie、GraphQL 等），請參考 [MSW v3 的 release notes](https://github.com/mswjs/msw/releases/tag/v3.0.0)。

## MSW v2

通常不需要任何修改，只要確認以下兩點：

- **`deactivate()` 現在回傳 `Promise<void>`**：可以 `await`，但不是必須的，原本沒有 `await` 的寫法照樣能用。如果 `worker.stop()` 失敗，只有 await `deactivate()` 的呼叫端會收到錯誤；沒有 await 的呼叫端不會出現 unhandled rejection。如果你的 TypeScript 程式碼依賴原本的 `void` 回傳型別，或是有禁止未處理 Promise 的 lint 規則，可能需要補上 `await` 或 `void`。
- **刪除了 `HandlerFactory.createHandler`**：只有直接呼叫這個方法的人才會受影響。它是一個 FetchMock 從來沒有用到的底層 API。如果想自己註冊單一的 MSW 路由，請直接使用 MSW：v2/v3 是 `http.get(url, resolver)`，v1 是 `rest.get(url, resolver)`。自訂的 `HandlerFactory` 實作可以直接拿掉這個方法。

## MSW v1（`msw-fetch-mock/legacy`）

- 照樣使用 `createFetchMock(rest, server)`。**`server` 參數是必填的**。從 0.6.3 開始，不傳 server 會直接丟出清楚的錯誤；0.6.3 之前，依照 import 的順序，有時會丟錯，有時會默默地沒有 mock 到。
- 上面提到的「刪除 `createHandler`」也適用於 `createLegacyHandlerFactory(rest)`。

## 0.6.3 起的改變

如果你是從 0.6.2 或更早的版本升級，以下 0.6.3 的改變也會影響你：

- **`timeout` 在 MSW 模式（node/browser）下也會生效**：文件寫的 30 秒預設值，以前只有 native 模式會套用。現在如果回應的延遲超過 30 秒，或是在請求還沒結束時用 fake timers 把時間往前推超過 30 秒，就會以 `TimeoutError` 失敗。要關閉 timeout：

  ```ts
  await fetchMock.activate({ timeout: 0 });
  ```

- **`forceConnectionClose` 在 MSW 模式下也會生效**。
- **`replyContentLength()` 改成回報實際送出的 body 的 UTF-8 位元組數**：以前字串 body 會多算 JSON 的兩個引號，而且算的是字元數而不是位元組數。stream body 則不會再設定這個 header。

完整的改動請見 [CHANGELOG.md](../CHANGELOG.md)。
