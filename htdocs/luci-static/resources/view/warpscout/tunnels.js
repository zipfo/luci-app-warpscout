// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callGetTunnels = rpc.declare({
	object: 'luci.warpscout',
	method: 'getTunnels',
	expect: { }
});

var callGetCapabilities = rpc.declare({
	object: 'luci.warpscout',
	method: 'getCapabilities',
	expect: { }
});

var callApplyTunnel = rpc.declare({
	object: 'luci.warpscout',
	method: 'applyTunnel',
	params: [ 'iface', 'proto', 'zone', 'route_allowed_ips', 'mtu', 'dns', 'verify', 'conf_content', 'managed', 'target_node' ],
	expect: { }
});

var callUpdateEndpoint = rpc.declare({
	object: 'luci.warpscout',
	method: 'updateEndpoint',
	params: [ 'iface', 'endpoint' ],
	expect: { }
});

var callSetTunnelConfig = rpc.declare({
	object: 'luci.warpscout',
	method: 'setTunnelConfig',
	params: [ 'iface', 'managed', 'target_node' ],
	expect: { }
});

var callDeleteTunnel = rpc.declare({
	object: 'luci.warpscout',
	method: 'deleteTunnel',
	params: [ 'iface' ],
	expect: { }
});

var callGetResults = rpc.declare({
	object: 'luci.warpscout',
	method: 'getResults',
	expect: { }
});

function formatBytes(bytes) {
	if (!bytes || bytes === 0) return '0 B';
	var k = 1024;
	var sizes = ['B', 'KB', 'MB', 'GB'];
	var i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getQueryParam(name) {
	var search = window.location.search || '';
	var params = new URLSearchParams(search);
	return params.get(name) || '';
}

function buildDefaultIfaceName(tunnels, results, queryNode) {
	var rawNode = '';
	var rawCountry = '';
	var bestPerNode = results?.best_per_node || [];
	var items = results?.items || [];

	if (queryNode) {
		var matched = bestPerNode.find(function(b) {
			return b.node && b.node.toUpperCase() === queryNode;
		}) || items.find(function(it) {
			return it.node && it.node.toUpperCase() === queryNode;
		});
		rawNode = (matched && matched.node) || queryNode;
		rawCountry = (matched && matched.seen_as) || '';
	} else {
		rawNode = results?.best_node || bestPerNode[0]?.node || items[0]?.node || '';
		rawCountry = results?.best_seen_as || bestPerNode[0]?.seen_as || items[0]?.seen_as || '';
	}

	var countryPart = (rawCountry || 'xx').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 2) || 'xx';
	var maxNodeLen = Math.max(2, 13 - 7 - countryPart.length);
	var nodePart = (rawNode || 'auto').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, maxNodeLen) || 'auto';
	var prefix = 'warp_' + nodePart + '_' + countryPart + '_';

	var existing = {};
	for (var i = 0; i < (tunnels || []).length; i++) {
		if (tunnels[i]?.iface) existing[tunnels[i].iface] = true;
	}

	var idx = 1;
	while (existing[prefix + idx]) {
		idx++;
	}
	var candidate = prefix + idx;
	if (candidate.length > 15) {
		var trimmedNode = nodePart.slice(0, Math.max(1, nodePart.length - (candidate.length - 15)));
		candidate = 'warp_' + trimmedNode + '_' + countryPart + '_' + idx;
	}
	return candidate.slice(0, 15);
}

return view.extend({
	load: function() {
		return Promise.all([
			callGetTunnels(),
			callGetCapabilities(),
			callGetResults()
		]);
	},

	handleCreateTunnel: function(ev) {
		var proto = document.getElementById('new-proto').value;
		var iface = document.getElementById('new-iface').value.trim();
		var zone = document.getElementById('new-zone').value;
		var routeAllowed = document.getElementById('new-route-allowed').checked;
		var managed = document.getElementById('new-managed').checked;
		var targetNode = document.getElementById('new-target-node').value.trim().toUpperCase();
		var mtu = parseInt(document.getElementById('new-mtu').value, 10) || 1280;

		if (!iface || !iface.match(/^[a-zA-Z0-9_-]{1,15}$/)) {
			ui.addNotification(null, E('p', _('Interface name must be 1 to 15 alphanumeric characters.')), 'error');
			return;
		}

		ui.showModal(_('Creating Tunnel Interface'), [
			E('p', { 'class': 'spinning' }, _('Configuring UCI network and firewall, bringing up interface and verifying handshake...'))
		]);

		return callApplyTunnel(iface, proto, zone, routeAllowed, mtu, '', true, '', managed, targetNode).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				var msg = _('Tunnel ') + res.iface + _(' created successfully!');
				if (res.handshake) {
					msg += ' ' + _('Handshake verified with endpoint: ') + res.endpoint;
					ui.addNotification(null, E('p', msg), 'info');
				} else {
					msg += ' ' + _('Notice: Interface created, but initial handshake was not received within 15 seconds.');
					ui.addNotification(null, E('p', msg), 'warning');
				}
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Failed to create tunnel: ') + (res?.error || _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	handleEditTunnel: function(tunnel, bestPerNode) {
		var managedCheckbox = E('input', {
			'type': 'checkbox',
			'id': 'edit-tunnel-managed',
			'checked': tunnel.managed ? 'checked' : null
		});

		var nodeChoices = { '': _('Auto (Global best endpoint)') };
		var seenNodes = {};
		(bestPerNode || []).forEach(function(b) {
			if (b.node && !seenNodes[b.node]) {
				seenNodes[b.node] = true;
				nodeChoices[b.node] = b.node + (b.seen_as ? ' (' + b.seen_as + ')' : '') + (b.node_location ? ' - ' + b.node_location : '');
			}
		});
		if (tunnel.target_node && !seenNodes[tunnel.target_node.toUpperCase()]) {
			nodeChoices[tunnel.target_node.toUpperCase()] = tunnel.target_node.toUpperCase();
		}

		var nodeSelect = new ui.Dropdown(tunnel.target_node ? tunnel.target_node.toUpperCase() : '', nodeChoices, {
			id: 'edit-tunnel-node-select',
			sort: false,
			optional: false
		}).render();
		var customNodeInput = E('input', {
			'type': 'text',
			'id': 'edit-tunnel-node-custom',
			'class': 'cbi-input-text',
			'style': 'margin-top: 6px;',
			'value': tunnel.target_node || '',
			'placeholder': _('Leave empty for Auto, or enter node code e.g. ARN, FRA, HEL')
		});

		nodeSelect.addEventListener('cbi-dropdown-change', function() {
			customNodeInput.value = nodeSelect.value || '';
		});

		ui.showModal(_('Edit Tunnel Settings: ') + tunnel.iface, [
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'for': 'edit-tunnel-managed' }, _('Managed by Scheduler')),
					E('div', { 'class': 'cbi-value-field' }, [
						managedCheckbox,
						E('div', { 'class': 'cbi-value-description' }, _('If disabled, scheduled scans will never modify this tunnel.'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title', 'for': 'edit-tunnel-node-select' }, _('Pinned Node')),
					E('div', { 'class': 'cbi-value-field' }, [
						nodeSelect,
						customNodeInput,
						E('div', { 'class': 'cbi-value-description' }, _('When pinned (e.g. ARN), the scheduler only rotates this tunnel to the best endpoint from that node.'))
					])
				])
			]),
			E('div', { 'class': 'right', 'style': 'margin-top: 15px;' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, _('Cancel')),
				' ',
				E('button', {
					'class': 'btn cbi-button-apply',
					'click': function() {
						var isManaged = managedCheckbox.checked;
						var targetNode = customNodeInput.value.trim().toUpperCase();
						ui.hideModal();
						callSetTunnelConfig(tunnel.iface, isManaged, targetNode).then(function(res) {
							if (res && res.success) {
								ui.addNotification(null, E('p', _('Tunnel settings updated for ') + tunnel.iface), 'info');
								window.location.reload();
							} else {
								ui.addNotification(null, E('p', _('Failed to update tunnel settings: ') + (res?.error || _('Unknown error'))), 'error');
							}
						}).catch(function(err) {
							ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
						});
					}
				}, _('Save'))
			])
		]);
	},

	handleDeleteTunnel: function(iface) {
		if (!confirm(_('Are you sure you want to delete tunnel interface ') + iface + '? ' + _('This will remove it from network and firewall configuration.'))) {
			return;
		}

		return callDeleteTunnel(iface).then(function(res) {
			if (res && res.success) {
				ui.addNotification(null, E('p', _('Tunnel ') + iface + _(' deleted.')), 'info');
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Failed to delete tunnel: ') + (res?.error || _('Unknown error'))), 'error');
			}
		});
	},

	handleUpdateEndpoint: function(iface, targetEndpoint) {
		if (!targetEndpoint) {
			ui.addNotification(null, E('p', _('No matching endpoint available from last scan. Run a scan first.')), 'warning');
			return;
		}

		ui.showModal(_('Updating Tunnel Endpoint'), [
			E('p', { 'class': 'spinning' }, _('Updating endpoint to ') + targetEndpoint + _(' and verifying handshake...'))
		]);

		return callUpdateEndpoint(iface, targetEndpoint).then(function(res) {
			ui.hideModal();
			if (res && res.success) {
				var msg = _('Endpoint updated to ') + targetEndpoint + '!';
				if (res.handshake) {
					msg += ' ' + _('Handshake established.');
					ui.addNotification(null, E('p', msg), 'info');
				} else {
					msg += ' ' + _('Notice: Handshake pending.');
					ui.addNotification(null, E('p', msg), 'warning');
				}
				window.location.reload();
			} else {
				ui.addNotification(null, E('p', _('Update failed: ') + (res?.error || _('Unknown error'))), 'error');
			}
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC error: ') + err.message), 'error');
		});
	},

	render: function(data) {
		var self = this;
		var tunnels = data[0]?.tunnels || [];
		var caps = data[1] || {};
		var results = data[2]?.last_scan;

		var bestEp = results?.best || '';
		var bestPerNode = results?.best_per_node || [];
		var queryNode = getQueryParam('node').toUpperCase();
		var defaultIface = buildDefaultIfaceName(tunnels, results, queryNode);

		var viewRoot = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('WarpScout - WireGuard & AmneziaWG Tunnels')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Manage permanent in-kernel network tunnel interfaces created from discovered Cloudflare WARP endpoints.')
			),

			// Section 1: Active Tunnels Table
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Configured Tunnels')),
				E('table', { 'class': 'table' }, [
					E('thead', [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th left' }, _('Interface')),
							E('th', { 'class': 'th left' }, _('Protocol')),
							E('th', { 'class': 'th left' }, _('Status')),
							E('th', { 'class': 'th left' }, _('Handshake')),
							E('th', { 'class': 'th left' }, _('Endpoint')),
							E('th', { 'class': 'th left' }, _('Node / Country')),
							E('th', { 'class': 'th left' }, _('Managed')),
							E('th', { 'class': 'th left' }, _('Transfer (Rx / Tx)')),
							E('th', { 'class': 'th left' }, _('Zone')),
							E('th', { 'class': 'th left' }, _('Actions'))
						])
					]),
					(function() {
						var tbody = E('tbody');
						if (!tunnels.length) {
							tbody.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td center', 'colspan': '10' }, _('No WireGuard or AmneziaWG interfaces configured yet.'))
							]));
							return tbody;
						}

						for (var i = 0; i < tunnels.length; i++) {
							var t = tunnels[i];
							var statusBadge = t.up ?
								E('span', { 'class': 'label success' }, _('UP')) :
								E('span', { 'class': 'label' }, _('DOWN'));

							var hsBadge = E('span', { 'class': 'label' }, _('Never'));
							if (t.latest_handshake > 0) {
								if (t.handshake_age < 30) {
									hsBadge = E('span', { 'class': 'label success' }, t.handshake_age + 's ' + _('ago'));
								} else if (t.handshake_age < 180) {
									hsBadge = E('span', { 'class': 'label warning' }, Math.floor(t.handshake_age / 60) + 'm ' + _('ago'));
								} else {
									hsBadge = E('span', { 'class': 'label danger' }, Math.floor(t.handshake_age / 60) + 'm ' + _('ago'));
								}
							}

							var capWarning = !t.capability_ready ?
								E('div', { 'class': 'alert-message danger', 'style': 'padding: 4px; margin-top: 4px;' }, _('Module missing')) : '';

							var nodeCellContent = [];
							if (t.node) {
								nodeCellContent.push(E('span', { 'class': 'label' }, t.node + (t.seen_as ? ' (' + t.seen_as + ')' : '')));
							} else {
								nodeCellContent.push(E('span', {}, '-'));
							}
							if (t.target_node) {
								nodeCellContent.push(' ');
								nodeCellContent.push(E('span', { 'class': 'label warning' }, _('Pin: ') + t.target_node));
							}

							var managedCheckbox = E('input', {
								'type': 'checkbox',
								'disabled': 'disabled',
								'checked': t.managed ? 'checked' : null,
								'title': t.managed ? _('Managed') : _('Unmanaged'),
								'style': 'cursor: default;'
							});

							// Resolve node-specific endpoint for Update button if pinned
							var updateTargetEp = bestEp;
							if (t.target_node) {
								var matchedNode = bestPerNode.find(function(b) {
									return b.node && b.node.toUpperCase() === t.target_node.toUpperCase();
								});
								updateTargetEp = matchedNode ? matchedNode.endpoint : '';
							}

							tbody.appendChild(E('tr', { 'class': 'tr' }, [
								E('td', { 'class': 'td left' }, [ E('strong', {}, [ E('code', {}, t.iface) ]), capWarning ]),
								E('td', { 'class': 'td left' }, E('span', { 'class': 'label' }, t.proto.toUpperCase())),
								E('td', { 'class': 'td left' }, statusBadge),
								E('td', { 'class': 'td left' }, hsBadge),
								E('td', { 'class': 'td left' }, E('code', {}, t.endpoint || '-')),
								E('td', { 'class': 'td left' }, nodeCellContent),
								E('td', { 'class': 'td center' }, managedCheckbox),
								E('td', { 'class': 'td left' }, formatBytes(t.transfer_rx) + ' / ' + formatBytes(t.transfer_tx)),
								E('td', { 'class': 'td left' }, E('span', { 'class': 'label' }, t.zone)),
								E('td', { 'class': 'td left', 'style': 'white-space: nowrap;' }, [
									E('button', {
										'class': 'btn cbi-button cbi-button-neutral',
										'style': 'margin-right: 5px; padding: 4px 8px;',
										'title': _('Edit'),
										'aria-label': _('Edit'),
										'click': (function(tunnelObj) {
											return function() { self.handleEditTunnel(tunnelObj, bestPerNode); };
										})(t)
									}, '✎'),
									updateTargetEp ? E('button', {
										'class': 'btn cbi-button cbi-button-action',
										'style': 'margin-right: 5px; padding: 4px 8px;',
										'title': _('Update Endpoint') + ' (' + updateTargetEp + ')',
										'aria-label': _('Update Endpoint'),
										'click': (function(targetIface, ep) {
											return function() { self.handleUpdateEndpoint(targetIface, ep); };
										})(t.iface, updateTargetEp)
									}, '↻') : '',
									E('button', {
										'class': 'btn cbi-button cbi-button-reset',
										'style': 'padding: 4px 8px;',
										'title': _('Delete'),
										'aria-label': _('Delete'),
										'click': (function(targetIface) {
											return function() { self.handleDeleteTunnel(targetIface); };
										})(t.iface)
									}, '✕')
								])
							]));
						}
						return tbody;
					})()
				])
			]),

			// Section 2: Create Tunnel Card
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Create New Tunnel Interface')),
				E('div', { 'class': 'cbi-section-descr' },
					_('Create and start a new network interface directly from the latest scan discovery configuration.')
				),
				E('table', { 'class': 'table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'style': 'width: 35%' }, _('Protocol')),
						E('td', { 'class': 'td left' }, new ui.Dropdown(caps.awg?.ready ? 'amneziawg' : 'wireguard', {
							'amneziawg': 'AmneziaWG (awg)' + (!caps.awg?.ready ? ' - ' + _('Components Missing') : ''),
							'wireguard': 'WireGuard (wg)' + (!caps.wg?.ready ? ' - ' + _('Components Missing') : '')
						}, {
							id: 'new-proto',
							sort: false,
							optional: false
						}).render())
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Interface Name (max 15 chars)')),
						E('td', { 'class': 'td left' }, E('input', {
							'type': 'text',
							'id': 'new-iface',
							'class': 'cbi-input-text',
							'value': defaultIface,
							'maxlength': '15'
						}))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Firewall Zone')),
						E('td', { 'class': 'td left' }, new ui.Dropdown('wan', {
							'wan': 'wan (Masquerading / Internet Gateway)',
							'lan': 'lan'
						}, {
							id: 'new-zone',
							sort: false,
							optional: false
						}).render())
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Route Allowed IPs (Default Route)')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'checkbox', 'id': 'new-route-allowed' }))
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Managed by Scheduler (Auto-Update)')),
						E('td', { 'class': 'td left' }, [
							E('input', { 'type': 'checkbox', 'id': 'new-managed', 'checked': 'checked' }), ' ',
							E('small', { 'style': 'opacity: 0.8;' }, _('Allow scheduled scans to automatically rotate this tunnel endpoint'))
						])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Pinned Node (Optional)')),
						E('td', { 'class': 'td left' }, [
							E('input', {
								'type': 'text',
								'id': 'new-target-node',
								'class': 'cbi-input-text',
								'value': queryNode,
								'placeholder': _('Auto (or e.g. ARN, FRA, HEL)')
							})
						])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('Interface MTU')),
						E('td', { 'class': 'td left' }, E('input', { 'type': 'number', 'id': 'new-mtu', 'class': 'cbi-input-text', 'value': '1280' }))
					])
				]),
				E('div', { 'class': 'cbi-section-node', 'style': 'margin-top: 15px' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': ui.createHandlerFn(this, 'handleCreateTunnel')
					}, _('Create & Apply Tunnel'))
				])
			])
		]);

		return viewRoot;
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
