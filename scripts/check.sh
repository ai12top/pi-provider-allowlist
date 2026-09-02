#!/usr/bin/env bash
# 发布前检查：JSON 校验、类型检查、单元测试、npm pack 试打包
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1. package.json 校验 =="
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"

echo "== 2. 开发依赖安装（typescript + @earendil-works/pi-coding-agent，仅供本地检查）=="
if [ ! -d node_modules/typescript ]; then
  npm install --no-audit --no-fund 2>&1 | tail -1
fi

echo "== 3. TypeScript 类型检查 =="
npx tsc --noEmit
echo "OK"

echo "== 4. 单元测试 =="
node --test 2>&1 | tail -6

echo "== 5. npm pack 试打包 =="
npm pack --dry-run 2>&1 | grep -E "total files|package size|LICENSE|index.ts"
echo "全部检查通过"
