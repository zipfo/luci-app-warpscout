// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callGetSettings = rpc.declare({
	object: 'luci.warpscout',
	method: 'getSettings',
	expect: { }
});

var callSetSettings = rpc.declare({
	object: 'luci.warpscout',
	method: 'setSettings',
	params: [ 'binary', 'account', 'jobs', 'caps_ttl', 'auto_update', 'update_url' ],
	expect: { }
});

var callGetLogs = rpc.declare({
	object: 'luci.warpscout',
	method: 'getLogs',
	params: [ 'lines' ],
	expect: { }
});

var callClearLogs = rpc.declare({
	object: 'luci.warpscout',
	method: 'clearLogs',
	expect: { }
});

var callGetDiagnostics = rpc.declare({
	object: 'luci.warpscout',
	method: 'getDiagnostics',
	expect: { }
});

return view.extend({
	load: function() {
		return Promise.all([
			callGetSettings(),
			callGetLogs(200),
			callGetDiagnostics()
		]);
	},

	handleSaveSettings: function(ev) {
		var binary = document.getElementById('cfg-binary').value.trim();
		var account = document.getElementById('cfg-account').value.trim();
		var jobs = parseInt(document.getElementById('cfg-jobs').value, 10) || 4;
		var capsTtl = parseInt(document.getElementById('cfg-caps-ttl').value, 10);
		if (isNaN(capsTtl) || capsTtl < 0) capsTtl = 60;

		if (!binary || !account) {
			ui.addNotification(null, E('p', _('Binary path and account file path cannot be empty.')), 'error');
			return;
		}

		ui.showModal(_('Saving Settings'), [
			E('p', { 'class': 'spinning' }, _('Updating WarpScout UCI configuration...'))
		]);

		return callSetSettings(binary, account, jobs, capsTtl, false, '').then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Settings saved successfully.')), 'info');
			} else {
				ui.addNotification(null, E('p', _('Failed to save settings.')), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleRefreshLogs: function(ev) {
		var lines = parseInt(document.getElementById('log-lines-select').value, 10) || 200;
		return callGetLogs(lines).then(function(res) {
			var box = document.getElementById('warpscout-log-box');
			if (box) {
				box.textContent = (res && res.content) ? res.content : _('(Log file is empty)');
				box.scrollTop = box.scrollHeight;
			}
			var sizeBadge = document.getElementById('warpscout-log-size');
			if (sizeBadge) {
				sizeBadge.textContent = ((res?.size || 0) / 1024).toFixed(1) + ' KB';
			}
		});
	},

	handleClearLogs: function(ev) {
		var self = this;
		ui.showModal(_('Clear Execution Log'), [
			E('p', {}, _('Are you sure you want to truncate /var/log/warpscout.log? This action cannot be undone.')),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'btn',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-negative',
					'click': function() {
						ui.hideModal();
						callClearLogs().then(function(res) {
							if (res && res.success) {
								ui.addNotification(null, E('p', _('Log file cleared.')), 'info');
								self.handleRefreshLogs();
							} else {
								ui.addNotification(null, E('p', _('Failed to clear log file.')), 'error');
							}
						});
					}
				}, _('Clear Log'))
			])
		]);
	},

	handleCopyDiagnostics: function(diagJson) {
		var text = JSON.stringify(diagJson, null, 2);
		if (navigator.clipboard && navigator.clipboard.writeText) {
			navigator.clipboard.writeText(text).then(function() {
				ui.addNotification(null, E('p', _('Sanitized diagnostics JSON copied to clipboard.')), 'info');
			});
		} else {
			var ta = document.createElement('textarea');
			ta.value = text;
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			document.body.removeChild(ta);
			ui.addNotification(null, E('p', _('Sanitized diagnostics JSON copied to clipboard.')), 'info');
		}
	},

	handleDownloadDiagnostics: function(diagJson) {
		var text = JSON.stringify(diagJson, null, 2);
		var blob = new Blob([ text ], { type: 'application/json' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = 'warpscout-diagnostics.json';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	},

	render: function(results) {
		var self = this;
		var settings = results[0] || {};
		var logs = results[1] || {};
		var diag = results[2] || {};

		var board = diag.board || {};
		var release = board.release || {};
		var caps = diag.capabilities || {};

		var m = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('WarpScout Settings & Diagnostics')),
			E('div', { 'class': 'cbi-map-descr' }, _('Configure core engine paths, inspect runtime logs, and export sanitized system diagnostics without exposing private keys.'))
		]);

		// 1. Core Settings Section
		var settingsSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Core Settings')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'for': 'cfg-binary' }, _('WarpScout Binary Path')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', {
							'type': 'text',
							'id': 'cfg-binary',
							'class': 'cbi-input-text',
							'value': settings.binary || '/usr/bin/warpscout'
						})
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'for': 'cfg-account' }, _('Account File Path')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', {
							'type': 'text',
							'id': 'cfg-account',
							'class': 'cbi-input-text',
							'value': settings.account || '/etc/warpscout/account.json'
						}),
						E('div', { 'class': 'cbi-value-description' }, _('Stored with 0600 permissions. Private keys are never exposed via RPC.'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'for': 'cfg-jobs' }, _('Max Parallel Tunnel Jobs (-jt)')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', {
							'type': 'number',
							'id': 'cfg-jobs',
							'class': 'cbi-input-text',
							'style': 'max-width:120px;',
							'min': '1',
							'max': '16',
							'value': settings.jobs || 4
						}),
						E('div', { 'class': 'cbi-value-description' }, _('Automatically throttled on routers with < 256 MB RAM to prevent OOM.'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'for': 'cfg-caps-ttl' }, _('Capabilities Cache TTL (seconds)')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', {
							'type': 'number',
							'id': 'cfg-caps-ttl',
							'class': 'cbi-input-text',
							'style': 'max-width:120px;',
							'min': '0',
							'max': '3600',
							'value': (settings.caps_ttl != null) ? settings.caps_ttl : 60
						})
					])
				])
			]),
			E('div', { 'class': 'cbi-page-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(self, 'handleSaveSettings')
				}, _('Save Settings'))
			])
		]);
		m.appendChild(settingsSection);

		// 2. Execution Log Section
		var logSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, [
				_('Execution Log (/var/log/warpscout.log)'),
				' ',
				E('span', {
					'id': 'warpscout-log-size',
					'class': 'label'
				}, ((logs.size || 0) / 1024).toFixed(1) + ' KB')
			]),
			E('div', { 'style': 'margin-bottom:8px;display:flex;gap:8px;align-items:center;' }, [
				(function() {
					var dd = new ui.Dropdown('200', {
						'100': _('Last 100 lines'),
						'200': _('Last 200 lines'),
						'500': _('Last 500 lines')
					}, {
						id: 'log-lines-select',
						sort: false,
						optional: false
					}).render();
					dd.addEventListener('cbi-dropdown-change', ui.createHandlerFn(self, 'handleRefreshLogs'));
					return dd;
				})(),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': ui.createHandlerFn(self, 'handleRefreshLogs')
				}, _('Refresh Log')),
				E('button', {
					'class': 'cbi-button cbi-button-negative',
					'click': ui.createHandlerFn(self, 'handleClearLogs')
				}, _('Clear Log'))
			]),
			E('pre', {
				'id': 'warpscout-log-box',
				'style': 'background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:4px;max-height:360px;overflow:auto;font-family:monospace;font-size:12px;white-space:pre-wrap;'
			}, (logs.content && logs.content.length) ? logs.content : _('(Log file is empty)'))
		]);
		m.appendChild(logSection);

		// 3. System Diagnostics Section
		var wgReady = caps?.wg?.ready ?
			E('span', { 'class': 'label success' }, _('Ready')) :
			E('span', { 'class': 'label warning' }, _('Missing / Incomplete'));
		var awgReady = caps?.awg?.ready ?
			E('span', { 'class': 'label success' }, _('Ready')) :
			E('span', { 'class': 'label warning' }, _('Missing / Incomplete'));

		var diagSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('System Diagnostics')),
			E('div', { 'class': 'cbi-section-descr' }, _('Environment snapshot for troubleshooting. Private keys and raw tokens are automatically stripped.')),
			E('table', { 'class': 'table', 'style': 'width:100%;max-width:850px;margin-bottom:12px;' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'width:30%;font-weight:bold;' }, _('OpenWrt Release / Target')),
					E('td', { 'class': 'td' }, (release.description || '-') + ' (' + (release.target || '-') + ')')
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('Kernel Version')),
					E('td', { 'class': 'td' }, E('code', {}, board.kernel || caps.kernel || '-'))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('WarpScout Binary')),
					E('td', { 'class': 'td' }, diag.binary?.installed ? ('v' + (diag.binary.version || '?') + ' (' + diag.binary.path + ')') : _('Not installed'))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('/dev/net/tun Device')),
					E('td', { 'class': 'td' }, diag.has_tun ? E('span', { 'class': 'label success' }, _('Present')) : E('span', { 'class': 'label' }, _('Absent (not needed for CLI scan/SOCKS)')))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('Protocol Capabilities')),
					E('td', { 'class': 'td' }, [
						'WireGuard: ', wgReady, ' | AmneziaWG: ', awgReady
					])
				])
			]),
			E('div', { 'class': 'cbi-page-actions', 'style': 'margin-bottom:12px;' }, [
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': function() { self.handleCopyDiagnostics(diag); }
				}, _('Copy Sanitized Report (JSON)')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': function() { self.handleDownloadDiagnostics(diag); }
				}, _('Download Diagnostics (.json)'))
			]),
			E('details', {}, [
				E('summary', { 'style': 'cursor:pointer;font-weight:bold;margin-bottom:8px;' }, _('View Raw Diagnostics JSON & Storage/Syslog Details')),
				E('pre', {
					'style': 'background:#1e1e1e;color:#9cdcfe;padding:12px;border-radius:4px;max-height:400px;overflow:auto;font-family:monospace;font-size:12px;'
				}, JSON.stringify(diag, null, 2))
			])
		]);
		m.appendChild(diagSection);

		return m;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
