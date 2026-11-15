import type { MouseEvent, WheelEvent } from "react";
import { motion } from "framer-motion";
import {
	Accessibility,
	Activity,
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
export const CC_BY_ID = Object.fromEntries(CC_TILES.map((t) => [t[0], t])) as Record<CcTileId, (typeof CC_TILES)[number]>;

const WIDE: CcTileId[] = ["wifi", "bluetooth"];
const COLUMNS = 7;
/** Round tiles the Command Center holds: two rows of seven. */
export const CC_MAX_ICONS = 2 * COLUMNS;
export const ccIsWide = (id: CcTileId) => WIDE.includes(id);

/** Usage-ranked (user approved, 2026-11-15): row one the seven most used,
 *  row two the next four, three spaces left for the user's own picks. */
export const CC_DEFAULT: CcTileId[] = [
	"wifi",
	"bluetooth",
	"dnd",
	"night-light",
	"energy",
	"airplane",
	"hotspot",
	"cast",
	"project",
	"captions",
	"nearby",
	"notch-mode",
	"task-manager"
];

/** The shown tiles (`bloom-cc-tiles`, a JSON list) in the user's order
 *  (Settings › Notch › Command Center): Wi-Fi and Bluetooth always first,
 *  then at most 14 round tiles; unknown or repeated ids dropped; missing or
 *  broken → the defaults. */
export function parseCcTiles(raw: unknown): CcTileId[] {
	let list: unknown;
	try {
		list = JSON.parse(String(raw));
	} catch {
		return CC_DEFAULT;
	}
	if (!Array.isArray(list)) return CC_DEFAULT;
	const known = new Set<string>(CC_TILES.map(([id]) => id));
	const icons = list.filter(
		(id, i): id is CcTileId => known.has(id) && !ccIsWide(id as CcTileId) && list.indexOf(id) === i
	);
	return [...WIDE, ...icons.slice(0, CC_MAX_ICONS)];
}

/** Motion (Fable's spec): a firm press, one pop when a tile turns on. */
const PRESS = { type: "spring", stiffness: 600, damping: 35 } as const;
const POP = { scale: [1, 1.18, 1], transition: { duration: 0.26, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } };

/** The icon inside a tile: pops once as it turns on (keyed by state, so
 *  it never repeats while the tile stays on). */
function TileIcon({ on, children }: { on?: boolean; children: React.ReactNode }) {
	return (
		<motion.span key={on ? "on" : "off"} className="cc-icon-glyph" initial={false} animate={on ? POP : undefined}>
			{children}
		</motion.span>
	);
}

/** The Command Center body's height: padding, the pills, the tile rows
 *  (48 px, 10 px apart) and the two sliders. */
export function ccBodyHeight(tiles: CcTileId[]) {
	const rows = Math.ceil(tiles.filter((t) => !ccIsWide(t)).length / COLUMNS);
	const icons = rows ? rows * 58 - 10 + 12 : 0;
	return 4 + 52 + 12 + icons + 64 + 16;
}

export interface CcTileState {
	on?: boolean;
	/** Short state text: the SSID on a wide tile, the % on Battery. */
	status?: string;
	/** What a click does, for the hover name ("opens Settings"). */
	hint?: string;
	/** A word under the icon, for tiles whose state isn't on/off (a mode). */
	caption?: string;
	/** Hidden while its feature is off (Dock mode without the dock). */
	hidden?: boolean;
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
				aria-label={label === "Volume" ? "Mute or unmute" : "Dim to 0 or back"}
				onClick={(e) => {
					e.stopPropagation();
					onIcon();
				}}
			>
				<Icon size={16} />
				<span>{label}</span>
			</button>
			<div className="cc-slider-track">
				<div className="cc-slider-fill" style={{ transform: `scaleX(${value / 100})` }} />
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
	const shown = tiles.map((id) => CC_BY_ID[id]);
	const wide = shown.filter(([id]) => WIDE.includes(id));
	const icons = shown.filter(([id]) => !WIDE.includes(id) && !state[id].hidden);
	return (
		<div className="cc" onClick={(e) => e.stopPropagation()}>
			{wide.length > 0 && (
				<div className="cc-wide-row">
					{wide.map(([id, label, Icon]) => {
						const { on, status, onClick, onMore } = state[id];
						const ShownIcon = id === "wifi" && !on ? WifiOff : Icon;
						return (
							<div key={id} className={`cc-wide${on ? " on" : ""}`}>
								<motion.button
									type="button"
									className="cc-wide-toggle"
									aria-pressed={on}
									aria-label={`${label} ${on ? "on" : "off"}`}
									data-tip={label}
									data-tip-state={on ? "On" : "Off"}
									whileTap={{ scale: 0.9 }}
									transition={PRESS}
									onClick={(e) => {
										e.stopPropagation();
										onClick(e);
									}}
								>
									<TileIcon on={on}>
										<ShownIcon size={20} />
									</TileIcon>
								</motion.button>
								<button
									type="button"
									className="cc-wide-more"
									data-tip={id === "wifi" ? "Wi-Fi networks" : "Bluetooth devices"}
									aria-label={`${label}: ${status ?? ""}, show the list`}
									onClick={(e) => {
										e.stopPropagation();
										onMore?.();
									}}
								>
									<motion.span key={status} className="cc-wide-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }}>
										{status}
									</motion.span>
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
						const { on, status, hint, caption, onClick } = state[id];
						return (
							<motion.button
								key={id}
								type="button"
								className={`cc-icon${on ? " on" : ""}${caption ? " captioned" : ""}`}
								aria-pressed={on}
								aria-label={label}
								data-tip={label}
								data-tip-state={on ? "On" : (status ?? hint)}
								whileTap={{ scale: 0.9 }}
								transition={PRESS}
								onClick={(e) => {
									e.stopPropagation();
									onClick(e);
								}}
							>
								<TileIcon on={on}>
									<Icon size={caption ? 16 : 20} />
								</TileIcon>
								{caption && <span className="cc-icon-caption">{caption}</span>}
							</motion.button>
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
