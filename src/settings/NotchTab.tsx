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
	X,
	Clock,
	PanelLeft,
	PanelRight,
	GripVertical,
	ListOrdered
} from "lucide-react";
import { useRef, useState } from "react";
import { Reorder } from "framer-motion";
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
import { Choice } from "./Choice";
import {
	NOTCH_STYLES,
	SIZED_PANELS,
	parsePanelOrder,
	type OrderedPanel,
	type NotchStyle,
	type PanelScales,
	type SizedPanel
} from "../notchLayout";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";
import type { NotchPanelChoice } from "./useSettings";

/** Sizes of the clock and the icons beside it, on top of the notch size. */
const ROW_SIZES = [
	["bloom-notch-time-size", Clock, "Time Size", "The clock in the middle"],
	["bloom-notch-left-size", PanelLeft, "Left Icons", "Widgets left of the clock"],
	["bloom-notch-right-size", PanelRight, "Right Icons", "Widgets right of the clock"]
] as const;

function RowSizes({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [sizes, setSizes] = useState<Record<string, number>>(() =>
		Object.fromEntries(ROW_SIZES.map(([key]) => [key, Number(localStorage.getItem(key)) || 1]))
	);
	return (
		<>
			{ROW_SIZES.map(([key, icon, label, desc]) => (
				<SettingRow key={key} icon={icon} label={label} desc={desc}>
					<ScaleStepper
						value={sizes[key]}
						min={0.7}
						onChange={(v) => {
							setSizes((s) => ({ ...s, [key]: v }));
							saveSetting(key, String(v));
						}}
						label={label.toLowerCase()}
					/>
				</SettingRow>
			))}
		</>
	);
}

const PAGE_NAMES: Record<OrderedPanel, string> = {
	"command-center": "Command Center",
	calendar: "Calendar",
	clipboard: "Shelf",
	devices: "Devices"
};

/** Settings › Notch › Page Order: drag the pages into the order the wheel,
 *  swipes and arrows go through them. Pages that are off are dimmed. */
function PageOrder({
	isOn,
	saveSetting
}: {
	isOn: (panel: OrderedPanel) => boolean;
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
}) {
	const [order, setOrder] = useState(() => parsePanelOrder(localStorage.getItem("bloom-notch-panel-order")));
	const latest = useRef(order);
	latest.current = order;
	return (
		<Reorder.Group axis="y" values={order} onReorder={setOrder} className="radial-rows page-order">
			{order.map((panel, i) => (
				<Reorder.Item
					key={panel}
					value={panel}
					className={`radial-row${isOn(panel) ? "" : " off"}`}
					whileDrag={{ scale: 1.04, zIndex: 2 }}
					onDragEnd={() => saveSetting("bloom-notch-panel-order", JSON.stringify(latest.current))}
				>
					<GripVertical size={13} className="radial-grip" />
					<span className="page-order-number">{i + 1}</span>
					<span className="radial-row-label">{PAGE_NAMES[panel]}</span>
					{!isOn(panel) && <span className="page-order-off">off</span>}
				</Reorder.Item>
			))}
		</Reorder.Group>
	);
}

/** The notch's panels, in the order the notch cycles through them. */
const PANEL_CHOICES: readonly (readonly [NotchPanelChoice, string])[] = [
	["calendar", "Calendar"],
	["command-center", "Command Center"],
	["devices", "Devices"]
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
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
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
	handleNotchStyleChange,
	saveSetting
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
							<Choice
								value={notchMode}
								options={NOTCH_MODES.map(([mode, name]) => [mode, name] as const)}
								onChange={setNotchModeValue}
								label="When the notch shows"
							/>
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
							<Choice
								value={notchStyle}
								options={NOTCH_STYLES}
								onChange={(v) => handleNotchStyleChange(v as NotchStyle)}
								label="Notch style"
							/>
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
							icon={ListOrdered}
							label="Page Order"
							desc="Drag to set the order scrolling, swiping and the arrows go through the pages"
							divider={false}
						/>
						<div className="page-order-wrap">
							<PageOrder
								isOn={(panel) =>
									panel === "clipboard"
										? // The Shelf is a notch page while the clipboard sits in the notch.
											localStorage.getItem("bloom-clipboard-enabled") !== "false" &&
											(localStorage.getItem("bloom-clipboard-position") ?? "notch") === "notch"
										: panelOn[panel]
								}
								saveSetting={saveSetting}
							/>
						</div>
						<div className="setting-divider" />

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
								<Choice
									value={panelOn[notchDefaultPanel] ? notchDefaultPanel : firstPanelOn}
									options={PANEL_CHOICES.filter(([panel]) => panelOn[panel])}
									onChange={changeNotchDefaultPanel}
									label="Default panel"
								/>
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
						<RowSizes saveSetting={saveSetting} />
					</div>
				</>
			)}
		</>
	);
}
