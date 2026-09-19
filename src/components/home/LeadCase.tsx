import type { LeadStudy } from "./types";

export default function LeadCase({
	study,
	meta,
}: {
	study: LeadStudy | null;
	meta: string;
}) {
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
					className="portfolio-spotlight relative mt-6 rounded-xl border border-border bg-card p-6"
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
