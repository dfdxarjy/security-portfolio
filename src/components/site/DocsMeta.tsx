// Documentation page meta: the edit link and the last-updated value. Server
// component. The date is rendered exactly as given — never re-formatted here.

export function DocsMeta({ editUrl, lastUpdated }: { editUrl?: string; lastUpdated?: string }) {
	return (
		<div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-12 gap-y-3 font-mono text-xs text-muted-foreground">
			{editUrl ? (
				<a
					href={editUrl}
					className="rounded-[var(--portfolio-radius-sm)] px-1 no-underline hover:text-primary hover:underline focus-visible:text-primary focus-visible:underline"
				>
					Edit page
				</a>
			) : (
				<span />
			)}
			{lastUpdated ? <p className="m-0">Last updated: {lastUpdated}</p> : null}
		</div>
	)
}
