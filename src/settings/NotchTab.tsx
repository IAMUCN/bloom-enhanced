import {
	PanelTop,
	CloudSun,
	Timer,
	Maximize2,
	X,
	Clock,
	PanelLeft,
	PanelRight,
	Star,
	History
} from "lucide-react";
import { useState } from "react";
import { SettingRow } from "./SettingRow";
import { Section } from "./Section";

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
import { ShortcutRow } from "./ShortcutRow";
import { Choice } from "./Choice";
import { NOTCH_STYLES, type NotchStyle } from "../notchLayout";
import { EXTRA_TOOLS, TOOLS } from "../tools";
import { StatusWidgetConfig } from "../components/StatusWidgetConfig";
import type { WidgetConfig } from "./types";

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

/** Which tool the notch opens on (Fable's rules, 2026-11-15): Quick return
 *  first (the tool you left, within N minutes), then the Favourite, or with
 *  Favourite off the last tool you used. The favourite itself is picked with
 *  the star in Settings › Tools. */
const QUICK_RETURN = [
	["0", "Off"],
	["2", "2 min"],
	["5", "5 min"],
	["15", "15 min"],
	["30", "30 min"]
] as const;

function OpeningRows({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [favOn, setFavOn] = useState(() => localStorage.getItem("bloom-notch-favourite-on") !== "false");
	const favId = localStorage.getItem("bloom-notch-favourite") ?? localStorage.getItem("bloom-notch-default-panel") ?? "command-center";
	const favName =
		favId in TOOLS ? TOOLS[favId as keyof typeof TOOLS].label : EXTRA_TOOLS.find((t) => t.id === favId)?.label ?? "Command Center";
	const [quick, setQuick] = useState(() => {
		const v = localStorage.getItem("bloom-notch-quick-return");
		return v ?? (localStorage.getItem("bloom-notch-remember-panel") === "false" ? "0" : "5");
	});
	return (
		<>
			<SettingRow
				icon={Star}
				label="Favourite"
				desc={
					favOn
						? `Opens on ${favName}. Pick another with the star in Tools`
						: "Off: the notch opens on the tool you used last"
				}
			>
				<label className="toggle-switch">
					<input
						type="checkbox"
						checked={favOn}
						onChange={() => {
							setFavOn(!favOn);
							saveSetting("bloom-notch-favourite-on", String(!favOn));
						}}
					/>
					<span className="slider"></span>
				</label>
			</SettingRow>
			<SettingRow
				icon={History}
				label="Quick Return"
				desc={
					quick === "0"
						? "Off: every open starts on your favourite"
						: `Come back within ${quick} minutes and the notch reopens where you left off`
				}
				divider={false}
			>
				<Choice
					value={quick}
					options={QUICK_RETURN}
					onChange={(v) => {
						setQuick(v);
						saveSetting("bloom-notch-quick-return", v);
					}}
					label="Quick return"
				/>
			</SettingRow>
		</>
	);
}

/** How the notch opens: Click (default) or Hover after a delay
 *  (`bloom-notch-open-on`, `bloom-notch-hover-delay`). */
function OpenOnRows({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [openOn, setOpenOn] = useState(() => (localStorage.getItem("bloom-notch-open-on") === "hover" ? "hover" : "click"));
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
	notchMode: string;
	setNotchModeValue: (mode: string) => void;
	notchEdgeDelay: number;
	handleNotchEdgeDelayChange: (val: number) => void;
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
	section: "look" | "open";
	notchStyle: NotchStyle;
	handleNotchStyleChange: (style: NotchStyle) => void;
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
}

export function NotchTab({
	notchEnabled,
	notchMode,
	setNotchModeValue,
	notchEdgeDelay,
	handleNotchEdgeDelayChange,
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
	section,
	saveSetting
}: NotchTabProps) {
	return (
		<>
			{notchEnabled && (
				<>
					{section === "look" && (
					<>
					<Section title="Shape">
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

						<OpenSizeRow saveSetting={saveSetting} />


					</Section>

					<Section title="Weather">
						<SettingRow
							icon={CloudSun}
							label="Weather Status"
							desc={weatherEnabled ? `Shows the temperature beside the clock for ${cityName || "your detected location"}. Switch off to hide it` : "Off: no temperature beside the clock"}
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
					</Section>

					<Section title="Clock Bar">
						<div className="settings-disclosure-standalone widgets-open">
							<div className="widgets-heading">
								Choose status widgets <span>Arrange what appears beside the clock</span>
							</div>
							<StatusWidgetConfig value={statusWidgets} onChange={handleWidgetsChange} />
						</div>
						<RowSizes saveSetting={saveSetting} />
					</Section>
					</>
					)}
					{section === "open" && (
					<>
					<Section title="Opening">
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

						<OpenOnRows saveSetting={saveSetting} />

						<OpeningRows saveSetting={saveSetting} />
					</Section>

					<Section title="Shortcuts">
						<ShortcutRow action="notch" label="Open or close the notch" desc="Works anywhere; press Backspace while setting to clear it" />
						<details className="settings-disclosure">
							<summary>
								More <span>Jump to tab 1–9 by position (Shift counts from the end)</span>
							</summary>
							{Array.from({ length: 9 }, (_, i) => (
								<ShortcutRow key={i} action={`tool-${i + 1}`} label={`Tab ${i + 1}`} />
							))}
						</details>
					</Section>

					</>
					)}
				</>
			)}
		</>
	);
}

/** The open notch's own extra size (`bloom-notch-open-scale`, 80–125 %),
 *  on top of Notch Size; also set in the first-run setup. */
function OpenSizeRow({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [value, setValue] = useState(() => {
		const v = parseFloat(localStorage.getItem("bloom-notch-open-scale") ?? "1");
		return Number.isFinite(v) ? Math.min(1.25, Math.max(0.8, v)) : 1;
	});
	return (
		<SettingRow icon={Maximize2} label="Open Size" desc="How big the notch is when it's open, on top of Notch Size">
			<ScaleStepper
				value={value}
				min={0.8}
				max={1.25}
				stepSize={0.05}
				onChange={(v) => {
					setValue(v);
					saveSetting("bloom-notch-open-scale", v.toFixed(2));
				}}
				label="open notch size"
			/>
		</SettingRow>
	);
}
