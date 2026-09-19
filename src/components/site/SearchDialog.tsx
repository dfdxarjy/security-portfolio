import * as React from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

type Entry = {
	href: string;
	title?: string;
	description?: string;
	tags?: string[];
	tools?: string[];
	category?: string;
	kind?: string;
	label?: string;
};

type Status = "idle" | "loading" | "ready" | "error";

function fieldValues(entry: Entry): string[] {
	return [
		entry.title,
		entry.description,
		entry.category,
		entry.label,
		...(entry.tags ?? []),
		...(entry.tools ?? []),
	].filter((value): value is string => typeof value === "string");
}

export default function SearchDialog({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const dialogRef = React.useRef<HTMLDialogElement>(null);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const loadedRef = React.useRef(false);
	const [entries, setEntries] = React.useState<Entry[]>([]);
	const [status, setStatus] = React.useState<Status>("idle");
	const [query, setQuery] = React.useState("");

	// Drive the native dialog from the `open` prop.
	React.useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
			inputRef.current?.focus();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	// Native close (Escape, close(), form method=dialog) bubbles to the caller.
	React.useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		const handleClose = () => onClose();
		dialog.addEventListener("close", handleClose);
		return () => dialog.removeEventListener("close", handleClose);
	}, [onClose]);

	// Fetch the index once, on the first open.
	React.useEffect(() => {
		if (!open || loadedRef.current) return;
		loadedRef.current = true;
		setStatus("loading");
		fetch("/search-index.json")
			.then((response) => {
				if (!response.ok) throw new Error(`HTTP ${response.status}`);
				return response.json();
			})
			.then((data: unknown) => {
				const list = Array.isArray(data)
					? data
					: ((data as { entries?: Entry[] } | null)?.entries ?? []);
				setEntries(Array.isArray(list) ? (list as Entry[]) : []);
				setStatus("ready");
			})
			.catch(() => {
				loadedRef.current = false;
				setStatus("error");
			});
	}, [open]);

	const trimmed = query.trim().toLowerCase();
	const results = React.useMemo(() => {
		if (!trimmed) return [];
		return entries
			.filter((entry) =>
				fieldValues(entry).some((value) =>
					value.toLowerCase().includes(trimmed),
				),
			)
			.slice(0, 20);
	}, [entries, trimmed]);

	let message = "Start typing to search.";
	if (status === "loading") {
		message = "Loading search index…";
	} else if (status === "error") {
		message = "Search is unavailable right now.";
	} else if (trimmed) {
		message =
			results.length > 0
				? `${results.length} result${results.length === 1 ? "" : "s"}.`
				: `No results for “${query.trim()}”.`;
	}

	const handleBackdropClick = (event: React.MouseEvent<HTMLDialogElement>) => {
		if (event.target === dialogRef.current) dialogRef.current?.close();
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
		if (event.key === "Escape") {
			event.preventDefault();
			dialogRef.current?.close();
		}
	};

	return (
		<dialog
			ref={dialogRef}
			aria-labelledby="search-dialog-title"
			onClick={handleBackdropClick}
			onKeyDown={handleKeyDown}
			className="fixed inset-0 m-auto h-fit max-h-[85dvh] w-[min(40rem,90vw)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-background p-0 text-foreground shadow-none backdrop:bg-foreground/40">
			<div className="flex flex-col gap-3 p-4">
				<div className="flex items-center justify-between gap-3">
					<h2 id="search-dialog-title" className="text-sm font-semibold">Search the site</h2>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="shadow-none"
						onClick={() => dialogRef.current?.close()}>
						Close
					</Button>
				</div>
				<Input
					ref={inputRef}
					type="search"
					aria-label="Search query"
					className="shadow-none"
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search case studies, credentials, and more…"
				/>
				<p role="status" aria-live="polite" className="text-xs text-muted-foreground">
					{message}
				</p>
				{status === "ready" && results.length > 0 && (
					<ul className="flex flex-col gap-1">
						{results.map((entry) => (
							<li key={entry.href}>
								<a
									href={entry.href}
									onClick={() => dialogRef.current?.close()}
									className="block rounded-sm px-2 py-1.5 hover:bg-accent hover:text-accent-foreground">
									<span className="flex items-baseline justify-between gap-3">
										<span className="truncate text-sm">{entry.title ?? entry.href}</span>
										{entry.label && (
											<span className="shrink-0 font-mono text-[0.7rem] uppercase tracking-wide text-muted-foreground">
												{entry.label}
											</span>
										)}
									</span>
									{entry.description && (
										<span className="mt-0.5 block text-xs text-muted-foreground">
											{entry.description}
										</span>
									)}
								</a>
							</li>
						))}
					</ul>
				)}
			</div>
		</dialog>
	);
}
