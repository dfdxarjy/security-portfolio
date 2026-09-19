import * as React from "react";

import type { Counts, Kind, SortKey, Study } from "./types";
import { KINDS, SORT_KEYS } from "./types";

const PAGE_SIZE = 12;

// Display label for a derived category; mirrors the server-side `label(kind)`.
const label = (kind: Kind) =>
	kind === "dfir"
		? "DFIR / Sherlock"
		: `${kind[0].toUpperCase()}${kind.slice(1)} machine`;

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

const normalizeQuery = (value: string) =>
	value.trim().toLowerCase().replace(/\s+/g, " ");

// Newest: explicit `addedAt` desc (missing values last), stable id tie-break.
// A–Z: title. Category: category then title. All tie-break on id.
function sortStudies(list: Study[], sort: SortKey): Study[] {
	const copy = [...list];
	if (sort === "az") {
		copy.sort(
			(a, b) =>
				collator.compare(a.title, b.title) || a.id.localeCompare(b.id),
		);
	} else if (sort === "category") {
		copy.sort(
			(a, b) =>
				collator.compare(a.category, b.category) ||
				collator.compare(a.title, b.title) ||
				a.id.localeCompare(b.id),
		);
	} else {
		copy.sort((a, b) => {
			if (a.addedAt !== b.addedAt) {
				if (!a.addedAt) return 1;
				if (!b.addedAt) return -1;
				return b.addedAt.localeCompare(a.addedAt);
			}
			return a.id.localeCompare(b.id);
		});
	}
	return copy;
}

interface ExplorerState {
	active: Kind;
	query: string;
	sort: SortKey;
	shown: number;
}

// Defaults: all / empty / newest, first page. The server render and the first
// client render both use this object, so hydration sees identical markup.
const DEFAULT_STATE: ExplorerState = {
	active: "all",
	query: "",
	sort: "newest",
	shown: PAGE_SIZE,
};

// Read the URL into state. Unknown or invalid values fall back to defaults;
// nothing throws. `focus` is the earlier parameter name and is kept as a
// fallback alias; `kind` wins when both are present.
function readUrl(): ExplorerState {
	const params = new URLSearchParams(window.location.search);
	const kindParam = params.get("kind") ?? params.get("focus");
	const active: Kind = KINDS.includes(kindParam as Kind)
		? (kindParam as Kind)
		: "all";
	const sortParam = params.get("sort");
	const sort: SortKey = SORT_KEYS.includes(sortParam as SortKey)
		? (sortParam as SortKey)
		: "newest";
	return { active, query: params.get("q") ?? "", sort, shown: PAGE_SIZE };
}

// Mirror explorer state into the address bar so a view is shareable. Defaults
// are omitted so the plain homepage URL stays plain. `push` is true for
// filter/sort (a new Back entry) and false for typing (replaceState).
function syncUrl(active: Kind, query: string, sort: SortKey, push: boolean) {
	const params = new URLSearchParams();
	if (active !== "all") params.set("kind", active);
	const trimmed = query.trim();
	if (trimmed) params.set("q", trimmed);
	if (sort !== "newest") params.set("sort", sort);
	const searchPart = params.toString();
	const hash = searchPart ? "#explorer" : window.location.hash;
	const url = `${window.location.pathname}${searchPart ? `?${searchPart}` : ""}${hash}`;
	// Idempotent: a duplicate write must not add a history entry that makes
	// Back appear to do nothing.
	const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
	if (url === current) return;
	if (push) history.pushState(null, "", url);
	else history.replaceState(null, "", url);
}

export default function Explorer({ studies }: { studies: Study[] }) {
	const [state, setState] = React.useState<ExplorerState>(DEFAULT_STATE);
	const gridRef = React.useRef<HTMLDivElement>(null);
	const loadMoreRef = React.useRef<HTMLButtonElement>(null);

	const counts = React.useMemo<Counts>(() => {
		const next: Counts = {
			all: studies.length,
			linux: 0,
			windows: 0,
			dfir: 0,
		};
		for (const study of studies) next[study.category] += 1;
		return next;
	}, [studies]);

	// Read the URL once after hydration, then normalise it (alias dropped,
	// defaults omitted). The initial render stays deterministic.
	React.useEffect(() => {
		const next = readUrl();
		setState(next);
		syncUrl(next.active, next.query, next.sort, false);
	}, []);

	// Back/forward: rebuild state and results from the URL.
	React.useEffect(() => {
		const onPop = () => setState(readUrl());
		window.addEventListener("popstate", onPop);
		return () => window.removeEventListener("popstate", onPop);
	}, []);

	const ordered = React.useMemo(
		() => sortStudies(studies, state.sort),
		[studies, state.sort],
	);
	const query = normalizeQuery(state.query);
	const matched = React.useMemo(
		() =>
			ordered.filter(
				(study) =>
					(state.active === "all" || study.category === state.active) &&
					study.search.includes(query),
			),
		[ordered, state.active, query],
	);

	// While browsing (no focus/keyword) reveal pages of 12. An active search or
	// filter reveals every matching card and updates the count.
	const browsing = state.active === "all" && !query;
	const limit = browsing ? state.shown : matched.length;
	const visible = new Set(matched.slice(0, limit).map((study) => study.id));
	const hideLoadMore = !(browsing && matched.length > state.shown);

	// Hiding the button that was just activated would drop focus to <body>;
	// move it to the grid so the user stays in the explorer.
	React.useEffect(() => {
		if (hideLoadMore && document.activeElement === loadMoreRef.current) {
			gridRef.current?.focus();
		}
	}, [hideLoadMore]);

	const setFilter = (kind: Kind) => {
		setState((prev) => ({ ...prev, active: kind, shown: PAGE_SIZE }));
		syncUrl(kind, state.query, state.sort, true);
	};
	const onSearch = (value: string) => {
		setState((prev) => ({ ...prev, query: value }));
		syncUrl(state.active, value, state.sort, false);
	};
	const onSort = (value: SortKey) => {
		setState((prev) => ({ ...prev, sort: value }));
		syncUrl(state.active, state.query, value, true);
	};
	const onLoadMore = () => {
		setState((prev) => ({ ...prev, shown: prev.shown + PAGE_SIZE }));
	};

	return (
		<section
			id="explorer"
			className="border-t border-border py-12"
			aria-labelledby="explorer-title"
		>
			<div className="max-w-[68ch]">
				<h2
					id="explorer-title"
					className="text-3xl tracking-[-0.04em] sm:text-4xl"
				>
					Case-study explorer
				</h2>
				<p
					role="status"
					aria-live="polite"
					aria-atomic="true"
					className="mt-1 font-mono tabular-nums text-muted-foreground"
				>
					{matched.length} results
				</p>
			</div>
			<p className="mt-2 mb-6 text-pretty text-sm text-muted-foreground">
				{studies.length} published case studies. Narrow by focus or keyword.
			</p>

			{/* Search/sort row is separate from the focus filters below. */}
			<div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-2">
				<div className="grid min-w-0 flex-1 basis-64 gap-1.5">
					<label
						htmlFor="explorer-search"
						className="text-sm tracking-[0.02em] text-muted-foreground"
					>
						Search case studies
					</label>
					<input
						id="explorer-search"
						type="search"
						placeholder="Try AD CS, Docker, Kerberos, or event logs"
						value={state.query}
						onChange={(event) => onSearch(event.target.value)}
						className="h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 text-sm text-foreground"
					/>
				</div>
				<div className="grid gap-1.5">
					<label
						htmlFor="explorer-sort"
						className="text-sm tracking-[0.02em] text-muted-foreground"
					>
						Sort by
					</label>
					<select
						id="explorer-sort"
						value={state.sort}
						onChange={(event) => onSort(event.target.value as SortKey)}
						className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground"
					>
						<option value="newest">Newest</option>
						<option value="az">A–Z</option>
						<option value="category">Category</option>
					</select>
				</div>
			</div>

			<div
				className="mb-6 flex flex-wrap items-center gap-3"
				role="group"
				aria-label="Filter case studies"
			>
				<ul className="flex flex-wrap gap-1.5 p-0">
					{KINDS.map((kind) => (
						<li key={kind}>
							<button
								type="button"
								aria-pressed={state.active === kind}
								onClick={() => setFilter(kind)}
								className="cursor-pointer rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground hover:border-primary hover:bg-secondary hover:text-primary aria-pressed:border-primary aria-pressed:bg-secondary aria-pressed:text-primary aria-pressed:underline aria-pressed:underline-offset-4"
							>
								{kind === "all" ? "All" : label(kind)}{" "}
								<span className="tabular-nums">({counts[kind]})</span>
							</button>
						</li>
					))}
				</ul>
			</div>

			<div
				ref={gridRef}
				id="explorer-grid"
				tabIndex={-1}
				className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"
			>
				{ordered.map((study) => (
					<article
						key={study.id}
						className="explorer-card flex min-w-0 flex-col rounded-xl border border-border bg-card p-5"
						hidden={!visible.has(study.id)}
					>
						<span className="font-mono text-xs uppercase tracking-wide text-primary">
							{study.label}
						</span>
						<h3 className="mt-2 text-base leading-snug">
							<a
								href={study.href}
								className="no-underline hover:text-primary focus-visible:text-primary"
							>
								{study.title}
							</a>
						</h3>
						<p className="mt-2 mb-4 text-pretty text-sm text-muted-foreground">
							{study.description}
						</p>
						<div
							className="mt-auto flex flex-wrap gap-1.5 pt-2"
							role="group"
							aria-label="Topics"
						>
							{study.tags.slice(0, 4).map((tag) => (
								<span
									key={tag}
									className="rounded-md bg-secondary px-1.5 py-0.5 text-xs text-primary"
								>
									{tag}
								</span>
							))}
						</div>
					</article>
				))}
			</div>

			<div className="explorer-load-more-wrap mt-6 flex justify-center">
				<button
					ref={loadMoreRef}
					type="button"
					aria-controls="explorer-grid"
					hidden={hideLoadMore}
					onClick={onLoadMore}
					className="cursor-pointer rounded-md border border-primary bg-card px-5 py-2 font-bold text-primary hover:bg-secondary"
				>
					Show 12 more cases
				</button>
			</div>

			{/* No-JS fallback: paging and the button are JS-only, so reveal every
			    card and hide the load-more control. Scoped to the card class so
			    the empty-state element stays hidden. */}
			<noscript
				dangerouslySetInnerHTML={{
					__html:
						"<style>.explorer-card[hidden]{display:flex !important}.explorer-load-more-wrap{display:none !important}</style>",
				}}
			/>

			<p
				hidden={matched.length > 0}
				className="rounded-xl border border-dashed border-border p-8 text-center text-muted-foreground"
			>
				No case studies match. Clear a filter or broaden the search.
			</p>
		</section>
	);
}
