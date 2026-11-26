#!/bin/sh
# capabilities.sh - Read-only hardware, protocol and kernel compatibility detector
# Returns JSON to stdout. Never modifies system state, never calls modprobe.

set -f

NOW=$(date +%s 2>/dev/null || echo 0)
KERNEL_VER=$(uname -r 2>/dev/null || echo "unknown")

# 1. Package manager detection
if command -v opkg >/dev/null 2>&1; then
	PKG_MGR="opkg"
elif command -v apk >/dev/null 2>&1; then
	PKG_MGR="apk"
else
	PKG_MGR="unknown"
fi

# 2. Extract board metadata from ubus system board
BOARD_DATA=$(ubus call system board 2>/dev/null || echo "{}")
BOARD_VERSION=$(echo "$BOARD_DATA" | awk -F'"' '/"version":/ {print $4}' | head -n 1)
BOARD_TARGET=$(echo "$BOARD_DATA" | awk -F'"' '/"target":/ {print $4}' | head -n 1)
BOARD_DISTRIB=$(echo "$BOARD_DATA" | awk -F'"' '/"distribution":/ {print $4}' | head -n 1)

[ -z "$BOARD_VERSION" ] && BOARD_VERSION="unknown"
[ -z "$BOARD_TARGET" ] && BOARD_TARGET="unknown"
[ -z "$BOARD_DISTRIB" ] && BOARD_DISTRIB="OpenWrt"

# 3. Check warpscout binary
BIN_PATH="/usr/bin/warpscout"
if [ -x "$BIN_PATH" ]; then
	BIN_INSTALLED=true
	BIN_VERSION=$("$BIN_PATH" version 2>/dev/null | tr -d '\r\n')
else
	BIN_INSTALLED=false
	BIN_VERSION=""
fi

# Helper to check package installation
is_pkg_installed() {
	_pkg="$1"
	if [ "$PKG_MGR" = "opkg" ]; then
		opkg list-installed "$_pkg" 2>/dev/null | grep -q "$_pkg"
	elif [ "$PKG_MGR" = "apk" ]; then
		apk list -I "$_pkg" 2>/dev/null | grep -q "$_pkg"
	else
		return 1
	fi
}

# Helper to get module vermagic
get_vermagic() {
	_mod="$1"
	modinfo "$_mod" 2>/dev/null | awk '/^vermagic:/ {print $2}' | head -n 1
}

# 4. Check WireGuard protocol stack
WG_REASONS=""
if is_pkg_installed "kmod-wireguard"; then
	WG_KMOD_INSTALLED=true
else
	WG_KMOD_INSTALLED=false
	WG_REASONS="${WG_REASONS}\"kmod_wireguard_missing\","
fi

if [ -d /sys/module/wireguard ]; then
	WG_KMOD_LOADED=true
else
	WG_KMOD_LOADED=false
fi

WG_VERMAGIC=$(get_vermagic "wireguard")
if [ -n "$WG_VERMAGIC" ] && [ "$WG_VERMAGIC" = "$KERNEL_VER" ]; then
	WG_VERMAGIC_OK=true
else
	WG_VERMAGIC_OK=false
	if [ "$WG_KMOD_INSTALLED" = "true" ] && [ "$WG_KMOD_LOADED" = "false" ]; then
		WG_REASONS="${WG_REASONS}\"vermagic_mismatch\","
	fi
fi

if command -v wg >/dev/null 2>&1; then
	WG_TOOLS=true
	WG_TOOLS_VERSION=$(wg --version 2>/dev/null | head -n 1 | tr -d '\r\n')
else
	WG_TOOLS=false
	WG_TOOLS_VERSION=""
	WG_REASONS="${WG_REASONS}\"wireguard_tools_missing\","
fi

if [ -f /lib/netifd/proto/wireguard.sh ]; then
	WG_PROTO_HANDLER=true
else
	WG_PROTO_HANDLER=false
	WG_REASONS="${WG_REASONS}\"wireguard_proto_handler_missing\","
fi

if [ "$WG_KMOD_INSTALLED" = "true" ] && { [ "$WG_KMOD_LOADED" = "true" ] || [ "$WG_VERMAGIC_OK" = "true" ]; } && [ "$WG_TOOLS" = "true" ] && [ "$WG_PROTO_HANDLER" = "true" ]; then
	WG_READY=true
else
	WG_READY=false
fi
WG_REASONS=$(echo "$WG_REASONS" | sed 's/,$//')

# 5. Check AmneziaWG protocol stack
AWG_REASONS=""
if is_pkg_installed "kmod-amneziawg"; then
	AWG_KMOD_INSTALLED=true
else
	AWG_KMOD_INSTALLED=false
	AWG_REASONS="${AWG_REASONS}\"kmod_amneziawg_missing\","
fi

if [ -d /sys/module/amneziawg ]; then
	AWG_KMOD_LOADED=true
else
	AWG_KMOD_LOADED=false
fi

AWG_VERMAGIC=$(get_vermagic "amneziawg")
if [ -n "$AWG_VERMAGIC" ] && [ "$AWG_VERMAGIC" = "$KERNEL_VER" ]; then
	AWG_VERMAGIC_OK=true
else
	AWG_VERMAGIC_OK=false
	if [ "$AWG_KMOD_INSTALLED" = "true" ] && [ "$AWG_KMOD_LOADED" = "false" ]; then
		AWG_REASONS="${AWG_REASONS}\"vermagic_mismatch\","
	fi
fi

if command -v awg >/dev/null 2>&1; then
	AWG_TOOLS=true
	AWG_TOOLS_VERSION=$(awg --version 2>/dev/null | head -n 1 | tr -d '\r\n')
else
	AWG_TOOLS=false
	AWG_TOOLS_VERSION=""
	AWG_REASONS="${AWG_REASONS}\"awg_tools_missing\","
fi

if [ -f /lib/netifd/proto/amneziawg.sh ]; then
	AWG_PROTO_HANDLER=true
else
	AWG_PROTO_HANDLER=false
	AWG_REASONS="${AWG_REASONS}\"amneziawg_proto_handler_missing\","
fi

if [ "$AWG_KMOD_INSTALLED" = "true" ] && { [ "$AWG_KMOD_LOADED" = "true" ] || [ "$AWG_VERMAGIC_OK" = "true" ]; } && [ "$AWG_TOOLS" = "true" ] && [ "$AWG_PROTO_HANDLER" = "true" ]; then
	AWG_READY=true
else
	AWG_READY=false
fi
AWG_REASONS=$(echo "$AWG_REASONS" | sed 's/,$//')

# 6. Format JSON output
cat <<EOF
{
  "checked_at": $NOW,
  "kernel": "$KERNEL_VER",
  "pkg_manager": "$PKG_MGR",
  "board": {
    "distribution": "$BOARD_DISTRIB",
    "version": "$BOARD_VERSION",
    "target": "$BOARD_TARGET"
  },
  "binary": {
    "installed": $BIN_INSTALLED,
    "path": "$BIN_PATH",
    "version": "$BIN_VERSION"
  },
  "wg": {
    "kmod_installed": $WG_KMOD_INSTALLED,
    "kmod_loaded": $WG_KMOD_LOADED,
    "vermagic_ok": $WG_VERMAGIC_OK,
    "vermagic": "$WG_VERMAGIC",
    "tools": $WG_TOOLS,
    "tools_version": "$WG_TOOLS_VERSION",
    "proto_handler": $WG_PROTO_HANDLER,
    "ready": $WG_READY,
    "reasons": [ $WG_REASONS ]
  },
  "awg": {
    "kmod_installed": $AWG_KMOD_INSTALLED,
    "kmod_loaded": $AWG_KMOD_LOADED,
    "vermagic_ok": $AWG_VERMAGIC_OK,
    "vermagic": "$AWG_VERMAGIC",
    "tools": $AWG_TOOLS,
    "tools_version": "$AWG_TOOLS_VERSION",
    "proto_handler": $AWG_PROTO_HANDLER,
    "ready": $AWG_READY,
    "reasons": [ $AWG_REASONS ]
  },
  "masque": {
    "config_only": true,
    "supported_modes": ["scan", "socks", "usque_config"]
  }
}
EOF
exit 0
