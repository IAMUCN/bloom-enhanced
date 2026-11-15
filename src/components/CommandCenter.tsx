import type { MouseEvent, WheelEvent } from "react";
import {
	Accessibility,
	Activity,
	BatteryMedium,
	Bell,
	Bluetooth,
	Camera,
	Captions,
	Cast,
	ChevronRight,
	ChevronUp,
	Flower2,
	Leaf,
	MonitorUp,
	Moon,
	PanelBottom,
	PanelTop,
	Plane,
	RadioTower,
	RotateCw,
	Settings,
	Share2,
	Sun,
	SunDim,
	Volume2,
	VolumeX,
	Wifi,
	WifiOff,
	type LucideIcon
} from "lucide-react";
import "./CommandCenter.css";

// The reference is the design file's page "3a Command Center (edit me)",
// default frame, as the user edited it (2026-11-15): Wi-Fi and Bluetooth
// pills with no names, then up to two rows of seven round tiles (16 tiles
// in all, fixed), then volume over brightness. Nothing scrolls.

/** Every tile, in the order it shows (Settings › Notch › Command Center
 *  turns each on or off, `bloom-cc-tiles`). */
export const CC_TILES = [
	["wifi", "Wi-Fi", Wifi],
	["bluetooth", "Bluetooth", Bluetooth],
	["dnd", "Do not disturb", Moon],
	["captions", "Live captions", Captions],
	["nearby", "Nearby sharing", Share2],
	["night-light", "Night light", SunDim],
	["energy", "Energy saver", Leaf],
	["airplane", "Airplane mode", Plane],
	["hotspot", "Mobile hotspot", RadioTower],
	["cast", "Cast", Cast],
	["project", "Project", MonitorUp],
	["battery", "Battery", BatteryMedium],
	["dock-mode", "Dock mode", PanelBottom],
	["notch-mode", "Notch mode", PanelTop],
	["studio", "Studio effects", Camera],
	["accessibility", "Accessibility", Accessibility],
	["task-manager", "Task Manager", Activity],
	["tray", "System tray", ChevronUp],
	["notifications", "Notifications", Bell],
	["windows-settings", "Windows Settings", Settings],
	["lotus-settings", "LotusNotch settings", Flower2],
	["restart", "Restart LotusNotch", RotateCw]
] as const satisfies readonly (readonly [string, string, LucideIcon])[];

export type CcTileId = (typeof CC_TILES)[number][0];

const WIDE: CcTileId[] = ["wifi", "bluetooth"];
const COLUMNS = 7;
/** Round tiles the Command Center holds: two rows of seven. */
export const CC_MAX_ICONS = 2 * COLUMNS;
export const ccIsWide = (id: CcTileId) => WIDE.includes(id);

/** The user's design: row one full, row two Cast, Project, Battery. */
export const CC_DEFAULT: CcTileId[] = [
	"wifi",
	"bluetooth",
	"dnd",
	"captions",
	"nearby",
	"night-light",
	"energy",
	"airplane",
	"hotspot",
	"cast",
	"project",
	"battery"
];

/** The shown tiles (`bloom-cc-tiles`, a JSON list), in catalogue order:
 *  Wi-Fi and Bluetooth always, then at most 14 round tiles; missing or
 *  broken → the defaults. */
export function parseCcTiles(raw: unknown): CcTileId[] {
	let list: unknown;
	try {
		list = JSON.parse(String(raw));
	} catch {
		return CC_DEFAULT;
	}
	if (!Array.isArray(list)) return CC_DEFAULT;
	const icons = CC_TILES.map(([id]) => id).filter((id) => !ccIsWide(id) && list.includes(id));
	return [...WIDE, ...icons.slice(0, CC_MAX_ICONS)];
}

/** The Command Center body's height: padding, the pills, the tile rows
 *  (44 px, 10 px apart) and the two sliders. */
export function ccBodyHeight(tiles: CcTileId[]) {
	const rows = Math.ceil(tiles.filter((t) => !ccIsWide(t)).length / COLUMNS);
	const icons = rows ? rows * 54 - 10 + 12 : 0;
	return 4 + 52 + 12 + icons + 64 + 16;
}

export interface CcTileState {
	on?: boolean;
	/** Short state text: the SSID on a wide tile, the % on Battery. */
	status?: string;
	/** What a click does, for the hover name ("opens Settings"). */
	hint?: string;
	onClick: (e: MouseEvent) => void;
	/** Wide tiles: the text half opens the list (networks, devices). */
	onMore?: () => void;
}

function Slider({
	label,
	icon: Icon,
	value,
	step,
	onChange,
	onIcon
}: {
	label: string;
	icon: LucideIcon;
	/** 0–100. */
	value: number;
	/** Per mouse-wheel notch. */
	step: number;
	onChange: (value: number) => void;
	onIcon: () => void;
}) {
	const wheel = (e: WheelEvent) => {
		e.stopPropagation();
		if (e.deltaY === 0) return;
		onChange(Math.max(0, Math.min(100, value + (e.deltaY < 0 ? step : -step))));
	};
	return (
		<div className="cc-slider" onWheel={wheel}>
			<button
				type="button"
				className="cc-slider-label"
				title={label === "Volume" ? "Mute / unmute" : "Dim to 0 / back"}
				onClick={(e) => {
					e.stopPropagation();
					onIcon();
				}}
			>
				<Icon size={16} />
				<span>{label}</span>
			</button>
			<div className="cc-slider-track">
				<div className="cc-slider-fill" style={{ width: `${value}%` }} />
				<input
					type="range"
					min={0}
					max={100}
					step={1}
					value={value}
					aria-label={label}
					onChange={(e) => onChange(Number(e.target.value))}
					onPointerDown={(e) => e.stopPropagation()}
					onClick={(e) => e.stopPropagation()}
				/>
			</div>
			<span className="cc-slider-value">{value}%</span>
		</div>
	);
}

export function CommandCenter({
	tiles,
	state,
	volume,
	muted,
	onVolume,
	onMute,
	brightness,
	onBrightness,
	onBrightnessIcon
}: {
	tiles: CcTileId[];
	state: Record<CcTileId, CcTileState>;
	/** 0–100. */
	volume: number;
	muted: boolean;
	onVolume: (value: number) => void;
	onMute: () => void;
	brightness: number;
	onBrightness: (value: number) => void;
	onBrightnessIcon: () => void;
}) {
	const shown = CC_TILES.filter(([id]) => tiles.includes(id));
	const wide = shown.filter(([id]) => WIDE.includes(id));
	const icons = shown.filter(([id]) => !WIDE.includes(id));
	return (
		<div className="cc" onClick={(e) => e.stopPropagation()}>
			{wide.length > 0 && (
				<div className="cc-wide-row">
					{wide.map(([id, label, Icon]) => {
						const { on, status, onClick, onMore } = state[id];
						const ShownIcon = id === "wifi" && !on ? WifiOff : Icon;
						return (
							<div key={id} className={`cc-wide${on ? " on" : ""}`}>
								<button
									type="button"
									className="cc-wide-toggle"
									aria-pressed={on}
									aria-label={`${label} ${on ? "on" : "off"}`}
									title={`Turn ${label} ${on ? "off" : "on"}`}
									onClick={(e) => {
										e.stopPropagation();
										onClick(e);
									}}
								>
									<ShownIcon size={18} />
								</button>
								<button
									type="button"
									className="cc-wide-more"
									title={id === "wifi" ? "Wi-Fi networks" : "Bluetooth devices"}
									aria-label={`${label}: ${status ?? ""}, show the list`}
									onClick={(e) => {
										e.stopPropagation();
										onMore?.();
									}}
								>
									<span className="cc-wide-status">{status}</span>
									<ChevronRight size={16} />
								</button>
							</div>
						);
					})}
				</div>
			)}
			{icons.length > 0 && (
				<div className="cc-icons">
					{icons.map(([id, label, Icon]) => {
						const { on, status, hint, onClick } = state[id];
						return (
							<button
								key={id}
								type="button"
								className={`cc-icon${on ? " on" : ""}`}
								aria-pressed={on}
								aria-label={label}
								title={[label, status, hint].filter(Boolean).join(" · ")}
								onClick={(e) => {
									e.stopPropagation();
									onClick(e);
								}}
							>
								<Icon size={18} />
							</button>
						);
					})}
				</div>
			)}
			<div className="cc-sliders">
				<Slider
					label="Volume"
					icon={muted || volume === 0 ? VolumeX : Volume2}
					value={volume}
					step={2}
					onChange={onVolume}
					onIcon={onMute}
				/>
				<Slider
					label="Brightness"
					icon={Sun}
					value={brightness}
					step={5}
					onChange={onBrightness}
					onIcon={onBrightnessIcon}
				/>
			</div>
		</div>
	);
}
