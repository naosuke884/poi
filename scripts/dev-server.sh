#!/usr/bin/env bash
# dev サーバー (npm run dev = vite + Cloudflare プラグイン、:5173) をバックグラウンドで常駐させる。
# ターミナルやエージェントのセッションが終わっても止まらず、落ちたら 2 秒後に起動し直す。
# dev container の起動時 (docker-compose.yml の command) からも呼ぶ想定で、何度実行しても安全。
#
#   scripts/dev-server.sh start    # 起動 (既に応答していれば何もしない)
#   scripts/dev-server.sh stop     # 止める (このスクリプトで起動したものだけ)
#   scripts/dev-server.sh restart
#   scripts/dev-server.sh status
#   scripts/dev-server.sh logs     # ログを追う (Ctrl+C で抜ける)
set -euo pipefail

cd "$(dirname "$0")/.."

PORT=5173 # vite.config.ts の server.port と同じ (strictPort)
LOG="${DEV_SERVER_LOG:-/tmp/poi-dev-server.log}"
PIDFILE="${DEV_SERVER_PIDFILE:-/tmp/poi-dev-server.pid}"

# 応答するか (vite は起動していても workerd が落ちるとリクエストが返らなくなるので、プロセスではなく HTTP で見る)
responding() {
  curl -s -o /dev/null --max-time 3 "http://localhost:${PORT}/"
}

# 常駐ループの $0。PIDFILE の pid が本当にこのループかを確かめる目印にする
SUPERVISOR_NAME=poi-dev-server

# このスクリプトで起動した常駐ループ (プロセスグループのリーダー) の pid。無ければ空。
# コンテナを再起動すると /tmp の PIDFILE は残ったまま pid だけ別のプロセスに再利用されうるので、生存だけでなく中身も見る
supervisor_pid() {
  local pid
  pid=$(cat "$PIDFILE" 2>/dev/null || true)
  if [[ -n "$pid" ]] && tr '\0' '\n' <"/proc/${pid}/cmdline" 2>/dev/null | grep -qx "$SUPERVISOR_NAME"; then
    echo "$pid"
  fi
}

start() {
  if responding; then
    echo "dev server is already responding on :${PORT}"
    return 0
  fi
  if [[ -n "$(supervisor_pid)" ]]; then
    echo "dev server is starting (or hung); see ${LOG}, or run: $0 restart" >&2
    return 1
  fi
  if [[ ! -d node_modules ]]; then
    echo "[dev-server] node_modules が無いので npm ci します" | tee -a "$LOG"
    npm ci >>"$LOG" 2>&1
  fi
  # setsid で新しいプロセスグループにして、呼び出し元のセッション終了 (SIGHUP) の影響を受けないようにする。
  # stop ではこのグループ (npm → vite → workerd) をまとめて止める
  setsid bash -c '
    while :; do
      echo "[dev-server] $(date -Is) starting npm run dev"
      npm run dev
      rc=$?
      echo "[dev-server] $(date -Is) exited (${rc}); restarting in 2s"
      sleep 2
    done
  ' "$SUPERVISOR_NAME" >>"$LOG" 2>&1 </dev/null &
  echo $! >"$PIDFILE"
  for _ in $(seq 1 60); do
    if responding; then
      echo "dev server is up: http://localhost:${PORT}/ (log: ${LOG})"
      return 0
    fi
    sleep 1
  done
  echo "dev server did not respond within 60s; see ${LOG}" >&2
  return 1
}

stop() {
  local pid
  pid=$(supervisor_pid)
  if [[ -z "$pid" ]]; then
    echo "dev server (started by this script) is not running"
    rm -f "$PIDFILE"
    return 0
  fi
  # グループごと止める (ループ本体・npm・vite・workerd)。他の node / workerd には触らない。
  # 別ユーザー (コンテナ起動時の root など) が起動したものは止められないので、黙って成功扱いにしない
  if ! kill -TERM -- "-${pid}"; then
    echo "failed to stop dev server (pid ${pid}); it may have been started by another user" >&2
    return 1
  fi
  # ループ本体は TERM ですぐ死ぬので、vite / workerd の終了はグループ全体が消えたかで待つ
  for _ in $(seq 1 10); do
    kill -0 -- "-${pid}" 2>/dev/null || break
    sleep 1
  done
  kill -KILL -- "-${pid}" 2>/dev/null || true
  rm -f "$PIDFILE"
  echo "dev server stopped"
}

status() {
  local pid
  pid=$(supervisor_pid)
  if responding; then
    echo "responding on :${PORT}${pid:+ (supervisor pid ${pid})}"
  elif [[ -n "$pid" ]]; then
    echo "supervisor running (pid ${pid}) but :${PORT} is not responding; see ${LOG}"
    return 1
  else
    echo "not running"
    return 1
  fi
}

case "${1:-}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  logs) exec tail -n 50 -F "$LOG" ;;
  *)
    echo "usage: $0 {start|stop|restart|status|logs}" >&2
    exit 2
    ;;
esac
