// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callGetStatus = rpc.declare({
	object: 'luci.warpscout',
	method: 'getStatus',
	params: [ 'force' ],
	expect: { }
});

var callGetCapabilities = rpc.declare({
	object: 'luci.warpscout',
	method: 'getCapabilities',
	params: [ 'force' ],
	expect: { }
});

var callRegisterAccount = rpc.declare({
	object: 'luci.warpscout',
	method: 'registerAccount',
	params: [ 'fresh' ],
	expect: { }
});

function renderVersionBadge(info, installed) {
	if (!installed) {
		return E('span', { 'class': 'label warning' }, _('Not found'));
	}
	if (info && info.outdated) {
		return E('span', { 'class': 'label warning' }, _('Outdated') + (info.latest_version ? ' (v' + info.latest_version + ')' : ''));
	}
	if (info && info.up_to_date) {
		return E('span', { 'class': 'label success' }, _('Latest'));
	}
	return E('span', { 'class': 'label success' }, _('Installed'));
}

return view.extend({
	load: function() {
		return Promise.all([
			callGetStatus(false),
			callGetCapabilities(false)
		]);
	},

	handleRegister: function(ev, fresh) {
		var actionTitle = fresh ? _('Recreating Account') : _('Registering Account');
		ui.showModal(actionTitle, [
			E('p', { 'class': 'spinning' }, _('Contacting Cloudflare API to register WARP account...'))
		]);

		return callRegisterAccount(fresh).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Account successfully registered: ') + (res.output || '')), 'info');
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Registration failed: ') + (res?.error || _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleRefreshVersions: function(ev) {
		ui.showModal(_('Checking Versions'), [
			E('p', { 'class': 'spinning' }, _('Checking latest releases on GitHub...'))
		]);

		return callGetStatus(true).then(function() {
			ui.hideModal();
			window.location.reload();
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Error: ') + err.message), 'error');
		});
	},

	handleRefreshCapabilities: function(ev) {
		ui.showModal(_('Refreshing Capabilities'), [
			E('p', { 'class': 'spinning' }, _('Checking system kernel, packages and protocol handlers...'))
		]);

		return callGetCapabilities(true).then(function() {
			ui.hideModal();
			window.location.reload();
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Error: ') + err.message), 'error');
		});
	},

	render: function(results) {
		var data = results[0] || {};
		var caps = results[1] || {};
		var binary = data.binary || {};
		var app = data.app || {};
		var account = data.account || {};
		var state = data.state || {};
		var wg = caps.wg || {};
		var awg = caps.awg || {};

		var binBadge = renderVersionBadge(binary, binary.installed);
		var appBadge = renderVersionBadge(app, true);

		var accBadge = account.exists ?
			E('span', { 'class': 'label success' }, _('Configured')) :
			E('span', { 'class': 'label danger' }, _('Missing'));

		var wgBadge = wg.ready ?
			E('span', { 'class': 'label success' }, _('Installed')) :
			E('span', { 'class': 'label warning' }, _('Not installed'));

		var awgBadge = awg.ready ?
			E('span', { 'class': 'label success' }, _('Installed')) :
			E('span', { 'class': 'label warning' }, _('Not installed'));

		var viewRoot = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('WarpScout - Cloudflare WARP Scanner & Manager')),
			E('div', { 'class': 'cbi-map-descr' },
				_('OpenWrt LuCI management wrapper for warpscout CLI utility. Supports WireGuard, AmneziaWG, and MASQUE protocols.')
			),

			// Section 1: Version status
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Version Status')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'style': 'width: 30%' }, 'luci-app-warpscout'),
						E('td', { 'class': 'td left' }, [ appBadge, ' ', app.version ? E('span', {}, ' (v' + app.version + ')') : '' ])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('warpscout Binary')),
						E('td', { 'class': 'td left' }, [ binBadge, ' ', binary.version ? E('span', {}, ' (v' + binary.version + ')') : '' ])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Binary Path')),
						E('td', { 'class': 'td left' }, E('code', {}, binary.path || '/usr/bin/warpscout'))
					])
				]),
				E('div', { 'class': 'cbi-section-node', 'style': 'margin-top: 10px' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, 'handleRefreshVersions')
					}, _('Check for Updates'))
				])
			]),

			// Section 2: Protocol Packages (concise WG / AWG status + Refresh Capabilities)
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Protocol Packages')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'style': 'width: 30%' }, 'WireGuard (wg)'),
						E('td', { 'class': 'td left' }, wgBadge)
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, 'AmneziaWG (awg)'),
						E('td', { 'class': 'td left' }, awgBadge)
					])
				]),
				E('div', { 'class': 'cbi-section-node', 'style': 'margin-top: 10px' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, 'handleRefreshCapabilities')
					}, _('Refresh Capabilities'))
				])
			]),

			// Section 3: Account status
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Cloudflare WARP Account')),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'style': 'width: 30%' }, _('Account File')),
						E('td', { 'class': 'td left' }, E('code', {}, account.path || '/etc/warpscout/account.json'))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Status')),
						E('td', { 'class': 'td left' }, accBadge)
					]),
					account.exists ? E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Device ID')),
						E('td', { 'class': 'td left' }, E('code', {}, account.id || '-'))
					]) : '',
					account.exists ? E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Assigned IPv4 / IPv6')),
						E('td', { 'class': 'td left' }, [
							account.ipv4 ? E('span', { 'class': 'label' }, account.ipv4) : '',
							' ',
							account.ipv6 ? E('span', { 'class': 'label' }, account.ipv6) : ''
						])
					]) : '',
					account.exists ? E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Private Key Mask')),
						E('td', { 'class': 'td left' }, E('code', {}, account.key_mask || '****'))
					]) : ''
				]),
				E('div', { 'class': 'cbi-section-node' }, [
					!account.exists ? E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, 'handleRegister', false)
					}, _('Register Account')) : '',
					account.exists ? E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'style': 'margin-right: 10px',
						'click': ui.createHandlerFn(this, function() {
							if (confirm(_('Are you sure you want to recreate the WARP account? This will generate new keys and register a fresh device identity.'))) {
								return this.handleRegister(null, true);
							}
						})
					}, _('Recreate Account (--fresh)')) : ''
				])
			]),

			// Section 4: Summary of Last Scan & Services
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Quick Status')),
				E('div', { 'class': 'cbi-section-descr' }, [
					E('p', {}, [
						_('Scan: '),
						state.last_scan ? E('span', { 'class': 'label success' }, _('Best: ') + state.last_scan.best + ' (' + state.last_scan.best_node + ')') : E('span', { 'class': 'label' }, _('No scan performed yet'))
					]),
					E('p', {}, [
						_('SOCKS Proxy: '),
						state.socks && state.socks.running ? E('span', { 'class': 'label success' }, _('Running on port ') + state.socks.port) : E('span', { 'class': 'label' }, _('Disabled'))
					])
				])
			])
		]);

		return viewRoot;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
