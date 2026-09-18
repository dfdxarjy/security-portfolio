import type { Counts } from "./types";

// Display label for a derived category. Kept identical to the homepage's
// `label(kind)` so the rail and the explorer filters never diverge.
const label = (kind: "linux" | "windows" | "dfir") =>
	kind === "dfir"
		? "DFIR / Sherlock"
		: `${kind[0].toUpperCase()}${kind.slice(1)} machine`;

export default function HomeHero({ counts }: { counts: Counts }) {
	return (
		<section
			className="grid grid-cols-1 gap-8 py-16 lg:grid-cols-12 lg:gap-6 lg:py-24"
			aria-labelledby="portfolio-title"
		>
			<div className="lg:col-span-7">
				<p className="font-mono text-xs font-bold uppercase tracking-[0.12em] text-primary">
					Security case studies
				</p>
				<h1
					id="portfolio-title"
					className="mt-4 max-w-[14ch] text-[clamp(3rem,1.75rem+6.5vw,7.5rem)] leading-[0.92] tracking-[-0.07em]"
				>
					Taktak
				</h1>
				<p className="mt-5 max-w-[68ch] text-pretty text-lg text-muted-foreground">
					I'm interested in cybersecurity, particularly red and blue team
					work, incident investigation, and Windows and Active Directory
					environments. Most of my time goes into building labs, working
					through HTB content, and exploring attacks from both the offensive
					and defensive sides.
				</p>
				<div className="mt-7 flex flex-wrap gap-3">
					<a
						href="#explorer"
						className="inline-flex items-center rounded-md border border-primary bg-primary px-4 py-2 font-bold text-primary-foreground no-underline hover:brightness-110"
					>
						View case studies
					</a>
				</div>
			</div>
			<aside
				className="border-t border-border pt-4 lg:col-span-4 lg:col-start-9 lg:mt-24"
				aria-label="Case studies by category"
			>
				<dl className="grid gap-4">
					<div className="grid gap-0.5">
						<dt className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground">
							All
						</dt>
						<dd className="font-mono text-2xl tabular-nums text-foreground">
							{counts.all}
						</dd>
					</div>
					{(['linux', 'windows', 'dfir'] as const).map((kind) => (
						<div className="grid gap-0.5" key={kind}>
							<dt className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-muted-foreground">
								{label(kind)}
							</dt>
							<dd className="font-mono text-2xl tabular-nums text-foreground">
								{counts[kind]}
							</dd>
						</div>
					))}
				</dl>
			</aside>
		</section>
	);
}
