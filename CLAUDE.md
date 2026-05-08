# msw-fetch-mock

## 發佈流程

發佈到 npm 透過 GitHub Actions 自動完成，使用 OIDC Trusted Publishing（不需要 NPM_TOKEN）。

### 步驟

1. 更新 `package.json` 的 `version`
2. Commit 並 push 到 `main`
3. 建立 tag 並 push：
   ```bash
   git tag v<version>
   git push origin v<version>
   ```
4. GitHub Actions `release.yml` 會自動 build + publish 到 npm + 建立 GitHub Release

### 注意事項

- Tag 格式必須是 `v*`（例如 `v0.6.0`）
- npmjs.com 上已設定 Trusted Publisher（repo: `recca0120/msw-fetch-mock`，workflow: `release.yml`）
- `pnpm-lock.yaml` 必須與 `package.json` 同步，否則 CI 會因 `frozen-lockfile` 失敗
- 在 monorepo 中開發時，需要在獨立環境（`git clone` 到 temp dir）重新生成 `pnpm-lock.yaml`

## 開發

```bash
pnpm test          # 單元測試
pnpm test:e2e      # E2E 測試
pnpm lint          # biome check
pnpm typecheck     # tsc --noEmit
pnpm knip          # 未使用程式碼檢查
```

### Git Hooks (lefthook)

- **pre-commit**: biome check --write（自動修正格式）
- **pre-push**: typecheck + knip + test（並行執行）
