#!/bin/sh
# install.sh - Automated custom feed & package installer for luci-app-warpscout
# Installs the custom GitHub feed, luci-app-warpscout (.ipk or .apk), and optional RU i18n.
# Does NOT install protocol kernel modules or third-party repositories.

set -e

GITHUB_REPO="zipfo/luci-app-warpscout"
FEED_BASE_URL="https://zipfo.github.io/luci-app-warpscout"
PKG_NAME="luci-app-warpscout"
I18N_PKG_NAME="luci-i18n-warpscout-ru"

log() {
	echo "==> $*"
}

warn() {
	echo "==> WARNING: $*" >&2
}

err() {
	echo "==> ERROR: $*" >&2
}

detect_fetch() {
	if command -v uclient-fetch >/dev/null 2>&1; then
		FETCH_STDOUT="uclient-fetch -q -O -"
		FETCH_FILE="uclient-fetch -q -O"
	elif command -v wget >/dev/null 2>&1; then
		FETCH_STDOUT="wget -qO-"
		FETCH_FILE="wget -qO"
	elif command -v curl >/dev/null 2>&1; then
		FETCH_STDOUT="curl -fsSL"
		FETCH_FILE="curl -fsSL -o"
	else
		err "No download utility found (uclient-fetch, wget, or curl required)."
		exit 1
	fi
}

# 1. Architecture check (limited to architectures supported by warpscout)
ARCH=$(uname -m 2>/dev/null || echo "unknown")
case "$ARCH" in
	x86_64|amd64|aarch64|arm64|mips|mipsel|mipsle)
		log "Architecture supported: $ARCH"
		;;
	*)
		err "Architecture '$ARCH' is not supported. warpscout targets x86_64, aarch64, mips, and mipsel."
		exit 1
		;;
esac

# 2. Package manager check
if command -v apk >/dev/null 2>&1; then
	PKG_MGR="apk"
elif command -v opkg >/dev/null 2>&1; then
	PKG_MGR="opkg"
else
	err "Neither opkg nor apk package manager was detected."
	exit 1
fi
log "Detected package manager: $PKG_MGR"

# 3. Handle diagnostic / binary-only modes
if [ "$1" = "--check" ]; then
	if [ -x "/usr/libexec/warpscout/capabilities.sh" ]; then
		exec /usr/libexec/warpscout/capabilities.sh
	else
		err "Capabilities detector not installed yet."
		exit 1
	fi
fi

if [ "$1" = "--bin-only" ]; then
	if [ -x "/usr/libexec/warpscout/bootstrap.sh" ]; then
		exec /usr/libexec/warpscout/bootstrap.sh --bin
	else
		err "bootstrap.sh not found."
		exit 1
	fi
fi

# 4. Check free space (require >= 15 MB)
FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 15360 ]; then
	err "Insufficient free disk space on root filesystem ($(( FREE_KB / 1024 )) MB free, 15 MB required)."
	exit 1
fi

detect_fetch

# 5. Configure custom feed and install package
install_via_opkg() {
	FEED_CONF="/etc/opkg/customfeeds.conf"
	FEED_LINE="src/gz warpscout ${FEED_BASE_URL}/ipk"

	mkdir -p /etc/opkg
	if [ -f "$FEED_CONF" ]; then
		sed -i '/[[:space:]]warpscout[[:space:]]/d' "$FEED_CONF"
	fi
	echo "$FEED_LINE" >> "$FEED_CONF"
	log "Added custom opkg feed to $FEED_CONF"

	# Try feed update + install; custom feeds without usign key may require direct release fallback
	if opkg update && opkg install "$PKG_NAME"; then
		opkg install "$I18N_PKG_NAME" 2>/dev/null || true
		return 0
	fi

	warn "opkg feed install failed (possibly due to unsigned custom feed); falling back to direct GitHub Release .ipk..."
	LATEST_TAG=$($FETCH_STDOUT "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | jsonfilter -e '@.tag_name' 2>/dev/null || true)
	if [ -z "$LATEST_TAG" ]; then
		err "Could not determine latest release tag from GitHub."
		exit 1
	fi
	VER="${LATEST_TAG#v}"
	TMP_IPK="/tmp/${PKG_NAME}_${VER}-r1_all.ipk"
	$FETCH_FILE "$TMP_IPK" "https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${PKG_NAME}_${VER}-r1_all.ipk"
	opkg update || true
	opkg install "$TMP_IPK"
	rm -f "$TMP_IPK"
}

install_via_apk() {
	REPO_DIR="/etc/apk/repositories.d"
	REPO_FILE="${REPO_DIR}/warpscout.list"

	mkdir -p "$REPO_DIR"
	echo "${FEED_BASE_URL}/apk/packages.adb" > "$REPO_FILE"
	log "Added custom apk feed to $REPO_FILE"

	if apk update --allow-untrusted && apk add --allow-untrusted "$PKG_NAME"; then
		apk add --allow-untrusted "$I18N_PKG_NAME" 2>/dev/null || true
		return 0
	fi

	warn "apk feed install failed; falling back to direct GitHub Release .apk..."
	LATEST_TAG=$($FETCH_STDOUT "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | jsonfilter -e '@.tag_name' 2>/dev/null || true)
	if [ -z "$LATEST_TAG" ]; then
		err "Could not determine latest release tag from GitHub."
		exit 1
	fi
	VER="${LATEST_TAG#v}"
	TMP_APK="/tmp/${PKG_NAME}-${VER}-r1.apk"
	$FETCH_FILE "$TMP_APK" "https://github.com/${GITHUB_REPO}/releases/download/${LATEST_TAG}/${PKG_NAME}-${VER}-r1.apk"
	apk add --allow-untrusted "$TMP_APK"
	rm -f "$TMP_APK"
}

if [ "$PKG_MGR" = "opkg" ]; then
	install_via_opkg
else
	install_via_apk
fi

# 6. Optionally install warpscout binary if not already present
if [ ! -x "/usr/bin/warpscout" ] && [ -x "/usr/libexec/warpscout/bootstrap.sh" ]; then
	log "Installing warpscout binary..."
	/usr/libexec/warpscout/bootstrap.sh --bin || warn "warpscout binary auto-install did not complete; you can install it from LuCI Overview."
fi

log "luci-app-warpscout installation complete. Open LuCI -> Services -> WarpScout."
