#!/usr/bin/ucode
// Copyright (C) 2026 WarpScout LuCI App Authors
// Licensed under the MIT License.
// report-parse.uc - Parser for warpscout CLI report output (-o FILE)

'use strict';

import { open, readfile } from 'fs';

function parse_report(content) {
	if (!content)
		return null;

	const lines = split(content, '\n');
	let working = 0;
	let probed = 0;
	let current_section = 'main';

	let has_tun_ping = false;
	let has_loss = false;
	let has_speed = false;

	const items = [];
	const best_items = [];
	const torn_items = [];
	const unparsed = [];

	for (let raw_line in lines) {
		const line = trim(raw_line);
		if (!length(line))
			continue;

		// 1. Summary line: # WARP endpoints: X working / Y probed
		const summary_match = match(line, /^#\s*WARP endpoints:\s*(\d+)\s*working\s*\/\s*(\d+)\s*probed/);
		if (summary_match) {
			working = int(summary_match[1]);
			probed = int(summary_match[2]);
			continue;
		}

		// 2. Section headers
		if (match(line, /^#\s*Best endpoint per node/i)) {
			current_section = 'best_per_node';
			continue;
		}
		if (match(line, /^#\s*.*torn down/i)) {
			current_section = 'torn';
			continue;
		}
		if (substr(line, 0, 1) == '#') {
			continue;
		}

		// 3. Column header detection
		if (match(line, /^ENDPOINT\s+/)) {
			has_tun_ping = (index(line, 'TUN PING') >= 0);
			has_loss = (index(line, 'LOSS') >= 0);
			has_speed = (index(line, 'SPEED') >= 0);
			continue;
		}
		if (match(line, /^NODE\s+ENDPOINT\s+/)) {
			continue;
		}

		// 4. Data line: split by 2 or more spaces
		const fields = split(line, /\s{2,}/);

		if (current_section == 'main') {
			const ep = fields[0];
			if (!match(ep, /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-fA-F:]+\]):\d+$/)) {
				push(unparsed, line);
				continue;
			}

			let idx = 0;
			let item = {};
			item.endpoint = fields[idx++];
			item.ep_ping = fields[idx++];
			if (has_tun_ping) item.tun_ping = fields[idx++];
			if (has_loss) item.loss = fields[idx++];
			if (has_speed) item.speed = fields[idx++];
			item.seen_as = fields[idx++];
			item.node = fields[idx++];
			item.node_location = fields[idx++];

			push(items, item);
		} else if (current_section == 'best_per_node') {
			const node = fields[0];
			const ep = fields[1];
			if (!match(ep, /^(\d+\.\d+\.\d+\.\d+|\[[0-9a-fA-F:]+\]):\d+$/)) {
				push(unparsed, line);
				continue;
			}

			let idx = 0;
			let best_item = {};
			best_item.node = fields[idx++];
			best_item.endpoint = fields[idx++];
			best_item.ep_ping = fields[idx++];
			if (has_tun_ping) best_item.tun_ping = fields[idx++];
			if (has_loss) best_item.loss = fields[idx++];
			if (has_speed) best_item.speed = fields[idx++];
			best_item.seen_as = fields[idx++];
			best_item.node_location = fields[idx++];

			push(best_items, best_item);
		} else if (current_section == 'torn') {
			push(torn_items, line);
		}
	}

	const best = items[0] || best_items[0] || null;

	return {
		working: working,
		probed: probed,
		best: best?.endpoint || null,
		best_node: best?.node || null,
		best_seen_as: best?.seen_as || null,
		items: items,
		best_per_node: best_items,
		torn: torn_items,
		unparsed: unparsed
	};
}

// Standalone CLI invocation: report-parse.uc <file>
if (global?.ARGV && length(global.ARGV) > 0) {
	const file_path = ARGV[0];
	const content = readfile(file_path);
	if (!content) {
		warn('Failed to read file: ' + file_path + '\n');
		exit(1);
	}
	const result = parse_report(content);
	print(sprintf('%J\n', result));
}

return { parse_report };
