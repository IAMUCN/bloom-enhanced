import { Palette, Droplet, Contrast, Droplets, Sun, Maximize2 } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { ScaleStepper } from "./ScaleStepper";
import { Choice } from "./Choice";

const THEME_MODES = [
	["dark", "Dark", "Translucent dark surfaces"],
	["light", "Light", "Translucent light surfaces"],
	["custom", "Custom", "A colour you pick"],
	["adaptive", "Adaptive", "Follows your Windows accent colour"]
] as const;

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
			<div className="setting-group-label">Theme</div>
			<div className="setting-group">
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
			</div>

			<div className="setting-group-label">Display</div>
			<div className="setting-group">
				<SettingRow
					icon={Maximize2}
					label="UI & Font Scale"
					desc="Settings and overlays; also the dock and notch until they get their own size"
					divider={false}
				>
					<ScaleStepper value={scale} onChange={handleScaleChange} label="Scale" />
				</SettingRow>
			</div>
		</>
	);
}
