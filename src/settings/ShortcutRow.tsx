import { useEffect, useState } from "react";
import { RotateCcw, X } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
	SHORTCUT_ACTIONS,
	SHORTCUT_DEFAULTS,
	chordFor,
	chordFromEvent,
	conflictOf,
	parseShortcuts,
	type ShortcutAction
} from "../shortcuts";

/** Keycap chips for a chord ("Ctrl+Alt+N" → Ctrl · Alt · N). */
export function Keys({ chord }: { chord: string }) {
	if (!chord) return <span className="shortcut-none">Not set</span>;
	return (
		<span className="shortcut-keys">
			{chord.split("+").map((k, i) => (
				<kbd key={i}>{k}</kbd>
			))}
		</span>
	);
}

const MODS = ["Control", "Alt", "Shift", "Meta", "AltGraph"];
const save = (next: Record<string, string>) => {
	localStorage.setItem("bloom-shortcuts", JSON.stringify(next));
	invoke("save_setting", { key: "bloom-shortcuts", value: JSON.stringify(next) }).catch(() => {});
};

/** One shortcut, set where the thing it triggers is set. Click the keys, then
 *  press the combination (Ctrl and/or Alt, plus Shift if you like, with a
 *  letter, number, F-key or Space). Esc cancels, Backspace clears. Global
 *  shortcuts pause while recording. */
export function ShortcutRow({ action, label, desc }: { action: string; label: string; desc?: string }) {
	const [, tick] = useState(0);
	const [recording, setRecording] = useState(false);
	const [hint, setHint] = useState("");
	const [pending, setPending] = useState<{ chord: string; other: ShortcutAction } | null>(null);
	const saved = parseShortcuts(localStorage.getItem("bloom-shortcuts"));
	const chord = chordFor(saved, action);

	const set = (value: string, replace?: string) => {
		const next = { ...parseShortcuts(localStorage.getItem("bloom-shortcuts")), [action]: value };
		if (replace) next[replace] = "";
		if (value === (SHORTCUT_DEFAULTS[action] ?? "")) delete next[action];
		save(next);
		tick((n) => n + 1);
	};

	useEffect(() => {
		invoke("set_shortcuts_paused", { paused: recording }).catch(() => {});
		if (!recording) return;
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Escape") return setRecording(false);
			if (e.key === "Backspace" || e.key === "Delete") {
				set("");
				return setRecording(false);
			}
			const found = chordFromEvent(e);
			if (!found) {
				const held = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift"].filter(Boolean);
				setHint(
					MODS.includes(e.key) || !held.length
						? held.length
							? `${held.join(" + ")} + … press the last key`
							: "Hold Ctrl and/or Alt, then press a letter, number or F-key"
						: "Add Ctrl or Alt: Shift alone would break normal typing"
				);
				return;
			}
			const other = conflictOf(parseShortcuts(localStorage.getItem("bloom-shortcuts")), action, found);
			if (other) setPending({ chord: found, other });
			else set(found);
			setRecording(false);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [recording]);
	useEffect(() => () => void invoke("set_shortcuts_paused", { paused: false }).catch(() => {}), []);

	const changed = action in saved;
	return (
		<>
			<div className="setting-item shortcut-row">
				<div className="setting-info">
					<span className="setting-label">{label}</span>
					{desc && <span className="setting-desc">{desc}</span>}
					{pending && (
						<span className="shortcut-conflict">
							Already used by {pending.other.label}.{" "}
							<button
								type="button"
								onClick={() => {
									set(pending.chord, pending.other.id);
									setPending(null);
								}}
							>
								Replace
							</button>
							<button type="button" onClick={() => setPending(null)}>
								Cancel
							</button>
						</span>
					)}
					{recording && hint && <span className="shortcut-hint">{hint}</span>}
				</div>
				<div className="shortcut-controls">
					<button
						type="button"
						className={`shortcut-record${recording ? " recording" : ""}`}
						aria-label={`${label}: ${chord || "not set"}. Click to change`}
						onClick={() => {
							setHint("");
							setPending(null);
							setRecording((r) => !r);
						}}
					>
						{recording ? <span className="shortcut-listening">Press keys…</span> : <Keys chord={chord} />}
					</button>
					{changed ? (
						<button
							type="button"
							className="shortcut-icon"
							title={`Back to ${SHORTCUT_DEFAULTS[action] ?? "not set"}`}
							aria-label={`Reset ${label}`}
							onClick={() => {
								const next = { ...saved };
								delete next[action];
								save(next);
								tick((n) => n + 1);
							}}
						>
							<RotateCcw size={13} />
						</button>
					) : chord ? (
						<button type="button" className="shortcut-icon" title="Clear" aria-label={`Clear ${label}`} onClick={() => set("")}>
							<X size={13} />
						</button>
					) : (
						<span className="shortcut-icon" aria-hidden />
					)}
				</div>
			</div>
		</>
	);
}

export { SHORTCUT_ACTIONS };
