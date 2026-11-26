#!/bin/sh
# cron-sync.sh - Synchronizes warpscout jobs from UCI into /etc/crontabs/root
# Manages the isolated block delimited by BEGIN and END markers.

set -e

CRONTAB="/etc/crontabs/root"
CRONTAB_DIR="/etc/crontabs"
BEGIN_MARK="# BEGIN WARPSCOUT MANAGED BLOCK"
END_MARK="# END WARPSCOUT MANAGED BLOCK"

mkdir -p "$CRONTAB_DIR"
touch "$CRONTAB"
chmod 0600 "$CRONTAB"

# Collect enabled jobs
NEW_ENTRIES=""
for sec in $(uci show warpscout 2>/dev/null | grep '=job$' | cut -d'.' -f2 | cut -d'=' -f1); do
	enabled=$(uci -q get "warpscout.${sec}.enabled" || echo "0")
	if [ "$enabled" = "1" ]; then
		cron_expr=$(uci -q get "warpscout.${sec}.cron" || echo "0 4 * * *")
		line="${cron_expr} /usr/libexec/warpscout/run-scan.sh --cron ${sec} >/dev/null 2>&1"
		if [ -z "$NEW_ENTRIES" ]; then
			NEW_ENTRIES="$line"
		else
			NEW_ENTRIES="${NEW_ENTRIES}
${line}"
		fi
	fi
done

# Build replacement block
BLOCK="${BEGIN_MARK}"
if [ -n "$NEW_ENTRIES" ]; then
	BLOCK="${BLOCK}
${NEW_ENTRIES}"
fi
BLOCK="${BLOCK}
${END_MARK}"

TMP_CRON="/tmp/crontab.root.$$"

if grep -qF "$BEGIN_MARK" "$CRONTAB" 2>/dev/null; then
	awk -v b="$BEGIN_MARK" -v e="$END_MARK" -v blk="$BLOCK" '
		$0 == b { in_blk=1; print blk; next }
		$0 == e { in_blk=0; next }
		!in_blk { print }
	' "$CRONTAB" > "$TMP_CRON"
else
	cp "$CRONTAB" "$TMP_CRON"
	[ -s "$TMP_CRON" ] && echo "" >> "$TMP_CRON"
	echo "$BLOCK" >> "$TMP_CRON"
fi

mv -f "$TMP_CRON" "$CRONTAB"
chmod 0600 "$CRONTAB"

# Reload or restart cron service in background to prevent ubus pipe blocking
if [ -x "/etc/init.d/cron" ]; then
	if [ -n "$NEW_ENTRIES" ]; then
		/etc/init.d/cron enable >/dev/null 2>&1 || true
		/etc/init.d/cron restart >/dev/null 2>&1 &
	else
		/etc/init.d/cron reload >/dev/null 2>&1 &
	fi
fi

exit 0
