import { Monitor, Palette, Droplet, Contrast, Droplets, Sun, Maximize2, Sparkles } from "lucide-react";
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SettingRow } from "./SettingRow";
import { ScaleStepper } from "./ScaleStepper";
import { Choice } from "./Choice";
import { Section } from "./Section";
import { ColourPicker } from "./ColourPicker";

const THEME_MODES = [
	["dark", "Black", "Black surfaces; solid at 100% opacity"],
	["graphite", "Graphite", "Dark grey surfaces"],
	["light", "Light", "Translucent light surfaces"],
	["custom", "Custom", "A colour you pick"],
	["adaptive", "Adaptive", "Follows your Windows accent colour"]
] as const;

/** Animations (`bloom-motion`): on by default, whatever Windows' own
 *  "Animation effects" says (user, 2026-11-15). */
const MOTION = [
	["on", "On", "Springy, lively motion in the notch, dock and menus"],
	["off", "Off", "No movement; changes just appear"]
] as const;

/** The Settings window's own look (`bloom-settings-theme`): Light or Dark only.
 *  Unset = what Windows uses. */
const ACCENTS = ["#6a55ff", "#0a84ff", "#14b8a6", "#22c55e", "#f59e0b", "#ec4899", "#ef4444"];
const DEFAULT_ACCENT = ACCENTS[0];

/** An accent colour: `bloom-accent` (progress light, active states, the
 *  Settings window) or `bloom-cc-accent` (the Command Center only; empty =
 *  same as the accent). */
function AccentRow({ storeKey, label, desc, divider }: { storeKey: string; label: string; desc: string; divider?: boolean }) {
	const isCc = storeKey === "bloom-cc-accent";
	const [value, setValue] = useState(() => localStorage.getItem(storeKey) ?? (isCc ? "" : DEFAULT_ACCENT));
	const pick = (v: string) => {
		setValue(v);
		localStorage.setItem(storeKey, v);
		invoke("save_setting", { key: storeKey, value: v }).catch(() => {});
		window.dispatchEvent(new Event("settings-theme-changed"));
	};
	return (
		<SettingRow icon={Palette} label={label} desc={desc} divider={divider}>
			<ColourPicker
				value={value}
				presets={ACCENTS}
				onPick={pick}
				label={label}
				follow={isCc ? { colour: localStorage.getItem("bloom-accent") || DEFAULT_ACCENT, title: "Same as the accent colour" } : undefined}
			/>
		</SettingRow>
	);
}

function SettingsWindowRow() {
	const [value, setValue] = useState(
		() => localStorage.getItem("bloom-settings-theme") ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
	);
	return (
		<SettingRow icon={Monitor} label="Settings Window" desc="Light or dark, for this window only; the notch, dock and shelf keep their theme below">
			<Choice
				value={value}
				options={[["light", "Light"], ["dark", "Dark"]] as const}
				onChange={(v) => {
					setValue(v);
					localStorage.setItem("bloom-settings-theme", v);
					invoke("save_setting", { key: "bloom-settings-theme", value: v }).catch(() => {});
					window.dispatchEvent(new Event("settings-theme-changed"));
				}}
				label="Settings window theme"
			/>
		</SettingRow>
	);
}

function AnimationsRow() {
	const [value, setValue] = useState(() => (localStorage.getItem("bloom-motion") === "off" ? "off" : "on"));
	return (
		<SettingRow icon={Sparkles} label="Animations" desc={MOTION.find(([v]) => v === value)?.[2] ?? MOTION[0][2]}>
			<Choice
				value={value}
				options={MOTION.map(([v, name]) => [v, name] as const)}
				onChange={(v) => {
					setValue(v);
					localStorage.setItem("bloom-motion", v);
					invoke("save_setting", { key: "bloom-motion", value: v }).catch(() => {});
				}}
				label="Animations"
			/>
		</SettingRow>
	);
}

interface AppearanceTabProps {
	themeMode: string;
	handleThemeModeChange: (mode: string) => void;
	themeColor: string;
	handleThemeColorChange: (color: string) => void;
	themeOpacity: number;
	handleOpacityChange: (val: number) => void;
	themeSaturation: number;
	handleSaturationChange: (val: number) => void;
	themeBrightness: number;
	handleBrightnessChange: (val: number) => void;
	scale: number;
	handleScaleChange: (val: number) => void;
}

export function AppearanceTab({
	themeMode,
	handleThemeModeChange,
	themeColor,
	handleThemeColorChange,
	themeOpacity,
	handleOpacityChange,
	themeSaturation,
	handleSaturationChange,
	themeBrightness,
	handleBrightnessChange,
	scale,
	handleScaleChange
}: AppearanceTabProps) {
	const showCustomColor = themeMode === "custom";
	const showAdvancedSliders = themeMode === "custom" || themeMode === "adaptive";

	return (
		<>
			<Section title="Accent">
				<AccentRow storeKey="bloom-accent" label="Accent Colour" desc="Shows on the notch's progress light, active buttons and this window" />
				<AccentRow storeKey="bloom-cc-accent" label="Command Center Accent Colour" desc="Its own colour for the Command Center's active tiles and switches; the first swatch follows the accent" divider={false} />
			</Section>

			<Section title="Settings Window">
				<SettingsWindowRow />
			</Section>

			<Section title="Notch, Dock &amp; Shelf Theme">
				<SettingRow
					icon={Palette}
					label="Theme Mode"
					desc={THEME_MODES.find(([m]) => m === themeMode)?.[2] ?? THEME_MODES[0][2]}
				>
					<Choice
						value={themeMode}
						options={THEME_MODES.map(([v, name]) => [v, name] as const)}
						onChange={handleThemeModeChange}
						label="Theme mode"
					/>
				</SettingRow>

				{showCustomColor && (
					<SettingRow
						icon={Droplet}
						label="Custom Theme Color"
						desc="Choose layout background color"
					>
						<div className="color-picker-row">
							<input
								type="color"
								value={themeColor}
								onChange={(e) => handleThemeColorChange(e.target.value)}
								className="color-picker-input"
							/>
							<span className="color-picker-label">{themeColor.toUpperCase()}</span>
						</div>
					</SettingRow>
				)}

				<SettingRow
					icon={Contrast}
					label="Background Opacity"
					desc={`Adjust theme transparency (${Math.round(themeOpacity * 100)}%)`}
					divider={showAdvancedSliders}
				>
					<input
						type="range"
						min="0.1"
						max="1.0"
						step="0.05"
						value={themeOpacity}
						onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
						className="settings-slider"
					/>
				</SettingRow>

				{showAdvancedSliders && (
					<>
						<SettingRow
							icon={Droplets}
							label="Color Saturation"
							desc={`Adjust theme color vibrancy (${Math.round(themeSaturation * 100)}%)`}
						>
							<input
								type="range"
								min="0.0"
								max="1.0"
								step="0.02"
								value={themeSaturation}
								onChange={(e) => handleSaturationChange(parseFloat(e.target.value))}
								className="settings-slider"
							/>
						</SettingRow>

						<SettingRow
							icon={Sun}
							label="Background Brightness"
							desc={`Adjust background lightness (${Math.round(themeBrightness * 100)}%)`}
							divider={false}
						>
							<input
								type="range"
								min="0.0"
								max="1.0"
								step="0.02"
								value={themeBrightness}
								onChange={(e) => handleBrightnessChange(parseFloat(e.target.value))}
								className="settings-slider"
							/>
						</SettingRow>
					</>
				)}
			</Section>

			<Section title="Display">
				<AnimationsRow />
				<SettingRow
					icon={Maximize2}
					label="UI & Font Scale"
					desc="Settings and overlays; also the dock and notch until they get their own size"
					divider={false}
				>
					<ScaleStepper value={scale} onChange={handleScaleChange} label="Scale" />
				</SettingRow>
			</Section>
		</>
	);
}
