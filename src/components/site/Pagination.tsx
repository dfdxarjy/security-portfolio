// Prev/next pagination. Server component: renders nothing when there is no
// neighbour. Both labels stay visible (direction plus destination title) so
// each link has a discernible name.

type PageLink = { href: string; title: string }

export function Pagination({ prev, next }: { prev?: PageLink; next?: PageLink }) {
	if (!prev && !next) return null
	return (
		<nav
			aria-label="Pagination"
			className="mt-12 flex flex-wrap items-start justify-between gap-4 border-t border-border pt-6"
		>
			{prev ? (
				<a
					rel="prev"
					href={prev.href}
					className="group flex max-w-[45%] flex-col gap-0.5 rounded-[var(--portfolio-radius-sm)] px-2 py-1 no-underline"
				>
					<span className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
						Previous
					</span>
					<span className="text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">
						{prev.title}
					</span>
				</a>
			) : (
				<span />
			)}
			{next ? (
				<a
					rel="next"
					href={next.href}
					className="group ms-auto flex max-w-[45%] flex-col items-end gap-0.5 rounded-[var(--portfolio-radius-sm)] px-2 py-1 text-end no-underline"
				>
					<span className="font-mono text-[0.68rem] tracking-[0.06em] text-muted-foreground uppercase">
						Next
					</span>
					<span className="text-sm font-medium text-foreground group-hover:text-primary group-hover:underline">
						{next.title}
					</span>
				</a>
			) : (
				<span />
			)}
		</nav>
	)
}
