#!/usr/bin/env bash
# Run the e2e with no external network access, and prove nothing tried.
# CI only: it installs firewall rules with sudo on a throwaway Linux runner.
#
#   offline.sh lock          install the rules (sandbox must already be up)
#   offline.sh exec CMD...   run CMD inside the lock
#   offline.sh check         fail if anything was rejected since `lock`
#
# The rules are scoped so the Actions runner itself (which streams logs to
# GitHub) is unaffected:
# - Processes run through `exec` get the e2e-offline group, and their packets
#   may only leave via loopback or a Docker bridge (the sandbox).
# - Containers may only talk to each other: forwarding from a Docker bridge to
#   anything other than a bridge is rejected.
# Everything rejected is logged and counted. A rejected call can fail silently
# (a best-effort check, a retry that gives up), so `check` fails the job on any
# count above zero instead of trusting the test result.
set -euo pipefail

GROUP=e2e-offline
LOG_PREFIX="e2e-egress "

die() { echo "offline.sh: $*" >&2; exit 1; }

# Sum the packet counters of every REJECT rule in the e2e chains.
rejected() {
  {
    sudo iptables -L E2E_HOST -v -x -n
    sudo ip6tables -L E2E_HOST -v -x -n
    sudo iptables -L E2E_CONTAINERS -v -x -n
  } | awk '$3 == "REJECT" { n += $1 } END { print n + 0 }'
}

zero() {
  sudo iptables -Z E2E_HOST
  sudo ip6tables -Z E2E_HOST
  sudo iptables -Z E2E_CONTAINERS
}

# The runner's sudo resets the environment and refuses -E, so the caller's
# environment (HOME, PATH, TMPDIR, ...) is passed through as `env -i` arguments.
in_lock() {
  local vars
  mapfile -d '' vars < <(env -0)
  sudo setpriv --reuid "$(id -u)" --regid "$(getent group "$GROUP" | cut -d: -f3)" --init-groups \
    -- env -i "${vars[@]}" "$@"
}

lock() {
  sudo iptables -L DOCKER-USER -n >/dev/null 2>&1 ||
    die "no DOCKER-USER chain: Docker is not using iptables here, so containers cannot be locked"
  sudo groupadd -f "$GROUP"

  for ipt in iptables ip6tables; do
    sudo "$ipt" -N E2E_HOST
    sudo "$ipt" -A E2E_HOST -o lo -j RETURN
    if [ "$ipt" = iptables ]; then
      sudo "$ipt" -A E2E_HOST -o br-+ -j RETURN
      sudo "$ipt" -A E2E_HOST -o docker0 -j RETURN
    fi
    sudo "$ipt" -A E2E_HOST -j LOG --log-prefix "${LOG_PREFIX}host: " --log-uid
    sudo "$ipt" -A E2E_HOST -j REJECT
    sudo "$ipt" -I OUTPUT 1 -m owner --gid-owner "$GROUP" -j E2E_HOST
  done

  sudo iptables -N E2E_CONTAINERS
  sudo iptables -A E2E_CONTAINERS -o br-+ -j RETURN
  sudo iptables -A E2E_CONTAINERS -o docker0 -j RETURN
  sudo iptables -A E2E_CONTAINERS -j LOG --log-prefix "${LOG_PREFIX}container: "
  sudo iptables -A E2E_CONTAINERS -j REJECT
  sudo iptables -I DOCKER-USER 1 -i br-+ -j E2E_CONTAINERS
  sudo iptables -I DOCKER-USER 1 -i docker0 -j E2E_CONTAINERS

  # Controls: the lock must block both paths and still reach the sandbox, and
  # the blocked attempts must show up in the counters `check` reads.
  in_lock curl -fsS --max-time 5 -o /dev/null http://127.0.0.1:18000/health ||
    die "control failed: the sandbox is not reachable from inside the lock"
  if in_lock curl -sS --max-time 5 -o /dev/null https://registry.npmjs.org/; then
    die "control failed: a locked process reached the internet"
  fi
  if docker compose -p honcho-sandbox exec -T api /app/.venv/bin/python -c \
    "import urllib.request; urllib.request.urlopen('https://registry.npmjs.org/', timeout=5)" 2>/dev/null; then
    die "control failed: a sandbox container reached the internet"
  fi
  [ "$(rejected)" -gt 0 ] || die "control failed: blocked attempts were not counted"

  zero
  sudo dmesg --clear
  echo "offline.sh: locked; controls passed (sandbox reachable, host and container egress rejected)"
}

check() {
  local n
  n="$(rejected)"
  if [ "$n" -gt 0 ]; then
    echo "offline.sh: $n packet(s) tried to leave during the e2e:" >&2
    sudo dmesg | grep "$LOG_PREFIX" >&2 || true
    exit 1
  fi
  echo "offline.sh: no external traffic during the e2e"
}

case "${1:-}" in
  lock) lock ;;
  exec) shift; [ $# -gt 0 ] || die "usage: offline.sh exec CMD..."; in_lock "$@" ;;
  check) check ;;
  *) die "usage: offline.sh lock | exec CMD... | check" ;;
esac
