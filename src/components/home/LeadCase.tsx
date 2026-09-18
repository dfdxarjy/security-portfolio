import type { PointerEvent } from "react";
import type { LeadStudy } from "./types";

export default function LeadCase({
	study,
	meta,
}: {
	study: LeadStudy | null;
	meta: string;
}) {
	// Cursor spotlight: write the pointer position (relative to the card) as
	// custom properties the stylesheet reads, and flip `--lead-spotlight` on so
	// the ring is visible only while a real pointer drives it. Touch is skipped
	// so a tap does not emulate a spotlight that would stick after the finger
	// lifts; without JS the ring stays hidden and the card keeps its border.
	const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
		if (event.pointerType === "touch") return;
		const rect = event.currentTarget.getBoundingClientRect();
		event.currentTarget.style.setProperty(
			"--lead-mx",
			`${event.clientX - rect.left}px`,
		);
		event.currentTarget.style.setProperty(
			"--lead-my",
			`${event.clientY - rect.top}px`,
		);
		event.currentTarget.style.setProperty("--lead-spotlight", "1");
	};
	const handlePointerLeave = (event: PointerEvent<HTMLElement>) => {
		event.currentTarget.style.removeProperty("--lead-mx");
		event.currentTarget.style.removeProperty("--lead-my");
		event.currentTarget.style.removeProperty("--lead-spotlight");
	};
	return (
		<section className="py-12" aria-labelledby="lead-title">
			<div className="max-w-[68ch]">
				<h2
					id="lead-title"
					className="text-3xl tracking-[-0.04em] sm:text-4xl"
				>
					Latest case
				</h2>
				<p className="mt-1 text-muted-foreground">
					The most recent addition.
				</p>
			</div>
			{study && (
				<article
					className="portfolio-lead relative mt-6 rounded-xl border border-border bg-card p-6"
					onPointerMove={handlePointerMove}
					onPointerLeave={handlePointerLeave}
				>
					<p className="font-mono text-[0.72rem] uppercase tracking-[0.12em] text-muted-foreground">
						{study.label} · latest addition
					</p>
					<h3 className="mt-3 max-w-[30ch] text-2xl leading-tight sm:text-3xl">
						<a
							href={study.href}
							className="no-underline hover:text-primary focus-visible:text-primary"
						>
							{study.title}
						</a>
					</h3>
					<p className="mt-4 max-w-[60ch] text-pretty text-muted-foreground">
						{study.description}
					</p>
					{meta && (
						<p className="mt-4 font-mono text-xs text-muted-foreground">
							{meta}
						</p>
					)}
				</article>
			)}
		</section>
	);
}
