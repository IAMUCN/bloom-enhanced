import { useState } from "react";
import { Power, Download, Clock, BatteryWarning, RefreshCw, RotateCcw, LogOut, FileDown, Upload, Wand2, Gauge, Leaf, AudioLines, Sparkles, UserRound } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Choice } from "./Choice";
import { SettingRow } from "./SettingRow";
import { HideFromCaptureRow } from "./HideFromCaptureRow";

type Pauses = { visualizer: boolean; motion: boolean };
const PAUSES: [keyof Pauses, typeof Leaf, string, string][] = [
	["visualizer", AudioLines, "Pause Visualizer", "The music bars stop listening to your audio"],
	["motion", Sparkles, "Calmer Motion", "Notch animations become shorter and simpler"]
];

/** Battery saver: when it turns on (`bloom-battery-saver`: off, on battery,
 *  or on battery at or below `bloom-battery-saver-threshold`) and what it
 *  pauses (`bloom-battery-saver-pauses`). A leaf shows on the notch while on. */
function BatterySaver({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [mode, setMode] = useState(() => localStorage.getItem("bloom-battery-saver") ?? "below");
	const [threshold, setThreshold] = useState(
		() => parseInt(localStorage.getItem("bloom-battery-saver-threshold") ?? "", 10) || 30
	);
	const [pauses, setPauses] = useState<Pauses>(() => {
		const all = { visualizer: true, motion: true };
		try {
			return { ...all, ...JSON.parse(localStorage.getItem("bloom-battery-saver-pauses") ?? "{}") };
		} catch {
			return all;
		}
	});
	return (
		<>
			<div className="setting-group-label">Battery Saver</div>
			<div className="setting-group">
				<SettingRow
					icon={Leaf}
					label="Battery Saver"
					desc={
						mode === "off"
							? "Never turns on"
							: mode === "battery"
								? "On whenever the PC runs on battery"
								: `On when on battery at or below ${threshold}%`
					}
					divider={mode !== "off"}
				>
					<Choice
						value={mode}
						options={[["off", "Off"], ["battery", "On battery"], ["below", "Low battery"]] as const}
						onChange={(v) => {
							setMode(v);
							saveSetting("bloom-battery-saver", v);
						}}
						label="When Battery saver turns on"
					/>
				</SettingRow>
				{mode === "below" && (
					<SettingRow icon={BatteryWarning} label="Turn On Below" desc={`At or below ${threshold}% on battery`}>
						<input
							type="range"
							min="10"
							max="80"
							step="5"
							value={threshold}
							onChange={(e) => {
								const v = parseInt(e.target.value, 10);
								setThreshold(v);
								saveSetting("bloom-battery-saver-threshold", String(v));
							}}
							className="settings-slider"
							aria-label="Battery saver threshold"
						/>
					</SettingRow>
				)}
				{mode !== "off" && <p className="radial-hint">When Battery saver is on, the options below are paused or switched off. Turn off the ones you want to keep.</p>}
				{mode !== "off" &&
					PAUSES.map(([key, icon, label, desc], i) => (
						<SettingRow key={key} icon={icon} label={label} desc={desc} divider={i < PAUSES.length - 1}>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={pauses[key]}
									onChange={() => {
										const next = { ...pauses, [key]: !pauses[key] };
										setPauses(next);
										saveSetting("bloom-battery-saver-pauses", JSON.stringify(next));
									}}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>
					))}
			</div>
		</>
	);
}

interface GeneralTabProps {
	autostart: boolean;
	toggleAutostart: () => void;
	timeFormat24h: boolean;
	toggleTimeFormat24h: () => void;
	showUpdateIndicator: boolean;
	toggleUpdateIndicator: () => void;
	lowBatteryThreshold: number;
	handleThresholdChange: (val: number) => void;
	restartBloom: () => void;
	resetToDefaults: () => void;
	quitBloom: () => void;
	exportStatus: string;
	importStatus: string;
	handleExportSettings: () => void;
	handleImportSettings: () => void;
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
}

export function GeneralTab({
	autostart,
	toggleAutostart,
	timeFormat24h,
	toggleTimeFormat24h,
	showUpdateIndicator,
	toggleUpdateIndicator,
	lowBatteryThreshold,
	handleThresholdChange,
	restartBloom,
	resetToDefaults,
	quitBloom,
	exportStatus,
	importStatus,
	handleExportSettings,
	handleImportSettings,
	saveSetting
}: GeneralTabProps) {
	// Settings, the radial menu and the edge shelf exist only while used,
	// unless this keeps them (faster to open, more memory).
	const [keepLoaded, setKeepLoaded] = useState(() => localStorage.getItem("bloom-keep-windows-loaded") === "true");
	const [lowMemory, setLowMemory] = useState(() => localStorage.getItem("bloom-low-memory") !== "false");
	return (
		<>
			<div className="setting-group-label">System</div>
			<div className="setting-group">
				<SettingRow icon={UserRound} label="Your Name" desc="Shown to people you share your Shelf with">
					<input
						className="setting-text-input"
						defaultValue={localStorage.getItem("bloom-share-name") ?? ""}
						maxLength={48}
						placeholder="Your name"
						aria-label="Your name"
						onBlur={(e) => {
							const name = e.target.value.trim();
							if (name === (localStorage.getItem("bloom-share-name") ?? "")) return;
							saveSetting("bloom-share-name", name);
							if (name) invoke("share_set_name", { name }).catch(() => {});
						}}
					/>
				</SettingRow>

				<SettingRow icon={Power} label="Launch at Startup" desc="Start LotusNotch when Windows starts">
					<label className="toggle-switch">
						<input type="checkbox" checked={autostart} onChange={toggleAutostart} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Download}
					label="Update Indicator"
					desc="Green dot when a new release is out on GitHub"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={showUpdateIndicator} onChange={toggleUpdateIndicator} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow icon={Clock} label="24-Hour Time" desc="Use 24-hour clock format">
					<label className="toggle-switch">
						<input type="checkbox" checked={timeFormat24h} onChange={toggleTimeFormat24h} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={BatteryWarning}
					label="Low Battery Alert"
					desc={`Trigger at ${lowBatteryThreshold}%`}
					divider={false}
				>
					<input
						type="range"
						min="5"
						max="50"
						step="5"
						value={lowBatteryThreshold}
						onChange={(e) => handleThresholdChange(parseInt(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>
			</div>

			<div className="setting-group-label">Privacy: leave out of recordings, screen shares and screenshots</div>
			<div className="setting-group">
				<HideFromCaptureRow label="Hide the Notch" settingKey="bloom-notch-hide-from-capture" byDefault what="the notch (and the Shelf inside it)" />
				<HideFromCaptureRow label="Hide the Dock" settingKey="bloom-dock-hide-from-capture" byDefault={false} what="the dock" />
				<HideFromCaptureRow label="Hide the Shelf" settingKey="bloom-clipboard-hide-from-capture" byDefault={false} what="the Shelf on a screen edge (in the notch it follows the notch)" />
				<HideFromCaptureRow label="Hide the Radial Menu" settingKey="bloom-files-hide-from-capture" byDefault what="the radial menu" />
			</div>

			<div className="setting-group-label">Backup &amp; Setup</div>
			<div className="setting-group">
				<SettingRow
					icon={FileDown}
					label={exportStatus === "exporting" ? "Exporting..." : exportStatus === "success" ? "Exported!" : exportStatus === "error" ? "Export failed. Try again." : "Export Settings"}
					desc="Save your whole setup (every preference, pinned dock apps, custom icons) to a file"
					action
					onClick={handleExportSettings}
				/>
				<SettingRow
					icon={Upload}
					label={importStatus === "importing" ? "Importing..." : importStatus === "success" ? "Imported!" : importStatus === "error" ? "Import failed. Check the file and try again." : "Import Settings"}
					desc="Load a LotusNotch, Bloom Enhanced or Bloom settings file; applies right away"
					action
					onClick={handleImportSettings}
				/>
				<SettingRow icon={Wand2} label="Run Setup Again" desc="Pick your modules, then size the notch and dock with a live preview" divider={false}>
					<button type="button" className="setting-button" onClick={() => window.dispatchEvent(new Event("run-setup"))}>
						Start
					</button>
				</SettingRow>
			</div>

			<BatterySaver saveSetting={saveSetting} />

			<div className="setting-group-label">Advanced</div>
			<div className="setting-group">
				<details className="settings-disclosure">
					<summary>
						More <span>Memory and speed</span>
					</summary>
					<SettingRow
					icon={Gauge}
					label="Keep Windows Loaded"
					desc={
						keepLoaded
							? "Settings, the radial menu and the shelf open instantly; uses about 100–150 MB more memory"
							: "Settings, the radial menu and the shelf load when you open them (a moment slower the first time) and free their memory after"
					}
				>
					<label className="toggle-switch">
						<input
							type="checkbox"
							checked={keepLoaded}
							onChange={() => {
								setKeepLoaded(!keepLoaded);
								saveSetting("bloom-keep-windows-loaded", String(!keepLoaded));
							}}
						/>
						<span className="slider"></span>
					</label>
				</SettingRow>
					<SettingRow
						icon={Gauge}
						label="Low Memory Mode"
						desc="The notch, dock, shelf and Settings share one web engine process: about 75 MB less. A busy window can slow the others a little. Applies after a restart."
						divider={false}
					>
						<label className="toggle-switch">
							<input
								type="checkbox"
								checked={lowMemory}
								onChange={() => {
									setLowMemory(!lowMemory);
									saveSetting("bloom-low-memory", String(!lowMemory));
								}}
							/>
							<span className="slider"></span>
						</label>
					</SettingRow>
				</details>
			</div>

			<div className="setting-group-label">App</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label="Reset to Defaults"
					desc="Restore all settings and restart LotusNotch"
					action
					danger
					onClick={resetToDefaults}
				/>
				<SettingRow
					icon={RefreshCw}
					label="Restart LotusNotch"
					desc="Reinitialize all components"
					action
					onClick={restartBloom}
				/>
				<SettingRow
					icon={LogOut}
					label="Quit LotusNotch"
					desc="Exit application completely"
					action
					danger
					onClick={quitBloom}
					divider={false}
				/>
			</div>
		</>
	);
}
