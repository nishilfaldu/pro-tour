#!/usr/bin/env bash
set -euo pipefail

browser_uid=$1
chrome_home=$2

# All Chrome network service processes must keep the firewall-matched host UID.
found=0
for proc in /proc/[0-9]*; do
  executable=$(readlink "$proc/exe" 2>/dev/null || true)
  [[ "${executable##*/}" == chrome ]] || continue
  command=$(tr '\0' ' ' < "$proc/cmdline" 2>/dev/null || true)
  [[ "$command" == *"--user-data-dir=$chrome_home"* && "$command" == *"network.mojom.NetworkService"* ]] || continue
  found=1
  read -r real effective saved filesystem < <(awk '/^Uid:/ { print $2, $3, $4, $5 }' "$proc/status")
  [[ "$real" == "$browser_uid" && "$effective" == "$browser_uid" && "$saved" == "$browser_uid" && "$filesystem" == "$browser_uid" ]] || {
    echo 'Chrome network process escaped the firewall UID' >&2
    exit 1
  }
done
[[ "$found" == 1 ]] || { echo 'Chrome network process was not found' >&2; exit 1; }

# Exercise the owner rules. Browser UID can reach the proxy, but not CDP directly.
sudo -u pro-tour-browser curl --fail --silent --proxy http://127.0.0.1:9224 --noproxy '' --output /dev/null "$APP_URL"
if sudo -u pro-tour-browser curl --max-time 2 --silent --output /dev/null http://127.0.0.1:9223/json/version; then
  echo 'Browser UID reached CDP directly' >&2
  exit 1
fi

# A live IPv6 listener makes the egress check meaningful.
python3 -m http.server 9225 --bind ::1 > /dev/null 2>&1 &
ipv6_server=$!
trap 'kill "$ipv6_server" 2>/dev/null || true' EXIT
for attempt in $(seq 1 30); do
  if curl --max-time 1 --fail --silent --noproxy '*' --output /dev/null 'http://[::1]:9225/'; then break; fi
  sleep 0.1
done
curl --fail --silent --noproxy '*' --output /dev/null 'http://[::1]:9225/'
if sudo -u pro-tour-browser curl --max-time 2 --silent --noproxy '*' --output /dev/null 'http://[::1]:9225/'; then
  echo 'Browser UID reached an IPv6 loopback service directly' >&2
  exit 1
fi
