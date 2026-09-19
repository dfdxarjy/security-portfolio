// Case information rail. Server component. Rendered twice per case page (once
// in the desktop rail, once inside the mobile disclosure), so it carries no id
// attributes at all — duplicate ids would fail the accessibility gate.

import { Fragment } from "react"

type RelatedLink = { href: string; title: string }

type Props = {
	categoryLabel: string
	tools: string[]
	skill?: string
	tags: string[]
	published?: string
	publishedLabel?: string
	updated?: string
	updatedLabel?: string
	evidenceQuality?: string
	related: RelatedLink[]
	editUrl?: string
	reportUrl: string
}

export function CaseInfoPanel({
	categoryLabel,
	tools,
	skill,
	tags,
	published,
	publishedLabel,
	updated,
	updatedLabel,
	evidenceQuality,
	related,
	editUrl,
	reportUrl,
}: Props) {
	const rows: [string, string][] = [["Category", categoryLabel]]
	if (tools.length > 0) rows.push(["Tools", tools.join(", ")])
	if (skill) rows.push(["Skill", skill])
	if (tags.length > 0) rows.push(["Tags", tags.join(", ")])
	if (published) rows.push([publishedLabel ?? "Published", published])
	if (updated) rows.push([updatedLabel ?? "Updated", updated])
	if (evidenceQuality) rows.push(["Evidence", evidenceQuality])

	return (
		<aside
			aria-label="Case information"
			className="flex flex-col gap-5 rounded-[var(--portfolio-radius)] border border-border bg-card p-5 text-left font-mono"
		>
			<dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
				{rows.map(([label, value]) => (
					<Fragment key={label}>
						<dt className="text-[0.68rem] font-bold tracking-[0.06em] text-primary uppercase">{label}</dt>
						<dd className="m-0 text-muted-foreground [overflow-wrap:anywhere]">{value}</dd>
					</Fragment>
				))}
			</dl>

			{related.length > 0 && (
				<nav aria-label="Related cases" className="border-t border-border pt-3.5">
					<h2 className="m-0 mb-2 font-mono text-[0.68rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">
						Related cases
					</h2>
					<ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[0.78rem]">
						{related.map((item) => (
							<li key={item.href}>
								<a
									href={item.href}
									className="inline-flex min-h-6 items-center text-foreground no-underline hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline"
								>
									{item.title}
								</a>
							</li>
						))}
					</ul>
				</nav>
			)}

			<nav aria-label="Provenance" className="border-t border-border pt-3.5">
				<h2 className="m-0 mb-2 font-mono text-[0.68rem] font-bold tracking-[0.08em] text-muted-foreground uppercase">
					Provenance
				</h2>
				<ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[0.78rem]">
					{editUrl && (
						<li>
							<a
								href={editUrl}
								className="inline-flex min-h-6 items-center text-foreground no-underline hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline"
							>
								Edit on GitHub
							</a>
						</li>
					)}
					<li>
						<a
							href={reportUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex min-h-6 items-center text-foreground no-underline hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline"
						>
							Report an error
						</a>
					</li>
				</ul>
			</nav>
		</aside>
	)
}
