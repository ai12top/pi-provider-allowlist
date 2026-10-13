#!/usr/bin/env bash
# 发版守卫：tag 必须形如 vX.Y.Z，且与 package.json / package-lock.json 版本一致，
# 该版本在 npm 上必须尚未占用。
# 用法：bash scripts/verify-release-tag.sh [tag]
#   - CI 里不传参，从 GITHUB_REF_NAME 取触发 tag
#   - 本地不传参时，从当前 HEAD 上的 tag 取
#   - scripts/release.sh 会传入即将创建的 tag 做预演
set -euo pipefail
cd "$(dirname "$0")/.."

tag="${1:-${GITHUB_REF_NAME:-$(git describe --exact-match --tags HEAD 2>/dev/null || true)}}"
if [ -z "$tag" ]; then
  echo "✗ 无法确定当前 tag：请从 tag 触发工作流，或本地 git checkout <tag> 后再跑" >&2
  exit 1
fi

name=$(node -p "require('./package.json').name")
version=$(node -p "require('./package.json').version")
lock=$(node -p "require('./package-lock.json').version")

echo "tag=$tag  package.json=$version  package-lock.json=$lock  name=$name"

if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "✗ 版本号不是 x.y.z 形式：$version" >&2
  exit 1
fi

if [ "$tag" != "v$version" ]; then
  echo "✗ tag 与 package.json 版本不一致：当前 package.json 是 ${version}，tag 应为 v$version" >&2
  exit 1
fi

if [ "$lock" != "$version" ]; then
  echo "✗ package-lock.json 版本 ($lock) 与 package.json ($version) 不一致，先同步（mise run release 会自动同步）" >&2
  exit 1
fi

if npm view "$name@$version" version >/dev/null 2>&1; then
  echo "✗ npm 上已存在 $name@${version}：先 bump 版本再打 tag，不能覆盖已发布版本" >&2
  exit 1
fi

echo "✓ tag / 两个版本字段一致，且 $name@$version 在 npm 上尚未占用"