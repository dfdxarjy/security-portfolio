#!/usr/bin/env node
// Focused browser-interaction regression checks for the generated static site
// in dist/. No third-party dependency: this uses Node's built-in HTTP server,
// global fetch and global WebSocket to drive a headless Chrome/Chromium/Brave
// instance over the Chrome DevTools Protocol (CDP).
//
// Why a real browser: the defects under test are DOM geometry and live React
// state changes (dialog layout while a result list grows, explorer controls
// reacting to typing, 320px overflow, mobile document order). None of these can
// be established by scanning static HTML the way check-a11y.mjs does.
//
// Design constraints:
//   - only Node builtins (node:http, node:child_process, node:fs, node:os)
//   - the browser gets its own isolated temp profile and is the only process
//     this script kills; a dev server or the user's browser is never touched
//   - assertions use DOM state/geometry and bounded polling, never fixed sleeps
//     and never pixel screenshots
//
// Exit code is non-zero when any assertion fails. Skips are reported but do not
// fail the run (they mark coverage that does not exist yet).

import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const distDir = join(root, 'dist');

if (!existsSync(distDir)) {
	console.error('check-interactions: dist/ not found — run the build first.');
	process.exit(1);
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

function waitForExit(child, timeout = 5000) {
	return new Promise((done) => {
		if (child.exitCode !== null) return done();
		const timer = setTimeout(() => {
			child.removeListener('exit', onExit);
			done();
		}, timeout);
		const onExit = () => {
			clearTimeout(timer);
			done();
		};
		child.once('exit', onExit);
	});
}

async function removeDir(dir) {
	for (let attempt = 0; attempt < 30; attempt += 1) {
		try {
			rmSync(dir, { recursive: true, force: true });
		} catch {
			// A just-killed browser can still be flushing its profile; retry.
		}
		if (!existsSync(dir)) return;
		await sleep(100);
	}
}

// ---------------------------------------------------------------------------
// Static file server for dist/
// ---------------------------------------------------------------------------

const CONTENT_TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2',
	'.woff': 'font/woff',
	'.xml': 'application/xml; charset=utf-8',
	'.txt': 'text/plain; charset=utf-8',
};

function safeFilePath(pathname) {
	const candidate = normalize(join(distDir, pathname));
	if (candidate !== distDir && !candidate.startsWith(distDir + sep)) return null;
	return candidate;
}

function resolveRequestFile(pathname) {
	let file = safeFilePath(pathname);
	if (!file) return null;
	if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
	if (existsSync(file) && statSync(file).isFile()) return file;
	const index = safeFilePath(normalize(join(pathname, 'index.html')));
	if (index && existsSync(index) && statSync(index).isFile()) return index;
	return null;
}

async function startServer() {
	const server = http.createServer((req, res) => {
		try {
			const url = new URL(req.url, 'http://127.0.0.1');
			const pathname = decodeURIComponent(url.pathname);
			const file = resolveRequestFile(pathname);
			if (!file) {
				res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
				res.end('not found');
				return;
			}
			res.writeHead(200, {
				'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
				'cache-control': 'no-store',
			});
			res.end(readFileSync(file));
		} catch (error) {
			res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
			res.end(String(error && error.message));
		}
	});
	await new Promise((res, rej) => {
		server.once('error', rej);
		server.listen(0, '127.0.0.1', res);
	});
	const { port } = server.address();
	return { server, origin: `http://127.0.0.1:${port}` };
}

// ---------------------------------------------------------------------------
// Browser discovery and launch
// ---------------------------------------------------------------------------

function resolveBrowser() {
	const candidates = [
		process.env.CHROME_BIN,
		'google-chrome',
		'google-chrome-stable',
		'chromium',
		'chromium-browser',
		'brave',
		'brave-browser',
		'chrome',
	].filter(Boolean);

	const pathDirs = (process.env.PATH ?? '').split(sep === '/' ? ':' : ';').filter(Boolean);
	for (const candidate of candidates) {
		if (candidate.includes('/') || candidate.includes('\\')) {
			if (existsSync(candidate)) return candidate;
			continue;
		}
		for (const dir of pathDirs) {
			const full = join(dir, candidate);
			if (existsSync(full)) return full;
		}
	}
	return null;
}

async function launchBrowser(browserPath, profileDir) {
	const child = spawn(
		browserPath,
		[
			'--headless=new',
			'--remote-debugging-port=0',
			`--user-data-dir=${profileDir}`,
			'--no-first-run',
			'--no-default-browser-check',
			'--disable-gpu',
			'--disable-dev-shm-usage',
			'--no-sandbox',
			'--disable-extensions',
			'--disable-background-networking',
			'--window-size=1280,900',
			'about:blank',
		],
		{ stdio: ['ignore', 'ignore', 'pipe'] },
	);

	let stderr = '';
	child.stderr?.on('data', (chunk) => {
		stderr += chunk.toString();
		if (stderr.length > 8000) stderr = stderr.slice(-8000);
	});

	const portFile = join(profileDir, 'DevToolsActivePort');
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		if (existsSync(portFile)) {
			const [line] = readFileSync(portFile, 'utf-8').trim().split(/\r?\n/);
			if (line && Number.isFinite(Number(line))) {
				return { child, port: Number(line), getStderr: () => stderr };
			}
		}
		if (child.exitCode !== null) {
			throw new Error(`browser exited early with code ${child.exitCode}\n${stderr}`);
		}
		await sleep(100);
	}
	child.kill('SIGKILL');
	throw new Error(`timed out waiting for DevToolsActivePort\n${stderr}`);
}

// ---------------------------------------------------------------------------
// Minimal CDP client over the Node global WebSocket
// ---------------------------------------------------------------------------

class CDPClient {
	constructor(url) {
		this.ws = new WebSocket(url);
		this.nextId = 0;
		this.pending = new Map();
		this.listeners = new Map();
	}

	connect() {
		return new Promise((res, rej) => {
			this.ws.addEventListener('open', () => res());
			this.ws.addEventListener('error', () => rej(new Error('CDP WebSocket error')));
			this.ws.addEventListener('message', (event) => this.#onMessage(event.data));
		});
	}

	#onMessage(raw) {
		let message;
		try {
			message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
		} catch {
			return;
		}
		if (message.id !== undefined) {
			const entry = this.pending.get(message.id);
			if (!entry) return;
			this.pending.delete(message.id);
			if (message.error) entry.reject(new Error(`${message.error.message} (${message.error.code})`));
			else entry.resolve(message.result);
			return;
		}
		for (const fn of this.listeners.get(message.method) ?? []) fn(message.params);
	}

	send(method, params = {}) {
		const id = ++this.nextId;
		return new Promise((res, rej) => {
			this.pending.set(id, { resolve: res, reject: rej });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}

	on(method, fn) {
		if (!this.listeners.has(method)) this.listeners.set(method, []);
		this.listeners.get(method).push(fn);
	}

	close() {
		try {
			this.ws.close();
		} catch {
			// already closing
		}
	}
}

// ---------------------------------------------------------------------------
// Assertion bookkeeping
// ---------------------------------------------------------------------------

const passes = [];
const failures = [];
const skips = [];

async function check(name, fn) {
	try {
		await fn();
		passes.push(name);
		console.log(`  PASS ${name}`);
	} catch (error) {
		failures.push({ name, error });
		console.error(`  FAIL ${name}: ${error.message}`);
	}
}

function assert(condition, message) {
	if (!condition) throw new Error(message);
}

function skip(name, reason) {
	skips.push({ name, reason });
	console.log(`  SKIP ${name}: ${reason}`);
}

// ---------------------------------------------------------------------------
// Page driving helpers
// ---------------------------------------------------------------------------

let cdp;

async function evaluate(expression) {
	const result = await cdp.send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true,
		userGesture: true,
	});
	if (result.exceptionDetails) {
		const detail = result.exceptionDetails.exception?.description ?? result.exceptionDetails.text;
		throw new Error(`page evaluate failed: ${detail}`);
	}
	return result.result.value;
}

async function waitFor(predicate, { timeout = 5000, interval = 50, label = 'condition' } = {}) {
	const deadline = Date.now() + timeout;
	let last;
	while (Date.now() < deadline) {
		try {
			last = await predicate();
			if (last) return last;
		} catch (error) {
			last = error.message;
		}
		await sleep(interval);
	}
	throw new Error(`timed out after ${timeout}ms waiting for ${label}${last !== undefined ? ` (last: ${JSON.stringify(last)})` : ''}`);
}

async function goto(path) {
	await cdp.send('Page.navigate', { url: `${origin}${path}` });
	await waitFor(
		async () => {
			const state = await evaluate('({ ready: document.readyState, path: location.pathname })');
			return state.ready === 'complete' && state.path === path;
		},
		{ timeout: 15000, label: `navigation to ${path}` },
	);
}

async function setViewport(width, height) {
	await cdp.send('Emulation.setDeviceMetricsOverride', {
		width,
		height,
		deviceScaleFactor: 1,
		mobile: width < 600,
	});
}

// Wait until every Astro island on the page reports hydrated. Astro removes the
// `ssr` attribute during hydration, which is a deterministic readiness signal
// (unlike a fixed timeout).
async function waitForHydration() {
	await waitFor(
		() => evaluate("document.querySelectorAll('astro-island[client][ssr]').length === 0"),
		{ timeout: 15000, label: 'Astro island hydration' },
	);
}

function setInputValue(selector, value) {
	return evaluate(`(() => {
		const el = document.querySelector(${JSON.stringify(selector)});
		if (!el) return false;
		el.focus();
		const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
		const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
		setter.call(el, ${JSON.stringify(value)});
		el.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	})()`);
}

function textContent(selector) {
	return evaluate(`(() => {
		const el = document.querySelector(${JSON.stringify(selector)});
		return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;
	})()`);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const SEARCH_DIALOG = 'dialog[aria-labelledby="search-dialog-title"]';
const SEARCH_INPUT = `${SEARCH_DIALOG} input[type="search"]`;
const SEARCH_STATUS = `${SEARCH_DIALOG} [role="status"]`;
const SEARCH_LIST = `${SEARCH_DIALOG} ul`;

async function testSearchDialogStability() {
	const MANY = 'e'; // matches well over the 20-result cap
	const MANY_TOO = 'er'; // also over the cap, different result set
	const CAP_TEXT = 'Showing the first 20';

	await setViewport(1024, 700);
	await goto('/');
	await waitForHydration();

	await evaluate(`document.querySelector('button[aria-label="Search"]')?.click() ?? false`);
	await waitFor(() => evaluate(`document.querySelector(${JSON.stringify(SEARCH_DIALOG)})?.open === true`), {
		label: 'search dialog to open',
	});

	await setInputValue(SEARCH_INPUT, MANY);
	await waitFor(
		async () => {
			const text = await textContent(SEARCH_STATUS);
			return typeof text === 'string' && text.includes(CAP_TEXT);
		},
		{ label: `search status for query ${MANY}` },
	);

	const geometry = () =>
		evaluate(`(() => {
			const dialog = document.querySelector(${JSON.stringify(SEARCH_DIALOG)});
			const list = dialog.querySelector('ul');
			const heading = dialog.querySelector('h2');
			const input = dialog.querySelector('input[type="search"]');
			const status = dialog.querySelector('[role="status"]');
			const dialogRect = dialog.getBoundingClientRect();
			const inputRect = input.getBoundingClientRect();
			const listStyle = getComputedStyle(list);
			return {
				dialogTop: dialogRect.top,
				inputTop: inputRect.top,
				listOverflowY: listStyle.overflowY,
				listScrollHeight: list.scrollHeight,
				listClientHeight: list.clientHeight,
				dialogScrollHeight: dialog.scrollHeight,
				dialogClientHeight: dialog.clientHeight,
				dialogOverflowY: getComputedStyle(dialog).overflowY,
				headingInList: list.contains(heading),
				inputInList: list.contains(input),
				statusInList: list.contains(status),
			};
		})()`);

	const first = await geometry();

	// The result list must be its own scroll container while the dialog chrome
	// stays fixed.
	assert(
		first.listOverflowY === 'auto' || first.listOverflowY === 'scroll',
		`result list is not a scroll container (overflow-y: ${first.listOverflowY})`,
	);
	assert(
		first.listScrollHeight > first.listClientHeight + 1,
		`result list does not overflow as expected (scrollHeight ${first.listScrollHeight} <= clientHeight ${first.listClientHeight})`,
	);
	assert(
		first.dialogScrollHeight <= first.dialogClientHeight + 1,
		`dialog itself is scrolling (scrollHeight ${first.dialogScrollHeight} > clientHeight ${first.dialogClientHeight})`,
	);
	assert(
		first.dialogOverflowY !== 'auto' && first.dialogOverflowY !== 'scroll',
		`dialog is a scroll container (overflow-y: ${first.dialogOverflowY})`,
	);
	assert(!first.headingInList, 'heading is inside the result list scroll container');
	assert(!first.inputInList, 'search input is inside the result list scroll container');
	assert(!first.statusInList, 'status region is inside the result list scroll container');

	// Changing the result set while the cap is still reached must not move the
	// dialog or its top chrome.
	await setInputValue(SEARCH_INPUT, MANY_TOO);
	await waitFor(
		async () => {
			const text = await textContent(SEARCH_STATUS);
			return typeof text === 'string' && text.includes(CAP_TEXT) && !text.includes(' 82 ');
		},
		{ label: `search status for query ${MANY_TOO}` },
	);

	const second = await geometry();
	assert(
		Math.abs(second.dialogTop - first.dialogTop) <= 1,
		`dialog top moved as results changed (${first.dialogTop} -> ${second.dialogTop})`,
	);
	assert(
		Math.abs(second.inputTop - first.inputTop) <= 1,
		`dialog chrome moved as results changed (input top ${first.inputTop} -> ${second.inputTop})`,
	);
}

async function testExplorerInteractivity() {
	await setViewport(1280, 900);
	await goto('/case-studies/');
	await waitForHydration();

	const inputExists = await evaluate(`!!document.querySelector('#explorer-search')`);
	assert(inputExists, 'explorer search input #explorer-search is missing');

	const set = await setInputValue('#explorer-search', 'docker');
	assert(set, 'could not set the explorer search input');

	const started = Date.now();
	const status = await waitFor(
		async () => {
			const text = await textContent('.explorer-result-js');
			return typeof text === 'string' && /\b3 results?\b/.test(text) ? text : false;
		},
		{ timeout: 6000, label: 'explorer results to react to typing' },
	);
	const elapsed = Date.now() - started;

	const visibleCards = await evaluate(
		`document.querySelectorAll('#explorer-grid .explorer-card:not([hidden])').length`,
	);
	assert(visibleCards === 3, `expected 3 visible cards for "docker", found ${visibleCards}`);
	console.log(`       (explorer reacted in ~${elapsed}ms, status: "${status}")`);
}

async function testNarrowViewportOverflow() {
	await setViewport(320, 640);
	await goto('/');

	const metrics = await evaluate(`(() => {
		const doc = document.documentElement;
		const header = document.querySelector('.portfolio-header');
		const headerInner = header ? header.firstElementChild : null;
		return {
			innerWidth: window.innerWidth,
			clientWidth: doc.clientWidth,
			scrollWidth: doc.scrollWidth,
			bodyScrollWidth: document.body.scrollWidth,
			headerScrollWidth: header ? header.scrollWidth : null,
			headerClientWidth: header ? header.clientWidth : null,
			headerInnerRight: headerInner ? headerInner.getBoundingClientRect().right : null,
		};
	})()`);

	assert(
		metrics.scrollWidth <= metrics.clientWidth + 1,
		`document overflows at 320px (scrollWidth ${metrics.scrollWidth} > clientWidth ${metrics.clientWidth})`,
	);
	assert(
		metrics.bodyScrollWidth <= metrics.clientWidth + 1,
		`body overflows at 320px (body scrollWidth ${metrics.bodyScrollWidth} > clientWidth ${metrics.clientWidth})`,
	);
	if (metrics.headerScrollWidth !== null) {
		assert(
			metrics.headerScrollWidth <= metrics.headerClientWidth + 1,
			`header overflows at 320px (scrollWidth ${metrics.headerScrollWidth} > clientWidth ${metrics.headerClientWidth})`,
		);
	}
}

async function testMobileCaseOrder() {
	await setViewport(390, 844);
	await goto('/case-studies/htb/machines/windows/monteverde/');

	const order = await evaluate(`(() => {
		const prefix = (a, b) =>
			!!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
		const article = document.querySelector('article[data-page="case"]');
		const h1 = document.querySelector('#_top');
		const facts = document.querySelector('aside[aria-label="Case facts"]');
		const contents = document.querySelector('nav[aria-label="Case contents"]');
		const related = document.querySelector('nav[aria-label="Related cases"]');
		const provenance = document.querySelector('nav[aria-label="Provenance"]');
		return {
			hasArticle: !!article,
			hasH1: !!h1,
			hasFacts: !!facts,
			hasContents: !!contents,
			hasRelated: !!related,
			hasProvenance: !!provenance,
			h1BeforeFacts: !!(h1 && facts) && prefix(h1, facts),
			h1BeforeContents: !!(h1 && contents) && prefix(h1, contents),
			articleBeforeRelated: !!(article && related) && prefix(article, related),
			articleBeforeProvenance: !!(article && provenance) && prefix(article, provenance),
		};
	})()`);

	for (const key of ['hasArticle', 'hasH1', 'hasFacts', 'hasContents', 'hasRelated', 'hasProvenance']) {
		assert(order[key], `mobile case page is missing an expected element: ${key}`);
	}
	assert(order.h1BeforeFacts, 'H1 does not precede the Case facts disclosure in document order');
	assert(order.h1BeforeContents, 'H1 does not precede the Contents disclosure in document order');
	assert(order.articleBeforeRelated, 'Related cases appears before the end of the article in document order');
	assert(order.articleBeforeProvenance, 'Provenance appears before the end of the article in document order');
}

async function testMobileTocsIfPresent() {
	// Method and Pro Lab pages currently render their TOC only in the desktop
	// right rail; there is no mobile disclosure in dist. Coverage is recorded as
	// a skip so it activates once the UI exists, rather than requiring behaviour
	// that has not been implemented.
	const pages = ['/method/', '/prolabs/dante/'];
	const present = [];
	for (const path of pages) {
		await setViewport(390, 844);
		await goto(path);
		const hasMobileToc = await evaluate(`(() => {
			const disclosures = Array.from(document.querySelectorAll('details.portfolio-disclosure'));
			return disclosures.some((d) => {
				const summary = d.querySelector('summary');
				const label = summary ? summary.textContent.toLowerCase() : '';
				return label.includes('contents') || label.includes('on this page');
			});
		})()`);
		if (hasMobileToc) present.push(path);
	}

	if (present.length === 0) {
		skip(
			'mobile TOC for Method and Pro Lab pages',
			'not implemented in the current build (no mobile Contents/on-this-page disclosure); TODO add assertions when it lands',
		);
		return;
	}

	await check('mobile TOC on Method and Pro Lab pages', async () => {
		for (const path of present) {
			await setViewport(390, 844);
			await goto(path);
			const ok = await evaluate(`(() => {
				const disclosures = Array.from(document.querySelectorAll('details.portfolio-disclosure'));
				const toc = disclosures.find((d) => {
					const label = (d.querySelector('summary')?.textContent ?? '').toLowerCase();
					return label.includes('contents') || label.includes('on this page');
				});
				if (!toc) return false;
				const summary = toc.querySelector('summary');
				const list = toc.querySelector('ul');
				return !!summary && !!list && toc.open === false;
			})()`);
			assert(ok, `mobile TOC on ${path} is not a closed <details> with a summary and list`);
		}
	});
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

let origin = '';
let server;
let browser;

try {
	const browserPath = resolveBrowser();
	if (!browserPath) {
		console.error(
			'check-interactions: no Chrome/Chromium/Brave executable found. Set CHROME_BIN or install one.',
		);
		process.exit(1);
	}
	console.log(`check-interactions: using browser ${browserPath}`);

	const started = await startServer();
	server = started.server;
	origin = started.origin;

	const profileDir = mkdtempSync(join(tmpdir(), 'portfolio-interactions-'));
	try {
		browser = await launchBrowser(browserPath, profileDir);

		const targets = await (await fetch(`http://127.0.0.1:${browser.port}/json/list`)).json();
		const page = targets.find((target) => target.type === 'page');
		if (!page?.webSocketDebuggerUrl) {
			throw new Error('no page target available over CDP');
		}

		cdp = new CDPClient(page.webSocketDebuggerUrl);
		await cdp.connect();
		await cdp.send('Page.enable');
		await cdp.send('Runtime.enable');

		console.log('check-interactions: running assertions');
		await check('search dialog top stable and list scrolls independently', testSearchDialogStability);
		await check('explorer controls respond to typing promptly', testExplorerInteractivity);
		await check('320px homepage/header has no horizontal overflow', testNarrowViewportOverflow);
		await check('mobile case document order', testMobileCaseOrder);
		await testMobileTocsIfPresent();
	} finally {
		cdp?.close();
		if (browser?.child && browser.child.exitCode === null) {
			browser.child.kill('SIGKILL');
			await waitForExit(browser.child);
		}
		// Clean up only the isolated profile this script created.
		await removeDir(profileDir);
	}
} catch (error) {
	console.error(`check-interactions: fatal error: ${error.message}`);
	failures.push({ name: 'runner', error });
} finally {
	await new Promise((done) => (server ? server.close(done) : done()));
}

console.log('');
console.log(
	`check-interactions: ${passes.length} passed, ${failures.length} failed, ${skips.length} skipped`,
);
for (const { name, error } of failures) console.error(`  - ${name}: ${error.message}`);
for (const { name, reason } of skips) console.log(`  - skipped ${name}: ${reason}`);

if (failures.length > 0) process.exit(1);
console.log('check-interactions: OK');
