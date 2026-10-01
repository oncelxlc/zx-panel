#!/usr/bin/env bash
# 专用 WSL 验收环境；所有服务、账号、数据库和文件均使用 zx-panel-lab 名称。
set -euo pipefail
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LAB=/opt/zx-panel-lab
REPO=/mnt/e/Github/zx-panel
case "${1:-inspect}" in
inspect)
  for tool in gcc pg_dump pg_restore curl python3 docker; do command -v "$tool" || true; done
  for path in "$LAB" /etc/zx-panel-lab /var/lib/zx-panel-lab /etc/zx-panel/apps; do
    if [ -e "$path" ]; then stat -c '%U %a %n' "$path"; fi
  done
  ;;
prepare)
  test "$(id -u)" = 0
  test "$(ps -p 1 -o comm=)" = systemd
  if [ -e "$LAB" ] && [ ! -f "$LAB/.zx-panel-lab" ]; then echo 'Unrecognized lab directory; refusing changes.' >&2; exit 1; fi
  if systemctl is-active --quiet zx-panel-lab.service; then echo 'Lab is running; use refresh instead of prepare.' >&2; exit 1; fi
  if [ ! -f "$LAB/.zx-panel-lab" ]; then
    for path in /etc/zx-panel-lab /var/lib/zx-panel-lab /etc/systemd/system/zx-panel-lab{,-helper,-postgres,-nginx}.service; do
      if [ -e "$path" ]; then echo "Pre-existing lab path: $path; refusing changes." >&2; exit 1; fi
    done
    for account in zx-lab-web zx-lab-app zx-lab-db; do
      if getent passwd "$account" >/dev/null; then echo "Pre-existing account: $account; refusing changes." >&2; exit 1; fi
    done
    if [ -n "$(ss -H -ltn '( sport = :25433 or sport = :25001 or sport = :27443 )')" ]; then echo 'Lab ports are occupied; refusing changes.' >&2; exit 1; fi
  fi
  nginx_existed=false
  pg_main_existed=false
  if [ -e /etc/nginx/nginx.conf ]; then nginx_existed=true; fi
  if [ -e /etc/postgresql/16/main/start.conf ]; then pg_main_existed=true; fi
  install -d -m 0755 "$LAB"
  touch "$LAB/.zx-panel-lab"
  export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l
  packages=(build-essential postgresql-16 postgresql-client-16 nginx libatomic1)
  missing=false
  for package in "${packages[@]}"; do
    if ! dpkg-query -W -f='${Status}\n' "$package" 2>/dev/null | grep -qx 'install ok installed'; then missing=true; fi
  done
  if [ "$missing" = true ]; then
    apt-get update -qq
    if [ ! -e /usr/sbin/policy-rc.d ]; then
      printf '#!/bin/sh\n# zx-panel-lab temporary install policy\nexit 101\n' > /usr/sbin/policy-rc.d
      chmod 0755 /usr/sbin/policy-rc.d
      trap 'if grep -q "zx-panel-lab temporary install policy" /usr/sbin/policy-rc.d; then rm -- /usr/sbin/policy-rc.d; fi' EXIT
    fi
    apt-get install -y --no-install-recommends "${packages[@]}"
  fi
  if [ "$nginx_existed" = false ]; then systemctl disable nginx.service; fi
  # 仅调整本次安装产生的默认服务，预先存在的 Nginx/PG 配置保持原样。
  if [ "$pg_main_existed" = false ] && [ -e /etc/postgresql/16/main/start.conf ]; then printf 'manual\n' > /etc/postgresql/16/main/start.conf; fi
  for account in zx-lab-web zx-lab-app zx-lab-db; do
    if ! getent passwd "$account" >/dev/null; then useradd --system --user-group --home-dir "$LAB/$account" --shell /usr/sbin/nologin "$account"; fi
  done
  install -d -m 0700 /etc/zx-panel-lab
  install -d -m 0700 -o zx-lab-web -g zx-lab-web /etc/zx-panel-lab/keys /var/lib/zx-panel-lab
  install -d -m 0755 "$LAB/tools" "$LAB/runtimes" "$LAB/apps" "$LAB/bin"
  install -d -m 0750 -o zx-lab-web -g zx-lab-web "$LAB/build-cache" "$LAB/source" "$LAB/reports"
  python3 "$REPO/scripts/acceptance/wsl-lab.py" prepare
  ;;
checks)
  test -f "$LAB/.zx-panel-lab"
  install -d -m 0750 -o zx-lab-web -g zx-lab-web "$LAB/source/docs"
  cp "$REPO/go.mod" "$REPO/go.sum" "$REPO/main.go" "$LAB/source/"
  cp -a "$REPO/cmd" "$REPO/internal" "$LAB/source/"
  cp "$REPO/docs/openapi.json" "$LAB/source/docs/"
  chown -R zx-lab-web:zx-lab-web "$LAB/source"
  set -a
  . /etc/zx-panel-lab/database.env
  set +a
  cd "$LAB/source"
  runuser -u zx-lab-web -- env PATH="$LAB/tools/go/bin:$PATH" GOCACHE="$LAB/build-cache/go" GOPATH="$LAB/build-cache/modules" CGO_ENABLED=1 ZX_PANEL_INTEGRATION=1 go test -race -count=1 -tags devassets ./... 2>&1 | tee "$LAB/reports/go-race.log"
  runuser -u zx-lab-web -- env PATH="$LAB/tools/go/bin:$PATH" GOCACHE="$LAB/build-cache/go" GOPATH="$LAB/build-cache/modules" go vet -tags devassets ./...
  ;;
status)
  systemctl --no-pager --full status zx-panel-lab.service zx-panel-lab-helper.service
  ;;
refresh)
  test -f "$LAB/.zx-panel-lab"
  cp -a "$REPO/cmd" "$REPO/internal" "$LAB/source/"
  chown -R zx-lab-web:zx-lab-web "$LAB/source"
  cd "$LAB/source"
  for binary in server helper; do
    runuser -u zx-lab-web -- env PATH="$LAB/tools/go/bin:$PATH" GOCACHE="$LAB/build-cache/go" GOPATH="$LAB/build-cache/modules" CGO_ENABLED=0 go build -trimpath -ldflags '-X zx-panel/internal/server.Version=1.1.0-wsl-test' -o "$LAB/build-cache/$binary" "./cmd/$binary"
  done
  systemctl stop zx-panel-lab.service zx-panel-lab-helper.service
  install -m 0755 "$LAB/build-cache/server" "$LAB/bin/zx-panel"
  install -m 0755 "$LAB/build-cache/helper" "$LAB/bin/zx-panel-helper"
  python3 "$REPO/scripts/acceptance/wsl-lab.py" units
  systemctl daemon-reload
  systemctl start zx-panel-lab-helper.service zx-panel-lab.service
  for attempt in $(seq 1 30); do
    if curl --silent --fail --cacert /etc/zx-panel-lab/tls.crt https://127.0.0.1:27443/api/v1/setup/status >/dev/null; then exit 0; fi
    sleep 1
  done
  echo 'Lab service failed readiness check' >&2
  exit 1
  ;;
*) echo 'Usage: wsl-lab.sh inspect|prepare|checks|refresh|status' >&2; exit 2 ;;
esac
