import * as React from "react";
import { Laptop, Moon, Sun } from "lucide-react";

import { Button } from "../ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type Choice = "auto" | "light" | "dark";

let sharedChoice: Choice | null = null;
let systemMedia: MediaQueryList | null = null;
const subscribers = new Set<() => void>();

const OPTIONS: { value: Choice; label: string; Icon: typeof Laptop }[] = [
	{ value: "auto", label: "System", Icon: Laptop },
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

function getChoice(): Choice {
	if (sharedChoice === null) sharedChoice = readStored();
	return sharedChoice;
}

const onSystemChange = () => {
	if (getChoice() === "auto") applyTheme(systemMedia?.matches ? "dark" : "light");
};

function updateSystemListener() {
	if (typeof window === "undefined") return;
	if (getChoice() === "auto" && systemMedia === null) {
		systemMedia = window.matchMedia("(prefers-color-scheme: dark)");
		systemMedia.addEventListener("change", onSystemChange);
	} else if (getChoice() !== "auto" && systemMedia !== null) {
		systemMedia.removeEventListener("change", onSystemChange);
		systemMedia = null;
	}
}

function initializeTheme() {
	updateSystemListener();
	applyTheme(resolve(getChoice()));
}

function setSharedChoice(next: Choice) {
	sharedChoice = next;
	try {
		if (next === "auto") localStorage.removeItem("starlight-theme");
		else localStorage.setItem("starlight-theme", next);
	} catch {}
	updateSystemListener();
	applyTheme(resolve(next));
	for (const subscriber of subscribers) subscriber();
}

export default function ThemeControl() {
	// Initial state is `auto` so the server and first client render agree; the
	// stored choice is synced in an effect, after hydration, to avoid a flash.
	const [choice, setChoice] = React.useState<Choice>("auto");

	React.useEffect(() => {
		initializeTheme();
		const syncChoice = () => setChoice(getChoice());
		syncChoice();
		subscribers.add(syncChoice);
		return () => {
			subscribers.delete(syncChoice);
		};
	}, []);

	const select = React.useCallback((next: Choice) => {
		setSharedChoice(next);
	}, []);

	const current = OPTIONS.find((option) => option.value === choice) ?? OPTIONS[0];

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" aria-label={`Theme: ${current.label}`}>
					<current.Icon aria-hidden="true" data-icon="inline-start" />
					<span>{current.label}</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Theme</DropdownMenuLabel>
				<DropdownMenuRadioGroup value={choice} onValueChange={(value) => select(value as Choice)}>
					{OPTIONS.map(({ value, label, Icon }) => (
						<DropdownMenuRadioItem key={value} value={value}>
							<Icon aria-hidden="true" data-icon="inline-start" />
							{label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
