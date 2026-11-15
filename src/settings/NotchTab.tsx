import {
	Trash2,
	Keyboard,
	PanelTop,
	BellRing,
	Music,
	Minimize2,
	LayoutList,
	Sparkles,
	Circle,
	CloudSun,
	Timer,
	Archive,
	Maximize2,
	X,
	Clock,
	PanelLeft,
	PanelRight,
	GripVertical,
	ListOrdered,
	Check,
	LayoutGrid
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
import { shortcutFrom } from "./ClipboardTab";
import { EXTRA_TOOLS, TOOLS, parseEnabledTools, type ExtraToolId } from "../tools";
import { CC_DEFAULT, CC_TILES, parseCcTiles, type CcTileId } from "../components/CommandCenter";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import {
	NOTCH_STYLES,
	parsePanelOrder,
	type OrderedPanel,
	type NotchStyle
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

const TOOL_DESC: Record<OrderedPanel, string> = {
	"command-center": "Quick toggles, Wi-Fi, Bluetooth, volume and brightness",
	calendar: "Month, today's events and the timer",
	clipboard: "Clipboard history; a tab while the Shelf sits in the notch (Shelf › Position)",
	devices: "Batteries and audio of your connected devices"
};

/** Settings › Notch › Tools: one card per tool in its colour, with its own
 *  switch; drag the cards into the tab bar's order. The Shelf's tab follows
 *  the Shelf's position, so its card has no switch here. */
function ToolCards({
	isOn,
	toggles,
	saveSetting
}: {
	isOn: (panel: OrderedPanel) => boolean;
	toggles: Partial<Record<OrderedPanel, { onToggle: () => void; locked: boolean; title?: string }>>;
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
}) {
	const [order, setOrder] = useState(() => parsePanelOrder(localStorage.getItem("bloom-notch-panel-order")));
	const latest = useRef(order);
	latest.current = order;
	return (
		<Reorder.Group axis="y" values={order} onReorder={setOrder} className="radial-rows page-order tool-cards">
			{order.map((panel) => {
				const { label, icon: Icon, color } = TOOLS[panel];
				const toggle = toggles[panel];
				return (
					<Reorder.Item
						key={panel}
						value={panel}
						className={`radial-row tool-card${isOn(panel) ? "" : " off"}`}
						whileDrag={{ scale: 1.03, zIndex: 2 }}
						onDragEnd={() => saveSetting("bloom-notch-panel-order", JSON.stringify(latest.current))}
					>
						<GripVertical size={13} className="radial-grip" />
						<span className="tool-card-icon" style={{ color }}>
							<Icon size={16} />
						</span>
						<span className="tool-card-text">
							<span className="radial-row-label">{label}</span>
							<span className="tool-card-desc">{TOOL_DESC[panel]}</span>
						</span>
						{toggle ? (
							<label className="toggle-switch" title={toggle.title} onPointerDown={(e) => e.stopPropagation()}>
								<input
									type="checkbox"
									checked={isOn(panel)}
									disabled={toggle.locked}
									onChange={toggle.onToggle}
									aria-label={`${label} on`}
								/>
								<span className="slider"></span>
							</label>
						) : (
							!isOn(panel) && <span className="page-order-off">off</span>
						)}
					</Reorder.Item>
				);
			})}
		</Reorder.Group>
	);
}

/** The notch's panels, in the order the notch cycles through them. */
const PANEL_CHOICES: readonly (readonly [NotchPanelChoice, string])[] = [
	["calendar", "Calendar"],
	["command-center", "Command Center"],
	["devices", "Devices"]
];

/** Settings › Notch › More Tools: every tool beyond the built-in panels,
 *  by release, each with its own switch (`bloom-tools-enabled`, in the order
 *  they were turned on = their tab order) and Erase data. Off = never
 *  loaded. */
function MoreTools({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [enabled, setEnabled] = useState(() => parseEnabledTools(localStorage.getItem("bloom-tools-enabled")));
	const toggle = (id: ExtraToolId) => {
		const next = enabled.includes(id) ? enabled.filter((t) => t !== id) : [...enabled, id];
		setEnabled(next);
		saveSetting("bloom-tools-enabled", JSON.stringify(next));
	};
	const erase = async (id: ExtraToolId, label: string) => {
		const ok = await ask(`Erase everything ${label} has saved? This can't be undone.`, { title: `Erase ${label} data`, kind: "warning" });
		if (ok) invoke("tool_data_erase", { tool: id }).catch(() => {});
	};
	const releases = [...new Set(EXTRA_TOOLS.map((t) => t.release))];
	return (
		<>
			{releases.map((release) => (
				<div key={release}>
					<div className="setting-group-label">More Tools · {release}</div>
					<div className="setting-group">
						{EXTRA_TOOLS.filter((t) => t.release === release).map(({ id, label, desc, icon: Icon, color }, i, list) => (
							<SettingRow key={id} icon={Icon} label={label} desc={desc} divider={i < list.length - 1}>
								<div className="tool-row-controls">
									<button type="button" className="tool-erase" title={`Erase ${label} data`} aria-label={`Erase ${label} data`} onClick={() => erase(id, label)}>
										<Trash2 size={13} />
									</button>
									<span className="tool-dot" style={{ background: color }} aria-hidden />
									<label className="toggle-switch">
										<input type="checkbox" checked={enabled.includes(id)} onChange={() => toggle(id)} aria-label={`${label} on`} />
										<span className="slider"></span>
									</label>
								</div>
							</SettingRow>
						))}
					</div>
				</div>
			))}
		</>
	);
}

/** Settings › Notch › Command Center: which tiles show (`bloom-cc-tiles`).
 *  Tiles keep one fixed order, so the grid never reshuffles. */
function CcTilePicker({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [tiles, setTiles] = useState(() => parseCcTiles(localStorage.getItem("bloom-cc-tiles")));
	const save = (next: CcTileId[]) => {
		setTiles(next);
		saveSetting("bloom-cc-tiles", JSON.stringify(next));
	};
	return (
		<>
			<div className="pick-tools-grid cc-tile-picker">
				{CC_TILES.map(([id, label, Icon]) => {
					const on = tiles.includes(id);
					return (
						<button
							key={id}
							type="button"
							role="checkbox"
							aria-checked={on}
							className={`pick-tool${on ? " on" : ""}`}
							onClick={() => save(on ? tiles.filter((t) => t !== id) : [...tiles, id])}
						>
							<span className="tool-card-icon" style={{ color: TOOLS["command-center"].color }}>
								<Icon size={16} />
							</span>
							<span className="pick-tool-label">{label}</span>
							<span className="pick-check">{on && <Check size={12} strokeWidth={3} />}</span>
						</button>
					);
				})}
			</div>
			<button type="button" className="cc-tiles-reset" onClick={() => save(CC_DEFAULT)}>
				Reset to default
			</button>
		</>
	);
}

/** How the notch opens: Click (default) or Hover after a delay
 *  (`bloom-notch-open-on`, `bloom-notch-hover-delay`). */
function OpenOnRows({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [openOn, setOpenOn] = useState(() => (localStorage.getItem("bloom-notch-open-on") === "hover" ? "hover" : "click"));
	const [shortcut, setShortcut] = useState(() => localStorage.getItem("bloom-notch-shortcut") ?? "Ctrl+Alt+N");
	const [delay, setDelay] = useState(() => {
		const v = parseInt(localStorage.getItem("bloom-notch-hover-delay") ?? "", 10);
		return Number.isFinite(v) ? v : 300;
	});
	return (
		<>
			<SettingRow
				icon={PanelTop}
				label="Open On"
				desc={openOn === "hover" ? "Resting the pointer on the notch opens it" : "Clicking the notch opens it"}
			>
				<Choice
					value={openOn}
					options={[["click", "Click"], ["hover", "Hover"]] as const}
					onChange={(v) => {
						setOpenOn(v);
						saveSetting("bloom-notch-open-on", v);
					}}
					label="Open the notch on"
				/>
			</SettingRow>
			<SettingRow
				icon={Keyboard}
				label="Notch Shortcut"
				desc="Opens and closes the notch. Click the box and press keys to change it; Backspace turns it off"
			>
				<input
					className="settings-select clip-shortcut"
					readOnly
					value={shortcut || "Off"}
					aria-label="Notch shortcut"
					onKeyDown={(e) => {
						e.preventDefault();
						const next = e.key === "Backspace" || e.key === "Delete" ? "" : shortcutFrom(e);
						if (next === null) return;
						setShortcut(next);
						saveSetting("bloom-notch-shortcut", next);
					}}
				/>
			</SettingRow>
			{openOn === "hover" && (
				<SettingRow icon={Timer} label="Hover Delay" desc={`How long to rest on the notch before it opens: ${delay}ms`}>
					<input
						type="range"
						min="0"
						max="1000"
						step="50"
						value={delay}
						onChange={(e) => {
							const v = parseInt(e.target.value, 10);
							setDelay(v);
							saveSetting("bloom-notch-hover-delay", String(v));
						}}
						className="settings-slider"
						aria-label="Hover delay"
					/>
				</SettingRow>
			)}
		</>
	);
}

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
					label="Notch"
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

						<OpenOnRows saveSetting={saveSetting} />

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

					<div className="setting-group-label">Tools</div>
					<div className="setting-group">
						<SettingRow
							icon={ListOrdered}
							label="Tools"
							desc="Drag to set the tab bar's order; each switch turns a tool fully off (0 MB)"
							divider={false}
						/>
						<div className="page-order-wrap">
							<ToolCards
								isOn={(panel) =>
									panel === "clipboard"
										? // The Shelf is a notch page while the clipboard sits in the notch.
											localStorage.getItem("bloom-clipboard-enabled") !== "false" &&
											(localStorage.getItem("bloom-clipboard-position") ?? "notch") === "notch"
										: panelOn[panel]
								}
								toggles={{
									calendar: { onToggle: toggleCalendar, locked: isLastPanel(calendarEnabled), title: lastPanelTitle(calendarEnabled) },
									"command-center": {
										onToggle: toggleControlsPanel,
										locked: isLastPanel(controlsPanelEnabled),
										title: lastPanelTitle(controlsPanelEnabled)
									},
									devices: { onToggle: toggleDevicesPanel, locked: isLastPanel(devicesPanelEnabled), title: lastPanelTitle(devicesPanelEnabled) }
								}}
								saveSetting={saveSetting}
							/>
						</div>

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
						<div className="setting-divider" />

						<SettingRow
							icon={PanelTop}
							label="Smart Start"
							desc="Reopen the last panel if you come back within 5 minutes; otherwise open your favourite"
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

						<SettingRow
							icon={PanelTop}
							label="Favourite Panel"
							desc={notchRememberPanel ? "Opens when Smart Start doesn't reopen the last panel" : "Always opens when you click the notch"}
						>
							<Choice
								value={panelOn[notchDefaultPanel] ? notchDefaultPanel : firstPanelOn}
								options={PANEL_CHOICES.filter(([panel]) => panelOn[panel])}
								onChange={changeNotchDefaultPanel}
								label="Default panel"
							/>
						</SettingRow>
					</div>

					{controlsPanelEnabled && (
						<>
							<div className="setting-group-label">Command Center</div>
							<div className="setting-group">
								<SettingRow
									icon={LayoutGrid}
									label="Tiles"
									desc="Pick the quick settings you use. Tiles without a Windows switch open Windows' own page for it"
									divider={false}
								/>
								<div className="page-order-wrap">
									<CcTilePicker saveSetting={saveSetting} />
								</div>
							</div>
						</>
					)}

					<MoreTools saveSetting={saveSetting} />

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
							desc="Keep shelf items after LotusNotch closes"
							divider={false}
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={shelfPersist} onChange={toggleShelfPersist} />
								<span className="slider"></span>
							</label>
						</SettingRow>
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
