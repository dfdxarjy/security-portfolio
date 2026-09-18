import { useEffect, useId, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "./ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { Separator } from "./ui/separator";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "./lib/utils";

/**
 * Preview-only showcase. Renders the same shadcn component set twice: once with
 * stock neutral tokens and once inside a `[data-shadcn-warm]` wrapper that
 * remaps the tokens to the site palette. Then applies the warm layer to
 * portfolio-shaped furniture so the owner judges it against real content.
 *
 * All values below are plausible demo data. This is not a case study and no
 * private path, secret or flag appears here.
 */

const BUTTON_VARIANTS = [
	"default",
	"secondary",
	"destructive",
	"outline",
	"ghost",
	"link",
] as const;
const BUTTON_SIZES = ["sm", "default", "lg", "icon"] as const;
const BADGE_VARIANTS = ["default", "secondary", "destructive", "outline"] as const;

const DEMO_ROWS = [
	{
		category: "Windows machine",
		title: "Certificate template abuse",
		difficulty: "Hard",
		tags: ["active-directory", "adcs"],
	},
	{
		category: "Linux machine",
		title: "Container breakout to root",
		difficulty: "Medium",
		tags: ["docker", "privilege-escalation"],
	},
	{
		category: "DFIR / Sherlock",
		title: "Kerberos ticket correlation",
		difficulty: "Easy",
		tags: ["dfir", "kerberos"],
	},
];

function titleCase(value: string): string {
	return value[0].toUpperCase() + value.slice(1);
}

/** Reads the site's applied theme from the root and tracks later changes. */
function useSiteDark(): boolean {
	const [dark, setDark] = useState(false);
	useEffect(() => {
		const root = document.documentElement;
		const read = () => setDark(root.dataset.theme === "dark");
		read();
		const observer = new MutationObserver(read);
		observer.observe(root, {
			attributes: true,
			attributeFilter: ["data-theme"],
		});
		return () => observer.disconnect();
	}, []);
	return dark;
}

/** One full pass of the frozen component set, used on both sides. */
function ComponentSet() {
	const uid = useId();
	return (
		<div className="space-y-6">
			<div className="space-y-2">
				<p className="text-sm font-medium">Buttons — variants</p>
				<div className="flex flex-wrap items-center gap-2">
					{BUTTON_VARIANTS.map((variant) => (
						<Button key={variant} variant={variant}>
							{titleCase(variant)}
						</Button>
					))}
				</div>
				<p className="text-sm font-medium">Buttons — sizes</p>
				<div className="flex flex-wrap items-center gap-2">
					{BUTTON_SIZES.map((size) => (
						<Button
							key={size}
							size={size}
							variant="outline"
							aria-label={size === "icon" ? "Add item" : undefined}
						>
							{size === "icon" ? (
								<Plus className="size-4" aria-hidden="true" />
							) : (
								titleCase(size)
							)}
						</Button>
					))}
				</div>
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium">Badges</p>
				<div className="flex flex-wrap items-center gap-2">
					{BADGE_VARIANTS.map((variant) => (
						<Badge key={variant} variant={variant}>
							{titleCase(variant)}
						</Badge>
					))}
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Card composite</CardTitle>
					<CardDescription>
						Header, description, action, content and footer together.
					</CardDescription>
					<CardAction>
						<Badge variant="secondary">preview</Badge>
					</CardAction>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						Card surfaces resolve from the token layer, so the same markup
						renders stock or warm without a rebuild.
					</p>
				</CardContent>
				<CardFooter className="gap-2">
					<Button size="sm">Primary</Button>
					<Button size="sm" variant="ghost">
						Cancel
					</Button>
				</CardFooter>
			</Card>

			<div className="space-y-2">
				<label htmlFor={`${uid}-search`} className="text-sm font-medium">
					Input with a label
				</label>
				<Input id={`${uid}-search`} placeholder="Filter cases" />
			</div>

			<div className="space-y-2">
				<p className="text-sm font-medium">Openable select</p>
				<Select>
					<SelectTrigger className="w-[13rem]" aria-label="Category">
						<SelectValue placeholder="Choose a category" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							<SelectLabel>Category</SelectLabel>
							<SelectItem value="linux">Linux machine</SelectItem>
							<SelectItem value="windows">Windows machine</SelectItem>
							<SelectItem value="dfir">DFIR / Sherlock</SelectItem>
						</SelectGroup>
					</SelectContent>
				</Select>
			</div>

			<Tabs defaultValue="overview">
				<TabsList>
					<TabsTrigger value="overview">Overview</TabsTrigger>
					<TabsTrigger value="evidence">Evidence</TabsTrigger>
					<TabsTrigger value="notes">Notes</TabsTrigger>
				</TabsList>
				<TabsContent value="overview">
					<p className="text-sm text-muted-foreground">
						First pane. Tabs keep their own roving focus.
					</p>
				</TabsContent>
				<TabsContent value="evidence">
					<p className="text-sm text-muted-foreground">Second pane.</p>
				</TabsContent>
				<TabsContent value="notes">
					<p className="text-sm text-muted-foreground">Third pane.</p>
				</TabsContent>
			</Tabs>

			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button variant="outline">
						Actions
						<ChevronDown className="size-4" aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					<DropdownMenuLabel>Case actions</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>Open</DropdownMenuItem>
					<DropdownMenuItem>Copy link</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<Separator />

			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Category</TableHead>
						<TableHead>Difficulty</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{DEMO_ROWS.slice(0, 2).map((row) => (
						<TableRow key={row.title}>
							<TableCell className="text-muted-foreground">
								{row.category}
							</TableCell>
							<TableCell>
								<Badge variant="outline">{row.difficulty}</Badge>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/** Portfolio-shaped furniture, rendered inside the warm wrapper only. */
function Furniture() {
	const uid = useId();
	return (
		<div className="space-y-6">
			<Card className="max-w-3xl">
				<CardHeader>
					<CardTitle>Portfolio case card</CardTitle>
					<CardDescription>
						The same card primitives carrying case-study metadata.
					</CardDescription>
					<CardAction>
						<Badge variant="outline">Hard</Badge>
					</CardAction>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-sm text-muted-foreground">
						Unauthenticated enumeration through a misconfigured certificate
						template, evaluated as a portfolio card rather than a widget.
					</p>
					<div className="flex flex-wrap gap-2">
						<Badge variant="secondary">windows</Badge>
						<Badge variant="secondary">active-directory</Badge>
						<Badge variant="secondary">adcs</Badge>
					</div>
					<Separator />
					<dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-sm">
						<dt className="text-muted-foreground">Tools</dt>
						<dd className="font-mono text-xs">certipy · impacket</dd>
						<dt className="text-muted-foreground">Skill</dt>
						<dd>AD certificate abuse</dd>
						<dt className="text-muted-foreground">Outcome</dt>
						<dd>Certificate-authenticated administrative access</dd>
					</dl>
				</CardContent>
				<CardFooter>
					<a
						href="#preview-main"
						className={buttonVariants({ variant: "outline", size: "sm" })}
					>
						Read case
					</a>
				</CardFooter>
			</Card>

			<div className="space-y-3">
				<h3 className="text-base font-semibold">Explorer filter bar</h3>
				<div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
					<div className="space-y-2 lg:flex-1">
						<label
							htmlFor={`${uid}-explorer-search`}
							className="text-sm font-medium"
						>
							Search cases
						</label>
						<Input
							id={`${uid}-explorer-search`}
							placeholder="Title, tag, or tool"
						/>
					</div>
					<Select>
						<SelectTrigger className="w-[11rem]" aria-label="Kind">
							<SelectValue placeholder="All kinds" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="windows">Windows machine</SelectItem>
							<SelectItem value="linux">Linux machine</SelectItem>
							<SelectItem value="dfir">DFIR / Sherlock</SelectItem>
						</SelectContent>
					</Select>
					<Select>
						<SelectTrigger className="w-[11rem]" aria-label="Sort">
							<SelectValue placeholder="Newest first" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="newest">Newest first</SelectItem>
							<SelectItem value="title">Title A–Z</SelectItem>
						</SelectContent>
					</Select>
					<Tabs defaultValue="all">
						<TabsList>
							<TabsTrigger value="all">All</TabsTrigger>
							<TabsTrigger value="windows">Windows</TabsTrigger>
							<TabsTrigger value="linux">Linux</TabsTrigger>
							<TabsTrigger value="dfir">DFIR</TabsTrigger>
						</TabsList>
					</Tabs>
				</div>
			</div>

			<div className="space-y-3">
				<h3 className="text-base font-semibold">Results table</h3>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Category</TableHead>
							<TableHead>Title</TableHead>
							<TableHead>Difficulty</TableHead>
							<TableHead>Tags</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{DEMO_ROWS.map((row) => (
							<TableRow key={row.title}>
								<TableCell className="text-muted-foreground">
									{row.category}
								</TableCell>
								<TableCell className="font-medium">{row.title}</TableCell>
								<TableCell>
									<Badge variant="outline">{row.difficulty}</Badge>
								</TableCell>
								<TableCell>
									<div className="flex flex-wrap gap-1">
										{row.tags.map((tag) => (
											<Badge key={tag} variant="secondary">
												{tag}
											</Badge>
										))}
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<Card className="max-w-sm">
				<CardHeader>
					<CardTitle>Case info panel</CardTitle>
					<CardDescription>
						The rail a case page would show beside the article.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3 text-sm">
					<dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1">
						<dt className="text-muted-foreground">Category</dt>
						<dd>Windows machine</dd>
						<dt className="text-muted-foreground">Tools</dt>
						<dd className="font-mono text-xs">certipy · impacket</dd>
						<dt className="text-muted-foreground">Skill</dt>
						<dd>AD certificate abuse</dd>
						<dt className="text-muted-foreground">Tags</dt>
						<dd>active-directory, adcs</dd>
					</dl>
					<Separator />
					<div className="flex flex-wrap gap-2">
						<a
							href="#preview-main"
							className={buttonVariants({ variant: "outline", size: "sm" })}
						>
							Edit on GitHub
						</a>
						<a
							href="#preview-main"
							className={buttonVariants({ variant: "ghost", size: "sm" })}
						>
							Report an error
						</a>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}

export default function Showcase() {
	const dark = useSiteDark();
	return (
		<div className="space-y-10">
			<section aria-labelledby="shadcn-compare">
				<h2 id="shadcn-compare" className="text-xl font-semibold">
					Stock shadcn vs this site's palette
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Identical markup on both sides. Only the token wrapper differs.
				</p>
				<div className="mt-5 grid gap-6 lg:grid-cols-2">
					<div
						className={cn(
							"rounded-xl border border-border bg-background p-5 text-foreground",
							dark && "dark",
						)}
					>
						<h3 className="text-base font-semibold">
							Stock shadcn (neutral tokens)
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Unmodified upstream defaults, including shadow and radius.
						</p>
						<div className="mt-5">
							<ComponentSet />
						</div>
					</div>
					<div
						data-shadcn-warm=""
						className="rounded-xl border border-border bg-background p-5 text-foreground"
					>
						<h3 className="text-base font-semibold">
							This site's palette (warm tokens)
						</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Same components with the site's surface, ink, accent and radius.
						</p>
						<div className="mt-5">
							<ComponentSet />
						</div>
					</div>
				</div>
			</section>

			<section aria-labelledby="shadcn-furniture">
				<h2 id="shadcn-furniture" className="text-xl font-semibold">
					Applied to portfolio furniture
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Warm tokens only, judging real shapes instead of abstract widgets.
				</p>
				<div
					data-shadcn-warm=""
					className="mt-5 rounded-xl border border-border bg-background p-5 text-foreground"
				>
					<Furniture />
				</div>
			</section>
		</div>
	);
}
