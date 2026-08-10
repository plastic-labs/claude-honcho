#!/usr/bin/env bash
# Renders honcho memory state as a statusLine segment with a soft truecolor
# glow. The statusline is the one surface the Claude Code TUI re-paints on its
# own refresh cycle, so it is where memory activity can actually animate --
# hooks write ~/.honcho/state.json, this reads it. Motion is slow and
# low-contrast by design (no flashing).
#
# At rest it shows only sync status + a clickable session link. Quantitative
# detail is intentionally omitted; activity (loading/recalling/tool
# calls) animates while it happens.
#
# Visibility via "statusline" in ~/.honcho/config.json:
#   "on" (default) · "off" (hidden)
HONCHO_DIR="$HOME/.honcho"
# Read the statusLine JSON Claude pipes in, but never block: time out fast if
# stdin has no EOF, so the bar can't freeze.
INPUT=""
IFS= read -r -t 1 INPUT 2>/dev/null || true

exec python3 - "$HONCHO_DIR" "$INPUT" <<'PY'
import json, sys, time, os

honcho_dir, raw = sys.argv[1], sys.argv[2]

def load(name):
    try:
        return json.load(open(os.path.join(honcho_dir, name)))
    except Exception:
        return {}

# session_id is the one field guaranteed identical between this statusLine
# stdin and the hook stdin -> use it to read THIS window's files, with a
# global-file fallback for back-compat.
sess_id = ""
try:
    sess_id = (json.loads(raw).get("session_id") or "") if raw.strip() else ""
except Exception:
    pass

def keyed(base):
    if sess_id and os.path.exists(os.path.join(honcho_dir, f"{base}-{sess_id}.json")):
        return f"{base}-{sess_id}.json"
    return f"{base}.json"

# --- visibility toggle ------------------------------------------------------
if (load("config.json").get("statusline") or "on").lower() == "off":
    sys.exit(0)

# --- connection + session link ----------------------------------------------
synced = bool((load("context-cache.json").get("userContext", {}) or {}).get("data"))
link_url = (load(keyed("session")).get("url") or "")

# --- live phase from the hooks ----------------------------------------------
TTL = {"loading": 40, "compacting": 40, "recalling": 6, "querying": 8}
phase, detail = "idle", ""
s = load(keyed("state"))
ph = s.get("phase", "idle")
since = (s.get("since", 0) or 0) / 1000
if ph in TTL and (time.time() - since) <= TTL[ph]:
    phase, detail = ph, (s.get("detail") or "")

# --- styling: glyph animates while working, fixed colors, no flashing -------
# (The statusLine is registered with refreshInterval, so Claude Code re-runs
#  this script on a timer even at rest. Active phases advance a slow moon-phase
#  frame off the wall clock; idle stays a single static marker. Only the glyph
#  shape rotates -- colors are constant, ~1 Hz, well under any flicker threshold.)
def fg(rgb):
    return f"\x1b[38;2;{rgb[0]};{rgb[1]};{rgb[2]}m"

R = "\x1b[0m"
DIM = "\x1b[38;2;120;120;128m"
CALM = (130, 200, 225)   # synced / resting
WORK = (230, 175, 110)   # memory actively working
SEP = f"{DIM} · {R}"

# Slow clockwise moon rotation while working; a gentle two-frame pulse for
# point queries. Frame advances ~1 Hz off the wall clock so each repaint moves.
SPIN = ["◐", "◓", "◑", "◒"]
SPARK = ["✦", "✧"]
LABEL = {"loading": "loading memory", "compacting": "anchoring memory",
         "recalling": "recalling"}

def osc8(url, text):                       # clickable link, no raw URL shown
    return f"\x1b]8;;{url}\x07{text}\x1b]8;;\x07"

if phase == "idle":
    color = CALM if synced else (120, 120, 128)
    glyph = f"{fg(color)}{'◆' if synced else '◇'}{R}"
    if not link_url:
        out = f"{glyph}{DIM} honcho{R}"
    else:
        out = f"{glyph} {DIM}{osc8(link_url, 'honcho ↗')}{R}"
else:
    frames = SPARK if phase == "querying" else SPIN
    char = frames[int(time.time()) % len(frames)]
    glyph = f"{fg(WORK)}{char}{R}"
    label = detail if phase == "querying" else LABEL.get(phase, phase)
    out = f"{glyph}{DIM} honcho{R}{SEP}{fg(WORK)}{label or 'memory'}{R}"

sys.stdout.write(out)
PY
