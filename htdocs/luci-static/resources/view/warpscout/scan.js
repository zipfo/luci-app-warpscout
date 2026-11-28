// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';
'require poll';

var SCAN_PARAMS = [
	'proto', 'tun_ping', 'speed', 'best_by', 'sample', 'full', 'timeout',
	'ipv6', 'port', 'sweep_ports', 'nodes', 'countries', 'exclude_nodes',
	'exclude_countries', 'targets', 'gen_i1', 'i1_sni', 'gen_junk',
	'jc', 'jmin', 'jmax', 'i1',
	'padding', 'rekey_after', 'rekey_timeout', 'reject_after',
	'keepalive_timeout', 'max_handshakes', 'disable_cookies', 'random_trailers',
	'masque_sni', 'masque_attempts'
];

var callStartScan = rpc.declare({
	object: 'luci.warpscout',
	method: 'startScan',
	params: SCAN_PARAMS,
	expect: { }
});

var callCancelScan = rpc.declare({
	object: 'luci.warpscout',
	method: 'cancelScan',
	expect: { }
});

var callGetScanStatus = rpc.declare({
	object: 'luci.warpscout',
	method: 'getScanStatus',
	expect: { }
});

var callGetScanProfiles = rpc.declare({
	object: 'luci.warpscout',
	method: 'getScanProfiles',
	expect: { }
});

var callSaveScanProfile = rpc.declare({
	object: 'luci.warpscout',
	method: 'saveScanProfile',
	params: [ 'name' ].concat(SCAN_PARAMS),
	expect: { }
});

var callDeleteScanProfile = rpc.declare({
	object: 'luci.warpscout',
	method: 'deleteScanProfile',
	params: [ 'name' ],
	expect: { }
});

return view.extend({
	load: function() {
		return Promise.all([
			callGetScanStatus(),
			callGetScanProfiles()
		]);
	},

	readFormValues: function() {
		var proto = document.getElementById('field-proto').value;
		var tunPing = document.getElementById('field-tun-ping').checked;
		var speed = document.getElementById('field-speed').checked;
		var bestBy = document.getElementById('field-best-by').value;
		var full = document.getElementById('field-full').checked;
		var sample = parseInt(document.getElementById('field-sample').value, 10) || 5;
		var timeout = parseInt(document.getElementById('field-timeout').value, 10) || 2;
		var ipv6 = document.getElementById('field-ipv6').checked;
		var port = parseInt(document.getElementById('field-port').value, 10) || 0;
		var sweepPorts = document.getElementById('field-sweep-ports').value;
		var nodes = document.getElementById('field-nodes').value.trim();
		var countries = document.getElementById('field-countries').value.trim();
		var excludeNodes = document.getElementById('field-exclude-nodes').value.trim();
		var excludeCountries = document.getElementById('field-exclude-countries').value.trim();
		var targets = document.getElementById('field-targets').value.trim();

		var genJunk = document.getElementById('field-gen-junk').checked;
		var genI1 = document.getElementById('field-gen-i1').value;
		var i1Sni = document.getElementById('field-i1-sni').value.trim();
		var jc = parseInt(document.getElementById('field-jc').value, 10) || 0;
		var jmin = parseInt(document.getElementById('field-jmin').value, 10) || 0;
		var jmax = parseInt(document.getElementById('field-jmax').value, 10) || 0;
		var i1 = document.getElementById('field-i1').value.trim();

		var padding = document.getElementById('field-padding').value.trim();
		var rekeyAfter = document.getElementById('field-rekey-after').value.trim();
		var rekeyTimeout = document.getElementById('field-rekey-timeout').value.trim();
		var rejectAfter = document.getElementById('field-reject-after').value.trim();
		var keepaliveTimeout = document.getElementById('field-keepalive-timeout').value.trim();
		var maxHandshakes = document.getElementById('field-max-handshakes').value.trim();
		var disableCookies = document.getElementById('field-disable-cookies').checked;
		var randomTrailers = document.getElementById('field-random-trailers').checked;

		var masqueSni = document.getElementById('field-masque-sni').value.trim();
		var masqueAttempts = parseInt(document.getElementById('field-masque-attempts').value, 10) || 0;

		return {
			proto: proto,
			tun_ping: tunPing,
			speed: speed,
			best_by: bestBy,
			sample: sample,
			full: full,
			timeout: timeout,
			ipv6: ipv6,
			port: port,
			sweep_ports: sweepPorts,
			nodes: nodes,
			countries: countries,
			exclude_nodes: excludeNodes,
			exclude_countries: excludeCountries,
			targets: targets,
			gen_i1: genI1,
			i1_sni: i1Sni,
			gen_junk: genJunk,
			jc: jc,
			jmin: jmin,
			jmax: jmax,
			i1: i1,
			padding: padding,
			rekey_after: rekeyAfter,
			rekey_timeout: rekeyTimeout,
			reject_after: rejectAfter,
			keepalive_timeout: keepaliveTimeout,
			max_handshakes: maxHandshakes,
			disable_cookies: disableCookies,
			random_trailers: randomTrailers,
			masque_sni: masqueSni,
			masque_attempts: masqueAttempts
		};
	},

	applyProfileToForm: function(p) {
		if (!p) return;
		dom.callClassMethod(document.getElementById('field-proto'), 'setValue', p.proto || 'awg');
		document.getElementById('field-tun-ping').checked = (p.tun_ping !== false);
		document.getElementById('field-speed').checked = !!p.speed;
		dom.callClassMethod(document.getElementById('field-best-by'), 'setValue', p.best_by || 'ping');
		document.getElementById('field-full').checked = !!p.full;
		document.getElementById('field-sample').value = p.sample || 5;
		document.getElementById('field-timeout').value = p.timeout || 2;
		document.getElementById('field-ipv6').checked = !!p.ipv6;
		document.getElementById('field-port').value = p.port || '';
		dom.callClassMethod(document.getElementById('field-sweep-ports'), 'setValue', p.sweep_ports || '');
		document.getElementById('field-nodes').value = p.nodes || '';
		document.getElementById('field-countries').value = p.countries || '';
		document.getElementById('field-exclude-nodes').value = p.exclude_nodes || '';
		document.getElementById('field-exclude-countries').value = p.exclude_countries || '';
		document.getElementById('field-targets').value = p.targets || '';

		document.getElementById('field-gen-junk').checked = !!p.gen_junk;
		dom.callClassMethod(document.getElementById('field-gen-i1'), 'setValue', p.gen_i1 || '');
		document.getElementById('field-i1-sni').value = p.i1_sni || '';
		document.getElementById('field-jc').value = p.jc || '';
		document.getElementById('field-jmin').value = p.jmin || '';
		document.getElementById('field-jmax').value = p.jmax || '';
		document.getElementById('field-i1').value = p.i1 || '';

		document.getElementById('field-padding').value = p.padding || '';
		document.getElementById('field-rekey-after').value = p.rekey_after || '';
		document.getElementById('field-rekey-timeout').value = p.rekey_timeout || '';
		document.getElementById('field-reject-after').value = p.reject_after || '';
		document.getElementById('field-keepalive-timeout').value = p.keepalive_timeout || '';
		document.getElementById('field-max-handshakes').value = p.max_handshakes || '';
		document.getElementById('field-disable-cookies').checked = !!p.disable_cookies;
		document.getElementById('field-random-trailers').checked = !!p.random_trailers;

		document.getElementById('field-masque-sni').value = p.masque_sni || '';
		document.getElementById('field-masque-attempts').value = p.masque_attempts || '';

		this.updateDependentVisibility();
	},

	updateDependentVisibility: function() {
		var proto = document.getElementById('field-proto')?.value || 'awg';
		var speed = document.getElementById('field-speed')?.checked || false;
		var full = document.getElementById('field-full')?.checked || false;

		var isAwg = (proto === 'awg' || proto === 'awg31');
		var isAwg31 = (proto === 'awg31');
		var isMasque = (proto === 'masque' || proto === 'masque-h2');

		document.querySelectorAll('.awg-only-row').forEach(function(el) {
			el.style.display = isAwg ? '' : 'none';
		});
		document.querySelectorAll('.awg31-only-row').forEach(function(el) {
			el.style.display = isAwg31 ? '' : 'none';
		});
		document.querySelectorAll('.masque-only-row').forEach(function(el) {
			el.style.display = isMasque ? '' : 'none';
		});

		var bestByRow = document.getElementById('row-best-by');
		if (bestByRow) {
			bestByRow.style.display = speed ? '' : 'none';
		}

		var sampleInput = document.getElementById('field-sample');
		if (sampleInput) {
			sampleInput.disabled = full;
		}
	},

	pollStatus: function(viewRoot) {
		return callGetScanStatus().then(function(status) {
			var job = status?.job;
			var logTail = status?.tail || '';

			var monitorSection = viewRoot.querySelector('#scan-monitor-section');
			var formSection = viewRoot.querySelector('#scan-form-section');
			var logConsole = viewRoot.querySelector('#scan-log-console');
			var statusText = viewRoot.querySelector('#scan-status-text');

			if (job && job.status === 'running') {
				if (monitorSection) monitorSection.style.display = 'block';
				if (formSection) formSection.style.display = 'none';
				if (statusText) statusText.innerText = _('Scan is running (Job ID: ') + job.id + _(', PID: ') + job.pid + ')';
				if (logConsole) logConsole.innerText = logTail || _('Initializing scan process...');
			} else {
				if (monitorSection && monitorSection.style.display === 'block') {
					window.location.reload();
				}
			}
		});
	},

	handleStart: function(ev) {
		var v = this.readFormValues();

		if ((v.speed || v.full) && v.tun_ping && !v.targets) {
			if (!confirm(_('Full subnet or speed scanning takes significant time (several minutes). Continue?'))) {
				return;
			}
		}

		ui.showModal(_('Launching Scanner'), [
			E('p', { 'class': 'spinning' }, _('Starting warpscout background scan process...'))
		]);

		return callStartScan(
			v.proto, v.tun_ping, v.speed, v.best_by, v.sample, v.full, v.timeout,
			v.ipv6, v.port, v.sweep_ports, v.nodes, v.countries, v.exclude_nodes,
			v.exclude_countries, v.targets, v.gen_i1, v.i1_sni, v.gen_junk,
			v.jc, v.jmin, v.jmax, v.i1,
			v.padding, v.rekey_after, v.rekey_timeout, v.reject_after,
			v.keepalive_timeout, v.max_handshakes, v.disable_cookies, v.random_trailers,
			v.masque_sni, v.masque_attempts
		).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Failed to start scan: ') + (res?.error || _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleSaveProfile: function(profileName) {
		var v = this.readFormValues();
		return callSaveScanProfile(
			profileName,
			v.proto, v.tun_ping, v.speed, v.best_by, v.sample, v.full, v.timeout,
			v.ipv6, v.port, v.sweep_ports, v.nodes, v.countries, v.exclude_nodes,
			v.exclude_countries, v.targets, v.gen_i1, v.i1_sni, v.gen_junk,
			v.jc, v.jmin, v.jmax, v.i1,
			v.padding, v.rekey_after, v.rekey_timeout, v.reject_after,
			v.keepalive_timeout, v.max_handshakes, v.disable_cookies, v.random_trailers,
			v.masque_sni, v.masque_attempts
		).then(function(res) {
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Scan profile saved: ') + res.name), 'info');
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Failed to save profile: ') + (res?.error || _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleSaveAsProfile: function() {
		var self = this;
		var nameInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'placeholder': 'e.g. fast_awg or masque_sni'
		});

		ui.showModal(_('Save Scan Profile As'), [
			E('p', {}, _('Enter a profile name (1-32 alphanumeric, dash or underscore characters). Saved profiles can be reused in the Schedule tab.')),
			E('div', { 'style': 'margin: 10px 0;' }, [ nameInput ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-apply',
					'click': function() {
						var newName = nameInput.value.trim();
						if (!newName.match(/^[a-zA-Z0-9_-]{1,32}$/)) {
							ui.addNotification(null, E('p', _('Invalid profile name.')), 'error');
							return;
						}
						ui.hideModal();
						self.handleSaveProfile(newName);
					}
				}, _('Save Profile'))
			])
		]);
	},

	handleDeleteProfile: function(profileName) {
		if (!profileName || profileName === 'default') return;
		ui.showModal(_('Delete Scan Profile'), [
			E('p', {}, _('Are you sure you want to delete scan profile ') + '"' + profileName + '"?'),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-negative',
					'click': function() {
						ui.hideModal();
						callDeleteScanProfile(profileName).then(function(res) {
							if (res && res.success) {
								ui.addNotification(null, E('p', _('Profile deleted: ') + profileName), 'info');
								window.location.reload();
							} else {
								ui.addNotification(null, E('p', _('Failed to delete profile: ') + (res?.error || _('Unknown error'))), 'error');
							}
						});
					}
				}, _('Delete'))
			])
		]);
	},

	handleCancel: function(ev) {
		if (!confirm(_('Are you sure you want to cancel the active scan?'))) {
			return;
		}

		return callCancelScan().then(function(res) {
			ui.addNotification(null, E('p', _('Cancellation signal sent.')), 'info');
			setTimeout(function() { window.location.reload(); }, 1500);
		});
	},

	render: function(results) {
		var self = this;
		var status = results[0] || {};
		var profData = results[1] || {};
		var profiles = profData.profiles || [];
		var defaultProf = profiles.find(function(p) { return p.name === 'default'; }) || profiles[0] || {
			name: 'default', proto: 'awg', tun_ping: true, speed: false, best_by: 'ping',
			sample: 5, full: false, timeout: 2, ipv6: false, exclude_nodes: 'DME'
		};

		var job = status?.job;
		var isRunning = (job && job.status === 'running');
		var lastScan = status?.last_scan;

		var profileChoices = {};
		profiles.forEach(function(p) {
			profileChoices[p.name] = p.name;
		});
		if (!profiles.length) {
			profileChoices['default'] = 'default';
		}
		var profileSelect = new ui.Dropdown(defaultProf.name || 'default', profileChoices, {
			id: 'field-profile-select',
			sort: false,
			optional: false
		}).render();
		profileSelect.style.minWidth = '180px';

		var deleteProfBtn = E('button', {
			'type': 'button',
			'id': 'btn-delete-profile',
			'class': 'btn cbi-button cbi-button-negative',
			'disabled': (defaultProf.name === 'default') ? 'disabled' : null,
			'click': function() { self.handleDeleteProfile(profileSelect.value); }
		}, _('Delete'));

		profileSelect.addEventListener('cbi-dropdown-change', function() {
			var selected = profiles.find(function(p) { return p.name === profileSelect.value; });
			if (selected) self.applyProfileToForm(selected);
			deleteProfBtn.disabled = (profileSelect.value === 'default');
		});

		var protoSelect = new ui.Dropdown(defaultProf.proto || 'awg', {
			'awg': 'AmneziaWG (awg) - Recommended',
			'awg31': 'AmneziaWG 3.1 (awg31)',
			'wg': 'WireGuard (wg)',
			'masque': 'MASQUE HTTP/3 (masque)',
			'masque-h2': 'MASQUE HTTP/2 (masque-h2)'
		}, {
			id: 'field-proto',
			sort: false,
			optional: false
		}).render();
		protoSelect.addEventListener('cbi-dropdown-change', function() { self.updateDependentVisibility(); });

		var speedCheckbox = E('input', {
			'type': 'checkbox',
			'id': 'field-speed',
			'checked': defaultProf.speed ? 'checked' : null
		});
		speedCheckbox.addEventListener('change', function() { self.updateDependentVisibility(); });

		var fullCheckbox = E('input', {
			'type': 'checkbox',
			'id': 'field-full',
			'checked': defaultProf.full ? 'checked' : null
		});
		fullCheckbox.addEventListener('change', function() { self.updateDependentVisibility(); });

		var isAwgInit = (defaultProf.proto === 'awg' || defaultProf.proto === 'awg31');
		var isAwg31Init = (defaultProf.proto === 'awg31');
		var isMasqueInit = (defaultProf.proto === 'masque' || defaultProf.proto === 'masque-h2');

		var viewRoot = E('div', { 'class': 'cbi-map' }, [
			E('h2', _('WarpScout - Scanner Runner')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Run asynchronous discovery scans across Cloudflare WARP IP ranges and evaluate endpoint latency, packet loss, and throughput.')
			),

			// Active Monitor Section
			E('div', {
				'id': 'scan-monitor-section',
				'class': 'cbi-section',
				'style': isRunning ? 'display: block' : 'display: none'
			}, [
				E('div', { 'class': 'alert-message warning' }, [
					E('h4', { 'class': 'spinning' }, _('Scan in progress')),
					E('p', { 'id': 'scan-status-text' }, isRunning ? (_('Job ID: ') + job.id + _(' (PID: ') + job.pid + ')') : '')
				]),
				E('div', { 'style': 'margin: 15px 0' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': ui.createHandlerFn(this, 'handleCancel')
					}, _('Cancel Scan'))
				]),
				E('h4', _('Live Scanner Output:')),
				E('pre', {
					'id': 'scan-log-console',
					'style': 'background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-family: monospace; max-height: 350px; overflow-y: auto;'
				}, status?.tail || _('Waiting for runner output...'))
			]),

			// Form Section
			E('div', {
				'id': 'scan-form-section',
				'class': 'cbi-section',
				'style': isRunning ? 'display: none' : 'display: block'
			}, [
				// Notification if last job finished
				job && job.status === 'ok' ? E('div', { 'class': 'alert-message success' }, [
					E('strong', _('Last scan completed successfully! ')),
					lastScan?.best ? E('span', _('Found best endpoint: ') + lastScan.best + ' (' + lastScan.best_node + ' / ' + lastScan.best_seen_as + ')') : '',
					' ',
					E('a', { 'href': L.url('admin/services/warpscout/results'), 'class': 'btn cbi-button cbi-button-action' }, _('View Results Table'))
				]) : '',

				job && job.status === 'failed' ? E('div', { 'class': 'alert-message danger' }, [
					E('strong', _('Last scan failed (exit code ') + job.exit + '): '),
					E('p', job.tail || _('No error details captured in stderr.'))
				]) : '',

				// Profile Toolbar
				E('h3', _('Scan Profiles & Launch Parameters')),
				E('div', { 'class': 'cbi-section-node', 'style': 'margin-bottom: 15px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;' }, [
					E('strong', _('Profile:')),
					profileSelect,
					E('button', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-apply',
						'click': function() { self.handleSaveProfile(profileSelect.value); }
					}, _('Save Profile')),
					E('button', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-action',
						'click': function() { self.handleSaveAsProfile(); }
					}, _('Save As...')),
					deleteProfBtn
				]),

				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'style': 'width: 35%' }, _('Protocol (-p)')),
						E('td', { 'class': 'td left' }, protoSelect)
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('In-Tunnel Ping & Loss (-P)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'checkbox', 'id': 'field-tun-ping', 'checked': (defaultProf.tun_ping !== false) ? 'checked' : null }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Measure Download Speed (--speed)')),
						E('td', { 'class': 'td left' }, speedCheckbox)
					]),
					E('tr', { 'class': 'tr', 'id': 'row-best-by', 'style': defaultProf.speed ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('Best Endpoint Criterion (--best-by)')),
						E('td', { 'class': 'td left' }, new ui.Dropdown(defaultProf.best_by || 'ping', {
							'ping': _('Lowest Ping (ping)'),
							'speed': _('Highest Speed (speed)')
						}, {
							id: 'field-best-by',
							sort: false,
							optional: false
						}).render())
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Full Subnet Scan (-f / --full)')),
						E('td', { 'class': 'td left' }, [
							fullCheckbox, ' ',
							E('small', { 'style': 'opacity: 0.8;' }, _('Probe all IPs in WARP ranges instead of sampling'))
						])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Samples per subnet (-n)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'number', 'id': 'field-sample', 'class': 'cbi-input-text', 'value': String(defaultProf.sample || 5), 'disabled': defaultProf.full ? 'disabled' : null }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Probe Timeout seconds (-t)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'number', 'id': 'field-timeout', 'class': 'cbi-input-text', 'value': String(defaultProf.timeout || 2) }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Scan IPv6 Endpoints (-6 / --ipv6)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'checkbox', 'id': 'field-ipv6', 'checked': defaultProf.ipv6 ? 'checked' : null }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Custom Port / Port Sweep (--port / --sweep-ports)')),
						E('td', { 'class': 'td left' }, [
							E('input', { 'type': 'number', 'id': 'field-port', 'style': 'width: 110px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.port ? String(defaultProf.port) : '', 'placeholder': 'auto' }), ' ',
							new ui.Dropdown(defaultProf.sweep_ports || '', {
								'': _('Sweep: Default'),
								'open': _('Sweep: Open ports'),
								'all': _('Sweep: All ports')
							}, {
								id: 'field-sweep-ports',
								sort: false,
								optional: false
							}).render()
						])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Target Specific Nodes (--node)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-nodes', 'class': 'cbi-input-text', 'value': defaultProf.nodes || '', 'placeholder': 'e.g. FRA AMS HEL' }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Exclude Edge Nodes (--exclude-node)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-exclude-nodes', 'class': 'cbi-input-text', 'value': defaultProf.exclude_nodes || '', 'placeholder': 'e.g. DME SVO' }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Target Countries (--country)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-countries', 'class': 'cbi-input-text', 'value': defaultProf.countries || '', 'placeholder': 'e.g. DE NL FI' }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Exclude Countries (--exclude-country)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-exclude-countries', 'class': 'cbi-input-text', 'value': defaultProf.exclude_countries || '', 'placeholder': 'e.g. RU BY' }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Direct Target IPs (--target)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-targets', 'class': 'cbi-input-text', 'value': defaultProf.targets || '', 'placeholder': 'e.g. 188.114.98.58' }))
					]),

					// AWG-only rows
					E('tr', { 'class': 'tr awg-only-row', 'style': isAwgInit ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG Randomize Junk (--gen-junk)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'checkbox', 'id': 'field-gen-junk', 'checked': defaultProf.gen_junk ? 'checked' : null }))
					]),
					E('tr', { 'class': 'tr awg-only-row', 'style': isAwgInit ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG Generate I1 (--gen-i1 / --i1-sni)')),
						E('td', { 'class': 'td left' }, [
							new ui.Dropdown(defaultProf.gen_i1 || '', {
								'': _('Built-in iCloud probe'),
								'quic': 'quic',
								'dns': 'dns',
								'sip': 'sip',
								'stun': 'stun',
								'random': 'random'
							}, {
								id: 'field-gen-i1',
								sort: false,
								optional: false
							}).render(), ' ',
							E('input', { 'type': 'text', 'id': 'field-i1-sni', 'style': 'width: 200px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.i1_sni || '', 'placeholder': 'I1 SNI host (optional)' })
						])
					]),
					E('tr', { 'class': 'tr awg-only-row', 'style': isAwgInit ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG Obfuscation: Jc / Jmin / Jmax')),
						E('td', { 'class': 'td left' }, [
							E('input', { 'type': 'number', 'id': 'field-jc', 'style': 'width: 80px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.jc ? String(defaultProf.jc) : '', 'placeholder': '6' }), ' ',
							E('input', { 'type': 'number', 'id': 'field-jmin', 'style': 'width: 80px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.jmin ? String(defaultProf.jmin) : '', 'placeholder': '10' }), ' ',
							E('input', { 'type': 'number', 'id': 'field-jmax', 'style': 'width: 80px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.jmax ? String(defaultProf.jmax) : '', 'placeholder': '50' })
						])
					]),
					E('tr', { 'class': 'tr awg-only-row', 'style': isAwgInit ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG Custom I1 Packet (--i1)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-i1', 'class': 'cbi-input-text', 'value': defaultProf.i1 || '', 'placeholder': 'CPS packet or "none"' }))
					]),

					// AWG 3.1-only rows
					E('tr', { 'class': 'tr awg31-only-row', 'style': isAwg31Init ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG 3.1 Data Padding (-padding)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-padding', 'class': 'cbi-input-text', 'value': defaultProf.padding || '', 'placeholder': 'N or MIN-MAX (e.g. 16-64)' }))
					]),
					E('tr', { 'class': 'tr awg31-only-row', 'style': isAwg31Init ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG 3.1 Timing: Rekey After / Timeout / Reject')),
						E('td', { 'class': 'td left' }, [
							E('input', { 'type': 'text', 'id': 'field-rekey-after', 'style': 'width: 110px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.rekey_after || '', 'placeholder': 'rekey-after' }), ' ',
							E('input', { 'type': 'text', 'id': 'field-rekey-timeout', 'style': 'width: 110px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.rekey_timeout || '', 'placeholder': 'rekey-timeout' }), ' ',
							E('input', { 'type': 'text', 'id': 'field-reject-after', 'style': 'width: 110px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.reject_after || '', 'placeholder': 'reject-after' })
						])
					]),
					E('tr', { 'class': 'tr awg31-only-row', 'style': isAwg31Init ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG 3.1 Keepalive Timeout / Max Handshakes')),
						E('td', { 'class': 'td left' }, [
							E('input', { 'type': 'text', 'id': 'field-keepalive-timeout', 'style': 'width: 140px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.keepalive_timeout || '', 'placeholder': 'keepalive-timeout' }), ' ',
							E('input', { 'type': 'text', 'id': 'field-max-handshakes', 'style': 'width: 140px; display: inline-block;', 'class': 'cbi-input-text', 'value': defaultProf.max_handshakes || '', 'placeholder': 'max-handshakes' })
						])
					]),
					E('tr', { 'class': 'tr awg31-only-row', 'style': isAwg31Init ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('AWG 3.1 Flags (-disable-cookies / -random-trailers)')),
						E('td', { 'class': 'td left' }, [
							E('label', { 'style': 'margin-right: 16px;' }, [
								E('input', { 'type': 'checkbox', 'id': 'field-disable-cookies', 'checked': defaultProf.disable_cookies ? 'checked' : null }), ' ',
								_('Disable Cookies')
							]),
							E('label', {}, [
								E('input', { 'type': 'checkbox', 'id': 'field-random-trailers', 'checked': defaultProf.random_trailers ? 'checked' : null }), ' ',
								_('Random Trailers')
							])
						])
					]),

					// MASQUE-only rows
					E('tr', { 'class': 'tr masque-only-row', 'style': isMasqueInit ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('MASQUE SNI Host (--masque-sni)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'text', 'id': 'field-masque-sni', 'class': 'cbi-input-text', 'value': defaultProf.masque_sni || '', 'placeholder': 'consumer-masque.cloudflareclient.com' }))
					]),
					E('tr', { 'class': 'tr masque-only-row', 'style': isMasqueInit ? '' : 'display: none;' }, [
						E('td', { 'class': 'td left' }, _('MASQUE Retry Attempts (--masque-attempts)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'number', 'id': 'field-masque-attempts', 'class': 'cbi-input-text', 'value': defaultProf.masque_attempts ? String(defaultProf.masque_attempts) : '', 'placeholder': '3' }))
					])
				]),
				E('div', { 'class': 'cbi-section-node', 'style': 'margin-top: 15px' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, 'handleStart')
					}, _('Start Scan'))
				])
			])
		]);

		poll.add(L.bind(this.pollStatus, this, viewRoot), 2);

		return viewRoot;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
