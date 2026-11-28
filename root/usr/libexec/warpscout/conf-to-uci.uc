#!/usr/bin/ucode
// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.
// conf-to-uci.uc - Converts WireGuard/AmneziaWG .conf snapshots to OpenWrt UCI network and firewall configurations.

'use strict';

import { cursor } from 'uci';
import { popen, open, stat, access, readfile } from 'fs';

function shellquote(s) {
	return `'${replace(s ?? '', "'", "'\\''")}'`;
}

function command(cmd) {
	const handle = popen(cmd);
	if (!handle) return null;
	const out = handle.read('all');
	handle.close();
	return trim(out ?? '');
}

function parse_conf(content) {
	if (!content) return null;
	const lines = split(content, '\n');
	let current_sec = null;
	let res = { interface: {}, peer: {} };

	for (let raw_line in lines) {
		let line = trim(raw_line);
		if (!length(line) || substr(line, 0, 1) == '#' || substr(line, 0, 1) == ';')
			continue;

		let sec_match = match(line, /^\[(.*)\]$/);
		if (sec_match) {
			current_sec = lc(sec_match[1]);
			continue;
		}

		let kv_match = match(line, /^([^=]+)=(.*)$/);
		if (kv_match && current_sec) {
			let k = trim(kv_match[1]);
			let v = trim(kv_match[2]);
			if (current_sec == 'interface') {
				res.interface[k] = v;
			} else if (current_sec == 'peer') {
				res.peer[k] = v;
			}
		}
	}
	return res;
}

function parse_endpoint(ep_str) {
	if (!ep_str) return { host: '', port: '' };
	let host = '';
	let port = '';

	if (substr(ep_str, 0, 1) == '[') {
		// IPv6 bracket notation [2606:...]:port
		let bracket_close = rindex(ep_str, ']');
		if (bracket_close > 0) {
			host = substr(ep_str, 1, bracket_close - 1);
			let colon = rindex(ep_str, ':');
			if (colon > bracket_close) {
				port = substr(ep_str, colon + 1);
			}
		}
	} else {
		// IPv4 host:port
		let colon = rindex(ep_str, ':');
		if (colon > 0) {
			host = substr(ep_str, 0, colon);
			port = substr(ep_str, colon + 1);
		} else {
			host = ep_str;
		}
	}

	return { host, port };
}

function apply_tunnel(opts) {
	const conf_content = opts.conf_content || (opts.conf_path ? readfile(opts.conf_path) : null);
	if (!conf_content) {
		return { success: false, error: 'No configuration content provided' };
	}

	const parsed = parse_conf(conf_content);
	if (!parsed || !parsed.interface?.PrivateKey || !parsed.peer?.PublicKey) {
		return { success: false, error: 'Invalid configuration format: PrivateKey or PublicKey missing' };
	}

	const iface = opts.iface || 'warp_auto_xx_1';
	if (!match(iface, /^[a-zA-Z0-9_-]{1,15}$/)) {
		return { success: false, error: 'Invalid interface name: must be 1-15 alphanumeric chars' };
	}

	const proto = opts.proto || (opts.iface && index(opts.iface, 'wg') >= 0 && index(opts.iface, 'awg') == -1 ? 'wireguard' : 'amneziawg');
	const zone_name = opts.zone || 'wan';
	const route_allowed_ips = opts.route_allowed_ips ?? false;
	const peer_sec_name = `${proto}_${iface}`;

	const uci = cursor();

	// 1. Configure network interface
	uci.set('network', iface, 'interface');
	uci.set('network', iface, 'proto', proto);
	uci.set('network', iface, 'private_key', parsed.interface.PrivateKey);

	// Addresses
	if (parsed.interface.Address) {
		let addrs = split(parsed.interface.Address, /[,\s]+/);
		uci.set('network', iface, 'addresses', addrs);
	}

	// MTU
	let mtu = opts.mtu || parsed.interface.MTU || 1280;
	uci.set('network', iface, 'mtu', int(mtu));

	// DNS
	let dns_str = opts.dns || parsed.interface.DNS;
	if (dns_str) {
		let dns_list = split(dns_str, /[,\s]+/);
		uci.set('network', iface, 'dns', dns_list);
	}

	// AWG obfuscation parameters
	if (proto == 'amneziawg') {
		if (parsed.interface.Jc) uci.set('network', iface, 'awg_jc', int(parsed.interface.Jc));
		if (parsed.interface.Jmin) uci.set('network', iface, 'awg_jmin', int(parsed.interface.Jmin));
		if (parsed.interface.Jmax) uci.set('network', iface, 'awg_jmax', int(parsed.interface.Jmax));
		if (parsed.interface.I1) uci.set('network', iface, 'awg_i1', parsed.interface.I1);
		if (parsed.interface.S1) uci.set('network', iface, 'awg_s1', int(parsed.interface.S1));
		if (parsed.interface.S2) uci.set('network', iface, 'awg_s2', int(parsed.interface.S2));
		if (parsed.interface.H1) uci.set('network', iface, 'awg_h1', parsed.interface.H1);
		if (parsed.interface.H2) uci.set('network', iface, 'awg_h2', parsed.interface.H2);
	}

	// 2. Configure peer section
	uci.set('network', peer_sec_name, peer_sec_name);
	uci.set('network', peer_sec_name, 'public_key', parsed.peer.PublicKey);

	let ep = parse_endpoint(parsed.peer.Endpoint);
	if (ep.host) uci.set('network', peer_sec_name, 'endpoint_host', ep.host);
	if (ep.port) uci.set('network', peer_sec_name, 'endpoint_port', ep.port);

	let allowed_ips = parsed.peer.AllowedIPs ? split(parsed.peer.AllowedIPs, /[,\s]+/) : [ '0.0.0.0/0' ];
	uci.set('network', peer_sec_name, 'allowed_ips', allowed_ips);
	uci.set('network', peer_sec_name, 'route_allowed_ips', route_allowed_ips ? '1' : '0');
	uci.set('network', peer_sec_name, 'persistent_keepalive', int(parsed.peer.PersistentKeepalive || 25));

	uci.commit('network');

	// 3. Configure firewall zone assignment
	let zone_found = false;
	uci.foreach('firewall', 'zone', (s) => {
		if (s.name == zone_name) {
			zone_found = true;
			let net_list = s.network || [];
			if (type(net_list) == 'string') net_list = [ net_list ];
			if (index(net_list, iface) == -1) {
				push(net_list, iface);
				uci.set('firewall', s['.name'], 'network', net_list);
			}
		}
	});

	if (zone_found) {
		uci.commit('firewall');
	}

	// 4. Update warpscout tunnel tracking in /etc/config/warpscout
	const now_ts = time();
	uci.set('warpscout', iface, 'tunnel');
	uci.set('warpscout', iface, 'iface', iface);
	uci.set('warpscout', iface, 'proto', proto);
	uci.set('warpscout', iface, 'managed', (opts.managed === false) ? '0' : '1');
	if (opts.target_node != null) uci.set('warpscout', iface, 'target_node', opts.target_node);
	if (opts.last_node) uci.set('warpscout', iface, 'last_node', opts.last_node);
	if (opts.last_seen_as) uci.set('warpscout', iface, 'last_seen_as', opts.last_seen_as);
	uci.set('warpscout', iface, 'last_endpoint', parsed.peer.Endpoint || '');
	uci.set('warpscout', iface, 'last_apply', '' + now_ts);
	uci.commit('warpscout');

	// 5. Bring up interface & reload firewall
	command(`mkdir -p /etc/warpscout/tunnels && echo ${shellquote(conf_content)} > /etc/warpscout/tunnels/${iface}.conf`);
	command(`/etc/init.d/firewall reload >/dev/null 2>&1 &`);
	command(`/sbin/ifup ${shellquote(iface)}`);

	return {
		success: true,
		iface: iface,
		proto: proto,
		endpoint: parsed.peer.Endpoint,
		snapshot: `/etc/warpscout/tunnels/${iface}.conf`
	};
}

function verify_handshake(iface, proto, max_wait_sec) {
	const wait_limit = max_wait_sec || 8;
	const show_bin = (proto == 'wireguard') ? 'wg' : 'awg';

	for (let i = 0; i < wait_limit; i++) {
		const out = command(`${show_bin} show ${shellquote(iface)} latest-handshakes 2>/dev/null`);
		if (out && length(out)) {
			const parts = split(out, /\s+/);
			if (length(parts) >= 2) {
				const ts = int(parts[1]);
				if (ts > 0 && (time() - ts) < 40) {
					return {
						handshake: true,
						peer: parts[0],
						latest_handshake: ts,
						elapsed_sec: (time() - ts)
					};
				}
			}
		}
		sleep(1000);
	}

	return { handshake: false };
}

function update_endpoint(iface, endpoint, node, seen_as) {
	if (!iface || !endpoint) {
		return { success: false, error: 'Interface and endpoint required' };
	}

	const uci = cursor();
	const proto = uci.get('network', iface, 'proto');
	if (!proto) {
		return { success: false, error: 'Interface ' + iface + ' not found in network config' };
	}

	const ep = parse_endpoint(endpoint);
	const peer_sec = `${proto}_${iface}`;

	if (ep.host) uci.set('network', peer_sec, 'endpoint_host', ep.host);
	if (ep.port) uci.set('network', peer_sec, 'endpoint_port', ep.port);
	uci.commit('network');

	uci.set('warpscout', iface, 'last_endpoint', endpoint);
	if (node) uci.set('warpscout', iface, 'last_node', node);
	if (seen_as) uci.set('warpscout', iface, 'last_seen_as', seen_as);
	uci.set('warpscout', iface, 'last_apply', '' + time());
	uci.commit('warpscout');

	// 1. Try on-the-fly kernel update for zero-downtime rotation
	const show_bin = (proto == 'wireguard') ? 'wg' : 'awg';
	const pubkey = uci.get('network', peer_sec, 'public_key');
	if (pubkey && ep.host && ep.port) {
		command(`${show_bin} set ${shellquote(iface)} peer ${shellquote(pubkey)} endpoint ${shellquote(endpoint)} 2>/dev/null`);
	}

	// 2. Ensure interface is up in netifd
	command(`/sbin/ifup ${shellquote(iface)} 2>/dev/null`);

	const hs_res = verify_handshake(iface, proto, 8);

	return {
		success: true,
		iface: iface,
		endpoint: endpoint,
		handshake: hs_res.handshake
	};
}

function delete_tunnel(iface) {
	if (!match(iface, /^[a-zA-Z0-9_-]{1,15}$/)) {
		return { success: false, error: 'Invalid interface name' };
	}

	const uci = cursor();
	const proto = uci.get('network', iface, 'proto') || 'amneziawg';
	const peer_sec_name = `${proto}_${iface}`;

	// 1. Bring down interface
	command(`/sbin/ifdown ${shellquote(iface)} 2>/dev/null`);

	// 2. Remove network sections
	uci.delete('network', iface);
	uci.delete('network', peer_sec_name);
	uci.commit('network');

	// 3. Remove from firewall zone
	uci.foreach('firewall', 'zone', (s) => {
		let net_list = s.network;
		if (type(net_list) == 'array') {
			let new_list = filter(net_list, n => n != iface);
			if (length(new_list) != length(net_list)) {
				uci.set('firewall', s['.name'], 'network', new_list);
			}
		}
	});
	uci.commit('firewall');

	// 4. Remove from warpscout config
	uci.delete('warpscout', iface);
	uci.commit('warpscout');

	command(`/etc/init.d/firewall reload >/dev/null 2>&1 &`);
	command(`rm -f /etc/warpscout/tunnels/${iface}.conf`);

	return { success: true, iface: iface };
}

// Standalone CLI invocation: conf-to-uci.uc update-endpoint <iface> <endpoint> [node] [seen_as]
if (global?.ARGV && length(global.ARGV) > 0) {
	const action = ARGV[0];
	if (action == 'update-endpoint' && length(ARGV) >= 3) {
		const res = update_endpoint(ARGV[1], ARGV[2], ARGV[3] || null, ARGV[4] || null);
		print(sprintf('%J\n', res));
		exit(res.success ? 0 : 1);
	}
}

return {
	parse_conf,
	parse_endpoint,
	apply_tunnel,
	update_endpoint,
	verify_handshake,
	delete_tunnel
};
