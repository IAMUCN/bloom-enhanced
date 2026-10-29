import {
	PanelTop,
	Calendar,
	BellRing,
	Music,
	Minimize2,
	LayoutList,
	Sparkles,
	Circle,
	CloudSun,
	Timer,
	Archive,
	Headphones,
	SlidersHorizontal,
	Maximize2,
	X
} from "lucide-react";
import { motion } from "framer-motion";
import { SettingRow } from "./SettingRow";

/** Notch behavior (`bloom-notch-mode`): name and what it does. */
const NOTCH_MODES = [
	["fixed", "Fixed", "Always on screen"],
	[
		"smart",
		"Smart",
		"Hides while an app covers the top of the screen (maximized or full screen); touch the top edge to bring it back"
	],
	[
		"peek",
		"Peek",
		"Stays hidden until you touch the top edge, or something happens (a copy, a file job, charging)"
	]
] as const;
import { ScaleStepper } from "./ScaleStepper";
import {
	NOTCH_STYLES,
	SIZED_PANELS,
	type NotchStyle,
	type PanelScales,
	type SizedPanel
} from "../notchLayout";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
import type { NotchPanelChoice } from "./useSettings";

/** The notch's panels, in the order the notch cycles through them. */
const PANEL_CHOICES: readonly (readonly [NotchPanelChoice, string])[] = [
	["calendar", "Calendar"],
	["command-center", "Command Center"],
	["devices", "Connected devices"]
];

interface NotchTabProps {
	notchEnabled: boolean;
	toggleNotch: () => void;
	notchMode: string;
	setNotchModeValue: (mode: string) => void;
	notchEdgeDelay: number;
	handleNotchEdgeDelayChange: (val: number) => void;
	calendarEnabled: boolean;
	toggleCalendar: () => void;
	controlsPanelEnabled: boolean;
	toggleControlsPanel: () => void;
	devicesPanelEnabled: boolean;
	toggleDevicesPanel: () => void;
	enabledPanelCount: number;
	notchRememberPanel: boolean;
	toggleNotchRememberPanel: () => void;
	notchDefaultPanel: NotchPanelChoice;
	changeNotchDefaultPanel: (panel: NotchPanelChoice) => void;
	timerSoundEnabled: boolean;
	toggleTimerSound: () => void;
	musicModeEnabled: boolean;
	toggleMusicMode: () => void;
	musicCompactNotch: boolean;
	toggleMusicCompactNotch: () => void;
	shelfPersist: boolean;
	toggleShelfPersist: () => void;
	mediaLayout: "classic" | "compact";
	toggleMediaLayout: (layout: "classic" | "compact") => void;
	mediaAmbienceEnabled: boolean;
	toggleAmbience: () => void;
	mediaCompactGlowEnabled: boolean;
	toggleCompactGlow: () => void;
	weatherEnabled: boolean;
	toggleWeather: () => void;
	tempUnitFahrenheit: boolean;
	toggleTempUnit: () => void;
	cityName: string;
	setCityName: (name: string) => void;
	citySearchResults: Array<{ name: string; country: string; latitude: number; longitude: number }>;
	showCityDropdown: boolean;
	setShowCityDropdown: (show: boolean) => void;
	selectCity: (city: {
		name: string;
		country: string;
		latitude: number;
		longitude: number;
	}) => void;
	handleCityClear: () => void;
	statusWidgets: WidgetConfig;
	handleWidgetsChange: (config: WidgetConfig) => void;
	notchScale: number;
	handleNotchScaleChange: (val: number) => void;
	notchPanelScales: PanelScales;
	handlePanelScaleChange: (panel: SizedPanel, val: number) => void;
	notchStyle: NotchStyle;
	handleNotchStyleChange: (style: NotchStyle) => void;
}

export function NotchTab({
	notchEnabled,
	toggleNotch,
	notchMode,
	setNotchModeValue,
	notchEdgeDelay,
	handleNotchEdgeDelayChange,
	calendarEnabled,
	toggleCalendar,
	controlsPanelEnabled,
	toggleControlsPanel,
	devicesPanelEnabled,
	toggleDevicesPanel,
	enabledPanelCount,
	notchRememberPanel,
	toggleNotchRememberPanel,
	notchDefaultPanel,
	changeNotchDefaultPanel,
	timerSoundEnabled,
	toggleTimerSound,
	musicModeEnabled,
	toggleMusicMode,
	musicCompactNotch,
	toggleMusicCompactNotch,
	shelfPersist,
	toggleShelfPersist,
	mediaLayout,
	toggleMediaLayout,
	mediaAmbienceEnabled,
	toggleAmbience,
	mediaCompactGlowEnabled,
	toggleCompactGlow,
	weatherEnabled,
	toggleWeather,
	tempUnitFahrenheit,
	toggleTempUnit,
	cityName,
	setCityName,
	citySearchResults,
	showCityDropdown,
	setShowCityDropdown,
	selectCity,
	handleCityClear,
	statusWidgets,
	handleWidgetsChange,
	notchScale,
	handleNotchScaleChange,
	notchPanelScales,
	handlePanelScaleChange,
	notchStyle,
	handleNotchStyleChange
}: NotchTabProps) {
	const panelOn: Record<NotchPanelChoice, boolean> = {
		calendar: calendarEnabled,
		"command-center": controlsPanelEnabled,
		devices: devicesPanelEnabled
	};
	const firstPanelOn = PANEL_CHOICES.find(([panel]) => panelOn[panel])?.[0] ?? "command-center";
	// The notch needs at least one panel, so the last one on stays on.
	const isLastPanel = (on: boolean) => on && enabledPanelCount <= 1;
	const lastPanelTitle = (on: boolean) =>
		isLastPanel(on) ? "The notch needs at least one panel" : undefined;

	return (
		<>
			<div className="setting-group-label">Notch</div>
			<div className="setting-group">
				<SettingRow
					icon={PanelTop}
					label="Bloom Notch"
					desc="Turn off to remove the notch; Settings stay in the tray menu"
					divider={notchEnabled}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={notchEnabled} onChange={toggleNotch} />
						<span className="slider"></span>
					</label>
				</SettingRow>
			</div>

			{notchEnabled && (
				<>
					<div className="setting-group">
						<SettingRow
							icon={PanelTop}
							label="When It Shows"
							desc={NOTCH_MODES.find(([m]) => m === notchMode)?.[2] ?? NOTCH_MODES[0][2]}
						>
							<div className="scale-button-container seg-toggle" role="radiogroup" aria-label="When the notch shows">
								{NOTCH_MODES.map(([mode, name]) => (
									<button
										key={mode}
										role="radio"
										aria-checked={notchMode === mode}
										className={`seg-btn${notchMode === mode ? " active" : ""}`}
										onClick={() => setNotchModeValue(mode)}
									>
										{notchMode === mode && (
											<motion.span
												layoutId="notch-mode-pill"
												className="seg-pill"
												transition={{ type: "spring", stiffness: 500, damping: 30 }}
											/>
										)}
										<span>{name}</span>
									</button>
								))}
							</div>
						</SettingRow>

						{notchMode !== "fixed" && (
							<SettingRow
								icon={Timer}
								label="Peek Delay"
								desc={
									notchEdgeDelay === 0
										? "How long to rest on the top edge before it shows: instantly"
										: `How long to rest on the top edge before it shows: ${notchEdgeDelay}ms`
								}
							>
								<input
									type="range"
									min="0"
									max="800"
									step="50"
									value={notchEdgeDelay}
									onChange={(e) => handleNotchEdgeDelayChange(parseInt(e.target.value))}
									className="settings-slider"
								/>
							</SettingRow>
						)}

						<SettingRow
							icon={PanelTop}
							label="Style"
							desc={
								notchStyle === "pill"
									? "Floating capsule below the screen edge"
									: notchStyle === "minimal"
										? "Thin bar until hovered or something is playing"
										: "Attached to the top edge"
							}
						>
							<select
								className="settings-select"
								value={notchStyle}
								onChange={(e) => handleNotchStyleChange(e.target.value as NotchStyle)}
							>
								{NOTCH_STYLES.map(([style, label]) => (
									<option key={style} value={style}>
										{label}
									</option>
								))}
							</select>
						</SettingRow>

						<SettingRow
							icon={Maximize2}
							label="Notch Size"
							desc="Size of the notch only; the dock keeps its own"
						>
							<ScaleStepper
								value={notchScale}
								onChange={handleNotchScaleChange}
								label="notch size"
							/>
						</SettingRow>
					</div>

					<div className="setting-group-label">Panels</div>
					<div className="setting-group">
						<SettingRow
							icon={Calendar}
							label="Calendar & Timer"
							desc="Enable productivity split-view"
						>
							<label className="toggle-switch" title={lastPanelTitle(calendarEnabled)}>
								<input
									type="checkbox"
									checked={calendarEnabled}
									disabled={isLastPanel(calendarEnabled)}
									onChange={toggleCalendar}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						{calendarEnabled && (
							<SettingRow
								icon={BellRing}
								label="Timer Sound"
								desc="Play a chime when the timer finishes"
							>
								<label className="toggle-switch">
									<input type="checkbox" checked={timerSoundEnabled} onChange={toggleTimerSound} />
									<span className="slider"></span>
								</label>
							</SettingRow>
						)}

						<SettingRow
							icon={SlidersHorizontal}
							label="Command Center"
							desc="Quick toggles, Wi-Fi and Bluetooth"
						>
							<label className="toggle-switch" title={lastPanelTitle(controlsPanelEnabled)}>
								<input
									type="checkbox"
									checked={controlsPanelEnabled}
									disabled={isLastPanel(controlsPanelEnabled)}
									onChange={toggleControlsPanel}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Headphones}
							label="Connected Devices"
							desc="Batteries and audio of your connected devices"
						>
							<label className="toggle-switch" title={lastPanelTitle(devicesPanelEnabled)}>
								<input
									type="checkbox"
									checked={devicesPanelEnabled}
									disabled={isLastPanel(devicesPanelEnabled)}
									onChange={toggleDevicesPanel}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={PanelTop}
							label="Remember Last Panel"
							desc="Reopen the panel you last used; turn off to choose a fixed default"
						>
							<label className="toggle-switch">
								<input
									type="checkbox"
									checked={notchRememberPanel}
									onChange={toggleNotchRememberPanel}
								/>
								<span className="slider"></span>
							</label>
						</SettingRow>

						{!notchRememberPanel && (
							<SettingRow
								icon={PanelTop}
								label="Default Panel"
								desc="Open this panel when you click the notch"
							>
								<select
									className="settings-select"
									value={panelOn[notchDefaultPanel] ? notchDefaultPanel : firstPanelOn}
									onChange={(e) => changeNotchDefaultPanel(e.target.value as NotchPanelChoice)}
								>
									{PANEL_CHOICES.map(([panel, label]) => (
										<option key={panel} value={panel} disabled={!panelOn[panel]}>
											{label}
										</option>
									))}
								</select>
							</SettingRow>
						)}
					</div>

					<div className="setting-group-label">Music</div>
					<div className="setting-group">
						<SettingRow icon={Music} label="Music Mode" desc="Interactive live music widget">
							<label className="toggle-switch">
								<input type="checkbox" checked={musicModeEnabled} onChange={toggleMusicMode} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						{musicModeEnabled && (
							<details className="settings-disclosure">
								<summary>
									Music options <span>Layout and visual effects</span>
								</summary>
								<SettingRow
									icon={Minimize2}
									label="Compact Mode"
									desc="Show visualizer & artwork when collapsed"
								>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={musicCompactNotch}
											onChange={toggleMusicCompactNotch}
										/>
										<span className="slider"></span>
									</label>
								</SettingRow>

								<SettingRow
									icon={LayoutList}
									label="Media Layout"
									desc="Choose expanded player style"
								>
									<div className="unit-toggle-minimal wide">
										<span
											className={mediaLayout === "classic" ? "active" : ""}
											onClick={() => toggleMediaLayout("classic")}
										>
											Classic
										</span>
										<span
											className={mediaLayout === "compact" ? "active" : ""}
											onClick={() => toggleMediaLayout("compact")}
										>
											Compact
										</span>
									</div>
								</SettingRow>

								<SettingRow
									icon={Sparkles}
									label="Ambient Glow"
									desc="Colored glow behind expanded album art"
								>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={mediaAmbienceEnabled}
											onChange={toggleAmbience}
										/>
										<span className="slider"></span>
									</label>
								</SettingRow>

								<SettingRow
									icon={Circle}
									label="Compact Glow"
									desc="Glow around collapsed thumbnail"
									divider={false}
								>
									<label className="toggle-switch">
										<input
											type="checkbox"
											checked={mediaCompactGlowEnabled}
											onChange={toggleCompactGlow}
										/>
										<span className="slider"></span>
									</label>
								</SettingRow>
							</details>
						)}
					</div>

					<div className="setting-group-label">Shelf</div>
					<div className="setting-group">
						<SettingRow
							icon={Archive}
							label="Keep Items"
							desc="Keep shelf items after Bloom closes"
							divider={false}
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={shelfPersist} onChange={toggleShelfPersist} />
								<span className="slider"></span>
							</label>
						</SettingRow>
					</div>

					<div className="setting-group-label">Panel Sizes</div>
					<div className="setting-group">
						{SIZED_PANELS.map(([panel, label], index) => (
							<SettingRow
								key={panel}
								icon={Maximize2}
								label={label}
								desc="Resizes this panel only"
								divider={index < SIZED_PANELS.length - 1}
							>
								<ScaleStepper
									value={notchPanelScales[panel] ?? 1}
									onChange={(val) => handlePanelScaleChange(panel, val)}
									label={`${label} size`}
								/>
							</SettingRow>
						))}
					</div>

					<div className="setting-group-label">Weather</div>
					<div className="setting-group">
						<SettingRow
							icon={CloudSun}
							label="Weather Status"
							desc={cityName || "Auto-detect location"}
						>
							<div className="weather-controls">
								<div className="unit-toggle-minimal" onClick={toggleTempUnit}>
									<span className={!tempUnitFahrenheit ? "active" : ""}>C</span>
									<span className={tempUnitFahrenheit ? "active" : ""}>F</span>
								</div>
								<label className="toggle-switch">
									<input type="checkbox" checked={weatherEnabled} onChange={toggleWeather} />
									<span className="slider"></span>
								</label>
							</div>
						</SettingRow>

						{weatherEnabled && (
							<div className="manual-city-input">
								<div className="city-input-row">
									<input
										type="text"
										placeholder="Search city..."
										value={cityName}
										onChange={(e) => setCityName(e.target.value)}
										onFocus={() => citySearchResults.length > 0 && setShowCityDropdown(true)}
										onKeyDown={(e) => {
											if (e.key === "Enter" && citySearchResults.length > 0) {
												e.preventDefault();
												selectCity(citySearchResults[0]);
											}
											if (e.key === "Escape") {
												setShowCityDropdown(false);
											}
										}}
										onBlur={() => setTimeout(() => setShowCityDropdown(false), 150)}
									/>
									{cityName && (
										<button
											className="city-clear-btn"
											onMouseDown={(e) => {
												e.preventDefault();
												handleCityClear();
											}}
											title="Clear city"
										>
											<X size={10} strokeWidth={2.5} />
										</button>
									)}
								</div>
								{showCityDropdown && citySearchResults.length > 0 && (
									<div className="city-dropdown">
										{citySearchResults.map((city) => (
											<button
												key={`${city.name}-${city.latitude}`}
												className="city-dropdown-item"
												onMouseDown={(e) => {
													e.preventDefault();
													selectCity(city);
												}}
											>
												<span className="city-dropdown-name">{city.name}</span>
												<span className="city-dropdown-country">{city.country}</span>
											</button>
										))}
									</div>
								)}
							</div>
						)}
					</div>

					<div className="setting-group-label">Widgets</div>
					<div className="setting-group">
						<details className="settings-disclosure settings-disclosure-standalone">
							<summary>
								Choose status widgets <span>Arrange what appears beside the clock</span>
							</summary>
							<StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} />
						</details>
					</div>
				</>
			)}
		</>
	);
}
