#!/usr/bin/env bash
# 一步发版：bump 版本 → 检查 → 提交 → push → 打 tag → push tag
# tag push 之后由 .github/workflows/release.yml 自动跑 npm publish（OIDC 可信发布）。
#
# 用法：
#   bash scripts/release.sh patch            # 0.2.1 → 0.2.2
#   bash scripts/release.sh minor            # 0.2.1 → 0.3.0
#   bash scripts/release.sh 1.0.0            # 直接指定版本
#   bash scripts/release.sh patch --dry-run  # 只打印计划，不改任何东西
#   bash scripts/release.sh patch -y         # 跳过确认（脚本/自动化用）
set -euo pipefail
cd "$(dirname "$0")/.."

DRY_RUN=0
ASSUME_YES=0
BUMP=""
for arg in "$@"; do
  case "$arg" in
    -n | --dry-run) DRY_RUN=1 ;;
    -y | --yes) ASSUME_YES=1 ;;
    -*) echo "✗ 未知参数：$arg" >&2; exit 2 ;;
    *) BUMP="$arg" ;;
  esac
done

if [ -z "$BUMP" ]; then
  echo "用法：bash scripts/release.sh <patch|minor|major|x.y.z> [--dry-run|-y]" >&2
  exit 2
fi

# 1. 前置条件：工作区干净、在 main 上、与远端同步
git diff --quiet || { echo "✗ 有未提交改动，先提交（发版提交只应包含版本号）" >&2; exit 1; }
git diff --cached --quiet || { echo "✗ 有已暂存未提交的改动，先提交" >&2; exit 1; }

branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$branch" != "main" ]; then
  echo "✗ 当前分支是 ${branch}，发版请在 main 上" >&2
  exit 1
fi

git fetch --quiet origin
local_head=$(git rev-parse HEAD)
remote_head=$(git rev-parse origin/main)
if [ "$local_head" != "$remote_head" ]; then
  echo "✗ 本地 main ($local_head) 与 origin/main ($remote_head) 不一致，先 pull/push" >&2
  exit 1
fi

name=$(node -p "require('./package.json').name")
current=$(node -p "require('./package.json').version")

new=$(node -e '
const [cur, bump] = process.argv.slice(1);
const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(cur);
if (!m) { console.error("✗ 当前版本号不是 x.y.z：" + cur); process.exit(1); }
let maj = Number(m[1]), min = Number(m[2]), pat = Number(m[3]);
if (/^\d+\.\d+\.\d+$/.test(bump)) { console.log(bump); process.exit(0); }
if (bump === "major") { maj++; min = 0; pat = 0; }
else if (bump === "minor") { min++; pat = 0; }
else if (bump === "patch") { pat++; }
else { console.error("✗ bump 只能是 patch|minor|major 或 x.y.z，收到：" + bump); process.exit(1); }
console.log(maj + "." + min + "." + pat);
' "$current" "$BUMP")

tag="v$new"
if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
  echo "✗ 本地已存在 tag $tag" >&2
  exit 1
fi
if git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  echo "✗ 远端已存在 tag $tag" >&2
  exit 1
fi
if npm view "$name@$new" version >/dev/null 2>&1; then
  echo "✗ npm 上已存在 $name@${new}，不能重复发布" >&2
  exit 1
fi

cat <<PLAN
即将发版：
  包      $name
  版本    $current → $new
  tag     $tag
  步骤    1) 同步 package.json / package-lock.json 版本号
          2) mise run check + scripts/verify-release-tag.sh
          3) git commit "chore: release $new"
          4) git push origin main
          5) git tag $tag && git push origin $tag → CI 自动 npm publish
PLAN

if [ "$DRY_RUN" = "1" ]; then
  echo "（--dry-run：未做任何改动）"
  exit 0
fi

if [ "$ASSUME_YES" != "1" ]; then
  if [ ! -t 0 ]; then
    echo "✗ 非交互环境，请显式加 -y 确认" >&2
    exit 2
  fi
  read -r -p "确认执行？输入 yes 继续：" ans
  if [ "$ans" != "yes" ]; then
    echo "已取消"
    exit 1
  fi
fi

# 2. 同步版本号
# package.json 用文本替换，避免 npm version 把数组字段重排成多行（会污染 diff）
node -e '
const fs = require("fs");
const file = process.argv[1], from = process.argv[2], to = process.argv[3];
const src = fs.readFileSync(file, "utf8");
const re = new RegExp("(^\\s*\"version\":\\s*\")" + from.replace(/\./g, "\\.") + "(\")", "m");
if (!re.test(src)) { console.error("✗ 在 " + file + " 里找不到 version " + from); process.exit(1); }
fs.writeFileSync(file, src.replace(re, "$1" + to + "$2"));
' package.json "$current" "$new"

node -e '
const fs = require("fs");
const next = process.argv[1];
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
lock.version = next;
if (lock.packages && lock.packages[""]) lock.packages[""].version = next;
fs.writeFileSync("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
' "$new"

# 3. 本地把关：检查 + 版本一致性守卫（用即将生成的 tag 预演）
mise run check
bash scripts/verify-release-tag.sh "$tag"

# 4. 提交、push、打 tag（tag push 触发 CI 发布）
git add package.json package-lock.json
git commit -q -m "chore: release $new"
git push origin main
git tag "$tag"
git push origin "$tag"

echo "✓ 已推送 ${tag}；CI 会自动发布 $name@$new"
echo "  查看进度：gh run list --workflow=release.yml --limit 1"