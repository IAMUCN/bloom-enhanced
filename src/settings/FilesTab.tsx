import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Hand, Keyboard, Orbit } from "lucide-react";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { shortcutFrom } from "./ClipboardTab";
import { SettingRow } from "./SettingRow";

const DEFAULT_SHORTCUT = "Ctrl+Alt+Space";
const on = (v: unknown) => v !== false && v !== "false";

/** Settings › Files: the file wheel (OrbitDrop's convert / tools / actions). */
export function FilesTab({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [enabled, setEnabled] = useState(true);
	const [drag, setDrag] = useState(true);
	const [shortcut, setShortcut] = useState(DEFAULT_SHORTCUT);

	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) => {
				setEnabled(on(s["bloom-files-enabled"]));
				setDrag(on(s["bloom-files-drag"]));
				setShortcut(s["bloom-files-shortcut"] ?? DEFAULT_SHORTCUT);
			})
			.catch(() => {});
	}, []);
	useSettingsSync({
		"bloom-files-enabled": (v) => setEnabled(on(v)),
		"bloom-files-drag": (v) => setDrag(on(v)),
		"bloom-files-shortcut": (v) => setShortcut(v == null ? DEFAULT_SHORTCUT : String(v))
	});
	const save = (key: string, value: string) => saveSetting(key, value);

	return (
		<>
			<div className="setting-group-label">File Wheel</div>
			<div className="setting-group">
				<SettingRow
					icon={Orbit}
					label="File Utilities"
					desc="Convert, edit and act on files from a wheel; results are saved next to the original, which is never changed"
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
							desc="While dragging files, tap Shift to open the wheel; let go on an option. Tap Shift again for the next mode, Esc to cancel"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={drag} onChange={() => save("bloom-files-drag", String(!drag))} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label="Shortcut"
							desc="Opens the wheel for the files selected in File Explorer or on the desktop. Click the box and press keys; Backspace turns it off"
							divider={false}
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
					</>
				)}
			</div>
		</>
	);
}
