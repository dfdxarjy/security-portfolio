import * as React from "react";
import { Menu, X } from "lucide-react";

import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import SearchDialog from "./SearchDialog";
import ThemeControl from "./ThemeControl";

const LINKS = [
	{ href: "/case-studies/", label: "Case Studies" },
	{ href: "/prolabs/", label: "Pro Labs" },
	{ href: "/method/", label: "Method" },
];

function isCurrent(currentPath: string, href: string): boolean {
	if (currentPath === href) return true;
	return currentPath.startsWith(href) && currentPath.length > href.length;
}

export default function SiteHeader({ currentPath }: { currentPath: string }) {
	const [menuOpen, setMenuOpen] = React.useState(false);
	const [searchOpen, setSearchOpen] = React.useState(false);
	const closeSearch = React.useCallback(() => setSearchOpen(false), []);

	return (
		<header className="portfolio-header sticky top-0 z-10 border-b border-border bg-background">
			<div className="mx-auto flex w-full max-w-[var(--portfolio-max-width)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2 lg:px-8">
				<a
					href="/"
					aria-current={currentPath === "/" ? "page" : undefined}
					className="brand-lockup portfolio-brand"
				>
					<span className="brand-wordmark" translate="no">
						taktak.hu
					</span>
				</a>
				<nav
					id="site-nav"
					aria-label="Primary navigation"
					className={cn(
						"order-last w-full flex-col gap-2 text-sm md:order-none md:w-auto md:flex-row md:items-center md:gap-4",
						menuOpen ? "flex" : "hidden md:flex",
					)}>
					{LINKS.map(({ href, label }) => (
						<a
							key={href}
							href={href}
							aria-current={isCurrent(currentPath, href) ? "page" : undefined}
							className="inline-flex min-h-6 items-center text-muted-foreground no-underline hover:text-foreground aria-[current=page]:text-foreground">
							{label}
						</a>
					))}
				</nav>
				<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
					<Button
						variant="outline"
						size="sm"
						aria-label="Search"
						className="shadow-none"
						onClick={() => setSearchOpen(true)}>
						Search
					</Button>
					<ThemeControl />
					<Button
						variant="ghost"
						size="icon-sm"
						className="shadow-none md:hidden"
						aria-expanded={menuOpen}
						aria-controls="site-nav"
						aria-label={menuOpen ? "Close menu" : "Open menu"}
						onClick={() => setMenuOpen((value) => !value)}>
						{menuOpen ? (
							<X aria-hidden="true" />
						) : (
							<Menu aria-hidden="true" />
						)}
					</Button>
				</div>
				<SearchDialog open={searchOpen} onClose={closeSearch} />
			</div>
		</header>
	);
}
