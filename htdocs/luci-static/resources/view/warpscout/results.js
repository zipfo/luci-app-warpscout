// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.

'use strict';
'require view';
'require rpc';
'require ui';
'require dom';

var callGetResults = rpc.declare({
	object: 'luci.warpscout',
	method: 'getResults',
	expect: { }
});

var callGetLastConfig = rpc.declare({
	object: 'luci.warpscout',
	method: 'getLastConfig',
	expect: { }
});

function copyToClipboard(text, successMsg) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		navigator.clipboard.writeText(text).then(function() {
			ui.addNotification(null, E('p', successMsg || _('Copied to clipboard!')), 'info');
		}).catch(function() {
			fallbackCopy(text, successMsg);
		});
	} else {
		fallbackCopy(text, successMsg);
	}
}

function fallbackCopy(text, successMsg) {
	var ta = document.createElement('textarea');
	ta.value = text;
	ta.style.position = 'fixed';
	ta.style.left = '-9999px';
	document.body.appendChild(ta);
	ta.select();
	try {
		document.execCommand('copy');
		ui.addNotification(null, E('p', successMsg || _('Copied to clipboard!')), 'info');
	} catch (e) {
		ui.addNotification(null, E('p', _('Failed to copy to clipboard')), 'error');
	}
	document.body.removeChild(ta);
}

return view.extend({
	load: function() {
		return callGetResults();
	},

	handleShowConfig: function(ev) {
		ui.showModal(_('Loading Generated Tunnel Config'), [
			E('p', { 'class': 'spinning' }, _('Reading generated configuration from artifacts...'))
		]);

		return callGetLastConfig().then(function(res) {
			ui.hideModal();
			if (!res || !res.content) {
				ui.addNotification(null, E('p', _('No configuration file found.')), 'warning');
				return;
			}

			var configContent = res.content;
			ui.showModal(_('Generated WireGuard / AmneziaWG Configuration'), [
				E('p', [
					_('Configuration snapshot generated from best discovered endpoint: '),
					E('code', res.path || '')
				]),
				E('pre', {
					'id': 'modal-conf-pre',
					'style': 'background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 4px; font-family: monospace; max-height: 400px; overflow-y: auto; user-select: all;'
				}, configContent),
				E('div', { 'class': 'right', 'style': 'margin-top: 15px' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'style': 'margin-right: 10px',
						'click': function() {
							copyToClipboard(configContent, _('Tunnel configuration copied to clipboard!'));
						}
					}, _('Copy to Clipboard')),
					E('button', {
						'class': 'btn cbi-button cbi-button-neutral',
						'click': ui.hideModal
					}, _('Close'))
				])
			]);
		}).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('Error: ') + err.message), 'error');
		});
	},

	exportCSV: function(items) {
		if (!items || !items.length) {
			ui.addNotification(null, E('p', _('No data to export')), 'warning');
			return;
		}

		var csv = 'ENDPOINT,TUN_PING,LOSS,ENDPOINT_PING,SPEED,SEEN_AS,NODE,NODE_LOCATION\r\n';
		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			var row = [
				'"' + (it.endpoint || '') + '"',
				'"' + (it.tun_ping || '') + '"',
				'"' + (it.loss || '') + '"',
				'"' + (it.ep_ping || '') + '"',
				'"' + (it.speed || '') + '"',
				'"' + (it.seen_as || '') + '"',
				'"' + (it.node || '') + '"',
				'"' + (it.node_location || '').replace(/"/g, '""') + '"'
			];
			csv += row.join(',') + '\r\n';
		}

		var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
		var url = URL.createObjectURL(blob);
		var a = document.createElement('a');
		a.href = url;
		a.download = 'warpscout-endpoints-' + (new Date().toISOString().slice(0, 10)) + '.csv';
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	},

	filterAndSortItems: function(rawItems, filterNode, filterCountry, zeroLossOnly, sortField) {
		var filtered = (rawItems || []).filter(function(it) {
			if (zeroLossOnly && it.loss && it.loss !== '0%') {
				return false;
			}
			if (filterNode && length(filterNode)) {
				var n = (it.node || '') + ' ' + (it.node_location || '');
				if (n.toLowerCase().indexOf(filterNode.toLowerCase()) === -1) {
					return false;
				}
			}
			if (filterCountry && length(filterCountry)) {
				var c = (it.seen_as || '') + ' ' + (it.node_location || '');
				if (c.toLowerCase().indexOf(filterCountry.toLowerCase()) === -1) {
					return false;
				}
			}
			return true;
		});

		// Numeric helper to parse "14ms", "0%", etc.
		var numVal = function(s) {
			if (!s) return 999999;
			var n = parseFloat(s);
			return isNaN(n) ? 999999 : n;
		};

		filtered.sort(function(a, b) {
			if (sortField === 'loss') return numVal(a.loss) - numVal(b.loss);
			if (sortField === 'tun_ping') return numVal(a.tun_ping) - numVal(b.tun_ping);
			if (sortField === 'ep_ping') return numVal(a.ep_ping) - numVal(b.ep_ping);
			if (sortField === 'speed') return numVal(b.speed) - numVal(a.speed);
			if (sortField === 'node') return (a.node || '').localeCompare(b.node || '');
			return 0;
		});

		return filtered;
	},

	renderTable: function(items) {
		var tbody = E('tbody');
		if (!items || !items.length) {
			tbody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td center', 'colspan': '8' }, _('No endpoints match the selected filters.'))
			]));
			return tbody;
		}

		for (var i = 0; i < items.length; i++) {
			var it = items[i];
			var isZeroLoss = (!it.loss || it.loss === '0%');
			var lossBadge = isZeroLoss ?
				E('span', { 'class': 'label success' }, it.loss || '0%') :
				E('span', { 'class': 'label danger' }, it.loss);

			var nodeBadgeClass = (it.node === 'DME' || it.node === 'SVO' || it.node === 'LED') ? 'label warning' : 'label';
			var nodeBadge = E('span', { 'class': nodeBadgeClass }, it.node || '-');

			var epText = it.endpoint || '';
			tbody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left' }, [ E('strong', {}, [ E('code', {}, epText || '-') ]) ]),
				E('td', { 'class': 'td left' }, it.tun_ping || '-'),
				E('td', { 'class': 'td left' }, lossBadge),
				E('td', { 'class': 'td left' }, it.ep_ping || '-'),
				E('td', { 'class': 'td left' }, [
					E('span', { 'class': 'label' }, it.seen_as || '-'), ' ',
					nodeBadge
				]),
				E('td', { 'class': 'td left' }, it.node_location || '-'),
				E('td', { 'class': 'td left' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-neutral',
						'style': 'margin-right: 5px',
						'click': (function(targetEp) {
							return function() {
								copyToClipboard(targetEp, _('Endpoint copied: ') + targetEp);
							};
						})(epText)
					}, _('Copy IP')),
					E('a', {
						'class': 'btn cbi-button cbi-button-action',
						'href': L.url('admin/services/warpscout/tunnels') + '?apply_ep=' + encodeURIComponent(epText) + (it.node ? '&node=' + encodeURIComponent(it.node) : '')
					}, _('Make Tunnel'))
				])
			]));
		}

		return tbody;
	},

	render: function(data) {
		var self = this;
		var lastScan = data?.last_scan;
		var job = data?.job;

		if (!lastScan || !lastScan.items || !lastScan.items.length) {
			return E('div', { 'class': 'cbi-map' }, [
				E('h2', _('WarpScout - Discovery Results')),
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'class': 'alert-message info' }, [
						E('h4', _('No discovery scan results available')),
						E('p', _('No WARP scan has been executed yet, or previous scans did not discover working endpoints. Run a scan from the Scanner view to discover optimal endpoints.')),
						E('p', { 'style': 'margin-top: 15px' }, [
							E('a', {
								'href': L.url('admin/services/warpscout/scan'),
								'class': 'btn cbi-button cbi-button-action'
							}, _('Go to Scanner'))
						])
					])
				])
			]);
		}

		var allItems = lastScan.items || [];
		var bestPerNode = lastScan.best_per_node || [];
		var currentSource = allItems;

		// Summary Banner
		var summaryCard = E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Latest Scan Summary')),
			E('table', { 'class': 'table' }, [
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'style': 'width: 25%' }, _('Scan Job ID / Time')),
					E('td', { 'class': 'td left' }, E('code', job?.id || '-'))
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Working Endpoints')),
					E('td', { 'class': 'td left' }, [
						E('span', { 'class': 'label success' }, (lastScan.working || 0) + ' / ' + (lastScan.probed || 0) + _(' endpoints verified'))
					])
				]),
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left' }, _('Optimal Discovered Endpoint')),
					E('td', { 'class': 'td left' }, [
						E('strong', {}, [ E('code', {}, lastScan.best || '-') ]), ' | ',
						E('span', { 'class': 'label' }, _('Node: ') + (lastScan.best_node || '-')), ' | ',
						E('span', { 'class': 'label' }, _('Exit: ') + (lastScan.best_seen_as || '-'))
					])
				])
			]),
			E('div', { 'style': 'margin-top: 15px' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-action',
					'style': 'margin-right: 10px',
					'click': ui.createHandlerFn(this, 'handleShowConfig')
				}, _('View / Copy Generated Config (.conf)')),
				E('button', {
					'class': 'btn cbi-button cbi-button-neutral',
					'style': 'margin-right: 10px',
					'click': function() { self.exportCSV(currentSource); }
				}, _('Export to CSV')),
				E('a', {
					'href': L.url('admin/services/warpscout/scan'),
					'class': 'btn cbi-button cbi-button-neutral'
				}, _('Run New Scan'))
			])
		]);

		// Filter Controls
		var nodeFilterInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'style': 'width: 150px; margin-right: 15px;',
			'placeholder': _('Filter Node / City')
		});

		var countryFilterInput = E('input', {
			'type': 'text',
			'class': 'cbi-input-text',
			'style': 'width: 120px; margin-right: 15px;',
			'placeholder': _('Filter Country')
		});

		var zeroLossCheckbox = E('input', {
			'type': 'checkbox',
			'id': 'filter-zero-loss',
			'style': 'margin-right: 5px'
		});

		var sortSelect = new ui.Dropdown('loss', {
			'loss': _('Sort: Lowest Loss'),
			'tun_ping': _('Sort: Lowest Tun Ping'),
			'ep_ping': _('Sort: Lowest Host Ping'),
			'node': _('Sort: Node Code')
		}, {
			sort: false,
			optional: false
		}).render();
		sortSelect.style.marginRight = '15px';

		var viewModeSelect = new ui.Dropdown('all', {
			'all': _('View: All Endpoints'),
			'best_node': _('View: Best per Node only')
		}, {
			sort: false,
			optional: false
		}).render();
		viewModeSelect.style.marginRight = '15px';

		var tableElement = E('table', { 'class': 'table', 'id': 'results-table' }, [
			E('thead', [
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, _('ENDPOINT')),
					E('th', { 'class': 'th left' }, _('TUN PING')),
					E('th', { 'class': 'th left' }, _('LOSS')),
					E('th', { 'class': 'th left' }, _('HOST PING')),
					E('th', { 'class': 'th left' }, _('EXIT / NODE')),
					E('th', { 'class': 'th left' }, _('LOCATION')),
					E('th', { 'class': 'th left' }, _('ACTIONS'))
				])
			]),
			this.renderTable(allItems)
		]);

		var updateTableView = function() {
			var selectedMode = viewModeSelect.value;
			currentSource = (selectedMode === 'best_node') ? bestPerNode : allItems;
			var filtered = self.filterAndSortItems(
				currentSource,
				nodeFilterInput.value,
				countryFilterInput.value,
				zeroLossCheckbox.checked,
				sortSelect.value
			);

			var oldTbody = tableElement.querySelector('tbody');
			var newTbody = self.renderTable(filtered);
			if (oldTbody) {
				tableElement.replaceChild(newTbody, oldTbody);
			} else {
				tableElement.appendChild(newTbody);
			}
		};

		nodeFilterInput.addEventListener('input', updateTableView);
		countryFilterInput.addEventListener('input', updateTableView);
		zeroLossCheckbox.addEventListener('change', updateTableView);
		sortSelect.addEventListener('cbi-dropdown-change', updateTableView);
		viewModeSelect.addEventListener('cbi-dropdown-change', updateTableView);

		var filterToolbar = E('div', { 'class': 'cbi-section', 'style': 'padding: 12px 15px;' }, [
			E('div', { 'style': 'display: flex; flex-wrap: wrap; align-items: center;' }, [
				viewModeSelect,
				sortSelect,
				nodeFilterInput,
				countryFilterInput,
				E('label', { 'style': 'display: inline-flex; align-items: center; margin-right: 15px; cursor: pointer;' }, [
					zeroLossCheckbox,
					_('0% Loss Only')
				])
			])
		]);

		var tableSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', _('Discovered Endpoints')),
			tableElement
		]);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', _('WarpScout - Endpoint Discovery Results')),
			E('div', { 'class': 'cbi-map-descr' },
				_('Inspect discovered endpoints with real in-tunnel round-trip times and packet loss. Copy endpoints or export configurations directly into network tunnels.')
			),
			summaryCard,
			filterToolbar,
			tableSection
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
