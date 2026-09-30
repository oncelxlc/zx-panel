#!/usr/bin/env bash
# 仅运行开发 API；管道关闭或后端退出时清理本轮 Go 进程组。
set -uo pipefail

setsid go run -tags devassets ./cmd/server &
backend=$!
# Windows 父进程持有 stdin；EOF 表示它已退出或要求停止后端。
cat <&0 >/dev/null &
watcher=$!

# cleanup 给服务现有的 35 秒排空留出时间，再终止仍未退出的本轮进程。
cleanup() {
  kill "$watcher" 2>/dev/null || true
  kill -TERM -- "-$backend" 2>/dev/null || true
  local deadline=$((SECONDS + 40))
  while kill -0 -- "-$backend" 2>/dev/null; do
    if (( SECONDS >= deadline )); then
      kill -KILL -- "-$backend" 2>/dev/null || true
      break
    fi
    sleep 0.1
  done
  wait "$backend" "$watcher" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
wait -n "$backend" "$watcher"
exit $?
