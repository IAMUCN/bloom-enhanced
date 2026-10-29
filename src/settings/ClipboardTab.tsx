import { useEffect, useState } from "react";
import { availableMonitors } from "@tauri-apps/api/window";
import {
	BellRing,
	ClipboardCheck,
	ClipboardList,
	EyeOff,
	Globe,
	History,
	Image,
	Keyboard,
	Layers,
	ListChecks,
	Maximize2,
	Monitor,
	PanelLeft,
	StickyNote,
	Timer,
	Trash2,
	Type
} from "lucide-react";
import { useClipboardSettings } from "../hooks/useClipboardSettings";
import { SettingRow } from "./SettingRow";
import { Choice } from "./Choice";
import { ScaleStepper } from "./ScaleStepper";

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
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
}

// Optional Edge-Drop features, each on by default and switchable here.
const FEATURE_TOGGLES = [
	["richText", "bloom-clipboard-rich-text", Type, "Rich Text", "Keep formatting (HTML) of copied text and paste it back formatted"],
	["linkPreviews", "bloom-clipboard-link-previews", Globe, "Link Previews", "Show a site badge, title and domain for copied links (made offline, nothing is fetched)"],
	["notes", "bloom-clipboard-notes", StickyNote, "Notes & Tags", "Add a note or #tags to an item; noted items are kept through cleanup and searchable"],
	["multiSelect", "bloom-clipboard-multi-select", ListChecks, "Multi-Select", "Ctrl-click or the select button to group, copy, pin or delete several items at once"],
	["sounds", "bloom-clipboard-sounds", BellRing, "Sound Effects", "Short sounds when you copy, pin, group or delete in the clipboard"],
	["copyIndicator", "bloom-clipboard-copy-indicator", ClipboardCheck, "Copy Indicator", "The notch shows a brief \"Copied\" when something is recorded"]
] as const;

const MODIFIER_KEYS = ["Control", "Alt", "Shift", "Meta"];

/** "Ctrl+Shift+V" from a key press, or null while only modifiers are held. */
export function shortcutFrom(e: React.KeyboardEvent): string | null {
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
	[1, "1 hour"],
	[24, "1 day"],
	[168, "7 days"],
	[720, "30 days"]
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
	changeShortcut,
	saveSetting
}: ClipboardTabProps) {
	const options = useClipboardSettings();
	const [monitors, setMonitors] = useState<string[]>([]);
	useEffect(() => {
		availableMonitors()
			.then((list) => setMonitors(list.map((m) => m.name).filter((n): n is string => !!n)))
			.catch(() => {});
	}, []);
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
							<Choice
								value={position}
								options={[
									["notch", "Notch"],
									["left", "Left edge"],
									["right", "Right edge"]
								]}
								onChange={changePosition}
								label="Shelf position"
							/>
						</SettingRow>

						{position === "notch" && (
							<SettingRow icon={Maximize2} label="Wide in the Notch" desc="A wider Clipboard panel, so more and larger tiles fit">
								<label className="toggle-switch">
									<input
										type="checkbox"
										checked={options.notchWide}
										onChange={() => saveSetting("bloom-clipboard-notch-wide", String(!options.notchWide))}
									/>
									<span className="slider"></span>
								</label>
							</SettingRow>
						)}

						{position !== "notch" && monitors.length > 1 && (
							<SettingRow icon={Monitor} label="Shelf Monitor" desc="Which screen's edge the shelf slides out of">
								<Choice
									value={options.monitor}
									options={[["", "Primary"], ...monitors.map((name, i) => [name, `Display ${i + 1}`] as const)]}
									onChange={(v) => saveSetting("bloom-clipboard-monitor", v)}
									label="Shelf display"
								/>
							</SettingRow>
						)}

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
					<Choice
						value={thumbSize}
						options={[
							["small", "Small"],
							["medium", "Medium"],
							["large", "Large"]
						]}
						onChange={changeThumbSize}
						label="Thumbnail size"
					/>
				</SettingRow>
			</div>

			{enabled && (
				<>
					<div className="setting-group-label">Features</div>
					<div className="setting-group">
						{FEATURE_TOGGLES.map(([option, key, icon, label, desc], i) => (
							<SettingRow
								key={key}
								icon={icon}
								label={label}
								desc={desc}
								divider={i < FEATURE_TOGGLES.length - 1}
							>
								<label className="toggle-switch">
									<input
										type="checkbox"
										checked={options[option]}
										onChange={() => saveSetting(key, String(!options[option]))}
									/>
									<span className="slider"></span>
								</label>
							</SettingRow>
						))}
					</div>
				</>
			)}

			<div className="setting-group-label">History</div>
			<div className="setting-group">
				<SettingRow icon={History} label="History Size" desc="Oldest items go first; pinned items stay">
					<ScaleStepper
						value={Math.max(0, LIMITS.indexOf(LIMITS.includes(limit) ? limit : 200))}
						min={0}
						max={LIMITS.length - 1}
						stepSize={1}
						format={(i) => `${LIMITS[i]} items`}
						onChange={(i) => changeLimit(LIMITS[i])}
						label="history size"
					/>
				</SettingRow>

				<SettingRow icon={Timer} label="Auto-Delete" desc="Remove unpinned items after a while">
					<ScaleStepper
						value={Math.max(0, RETENTION.findIndex(([h]) => h === retentionHours))}
						min={0}
						max={RETENTION.length - 1}
						stepSize={1}
						format={(i) => RETENTION[i][1]}
						onChange={(i) => changeRetention(RETENTION[i][0])}
						label="auto-delete time"
					/>
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
