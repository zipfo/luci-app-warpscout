# luci-app-warpscout

LuCI web interface for managing [`warpscout`](https://github.com/vernette/warpscout) Cloudflare WARP endpoint scanning, tunnels, schedules, and userspace SOCKS5 proxy on OpenWrt.

## Features

- **Version Status & Diagnostics**: Displays `luci-app-warpscout` and `warpscout` binary versions with GitHub update checks, WARP account status, and read-only kernel/module capability detection (`WireGuard`, `AmneziaWG`, `MASQUE`).
- **Endpoint Scanner**: Runs `warpscout` scans from LuCI with protocol selection (`awg`, `wg`, `masque`, `masque-h2`), port/country/node filters, obfuscation options, saved scan profiles, and live log streaming.
- **Scan Results**: Inspects discovered endpoints (RTT, packet loss, edge node, country), copies endpoints, previews generated `.conf`, and exports CSV.
- **Tunnels**: Creates and manages WireGuard / AmneziaWG UCI interfaces with firewall zone assignment, handshake verification, and scheduler-pinned rotation.
- **Schedule**: Automates periodic endpoint scans and zero-downtime tunnel or SOCKS5 updates via OpenWrt `crond`.
- **SOCKS5 Proxy**: Manages the standalone userspace `warpscout` SOCKS5 proxy service (`procd`) with LAN access toggle and live connectivity testing.

## Supported Platforms

- **OpenWrt**: 24.10 (`opkg` / `.ipk`) and 25.12+ (`apk` / `.apk`)
- **Architectures** (matching `warpscout` Linux builds): `x86_64`, `aarch64`, `mips`, `mipsel`

## Quick Installation

Run on your OpenWrt router via SSH to configure the custom package feed and install `luci-app-warpscout`:

```sh
wget -qO- https://zipfo.github.io/luci-app-warpscout/install.sh | sh
```

The installer:
1. Verifies architecture and available flash space.
2. Adds the custom `opkg` (`/etc/opkg/customfeeds.conf`) or `apk` (`/etc/apk/repositories.d/warpscout.list`) feed.
3. Installs `luci-app-warpscout` (and `luci-i18n-warpscout-ru` if available), with automatic fallback to GitHub Releases.
4. Bootstraps the `warpscout` binary if not yet installed.

Manual packages (`.ipk` and `.apk`) are also available on the [Releases](https://github.com/zipfo/luci-app-warpscout/releases) page.

## License

MIT License. See [LICENSE](LICENSE) for details.
