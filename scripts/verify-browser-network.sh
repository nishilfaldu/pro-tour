#!/usr/bin/env bash
set -euo pipefail

browser_uid=$1
chrome_home=$2

# Chrome utility children may omit the root process's user-data-dir flag.
node scripts/check-chrome-processes.js "$browser_uid" "$chrome_home"

# Exercise the owner rules. Browser UID can reach the proxy, but not CDP directly.
sudo -u pro-tour-browser curl --fail --silent --proxy http://127.0.0.1:9224 --noproxy '' --output /dev/null "$APP_URL"
if sudo -u pro-tour-browser curl --max-time 2 --silent --noproxy '*' --output /dev/null http://127.0.0.1:9223/json/version; then
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
