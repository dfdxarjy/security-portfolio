// Guard against stale authored CSP script hashes.
//
// Astro injects its own script hashes automatically, but arbitrary authored
// `is:inline` scripts in BaseLayout.astro are listed manually in
// astro.config.mjs `security.csp.scriptDirective.hashes`. Astro does not
// recompute those, so if the script text changes the configured hash silently
// stops matching and CSP blocks the script at runtime. This check fails when a
// configured hash matches no built inline script, and in the inverse direction
// when a built executable inline script is not covered by the script-src
// hashes its page actually emits. Astro-generated scripts carry their own
// hashes in that emitted directive, so they are covered by construction and are
// never reported as missing; an uncovered hash means an authored script.
//
// Assumptions, kept deliberately narrow for the current static output:
//   * Only `dist/**/*.html` is scanned (the build runs before this check).
//   * A script is "executable inline" when it has no `src` attribute and its
//     `type` is absent, `text/javascript` or `module`. `application/ld+json`
//     and any other non-JS type are ignored because Astro hashes generated
//     scripts and JSON-LD is not executable script under CSP.
//   * `<script>` is a raw-text element, so the byte range between the opening
//     tag's `>` and `</script>` is hashed verbatim, exactly as Astro emits and
//     hashes it. The regex assumes generated markup has no `>` inside a quoted
//     script attribute and no literal `</script>` inside script text.
//   * Built-in modules only; no dependency is added for this check.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(repoRoot, "astro.config.mjs");
const distDir = path.join(repoRoot, "dist");

const fail = (message) => {
	console.error(`check-csp-hashes: ${message}`);
	process.exit(1);
};

const sha256 = (text) =>
	`sha256-${createHash("sha256").update(text, "utf8").digest("base64")}`;

// 1. Configured hashes from astro.config.mjs.
const configText = readFileSync(configPath, "utf8");
const configuredHashes = new Set(
	configText.match(/sha256-[A-Za-z0-9+/=]+/g) ?? [],
);
if (configuredHashes.size === 0) {
	fail(`no configured sha256 hashes found in ${configPath}`);
}

// 2. Recursively collect built HTML files.
const htmlFiles = [];
const walk = (dir) => {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full);
		} else if (entry.isFile() && entry.name.endsWith(".html")) {
			htmlFiles.push(full);
		}
	}
};
try {
	walk(distDir);
} catch {
	fail(`no dist directory at ${distDir} (run the build first)`);
}
if (htmlFiles.length === 0) {
	fail(`no HTML files found under ${distDir}`);
}

// 3. Extract executable inline scripts and hash their exact emitted text.
const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script\b[^>]*>/gi;
const attrTypeRe = /\btype\s*=\s*["']([^"']*)["']|type\s*=\s*([^\s"'>]+)/i;
const attrSrcRe = /\bsrc\s*=/i;
const nonExecutableTypes = new Set(["application/ld+json"]);
// The emitted policy lives in the `content` attribute of the CSP meta tag, so
// parse that attribute first. Reading script-src from anywhere in the document
// would trust unrelated text (JSON-LD, rendered code blocks) as the policy.
const cspMetaRe =
	/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/i;
const cspContentRe = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i;
const cspScriptRe = /script-src([^;]*)/i;
const hashRe = /sha256-[A-Za-z0-9+/=]+/g;

const extractCspScriptSrc = (html) => {
	const meta = cspMetaRe.exec(html)?.[0];
	if (!meta) return "";
	const content = cspContentRe.exec(meta);
	const policy = content?.[2] ?? content?.[3] ?? "";
	return cspScriptRe.exec(policy)?.[1] ?? "";
};

const foundHashes = new Map(); // hash -> sample relative file
const uncoveredHashes = new Map(); // hash -> sample relative file
let executableInline = 0;

for (const file of htmlFiles) {
	const html = readFileSync(file, "utf8");
	// Hashes the emitted CSP script-src directive grants for this page. This
	// includes configured hashes plus the ones Astro generates for its own
	// inline scripts, so a built script missing here is genuinely uncovered.
	const pageHashes = new Set(extractCspScriptSrc(html).match(hashRe) ?? []);
	let match;
	scriptRe.lastIndex = 0;
	while ((match = scriptRe.exec(html)) !== null) {
		const attrs = match[1];
		const body = match[2];
		if (attrSrcRe.test(attrs)) continue;
		const typeMatch = attrTypeRe.exec(attrs);
		const type = (typeMatch?.[1] ?? typeMatch?.[2] ?? "").toLowerCase();
		if (nonExecutableTypes.has(type)) continue;
		executableInline += 1;
		const hash = sha256(body);
		if (!foundHashes.has(hash)) {
			foundHashes.set(hash, path.relative(repoRoot, file));
		}
		if (!pageHashes.has(hash) && !uncoveredHashes.has(hash)) {
			uncoveredHashes.set(hash, path.relative(repoRoot, file));
		}
	}
}

// 4. Every configured hash must match at least one built script.
const missing = [...configuredHashes].filter((hash) => !foundHashes.has(hash));

console.log(
	`check-csp-hashes: scanned ${htmlFiles.length} HTML files, ` +
		`${executableInline} executable inline scripts, ` +
		`${foundHashes.size} distinct hashes, ` +
		`${configuredHashes.size} configured hashes, ` +
		`${uncoveredHashes.size} uncovered hashes.`,
);

if (missing.length > 0) {
	for (const hash of missing) {
		console.error(
			`check-csp-hashes: configured hash matched no built script: ${hash}`,
		);
	}
	console.error(
		`check-csp-hashes: ${missing.length} configured hash(es) are stale. ` +
			`Update astro.config.mjs security.csp.scriptDirective.hashes to match ` +
			`the current built scripts.`,
	);
	process.exit(1);
}

// 5. Every built executable inline script must be covered by a hash in the
// script-src directive of the page that emits it.
if (uncoveredHashes.size > 0) {
	for (const [hash, file] of uncoveredHashes) {
		console.error(
			`check-csp-hashes: built inline script has no covering script-src hash: ` +
				`${hash} (for example ${file})`,
		);
	}
	console.error(
		`check-csp-hashes: ${uncoveredHashes.size} built inline script hash(es) ` +
			`are uncovered. Add each to astro.config.mjs ` +
			`security.csp.scriptDirective.hashes.`,
	);
	process.exit(1);
}

console.log(
	"check-csp-hashes: all configured hashes matched, all built inline scripts covered.",
);
