# 发版流程

## 一条命令

```bash
mise run release patch            # 0.2.1 → 0.2.2
mise run release minor            # 0.2.1 → 0.3.0
mise run release 1.0.0            # 指定版本
mise run release patch --dry-run  # 只打印计划，不改动
```

脚本依次做：同步版本号（`package.json` + `package-lock.json`）→ `mise run check` → 版本守卫 → 提交 → push `main` 并推 `vX.Y.Z` tag。
**tag 一推，`.github/workflows/release.yml` 自动 `npm publish`**，本机不需要任何 npm 凭证。

## 为什么由 tag 触发

0.2.0 的教训：修复 commit `2d62649` 已经进了 main，但 npm 上的 0.2.0 是在它之前手工发的，用户装到的仍是坏的（`/providers-allowlist` 一打开就 ReferenceError）。发版与 git 无耦合时，「git 已修 / npm 没修」这种偏差只能靠人记得。tag 触发把发版绑到 git 上，顺带由 `scripts/verify-release-tag.sh` 挡住 tag 与版本号不一致、版本已占用两类错误。

## 一次性配置：npm 可信发布（OIDC）

CI 用 OIDC 换取短期凭证发布，不需要 `NPM_TOKEN`，也就不会像长效 token 那样悄悄过期——本机旧 token 失效正是 0.2.1 卡住的原因。

npmjs.com → Packages → pi-provider-allowlist → Settings → Trusted publishing → 加一条 GitHub Actions：

| 字段 | 值 |
| --- | --- |
| Organization or user | `ai12top` |
| Repository | `pi-provider-allowlist` |
| Workflow filename | `release.yml` |
| Allowed actions | **必须勾选允许直接 `npm publish`** |

等价命令行（npm ≥ 11.15，需 2FA）：

```bash
npm trust github pi-provider-allowlist --file release.yml \
  --repo ai12top/pi-provider-allowlist --allow-publish
```

两个坑：

1. 2026-09-03 之后新建的配置默认只允许 `npm stage publish`（要人工 2FA 批准才上架）。不勾 `npm publish` 的话 CI 会「成功」但包没真正公开。
2. 新配置必须在 **2 天内完成首次成功发布**，否则作废，只能删掉重建。

## 验证发版真的成功

CI 最后一步会回查 registry 并打印 `dist.shasum`——绿了才算上架。手工核对：

```bash
npm view pi-provider-allowlist dist-tags
gh run list --workflow=release.yml --limit 1
```

## 失败排查

1. `ENEEDAUTH` / `E404`：`.npmrc` 里存在空 `_authToken`，npm 会认为凭证已配置而跳过 OIDC。workflow 已内置清理步骤；若仍失败，检查是否有人加回了 `registry-url`（见 `actions/setup-node#1551`）。
2. 版本守卫报错：tag 与 `package.json` 不一致，或该版本已在 npm 上——先 bump 再打 tag。
3. `npm publish` 被拒：可信发布配置缺 `npm publish` 权限（见上面坑 1）。
4. npm CLI < 11.5.1：workflow 会自动升级到 `^11.15.0`。