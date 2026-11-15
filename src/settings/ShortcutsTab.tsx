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

type Save = (key: string, value: string | null) => Promise<boolean>;

/** Keycap chips for a chord ("Ctrl+Alt+N" → Ctrl · Alt · N). */
function Keys({ chord }: { chord: string }) {
	if (!chord) return <span className="shortcut-none">Not set</span>;
	return (
		<span className="shortcut-keys">
			{chord.split("+").map((k, i) => (
				<kbd key={i}>{k}</kbd>
			))}
		</span>
	);
}

/** Settings › Shortcuts: every action, by group. Click a row's keys and press
 *  Ctrl+Alt (+Shift) + a key; Esc cancels, Backspace clears. Global
 *  shortcuts pause while recording. */
export function ShortcutsTab({ saveSetting }: { saveSetting: Save }) {
	const [saved, setSaved] = useState(() => parseShortcuts(localStorage.getItem("bloom-shortcuts")));
	const [recording, setRecording] = useState<string | null>(null);
	const [pending, setPending] = useState<{ action: string; chord: string; other: ShortcutAction } | null>(null);
	const [hint, setHint] = useState("");

	const store = (next: Record<string, string>) => {
		setSaved(next);
		saveSetting("bloom-shortcuts", JSON.stringify(next));
	};
	const set = (action: string, chord: string, replace?: string) => {
		const next = { ...saved, [action]: chord };
		if (replace) next[replace] = "";
		// Back to its default: drop the entry so a future default change applies.
		if (chord === (SHORTCUT_DEFAULTS[action] ?? "")) delete next[action];
		store(next);
	};

	useEffect(() => {
		invoke("set_shortcuts_paused", { paused: recording !== null }).catch(() => {});
		if (!recording) return;
		const onKey = (e: KeyboardEvent) => {
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Escape") return setRecording(null);
			if (e.key === "Backspace" || e.key === "Delete") {
				set(recording, "");
				return setRecording(null);
			}
			const chord = chordFromEvent(e);
			if (!chord) {
				if (!["Control", "Alt", "Shift", "Meta", "AltGraph"].includes(e.key)) {
					setHint("Shortcuts use Ctrl + Alt (and Shift if you like) with a letter, number or F-key");
				}
				return;
			}
			const other = conflictOf(saved, recording, chord);
			if (other) setPending({ action: recording, chord, other });
			else set(recording, chord);
			setRecording(null);
		};
		window.addEventListener("keydown", onKey, true);
		return () => window.removeEventListener("keydown", onKey, true);
	}, [recording, saved]);
	useEffect(() => () => void invoke("set_shortcuts_paused", { paused: false }).catch(() => {}), []);

	const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];
	return (
		<>
			<p className="shortcuts-intro">
				Every shortcut is <kbd>Ctrl</kbd> + <kbd>Alt</kbd> (and <kbd>Shift</kbd> if you like) with a key. The right Alt
				key (AltGr) never triggers one, so typing € or @ keeps working.
			</p>
			{groups.map((group) => (
				<div key={group}>
					<div className="setting-group-label">{group}</div>
					<div className="setting-group">
						{SHORTCUT_ACTIONS.filter((a) => a.group === group).map((a, i, list) => {
							const chord = chordFor(saved, a.id);
							const changed = a.id in saved;
							const isRec = recording === a.id;
							const isPending = pending?.action === a.id;
							return (
								<div key={a.id} className={`setting-item shortcut-row${i < list.length - 1 ? "" : " last"}`}>
									<div className="setting-info">
										<span className="setting-label">{a.label}</span>
										{isPending && (
											<span className="shortcut-conflict">
												Already used by {pending.other.label}.{" "}
												<button
													type="button"
													onClick={() => {
														set(pending.action, pending.chord, pending.other.id);
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
										{isRec && hint && <span className="shortcut-hint">{hint}</span>}
									</div>
									<div className="shortcut-controls">
										<button
											type="button"
											className={`shortcut-record${isRec ? " recording" : ""}`}
											aria-label={`${a.label}: ${chord || "not set"}. Click to change`}
											onClick={() => {
												setHint("");
												setPending(null);
												setRecording(isRec ? null : a.id);
											}}
										>
											{isRec ? <span className="shortcut-listening">Press keys…</span> : <Keys chord={chord} />}
										</button>
										{changed ? (
											<button
												type="button"
												className="shortcut-icon"
												title={`Back to ${SHORTCUT_DEFAULTS[a.id] ?? "not set"}`}
												aria-label={`Reset ${a.label}`}
												onClick={() => {
													const next = { ...saved };
													delete next[a.id];
													store(next);
												}}
											>
												<RotateCcw size={13} />
											</button>
										) : chord ? (
											<button
												type="button"
												className="shortcut-icon"
												title="Clear"
												aria-label={`Clear ${a.label}`}
												onClick={() => set(a.id, "")}
											>
												<X size={13} />
											</button>
										) : (
											<span className="shortcut-icon" aria-hidden />
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			))}
			<div className="setting-group-label">Elsewhere</div>
			<div className="setting-group">
				<div className="setting-item shortcut-row">
					<div className="setting-info">
						<span className="setting-label">Clipboard</span>
						<span className="setting-desc">Set in Shelf › Shortcut</span>
					</div>
					<Keys chord={localStorage.getItem("bloom-clipboard-shortcut") ?? "Alt+C"} />
				</div>
				<div className="setting-item shortcut-row last">
					<div className="setting-info">
						<span className="setting-label">Radial Menu</span>
						<span className="setting-desc">Tap the trigger key while dragging, or press it twice; set in Radial Menu</span>
					</div>
				</div>
			</div>
			{Object.keys(saved).length > 0 && (
				<button type="button" className="cc-tiles-reset" onClick={() => store({})}>
					Reset all shortcuts
				</button>
			)}
		</>
	);
}
