# luci-app-warpscout

LuCI application and management wrapper for the [`warpscout`](https://github.com/vernette/warpscout) Cloudflare WARP scanner on OpenWrt 24.10 and 25.x.

Supports WireGuard, AmneziaWG (v3.0 / v3.1 obfuscation), and MASQUE protocol scanning.

---

## Architecture & Design Principles

1. **CLI Wrapper with Zero Daemon Overhead**: `warpscout` is a standalone CLI tool without built-in daemon/API services. `luci-app-warpscout` provides service management, scheduled runs, state tracking, and interface lifecycle via standard OpenWrt primitives (`rpcd`, `ucode`, `procd`, `uci`, and `crond`).
2. **Read-Only Capability Detection**: The package does **not** install third-party kernel modules, protocol tools, or untrusted package feeds. Instead, a read-only capability detector inspects kernel compatibility (`vermagic`), installed tools, and netifd protocol handlers, dynamically gating interface configuration in the UI while keeping endpoint scanning available on any system.
3. **Strict Secrets & Zero Data Leak Policy**:
   - Accounts (`/etc/warpscout/account.json`) are stored with strict `0600` permissions.
   - The RPC backend masks private keys (`abcd...wxyz`) and never exposes private tokens or keys over ubus or web APIs.

---

## Target Platforms

- **OpenWrt Releases**: 24.10 (`opkg`), 25.x (`apk`).
- **Architectures**: `x86_64` (AMD64) and `aarch64` (ARM64).

---

## Directory Structure

```text
luci-app-warpscout/
├── Makefile                                     # OpenWrt package buildroot definition
├── README.md                                    # Technical documentation
├── LICENSE                                      # MIT License
├── htdocs/luci-static/resources/view/warpscout/
│   │   ├── overview.js                              # Dashboard: binary, protocol packages, account, status
│   │   ├── results.js                               # Scan results, filtering, conf inspection, CSV
│   │   ├── scan.js                                  # Interactive scan runner and real-time log
│   │   ├── schedule.js                              # Crontab scheduler & zero-downtime tunnel rotation
│   │   ├── settings.js                              # Core UCI settings, log viewer & sanitized diagnostics
│   │   ├── socks.js                                 # Standalone userspace SOCKS5 proxy manager
│   │   └── tunnels.js                               # Managed WG/AWG tunnel lifecycle & live handshakes
│   ├── po/
│   │   ├── templates/
│   │   │   └── warpscout.pot                        # Translation template
│   │   └── ru/
│   │       └── warpscout.po                         # Russian translation
│   ├── root/
│   │   ├── etc/
│   │   │   ├── config/
│   │   │   │   └── warpscout                        # Default UCI configuration
│   │   │   ├── init.d/
│   │   │   │   └── warpscout-socks                  # procd init service for SOCKS5 proxy
│   │   │   └── uci-defaults/
│   │   │       └── 90_luci-app-warpscout            # Setup script: directories and permissions
│   │   └── usr/
│   │       ├── libexec/
│   │       │   └── warpscout/
│   │       │       ├── bootstrap.sh                 # Architecture discovery and sha256 binary installer
│   │       │       ├── capabilities.sh              # Read-only kernel, vermagic and netifd detector
│   │       │       ├── conf-to-uci.uc               # .conf to UCI translator and dynamic updater
│   │       │       ├── cron-sync.sh                 # Isolated crontab synchronization helper
│   │       │       ├── report-parse.uc              # warpscout scan report table parser
│   │       │       └── run-scan.sh                  # Locked execution runner with flock and jitter
│   └── usr/
│       └── share/
│           ├── luci/
│           │   └── menu.d/
│           │       └── luci-app-warpscout.json  # LuCI navigation menu definition
│           └── rpcd/
│               ├── acl.d/
│               │   └── luci-app-warpscout.json  # rpcd ACL permissions definition
│               └── ucode/
│                   └── luci.warpscout           # rpcd ucode backend plugin
```

Runtime storage layout:
- `/etc/warpscout/account.json` (0600) — Cloudflare WARP device identity and credentials.
- `/etc/warpscout/artifacts/` (0700) — Snapshot configurations and scanner output reports.
- `/var/run/warpscout/state.json` — Ephemeral scanner jobs, runner status, and capabilities cache.
- `/var/log/warpscout.log` (0644) — Execution log.

---

## UCI Configuration (`/etc/config/warpscout`)

### Section: `warpscout 'main'`
- `binary`: Path to `warpscout` executable (default `/usr/bin/warpscout`).
- `account`: Path to WARP account identity file (default `/etc/warpscout/account.json`).
- `version`: Expected binary release version (e.g. `0.16.1`).
- `jobs`: Number of parallel scanner workers (`-jt`, default `4`).
- `caps_ttl`: Capabilities cache validity in seconds (default `60`).

### Section: `scanprofile 'default'`
Defines default scanner parameters for UI and cron automation:
- `proto`: Target protocol (`awg`, `wg`, `masque`, `masque-h2`).
- `tun_ping`: Measure in-tunnel RTT and packet loss (`1` or `0`).
- `speed`: Enable download speed probing (`1` or `0`).
- `sample`: Endpoint count to probe per subnet (default `5`).
- `timeout`: Network probe timeout in seconds (default `2`).
- `exclude_nodes`: Space-separated list of airport code edge nodes to exclude (e.g. `DME`).

### Section: `job 'nightly'`
Scheduled scan and tunnel endpoint refresh:
- `enabled`: Toggle schedule (`0` or `1`).
- `cron`: Crontab expression (default `0 4 * * *`).
- `action`: Scheduled task (`update_tunnels`, `scan_only`, `socks_endpoint`).
- `jitter`: Random delay in seconds to avoid synchronized requests (default `300`).

---

## ubus / rpcd API Contract (`luci.warpscout`)

### `getStatus`
Returns current binary presence and version, masked account identity, and active job state.
```json
{
  "binary": {
    "path": "/usr/bin/warpscout",
    "installed": true,
    "version": "0.16.1"
  },
  "account": {
    "exists": true,
    "path": "/etc/warpscout/account.json",
    "id": "00000000-0000-0000-0000-000000000000",
    "ipv4": "172.16.0.2",
    "ipv6": "2606:4700:110::1",
    "key_mask": "mG2q...RFE=",
    "has_masque": true,
    "has_outer": true,
    "mtime": 1795373316
  },
  "state": null
}
```

### `getAccount`
Returns detailed account parameters (public keys, assigned addresses, protocol capabilities) without exposing secret keys.

### `registerAccount`
Registers or refreshes a Cloudflare WARP account via `warpscout register`.
- Arguments:
  - `fresh` (boolean, optional): Force registration of a new device identity (`--fresh`).
  - `relay` (string, optional): Use specific relay URL for restricted networks.
- Returns `{ "success": true, "output": "...", "account_path": "..." }`.

### `getCapabilities`
Executes read-only system capability detection (`capabilities.sh`), returning kernel vermagic compatibility, presence of protocol utilities (`wg`/`awg`), and netifd proto handlers.
- Arguments:
  - `force` (boolean, optional): Force cache bypass.

### `startScan`
Asynchronously triggers a background scan job using `run-scan.sh` with `flock` locking, RAM-aware concurrency throttling (`-jt`), and detailed error logging to `/var/log/warpscout.log` and `syslog`.
- Arguments:
  - `proto` (string): Protocol (`awg`, `wg`, `masque`, `masque-h2`).
  - `tun_ping` (boolean): Measure in-tunnel RTT and loss (`-P`).
  - `speed` (boolean): Measure download throughput (`--speed`).
  - `best_by` (string): Optimal endpoint criterion (`ping`, `speed`).
  - `sample` (integer): Probes per subnet (`-n`).
  - `full` (boolean): Scan all IPs in WARP ranges (`-f`).
  - `ipv6` (boolean): Scan IPv6 endpoints (`-6`).
  - `port` / `sweep_ports`: Custom port (`--port`) or sweep mode (`open`, `all`).
  - `nodes` / `exclude_nodes` / `countries` / `exclude_countries`: Edge location filters.
  - `targets` (string): Direct list of target IP endpoints.
  - AWG obfuscation (`proto == awg` only): `gen_junk`, `gen_i1`, `i1_sni`, `jc`, `jmin`, `jmax`, `i1`.
  - MASQUE options (`masque` / `masque-h2` only): `masque_sni`, `masque_attempts`.
- Returns `{ "success": true, "message": "Scan triggered", "cmd": "..." }`.

### `getScanProfiles` / `saveScanProfile` / `deleteScanProfile`
Lists, creates/updates, and deletes named `scanprofile` sections in `/etc/config/warpscout` (reused by both the Scan tab and Schedule tab).

### `runScheduledJob`
Manually triggers a configured scheduled cron job (`run-scan.sh --cron <job> --no-jitter`).

### `cancelScan`
Terminates any active scan process via `SIGTERM`/`SIGKILL`.

### `getScanStatus`
Returns active job status (`running`, `ok`, `failed`), real-time process log tail, and parsed results.

### `getResults`
Returns the latest scan discovery dataset (parsed working endpoints, latency, loss, seen-as locations, and optimal endpoint per node). Includes automatic fallback to persistent `/etc/warpscout/artifacts/` across router reboots.

### `getLastConfig`
Retrieves the raw WireGuard / AmneziaWG configuration file generated for the best discovered endpoint.

### `getTunnels`
Lists all managed and unmanaged WireGuard / AmneziaWG network interfaces, active link status, current endpoints, resolved node/country (`node`, `seen_as`, `target_node`), `managed` state, latest handshake timestamp, and transfer counters (Rx/Tx).

### `applyTunnel`
Applies a WireGuard or AmneziaWG configuration to OpenWrt UCI network and firewall subsystems, brings up the interface, and validates live handshake reception.
- Enforces capability gating (rejects creation if kernel modules or tools are missing).
- Arguments: `iface`, `proto`, `zone`, `route_allowed_ips`, `mtu`, `dns`, `verify`, `managed`, `target_node`.

### `setTunnelConfig`
Updates per-tunnel scheduler settings (`managed` toggle and optional pinned `target_node`) in `/etc/config/warpscout`.

### `updateEndpoint`
Updates an existing tunnel interface to a new endpoint address without regenerating keys.

### `deleteTunnel`
Gracefully downs an interface and deletes its entries from network, firewall, and warpscout configurations.

### `getSchedule`
Returns scheduled job profiles, crond daemon status (running/installed), and the live managed crontab block from `/etc/crontabs/root`.

### `setSchedule`
Configures cron frequency, profile, action (`update_tunnels` / `scan_only`), and jitter delay in UCI, synchronizing `/etc/crontabs/root` safely within isolated marker tags.

### `getSocksStatus`
Returns running status, PID, socket listening state, configured endpoint, and best scan endpoint for 1-click apply.

### `setSocksConfig`
Configures SOCKS5 proxy options (`endpoint`, `proto`, `listen`, `port`, `allow_lan`) and controls the `warpscout-socks` procd service.

### `testSocksProxy`
Verifies SOCKS5 proxy port reachability and queries Cloudflare trace (`/cdn-cgi/trace`) for live connectivity confirmation.

### `getSettings` / `setSettings`
Reads and updates core `warpscout.main` UCI parameters (`binary`, `account`, `jobs`, `caps_ttl`, `auto_update`, `update_url`).

### `getLogs` / `clearLogs`
Fetches the tail of `/var/log/warpscout.log` (up to 1000 lines) or truncates the log file.

### `getDiagnostics`
Returns a sanitized system diagnostics snapshot (OpenWrt board/target, kernel version, RAM/storage, `/dev/net/tun`, full `capabilities.sh` JSON, masked account summary, and recent `netifd`/`warpscout` syslog lines) without exposing any secrets.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
