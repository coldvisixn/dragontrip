#!/usr/bin/env bash
set -euo pipefail
dragontrip_checks_dir="$(cd "$(dirname "$0")" && pwd)"
dragontrip_test_driver="${1:-tauri-driver}"
xfwm4 --compositor=off >/tmp/dragontrip-xfwm4.log 2>&1 &
dragontrip_wm_pid=$!
trap 'kill "$dragontrip_wm_pid" 2>/dev/null || true' EXIT
for attempt in $(seq 1 50); do
  if wmctrl -m >/dev/null 2>&1; then break; fi
  sleep 0.1
done
wmctrl -m >/dev/null
python3 "$dragontrip_checks_dir/launcher-smoke.py"
python3 "$dragontrip_checks_dir/native-smoke.py" /usr/bin/dragontrip --driver "$dragontrip_test_driver" --profile
