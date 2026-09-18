import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "./ui/select";
import { cn } from "./lib/utils";

/**
 * Preview theme picker. It drives the real site theme: it writes the shared
 * `starlight-theme` key and sets `document.documentElement.dataset.theme`, so
 * changing it restyles the whole document, not just this route.
 *
 * Contract (matches `src/pages/index.astro`):
 *   - `starlight-theme` absent/empty means auto (follow the OS).
 *   - an explicit choice is stored as `light` / `dark`; auto removes the key.
 *   - exactly one `matchMedia` listener exists, and only while auto.
 */

type Choice = "auto" | "light" | "dark";

const KEY = "starlight-theme";

function readStored(): Choice {
	try {
		const value = localStorage.getItem(KEY);
		return value === "light" || value === "dark" ? value : "auto";
	} catch {
		return "auto";
	}
}

const OPTIONS: { value: Choice; label: string; Icon: typeof Sun }[] = [
	{ value: "auto", label: "Auto", Icon: Laptop },
	{ value: "light", label: "Light", Icon: Sun },
	{ value: "dark", label: "Dark", Icon: Moon },
];

export default function ThemePicker({
	id = "shadcn-theme-picker",
	className,
}: {
	id?: string;
	className?: string;
}) {
	const [choice, setChoice] = useState<Choice>("auto");
	const [mounted, setMounted] = useState(false);

	// Sync from storage on mount only. The pre-paint inline script has already
	// applied the stored theme, so this just aligns the control's displayed value.
	useEffect(() => {
		setChoice(readStored());
		setMounted(true);
	}, []);

	// The only matchMedia listener on this route. The effect reruns when the
	// choice changes, so the cleanup removes the listener both on unmount and
	// immediately on switching to an explicit light/dark choice.
	useEffect(() => {
		if (!mounted) return;
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const apply = () => {
			const theme =
				choice === "auto" ? (media.matches ? "dark" : "light") : choice;
			document.documentElement.dataset.theme = theme;
			document.documentElement.style.colorScheme = theme;
		};
		apply();
		if (choice !== "auto") return;
		const onChange = () => apply();
		media.addEventListener("change", onChange);
		return () => media.removeEventListener("change", onChange);
	}, [choice, mounted]);

	const select = (value: string) => {
		const next = value as Choice;
		try {
			if (next === "auto") localStorage.removeItem(KEY);
			else localStorage.setItem(KEY, next);
		} catch {
			/* storage unavailable — the in-memory choice still applies */
		}
		setChoice(next);
	};

	const ActiveIcon =
		OPTIONS.find((option) => option.value === choice)?.Icon ?? Laptop;

	// The SelectTrigger is the control's single tab stop and carries the
	// accessible name "Theme"; the token in the header row is a separate
	// label-like span, not a second focusable element.
	return (
		<Select value={mounted ? choice : "auto"} onValueChange={select}>
			<SelectTrigger
				id={id}
				aria-label="Theme"
				className={cn("w-[9.5rem]", className)}
			>
				<span className="flex items-center gap-2">
					<ActiveIcon className="size-4 shrink-0" aria-hidden="true" />
					<SelectValue />
				</span>
			</SelectTrigger>
			<SelectContent>
				{OPTIONS.map(({ value, label, Icon }) => (
					<SelectItem key={value} value={value}>
						<Icon className="size-4" aria-hidden="true" />
						{label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
