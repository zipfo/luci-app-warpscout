// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callGetSocksStatus = rpc.declare({
	object: 'luci.warpscout',
	method: 'getSocksStatus',
	expect: { }
});

var callSetSocksConfig = rpc.declare({
	object: 'luci.warpscout',
	method: 'setSocksConfig',
	params: [ 'enabled', 'endpoint', 'proto', 'listen', 'port', 'allow_lan' ],
	expect: { }
});

var callTestSocksProxy = rpc.declare({
	object: 'luci.warpscout',
	method: 'testSocksProxy',
	params: [ 'host', 'port' ],
	expect: { }
});

return view.extend({
	load: function() {
		return callGetSocksStatus();
	},

	handleSaveConfig: function(ev) {
		var enabled = document.getElementById('socks-enabled').checked;
		var endpoint = document.getElementById('socks-endpoint').value.trim();
		var proto = document.getElementById('socks-proto').value;
		var port = parseInt(document.getElementById('socks-port').value, 10) || 1080;
		var allowLan = document.getElementById('socks-allow-lan').checked;
		var listen = allowLan ? '0.0.0.0' : '127.0.0.1';

		if (enabled && !endpoint) {
			ui.addNotification(null, E('p', _('Please specify a target WARP endpoint before enabling the SOCKS proxy.')), 'error');
			return;
		}

		ui.showModal(_('Applying SOCKS5 Configuration'), [
			E('p', { 'class': 'spinning' }, _('Updating UCI settings and controlling warpscout-socks service...'))
		]);

		return callSetSocksConfig(enabled, endpoint, proto, listen, port, allowLan).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('SOCKS proxy configuration updated successfully.')), 'info');
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Failed to update SOCKS configuration.') + (res?.error ? ' ' + res.error : '')), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleTestProxy: function(ev) {
		var allowLan = document.getElementById('socks-allow-lan').checked;
		var host = allowLan ? '127.0.0.1' : (document.getElementById('socks-listen')?.value || '127.0.0.1');
		var port = parseInt(document.getElementById('socks-port').value, 10) || 1080;

		var outputArea = document.getElementById('socks-test-output');
		if (outputArea) {
			dom.content(outputArea, E('p', { 'class': 'spinning' }, _('Probing proxy reachability and Cloudflare CDN trace...')));
		}

		return callTestSocksProxy(host, port).then(function(res) {
			if (!outputArea) return;
			if (res && res.success) {
				var content = [];
				content.push(E('div', { 'class': 'alert-message success' }, _('Proxy is responding! Connection verified.')));
				if (res.trace) {
					content.push(E('pre', {
						'style': 'background:#1e1e1e;color:#85e89d;padding:10px;border-radius:4px;font-family:monospace;margin-top:8px;'
					}, res.trace));
				} else if (res.message) {
					content.push(E('p', {}, res.message));
				}
				dom.content(outputArea, content);
			} else {
				var errContent = [
					E('div', { 'class': 'alert-message warning' }, _('Test failed: ') + (res?.error || _('Port unreachable')))
				];
				if (res?.log_tail && res.log_tail.length) {
					errContent.push(E('pre', {
						'style': 'background:#1e1e1e;color:#f97583;padding:10px;border-radius:4px;font-family:monospace;margin-top:8px;'
					}, res.log_tail));
				}
				dom.content(outputArea, errContent);
			}
		}).catch(function(err) {
			if (outputArea) {
				dom.content(outputArea, [
					E('div', { 'class': 'alert-message danger' }, _('RPC error: ') + err.message)
				]);
			}
		});
	},

	render: function(data) {
		var self = this;
		var s = data || {};

		var m = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('WarpScout SOCKS5 Proxy')),
			E('div', { 'class': 'cbi-map-descr' }, _('Run a standalone userspace SOCKS5 proxy to test WARP endpoints without requiring root privileges or kernel WireGuard/AmneziaWG modules.'))
		]);

		// 1. Status Section
		var statusBadge;
		if (s.running) {
			statusBadge = E('span', { 'class': 'label success' }, _('Running'));
		} else if (s.enabled) {
			statusBadge = E('span', { 'class': 'label danger' }, _('Stopped (Error)'));
		} else {
			statusBadge = E('span', { 'class': 'label' }, _('Disabled'));
		}

		var listenBadge;
		if (s.listening) {
			listenBadge = E('span', { 'class': 'label success' }, _('Port Open (Listening)'));
		} else {
			listenBadge = E('span', { 'class': 'label' }, _('Port Closed'));
		}

		var statusSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Proxy Service Status')),
			E('table', { 'class': 'table', 'style': 'width:100%;max-width:800px;margin-bottom:1rem;' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'width:30%;font-weight:bold;' }, _('Service State:')),
					E('td', { 'class': 'td' }, [ statusBadge, ' ', s.pid ? E('small', { 'style': 'opacity:0.8;' }, '(PID: ' + s.pid + ')') : '' ])
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('Socket Status:')),
					E('td', { 'class': 'td' }, [ listenBadge, ' ', E('code', {}, (s.listen || '127.0.0.1') + ':' + (s.port || '1080')) ])
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('Active Target Endpoint:')),
					E('td', { 'class': 'td' }, [
						s.endpoint && s.endpoint.length ? E('code', { 'style': 'font-weight:bold;' }, s.endpoint) : E('em', {}, _('None configured')),
						' ',
						s.proto ? E('span', { 'class': 'label notice' }, s.proto.toUpperCase()) : ''
					])
				])
			])
		]);
		m.appendChild(statusSection);

		// 2. Configuration Section
		var formSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Proxy Configuration'))
		]);
		var formTable = E('div', { 'class': 'cbi-section-node' });

		// Enabled Switch
		var enabledRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'socks-enabled' }, _('Enable SOCKS5 Proxy')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('input', {
					'type': 'checkbox',
					'id': 'socks-enabled',
					'class': 'cbi-input-checkbox',
					'checked': s.enabled ? 'checked' : null
				}),
				E('div', { 'class': 'cbi-value-description' }, _('Launch warpscout socks proxy in background via procd.'))
			])
		]);
		formTable.appendChild(enabledRow);

		// Endpoint Row + 1-Click Best Endpoint Button
		var epInput = E('input', {
			'type': 'text',
			'id': 'socks-endpoint',
			'class': 'cbi-input-text',
			'style': 'max-width:320px;display:inline-block;margin-right:8px;',
			'value': s.endpoint || '',
			'placeholder': '162.159.192.1:2408'
		});

		var epField = E('div', { 'class': 'cbi-value-field' }, [
			epInput
		]);

		if (s.best_endpoint) {
			var bestBtn = E('button', {
				'class': 'cbi-button cbi-button-action',
				'type': 'button',
				'click': function() {
					epInput.value = s.best_endpoint;
					ui.addNotification(null, E('p', _('Applied best scan endpoint: ') + s.best_endpoint), 'info');
				}
			}, _('Use Best Scan Endpoint (') + s.best_endpoint + (s.best_node ? ' - ' + s.best_node : '') + ')');
			epField.appendChild(bestBtn);
		}

		epField.appendChild(E('div', { 'class': 'cbi-value-description' }, _('Target Cloudflare WARP IP:port. You can enter an endpoint manually or click the button above to copy the best endpoint from your latest scan.')));

		var epRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'socks-endpoint' }, _('Target WARP Endpoint')),
			epField
		]);
		formTable.appendChild(epRow);

		// Protocol Row
		var protoChoices = {
			'awg': _('AmneziaWG (awg) - Anti-DPI Obfuscation (Recommended)'),
			'wg': _('WireGuard (wg) - Standard UDP'),
			'masque': _('MASQUE (masque) - CONNECT-IP over QUIC'),
			'masque-h2': _('MASQUE-H2 (masque-h2) - CONNECT-IP over HTTP/2 TCP')
		};
		var protoSelect = new ui.Dropdown(s.proto || 'awg', protoChoices, {
			id: 'socks-proto',
			sort: false,
			optional: false
		}).render();

		var protoRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'socks-proto' }, _('Tunnel Protocol')),
			E('div', { 'class': 'cbi-value-field' }, [
				protoSelect,
				E('div', { 'class': 'cbi-value-description' }, _('Protocol used by userspace proxy to connect to Cloudflare edge.'))
			])
		]);
		formTable.appendChild(protoRow);

		// Allow LAN Access Row
		var lanWarning = E('div', {
			'id': 'socks-lan-warning',
			'class': 'alert-message warning',
			'style': 'margin-top:6px;display:' + (s.allow_lan ? 'block' : 'none') + ';'
		}, _('Warning: Allowing LAN access binds SOCKS to 0.0.0.0 without authentication. Any device on your local network will be able to route traffic through this router.'));

		var allowLanCheckbox = E('input', {
			'type': 'checkbox',
			'id': 'socks-allow-lan',
			'class': 'cbi-input-checkbox',
			'checked': s.allow_lan ? 'checked' : null,
			'change': function() {
				lanWarning.style.display = this.checked ? 'block' : 'none';
			}
		});

		var allowLanRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'socks-allow-lan' }, _('Allow LAN Access')),
			E('div', { 'class': 'cbi-value-field' }, [
				allowLanCheckbox,
				E('div', { 'class': 'cbi-value-description' }, _('Bind to 0.0.0.0 so other computers and phones on your home network can use this SOCKS5 proxy.')),
				lanWarning
			])
		]);
		formTable.appendChild(allowLanRow);

		// Port Row
		var portInput = E('input', {
			'type': 'number',
			'id': 'socks-port',
			'class': 'cbi-input-text',
			'style': 'max-width:160px;',
			'value': s.port || 1080,
			'min': '1024',
			'max': '65535'
		});

		var portRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'socks-port' }, _('Listen Port')),
			E('div', { 'class': 'cbi-value-field' }, [
				portInput,
				E('div', { 'class': 'cbi-value-description' }, _('Port number the proxy server listens on (default: 1080).'))
			])
		]);
		formTable.appendChild(portRow);

		// Actions
		var btnRow = E('div', { 'class': 'cbi-page-actions' }, [
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': ui.createHandlerFn(self, 'handleSaveConfig')
			}, _('Save & Apply Settings')),
			' ',
			E('button', {
				'class': 'cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, 'handleTestProxy')
			}, _('Test SOCKS Proxy'))
		]);

		formSection.appendChild(formTable);
		formSection.appendChild(btnRow);
		m.appendChild(formSection);

		// 3. Test & Diagnostics output
		var testSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Connectivity Test Results')),
			E('div', { 'id': 'socks-test-output' }, [
				E('p', { 'style': 'color:#666;' }, _('Click "Test SOCKS Proxy" above to verify port reachability and query Cloudflare trace.'))
			])
		]);
		m.appendChild(testSection);

		// 4. Caveats & Architecture notice
		var noticeSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Important Usage Notes')),
			E('div', { 'class': 'alert-message info' }, [
				E('p', {}, _('• Standalone Userspace Engine: warpscout socks does not require Linux kernel modules (kmod-wireguard / kmod-amneziawg) or /dev/net/tun.')),
				E('p', {}, _('• Single Tunnel Testing: Designed for quick endpoint testing, curl probes, and browser exploration without routing whole-router traffic.')),
				E('p', {}, _('• No Failover: Unlike UCI network interfaces, if ISP or DPI interrupts this single UDP socket, the proxy will not automatically switch endpoints. For permanent router routing, use the Tunnels tab.'))
			])
		]);
		m.appendChild(noticeSection);

		return m;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
