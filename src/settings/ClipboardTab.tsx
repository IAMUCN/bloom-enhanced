import { ClipboardList, EyeOff, History, Image, Keyboard, Layers, PanelLeft, Timer, Trash2 } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface ClipboardTabProps {
	enabled: boolean;
	toggleEnabled: () => void;
	incognito: boolean;
	toggleIncognito: () => void;
	limit: number;
	changeLimit: (limit: number) => void;
	retentionHours: number;
	changeRetention: (hours: number) => void;
	clearHistory: () => void;
	groupFiles: boolean;
	toggleGroupFiles: () => void;
	thumbSize: string;
	changeThumbSize: (size: string) => void;
	position: string;
	changePosition: (position: string) => void;
	shortcut: string;
	changeShortcut: (shortcut: string) => void;
}

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

/** "Ctrl+Shift+V" from a key press, or null while only modifiers are held. */
function shortcutFrom(e: React.KeyboardEvent): string | null {
	if (MODIFIER_KEYS.includes(e.key)) return null;
	const key =
		e.code.startsWith("Key") || e.code.startsWith("Digit")
			? e.code.slice(-1)
			: /^F\d{1,2}$/.test(e.key)
				? e.key
				: e.code === "Space"
					? "Space"
					: null;
	if (!key) return null;
	const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"].filter(Boolean);
	// Letters, digits and Space need a modifier so typing never triggers it.
	if (!mods.length && !key.startsWith("F")) return null;
	return [...mods, key].join("+");
}

const LIMITS = [50, 100, 200, 500, 1000];
const RETENTION: [number, string][] = [
	[0, "Never"],
	[1, "After 1 hour"],
	[24, "After 1 day"],
	[168, "After 7 days"],
	[720, "After 30 days"]
];

export function ClipboardTab({
	enabled,
	toggleEnabled,
	incognito,
	toggleIncognito,
	limit,
	changeLimit,
	retentionHours,
	changeRetention,
	clearHistory,
	groupFiles,
	toggleGroupFiles,
	thumbSize,
	changeThumbSize,
	position,
	changePosition,
	shortcut,
	changeShortcut
}: ClipboardTabProps) {
	return (
		<>
			<div className="setting-group-label">Clipboard</div>
			<div className="setting-group">
				<SettingRow
					icon={ClipboardList}
					label="Clipboard History"
					desc="Record what you copy and show it in the notch's Clipboard panel"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={enabled} onChange={toggleEnabled} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{enabled && (
					<SettingRow
						icon={EyeOff}
						label="Incognito"
						desc="Pause recording; nothing copied meanwhile is kept"
						divider={false}
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={incognito} onChange={toggleIncognito} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}
			</div>

			{enabled && (
				<>
					<div className="setting-group-label">Shelf</div>
					<div className="setting-group">
						<SettingRow
							icon={PanelLeft}
							label="Position"
							desc="In the notch, or a shelf that slides out of the middle of the left or right screen edge"
						>
							<select className="settings-select" value={position} onChange={(e) => changePosition(e.target.value)}>
								<option value="notch">Notch</option>
								<option value="left">Left edge</option>
								<option value="right">Right edge</option>
							</select>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label="Shortcut"
							desc="Click the box and press keys to change it; Backspace turns it off"
							divider={false}
						>
							<input
								className="settings-select clip-shortcut"
								readOnly
								value={shortcut || "Off"}
								onKeyDown={(e) => {
									e.preventDefault();
									if (e.key === "Backspace" || e.key === "Delete") changeShortcut("");
									const next = shortcutFrom(e);
									if (next) changeShortcut(next);
								}}
							/>
						</SettingRow>
					</div>
				</>
			)}

			<div className="setting-group-label">Items</div>
			<div className="setting-group">
				<SettingRow
					icon={Layers}
					label="Group Copied Files"
					desc="Several files or images copied at once stay one stack; off records each on its own"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={groupFiles} onChange={toggleGroupFiles} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Image} label="Thumbnail Size" desc="Preview size of images and files" divider={false}>
					<select className="settings-select" value={thumbSize} onChange={(e) => changeThumbSize(e.target.value)}>
						<option value="small">Small</option>
						<option value="medium">Medium</option>
						<option value="large">Large</option>
					</select>
				</SettingRow>
			</div>

			<div className="setting-group-label">History</div>
			<div className="setting-group">
				<SettingRow icon={History} label="History Size" desc="Oldest items go first; pinned items stay">
					<select
						className="settings-select"
						value={LIMITS.includes(limit) ? limit : 200}
						onChange={(e) => changeLimit(Number(e.target.value))}
					>
						{LIMITS.map((n) => (
							<option key={n} value={n}>
								{n} items
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow icon={Timer} label="Auto-Delete" desc="Remove unpinned items after a while">
					<select
						className="settings-select"
						value={RETENTION.some(([h]) => h === retentionHours) ? retentionHours : 0}
						onChange={(e) => changeRetention(Number(e.target.value))}
					>
						{RETENTION.map(([h, label]) => (
							<option key={h} value={h}>
								{label}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow
					icon={Trash2}
					label="Clear History"
					desc="Delete every unpinned item now"
					action
					danger
					divider={false}
					onClick={clearHistory}
				/>
			</div>
		</>
	);
}
