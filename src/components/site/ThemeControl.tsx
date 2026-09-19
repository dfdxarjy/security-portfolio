import * as React from "react";
import { Laptop, Moon, Sun } from "lucide-react";

import { cn } from "../../lib/utils";

type Choice = "auto" | "light" | "dark";

const OPTIONS: { value: Choice; label: string; Icon: typeof Laptop }[] = [
	{ value: "auto", label: "Auto", Icon: Laptop },
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "dark", label: "Dark", Icon: Moon },
];

function readStored(): Choice {
	try {
		const value = localStorage.getItem("starlight-theme");
		if (value === "light" || value === "dark") return value;
	} catch {}
	return "auto";
}

function resolve(choice: Choice): "light" | "dark" {
	if (choice === "light" || choice === "dark") return choice;
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function applyTheme(theme: "light" | "dark") {
	document.documentElement.dataset.theme = theme;
	document.documentElement.style.colorScheme = theme;
}

export default function ThemeControl() {
	// Initial state is `auto` so the server and first client render agree; the
	// stored choice is synced in an effect, after hydration, to avoid a flash.
	const [choice, setChoice] = React.useState<Choice>("auto");

	React.useEffect(() => {
		setChoice(readStored());
	}, []);

	const select = React.useCallback((next: Choice) => {
		setChoice(next);
		applyTheme(resolve(next));
		try {
			if (next === "auto") {
				localStorage.removeItem("starlight-theme");
			} else {
				localStorage.setItem("starlight-theme", next);
			}
		} catch {}
	}, []);

	// Exactly one system listener, alive only while the choice is auto.
	React.useEffect(() => {
		if (choice !== "auto") return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const onChange = () => applyTheme(media.matches ? "dark" : "light");
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [choice]);

	return (
		<div
			role="group"
			aria-label="Theme"
			className="flex items-center gap-0.5 rounded-md border border-border p-0.5">
			{OPTIONS.map(({ value, label, Icon }) => (
				<button
					key={value}
					type="button"
					aria-pressed={choice === value}
					onClick={() => select(value)}
					className={cn(
						"inline-flex min-h-6 items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground",
						choice === value && "bg-secondary text-secondary-foreground",
					)}>
					<Icon aria-hidden="true" className="size-3.5" />
					<span className="sr-only md:not-sr-only">{label}</span>
				</button>
			))}
		</div>
	);
}
