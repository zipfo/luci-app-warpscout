#!/bin/sh
# bootstrap.sh - Core engine for warpscout installation, checks, and updates
# Does NOT install protocol kernel modules or third-party feeds.

set -e

WARPSCOUT_VERSION="0.16.1"
GITHUB_REPO="vernette/warpscout"
BASE_URL="https://github.com/${GITHUB_REPO}/releases/download/v${WARPSCOUT_VERSION}"

# Expected SHA256 digests for release binaries
SHA256_AMD64="6c4889478f9047e0e86c80df82da299982f1c9a248f98234c4861b70590da91f"
SHA256_ARM64="172d1f4da0e8e6be6db13589c379a25037d4040f7b9a50892789fbc80b852f53"

log() {
	echo "[warpscout-bootstrap] $*"
}

err() {
	echo "[warpscout-bootstrap] ERROR: $*" >&2
}

detect_arch() {
	ARCH=$(uname -m 2>/dev/null || echo "unknown")
	case "$ARCH" in
		x86_64|amd64)
			GO_ARCH="amd64"
			EXPECTED_SHA="$SHA256_AMD64"
			;;
		aarch64|arm64)
			GO_ARCH="arm64"
			EXPECTED_SHA="$SHA256_ARM64"
			;;
		*)
			err "Architecture '$ARCH' is not supported. Only x86_64 and aarch64 are supported."
			exit 1
			;;
	esac
}

detect_fetch() {
	if command -v uclient-fetch >/dev/null 2>&1; then
		FETCH="uclient-fetch -q -O"
	elif command -v wget >/dev/null 2>&1; then
		FETCH="wget -q -O"
	elif command -v curl >/dev/null 2>&1; then
		FETCH="curl -sSL -o"
	else
		err "No download utility found (uclient-fetch, wget, or curl required)."
		exit 1
	fi
}

check_prerequisites() {
	detect_arch
	detect_fetch

	# Check flash space (require at least 15 MB free on root)
	FREE_KB=$(df -k / | awk 'NR==2 {print $4}')
	if [ -n "$FREE_KB" ] && [ "$FREE_KB" -lt 15360 ]; then
		err "Insufficient free disk space on root filesystem: $(( FREE_KB / 1024 )) MB available, minimum 15 MB required."
		exit 1
	fi

	# Warn if RAM is below 128 MB
	TOTAL_RAM_KB=$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)
	if [ "$TOTAL_RAM_KB" -lt 131072 ]; then
		log "WARNING: Device has less than 128 MB RAM ($(( TOTAL_RAM_KB / 1024 )) MB). Parallel scanner jobs will be throttled."
	fi
}

install_binary() {
	check_prerequisites

	TARGET_DIR="/usr/bin"
	BIN_PATH="${TARGET_DIR}/warpscout"
	TMP_ARCHIVE="/tmp/warpscout_${WARPSCOUT_VERSION}_linux_${GO_ARCH}.tar.gz"
	DOWNLOAD_URL="${BASE_URL}/warpscout_${WARPSCOUT_VERSION}_linux_${GO_ARCH}.tar.gz"

	log "Downloading warpscout v${WARPSCOUT_VERSION} (${GO_ARCH})..."
	$FETCH "$TMP_ARCHIVE" "$DOWNLOAD_URL"

	# Verify sha256 checksum
	ACTUAL_SHA=$(sha256sum "$TMP_ARCHIVE" | awk '{print $1}')
	if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
		err "Checksum mismatch for downloaded archive! Expected $EXPECTED_SHA, got $ACTUAL_SHA"
		rm -f "$TMP_ARCHIVE"
		exit 1
	fi

	log "Checksum verified ($ACTUAL_SHA). Extracting..."
	tar -xzf "$TMP_ARCHIVE" -C /tmp/ warpscout
	chmod 0755 /tmp/warpscout

	# Verify execution
	TMP_VER=$(/tmp/warpscout version 2>/dev/null || echo "")
	if [ -z "$TMP_VER" ]; then
		err "Extracted binary failed to execute /tmp/warpscout version"
		rm -f "$TMP_ARCHIVE" /tmp/warpscout
		exit 1
	fi

	# Atomic replacement
	mv -f /tmp/warpscout "$BIN_PATH"
	rm -f "$TMP_ARCHIVE"

	log "Binary successfully installed at $BIN_PATH (version $TMP_VER)"
}

run_check() {
	if [ -x "/usr/libexec/warpscout/capabilities.sh" ]; then
		/usr/libexec/warpscout/capabilities.sh
	else
		err "Capabilities detector /usr/libexec/warpscout/capabilities.sh not found."
		exit 1
	fi
}

case "$1" in
	--bin)
		install_binary
		;;
	--check)
		run_check
		;;
	*)
		echo "Usage: $0 [--bin | --check]"
		exit 1
		;;
esac
