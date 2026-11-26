// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callGetSchedule = rpc.declare({
	object: 'luci.warpscout',
	method: 'getSchedule',
	expect: { }
});

var callSetSchedule = rpc.declare({
	object: 'luci.warpscout',
	method: 'setSchedule',
	params: [ 'job', 'enabled', 'profile', 'cron', 'action', 'jitter' ],
	expect: { }
});

var callRunScheduledJob = rpc.declare({
	object: 'luci.warpscout',
	method: 'runScheduledJob',
	params: [ 'job' ],
	expect: { }
});

function formatTimestamp(ts) {
	if (!ts) return '-';
	var d = new Date(ts * 1000);
	return d.toLocaleString();
}

return view.extend({
	load: function() {
		return callGetSchedule();
	},

	handleSaveSchedule: function(ev) {
		var enabled = document.getElementById('sched-enabled').checked;
		var cronExpr = document.getElementById('sched-cron').value.trim();
		var action = document.getElementById('sched-action').value;
		var profile = document.getElementById('sched-profile').value;
		var jitter = parseInt(document.getElementById('sched-jitter').value, 10);
		if (isNaN(jitter) || jitter < 0) jitter = 0;

		if (!cronExpr) {
			ui.addNotification(null, E('p', _('Cron expression cannot be empty.')), 'error');
			return;
		}

		ui.showModal(_('Saving Schedule'), [
			E('p', { 'class': 'spinning' }, _('Updating UCI configuration and synchronizing system crontab...'))
		]);

		return callSetSchedule('nightly', enabled, profile, cronExpr, action, jitter).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Schedule saved and crontab synchronized successfully.')), 'info');
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Failed to save schedule.')), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleTestRun: function(ev) {
		var enabled = document.getElementById('sched-enabled').checked;
		var cronExpr = document.getElementById('sched-cron').value.trim();
		var action = document.getElementById('sched-action').value;
		var profile = document.getElementById('sched-profile').value;
		var jitter = parseInt(document.getElementById('sched-jitter').value, 10);
		if (isNaN(jitter) || jitter < 0) jitter = 0;

		ui.showModal(_('Triggering Test Run'), [
			E('p', { 'class': 'spinning' }, _('Saving job parameters and launching scan runner...'))
		]);

		// Save first so action and profile match, then launch with --no-jitter
		return callSetSchedule('nightly', enabled, profile, cronExpr, action, jitter).then(function() {
			return callRunScheduledJob('nightly');
		}).then(function(scanRes) {
			ui.hideModal();
			if (scanRes && scanRes.success) {
				ui.addNotification(null, E('p', _('Scheduled job launched in background. Check the Scan or Results tab for real-time progress.')), 'info');
			} else {
				ui.addNotification(null, E('p', _('Failed to start test job: ') + (scanRes?.error || _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	render: function(data) {
		var self = this;
		var sched = data || {};
		var jobs = sched.jobs || [];
		var job = jobs[0] || {
			enabled: false,
			profile: 'default',
			cron: '0 4 * * *',
			action: 'update_tunnels',
			jitter: 300
		};
		var profiles = sched.profiles || [ 'default' ];
		var crontabBlock = sched.crontab_block || '';
		var lastJob = sched.last_job || null;

		var m = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('WarpScout Scheduler')),
			E('div', { 'class': 'cbi-map-descr' }, _('Configure automatic periodic endpoint scanning and seamless rotation of managed WireGuard / AmneziaWG tunnels.'))
		]);

		// 1. Status overview section
		var cronStatusBadge;
		if (sched.cron_running) {
			cronStatusBadge = E('span', { 'class': 'label success' }, _('Running'));
		} else if (sched.cron_installed) {
			cronStatusBadge = E('span', { 'class': 'label warning' }, _('Enabled / Idle'));
		} else {
			cronStatusBadge = E('span', { 'class': 'label danger' }, _('Not installed'));
		}

		var jobStatusBadge;
		if (job.enabled) {
			jobStatusBadge = E('span', { 'class': 'label success' }, _('Active'));
		} else {
			jobStatusBadge = E('span', { 'class': 'label' }, _('Disabled'));
		}

		var statusSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Scheduler Status')),
			E('table', { 'class': 'table', 'style': 'width:100%;max-width:800px;margin-bottom:1rem;' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'width:35%;font-weight:bold;' }, _('Crond Daemon:')),
					E('td', { 'class': 'td' }, [ cronStatusBadge, ' ', E('small', { 'style': 'color:#666;' }, _('(/etc/init.d/cron)')) ])
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('Scheduled Task:')),
					E('td', { 'class': 'td' }, [ jobStatusBadge, ' ', E('small', { 'style': 'color:#666;' }, job.name || 'nightly') ])
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td', 'style': 'font-weight:bold;' }, _('Last Execution:')),
					E('td', { 'class': 'td' }, [
						lastJob ? (
							formatTimestamp(lastJob.started) + ' (' +
							(lastJob.status === 'ok' ? _('Success') : (lastJob.status === 'running' ? _('Running...') : _('Failed') + ' [' + lastJob.exit + ']')) +
							')'
						) : _('No previous job record')
					])
				])
			])
		]);
		m.appendChild(statusSection);

		// 2. Settings form section
		var formSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Schedule Configuration'))
		]);

		var formTable = E('div', { 'class': 'cbi-section-node' });

		// Enabled row
		var enabledRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'sched-enabled' }, _('Enable Scheduled Scan')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('input', {
					'type': 'checkbox',
					'id': 'sched-enabled',
					'class': 'cbi-input-checkbox',
					'checked': job.enabled ? 'checked' : null
				}),
				E('div', { 'class': 'cbi-value-description' }, _('Activate background periodic scan via OpenWrt system crontab.'))
			])
		]);
		formTable.appendChild(enabledRow);

		// Interval Preset row
		var presetChoices = {
			'0 4 * * *': _('Every night at 04:00 (Recommended)'),
			'0 */12 * * *': _('Every 12 hours'),
			'0 */6 * * *': _('Every 6 hours'),
			'0 */2 * * *': _('Every 2 hours'),
			'* * * * *': _('Every minute (Testing only)'),
			'custom': _('Custom cron expression...')
		};
		var initialPreset = presetChoices[job.cron] ? job.cron : 'custom';
		var presetSelect = new ui.Dropdown(initialPreset, presetChoices, {
			id: 'sched-preset',
			sort: false,
			optional: false
		}).render();

		var presetRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'sched-preset' }, _('Frequency Preset')),
			E('div', { 'class': 'cbi-value-field' }, [
				presetSelect,
				E('div', { 'class': 'cbi-value-description' }, _('Select a predefined schedule interval or choose custom.'))
			])
		]);
		formTable.appendChild(presetRow);

		// Cron expression input row
		var cronInput = E('input', {
			'type': 'text',
			'id': 'sched-cron',
			'class': 'cbi-input-text',
			'value': job.cron || '0 4 * * *',
			'placeholder': '0 4 * * *'
		});

		presetSelect.addEventListener('cbi-dropdown-change', function() {
			if (presetSelect.value && presetSelect.value !== 'custom') {
				cronInput.value = presetSelect.value;
			}
		});

		cronInput.addEventListener('input', function() {
			var cur = this.value.trim();
			dom.callClassMethod(presetSelect, 'setValue', presetChoices[cur] ? cur : 'custom');
		});

		var cronRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'sched-cron' }, _('Cron Expression')),
			E('div', { 'class': 'cbi-value-field' }, [
				cronInput,
				E('div', { 'class': 'cbi-value-description' }, _('Standard 5-field cron format: minute (0-59), hour (0-23), day of month (1-31), month (1-12), day of week (0-7).'))
			])
		]);
		formTable.appendChild(cronRow);

		// Action row
		var actionChoices = {
			'update_tunnels': _('Scan & Auto-Update Managed Tunnels (Recommended)'),
			'scan_only': _('Scan Only (Save results and configuration without rotating tunnels)')
		};
		var actionSelect = new ui.Dropdown(job.action || 'update_tunnels', actionChoices, {
			id: 'sched-action',
			sort: false,
			optional: false
		}).render();

		var actionRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'sched-action' }, _('Scheduled Action')),
			E('div', { 'class': 'cbi-value-field' }, [
				actionSelect,
				E('div', { 'class': 'cbi-value-description' }, _('Auto-Update automatically reconfigures and re-handshakes all managed WireGuard and AmneziaWG interfaces to the best discovered endpoint.'))
			])
		]);
		formTable.appendChild(actionRow);

		// Scan Profile row
		var profileChoices = {};
		profiles.forEach(function(pName) {
			profileChoices[pName] = pName;
		});
		var profileSelect = new ui.Dropdown(job.profile || profiles[0] || 'default', profileChoices, {
			id: 'sched-profile',
			sort: false,
			optional: false
		}).render();

		var profileRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'sched-profile' }, _('Scan Profile')),
			E('div', { 'class': 'cbi-value-field' }, [
				profileSelect,
				' ',
				E('a', {
					'href': L.url('admin/services/warpscout/scan'),
					'class': 'btn cbi-button cbi-button-neutral'
				}, _('Manage Profiles on Scan Tab')),
				E('div', { 'class': 'cbi-value-description' }, _('Profile defining scan protocol (AWG/WG), sample size, in-tunnel ping, and node exclusions. Create or edit profiles on the Scan tab.'))
			])
		]);
		formTable.appendChild(profileRow);

		// Jitter row
		var jitterRow = E('div', { 'class': 'cbi-value' }, [
			E('label', { 'class': 'cbi-value-title', 'for': 'sched-jitter' }, _('Maximum Jitter Delay (seconds)')),
			E('div', { 'class': 'cbi-value-field' }, [
				E('input', {
					'type': 'number',
					'id': 'sched-jitter',
					'class': 'cbi-input-text',
					'value': (job.jitter !== undefined && job.jitter !== null) ? job.jitter : 300,
					'min': '0',
					'max': '3600'
				}),
				E('div', { 'class': 'cbi-value-description' }, _('Introduces a random sleep (0 to N seconds) before scanning to avoid synchronized load spikes and network congestion.'))
			])
		]);
		formTable.appendChild(jitterRow);

		// Buttons row
		var btnRow = E('div', { 'class': 'cbi-page-actions' }, [
			E('button', {
				'class': 'cbi-button cbi-button-apply',
				'click': ui.createHandlerFn(self, 'handleSaveSchedule')
			}, _('Save & Apply Schedule')),
			' ',
			E('button', {
				'class': 'cbi-button cbi-button-action',
				'click': ui.createHandlerFn(self, 'handleTestRun')
			}, _('Run Scheduled Job Now (Test)'))
		]);

		formSection.appendChild(formTable);
		formSection.appendChild(btnRow);
		m.appendChild(formSection);

		// 3. Crontab inspected content section
		var crontabSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('System Crontab Status (/etc/crontabs/root)')),
			E('div', { 'class': 'cbi-section-descr' }, _('WarpScout manages its own isolated block inside root crontab. Any custom user cron jobs are preserved untouched.')),
			E('pre', {
				'style': 'background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:4px;overflow-x:auto;font-family:monospace;font-size:12px;'
			}, crontabBlock && crontabBlock.length ? crontabBlock : _('# No active WarpScout crontab block found.'))
		]);
		m.appendChild(crontabSection);

		return m;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
