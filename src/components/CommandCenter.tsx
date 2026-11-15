import type { MouseEvent, WheelEvent } from "react";
import {
	Accessibility,
	Activity,
	ArrowUpRight,
	BatteryMedium,
	Bell,
	BellOff,
	Bluetooth,
	Camera,
	Captions,
	Cast,
	ChevronRight,
	ChevronUp,
	Flower2,
	Leaf,
	MonitorUp,
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

/** Every tile the Command Center can show, in the order it shows them
 *  (Settings › Notch › Command Center turns each on or off, `bloom-cc-tiles`):
 *  Wi-Fi and Bluetooth as wide tiles, then real switches, then tiles that
 *  show a state, then tiles that open a Windows page or flyout (Windows has
 *  no public switch for those). */
export const CC_TILES = [
	["wifi", "Wi-Fi", Wifi],
	["bluetooth", "Bluetooth", Bluetooth],
	["dock-mode", "Dock mode", PanelBottom],
	["notch-mode", "Notch mode", PanelTop],
	["energy", "Energy saver", Leaf],
	["battery", "Battery", BatteryMedium],
	["dnd", "Do not disturb", BellOff],
	["night-light", "Night light", SunDim],
	["airplane", "Airplane mode", Plane],
	["hotspot", "Mobile hotspot", RadioTower],
	["captions", "Live captions", Captions],
	["studio", "Studio effects", Camera],
	["accessibility", "Accessibility", Accessibility],
	["nearby", "Nearby sharing", Share2],
	["cast", "Cast", Cast],
	["project", "Project", MonitorUp],
	["tray", "System tray", ChevronUp],
	["task-manager", "Task Manager", Activity],
	["notifications", "Notifications", Bell],
	["windows-settings", "Windows Settings", Settings],
	["lotus-settings", "LotusNotch settings", Flower2],
	["restart", "Restart LotusNotch", RotateCw]
] as const satisfies readonly (readonly [string, string, LucideIcon])[];

export type CcTileId = (typeof CC_TILES)[number][0];

const WIDE: CcTileId[] = ["wifi", "bluetooth"];

/** Two rows of icons under Wi-Fi and Bluetooth. */
export const CC_DEFAULT: CcTileId[] = [
	"wifi",
	"bluetooth",
	"energy",
	"battery",
	"dnd",
	"night-light",
	"airplane",
	"hotspot",
	"captions",
	"cast",
	"project",
	"task-manager"
];

/** The shown tiles (`bloom-cc-tiles`, a JSON list), in catalogue order;
 *  missing or broken → the defaults. */
export function parseCcTiles(raw: unknown): CcTileId[] {
	let list: unknown;
	try {
		list = JSON.parse(String(raw));
	} catch {
		return CC_DEFAULT;
	}
	if (!Array.isArray(list)) return CC_DEFAULT;
	return CC_TILES.map(([id]) => id).filter((id) => list.includes(id));
}

const COLUMNS = 5;
const ICON_H = 44;
const GAP = 8;
/** Three rows show; a fourth peeks 14px to say the tiles scroll. */
const ICONS_MAX_H = 3 * ICON_H + 2 * GAP + 14;

/** The Command Center body's height: padding, the wide row, the icon rows
 *  (scrolling past three) and the sliders. */
export function ccBodyHeight(tiles: CcTileId[]) {
	const wide = tiles.some((t) => WIDE.includes(t)) ? 52 + GAP : 0;
	const rows = Math.ceil(tiles.filter((t) => !WIDE.includes(t)).length / COLUMNS);
	const icons = rows ? Math.min(rows * (ICON_H + GAP) - GAP, ICONS_MAX_H) + GAP : 0;
	return 12 + wide + icons + 36 + 12;
}

export interface CcTileState {
	on?: boolean;
	/** Short state text: the SSID on a wide tile, the % on Battery. */
	status?: string;
	/** Opens a Windows page or flyout rather than switching something. */
	opens?: boolean;
	onClick: (e: MouseEvent) => void;
	/** Wide tiles: the right half opens the list (networks, devices). */
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
		<div className="cc-slider" onWheel={wheel} title={`${label}: scroll to change`}>
			<button
				type="button"
				className="cc-slider-icon"
				aria-label={label === "Volume" ? "Mute" : "Brightness off or back"}
				onClick={(e) => {
					e.stopPropagation();
					onIcon();
				}}
			>
				<Icon size={16} />
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
									title={`${label}: click to turn ${on ? "off" : "on"}`}
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
									onClick={(e) => {
										e.stopPropagation();
										onMore?.();
									}}
								>
									<span className="cc-wide-text">
										<span className="cc-wide-label">{label}</span>
										<span className="cc-wide-status">{status}</span>
									</span>
									<ChevronRight size={14} />
								</button>
							</div>
						);
					})}
				</div>
			)}
			{icons.length > 0 && (
				<div className="cc-icons" style={{ maxHeight: ICONS_MAX_H }} onWheel={(e) => e.stopPropagation()}>
					{icons.map(([id, label, Icon]) => {
						const { on, status, opens, onClick } = state[id];
						return (
							<button
								key={id}
								type="button"
								className={`cc-icon${on && !opens ? " on" : ""}${id === "energy" && on ? " saver" : ""}`}
								aria-pressed={opens ? undefined : on}
								aria-label={label}
								title={`${label}${status ? ` · ${status}` : ""}${opens ? " · opens Windows" : ""}`}
								onClick={(e) => {
									e.stopPropagation();
									onClick(e);
								}}
							>
								<Icon size={20} />
								{id === "battery" && status && <span className="cc-icon-text">{status}</span>}
								{opens && <ArrowUpRight size={9} className="cc-icon-badge" aria-hidden />}
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
