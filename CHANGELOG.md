# Changelog

All notable changes to `luci-app-warpscout` will be documented in this file.

## [0.1.0] - 2026-11-25

### Added
- **Core LuCI Application & RPC Backend**:
  - `luci.warpscout` ucode rpcd module and ACL definitions (`admin/services/warpscout`).
  - Default UCI schema (`/etc/config/warpscout`) covering `warpscout`, `scanprofile`, `job`, `tunnel`, and `socks` sections.
  - Account management (`registerAccount`, `getAccount`) with `0600` file permissions and private key masking (`abcd...wxyz`).
- **Read-Only Capability Detection & Bootstrap**:
  - `capabilities.sh` inspecting kernel `vermagic` compatibility, `kmod-wireguard` / `kmod-amneziawg`, `wg` / `awg` tools, and `netifd` protocol handlers.
  - `bootstrap.sh` and `install.sh` for `x86_64` and `aarch64` binary verification with SHA-256 checks.
  - Concise protocol readiness section (`WireGuard`/`AmneziaWG`) and capability refresh on `overview.js`, gating kernel interface creation when protocol modules are missing while keeping scanning available.
- **Asynchronous Scanner & Report Parser**:
  - Locked runner (`run-scan.sh`) using `flock`, RAM-aware concurrency throttling (`-jt`), log rotation, and artifact retention (last 20 jobs in `/etc/warpscout/artifacts/`).
  - Strict ucode table parser (`report-parse.uc`) and interactive scanner UI (`scan.js`) with real-time log polling.
  - Results browser (`results.js`) with node/country/zero-loss filters, sorting, `.conf` preview/copy, and CSV export.
- **WireGuard & AmneziaWG Tunnel Management**:
  - `.conf` to UCI translator (`conf-to-uci.uc`) managing `network`, `firewall`, and `warpscout` sections with full AmneziaWG obfuscation (`awg_jc`, `awg_jmin`, `awg_jmax`, `awg_i1`) support.
  - Live handshake verification (`wg show` / `awg show`), zero-downtime kernel endpoint rotation (`wg set` / `awg set`), per-tunnel `managed` / pinned `target_node` controls, and live node/country display.
- **Scheduler & Crontab Automation**:
  - Isolated crontab block management (`# BEGIN WARPSCOUT MANAGED BLOCK` ... `# END WARPSCOUT MANAGED BLOCK`) in `/etc/crontabs/root` via `cron-sync.sh`.
  - Jitter delay, WAN connectivity check, and automated post-scan tunnel endpoint rotation (`schedule.js`).
- **Userspace SOCKS5 Proxy**:
  - `procd` service (`/etc/init.d/warpscout-socks`) with respawn, AWG obfuscation flags, and LAN access toggle (`socks.js`).
  - Health-check endpoint (`testSocksProxy`) supporting both BusyBox `nc`/`netstat` and `curl` Cloudflare CDN trace.
- **Settings, Diagnostics & Localization**:
  - Core UCI settings editor, `/var/log/warpscout.log` viewer, and sanitized system diagnostics JSON export (`settings.js`).
  - Full English template (`po/templates/warpscout.pot`) and Russian translation (`po/ru/warpscout.po`, 357 strings).
