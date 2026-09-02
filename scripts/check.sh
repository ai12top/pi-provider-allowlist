#!/usr/bin/env bash
# 发布前检查：JSON 校验、扩展语法、单元测试、npm pack 试打包
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1. package.json 校验 =="
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('OK')"

echo "== 2. 扩展语法 =="
node --check extensions/provider-allowlist.js
echo "OK"

echo "== 3. 依赖安装（peerDependency: @earendil-works/pi-coding-agent）=="
if [ ! -d node_modules/@earendil-works/pi-coding-agent ]; then
  npm install --no-audit --no-fund 2>&1 | tail -2
  echo "已安装"
else
  echo "已存在"
fi

echo "== 4. 单元测试 =="
node --test 2>&1 | tail -12

echo "== 5. npm pack 试打包 =="
npm pack --dry-run 2>&1 | grep -E "total files|package size|LICENSE"
echo "全部检查通过"
