// Documentation page meta: the last-updated value. Server component. The date
// is rendered exactly as given — never re-formatted here.

export function DocsMeta({ lastUpdated }: { lastUpdated?: string }) {
	return (
		<div className="mt-12 flex flex-wrap items-baseline justify-between gap-x-12 gap-y-3 font-mono text-xs text-muted-foreground">
			{lastUpdated ? <p className="m-0">Last updated: {lastUpdated}</p> : null}
		</div>
	)
}
