import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Hand, Keyboard, ListOrdered, Orbit } from "lucide-react";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { CATALOG, MODES, MODE_LABEL, asMode, parseHidden, type OrbitMode } from "../orbitOps";
import { shortcutFrom } from "./ClipboardTab";
import { SettingRow } from "./SettingRow";

const DEFAULT_SHORTCUT = "Ctrl+Alt+Space";
const on = (v: unknown) => v !== false && v !== "false";

/** Settings › Circular Menu: OrbitDrop's convert / tools / actions menu. */
export function FilesTab({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [enabled, setEnabled] = useState(true);
	const [drag, setDrag] = useState(true);
	const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);
	const [first, setFirst] = useState<OrbitMode>("convert");
	const [hidden, setHidden] = useState<string[]>([]);

	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) => {
				setEnabled(on(s["bloom-files-enabled"]));
				setDrag(on(s["bloom-files-drag"]));
				setShortcut(s["bloom-files-shortcut"] ?? DEFAULT_SHORTCUT);
				setFirst(asMode(s["bloom-files-first-mode"]));
				setHidden(parseHidden(s["bloom-files-hidden"]));
			})
			.catch(() => {});
	}, []);
	useSettingsSync({
		"bloom-files-enabled": (v) => setEnabled(on(v)),
		"bloom-files-drag": (v) => setDrag(on(v)),
		"bloom-files-shortcut": (v) => setShortcut(v == null ? DEFAULT_SHORTCUT : String(v)),
		"bloom-files-first-mode": (v) => setFirst(asMode(v)),
		"bloom-files-hidden": (v) => setHidden(parseHidden(v))
	});
	const save = (key: string, value: string) => saveSetting(key, value);
	const toggleOption = (id: string) => {
		const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
		setHidden(next);
		save("bloom-files-hidden", JSON.stringify(next));
	};

	return (
		<>
			<div className="setting-group-label">Circular Menu</div>
			<div className="setting-group">
				<SettingRow
					icon={Orbit}
					label="Circular Menu"
					desc="Convert, edit and act on files from a ring around the pointer; results are saved next to the original, which is never changed"
					divider={enabled}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={enabled} onChange={() => save("bloom-files-enabled", String(!enabled))} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{enabled && (
					<>
						<SettingRow
							icon={Hand}
							label="Drag, Then Tap Shift"
							desc="While dragging files or selected text, tap Shift to open the menu; let go on an option. Shift again shows the next menu, Esc cancels"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={drag} onChange={() => save("bloom-files-drag", String(!drag))} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label="Shortcut"
							desc="Opens the menu for the files selected in File Explorer or on the desktop. Click the box and press keys; Backspace turns it off"
						>
							<input
								className="settings-select clip-shortcut"
								readOnly
								value={shortcut || "Off"}
								onKeyDown={(e) => {
									e.preventDefault();
									if (e.key === "Backspace" || e.key === "Delete") save("bloom-files-shortcut", "");
									const next = shortcutFrom(e);
									if (next) save("bloom-files-shortcut", next);
								}}
							/>
						</SettingRow>

						<SettingRow
							icon={ListOrdered}
							label="First Menu"
							desc="Which menu opens first; Shift goes on to the others in order"
							divider={false}
						>
							<select
								className="settings-select"
								value={first}
								onChange={(e) => save("bloom-files-first-mode", e.target.value)}
							>
								{MODES.map((m) => (
									<option key={m} value={m}>
										{MODE_LABEL[m]}
									</option>
								))}
							</select>
						</SettingRow>
					</>
				)}
			</div>

			{enabled &&
				MODES.map((m) => (
					<div key={m}>
						<div className="setting-group-label">{MODE_LABEL[m]} Options</div>
						<div className="setting-group orbit-chips">
							{CATALOG[m].map((op) => (
								<button
									key={op.id}
									className={`folder-chip${hidden.includes(op.id) ? "" : " active"}`}
									title={hidden.includes(op.id) ? "Hidden: click to show" : "Shown: click to hide"}
									onClick={() => toggleOption(op.id)}
								>
									{op.label}
								</button>
							))}
						</div>
					</div>
				))}
		</>
	);
}
