import { useState } from "react";
import { Power, Download, Clock, BatteryWarning, RefreshCw, RotateCcw, LogOut, Gauge } from "lucide-react";
import { SettingRow } from "./SettingRow";

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
	saveSetting
}: GeneralTabProps) {
	// Settings, the radial menu and the edge shelf exist only while used,
	// unless this keeps them (faster to open, more memory).
	const [keepLoaded, setKeepLoaded] = useState(() => localStorage.getItem("bloom-keep-windows-loaded") === "true");
	return (
		<>
			<div className="setting-group-label">System</div>
			<div className="setting-group">
				<SettingRow icon={Power} label="Launch at Login" desc="Open Bloom automatically">
					<label className="toggle-switch">
						<input type="checkbox" checked={autostart} onChange={toggleAutostart} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={Download}
					label="Update Indicator"
					desc="Show green dot when update available"
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

			<div className="setting-group-label">Performance</div>
			<div className="setting-group">
				<SettingRow
					icon={Gauge}
					label="Keep Windows Loaded"
					desc={
						keepLoaded
							? "Settings, the radial menu and the shelf open instantly; uses about 100–150 MB more memory"
							: "Settings, the radial menu and the shelf load when you open them (a moment slower the first time) and free their memory after"
					}
					divider={false}
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
			</div>

			<div className="setting-group-label">App</div>
			<div className="setting-group">
				<SettingRow
					icon={RotateCcw}
					label="Reset to Defaults"
					desc="Restore all settings and restart Bloom"
					action
					danger
					onClick={resetToDefaults}
				/>
				<SettingRow
					icon={RefreshCw}
					label="Restart Bloom"
					desc="Reinitialize all components"
					action
					onClick={restartBloom}
				/>
				<SettingRow
					icon={LogOut}
					label="Quit Bloom"
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
