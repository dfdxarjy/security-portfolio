import type { Counts } from "./types";

interface Card {
	kind: "all" | "linux" | "windows" | "dfir";
	href: string;
	label: string;
	description: string;
}

const CARDS: Card[] = [
	{
		kind: "linux",
		href: "/case-studies/htb/machines/linux/",
		label: "Linux machine",
		description:
			"Web and service exploitation, credential recovery, and local privilege escalation.",
	},
	{
		kind: "windows",
		href: "/case-studies/htb/machines/windows/",
		label: "Windows machine",
		description:
			"Active Directory attack paths, delegation, and domain escalation.",
	},
	{
		kind: "dfir",
		href: "/case-studies/htb/sherlocks/dfir/",
		label: "DFIR / Sherlock",
		description:
			"Timeline reconstruction, log analysis, and persistence.",
	},
	{
		kind: "all",
		href: "/case-studies/",
		label: "All case studies",
		description:
			"Searchable, filterable library of reviewed security investigations and methodologies.",
	},
];

export default function FocusCards({ counts }: { counts: Counts }) {
	return (
		<section className="py-12" aria-labelledby="focus-title">
			<div className="max-w-[68ch]">
				<h2
					id="focus-title"
					className="text-3xl tracking-[-0.04em] sm:text-4xl"
				>
					Pick the kind of problem
				</h2>
				<p className="mt-1 text-muted-foreground">
					AD escalation, Linux footholds, or incident reconstruction.
				</p>
			</div>
			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{CARDS.map((card) => (
					<a
						key={card.kind}
						href={card.href}
						className="block min-w-0 rounded-xl border border-input bg-card p-5 no-underline hover:border-primary focus-visible:border-primary"
					>
						<span className="font-mono text-3xl font-bold tabular-nums text-primary">
							{counts[card.kind]}
						</span>
						<h3 className="mt-3 text-lg">{card.label}</h3>
						<p className="mt-1 text-pretty text-sm text-muted-foreground">
							{card.description}
						</p>
					</a>
				))}
			</div>
		</section>
	);
}
