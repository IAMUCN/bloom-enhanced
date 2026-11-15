import type { MouseEvent } from "react";
import {
	Accessibility,
	Activity,
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
	SunDim,
	Wifi,
	WifiOff,
	type LucideIcon
} from "lucide-react";
import "./CommandCenter.css";

/** Every tile the Command Center can show, in the order it shows them
 *  (Settings › Notch › Command Center turns each on or off, `bloom-cc-tiles`).
 *  Windows has no public switch for most quick settings, so those tiles open
 *  Windows' own page or flyout for it. */
export const CC_TILES = [
	["wifi", "Wi-Fi", Wifi],
	["bluetooth", "Bluetooth", Bluetooth],
	["dnd", "Do not disturb", BellOff],
	["night-light", "Night light", SunDim],
	["energy", "Energy saver", Leaf],
	["airplane", "Airplane mode", Plane],
	["hotspot", "Mobile hotspot", RadioTower],
	["captions", "Live captions", Captions],
	["studio", "Studio effects", Camera],
	["accessibility", "Accessibility", Accessibility],
	["nearby", "Nearby sharing", Share2],
	["cast", "Cast", Cast],
	["project", "Project", MonitorUp],
	["battery", "Battery", BatteryMedium],
	["dock-mode", "Dock mode", PanelBottom],
	["notch-mode", "Notch mode", PanelTop],
	["tray", "System tray", ChevronUp],
	["task-manager", "Task Manager", Activity],
	["notifications", "Notifications", Bell],
	["windows-settings", "Windows Settings", Settings],
	["lotus-settings", "LotusNotch settings", Flower2],
	["restart", "Restart LotusNotch", RotateCw]
] as const satisfies readonly (readonly [string, string, LucideIcon])[];

export type CcTileId = (typeof CC_TILES)[number][0];

/** What most people reach for (design › Tools 0.2 › Command Center). */
export const CC_DEFAULT: CcTileId[] = ["wifi", "bluetooth", "dnd", "night-light", "energy", "airplane"];

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

/** Notch height the tiles take: rows of 44px with 8px gaps. */
export const ccTilesHeight = (count: number) => {
	const rows = Math.ceil(count / 3);
	return rows ? rows * 52 - 8 : 0;
};

export interface CcTileState {
	on?: boolean;
	status?: string;
	onClick: (e: MouseEvent) => void;
	/** The › button: opens the tile's own list (Wi-Fi, Bluetooth). */
	onMore?: () => void;
}

export function CommandCenterTiles({
	tiles,
	state
}: {
	tiles: CcTileId[];
	state: Record<CcTileId, CcTileState>;
}) {
	return (
		<div className="cc-tiles">
			{CC_TILES.filter(([id]) => tiles.includes(id)).map(([id, label, Icon]) => {
				const { on, status, onClick, onMore } = state[id];
				const ShownIcon = id === "wifi" && on === false ? WifiOff : Icon;
				return (
					<div key={id} className={`cc-tile${on ? " on" : ""}`}>
						<button
							type="button"
							className="cc-tile-main"
							aria-pressed={on}
							title={status ? `${label}: ${status}` : label}
							onClick={(e) => {
								e.stopPropagation();
								onClick(e);
							}}
							onContextMenu={(e) => {
								if (!onMore) return;
								e.preventDefault();
								e.stopPropagation();
								onMore();
							}}
						>
							<span className="cc-tile-icon">
								<ShownIcon size={15} strokeWidth={2} />
							</span>
							<span className="cc-tile-text">
								<span className="cc-tile-label">{label}</span>
								{status && <span className="cc-tile-status">{status}</span>}
							</span>
						</button>
						{onMore && (
							<button
								type="button"
								className="cc-tile-more"
								aria-label={`${label} list`}
								title={`${label} list`}
								onClick={(e) => {
									e.stopPropagation();
									onMore();
								}}
							>
								<ChevronRight size={13} />
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}
