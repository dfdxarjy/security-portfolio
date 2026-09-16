#!/usr/bin/env node
// Structural accessibility checks for the generated static site in dist/.
// No dependencies: scans the Astro-generated HTML with targeted regexes, the
// same way check-metadata.mjs does. This is a blocking gate: any finding is a
// real structural defect (missing names, duplicate ids, positive tabindex,
// heading skips) and exits non-zero.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = join(root, 'dist');

/** Recursively collect files under `dir` whose name matches `filter`. */
function walk(dir, filter) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(full, filter));
		else if (entry.isFile() && filter(entry.name)) out.push(full);
	}
	return out;
}

/** Extract an attribute value from an open-tag string. */
function attr(tag, name) {
	const match = tag.match(new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
	if (!match) return undefined;
	return match[2] ?? match[3] ?? match[4];
}

/** Is an attribute present on an open-tag string, with or without a value? */
function hasAttr(tag, name) {
	return new RegExp(`(?:^|[\\s<])${name}(?=[\\s=/>]|$)`, 'i').test(tag);
}

/** Tag name of an open-tag string, lower-cased. */
function tagName(tag) {
	return (tag.match(/^<\s*([a-zA-Z][a-zA-Z0-9-]*)/) ?? [])[1]?.toLowerCase() ?? '';
}

/** 1-based line number of a character offset within `source`. */
function lineAt(source, index) {
	let line = 1;
	for (let i = 0; i < index; i += 1) if (source.charCodeAt(i) === 10) line += 1;
	return line;
}

/**
 * Blank out comments and script/style bodies, preserving newlines so line
 * numbers stay aligned. Without this, JS string/comment fragments could be
 * mistaken for markup.
 */
function stripNonContent(html) {
	return html
		.replace(/<!--[\s\S]*?-->/g, (text) => text.replace(/[^\n]/g, ' '))
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (text) => text.replace(/[^\n]/g, ' '));
}

/** Visible text of an element body, tags and entities removed. */
function textContent(inner) {
	return inner.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

/** True when at least one aria-labelledby idref resolves to an id on the page. */
function resolvesLabelledby(tag, pageIds) {
	const refs = (attr(tag, 'aria-labelledby') ?? '').trim();
	if (!refs) return false;
	return refs.split(/\s+/).some((id) => pageIds.has(id));
}

/** Does a link/button open tag plus body expose a discernible name? */
function hasDiscernibleName(tag, inner, pageIds) {
	if ((attr(tag, 'aria-label') ?? '').trim()) return true;
	if (resolvesLabelledby(tag, pageIds)) return true;
	if ((attr(tag, 'title') ?? '').trim()) return true; // last-resort accname source
	if (textContent(inner)) return true;
	for (const img of inner.match(/<img\b[^>]*>/gi) ?? []) if ((attr(img, 'alt') ?? '').trim()) return true;
	for (const svg of inner.match(/<svg\b[^>]*>/gi) ?? []) if ((attr(svg, 'title') ?? '').trim()) return true;
	if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(inner)) return true;
	return false;
}

if (!existsSync(distDir)) {
	console.error('check-a11y: dist/ not found — run the build first.');
	process.exit(1);
}

const htmlFiles = walk(distDir, (name) => name.endsWith('.html')).sort();
if (htmlFiles.length === 0) {
	console.error('check-a11y: no HTML files found under dist/ — the check could not verify anything. Run the build first.');
	process.exit(1);
}
const problems = [];

for (const file of htmlFiles) {
	const rel = relative(root, file);
	const source = stripNonContent(readFileSync(file, 'utf-8'));

	// Label targets and wrapper regions, gathered up front for the control check.
	const labelForIds = new Set(
		[...source.matchAll(/<label\b[^>]*>/gi)].map((m) => attr(m[0], 'for')).filter((id) => id),
	);
	const labelRanges = [...source.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/gi)].map((m) => [m.index, m.index + m[0].length]);

	// id values on the page: used to resolve aria-labelledby idrefs and to find duplicates.
	const ids = new Map();
	for (const m of source.matchAll(/<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>/g)) {
		const id = attr(m[0], 'id');
		if (!id) continue;
		if (!ids.has(id)) ids.set(id, []);
		ids.get(id).push(lineAt(source, m.index));
	}
	const pageIds = new Set(ids.keys());

	// 1. <img> with no alt attribute at all (alt="" is valid decorative markup).
	for (const m of source.matchAll(/<img\b[^>]*>/gi)) {
		if (!hasAttr(m[0], 'alt')) {
			problems.push(`${rel}:${lineAt(source, m.index)}: <img> has no alt attribute`);
		}
	}

	// 2. <iframe> with no title attribute, or an empty one.
	for (const m of source.matchAll(/<iframe\b[^>]*>/gi)) {
		if (!(attr(m[0], 'title') ?? '').trim()) {
			problems.push(`${rel}:${lineAt(source, m.index)}: <iframe> has no title attribute`);
		}
	}

	// 3. <a> with no discernible text. Anchors with no href attribute at all are
	// not link controls and are ignored; href="" and href="#frag" are real
	// controls and must be named.
	for (const m of source.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)) {
		const open = m[0].match(/<a\b[^>]*>/i)[0];
		if (!hasAttr(open, 'href')) continue; // no href at all, not a link control
		const inner = m[0].slice(open.length, -'</a>'.length);
		if (!hasDiscernibleName(open, inner, pageIds)) {
			problems.push(`${rel}:${lineAt(source, m.index)}: <a> has no discernible text`);
		}
	}

	// 4. <button> with no discernible text.
	for (const m of source.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)) {
		const open = m[0].match(/<button\b[^>]*>/i)[0];
		const inner = m[0].slice(open.length, -'</button>'.length);
		if (!hasDiscernibleName(open, inner, pageIds)) {
			problems.push(`${rel}:${lineAt(source, m.index)}: <button> has no discernible text`);
		}
	}

	// 5. Form controls with no accessible name.
	for (const m of source.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) {
		const tag = m[0];
		const name = tagName(tag);
		if (name === 'input' && (attr(tag, 'type') ?? '').toLowerCase() === 'hidden') continue;

		if ((attr(tag, 'aria-label') ?? '').trim()) continue;
		if (resolvesLabelledby(tag, pageIds)) continue;
		const id = attr(tag, 'id');
		if (id && labelForIds.has(id)) continue;
		if (labelRanges.some(([start, end]) => m.index > start && m.index < end)) continue;

		// Inputs whose name comes from the type itself.
		if (name === 'input') {
			const type = (attr(tag, 'type') ?? 'text').toLowerCase();
			if (['submit', 'button', 'reset'].includes(type) && (attr(tag, 'value') ?? '').trim()) continue;
			if (type === 'image' && (attr(tag, 'alt') ?? '').trim()) continue;
		}

		problems.push(`${rel}:${lineAt(source, m.index)}: <${name}> has no accessible name`);
	}

	// 6. Duplicate id values within the page.
	for (const [id, lines] of ids) {
		if (lines.length > 1) problems.push(`${rel}: duplicate id="${id}" (${lines.length}x at lines ${lines.join(', ')})`);
	}

	const FOCUSABLE = new Set(['a', 'button', 'input', 'select', 'textarea', 'area']);

	for (const m of source.matchAll(/<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*>/g)) {
		const tag = m[0];
		const name = tagName(tag);

		// 7. Positive tabindex (0 and -1 are valid).
		const tabindex = attr(tag, 'tabindex');
		if (tabindex !== undefined) {
			const value = Number.parseInt(tabindex.trim(), 10);
			if (Number.isFinite(value) && value > 0) {
				problems.push(`${rel}:${lineAt(source, m.index)}: positive tabindex="${tabindex.trim()}" on <${name}>`);
			}
		}

		// 8. aria-hidden="true" on a focusable element.
		if ((attr(tag, 'aria-hidden') ?? '').toLowerCase() !== 'true') continue;
		const tab = attr(tag, 'tabindex');
		const tabValue = tab === undefined ? undefined : Number.parseInt(tab.trim(), 10);
		const focusableByTab = tabValue !== undefined && Number.isFinite(tabValue) && tabValue >= 0;
		const isHiddenInput = name === 'input' && (attr(tag, 'type') ?? '').toLowerCase() === 'hidden';
		const isLink = name === 'a' && (attr(tag, 'href') ?? '').trim();
		const focusableElement = (FOCUSABLE.has(name) && !isHiddenInput) && (name !== 'a' || isLink) && !hasAttr(tag, 'disabled');
		if (focusableByTab || focusableElement) {
			problems.push(`${rel}:${lineAt(source, m.index)}: aria-hidden="true" on focusable <${name}>`);
		}
	}

	// 9. Heading level skip, reported once per distinct skip per page.
	let previous = 0;
	const skips = new Set();
	for (const m of source.matchAll(/<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>/gi)) {
		const level = Number(m[1]);
		if (previous > 0 && level > previous + 1) {
			const key = `${previous}->${level}`;
			if (!skips.has(key)) {
				skips.add(key);
				problems.push(`${rel}:${lineAt(source, m.index)}: heading level skip h${previous} to h${level}`);
			}
		}
		previous = level;
	}
}

if (problems.length > 0) {
	console.error(`check-a11y: ${problems.length} problem(s) found in ${htmlFiles.length} HTML file(s):`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}

console.log(`check-a11y: OK — ${htmlFiles.length} HTML file(s) passed.`);
