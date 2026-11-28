#!/bin/sh
# run-scan.sh - Locked execution runner for warpscout CLI
# Manages execution lifecycle, state.json, log capture, and artifact rotation.

set -e

LOCK_FILE="/var/run/warpscout/scan.lock"
PID_FILE="/var/run/warpscout/scan.pid"
STATE_FILE="/var/run/warpscout/state.json"
GLOBAL_LOG="/var/log/warpscout.log"
ARTIFACTS_ROOT="/etc/warpscout/artifacts"

log() {
	if [ -f "$GLOBAL_LOG" ] && [ "$(wc -l < "$GLOBAL_LOG" 2>/dev/null || echo 0)" -gt 2000 ]; then
		tail -n 1000 "$GLOBAL_LOG" > "${GLOBAL_LOG}.tmp" && mv -f "${GLOBAL_LOG}.tmp" "$GLOBAL_LOG"
	fi
	echo "$(date '+%Y-%m-%d %H:%M:%S') [run-scan] $*" | tee -a "$GLOBAL_LOG"
	logger -t warpscout "$*" 2>/dev/null || true
}

# 1. Handle actions
if [ "$1" = "--cancel" ]; then
	if [ -f "$PID_FILE" ]; then
		TARGET_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
		if [ -n "$TARGET_PID" ] && kill -0 "$TARGET_PID" 2>/dev/null; then
			log "Sending SIGTERM to running scan PID $TARGET_PID..."
			kill -TERM "$TARGET_PID" 2>/dev/null || true
			sleep 1
			if kill -0 "$TARGET_PID" 2>/dev/null; then
				kill -KILL "$TARGET_PID" 2>/dev/null || true
			fi
			rm -f "$PID_FILE" "$LOCK_FILE"
			log "Scan process $TARGET_PID terminated."
			exit 0
		fi
	fi
	echo "No active scan process found."
	exit 0
elif [ "$1" = "--cron" ]; then
	JOB_NAME="${2:-nightly}"
	shift 2 || shift || true
	NO_JITTER=0
	if [ "$1" = "--no-jitter" ]; then
		NO_JITTER=1
		shift
	fi

	# Jitter delay
	if [ "$NO_JITTER" -eq 0 ]; then
		JITTER=$(uci -q get "warpscout.${JOB_NAME}.jitter" || echo "0")
		if [ -n "$JITTER" ] && [ "$JITTER" -gt 0 ]; then
			RAND_DELAY=$(awk -v j="$JITTER" 'BEGIN{srand(); print int(rand()*j)}')
			log "Applying jitter delay of ${RAND_DELAY}s (max ${JITTER}s)..."
			sleep "$RAND_DELAY"
		fi
	fi

	# WAN status check
	WAN_UP=false
	if ubus call network.interface.wan status 2>/dev/null | grep -q '"up": true'; then
		WAN_UP=true
	elif ip route 2>/dev/null | grep -q default; then
		WAN_UP=true
	fi

	if [ "$WAN_UP" != "true" ]; then
		log "WARNING: WAN interface is down or has no default route. Skipping scheduled scan."
		exit 0
	fi

	# Resolve profile from UCI
	PROFILE=$(uci -q get "warpscout.${JOB_NAME}.profile" || echo "default")
	ACTION=$(uci -q get "warpscout.${JOB_NAME}.action" || echo "update_tunnels")

	PROTO=$(uci -q get "warpscout.${PROFILE}.proto" || echo "awg")
	TUN_PING=$(uci -q get "warpscout.${PROFILE}.tun_ping" || echo "1")
	SPEED=$(uci -q get "warpscout.${PROFILE}.speed" || echo "0")
	BEST_BY=$(uci -q get "warpscout.${PROFILE}.best_by" || echo "ping")
	SAMPLE=$(uci -q get "warpscout.${PROFILE}.sample" || echo "5")
	FULL=$(uci -q get "warpscout.${PROFILE}.full" || echo "0")
	TIMEOUT=$(uci -q get "warpscout.${PROFILE}.timeout" || echo "2")
	IPV6=$(uci -q get "warpscout.${PROFILE}.ipv6" || echo "0")
	PORT=$(uci -q get "warpscout.${PROFILE}.port" || echo "")
	SWEEP_PORTS=$(uci -q get "warpscout.${PROFILE}.sweep_ports" || echo "")
	NODES=$(uci -q get "warpscout.${PROFILE}.nodes" || echo "")
	COUNTRIES=$(uci -q get "warpscout.${PROFILE}.countries" || echo "")
	EXCLUDE_NODES=$(uci -q get "warpscout.${PROFILE}.exclude_nodes" || echo "")
	EXCLUDE_COUNTRIES=$(uci -q get "warpscout.${PROFILE}.exclude_countries" || echo "")
	TARGETS=$(uci -q get "warpscout.${PROFILE}.targets" || echo "")

	CRON_FLAGS="-p $PROTO -t $TIMEOUT"
	[ "$FULL" = "1" ] && CRON_FLAGS="$CRON_FLAGS -f" || CRON_FLAGS="$CRON_FLAGS -n $SAMPLE"
	[ "$TUN_PING" = "1" ] && CRON_FLAGS="$CRON_FLAGS -P"
	if [ "$SPEED" = "1" ]; then
		CRON_FLAGS="$CRON_FLAGS --speed"
		[ -n "$BEST_BY" ] && CRON_FLAGS="$CRON_FLAGS --best-by $BEST_BY"
	fi
	[ "$IPV6" = "1" ] && CRON_FLAGS="$CRON_FLAGS -6"
	[ -n "$PORT" ] && CRON_FLAGS="$CRON_FLAGS --port $PORT"
	[ -n "$SWEEP_PORTS" ] && CRON_FLAGS="$CRON_FLAGS --sweep-ports $SWEEP_PORTS"

	for n in $NODES; do CRON_FLAGS="$CRON_FLAGS --node $n"; done
	for n in $EXCLUDE_NODES; do CRON_FLAGS="$CRON_FLAGS --exclude-node $n"; done
	for c in $COUNTRIES; do CRON_FLAGS="$CRON_FLAGS --country $c"; done
	for c in $EXCLUDE_COUNTRIES; do CRON_FLAGS="$CRON_FLAGS --exclude-country $c"; done
	[ -n "$TARGETS" ] && CRON_FLAGS="$CRON_FLAGS --target $TARGETS"

	if [ "$PROTO" = "awg" ] || [ "$PROTO" = "awg31" ]; then
		GEN_JUNK=$(uci -q get "warpscout.${PROFILE}.gen_junk" || echo "0")
		GEN_I1=$(uci -q get "warpscout.${PROFILE}.gen_i1" || echo "")
		I1_SNI=$(uci -q get "warpscout.${PROFILE}.i1_sni" || echo "")
		JC=$(uci -q get "warpscout.${PROFILE}.jc" || echo "")
		JMIN=$(uci -q get "warpscout.${PROFILE}.jmin" || echo "")
		JMAX=$(uci -q get "warpscout.${PROFILE}.jmax" || echo "")
		I1=$(uci -q get "warpscout.${PROFILE}.i1" || echo "")
		[ "$GEN_JUNK" = "1" ] && CRON_FLAGS="$CRON_FLAGS --gen-junk"
		[ -n "$GEN_I1" ] && CRON_FLAGS="$CRON_FLAGS --gen-i1 $GEN_I1"
		[ -n "$I1_SNI" ] && CRON_FLAGS="$CRON_FLAGS --i1-sni $I1_SNI"
		[ -n "$JC" ] && CRON_FLAGS="$CRON_FLAGS --jc $JC"
		[ -n "$JMIN" ] && CRON_FLAGS="$CRON_FLAGS --jmin $JMIN"
		[ -n "$JMAX" ] && CRON_FLAGS="$CRON_FLAGS --jmax $JMAX"
		[ -n "$I1" ] && CRON_FLAGS="$CRON_FLAGS --i1 $I1"

		if [ "$PROTO" = "awg31" ]; then
			PADDING=$(uci -q get "warpscout.${PROFILE}.padding" || echo "")
			REKEY_AFTER=$(uci -q get "warpscout.${PROFILE}.rekey_after" || echo "")
			REKEY_TIMEOUT=$(uci -q get "warpscout.${PROFILE}.rekey_timeout" || echo "")
			REJECT_AFTER=$(uci -q get "warpscout.${PROFILE}.reject_after" || echo "")
			KEEPALIVE_TIMEOUT=$(uci -q get "warpscout.${PROFILE}.keepalive_timeout" || echo "")
			MAX_HANDSHAKES=$(uci -q get "warpscout.${PROFILE}.max_handshakes" || echo "")
			DISABLE_COOKIES=$(uci -q get "warpscout.${PROFILE}.disable_cookies" || echo "0")
			RANDOM_TRAILERS=$(uci -q get "warpscout.${PROFILE}.random_trailers" || echo "0")
			[ -n "$PADDING" ] && CRON_FLAGS="$CRON_FLAGS -padding $PADDING"
			[ -n "$REKEY_AFTER" ] && CRON_FLAGS="$CRON_FLAGS -rekey-after $REKEY_AFTER"
			[ -n "$REKEY_TIMEOUT" ] && CRON_FLAGS="$CRON_FLAGS -rekey-timeout $REKEY_TIMEOUT"
			[ -n "$REJECT_AFTER" ] && CRON_FLAGS="$CRON_FLAGS -reject-after $REJECT_AFTER"
			[ -n "$KEEPALIVE_TIMEOUT" ] && CRON_FLAGS="$CRON_FLAGS -keepalive-timeout $KEEPALIVE_TIMEOUT"
			[ -n "$MAX_HANDSHAKES" ] && CRON_FLAGS="$CRON_FLAGS -max-handshakes $MAX_HANDSHAKES"
			[ "$DISABLE_COOKIES" = "1" ] && CRON_FLAGS="$CRON_FLAGS -disable-cookies"
			[ "$RANDOM_TRAILERS" = "1" ] && CRON_FLAGS="$CRON_FLAGS -random-trailers"
		fi
	elif [ "$PROTO" = "masque" ] || [ "$PROTO" = "masque-h2" ]; then
		MASQUE_SNI=$(uci -q get "warpscout.${PROFILE}.masque_sni" || echo "")
		MASQUE_ATTEMPTS=$(uci -q get "warpscout.${PROFILE}.masque_attempts" || echo "")
		[ -n "$MASQUE_SNI" ] && CRON_FLAGS="$CRON_FLAGS --masque-sni $MASQUE_SNI"
		[ -n "$MASQUE_ATTEMPTS" ] && CRON_FLAGS="$CRON_FLAGS --masque-attempts $MASQUE_ATTEMPTS"
	fi

	EXTRA_ARGS="$CRON_FLAGS"
elif [ "$1" = "--start" ]; then
	shift
	EXTRA_ARGS="$*"
fi

# 2. Acquire lock (prevent concurrent executions)
mkdir -p /var/run/warpscout "$ARTIFACTS_ROOT"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
	log "ERROR: Another scan is currently running. Lock file: $LOCK_FILE"
	exit 1
fi

# 3. Setup Job Identity & Paths
JOB_ID=$(date +%Y%m%d-%H%M%S)
JOB_DIR="${ARTIFACTS_ROOT}/${JOB_ID}"
mkdir -p "$JOB_DIR"

REPORT_FILE="${JOB_DIR}/report.txt"
CONF_FILE="${JOB_DIR}/tunnel.conf"
SCAN_LOG="${JOB_DIR}/scan.log"
CMDLINE_FILE="${JOB_DIR}/cmdline"

echo "$$" > "$PID_FILE"

# Rotate old artifacts: keep latest 20
cd "$ARTIFACTS_ROOT"
# shellcheck disable=SC2012
ls -1dt 20* 2>/dev/null | tail -n +21 | xargs rm -rf 2>/dev/null || true

# 4. Resolve binary & account from UCI
BIN_PATH=$(uci -q get warpscout.main.binary || echo "/usr/bin/warpscout")
ACCOUNT_FILE=$(uci -q get warpscout.main.account || echo "/etc/warpscout/account.json")

if [ ! -x "$BIN_PATH" ]; then
	log "ERROR: Binary $BIN_PATH not found or not executable."
	rm -f "$PID_FILE"
	exit 1
fi

if [ ! -f "$ACCOUNT_FILE" ]; then
	log "ERROR: Account file $ACCOUNT_FILE not found. Please register an account first."
	rm -f "$PID_FILE"
	exit 1
fi

# 5. RAM-aware -jt auto throttling
TOTAL_RAM_KB=$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
CONFIGURED_JOBS=$(uci -q get warpscout.main.jobs || echo "4")
if [ "$TOTAL_RAM_KB" -lt 131072 ]; then
	AUTOTUNED_JOBS="2"
elif [ "$TOTAL_RAM_KB" -lt 262144 ]; then
	AUTOTUNED_JOBS="4"
else
	AUTOTUNED_JOBS="$CONFIGURED_JOBS"
fi

# 6. Parse CLI extra parameters (passed by backend if not in cron mode)
if [ -z "$EXTRA_ARGS" ]; then
	EXTRA_ARGS="$*"
fi

# Assemble full command
FULL_CMD="$BIN_PATH scan --plain -o $REPORT_FILE --conf $CONF_FILE -a $ACCOUNT_FILE -jt $AUTOTUNED_JOBS $EXTRA_ARGS"
echo "$FULL_CMD" > "$CMDLINE_FILE"

log "Starting scan job $JOB_ID (PID $$)..."
log "Command: $FULL_CMD"

STARTED_TS=$(date +%s)

# Update state.json: running
update_state_running() {
	cat <<EOF > "$STATE_FILE.tmp"
{
  "job": {
    "id": "$JOB_ID",
    "type": "scan",
    "status": "running",
    "pid": $$,
    "started": $STARTED_TS,
    "finished": null,
    "exit": null,
    "report": "$REPORT_FILE",
    "conf": "$CONF_FILE",
    "log": "$SCAN_LOG"
  }
}
EOF
	mv -f "$STATE_FILE.tmp" "$STATE_FILE"
}
update_state_running

# 7. Execute scan
EXIT_CODE=0
# shellcheck disable=SC2086
$FULL_CMD > "$SCAN_LOG" 2>&1 || EXIT_CODE=$?

FINISHED_TS=$(date +%s)
rm -f "$PID_FILE"

# 8. Handle results & update state.json
if [ "$EXIT_CODE" -eq 0 ] && [ -f "$REPORT_FILE" ]; then
	log "Scan job $JOB_ID completed successfully."
	
	# Parse report via ucode parser
	PARSED_JSON=""
	if [ -x "/usr/libexec/warpscout/report-parse.uc" ]; then
		PARSED_JSON=$(/usr/libexec/warpscout/report-parse.uc "$REPORT_FILE" 2>/dev/null || echo "")
	fi

	cat <<EOF > "$STATE_FILE.tmp"
{
  "job": {
    "id": "$JOB_ID",
    "type": "scan",
    "status": "ok",
    "pid": $$,
    "started": $STARTED_TS,
    "finished": $FINISHED_TS,
    "exit": 0,
    "report": "$REPORT_FILE",
    "conf": "$CONF_FILE",
    "log": "$SCAN_LOG"
  },
  "last_scan": ${PARSED_JSON:-null}
}
EOF
	mv -f "$STATE_FILE.tmp" "$STATE_FILE"

	# If scheduled action is update_tunnels, rotate managed tunnels to matching node (or global best)
	if [ "$ACTION" = "update_tunnels" ]; then
		BEST_EP=""
		if [ -n "$PARSED_JSON" ] && [ -x "/usr/bin/jsonfilter" ]; then
			BEST_EP=$(echo "$PARSED_JSON" | /usr/bin/jsonfilter -e '@.best' 2>/dev/null || true)
		fi
		if [ -z "$BEST_EP" ] && [ -f "$CONF_FILE" ]; then
			BEST_EP=$(awk -F'= ' '/Endpoint/ {print $2; exit}' "$CONF_FILE" 2>/dev/null | tr -d ' \r' || true)
		fi

		if [ -n "$BEST_EP" ]; then
			log "Auto-update action triggered (global best: $BEST_EP)..."
			for tiface in $(uci show warpscout 2>/dev/null | grep '=tunnel$' | cut -d'.' -f2 | cut -d'=' -f1); do
				is_m=$(uci -q get "warpscout.${tiface}.managed" || echo "0")
				if [ "$is_m" != "1" ]; then
					log "Skipping unmanaged tunnel $tiface."
					continue
				fi

				TARGET_NODE=$(uci -q get "warpscout.${tiface}.target_node" || echo "")
				RESOLVED=$(ucode -e '
					import { readfile } from "fs";
					const raw = readfile("'"$STATE_FILE"'");
					const st = raw ? json(raw) : null;
					const ls = st?.last_scan;
					const target = lc(trim("'"$TARGET_NODE"'"));
					if (!ls) exit(0);
					if (target && target != "auto") {
						const bpn = ls.best_per_node || [];
						for (let b in bpn) {
							if (lc(b.node || "") == target && b.endpoint) {
								print(b.endpoint + "|" + (b.node || "") + "|" + (b.seen_as || ""));
								exit(0);
							}
						}
						// Fallback to items list if best_per_node omitted it
						for (let it in (ls.items || [])) {
							if (lc(it.node || "") == target && it.endpoint) {
								print(it.endpoint + "|" + (it.node || "") + "|" + (it.seen_as || ""));
								exit(0);
							}
						}
					} else if (ls.best) {
						print(ls.best + "|" + (ls.best_node || "") + "|" + (ls.best_seen_as || ""));
					}
				' 2>/dev/null || true)

				if [ -n "$TARGET_NODE" ] && [ "$TARGET_NODE" != "auto" ] && [ -z "$RESOLVED" ]; then
					log "WARNING: Tunnel $tiface is pinned to node '$TARGET_NODE', but no working endpoint for '$TARGET_NODE' was found in this scan. Keeping existing endpoint."
					continue
				fi

				MATCH_EP=$(echo "$RESOLVED" | cut -d'|' -f1)
				MATCH_NODE=$(echo "$RESOLVED" | cut -d'|' -f2)
				MATCH_SEEN=$(echo "$RESOLVED" | cut -d'|' -f3)
				[ -z "$MATCH_EP" ] && MATCH_EP="$BEST_EP"

				log "Updating tunnel $tiface (pin: ${TARGET_NODE:-auto}) -> $MATCH_EP ($MATCH_NODE / $MATCH_SEEN)..."
				/usr/libexec/warpscout/conf-to-uci.uc update-endpoint "$tiface" "$MATCH_EP" "$MATCH_NODE" "$MATCH_SEEN" 2>&1 | tee -a "$GLOBAL_LOG" || true
			done
		else
			log "WARNING: Auto-update action requested, but no valid best endpoint found in scan results."
		fi
	fi
else
	log "ERROR: Scan job $JOB_ID failed with exit code $EXIT_CODE."
	TAIL_OUTPUT=$(tail -n 10 "$SCAN_LOG" 2>/dev/null | tr '\n' ' ' | sed 's/"/\\"/g')
	cat <<EOF > "$STATE_FILE.tmp"
{
  "job": {
    "id": "$JOB_ID",
    "type": "scan",
    "status": "failed",
    "pid": $$,
    "started": $STARTED_TS,
    "finished": $FINISHED_TS,
    "exit": $EXIT_CODE,
    "report": "$REPORT_FILE",
    "conf": "$CONF_FILE",
    "log": "$SCAN_LOG",
    "tail": "$TAIL_OUTPUT"
  }
}
EOF
	mv -f "$STATE_FILE.tmp" "$STATE_FILE"
fi

exit $EXIT_CODE
